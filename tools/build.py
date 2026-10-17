#!/usr/bin/env python3
"""Build Daybook from src/ into the files GitHub Pages serves.

    python tools/build.py           # validate, then write index.html, sw.js, manifest, preview
    python tools/build.py --check   # validate and fail if the committed site is out of date

Validation runs before anything is written, so a broken translation never reaches the site.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
I18N_DIR = SRC / "i18n"
PREVIEW = ROOT / "build" / "claude-preview.html"

LANGS = ("en", "ar")
BASE_LANG = "en"
# CLDR plural categories each language needs (Arabic uses all six).
PLURAL_FORMS = {"en": {"one", "other"}, "ar": {"zero", "one", "two", "few", "many", "other"}}
ALL_PLURAL_CATEGORIES = {"zero", "one", "two", "few", "many", "other"}
# Keys read by this script rather than by the page.
BUILD_KEYS = {"app.name", "app.description"}
MAX_PAGE_BYTES = 200_000

PLACEHOLDER = re.compile(r"\{(\w+)\}")
HTML_KEY = re.compile(r'data-i18n(?:-ph|-aria|-title)?="([\w.]+)"')
JS_TEXT_KEY = re.compile(r'\b(?:t|key)\(\s*"([\w.]+)"')
JS_PLURAL_KEY = re.compile(r'\b(?:tp|tpHTML)\(\s*"([\w.]+)"')


class BuildError(Exception):
    """Raised with a list of human-readable problems."""

    def __init__(self, problems: list[str]):
        super().__init__("\n".join(problems))
        self.problems = problems


# ---------------------------------------------------------------------------
# Translations
# ---------------------------------------------------------------------------
def is_plural(value: object) -> bool:
    return isinstance(value, dict) and "other" in value and set(value) <= ALL_PLURAL_CATEGORIES


def flatten(tree: dict, prefix: str = "") -> dict[str, object]:
    """{"a": {"b": "x"}} -> {"a.b": "x"}; plural groups stay as one entry."""
    out: dict[str, object] = {}
    for k, v in tree.items():
        path = f"{prefix}{k}"
        if isinstance(v, dict) and not is_plural(v):
            out.update(flatten(v, path + "."))
        else:
            out[path] = v
    return out


def load_dicts() -> dict[str, dict]:
    dicts = {}
    for lang in LANGS:
        path = I18N_DIR / f"{lang}.json"
        try:
            dicts[lang] = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise BuildError([f"{path.relative_to(ROOT)}: invalid JSON ({e})"]) from e
    return dicts


def placeholders(value: object) -> set[str]:
    texts = value.values() if isinstance(value, dict) else [value]
    return {m for s in texts for m in PLACEHOLDER.findall(s)}


@dataclass
class Usage:
    text: set[str] = field(default_factory=set)
    plural: set[str] = field(default_factory=set)


def find_usage(page: str, script: str) -> Usage:
    return Usage(
        text=set(HTML_KEY.findall(page)) | set(JS_TEXT_KEY.findall(script)) | BUILD_KEYS,
        plural=set(JS_PLURAL_KEY.findall(script)),
    )


def validate_i18n(dicts: dict[str, dict], usage: Usage) -> list[str]:
    problems: list[str] = []
    flat = {lang: flatten(d) for lang, d in dicts.items()}
    base = flat[BASE_LANG]

    for lang, entries in flat.items():
        missing = sorted(set(base) - set(entries))
        extra = sorted(set(entries) - set(base))
        problems += [f"{lang}: missing key {k}" for k in missing]
        problems += [f"{lang}: key {k} does not exist in {BASE_LANG}" for k in extra]

        for k, v in entries.items():
            if k not in base:
                continue
            if isinstance(v, str):
                if not v.strip():
                    problems.append(f"{lang}: {k} is empty")
            elif is_plural(v):
                need = PLURAL_FORMS[lang]
                if not need <= set(v):
                    problems.append(f"{lang}: {k} needs plural forms {sorted(need - set(v))}")
                if any(not isinstance(s, str) or not s.strip() for s in v.values()):
                    problems.append(f"{lang}: {k} has an empty plural form")
            else:
                problems.append(f"{lang}: {k} must be text or a plural group")

            if isinstance(v, dict) != isinstance(base[k], dict):
                problems.append(f"{lang}: {k} is plural in one language but not the other")
            elif placeholders(v) != placeholders(base[k]):
                problems.append(
                    f"{lang}: {k} placeholders {sorted(placeholders(v))} "
                    f"differ from {BASE_LANG} {sorted(placeholders(base[k]))}"
                )

    for k in sorted(usage.text):
        if k not in base:
            problems.append(f"page uses unknown key {k}")
        elif is_plural(base[k]):
            problems.append(f"page uses plural key {k} as plain text (use tp)")
    for k in sorted(usage.plural):
        if k not in base:
            problems.append(f"page uses unknown plural key {k}")
        elif not is_plural(base[k]):
            problems.append(f"page uses {k} as a plural but it is plain text")
    for k in sorted(set(base) - usage.text - usage.plural):
        problems.append(f"key {k} is never used (remove it or use it)")
    return problems


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------
def js_json(data: object) -> str:
    """JSON that is safe inside an inline <script>."""
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def assemble_page(dicts: dict[str, dict]) -> str:
    page = (SRC / "page.html").read_text(encoding="utf-8")
    parts = {
        "/*@STYLE@*/": (SRC / "styles.css").read_text(encoding="utf-8").strip(),
        "/*@I18N@*/": js_json(dicts),
        "/*@SCRIPT@*/": (SRC / "app.js").read_text(encoding="utf-8").strip(),
    }
    for marker, content in parts.items():
        if page.count(marker) != 1:
            raise BuildError([f"src/page.html must contain {marker} exactly once"])
        page = page.replace(marker, content)
    if "</script" in parts["/*@SCRIPT@*/"].lower():
        raise BuildError(["src/app.js must not contain a closing script tag"])
    return page.strip() + "\n"


def site_shell(body: str, en: dict) -> str:
    desc = en["app"]["description"]
    return f"""<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="{desc}">
<meta name="theme-color" content="#9cc1ea" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#060b19" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="{en["app"]["name"]}">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<style>
:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);color-scheme:light}}
body{{margin:0;font:14px system-ui,sans-serif}}
img{{max-width:100%}}
</style>
</head>
<body>
{body}<script>
if ("serviceWorker" in navigator && location.protocol === "https:") {{
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {{}}));
}}
</script>
</body>
</html>
"""


def manifest(en: dict, ar: dict) -> str:
    data = {
        "name": en["app"]["name"],
        "short_name": en["app"]["name"],
        "description": f'{en["app"]["description"]} / {ar["app"]["description"]}',
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "background_color": "#dfe9f4",
        "theme_color": "#9cc1ea",
        "icons": [
            {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def service_worker(site_files: dict[str, str]) -> str:
    h = hashlib.sha256()
    for name in sorted(site_files):
        h.update(name.encode())
        h.update(site_files[name].encode())
    for icon in sorted((ROOT / "icons").glob("*")):
        h.update(icon.read_bytes())
    template = (SRC / "sw.js").read_text(encoding="utf-8")
    if "__VERSION__" not in template:
        raise BuildError(["src/sw.js must contain __VERSION__"])
    return template.replace("__VERSION__", h.hexdigest()[:12])


def check_js_syntax(script: str) -> list[str]:
    node = shutil.which("node")
    if not node:
        return []
    r = subprocess.run([node, "--check", "-"], input=script, text=True, capture_output=True)
    return [] if r.returncode == 0 else [f"src/app.js has a syntax error:\n{r.stderr.strip()}"]


def build() -> dict[Path, str]:
    """Validate everything and return {output path: content}. Writes nothing."""
    dicts = load_dicts()
    page_src = (SRC / "page.html").read_text(encoding="utf-8")
    script = (SRC / "app.js").read_text(encoding="utf-8")
    problems = validate_i18n(dicts, find_usage(page_src, script)) + check_js_syntax(script)
    if problems:
        raise BuildError(problems)

    body = assemble_page(dicts)
    index = site_shell(body, dicts["en"])
    if len(index.encode()) > MAX_PAGE_BYTES:
        raise BuildError([f"index.html is {len(index.encode())} bytes, over the {MAX_PAGE_BYTES} byte budget"])
    files = {"index.html": index, "manifest.webmanifest": manifest(dicts["en"], dicts["ar"])}
    files["sw.js"] = service_worker(files)
    out = {ROOT / name: content for name, content in files.items()}
    out[PREVIEW] = body
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="fail if the committed site differs from a fresh build")
    args = ap.parse_args(argv)
    try:
        outputs = build()
    except BuildError as e:
        print("Build failed:", file=sys.stderr)
        for p in e.problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    if args.check:
        stale = [p for p, c in outputs.items() if p != PREVIEW and (not p.exists() or p.read_text(encoding="utf-8") != c)]
        if stale:
            print("Site is out of date. Run: python tools/build.py", file=sys.stderr)
            for p in stale:
                print(f"  - {p.relative_to(ROOT)}", file=sys.stderr)
            return 1
        print("Site is up to date.")
        return 0

    for path, content in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        print(f"wrote {path.relative_to(ROOT)} ({len(content.encode()):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
