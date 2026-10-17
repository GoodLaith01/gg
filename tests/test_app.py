"""End-to-end tests: the real page in a real browser, in English and Arabic, on laptop and phone sizes."""
import json
import os
import re

import pytest

from build import flatten, load_dicts
from conftest import mock_forecast

DICTS = load_dicts()
ALL_KEYS = set(flatten(DICTS["en"]))
AR = re.compile(r"[؀-ۿ]")


def visible_text(page) -> str:
    return page.evaluate("document.body.innerText")


def assert_no_raw_keys(page):
    """No translation key (like 'wx.title') may ever be shown instead of real words."""
    text = visible_text(page)
    shown = {k for k in ALL_KEYS if re.search(rf"(?<![\w.]){re.escape(k)}(?![\w.])", text)}
    assert not shown, f"raw keys on screen: {sorted(shown)}"


def assert_no_side_scroll(page):
    over = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert over <= 0, f"page scrolls sideways by {over}px"


# --- language ----------------------------------------------------------------------------------
def test_english_by_default(make_page):
    page = make_page()
    assert page.evaluate("[document.documentElement.lang, document.documentElement.dir]") == ["en", "ltr"]
    assert page.title() == "Daybook"
    assert_no_raw_keys(page)
    assert page.errors == []


def test_arabic_browser_starts_in_arabic(make_page):
    page = make_page(locale="ar-SA")
    assert page.evaluate("document.documentElement.dir") == "rtl"
    assert page.title() == "دفتر اليوم"


def test_switch_to_arabic_and_back(make_page):
    page = make_page()
    page.click("#lang-btn")
    assert page.evaluate("[document.documentElement.lang, document.documentElement.dir]") == ["ar", "rtl"]
    assert page.text_content("#wx-h") == "الطقس"
    assert page.text_content("#notes-h span") == "الملاحظات"
    assert AR.search(page.text_content("#greet"))
    assert AR.search(page.text_content("#date-line"))
    assert_no_raw_keys(page)
    page.click("#lang-btn")
    assert page.evaluate("document.documentElement.dir") == "ltr"
    assert page.text_content("#wx-h") == "Weather"
    assert page.errors == []


def test_language_choice_is_remembered(make_page):
    page = make_page()
    page.click("#lang-btn")
    page.reload()
    page.wait_for_function("document.querySelector('#clock').children.length > 0")
    assert page.evaluate("document.documentElement.dir") == "rtl"
    assert page.text_content("#cal-today") == "اليوم"


def test_arabic_plurals_in_summary(make_page):
    page = make_page(lang="ar")
    # first run seeds two example notes and one idea
    pills = page.locator("#summary .pill").all_inner_texts()
    assert "ملاحظتان" in pills
    assert "فكرة واحدة" in pills


def test_arabic_layout_mirrors(make_page):
    page = make_page(lang="ar")
    brand_x = page.locator(".brand").bounding_box()["x"]
    settings_x = page.locator("#settings-btn").bounding_box()["x"]
    assert brand_x > settings_x, "in Arabic the brand sits on the right and buttons on the left"


# --- weather -----------------------------------------------------------------------------------
def test_weather_with_gps(make_page):
    page = make_page()
    assert page.is_visible("#wx-search"), "first visit asks for a location"
    page.click("#locate-btn")
    page.wait_for_selector("#wx-body:not([hidden])")
    assert page.text_content("#wx-place") == "London"
    assert page.text_content("#wx-temp") == "19"
    assert page.text_content("#wx-cond") == "Partly cloudy"
    assert page.locator("#wx-hourly .hr").count() == 12
    assert page.locator("#wx-daily li").count() == 6
    assert page.is_visible("#sun-box")


def test_weather_city_search_with_enter(make_page):
    page = make_page()
    page.fill("#city-input", "par")
    page.wait_for_selector("#city-results button")
    assert page.locator("#city-results button").count() == 2
    page.press("#city-input", "Enter")
    page.wait_for_selector("#wx-body:not([hidden])")
    assert page.text_content("#wx-place") == "Paris"


def test_weather_in_arabic_and_fahrenheit(make_page):
    page = make_page(lang="ar", forecast=mock_forecast(code=63))
    page.click("#locate-btn")
    page.wait_for_selector("#wx-body:not([hidden])")
    assert page.text_content("#wx-cond") == "مطر"
    assert page.text_content("#wx-hourly .hr.now span") == "الآن"
    page.click("#unit-btn")
    assert page.text_content("#wx-temp") == "67"  # 19.4 °C
    assert page.text_content("#unit-btn") == "°ف"
    assert_no_raw_keys(page)


def test_weather_failure_shows_retry(make_page, browser):
    page = make_page()
    page.context.unroute("https://api.open-meteo.com/**")
    page.context.route("https://api.open-meteo.com/**", lambda r: r.fulfill(status=500, body="down"))
    page.click("#locate-btn")
    page.wait_for_selector("#wx-error:not([hidden])")
    assert "Couldn't load the weather" in page.text_content("#wx-error-msg")
    assert page.is_visible("#wx-retry")


# --- notes -------------------------------------------------------------------------------------
def test_note_add_delete_undo(make_page):
    page = make_page()
    page.fill("#note-new", "Buy flowers")
    page.click("#note-form button[type=submit]")
    assert page.locator(".note textarea").first.input_value() == "Buy flowers"
    page.locator(".note").first.locator(".x").click()
    page.wait_for_timeout(350)
    assert "Buy flowers" not in page.locator(".note textarea").evaluate_all("a => a.map(t => t.value)")
    page.click("#toast-act")
    assert page.locator(".note textarea").first.input_value() == "Buy flowers"


def test_note_edit_survives_reload(make_page):
    page = make_page()
    box = page.locator(".note textarea").first
    box.fill("Edited note")
    page.wait_for_timeout(600)
    page.reload()
    page.wait_for_selector(".note textarea")
    assert page.locator(".note textarea").first.input_value() == "Edited note"


def test_note_search(make_page):
    page = make_page()
    page.fill("#note-new", "Gym at 7")
    page.click("#note-form button[type=submit]")
    page.fill("#notes-search", "gym")
    visible = [n for n in page.locator(".note").all() if n.is_visible()]
    assert len(visible) == 1
    page.fill("#notes-search", "zzz")
    assert page.is_visible("#notes-nomatch")


# --- calendar ----------------------------------------------------------------------------------
def test_plan_add_and_undo_remove(make_page):
    page = make_page()
    page.fill("#ev-text", "Dinner with Sara")
    page.fill("#ev-time", "19:00")
    page.click("#ev-form button[type=submit]")
    assert "Dinner with Sara" in page.locator("#day-list .txt").all_inner_texts()
    page.locator("#day-list li", has_text="Dinner with Sara").locator(".x").click()
    assert "Dinner with Sara" not in page.locator("#day-list .txt").all_inner_texts()
    page.click("#toast-act")
    assert "Dinner with Sara" in page.locator("#day-list .txt").all_inner_texts()


def test_arabic_week_starts_saturday(make_page):
    page = make_page(lang="ar")
    assert page.locator("#cal-week span").first.inner_text() == "س"


def test_month_navigation(make_page):
    page = make_page()
    first = page.text_content("#cal-title")
    page.click("#cal-next")
    assert page.text_content("#cal-title") != first
    page.click("#cal-today")
    assert page.text_content("#cal-title") == first


# --- ideas -------------------------------------------------------------------------------------
def test_idea_autosaves_and_deletes_with_undo(make_page):
    page = make_page()
    page.click("#idea-new")
    page.fill("#idea-title", "Podcast")
    page.fill("#idea-body", "About local food and markets")
    page.wait_for_timeout(700)
    assert page.locator(".idea-item.on strong").inner_text() == "Podcast"
    assert page.text_content("#idea-words") == "5 words"
    page.reload()
    page.wait_for_selector(".idea-item")
    assert page.locator(".idea-item strong").first.inner_text() == "Podcast"
    page.click("#idea-del")
    page.click("#idea-yes")
    assert "Podcast" not in page.locator(".idea-item strong").all_inner_texts()
    page.click("#toast-act")
    assert page.locator(".idea-item.on strong").inner_text() == "Podcast"


def test_arabic_word_count(make_page):
    page = make_page(lang="ar")
    page.click("#idea-new")
    page.fill("#idea-body", "فكرة جديدة")
    assert page.text_content("#idea-words") == "كلمتان"


# --- settings ----------------------------------------------------------------------------------
def test_settings_dialog(make_page):
    page = make_page()
    page.click("#settings-btn")
    page.click("label:has(#s-theme-dark)")
    assert page.evaluate("document.documentElement.dataset.theme") == "dark"
    page.click("label:has(#s-clock-12)")
    assert page.is_visible("#ampm")
    page.click("label:has(#s-lang-ar)")
    assert page.evaluate("document.documentElement.dir") == "rtl"
    assert page.text_content("#settings-h") == "الإعدادات"
    assert page.text_content("#ampm") in {"ص", "م"}
    assert_no_raw_keys(page)


# --- move data ---------------------------------------------------------------------------------
def test_move_data_between_devices(make_page):
    laptop = make_page()
    laptop.fill("#note-new", "From the laptop")
    laptop.click("#note-form button[type=submit]")
    laptop.click("#sync-btn")
    laptop.click("#sync-copy")
    laptop.wait_for_selector("#sync-out:not([hidden])")
    code = laptop.input_value("#sync-out")
    assert code.startswith("DAYBOOK")

    phone = make_page(width=390, height=844, mobile=True, lang="ar")
    phone.fill("#note-new", "من الهاتف")
    phone.click("#note-form button[type=submit]")
    phone.click("#sync-btn")
    phone.fill("#sync-in", code)
    phone.click("#sync-load")
    phone.wait_for_function("document.querySelectorAll('.note').length >= 4", timeout=5000)
    notes = phone.locator(".note textarea").evaluate_all("a => a.map(t => t.value)")
    assert "From the laptop" in notes and "من الهاتف" in notes
    # examples are never copied across
    assert sum("Example" in n for n in notes) == 0


def test_bad_code_is_explained(make_page):
    page = make_page()
    page.click("#sync-btn")
    page.fill("#sync-in", "not a code")
    page.click("#sync-load")
    assert "didn't work" in page.text_content("#sync-msg")


# --- layout & speed ----------------------------------------------------------------------------
@pytest.mark.parametrize("lang", ["en", "ar"])
@pytest.mark.parametrize("width", [360, 768, 1280])
def test_no_sideways_scroll(make_page, lang, width):
    page = make_page(width=width, lang=lang, mobile=width < 500)
    assert_no_side_scroll(page)
    page.click("#settings-btn")
    assert_no_side_scroll(page)


@pytest.mark.skipif(not os.environ.get("DAYBOOK_PERF"), reason="set DAYBOOK_PERF=1 to run the frame-rate check")
@pytest.mark.parametrize("lang", ["en", "ar"])
def test_smooth_on_a_slow_phone(make_page, lang):
    """4x CPU slowdown, rain falling at night: should hold close to 60 frames per second."""
    page = make_page(width=400, height=850, mobile=True, lang=lang, forecast=mock_forecast(code=63, is_day=0))
    page.click("#locate-btn")
    page.wait_for_selector("#wx-body:not([hidden])")
    cdp = page.context.new_cdp_session(page)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    fps = page.evaluate("""() => new Promise(done => {
        let n = 0; const t0 = performance.now();
        (function f(t) { n++; if (t - t0 < 3000) requestAnimationFrame(f); else done(n / ((t - t0) / 1000)); })(t0);
    })""")
    assert fps >= 50, f"only {fps:.0f} fps"


def test_arabic_clock_and_sun_follow_reading_direction(make_page):
    page = make_page(lang="ar")
    page.click("#locate-btn")
    page.wait_for_selector("#sun-box:not([hidden])")
    hero = page.locator(".hero").bounding_box()
    clock = page.locator("#clock-btn").bounding_box()
    assert clock["x"] + clock["width"] > hero["x"] + hero["width"] * 0.8, "clock should hug the right edge in Arabic"
    rise = page.locator(".sun-times > span").first.bounding_box()
    assert rise["x"] > hero["x"] + hero["width"] / 2 or rise["x"] > page.locator(".sun-times > span").last.bounding_box()["x"]
    flipped = page.evaluate("getComputedStyle(document.querySelector('.sunbox svg')).transform")
    assert flipped.startswith("matrix(-1"), "sun arc should be mirrored so it rises on the right"
