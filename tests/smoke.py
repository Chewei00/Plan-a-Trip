"""Smoke test. The map library is replaced by tests/mock-maplibre.js (same camera maths, no rendering),
so this runs without network access.

    python3 -m http.server 8765 --bind 127.0.0.1 &     # from the repository root
    python3 tests/smoke.py
"""
import json
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

    # Geoapify stand-ins: one search result, and a route that detours through a midpoint and takes 20 minutes
    def geoapify(route):
        url = route.request.url
        calls.append(url)
        if "/geocode/autocomplete" in url:
            body = {"results": [{"name": "大石公園", "city": "富士河口湖町", "lat": 35.5233, "lon": 138.7468, "category": "leisure.park"},
                                {"name": "ほうとう不動", "city": "富士河口湖町", "lat": 35.4990, "lon": 138.7690, "category": "catering.restaurant"}]}
        else:
            a, b = [[float(v) for v in w.split(",")] for w in url.split("waypoints=")[1].split("&")[0].replace("%7C", "|").split("|")]
            mid = [(a[1] + b[1]) / 2 + 0.01, (a[0] + b[0]) / 2]
            body = {"features": [{"geometry": {"type": "MultiLineString", "coordinates": [[[a[1], a[0]], mid, [b[1], b[0]]]]},
                                  "properties": {"time": 1200, "distance": 1500}}]}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body), headers={"access-control-allow-origin": "*"})
    calls = []
    ctx.route("https://api.geoapify.com/**", geoapify)
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

    # routes: every road leg is asked once, drawn through the midpoint, and its time shown
    page.wait_for_timeout(400)
    routes = [u for u in calls if "/routing" in u]
    assert len(routes) == 4 and len(set(routes)) == 4, "one request per road leg, no repeats"
    assert page.evaluate("__map.getSource('routes').data.features[0].geometry.coordinates.length") == 3, "leg follows the returned route"
    assert page.locator(".day.sel .legtime").all_inner_texts() == ["20\u00a0m", "20\u00a0m", "20\u00a0m"]

    # search: typing asks the place search once after a pause; picking a result offers to save it, with a guessed category
    page.fill("#q", "ほうとう")
    page.wait_for_timeout(700)
    assert len([u for u in calls if "/geocode/autocomplete" in u]) == 1
    assert "ほうとう不動" in page.locator("#results").inner_text()
    assert page.locator("#results button").count() == 2, "only places from the map search are listed"
    page.fill("#q", "富士")   # matches several saved places by name, but the stand-in search still answers with its two
    page.wait_for_timeout(700)
    assert page.locator("#results .tag:has-text('已儲存')").count() == 0, "saved places are not mixed in on their own"
    page.click("#results button:has-text('ほうとう不動')")
    page.wait_for_timeout(300)
    assert page.locator(".pend .pend-name").inner_text() == "ほうとう不動"
    assert page.locator(".pend .chip.on").inner_text() == "飲食"
    page.click(".savebtn")
    page.wait_for_timeout(300)
    assert page.locator(".card.focus .cname").inner_text() == "ほうとう不動"

    assert not errors, errors
    browser.close()
    print("smoke test passed")
