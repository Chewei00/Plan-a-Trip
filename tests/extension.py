"""End-to-end test of the Chrome extension, without network access: the real extension is loaded into Chromium, and
the two sites it runs on are stood in for (Google Maps by a blank page at the same address, Plan a Trip by the local
files, served at the site's real address so the extension recognises it).

    python3 -m http.server 8765 --bind 127.0.0.1 &     # from the repository root
    python3 tests/extension.py
"""
import json
import pathlib
import tempfile
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXT = str(ROOT / "extension")
MOCK = (ROOT / "tests/mock-googlemaps.js").read_text(encoding="utf-8")
SITE = "https://chewei00.github.io/Plan-a-Trip/"
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
TYPES = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png"}

def place_url(name, fid, lat, lng):
    from urllib.parse import quote
    return f"https://www.google.com/maps/place/{quote(name)}/@{lat - 0.001},{lng - 0.002},17z/data=!3m1!4b1!4m6!3m5!1s{fid}!8m2!3d{lat}!4d{lng}!16zL20vMDJ?entry=ttu"

FUJIQ = place_url("富士急樂園", "0x60196005c1d9f19f:0x9a5a9d0b9cbd5c0b", 35.4869467, 138.7805513)
HOTEL = place_url("Hotel Mystays 富士山", "0x6019600000000002:0x2", 35.4901, 138.7812)

with sync_playwright() as p, tempfile.TemporaryDirectory() as profile:
    ctx = p.chromium.launch_persistent_context(profile, channel="chromium", headless=True, viewport={"width": 1440, "height": 800},
                                               args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"])
    errors = []

    def site(route):
        path = route.request.url[len(SITE):].split("?")[0] or "index.html"
        f = ROOT / path
        if not f.is_file():
            return route.fulfill(status=404, body="")
        route.fulfill(status=200, content_type=TYPES.get(f.suffix, "application/octet-stream"), body=f.read_bytes())
    ctx.route(SITE + "**", site)
    ctx.route("https://www.google.com/maps/**", lambda r: r.fulfill(status=200, content_type="text/html",
              body='<!doctype html><meta charset="utf-8"><title>Google 地圖</title><h1>stand-in</h1><button jsaction="pane.category">主題樂園</button>'))
    ctx.route("https://maps.googleapis.com/maps/api/js*", lambda r: r.fulfill(status=200, content_type="text/javascript", body=MOCK))
    for u in ["https://fonts.googleapis.com/**", "https://places.googleapis.com/**", "https://api.geoapify.com/**"]:
        ctx.route(u, lambda r: r.abort())

    def trips(pg):
        return json.loads(pg.evaluate("localStorage.getItem('plan-a-trip:v1')") or "null")
    def places(pg, title):
        return [x["name"] for t in trips(pg)["trips"] if t["title"] == title for x in t["places"]]

    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    def press_icon(url=FUJIQ):
        # what Chrome hands the extension when the toolbar button is pressed: the tab that was in front
        sw.evaluate("u => chrome.action.onClicked.dispatch({id: 0, url: u})", url)
    def kept(key):
        return sw.evaluate("k => chrome.storage.local.get([k]).then(r => r[k])", key)

    # the site, with a second trip made and left on screen
    app = ctx.new_page()
    app.on("pageerror", lambda e: errors.append(str(e)))
    app.goto(SITE + "index.html")
    app.wait_for_timeout(900)
    app.hover(".title"); app.wait_for_timeout(600); app.click(".tripbtn"); app.wait_for_timeout(200)
    app.click("#menu button:has-text('New trip')"); app.wait_for_timeout(300)
    app.keyboard.type("東京 3 日"); app.keyboard.press("Enter"); app.wait_for_timeout(400)
    assert app.locator(".title").inner_text() == "東京 3 日"

    # Google Maps with the extension off (as installed): nothing on the page
    maps = ctx.new_page()
    maps.on("pageerror", lambda e: errors.append(str(e)))
    maps.goto(FUJIQ)
    maps.wait_for_timeout(1200)
    card = maps.locator("#plan-a-trip-card")
    assert card.count() == 0 and not kept("pat_on")
    # pressing the button while another site is in front does nothing
    press_icon(SITE + "index.html")
    press_icon("https://www.google.com/search?q=maps")
    maps.wait_for_timeout(400)
    assert card.count() == 0 and not kept("pat_on")

    # pressing the toolbar button turns it on: the bar names the trip to save to, and the card for the place is there
    press_icon()
    maps.wait_for_timeout(600)
    assert kept("pat_on") is True and "開啟中" in sw.evaluate("() => chrome.action.getTitle({})")
    assert card.locator(".trip span").inner_text() == "東京 3 日"
    assert card.locator(".pend-name").inner_text() == "富士急樂園" and card.locator(".chip.on").inner_text() == "景點"
    assert card.locator(".xbtn").count() == 0 and card.locator(".dest").count() == 0, "no close button and no destination line on the card"
    box = card.locator(".wrap").bounding_box()
    bar, pend = card.locator(".bar").bounding_box(), card.locator(".pend").bounding_box()
    assert abs(box["x"] + box["width"] - (1440 - 16)) < 1 and box["y"] == 76 and box["width"] == 236 and bar["height"] == 36 and pend["y"] == 76 + 36 + 8, (box, bar, pend)

    # saving: the button says so, and the place arrives in that trip on the site, which is open in another tab
    card.locator(".savebtn").click()
    maps.wait_for_timeout(300)
    assert card.locator(".savebtn").inner_text() == "已儲存" and card.locator(".savebtn").is_disabled()
    app.wait_for_timeout(800)
    assert app.locator(".card.focus .cname").inner_text() == "富士急樂園"
    saved = [t for t in trips(app)["trips"] if t["title"] == "東京 3 日"][0]["places"][-1]
    assert saved["cat"] == "sight" and saved["lat"] == 35.486947 and saved["lng"] == 138.780551 and saved["fid"] == "0x60196005c1d9f19f:0x9a5a9d0b9cbd5c0b", saved
    assert "gid" not in saved, "a place from the Google Maps site is not a Places API result"

    # the bar lists the trips; picking another one changes where places go, and "saved" is judged for that trip
    card.locator(".trip").click()
    maps.wait_for_timeout(200)
    assert card.locator(".menu button").all_inner_texts() == ["富士山 5 日", "東京 3 日", "Open Plan a Trip"]
    assert card.locator(".menu button >> nth=1 >> .tick").count() == 1
    card.locator(".menu button:has-text('富士山 5 日')").click()
    maps.wait_for_timeout(300)
    assert card.locator(".menu").count() == 0 and card.locator(".trip span").inner_text() == "富士山 5 日"
    assert card.locator(".savebtn").inner_text() == "存到想去的地方", "not saved in this trip yet"
    card.locator(".savebtn").click()
    app.wait_for_timeout(900)
    assert places(app, "富士山 5 日")[-1] == "富士急樂園" and app.locator(".title").inner_text() == "東京 3 日", "it goes to the chosen trip; the site stays on its own"

    # the choice holds when the site merely reloads, and follows the site when the trip on screen there changes
    app.reload()
    app.wait_for_timeout(1000)
    assert card.locator(".trip span").inner_text() == "富士山 5 日"
    app.hover(".title"); app.wait_for_timeout(600); app.click(".tripbtn"); app.wait_for_timeout(200)
    app.click("#menu button:has-text('富士山 5 日')"); app.wait_for_timeout(600)
    app.hover(".title"); app.wait_for_timeout(600); app.click(".tripbtn"); app.wait_for_timeout(200)
    app.click("#menu button:has-text('東京 3 日')"); app.wait_for_timeout(600)
    maps.wait_for_timeout(300)
    assert card.locator(".trip span").inner_text() == "東京 3 日"

    # Google Maps moves between places without loading a page: the card follows and guesses the category
    maps.evaluate("u => history.pushState({}, '', u)", HOTEL)
    maps.wait_for_timeout(900)
    assert card.locator(".pend-name").inner_text() == "Hotel Mystays 富士山" and card.locator(".chip.on").inner_text() == "住宿"
    maps.evaluate("history.pushState({}, '', 'https://www.google.com/maps/@35.49,138.78,14z')")
    maps.wait_for_timeout(900)
    assert card.locator(".pend").count() == 0 and card.locator(".bar").count() == 1, "no place open: the bar stays, the card goes"
    maps.evaluate("u => history.pushState({}, '', u)", HOTEL)
    maps.wait_for_timeout(900)

    # with the site closed, a saved place waits in the extension and is there the next time the site is opened
    app.close()
    card.locator(".savebtn").click()
    maps.wait_for_timeout(300)
    assert card.locator(".savebtn").inner_text() == "已儲存" and len(kept("pat_inbox")) == 1
    # "Open Plan a Trip" opens the site when it is not open...
    before = len(ctx.pages)
    card.locator(".trip").click(); maps.wait_for_timeout(200)
    with ctx.expect_page() as opened:
        card.locator(".menu button:has-text('Open Plan a Trip')").click()
    app = opened.value
    assert len(ctx.pages) == before + 1
    # a tab the extension opens loads from the real network, which this test does not have: load the stand-in there
    app.on("pageerror", lambda e: errors.append(str(e)))
    app.goto(SITE)
    app.wait_for_timeout(1500)
    assert places(app, "東京 3 日")[-1] == "Hotel Mystays 富士山" and kept("pat_inbox") == []
    n = sum(len(t["places"]) for t in trips(app)["trips"])
    app.reload()
    app.wait_for_timeout(1000)
    assert sum(len(t["places"]) for t in trips(app)["trips"]) == n, "nothing is added twice after a reload"
    # ...and goes to its tab, without opening another, when it is
    maps.bring_to_front()
    card.locator(".trip").click(); maps.wait_for_timeout(200)
    card.locator(".menu button:has-text('Open Plan a Trip')").click()
    maps.wait_for_timeout(600)
    assert len(ctx.pages) == before + 1
    assert sw.evaluate("() => chrome.tabs.query({active: true}).then(ts => ts.some(t => (t.url || '').includes('Plan-a-Trip')))")

    # on is remembered across a reload; pressing the button again turns everything off, and that is remembered too
    maps.reload()
    maps.wait_for_timeout(1200)
    assert card.locator(".bar").count() == 1 and card.locator(".pend-name").inner_text() == "Hotel Mystays 富士山"
    press_icon()
    maps.wait_for_timeout(500)
    assert maps.locator("#plan-a-trip-card").count() == 0 and kept("pat_on") is False and "點一下開啟" in sw.evaluate("() => chrome.action.getTitle({})")
    maps.reload()
    maps.wait_for_timeout(1200)
    assert maps.locator("#plan-a-trip-card").count() == 0

    assert not errors, errors
    ctx.close()
    print("extension test passed")
