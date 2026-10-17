"""Shared fixtures: a local web server for the built site and a browser with the network mocked.

The weather, city search and reverse-geocoding services are answered with fixed data so the tests
are fast, repeatable and never depend on the internet.
"""
from __future__ import annotations

import datetime as dt
import functools
import http.server
import os
import sys
import threading
from pathlib import Path

import pytest
from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

LONDON = {"latitude": 51.507, "longitude": -0.128}


def mock_forecast(code: int = 2, is_day: int = 1) -> dict:
    """An Open-Meteo style forecast starting at the current hour."""
    now = dt.datetime.now().replace(minute=0, second=0, microsecond=0)
    hours = [(now + dt.timedelta(hours=i)).strftime("%Y-%m-%dT%H:00") for i in range(-2, 30)]
    days = [(now + dt.timedelta(days=i)).strftime("%Y-%m-%d") for i in range(6)]
    return {
        "utc_offset_seconds": 0,
        "current": {
            "time": now.strftime("%Y-%m-%dT%H:15"),
            "temperature_2m": 19.4,
            "apparent_temperature": 18.6,
            "relative_humidity_2m": 64,
            "weather_code": code,
            "wind_speed_10m": 14,
            "is_day": is_day,
        },
        "hourly": {
            "time": hours,
            "temperature_2m": [18 + (i % 7) for i in range(len(hours))],
            "weather_code": [[0, 2, 3, 61, 2, 95][i % 6] for i in range(len(hours))],
            "precipitation_probability": [(i * 13) % 90 for i in range(len(hours))],
            "is_day": [is_day] * len(hours),
        },
        "daily": {
            "time": days,
            "weather_code": [code, 61, 0, 3, 71, 95],
            "temperature_2m_max": [22, 19, 24, 18, 9, 20],
            "temperature_2m_min": [14, 12, 15, 11, 3, 13],
            "sunrise": [d + "T07:41" for d in days],
            "sunset": [d + "T18:52" for d in days],
            "precipitation_probability_max": [20, 80, 0, 10, 60, 70],
        },
    }


GEOCODE = {
    "results": [
        {"name": "Paris", "admin1": "Île-de-France", "country": "France", "latitude": 48.85341, "longitude": 2.3488},
        {"name": "Paris", "admin1": "Texas", "country": "United States", "latitude": 33.66, "longitude": -95.55},
    ]
}


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # keep test output clean
        pass


@pytest.fixture(scope="session")
def site_url():
    """Serve the repository root (the built site) on a free local port."""
    from build import main as build_main

    assert build_main([]) == 0, "build failed"
    handler = functools.partial(_QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}/"
    server.shutdown()


@pytest.fixture(scope="session")
def browser():
    exe = os.environ.get("CHROMIUM_PATH") or ("/opt/pw-browsers/chromium" if Path("/opt/pw-browsers/chromium").exists() else None)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        yield b
        b.close()


def _wire(context: BrowserContext, forecast: dict) -> None:
    context.route("https://api.open-meteo.com/**", lambda r: r.fulfill(json=forecast))
    context.route("https://geocoding-api.open-meteo.com/**", lambda r: r.fulfill(json=GEOCODE))
    context.route("https://api.bigdatacloud.net/**", lambda r: r.fulfill(json={"city": "London"}))
    # fonts are cosmetic; answer with empty CSS so no request leaves the machine
    context.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(body="", content_type="text/css"))
    context.route("https://fonts.gstatic.com/**", lambda r: r.fulfill(body=b"", status=204))


@pytest.fixture
def make_page(browser: Browser, site_url: str):
    """Factory: make_page(width=..., lang=..., forecast=...) -> a loaded Page with error tracking."""
    contexts: list[BrowserContext] = []

    def factory(width: int = 1280, height: int = 900, *, lang: str | None = None, forecast: dict | None = None,
                mobile: bool = False, locale: str = "en-US") -> Page:
        context = browser.new_context(
            viewport={"width": width, "height": height},
            locale=locale,
            is_mobile=mobile,
            has_touch=mobile,
            permissions=["geolocation", "clipboard-read", "clipboard-write"],
            geolocation=LONDON,
        )
        contexts.append(context)
        _wire(context, forecast or mock_forecast())
        if lang:
            # only the first load: later reloads must keep whatever the page saved
            context.add_init_script(f'if (!localStorage.getItem("daybook:lang")) localStorage.setItem("daybook:lang", JSON.stringify("{lang}"))')
        page = context.new_page()
        page.errors = []  # type: ignore[attr-defined]
        page.on("pageerror", lambda e: page.errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and page.errors.append(m.text))
        page.goto(site_url)
        page.wait_for_function("document.querySelector('#clock').children.length > 0")
        return page

    yield factory
    for c in contexts:
        c.close()
