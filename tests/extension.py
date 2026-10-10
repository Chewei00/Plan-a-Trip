"""End-to-end test of the Chrome extension, without network access: the real extension is loaded into Chromium, and
the two sites it runs on are stood in for (Google Maps by a blank page at the same address, SomeDay by the local
files, served at the site's real address so the extension recognises it).

    python3 -m http.server 8765 --bind 127.0.0.1 &     # from the repository root
    python3 tests/extension.py
"""
import json
import os
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
                                               device_scale_factor=int(os.environ.get("DSF", "1")),
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

    def counts():
        # the four counts in the bar: their numbers, and which one is rolling to a new number (-1: none)
        return maps.evaluate("""(() => { const p = [...document.getElementById('plan-a-trip-card').shadowRoot.querySelectorAll('.counts .pill')];
            return [p.map(x => x.querySelector('.now').textContent).join(' '), p.findIndex(x => x.querySelector('.num.roll'))]; })()""")
    def by_cat(title):
        ps = [x for t in trips(app)["trips"] if t["title"] == title for x in t["places"]]
        return [[x["name"] for x in ps if x["cat"] == c] for c in ["sight", "food", "stay", "transit"]]

    # the site, with a second trip made and left on screen
    app = ctx.new_page()
    app.on("pageerror", lambda e: errors.append(str(e)))
    app.goto(SITE + "index.html")
    app.wait_for_timeout(900)
    app.hover(".title"); app.wait_for_timeout(600); app.click(".tripbtn"); app.wait_for_timeout(200)
    app.click("#menu button:has-text('Create a new trip')"); app.wait_for_timeout(300)
    app.keyboard.type("東京 3 日"); app.keyboard.press("Enter"); app.wait_for_timeout(400)
    assert app.locator(".title").inner_text() == "東京 3 日"

    # Google Maps with the extension as installed: it is on, so the bar and the card for the place are there at once
    maps = ctx.new_page()
    maps.on("pageerror", lambda e: errors.append(str(e)))
    maps.goto(FUJIQ)
    maps.wait_for_timeout(1200)
    card = maps.locator("#plan-a-trip-card")
    assert card.count() == 1 and kept("pat_on") is True, "on from the moment it is installed"
    # pressing the button while another site is in front does nothing
    press_icon(SITE + "index.html")
    press_icon("https://www.google.com/search?q=maps")
    maps.wait_for_timeout(400)
    assert card.count() == 1 and kept("pat_on") is True
    # on a Google Maps tab it is the switch: off, the page is as Google made it; on again, the bar names the trip to
    # save to, and the card for the place is there
    press_icon()
    maps.wait_for_timeout(500)
    assert card.count() == 0 and kept("pat_on") is False and "turn on" in sw.evaluate("() => chrome.action.getTitle({})")
    press_icon()
    maps.wait_for_timeout(600)
    assert kept("pat_on") is True and "turn off" in sw.evaluate("() => chrome.action.getTitle({})")
    assert card.locator(".trip span").inner_text() == "東京 3 日"
    assert card.locator(".pend-name").inner_text() == "富士急樂園" and card.locator(".chip.on").inner_text() == "景點"
    assert card.locator(".xbtn").count() == 0 and card.locator(".dest").count() == 0, "no close button and no destination line on the card"
    # the categories are one row across the card, as on the site's save card: a pale track, a white piece under the one
    # in force, which slides when another is pressed; the card is no wider for it
    ROW = """(() => { const c = document.getElementById('plan-a-trip-card').shadowRoot.querySelector('.chips'), k = [...c.children], b = getComputedStyle(c, '::before'), r = c.getBoundingClientRect(), on = c.querySelector('.on');
        return { rows: new Set(k.map(e => Math.round(e.getBoundingClientRect().top))).size, w: Math.round(r.width), fits: k.every(e => e.scrollWidth <= e.clientWidth + 1), shown: b.opacity,
                 off: on ? +(r.left + parseFloat(b.left) + new DOMMatrix(b.transform).m41 - on.getBoundingClientRect().left).toFixed(1) : null }; })()"""
    assert maps.evaluate(ROW) == {"rows": 1, "w": 216, "fits": True, "shown": "1", "off": 0}, maps.evaluate(ROW)
    card.locator(".chip[data-cat='food']").click()
    maps.wait_for_timeout(100)
    assert -52 < maps.evaluate(ROW)["off"] < -3, ("on its way", maps.evaluate(ROW))
    maps.wait_for_timeout(350)
    assert maps.evaluate(ROW)["off"] == 0 and card.locator(".chip.on").inner_text() == "飲食"
    # and it starts from where it was, not from the first one each time
    AT = "(() => Math.round(new DOMMatrix(getComputedStyle(document.getElementById('plan-a-trip-card').shadowRoot.querySelector('.chips'), '::before').transform).m41))()"
    card.locator(".chip[data-cat='stay']").click()
    maps.wait_for_timeout(450)
    was = maps.evaluate(AT)
    card.locator(".chip[data-cat='transit']").click()
    seen = []
    for _ in range(5):
        maps.wait_for_timeout(40); seen.append(maps.evaluate(AT))
    maps.wait_for_timeout(300)
    assert was == 107 and maps.evaluate(AT) == 161 and all(was <= x <= 161 for x in seen) and seen[0] < 161, ("from 住宿 to 交通, never back towards 景點", was, seen)
    card.locator(".chip[data-cat='sight']").click()
    maps.wait_for_timeout(400)
    assert maps.evaluate(ROW)["off"] == 0 and card.locator(".chip.on").inner_text() == "景點"
    maps.mouse.move(5, 5)
    # in the bar, under the trip's name: how many places the trip has in each category (none yet in the new trip), an
    # icon and a number each, all the same whatever the number and whatever the card says. Sizes from Chewei's drawing
    assert counts() == ["0 0 0 0", -1], counts()
    bb = card.locator(".bar").bounding_box(); pb = card.locator(".pend").bounding_box()
    k = [card.locator(".counts .pill >> nth=%d" % i).bounding_box() for i in range(4)]
    assert bb["width"] == 236 and bb["height"] == 70 and pb["y"] == 64 + 70 + 8, (bb, pb)
    assert k[0]["height"] == 19 and k[0]["x"] == bb["x"] + 12 and bb["y"] + bb["height"] - (k[0]["y"] + k[0]["height"]) == 12 and 31 <= k[0]["width"] <= 36, (k[0], bb)
    assert abs(k[1]["x"] - (k[0]["x"] + k[0]["width"]) - 6) < 0.01, "6 apart"
    ic = card.locator(".counts .pill >> nth=0 >> svg").bounding_box(); nb = card.locator(".counts .pill >> nth=0 >> .num").bounding_box()
    assert ic["width"] == 10 and ic["x"] == k[0]["x"] + 6 and abs(nb["x"] - (ic["x"] + 10 + 4)) < 0.01 and nb["height"] == 17, (ic, nb)
    # words beside an icon are centred on it by their ink (checked on the picture: the middle row of the dark pixels of
    # the words against that of the icon), in the card's categories, the bar's name and its arrow
    def ink_gap(sel_words, sel_icon):
        import io
        from PIL import Image
        dsf = int(os.environ.get("DSF", "1"))
        def mid(sel):
            el = card.locator(sel)
            b = el.bounding_box()
            im = Image.open(io.BytesIO(maps.screenshot(clip={"x": b["x"] - 1, "y": b["y"] - 8, "width": b["width"] + 2, "height": b["height"] + 16}))).convert("L")
            rows = [y for y in range(im.height) if im.crop((0, y, im.width, y + 1)).getextrema()[0] < 150]
            return b["y"] - 8 + (rows[0] + rows[-1] + 1) / 2 / dsf
        return mid(sel_words) - mid(sel_icon)
    if maps.evaluate("CSS.supports('text-box', 'trim-both cap alphabetic')"):
        gaps = {"chip": ink_gap(".chip >> nth=1 >> .t", ".chip >> nth=1 >> svg"), "name": ink_gap(".trip .t", ".trip .chev")}
        assert all(abs(g) <= 0.75 for g in gaps.values()), ("words and icon share a middle line", gaps)
        if os.environ.get("SHOTS"):
            print("ink gaps", gaps)
            maps.screenshot(path=os.environ["SHOTS"] + "/ext-chips.png", clip={"x": 1440 - 16 - 236, "y": 64 + 70 + 8 + 30, "width": 236, "height": 40})
        assert card.locator(".chip .t").count() == 4 and "px" in (card.locator(".chip >> nth=0 >> .t").get_attribute("style") or "")
    # the figures are centred on the icon by their own height (where the browser can cut the text's box down to them)
    mid = maps.evaluate("""(() => { const p = document.getElementById('plan-a-trip-card').shadowRoot.querySelector('.counts .pill'), a = p.querySelector('svg').getBoundingClientRect(), b = p.querySelector('.now').getBoundingClientRect();
        return [CSS.supports('text-box', 'trim-both cap alphabetic'), a.top + a.height / 2, b.top + b.height / 2, b.height]; })()""")
    assert not mid[0] or (abs(mid[1] - mid[2]) < 0.01 and 6 < mid[3] < 10), ("the middle of the figures is the middle of the icon", mid)
    look = maps.evaluate("(() => [...document.getElementById('plan-a-trip-card').shadowRoot.querySelectorAll('.counts .pill')].map(x => { const s = getComputedStyle(x); return [s.color, s.borderTopColor, s.backgroundColor, s.fontSize].join('|'); }))()")
    assert set(look) == {"rgb(51, 51, 51)|rgb(210, 210, 210)|rgba(0, 0, 0, 0)|11px"}, ("one colour for all four, none lit", look)
    assert card.locator(".counts .pill svg").count() == 4 and card.locator(".counts [data-act]").count() == 0 and card.locator(".coll").count() == 0, "icons, not buttons, and nothing under the card"
    assert [card.locator(".pill >> nth=%d" % i).get_attribute("title") for i in range(4)] == ["景點", "飲食", "住宿", "交通"]
    box = card.locator(".wrap").bounding_box()
    bar, pend = card.locator(".trip").bounding_box(), card.locator(".pend").bounding_box()
    assert abs(box["x"] + box["width"] - (1440 - 16)) < 1 and box["y"] == 64 and box["width"] == 236 and bar["height"] == 36 and bar["y"] == 64, (box, bar, pend)

    # saving: the button says so, and the place arrives in that trip on the site, which is open in another tab
    # pressed, the button turns into "Added": it hops, its colour runs across, one label goes out and the other comes in
    card.locator(".savebtn").click()
    maps.wait_for_timeout(60)
    turning = maps.evaluate("""(() => { const b = document.getElementById('plan-a-trip-card').shadowRoot.querySelector('.savebtn'), s = getComputedStyle(b);
        return [b.className, b.disabled, [...b.querySelectorAll('span')].map(x => x.textContent), s.animationName, parseFloat(s.animationDelay) < 0, s.animationDuration, s.transform !== 'none' && new DOMMatrix(s.transform).m42 < 0]; })()""")
    assert turning == ["savebtn adding", True, ["Add to Travel Collection", "Added"], "added-bg, added-hop", True, "0.4s, 0.4s", True], turning
    assert counts() == ["1 0 0 0", 0], ("at the press the number of its category rolls to one more", counts())
    rolling = maps.evaluate("""(() => { const n = document.getElementById('plan-a-trip-card').shadowRoot.querySelector('.num.roll'), a = n.querySelector('.was'), b = n.querySelector('.now');
        return [a.textContent, getComputedStyle(a).animationName, getComputedStyle(b).animationName, getComputedStyle(b).animationDuration, parseFloat(getComputedStyle(b).animationDelay) < 0,
                getComputedStyle(n).overflow, new DOMMatrix(getComputedStyle(a).transform).m42 < 0, new DOMMatrix(getComputedStyle(b).transform).m42 > 0,
                getComputedStyle(n.closest('.pill')).transform]; })()""")
    assert rolling == ["0", "num-out", "num-in", "0.3s", True, "hidden", True, True, "none"], ("the old number on its way up, the new one coming from below, cut off by the pill; the pill itself does not move", rolling)
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
    maps.wait_for_timeout(300)
    if os.environ.get("SHOTS"): maps.screenshot(path=os.environ["SHOTS"] + "/ext-added.png", clip={"x": 1440 - 16 - 236 - 24, "y": 40, "width": 284, "height": 300})
    assert counts() == ["1 0 0 0", -1], ("taken by the site, it is still counted once, and the roll is over", counts())
    assert kept("pat_places") is None and kept("pat_counts")[[t for t in trips(app)["trips"] if t["title"] == "東京 3 日"][0]["id"]] == {"sight": 1, "food": 0, "stay": 0, "transit": 0}, "only counts are kept, not names"

    # the bar lists the trips; picking another one changes where places go, and "saved" is judged for that trip.
    # Its arrow points right and turns a quarter, to point down, while the list is open
    def turn():
        return maps.evaluate("getComputedStyle(document.getElementById('plan-a-trip-card').shadowRoot.querySelector('.bar .chev')).transform")
    assert turn() == "none"
    card.locator(".trip").click()
    maps.wait_for_timeout(400)
    assert turn() == "matrix(0, 1, -1, 0, 0, 0)"
    assert card.locator(".menu button").all_inner_texts() == ["富士山 ( 範例 )", "東京 3 日", "Open SomeDay"]
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
    card.locator(".menu button:has-text('富士山 ( 範例 )')").click()
    maps.wait_for_timeout(50)
    assert card.locator(".menu.out").count() == 1 and card.locator(".bar.open").count() == 0
    maps.wait_for_timeout(400)
    assert turn() == "none"
    assert card.locator(".menu").count() == 0 and card.locator(".trip span").inner_text() == "富士山 ( 範例 )"
    assert card.locator(".savebtn").inner_text() == "Add to Travel Collection", "not saved in this trip yet"
    # the counts are the chosen trip's, and changing trip does not roll them
    fuji = by_cat("富士山 ( 範例 )")
    assert counts() == [" ".join(str(len(x)) for x in fuji), -1], (counts(), fuji)
    if os.environ.get("SHOTS"): maps.screenshot(path=os.environ["SHOTS"] + "/ext-collection.png", clip={"x": 1440 - 16 - 236 - 24, "y": 40, "width": 284, "height": 300})
    card.locator(".trip").click(); maps.wait_for_timeout(250)
    card.locator(".menu button:has-text('東京 3 日')").click(); maps.wait_for_timeout(60)
    assert card.locator(".savebtn.adding").count() == 0 and card.locator(".savebtn").inner_text() == "Added", "changing trip does not play the turn"
    card.locator(".trip").click(); maps.wait_for_timeout(250)
    card.locator(".menu button:has-text('富士山 ( 範例 )')").click(); maps.wait_for_timeout(300)
    card.locator(".savebtn").click()
    app.wait_for_timeout(900)
    assert places(app, "富士山 ( 範例 )")[-1] == "富士急樂園" and app.locator(".title").inner_text() == "東京 3 日", "it goes to the chosen trip; the site stays on its own"

    # the choice holds when the site merely reloads, and follows the site when the trip on screen there changes
    app.reload()
    app.wait_for_timeout(1000)
    assert card.locator(".trip span").inner_text() == "富士山 ( 範例 )"
    app.hover(".title"); app.wait_for_timeout(600); app.click(".tripbtn"); app.wait_for_timeout(200)
    app.click("#menu button:has-text('富士山 ( 範例 )')"); app.wait_for_timeout(600)
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
    maps.evaluate("""() => { window.__out = 0; window.__seen = new Set(); const box = document.getElementById('plan-a-trip-card').shadowRoot.querySelector('.wrap');
        new MutationObserver(() => { const c = box.querySelector('.chips'); if (!c) return; if (c.classList.contains('none')) window.__out++; window.__seen.add(c.style.getPropertyValue('--i')); }).observe(box, {childList: true, subtree: true, attributes: true}); }""")
    go(HOTEL)
    maps.wait_for_timeout(700)
    assert card.locator(".pend-name").inner_text() == "Hotel Mystays 富士山" and card.locator(".chip.on").count() == 0, "the panel still shows the place before"
    # no category is in force yet, and the white piece stays where it was for the place before (景點), steady; when
    # the page says what this place is, it slides there. It never goes out and comes in again
    assert maps.evaluate(ROW)["shown"] == "1" and maps.evaluate(AT) == 0, "the piece waits where it was"
    panel("Hotel Mystays 富士山", "飯店")
    maps.wait_for_timeout(600)
    assert card.locator(".chip.on").inner_text() == "住宿"
    row = maps.evaluate(ROW)
    assert row["shown"] == "1" and row["off"] == 0 and maps.evaluate(AT) == 107 and maps.evaluate("window.__out") == 0, ("it slides under the one that is marked", row)
    # half a second after a place is opened Google writes its address again, the last digits of its position changed
    # (seen on the real site). It is the same place: the card does not start over, its category does not go out and
    # come in again, and the position kept is the later one
    maps.evaluate("""() => { window.__blink = 0; const box = document.getElementById('plan-a-trip-card').shadowRoot.querySelector('.wrap');
        new MutationObserver(() => { const c = box.querySelector('.chips'); if (!c || c.classList.contains('none') || !c.querySelector('.on')) window.__blink++; }).observe(box, {childList: true, subtree: true, attributes: true}); }""")
    go(place_url("Hotel Mystays 富士山", "0x6019600000000002:0x2", 35.4901006, 138.7811991))
    maps.wait_for_timeout(1500)
    assert maps.evaluate("window.__blink") == 0 and card.locator(".chip.on").inner_text() == "住宿" and maps.evaluate(ROW)["shown"] == "1", "the same place, not a new one"
    # another place of the same category: the piece does not move, go out or come in; it is as if nothing changed
    maps.evaluate("() => { window.__out = 0; window.__seen = new Set(); }")
    go(place_url("富士屋旅館", "0x6019600000000009:0x9", 35.5012, 138.7701)); panel("富士屋旅館", "日式旅館")
    maps.wait_for_timeout(1500)
    assert card.locator(".pend-name").inner_text() == "富士屋旅館" and card.locator(".chip.on").inner_text() == "住宿"
    assert maps.evaluate("[window.__out, [...window.__seen].join()]") == [0, "2"] and maps.evaluate(AT) == 107, "steady"
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
    bare = fresh.evaluate("""(() => { const r = document.getElementById('plan-a-trip-card').shadowRoot, p = [...r.querySelectorAll('.counts .pill')];
        return [p.map(x => x.textContent).join(' '), r.querySelectorAll('.pend').length]; })()""")
    assert bare == ["0 0 0 0", 0], ("with no place open the counts are there all the same", bare)

    assert not errors, errors
    ctx.close()
    print("extension test passed")
