"""Smoke test. The map library is replaced by tests/mock-maplibre.js (same camera maths, no rendering),
so this runs without network access.

    python3 -m http.server 8765 --bind 127.0.0.1 &     # from the repository root
    python3 tests/smoke.py
"""
import pathlib
from playwright.sync_api import sync_playwright

MOCK = (pathlib.Path(__file__).parent / "mock-maplibre.js").read_text(encoding="utf-8")

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 800})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    ctx.route("**/maplibre-gl.js", lambda r: r.fulfill(status=200, content_type="text/javascript", body=MOCK))
    ctx.route("**/maplibre-gl.css", lambda r: r.fulfill(status=200, content_type="text/css", body=""))
    ctx.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    page.goto("http://127.0.0.1:8765/index.html")
    page.wait_for_timeout(600)

    assert page.locator(".day").count() == 2, "sample trip has two days"
    assert page.locator(".card").count() == 7, "seven sights in the default category"
    assert page.locator(".mk .daytag").count() == 2, "overview shows one tag per day"

    page.click(".daypill >> nth=0")
    page.wait_for_timeout(500)
    assert page.locator(".day.sel").count() == 1
    assert page.locator(".npin").count() == 4, "open day shows numbered pins"
    last = page.evaluate("__map.log[__map.log.length-1]")
    assert last["fn"] == "fitBounds" and last["o"]["duration"] == 1000, "opening a day glides the map for one second"

    page.click(".npin >> nth=1")
    page.wait_for_timeout(300)
    assert page.locator(".stop.focus").count() == 1 and page.locator(".card.focus").count() == 1

    page.mouse.click(900, 650)
    page.wait_for_timeout(300)
    assert page.locator(".stop.focus").count() == 0, "clicking the map clears the selection"

    assert not errors, errors
    browser.close()
    print("smoke test passed")
