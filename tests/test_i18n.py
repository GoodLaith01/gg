"""The translation files and the checker that guards them."""
import copy

import pytest

from build import Usage, find_usage, flatten, is_plural, load_dicts, validate_i18n, SRC


@pytest.fixture(scope="module")
def dicts():
    return load_dicts()


@pytest.fixture(scope="module")
def usage():
    return find_usage((SRC / "page.html").read_text(encoding="utf-8"), (SRC / "app.js").read_text(encoding="utf-8"))


def test_real_translations_are_complete(dicts, usage):
    assert validate_i18n(dicts, usage) == []


def test_both_languages_have_the_same_keys(dicts):
    assert set(flatten(dicts["en"])) == set(flatten(dicts["ar"]))


def test_arabic_text_is_actually_arabic(dicts):
    """Catches copy-pasted English left in the Arabic file."""
    allowed_latin = {"wx.unitC", "wx.unitF", "lang.switchTo", "notes.hint"}
    for k, v in flatten(dicts["ar"]).items():
        texts = v.values() if isinstance(v, dict) else [v]
        for s in texts:
            if k in allowed_latin:
                continue
            assert any("؀" <= ch <= "ۿ" for ch in s), f"ar {k} has no Arabic letters: {s!r}"


def test_arabic_plurals_use_all_six_forms(dicts):
    for k, v in flatten(dicts["ar"]).items():
        if is_plural(v):
            assert set(v) == {"zero", "one", "two", "few", "many", "other"}, k


def test_flatten_keeps_plural_groups_whole():
    tree = {"a": {"b": "x", "c": {"one": "1", "other": "n"}}}
    assert flatten(tree) == {"a.b": "x", "a.c": {"one": "1", "other": "n"}}


# --- the checker catches each kind of mistake --------------------------------------------------
BASE = {
    "en": {"hi": "Hello {name}", "n": {"one": "{n} cat", "other": "{n} cats"}},
    "ar": {"hi": "مرحبا {name}", "n": {"zero": "لا قطط", "one": "قطة", "two": "قطتان", "few": "{n} قطط", "many": "{n} قطة", "other": "{n} قطة"}},
}
USED = Usage(text={"hi"}, plural={"n"})


def check(mutate):
    d = copy.deepcopy(BASE)
    mutate(d)
    return validate_i18n(d, USED)


def test_checker_accepts_a_correct_pair():
    assert check(lambda d: None) == []


def test_checker_finds_missing_key():
    assert any("missing key hi" in p for p in check(lambda d: d["ar"].pop("hi")))


def test_checker_finds_placeholder_mismatch():
    assert any("placeholders" in p for p in check(lambda d: d["ar"].update(hi="مرحبا {nam}")))


def test_checker_finds_missing_arabic_plural_form():
    assert any("plural forms" in p for p in check(lambda d: d["ar"]["n"].pop("two")))


def test_checker_finds_empty_text():
    assert any("is empty" in p for p in check(lambda d: d["ar"].update(hi="  ")))


def test_checker_finds_unknown_and_unused_keys():
    problems = validate_i18n(BASE, Usage(text={"nope"}, plural={"n"}))
    assert "page uses unknown key nope" in problems
    assert "key hi is never used (remove it or use it)" in problems


def test_checker_finds_plural_used_as_text():
    problems = validate_i18n(BASE, Usage(text={"hi", "n"}, plural=set()))
    assert any("as plain text" in p for p in problems)
