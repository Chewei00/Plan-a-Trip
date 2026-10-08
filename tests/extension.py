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

    # the site tells the extension which trip it is showing
    app = ctx.new_page()
    app.on("pageerror", lambda e: errors.append(str(e)))
    app.goto(SITE + "index.html")
    app.wait_for_timeout(900)
    assert app.locator(".title").inner_text() == "富士山 5 日"

    # on a place's page on Google Maps the card appears in the corner, with the place's name and where it will go
    maps = ctx.new_page()
    maps.on("pageerror", lambda e: errors.append(str(e)))
    maps.goto(FUJIQ)
    maps.wait_for_timeout(1200)
    card = maps.locator("#plan-a-trip-card")
    assert card.locator(".pend-name").inner_text() == "富士急樂園"
    assert card.locator(".dest").inner_text() == "存到：富士山 5 日"
    assert card.locator(".chip.on").inner_text() == "景點"
    box = card.locator(".pend").bounding_box()
    assert abs(box["x"] + box["width"] - (1440 - 16)) < 1 and box["y"] == 76 and box["width"] == 236, box

    # saving: the button says so, and the place arrives in the trip on the site, which is open in another tab
    card.locator(".savebtn").click()
    maps.wait_for_timeout(300)
    assert card.locator(".savebtn").inner_text() == "已儲存" and card.locator(".savebtn").is_disabled()
    app.wait_for_timeout(800)
    assert app.locator(".card.focus .cname").inner_text() == "富士急樂園"
    saved = trips(app)["trips"][0]["places"][-1]
    assert saved["name"] == "富士急樂園" and saved["cat"] == "sight" and saved["lat"] == 35.486947 and saved["lng"] == 138.780551 and saved["fid"] == "0x60196005c1d9f19f:0x9a5a9d0b9cbd5c0b", saved
    assert "gid" not in saved, "a place from the Google Maps site is not a Places API result"

    # opening the same place again later still says it is saved; the site has taken it, so nothing is waiting
    maps.reload()
    maps.wait_for_timeout(1200)
    assert card.locator(".savebtn").inner_text() == "已儲存"

    # Google Maps moves between places without loading a page: the card follows, guesses the category, and can be changed
    maps.evaluate("u => history.pushState({}, '', u)", HOTEL)
    maps.wait_for_timeout(900)
    assert card.locator(".pend-name").inner_text() == "Hotel Mystays 富士山" and card.locator(".chip.on").inner_text() == "住宿"
    assert card.locator(".savebtn").inner_text() == "存到想去的地方"
    card.locator(".chip:has-text('景點')").click()
    maps.wait_for_timeout(200)
    assert card.locator(".chip.on").inner_text() == "景點"
    card.locator(".chip:has-text('住宿')").click()

    # with the site closed, a saved place waits in the extension and is there the next time the site is opened
    app.close()
    card.locator(".savebtn").click()
    maps.wait_for_timeout(300)
    assert card.locator(".savebtn").inner_text() == "已儲存"
    app = ctx.new_page()
    app.on("pageerror", lambda e: errors.append(str(e)))
    app.goto(SITE + "index.html")
    app.wait_for_timeout(1200)
    names = [x["name"] for x in trips(app)["trips"][0]["places"]]
    assert names[-2:] == ["富士急樂園", "Hotel Mystays 富士山"], names
    assert trips(app)["trips"][0]["places"][-1]["cat"] == "stay"
    app.reload()
    app.wait_for_timeout(1000)
    assert len(trips(app)["trips"][0]["places"]) == len(names), "nothing is added twice after a reload"

    # closing the card hides it for that place; leaving the place hides it too
    maps.evaluate("u => history.pushState({}, '', u)", FUJIQ)
    maps.wait_for_timeout(900)
    card.locator(".xbtn").click()
    maps.wait_for_timeout(200)
    assert maps.locator("#plan-a-trip-card").count() == 0
    maps.evaluate("u => history.pushState({}, '', u)", HOTEL)
    maps.wait_for_timeout(900)
    assert maps.locator("#plan-a-trip-card").count() == 1
    maps.evaluate("history.pushState({}, '', 'https://www.google.com/maps/@35.49,138.78,14z')")
    maps.wait_for_timeout(900)
    assert maps.locator("#plan-a-trip-card").count() == 0

    assert not errors, errors
    ctx.close()
    print("extension test passed")
