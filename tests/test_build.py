"""The build output: one self-contained page, a versioned offline worker, a manifest."""
import json
import re

import pytest

from build import PREVIEW, ROOT, build, main


@pytest.fixture(scope="module")
def outputs():
    return {p.relative_to(ROOT).as_posix(): c for p, c in build().items()}


def test_build_writes_the_site_files(outputs):
    assert {"index.html", "sw.js", "manifest.webmanifest", PREVIEW.relative_to(ROOT).as_posix()} <= set(outputs)


def test_no_template_markers_left(outputs):
    for marker in ("/*@STYLE@*/", "/*@I18N@*/", "/*@SCRIPT@*/", "__VERSION__"):
        assert marker not in outputs["index.html"]
        assert marker not in outputs["sw.js"]


def test_page_carries_both_languages(outputs):
    html = outputs["index.html"]
    m = re.search(r"window\.DAYBOOK_I18N = (\{.*?\});\n</script>", html, re.S)
    assert m, "translations not embedded"
    data = json.loads(m.group(1).replace("<\\/", "</"))
    assert set(data) == {"en", "ar"}
    assert data["ar"]["app"]["name"] == "دفتر اليوم"


def test_service_worker_version_is_a_content_hash(outputs):
    m = re.search(r'const VERSION = "daybook-([0-9a-f]{12})";', outputs["sw.js"])
    assert m


def test_build_is_deterministic():
    a = {p: c for p, c in build().items()}
    b = {p: c for p, c in build().items()}
    assert a == b


def test_manifest_is_valid(outputs):
    data = json.loads(outputs["manifest.webmanifest"])
    assert data["display"] == "standalone"
    assert {i["sizes"] for i in data["icons"]} == {"192x192", "512x512"}
    for icon in data["icons"]:
        assert (ROOT / icon["src"]).exists(), icon["src"]


def test_preview_page_has_no_document_skeleton(outputs):
    body = outputs[PREVIEW.relative_to(ROOT).as_posix()]
    assert not body.lstrip().lower().startswith("<!doctype")
    assert body.lstrip().startswith("<title>")


def test_page_stays_within_size_budget(outputs):
    assert len(outputs["index.html"].encode()) < 200_000


def test_committed_site_is_up_to_date():
    """The files GitHub Pages serves must match a fresh build of src/."""
    assert main(["--check"]) == 0
