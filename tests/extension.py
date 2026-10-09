"""End-to-end test of the Chrome extension, without network access: the real extension is loaded into Chromium, and
the two sites it runs on are stood in for (Google Maps by a blank page at the same address, SomeDay by the local
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
SITE = "https://chewei00.github.io/SomeDay/"
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
TYPES = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png"}

def place_url(name, fid, lat, lng):
    from urllib.parse import quote
    return f"https://www.google.com/maps/place/{quote(name)}/@{lat - 0.001},{lng - 0.002},17z/data=!3m1!4b1!4m6!3m5!1s{fid}!8m2!3d{lat}!4d{lng}!16zL20vMDJ?entry=ttu"

FUJIQ = place_url("富士急樂園", "0x60196005c1d9f19f:0x9a5a9d0b9cbd5c0b", 35.4869467, 138.7805513)
HOTEL = place_url("Hotel Mystays 富士山", "0x6019600000000002:0x2", 35.4901, 138.7812)
# A real address (2026-10-09) with two places in it: MOA 美術館 had been opened first, then this one was clicked on the
# map. The place that is open is the second; the first is still described in front of it.
PETER = ("https://www.google.com/maps/place/Peter+Luger+%E7%89%9B%E6%8E%92%E9%A4%A8+%E6%9D%B1%E4%BA%AC/@35.8136684,139.1672478,9.17z/"
         "data=!4m14!1m7!3m6!1s0x6019be7c174af88d:0x40dcc7041d54c2e1!2zTU9B576O6KGT6aSo!8m2!3d35.1092776!4d139.0751998!16zL20vMDVfNm5o"
         "!3m5!1s0x60188bd28536402d:0x45eca5f988b97909!8m2!3d35.6438736!4d139.7139535!16s%2Fg%2F11pwvm79pg?entry=ttu")
# the same shape, with a place that is already saved in front
def after(first, name, fid, lat, lng):
    from urllib.parse import quote
    return (f"https://www.google.com/maps/place/{quote(name)}/@35.49,138.78,14z/data=!4m14!1m7!3m6!1s{first[0]}!2zTU9B!8m2!3d{first[1]}!4d{first[2]}"
            f"!16zL20vMDVfNm5o!3m5!1s{fid}!8m2!3d{lat}!4d{lng}!16s%2Fg%2F11abc?entry=ttu")
HOTO = after(("0x60196005c1d9f19f:0x9a5a9d0b9cbd5c0b", 35.4869467, 138.7805513), "ほうとう不動", "0x6019600000000003:0x3", 35.499, 138.769)
# the stand-in for Google's panel: a heading with the place's name and, under it, the kind of place
PANEL = """<!doctype html><meta charset="utf-8"><title>Google 地圖</title><div role="main"><h1></h1><button jsaction="pane.category">主題樂園</button></div>
<script>var m=/\\/maps\\/place\\/([^\\/]+)/.exec(location.pathname);if(m)document.querySelector('h1').textContent=decodeURIComponent(m[1].replace(/\\+/g,' '));</script>"""

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
    ctx.route("https://www.google.com/maps/**", lambda r: r.fulfill(status=200, content_type="text/html", body=PANEL))
    ctx.route("https://www.google.com/maps", lambda r: r.fulfill(status=200, content_type="text/html", body=PANEL))
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
    app.click("#menu button:has-text('Create a new trip')"); app.wait_for_timeout(300)
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
    assert kept("pat_on") is True and "turn off" in sw.evaluate("() => chrome.action.getTitle({})")
    assert card.locator(".trip span").inner_text() == "東京 3 日"
    assert card.locator(".pend-name").inner_text() == "富士急樂園" and card.locator(".chip.on").inner_text() == "景點"
    assert card.locator(".xbtn").count() == 0 and card.locator(".dest").count() == 0, "no close button and no destination line on the card"
    box = card.locator(".wrap").bounding_box()
    bar, pend = card.locator(".bar").bounding_box(), card.locator(".pend").bounding_box()
    assert abs(box["x"] + box["width"] - (1440 - 16)) < 1 and box["y"] == 64 and box["width"] == 236 and bar["height"] == 36 and pend["y"] == 64 + 36 + 8, (box, bar, pend)

    # saving: the button says so, and the place arrives in that trip on the site, which is open in another tab
    # pressed, the button turns into "Added": its colour runs across while one label goes out and the other comes in
    card.locator(".savebtn").click()
    maps.wait_for_timeout(60)
    turning = maps.evaluate("""(() => { const b = document.getElementById('plan-a-trip-card').shadowRoot.querySelector('.savebtn'), s = getComputedStyle(b);
        return [b.className, b.disabled, [...b.querySelectorAll('span')].map(x => x.textContent), s.animationName, parseFloat(s.animationDelay) < 0]; })()""")
    assert turning == ["savebtn adding", True, ["Add to Travel Collection", "Added"], "added-bg", True], turning
    maps.wait_for_timeout(450)
    assert card.locator(".savebtn.adding").count() == 0, "and is then the plain Added button"
    assert card.locator(".savebtn").inner_text() == "Added" and card.locator(".savebtn").is_disabled()
    look = maps.evaluate("(() => { const b = document.getElementById('plan-a-trip-card').shadowRoot.querySelector('.savebtn'), s = getComputedStyle(b); return [s.backgroundColor, s.color]; })()")
    assert look == ["rgb(229, 229, 229)", "rgba(0, 0, 0, 0.4)"], look
    app.wait_for_timeout(800)
    assert app.locator(".card.focus .cname").inner_text() == "富士急樂園"
    saved = [t for t in trips(app)["trips"] if t["title"] == "東京 3 日"][0]["places"][-1]
    assert saved["cat"] == "sight" and saved["lat"] == 35.486947 and saved["lng"] == 138.780551 and saved["fid"] == "0x60196005c1d9f19f:0x9a5a9d0b9cbd5c0b", saved
    assert "gid" not in saved, "a place from the Google Maps site is not a Places API result"

    # the bar lists the trips; picking another one changes where places go, and "saved" is judged for that trip.
    # Its arrow points right and turns a quarter, to point down, while the list is open
    def turn():
        return maps.evaluate("getComputedStyle(document.getElementById('plan-a-trip-card').shadowRoot.querySelector('.bar .chev')).transform")
    assert turn() == "none"
    card.locator(".trip").click()
    maps.wait_for_timeout(400)
    assert turn() == "matrix(0, 1, -1, 0, 0, 0)"
    assert card.locator(".menu button").all_inner_texts() == ["富士山 5 日", "東京 3 日", "Open SomeDay"]
    assert card.locator(".menu button >> nth=1 >> .rck").count() == 1 and card.locator(".menu button >> nth=0 >> .rck").count() == 0
    assert card.locator(".menu .mico").count() == 2 and card.locator(".menu button >> nth=2 >> .dmark").count() == 1, "a pin for each trip, the site's icon for the site"
    menu = card.locator(".menu").bounding_box()
    assert menu["width"] == 236 and maps.evaluate("getComputedStyle(document.getElementById('plan-a-trip-card').shadowRoot.querySelector('.sep')).backgroundColor") == "rgb(229, 229, 229)"
    # the arrow on the last row grows when the row is pointed at
    arrow = card.locator(".menu .arr")
    assert abs(arrow.bounding_box()["width"] - 10.5) < 0.01 and card.locator(".menu.pop").count() == 1, "the menu comes in"
    shaft = card.locator(".menu .arr i").bounding_box()
    assert shaft["height"] == 1.5 and (shaft["y"] * 2) % 1 == 0, shaft
    card.locator(".menu button >> nth=2").hover(); maps.wait_for_timeout(700)
    assert abs(arrow.bounding_box()["width"] - 16.6) < 0.01
    # closing, the list goes out the way it came in, and the arrow turns back
    card.locator(".menu button:has-text('富士山 5 日')").click()
    maps.wait_for_timeout(50)
    assert card.locator(".menu.out").count() == 1 and card.locator(".bar.open").count() == 0
    maps.wait_for_timeout(400)
    assert turn() == "none"
    assert card.locator(".menu").count() == 0 and card.locator(".trip span").inner_text() == "富士山 5 日"
    assert card.locator(".savebtn").inner_text() == "Add to Travel Collection", "not saved in this trip yet"
    card.locator(".trip").click(); maps.wait_for_timeout(250)
    card.locator(".menu button:has-text('東京 3 日')").click(); maps.wait_for_timeout(60)
    assert card.locator(".savebtn.adding").count() == 0 and card.locator(".savebtn").inner_text() == "Added", "changing trip does not play the turn"
    card.locator(".trip").click(); maps.wait_for_timeout(250)
    card.locator(".menu button:has-text('富士山 5 日')").click(); maps.wait_for_timeout(300)
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

    # Google Maps moves between places without loading a page. Its panel is drawn a moment after the address changes:
    # the card shows the new name at once, in the same spot, and marks the category once, when the panel has caught up
    def go(url):
        maps.evaluate("u => history.pushState({}, '', u)", url)
    def panel(name, kind):
        maps.evaluate("([n, k]) => { document.querySelector('h1').textContent = n; document.querySelector('button[jsaction]').textContent = k; }", [name, kind])
    spot = card.locator(".pend").bounding_box()
    maps.evaluate("""() => { window.__gone = 0; const box = document.getElementById('plan-a-trip-card').shadowRoot.querySelector('.wrap');
        new MutationObserver(() => { if (!box.querySelector('.pend')) window.__gone++; }).observe(box, {childList: true, subtree: true}); }""")
    go(HOTEL)
    maps.wait_for_timeout(700)
    assert card.locator(".pend-name").inner_text() == "Hotel Mystays 富士山" and card.locator(".chip.on").count() == 0, "the panel still shows the place before"
    panel("Hotel Mystays 富士山", "飯店")
    maps.wait_for_timeout(400)
    assert card.locator(".chip.on").inner_text() == "住宿"
    # between two places the address names no place for a moment: the card does not go away and come back
    go("https://www.google.com/maps/@35.49,138.78,14z")
    maps.wait_for_timeout(700)
    assert card.locator(".pend").count() == 1
    # one place open and another clicked on the map: the address describes both, and the one in front is already saved.
    # The card is for the place that is open, which is not saved
    go(HOTO); panel("ほうとう不動", "餺飥麵店")
    maps.wait_for_timeout(900)
    assert card.locator(".pend-name").inner_text() == "ほうとう不動" and card.locator(".savebtn").inner_text() == "Add to Travel Collection"
    assert card.locator(".chip.on").inner_text() == "飲食"
    go(PETER)
    maps.wait_for_timeout(700)
    assert card.locator(".pend-name").inner_text() == "Peter Luger 牛排館 東京" and card.locator(".chip.on").count() == 0
    card.locator(".savebtn").click()      # pressed before the panel caught up: the name decides the category
    app.wait_for_timeout(900)
    got = [t for t in trips(app)["trips"] if t["title"] == "東京 3 日"][0]["places"][-1]
    assert (got["name"], got["lat"], got["lng"], got["fid"], got["cat"]) == ("Peter Luger 牛排館 東京", 35.643874, 139.713954, "0x60188bd28536402d:0x45eca5f988b97909", "food"), got
    assert card.locator(".savebtn").inner_text() == "Added"
    after_moves = card.locator(".pend").bounding_box()
    assert maps.evaluate("window.__gone") == 0 and (after_moves["x"], after_moves["y"]) == (spot["x"], spot["y"]), "the card stayed where it was throughout"
    # no place open any more: after a second the card goes, the bar stays
    go("https://www.google.com/maps/@35.49,138.78,14z")
    maps.wait_for_timeout(1800)
    assert card.locator(".pend").count() == 0 and card.locator(".bar").count() == 1, "no place open: the bar stays, the card goes"
    go(HOTEL); panel("Hotel Mystays 富士山", "飯店")
    maps.wait_for_timeout(900)
    assert card.locator(".pend-name").inner_text() == "Hotel Mystays 富士山" and card.locator(".chip.on").inner_text() == "住宿"

    # with the site closed, a saved place waits in the extension and is there the next time the site is opened
    app.close()
    card.locator(".savebtn").click()
    maps.wait_for_timeout(450)
    assert card.locator(".savebtn").inner_text() == "Added" and len(kept("pat_inbox")) == 1
    # "Open SomeDay" opens the site when it is not open...
    before = len(ctx.pages)
    card.locator(".trip").click(); maps.wait_for_timeout(200)
    with ctx.expect_page() as opened:
        card.locator(".menu button:has-text('Open SomeDay')").click()
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
    card.locator(".menu button:has-text('Open SomeDay')").click()
    maps.wait_for_timeout(600)
    assert len(ctx.pages) == before + 1
    assert sw.evaluate("() => chrome.tabs.query({active: true}).then(ts => ts.some(t => (t.url || '').includes('/SomeDay/')))")

    # on is remembered across a reload; pressing the button again turns everything off, and that is remembered too
    maps.reload()
    maps.wait_for_timeout(1200)
    assert card.locator(".bar").count() == 1 and card.locator(".pend-name").inner_text() == "Hotel Mystays 富士山"
    press_icon()
    maps.wait_for_timeout(500)
    assert maps.locator("#plan-a-trip-card").count() == 0 and kept("pat_on") is False and "turn on" in sw.evaluate("() => chrome.action.getTitle({})")
    maps.reload()
    maps.wait_for_timeout(1200)
    assert maps.locator("#plan-a-trip-card").count() == 0

    # the empty Travel Collection on the site opens Google Maps and switches the extension on (it was off just now)
    app.bring_to_front()
    app.hover(".title"); app.wait_for_timeout(600); app.click(".tripbtn"); app.wait_for_timeout(200)
    app.click("#menu button:has-text('Create a new trip')"); app.wait_for_timeout(300)
    app.keyboard.type("空的"); app.keyboard.press("Enter"); app.wait_for_timeout(400)
    with ctx.expect_page() as opened:
        app.click(".collect")
    fresh = opened.value
    fresh.wait_for_timeout(1200)
    assert fresh.url.startswith("https://www.google.com/maps") and kept("pat_on") is True and "turn off" in sw.evaluate("() => chrome.action.getTitle({})")
    assert fresh.locator("#plan-a-trip-card .trip span").inner_text() == "空的", "the bar is there, on the trip that was on screen"

    assert not errors, errors
    ctx.close()
    print("extension test passed")
