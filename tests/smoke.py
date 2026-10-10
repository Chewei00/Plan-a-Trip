"""Smoke test. The Google Maps library is replaced by tests/mock-googlemaps.js (same camera maths, no rendering), and
the place search and the routing service are answered with canned data, so this runs without network access.

    python3 -m http.server 8765 --bind 127.0.0.1 &     # from the repository root
    python3 tests/smoke.py
"""
import json
import pathlib
import time
import os
from playwright.sync_api import sync_playwright

MOCK = (pathlib.Path(__file__).parent / "mock-googlemaps.js").read_text(encoding="utf-8")
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
POINTS = {"gid-oishi": (35.5233, 138.7468), "gid-hoto": (35.4990, 138.7690)}

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 800})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    ctx.route("https://maps.googleapis.com/maps/api/js*", lambda r: r.fulfill(status=200, content_type="text/javascript", body=MOCK))
    ctx.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    ctx.route("https://www.google.com/maps**", lambda r: r.fulfill(status=200, content_type="text/html", body="<title>Google Maps</title>"))

    calls = []

    # Places API (New) stand-ins: two suggestions for any text, and a position for each of them
    def places(route):
        req = route.request
        if req.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS)
        calls.append(req.method + " " + req.url)
        if req.url.endswith("places:autocomplete"):
            asked.append(req.post_data_json)
            body = {"suggestions": [
                {"placePrediction": {"placeId": "gid-oishi", "types": ["park", "tourist_attraction", "food"],
                                     "structuredFormat": {"mainText": {"text": "大石公園"}, "secondaryText": {"text": "日本山梨縣富士河口湖町 Oishi, 2585-85"}}}},
                {"placePrediction": {"placeId": "gid-hoto", "types": ["noodle_shop", "restaurant", "point_of_interest"],
                                     "structuredFormat": {"mainText": {"text": "ほうとう不動"}, "secondaryText": {"text": "日本山梨縣富士河口湖町 Funatsu, 3631-2"}}}}]}
        else:
            lat, lng = POINTS[req.url.split("/places/")[1].split("?")[0]]
            body = {"location": {"latitude": lat, "longitude": lng}}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body), headers=CORS)
    asked = []
    ctx.route("https://places.googleapis.com/**", places)

    # Geoapify stand-in: a route that detours through a midpoint and takes 20 minutes
    def geoapify(route):
        url = route.request.url
        calls.append("GET " + url)
        a, b = [[float(v) for v in w.split(",")] for w in url.split("waypoints=")[1].split("&")[0].replace("%7C", "|").split("|")]
        mid = [(a[1] + b[1]) / 2 + 0.01, (a[0] + b[0]) / 2]
        body = {"features": [{"geometry": {"type": "MultiLineString", "coordinates": [[[a[1], a[0]], mid, [b[1], b[0]]]]},
                              "properties": {"time": 1200, "distance": 1500}}]}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body), headers=CORS)
    ctx.route("https://api.geoapify.com/**", geoapify)

    def count(part):
        return len([u for u in calls if part in u])

    page.goto("http://127.0.0.1:8765/index.html")
    page.wait_for_timeout(700)

    assert page.locator(".day").count() == 2, "sample trip has two days"
    assert page.locator(".card").count() == 7, "seven sights in the default category"
    # the sample's pictures are files of the site: five of the sights have one, shown whole in the card's frame, never stretched
    pics = page.evaluate("[].map.call(document.querySelectorAll('.card'),c=>{var i=c.querySelector('.ph img');"
                         "return i?[i.getAttribute('src'),i.complete&&i.naturalWidth,i.naturalHeight,getComputedStyle(i).objectFit]:null})")
    assert [p[0] if p else None for p in pics] == ["img/sample/kubota.jpg", None, "img/sample/kawaguchiko-museum.jpg", "img/sample/chureito.jpg",
                                                   None, "img/sample/fuji-suruga.jpg", "img/sample/iwamotoyama.jpg"], pics
    assert all(p[1:] == [264, 184, "cover"] for p in pics if p), pics
    assert page.locator(".mk .daytag").count() == 2, "overview shows one tag per day"
    assert page.evaluate("__map.opts.isFractionalZoomEnabled && __map.opts.disableDefaultUI"), "map is created with the app's own controls"
    first = page.evaluate("__map.z")

    # opening a day glides the map there over one second, frame by frame
    page.evaluate("__map.moves.length = 0")
    page.click(".daypill >> nth=0")
    page.wait_for_timeout(1400)
    assert page.locator(".day.sel").count() == 1
    assert page.locator(".npin").count() == 4, "open day shows numbered pins"
    moves = page.evaluate("__map.moves")
    span = moves[-1]["t"] - moves[0]["t"]
    assert len(moves) > 20 and 850 < span < 1150, f"the glide takes about a second ({len(moves)} frames, {span:.0f} ms)"
    assert moves[-1]["zoom"] > first + 1, "and ends zoomed in on the day"
    # the day's four pins end up inside the part of the map the panels leave free
    box = page.evaluate("[...document.querySelectorAll('.npin')].map(e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]})")
    lp_right = page.evaluate("document.getElementById('lp').getBoundingClientRect().right")
    tp_bottom = page.evaluate("document.getElementById('tp').getBoundingClientRect().bottom")
    assert all(lp_right < x < 1440 - 60 and tp_bottom < y < 800 - 64 for x, y in box), box

    page.click(".npin >> nth=1")
    page.wait_for_timeout(300)
    assert page.locator(".stop.focus").count() == 1 and page.locator(".card.focus").count() == 1, "a pin selects its place (and the map's own click report does not undo it)"

    page.mouse.click(900, 650)
    page.wait_for_timeout(300)
    assert page.locator(".stop.focus").count() == 0, "clicking the map clears the selection"

    # the zoom buttons move one level, quickly
    z = page.evaluate("__map.z")
    page.click("[data-act=zoom-in]")
    page.wait_for_timeout(500)
    assert abs(page.evaluate("__map.z") - (z + 1)) < 1e-6

    # routes: every road leg is asked once, drawn through the midpoint, and its time shown
    routes = [u for u in calls if "/routing" in u]
    assert len(routes) == 4 and len(set(routes)) == 4, "one request per road leg, no repeats"
    assert page.evaluate("__map.lines.filter(l=>l.o.zIndex===2)[0].o.path.length") == 3, "leg follows the returned route"
    assert page.evaluate("__map.lines.length") == 6, "three legs of the open day, each a casing and a line"
    assert page.locator(".day.sel .legtime").all_inner_texts() == ["20 m", "20 m", "20 m"]

    # editing the last checklist line of a place: the whole edit box shows (its lower edge used to be cut away)
    WHOLE = "(()=>{var t=document.querySelector('textarea.ckedit'),b=t.getBoundingClientRect(),c=t.closest('.entsin,.memo-ents').getBoundingClientRect();return b.height===26&&b.top>=c.top&&b.bottom<=c.bottom})()"
    page.dblclick(".day.sel .stop:nth-child(2) .ck [data-edit]")
    page.wait_for_timeout(300)
    assert page.evaluate(WHOLE), "the edit box is not cut off"
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    assert page.locator(".edit").count() == 0

    # every menu: an icon in front of every row, the words say what they act on, and the one in force has a round tick
    def menu_of(sel, n=0):
        page.evaluate("([s,n])=>document.querySelectorAll(s)[n].click()", [sel, n])
        page.wait_for_timeout(300)
        rows = page.evaluate("[].map.call(document.querySelectorAll('#menu button'),b=>[b.innerText.trim(),"
                             "b.firstElementChild.tagName.toLowerCase()==='svg'?Math.round(b.firstElementChild.getBoundingClientRect().left-b.getBoundingClientRect().left):-1,"
                             "Math.round(b.querySelector('span').getBoundingClientRect().left-b.getBoundingClientRect().left),b.querySelectorAll('.rck').length])")
        assert all(r[1] in (7, 8) and r[2] == 29 for r in rows), "an icon in the same place and the words in one column: %s" % rows
        assert page.locator("#menu .ck").count() == 0, "one kind of tick only"
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)
        return [r[0] + (" *" if r[3] else "") for r in rows]
    assert menu_of(".more[data-menu=stop]", 1) == ["Rename", "Add a note", "Add a checklist", "Delete from day"]
    assert menu_of(".more[data-menu=note]") == ["Edit note", "Delete note"]
    assert menu_of(".more[data-menu=check]") == ["Edit checklist", "Edit link", "Remove link", "Add a file", "Delete checklist"]
    assert menu_of(".more[data-menu=day]") == ["Delete day"]
    assert menu_of(".modebtn") == ["步行 *", "自行車", "汽車", "電車或公車", "船", "飛機"]
    assert menu_of(".more[data-menu=card]") == ["景點 *", "飲食", "住宿", "交通", "Clear image", "Delete place"]

    # the day filter of the Travel Collection: all, one day, or in no day yet; together with the category
    def names():
        return page.locator(".card .cname").all_inner_texts()
    def colour(sel):
        return page.evaluate("s=>getComputedStyle(document.querySelector(s)).color", sel)
    quiet = colour("#dayf")
    assert page.inner_text("#dayf").strip() == "All" and page.locator("#dayf svg.mico").count() == 1 and len(names()) == 7
    assert page.evaluate("document.getElementById('dayf').firstElementChild.tagName.toLowerCase()") == "svg", "the mark comes first, then the words"
    page.click("#dayf")
    page.wait_for_timeout(300)
    assert page.get_attribute("#dayf", "aria-expanded") == "true"
    assert [b.strip() for b in page.locator("#menu button").all_inner_texts()] == ["All", "Day 1", "Day 2", "Not planned"]
    assert page.locator("#menu button > svg.mico").count() == 4 and page.locator("#menu button >> nth=0 >> .rck").count() == 1
    edge = page.evaluate("[document.getElementById('menu').getBoundingClientRect().right,document.getElementById('dayf').getBoundingClientRect().right]")
    assert abs(edge[0] - edge[1]) < 1, "the menu hangs from the button's right end: %s" % edge
    # its icons are drawn on the pixel grid: shown at 11, one to one, on whole pixels, half a pixel under the row's middle
    sharp = page.evaluate("[].map.call(document.querySelectorAll('#menu button'),b=>{var i=b.querySelector('svg').getBoundingClientRect(),r=b.getBoundingClientRect();"
                          "return [i.width,i.height,i.left%1,i.top%1,(i.top+i.height/2)-(r.top+r.height/2)]})")
    assert all(s == [11, 11, 0, 0, 0.5] for s in sharp), sharp
    page.click("#menu button:has-text('Day 2')")
    page.wait_for_timeout(300)
    assert names() == ["富士箱根伊豆國立公園", "岩本山公園"] and page.inner_text("#dayf").strip() == "Day 2"
    assert page.get_attribute("#dayf", "aria-expanded") == "false" and not page.locator("#menu").is_visible()
    page.mouse.move(700, 600)
    assert colour("#dayf") == quiet == "rgb(51, 51, 51)", "the button looks the same with a filter on"
    page.click(".chip >> nth=1")
    page.wait_for_timeout(150)
    assert names() == [] and page.locator(".card-empty").count() == 0 and page.inner_html("#cards") == "", "food on Day 2: nothing, left blank"
    page.click(".chip >> nth=0")
    page.click("#dayf")
    page.wait_for_timeout(250)
    assert page.locator("#menu button >> nth=2 >> .rck").count() == 1, "the day in force is ticked"
    page.click("#menu button:has-text('Not planned')")
    page.wait_for_timeout(300)
    assert names() == ["河口湖音樂森林美術館", "新倉山淺間公園", "山中湖花都公園"] and page.inner_text("#dayf").strip() == "Not planned"
    # picking a place whose card the filter hides brings everything back, so the card can be seen
    page.click(".day.sel .stop:nth-child(1) .sname")
    page.wait_for_timeout(300)
    assert page.inner_text("#dayf").strip() == "All" and len(names()) == 7 and page.locator(".card.focus .cname").inner_text() == "久保田一竹美術館"
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    assert page.locator(".card.focus").count() == 0

    # search: typing asks the place search once after a pause, in Traditional Chinese, biased to where the map is looking
    page.fill("#q", "ほうとう")
    page.wait_for_timeout(700)
    assert count("places:autocomplete") == 1
    assert asked[0]["input"] == "ほうとう" and asked[0]["languageCode"] == "zh-TW" and asked[0]["sessionToken"] and "locationBias" in asked[0]
    assert "ほうとう不動" in page.locator("#results").inner_text()
    assert page.locator("#results button").count() == 2, "only places from the map search are listed"
    assert page.locator("#results button >> nth=0").locator(".tag").inner_text() == "山梨縣富士河口湖町", "the town tells same-named places apart"
    page.fill("#q", "富士")   # matches several saved places by name, but the stand-in search still answers with its two
    page.wait_for_timeout(700)
    assert page.locator("#results .tag:has-text('Added')").count() == 0, "saved places are not mixed in on their own"
    assert asked[1]["sessionToken"] == asked[0]["sessionToken"], "one search session until a place is picked"

    # picking a suggestion asks for its position, then offers to save it with a guessed category
    page.click("#results button:has-text('ほうとう不動')")
    page.wait_for_timeout(300)
    details = [u for u in calls if "/places/gid-hoto" in u]
    assert len(details) == 1 and asked[0]["sessionToken"] in details[0], "the pick closes the search session"
    assert page.locator(".pend .pend-name").inner_text() == "ほうとう不動"
    assert page.locator(".pend .chip.on").inner_text() == "飲食"
    # its categories are one row across the card, the white piece under the one in force; picking another slides the
    # piece there without the card being drawn again
    ROW = ("(()=>{var c=document.querySelector('.pend .chips'),k=[].slice.call(c.children),b=getComputedStyle(c,'::before'),on=c.querySelector('.on').getBoundingClientRect(),r=c.getBoundingClientRect();"
           "return {rows:new Set(k.map(e=>Math.round(e.getBoundingClientRect().top))).size,w:Math.round(r.width),off:+(r.left+parseFloat(b.left)+new DOMMatrix(b.transform).m41-on.left).toFixed(1)}})()")
    assert page.evaluate(ROW) == {"rows": 1, "w": 216, "off": 0}, page.evaluate(ROW)
    page.evaluate("window.__pend=document.querySelector('.pend')")
    page.click(".pend .chip[data-cat='stay']"); page.wait_for_timeout(400)
    assert page.locator(".pend .chip.on").inner_text() == "住宿" and page.evaluate(ROW)["off"] == 0
    assert page.evaluate("window.__pend===document.querySelector('.pend')"), "the same card"
    if os.environ.get("SHOTS"):
        page.locator(".pend").screenshot(path=os.environ["SHOTS"] + "/pend.png")
    page.click(".pend .chip[data-cat='food']"); page.wait_for_timeout(400)
    assert page.locator(".pend .chip.on").inner_text() == "飲食"
    # (with the day filter on a day, to see that adding a place brings everything back: the new card must show)
    page.click("#dayf")
    page.wait_for_timeout(250)
    page.click("#menu button:has-text('Day 1')")
    page.wait_for_timeout(250)
    assert page.inner_text("#dayf").strip() == "Day 1"
    # pressed, the place is saved and its card is there at once; meanwhile the button hops into "Added", and the save
    # card closes a moment later, leaving the place's pin and name
    page.click(".savebtn")
    page.wait_for_timeout(80)
    assert page.inner_text("#dayf").strip() == "All" and page.locator(".card.focus .cname").inner_text() == "ほうとう不動"
    hop = page.evaluate("""(() => { const b = document.querySelector('.pend .savebtn'), s = getComputedStyle(b);
        return [b.className, b.disabled, [...b.querySelectorAll('span')].map(x => x.textContent), s.animationName, s.animationDuration,
                s.transform !== 'none' && new DOMMatrix(s.transform).m42 < 0, document.querySelectorAll('.pend [data-act]:not([disabled])').length]; })()""")
    assert hop == ["savebtn adding", True, ["Add to Travel Collection", "Added"], "added-bg, added-hop", "0.4s, 0.4s", True, 0], hop
    assert any(x["name"] == "ほうとう不動" for x in json.loads(page.evaluate("localStorage.getItem('plan-a-trip:v1')"))["trips"][0]["places"]), "saved straight away"
    assert page.locator(".card.focus .cname").inner_text() == "ほうとう不動", "and shown in the collection straight away"
    assert page.locator(".pend").count() == 1 and page.locator(".flabel").count() == 0 and page.locator(".fpin").count() == 1, "one pin, the save card's"
    page.wait_for_timeout(250)
    assert page.locator(".pend").count() == 1, "the card is still up while the button lands"
    page.wait_for_timeout(600)
    assert page.locator(".pend").count() == 0 and page.locator(".flabel").inner_text() == "ほうとう不動", "then it closes, leaving the pin and the name"
    assert "show" not in (page.get_attribute("#toast", "class") or ""), "with no line at the foot"
    assert page.locator(".card.focus .cname").inner_text() == "ほうとう不動"
    saved = [x for x in json.loads(page.evaluate("localStorage.getItem('plan-a-trip:v1')"))["trips"][0]["places"] if x["name"] == "ほうとう不動"][0]
    assert saved["gid"] == "gid-hoto" and saved["lat"] == 35.499 and saved["at"] > 0, "the saved place keeps Google's ID and when its position was fetched"

    # searching again marks it as saved (by ID), with a new session
    page.fill("#q", "ほうとう不")
    page.wait_for_timeout(700)
    assert page.locator("#results button:has-text('ほうとう不動') .tag").inner_text() == "Added"
    assert page.locator("#results button:has-text('大石公園') .tag").inner_text() != "Added"
    assert asked[-1]["sessionToken"] != asked[0]["sessionToken"]
    page.keyboard.press("Escape")

    # a position older than 25 days is fetched again when the app opens; everything else in the trip is untouched
    before = len(calls)
    old = int(time.time() * 1000) - 26 * 24 * 3600 * 1000
    page.evaluate("""old => { const d = JSON.parse(localStorage.getItem('plan-a-trip:v1'));
        const p = d.trips[0].places.find(x => x.gid === 'gid-hoto'); p.at = old; p.lat = 35.1; localStorage.setItem('plan-a-trip:v1', JSON.stringify(d)); }""", old)
    page.reload()
    page.wait_for_timeout(900)
    fresh = [u for u in calls[before:] if "/places/gid-hoto" in u]
    assert len(fresh) == 1 and "sessionToken" not in fresh[0], "one refresh request, outside any search session"
    data = json.loads(page.evaluate("localStorage.getItem('plan-a-trip:v1')"))
    assert data["v"] == 2 and len(data["trips"]) == 1 and data["current"] == data["trips"][0]["id"]
    data = data["trips"][0]
    again = [x for x in data["places"] if x.get("gid") == "gid-hoto"][0]
    assert again["lat"] == 35.499 and again["at"] > old, "position and date are refreshed"
    assert len(data["places"]) == 14 and len(data["days"]) == 2, "the saved trip is kept"
    assert count("/routing") == 4, "kept routes are not asked again after a reload"

    # ---------------------------------------------------------------- several trips
    def stored():
        return json.loads(page.evaluate("localStorage.getItem('plan-a-trip:v1')"))
    def css(sel, prop):
        return page.evaluate("([s,p]) => getComputedStyle(document.querySelector(s))[p]", [sel, prop])
    def open_trips():
        page.hover(".title")
        page.wait_for_timeout(600)
        page.click(".tripbtn")
        page.wait_for_timeout(200)

    # a save from before there were several trips was one trip object: it becomes the first trip, nothing lost
    page.evaluate("() => { const d = JSON.parse(localStorage.getItem('plan-a-trip:v1')); const t = d.trips[0]; delete t.id; localStorage.setItem('plan-a-trip:v1', JSON.stringify(t)); }")
    page.reload()
    page.wait_for_timeout(800)
    assert page.locator(".title").inner_text() == "富士山 ( 範例 )" and page.locator(".day").count() == 2
    assert page.locator(".card").count() == 7 and page.evaluate("__map.lines.length") == 8, "its places and routes are all there"

    # ---- the trip's own notes, at the foot of the left panel ----
    def memo():
        return page.evaluate("""(() => { const lp = document.getElementById('lp').getBoundingClientRect(), m = document.getElementById('memo').getBoundingClientRect();
            const top = s => [...document.querySelectorAll(s)].map(x => { const r = x.getBoundingClientRect(); return [r.top - lp.top, r.height]; });
            return { line: m.top - lp.top, foot: lp.bottom - m.bottom, ents: top('#memoents > .ent'), adds: top('.memoadd'), list: document.getElementById('lpscroll').getBoundingClientRect().height }; })()""")
    # closed: only the handle, a line 24 above the panel's foot with the arrow under it
    shut = memo()
    def cur():
        d = stored()
        return [t for t in d["trips"] if t["id"] == d["current"]][0]
    assert (shut["line"], shut["foot"]) == (768 - 24, 0), shut
    assert css(".memo-body", "visibility") == "hidden" and css(".memo-handle svg", "transform") == "none"
    # opening is a movement, not a jump: part-way through, the line is between the two places, and the two "Add" rows
    # are still coming up from under the panel's foot, keeping their distance below the line
    page.click("#memoh")
    page.wait_for_timeout(180)
    mid = memo()
    assert 664 < mid["line"] < 744 and mid["adds"][0][0] - mid["line"] == 30 and css(".memo-in", "opacity") == "1", mid
    page.wait_for_timeout(600)
    empty = memo()
    assert empty["line"] == 664 and empty["adds"] == [[694, 30], [724, 30]] and empty["ents"] == [], empty
    assert empty["list"] == shut["list"] - 80, "the list above gives up exactly that much"
    assert css(".memo-handle svg", "transform") == "matrix(-1, 0, 0, -1, 0, 0)", "the arrow turns over"
    assert page.locator(".memoadd").all_inner_texts() == ["Add a note", "Add a checklist"]
    # a note and a checklist, written the way a stop's are
    page.click(".memoadd >> nth=0"); page.wait_for_timeout(200)
    assert page.evaluate("document.activeElement.className") == "edit nbedit"
    page.keyboard.type("行前準備事情事情事情事情事情事情事情事情事情事情"); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    page.click(".memoadd >> nth=1"); page.wait_for_timeout(200)
    assert page.evaluate(WHOLE), "nor is it in the trip's notes"
    page.keyboard.type("辦簽證"); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    if page.locator(".edit").count():
        page.keyboard.press("Escape"); page.wait_for_timeout(200)
    two = memo()
    assert two["line"] == 566 and two["ents"] == [[596, 52], [656, 16]] and two["adds"] == [[694, 30], [724, 30]], two
    assert [e["k"] + ":" + e["text"][:4] for e in cur()["memo"]["plan"]] == ["n:行前準備", "c:辦簽證"]
    assert page.locator(".mk").count() > 0 and page.locator(".day.sel").count() == 0, "nothing on the map or among the days is touched"
    # ticking, and the menu of an entry (it shows at the right end of the row, as in a day)
    page.click("#memoents .cbox"); page.wait_for_timeout(200)
    assert cur()["memo"]["plan"][1]["done"] is True and page.locator("#memoents .ck.done").count() == 1
    row = page.locator("#memoents .ck").bounding_box()
    page.mouse.move(row["x"] + row["width"] - 6, row["y"] + 8); page.wait_for_timeout(600)
    page.click("#memoents .ck .more"); page.wait_for_timeout(300)
    assert page.locator("#menu button").all_inner_texts() == ["Edit checklist", "Add a link", "Add a file", "Delete checklist"]
    page.click("#menu button:has-text('Add a link')"); page.wait_for_timeout(200)
    page.keyboard.type("visa.example.org/apply"); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    assert cur()["memo"]["plan"][1]["link"] == "https://visa.example.org/apply" and page.locator("#memoents a.ckic").count() == 1
    # a double click edits in place
    page.dblclick("#memoents .cktext"); page.wait_for_timeout(200)
    assert page.evaluate("document.activeElement.className") == "edit ckedit"
    page.keyboard.press("End"); page.keyboard.type("（線上）"); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    if page.locator(".edit").count():
        page.keyboard.press("Escape"); page.wait_for_timeout(200)
    assert cur()["memo"]["plan"][1]["text"] == "辦簽證（線上）"
    # it grows with what it holds, up to where Day 1 sits; from there the entries scroll and the rest stays put
    for i in range(7):
        page.click(".memoadd >> nth=0"); page.wait_for_timeout(120)
        page.keyboard.type("事情" * 30); page.keyboard.press("Enter"); page.wait_for_timeout(180)
    page.mouse.move(700, 600); page.wait_for_timeout(300)
    full = memo()
    assert full["line"] == 129 and full["adds"] == [[694, 30], [724, 30]] and full["foot"] == 0, full
    assert page.evaluate("(() => { const e = document.getElementById('memoents'); return e.scrollHeight > e.clientHeight + 100 && e.scrollTop > 0; })()"), "the entries scroll, at the newest"
    # the state is the trip's and survives a reload; closed again, the list is back
    page.reload(); page.wait_for_timeout(1000)
    again = memo()
    assert again["line"] == 129 and len(cur()["memo"]["plan"]) == 9
    assert css(".memo-body", "transition-duration").startswith("0.45s") and page.evaluate("document.querySelector('.memo-in').style.height") == "", "drawn open on loading, without the movement"
    # closing: the whole sheet goes down together, entries and "Add" rows keeping their places under the line
    gap = again["adds"][0][0] - again["line"]
    page.click("#memoh"); page.wait_for_timeout(200)
    going = memo()
    assert 129 < going["line"] < 744 and going["adds"][0][0] - going["line"] == gap, going
    page.wait_for_timeout(600)
    assert memo()["line"] == 744 and memo()["list"] == shut["list"] and cur()["memo"]["open"] is False
    assert page.evaluate("document.querySelector('.memo-in').style.height") == "", "and is let go afterwards"
    # with the panel put away, the notes are too
    page.click(".sidebtn"); page.wait_for_timeout(400)
    assert not page.locator("#memo").is_visible()
    page.click(".sidebtn"); page.wait_for_timeout(400)
    # an old save without notes gets an empty set, and loses nothing
    old = stored(); n_places = len(cur()["places"])
    for t in old["trips"]:
        del t["memo"]
    page.evaluate("d => localStorage.setItem('plan-a-trip:v1', JSON.stringify(d))", old)
    page.reload(); page.wait_for_timeout(1000)
    page.click("#memoh"); page.wait_for_timeout(700)
    assert memo()["line"] == 664 and len(cur()["places"]) == n_places and cur()["memo"] == {"open": True, "plan": []}
    page.click("#memoh"); page.wait_for_timeout(700)

    # the arrow is not there until the pointer is on the trip's name; then it pushes the name right and the collapse icon steps aside
    page.mouse.move(700, 600)
    page.wait_for_timeout(700)
    x0 = page.locator(".title").bounding_box()["x"]
    assert css(".tripbtn", "opacity") == "0" and css(".sidebtn", "opacity") == "1"
    page.hover(".title")
    page.wait_for_timeout(700)
    assert css(".tripbtn", "opacity") == "1" and css(".sidebtn", "opacity") == "0"
    assert abs(page.locator(".title").bounding_box()["x"] - x0 - 30) < 0.5, "the name moves 30 to the right"

    # the name is edited by a double click, so pointing at it does not show the text cursor
    assert css(".title", "cursor") == "default"
    # the list of trips: the arrow turns to point down, every row has its icon, and the trip on screen has the round tick
    assert css(".tripbtn svg", "transform") == "none"
    page.click(".tripbtn")
    page.wait_for_timeout(400)
    assert css(".tripbtn svg", "transform") == "matrix(0, 1, -1, 0, 0, 0)", "a quarter turn"
    assert "pop" in page.get_attribute("#menu", "class") and css("#menu", "animation-name") == "menu-in", "the menu comes in"
    assert page.locator("#menu button").all_inner_texts() == ["富士山 ( 範例 )", "Create a new trip", "Send to phone", "Delete this trip"]
    assert page.locator("#menu button > svg.mico").count() == 4 and page.locator("#menu button >> nth=0 >> .rck").count() == 1
    assert css("#menu .sep", "background-color") == "rgb(229, 229, 229)" and css("#menu .rck", "border-radius") == "50%"
    # a new one starts empty, named New trip and ready to be renamed, and the map stays put
    moves = page.evaluate("__map.moves.length")
    page.click("#menu button:has-text('Create a new trip')")
    page.wait_for_timeout(300)
    assert page.evaluate("document.activeElement.className") == "edit title" and page.input_value("input.edit.title") == "New trip"
    page.keyboard.type("東京 3 日")
    page.keyboard.press("Enter")
    page.wait_for_timeout(300)
    assert page.locator(".title").inner_text() == "東京 3 日"
    assert page.locator(".day").count() == 1 and page.locator(".stop").count() == 0 and page.locator(".card").count() == 0
    assert page.locator(".mk").count() == 0, "an empty trip has nothing on the map"
    # with no places at all, the card area is one button that opens Google Maps; its arrow grows when pointed at
    assert page.locator(".tp-head h2").inner_text() == "Travel Collection"
    assert page.locator(".collect-t").inner_text() == "Your travel collection starts here"
    assert page.locator(".collect-s").inner_text() == "Add your favorite spots from Google Maps here, then start planning your trip"
    page.mouse.move(700, 600); page.wait_for_timeout(600)
    words = page.locator(".collect-s").bounding_box()
    arr = page.locator(".collect .arr")
    assert abs(arr.bounding_box()["width"] - 10.5) < 0.01 and css(".collect-s", "color") == "rgba(0, 0, 0, 0.4)" and css(".collect .arr", "opacity") == "0.4"
    # the shaft is a 1.5 line on half pixels, through the middle of the lower-case letters (rows 10.5 to 12 of the line)
    shaft, line = page.locator(".collect .arr i").bounding_box(), page.locator(".collect-s").bounding_box()
    assert shaft["height"] == 1.5 and shaft["y"] - line["y"] == 10.5 and (shaft["y"] * 2) % 1 == 0, (shaft, line)
    page.hover(".collect"); page.wait_for_timeout(700)
    assert abs(arr.bounding_box()["width"] - 16.6) < 0.01 and page.locator(".collect-s").bounding_box() == words, "the words stay put"
    page.evaluate("window.__said = []; window.addEventListener('message', e => { if (e.data && e.data.from === 'plan-a-trip') __said.push(e.data.type); })")
    with ctx.expect_page() as opened:
        page.click(".collect")
    assert opened.value.url.startswith("https://www.google.com/maps"), opened.value.url
    opened.value.close()
    page.wait_for_timeout(200)
    assert "switch-on" in page.evaluate("__said"), "the extension, if there is one, is asked to switch on"
    assert page.evaluate("__map.moves.length") == moves, "and the map has not moved"
    d = stored()
    assert [t["title"] for t in d["trips"]] == ["富士山 ( 範例 )", "東京 3 日"] and d["current"] == d["trips"][1]["id"]
    tokyo, fuji = d["trips"][1]["id"], d["trips"][0]["id"]

    # the extension's hand-over: places arrive in a message, go to the trip they were saved for, and are acknowledged
    page.evaluate("() => { window.__took = []; window.__state = []; window.addEventListener('message', e => { const m = e.data; if (m && m.from === 'plan-a-trip') (m.type === 'took' ? window.__took : window.__state).push(m); }); }")
    inbox = [{"id": "a1", "tripId": tokyo, "name": "淺草寺", "lat": 35.714765, "lng": 139.796655, "cat": "sight", "fid": "0x60188ec1a4463df1:0x6c0d289a8292810d"},
             {"id": "a2", "tripId": fuji, "name": "大石公園", "lat": 35.5229, "lng": 138.7457, "cat": "sight", "fid": "0x6019600000000001:0x1"},
             {"id": "a3", "tripId": tokyo, "name": "<b>壞資料</b>", "lat": "x", "lng": 1, "cat": "sight", "fid": ""}]
    page.evaluate("items => window.postMessage({from:'plan-a-trip-ext', type:'inbox', items}, location.origin)", inbox)
    page.wait_for_timeout(400)
    assert page.locator(".card.focus .cname").inner_text() == "淺草寺", "a place for the trip on screen is shown and selected"
    assert page.evaluate("__took[0].ids") == ["a1", "a2", "a3"], "everything received is acknowledged, usable or not"
    d = stored()
    assert [x["name"] for x in d["trips"][1]["places"]] == ["淺草寺"] and d["trips"][1]["places"][0]["fid"].startswith("0x60188e")
    assert d["trips"][0]["places"][-1]["name"] == "大石公園", "a place saved for another trip goes to that trip"
    told = page.evaluate("__state[__state.length-1]")
    held = told.pop("places")
    assert told == {"from": "plan-a-trip", "type": "state", "trip": {"id": tokyo, "title": "東京 3 日"},
        "trips": [{"id": fuji, "title": "富士山 ( 範例 )"}, {"id": tokyo, "title": "東京 3 日"}],
        "saved": {fuji: ["0x6019600000000001:0x1"], tokyo: ["0x60188ec1a4463df1:0x6c0d289a8292810d"]}}, "the page tells the extension about every trip"
    # ...and every place of each trip in order, by name, category and Google Maps' identifier (none for places from the search)
    assert held[tokyo] == [{"n": "淺草寺", "c": d["trips"][1]["places"][0]["cat"], "f": "0x60188ec1a4463df1:0x6c0d289a8292810d"}], held[tokyo]
    assert held[fuji] == [{"n": x["name"], "c": x["cat"], "f": x.get("fid", "")} for x in d["trips"][0]["places"]] and held[fuji][-1]["f"] == "0x6019600000000001:0x1"
    page.evaluate("items => window.postMessage({from:'plan-a-trip-ext', type:'inbox', items}, location.origin)", inbox[:1] + [dict(inbox[0], id="a9")])
    page.wait_for_timeout(300)
    assert len(stored()["trips"][1]["places"]) == 1, "the same place is not added twice"
    page.keyboard.press("Escape")

    # going back to the other trip shows it as it was left and moves the map to it
    moves = page.evaluate("__map.moves.length")
    open_trips()
    assert page.locator("#menu button >> nth=1 >> .rck").count() == 1, "the trip on screen is ticked"
    page.click("#menu button:has-text('富士山 ( 範例 )')")
    page.wait_for_timeout(1300)
    assert page.locator(".title").inner_text() == "富士山 ( 範例 )" and page.locator(".day").count() == 2 and page.locator(".day.sel").count() == 0
    assert page.evaluate("__map.moves.length") > moves + 20, "the map glides to the trip"

    # closing a menu: it goes out the way it came in, then is taken away; the arrow turns back
    open_trips()
    page.keyboard.press("Escape")
    page.wait_for_timeout(50)
    assert "out" in page.get_attribute("#menu", "class") and page.locator("#menu").is_visible() and css("#menu", "animation-name") == "menu-out"
    page.wait_for_timeout(350)
    assert not page.locator("#menu").is_visible() and page.inner_html("#menu") == "" and css(".tripbtn svg", "transform") == "none"
    assert page.title() == "SomeDay"

    # deleting a trip asks once more; deleting the last one leaves an empty trip
    open_trips()
    page.click("#menu button:has-text('東京 3 日')")
    page.wait_for_timeout(300)
    # a category with no places, in a trip that has places, shows the outline of a card in the first card's spot
    have = {p["cat"] for p in stored()["trips"][1]["places"]}
    none = [c for c in ["sight", "food", "stay", "transit"] if c not in have]
    assert have and none, "this trip has a place, and a category without any"
    first = None
    for c in ["sight", "food", "stay", "transit"]:
        if c in have and first is None:
            page.click(f".chip[data-cat='{c}']"); page.wait_for_timeout(200)
            first = page.locator(".card >> nth=0").bounding_box()
    page.click(f".chip[data-cat='{none[0]}']"); page.wait_for_timeout(200)
    hole = page.locator(".card-empty").bounding_box()
    assert page.locator(".card").count() == 0 and page.locator(".collect").count() == 0
    assert (hole["x"], hole["y"], hole["width"], hole["height"]) == (first["x"], first["y"], 152, 178), (hole, first)
    assert css(".card-empty", "border-top-style") == "dashed" and css(".card-empty", "border-top-color") == css(".ph", "border-top-color") if page.locator(".ph").count() else True

    open_trips()
    page.click("#menu button:has-text('Delete this trip')")
    page.wait_for_timeout(200)
    assert page.locator("#menu").is_visible() and len(stored()["trips"]) == 2, "the first press only asks"
    assert "pop" not in page.get_attribute("#menu", "class"), "drawn again, the menu does not come in a second time"
    assert page.locator("#menu button >> nth=-1").inner_text() == "Delete “東京 3 日”?"
    page.click("#menu button >> nth=-1")
    page.wait_for_timeout(300)
    assert [t["title"] for t in stored()["trips"]] == ["富士山 ( 範例 )"] and page.locator(".title").inner_text() == "富士山 ( 範例 )"
    open_trips()
    page.click("#menu button:has-text('Delete this trip')")
    page.wait_for_timeout(200)
    page.click("#menu button >> nth=-1")
    page.wait_for_timeout(300)
    d = stored()
    assert len(d["trips"]) == 1 and d["trips"][0]["title"] == "New trip" and d["trips"][0]["places"] == [] and len(d["trips"][0]["days"]) == 1

    # with the system's "reduce motion", there is no hop: the card closes at once and a line at the foot says so
    page.emulate_media(reduced_motion="reduce")
    page.fill("#q", "大石")
    page.wait_for_timeout(700)
    page.click("#results button:has-text('大石公園')")
    page.wait_for_timeout(300)
    page.click(".savebtn")
    page.wait_for_timeout(150)
    assert page.locator(".pend").count() == 0 and page.locator(".card.focus .cname").inner_text() == "大石公園"
    assert "show" in page.get_attribute("#toast", "class") and page.locator("#toast").inner_text() == "Added to Travel Collection"
    page.emulate_media(reduced_motion="no-preference")

    # on a screen with two of its own pixels to one: the filter's drawings sit in the very middle of their rows, on
    # the screen's pixels, and the words beside them are measured by their capitals, so their middles meet
    fine = browser.new_context(viewport={"width": 1440, "height": 800}, device_scale_factor=2)
    fine.route("https://maps.googleapis.com/maps/api/js*", lambda r: r.fulfill(status=200, content_type="text/javascript", body=MOCK))
    fine.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    fine.route("https://api.geoapify.com/**", lambda r: r.abort())
    p2 = fine.new_page()
    p2.goto("http://127.0.0.1:8765/index.html")
    p2.wait_for_timeout(700)
    MID = ("(el=>{var i=el.querySelector('svg').getBoundingClientRect(),t=el.querySelector('span').getBoundingClientRect(),r=el.getBoundingClientRect(),"
           "pb=parseFloat(getComputedStyle(el.querySelector('span')).paddingTop),m=r.top+r.height/2;"
           "return [i.top*2%1,(i.top+i.height/2)-m,+((t.top+pb+(t.height-2*pb)/2)-m).toFixed(2),t.height-2*pb<parseFloat(getComputedStyle(el).fontSize)]})")
    assert p2.evaluate(MID + "(document.getElementById('dayf'))") == [0, 0, 0, True], "the button"
    p2.click("#dayf")
    p2.wait_for_timeout(300)
    rows = p2.evaluate("[].map.call(document.querySelectorAll('#menu button')," + MID + ")")
    assert all(r == [0, 0, 0, True] for r in rows), rows

    # what answers to the pointer (2026-10-10). A frame goes one step darker, never to ink, and what is chosen already
    # does not answer; a pale ground comes up behind the two bare buttons; the arrows that open and close a panel move
    # 2 the way they point; a point of the map grows; "Add a day" answers along its whole row
    p2.mouse.click(900, 600)
    p2.wait_for_timeout(300)
    assert p2.locator("#menu button").count() == 0 or not p2.locator("#menu").is_visible()
    STEP, PALE = "rgba(0, 0, 0, 0.4)", "rgba(0, 0, 0, 0.04)"
    def rest():
        p2.mouse.move(900, 600); p2.wait_for_timeout(250)
    def over(loc, prop="borderTopColor", pseudo=None, wait=300, **kw):
        rest(); loc.hover(**kw); p2.wait_for_timeout(wait)
        return loc.evaluate("(e,a)=>getComputedStyle(a[1]?e:e,a[1]||null)[a[0]]", [prop, pseudo])
    if p2.locator(".day.sel").count() == 0:
        p2.locator(".daypill").first.click(); p2.wait_for_timeout(500)
    assert p2.locator(".day.sel").count() == 1 and p2.locator(".day:not(.sel)").count() >= 1
    assert over(p2.locator(".day:not(.sel) .daypill").first) == STEP
    assert over(p2.locator(".day.sel .daypill")) == "rgb(51, 51, 51)", "the open day stays as it is"
    assert over(p2.locator("#chips .chip:not(.on)").first, "backgroundColor") == PALE
    assert over(p2.locator("#chips .chip.on"), "backgroundColor") == "rgba(0, 0, 0, 0)", "the category in force stays as it is"
    assert over(p2.locator(".search input")) == STEP
    # a box to tick, a ticked one, and the one that only stands beside a line being written (not a button)
    p2.evaluate("document.body.insertAdjacentHTML('beforeend','<div id=\"hc\" style=\"position:fixed;left:700px;top:500px;z-index:999;display:flex;gap:30px\"><div class=\"ck\"><button class=\"cbox\"></button></div><div class=\"ck done\"><button class=\"cbox\"></button></div><div class=\"ck\"><span class=\"cbox\"></span></div></div>')")
    assert over(p2.locator("#hc .cbox").nth(0)) == STEP
    assert over(p2.locator("#hc .cbox").nth(1)) == "rgb(51, 51, 51)"
    assert over(p2.locator("#hc .cbox").nth(2)) == "rgb(210, 210, 210)"
    p2.evaluate("document.getElementById('hc').remove()")
    assert p2.evaluate("getComputedStyle(document.getElementById('dayf'),'::before').backgroundColor") == "rgba(0, 0, 0, 0)"
    assert over(p2.locator("#dayf"), "backgroundColor", "::before") == PALE
    side = p2.locator(".sidebtn")
    assert side.evaluate("e=>{var r=e.querySelector('svg').getBoundingClientRect();return [r.width,r.height]}") == [10, 13]
    assert over(side, "backgroundColor", "::before") == PALE
    # the arrows
    MOVE = "e=>getComputedStyle(e.querySelector('svg')).translate"
    def arrow(sel):
        rest(); p2.wait_for_timeout(500)
        assert p2.locator(sel).evaluate(MOVE) in ("none", "0px"), sel
        p2.locator(sel).hover(position={"x": 3, "y": 3}); p2.wait_for_timeout(600)
        return p2.locator(sel).evaluate(MOVE)
    assert arrow(".tclose") == "0px -2px"
    assert arrow("#memoh") == "0px -2px", "the notes are closed: their arrow points up"
    p2.click("#memoh"); p2.wait_for_timeout(700)
    assert arrow("#memoh") == "0px 2px", "open, it points down"
    p2.click("#memoh"); p2.wait_for_timeout(700)
    p2.click(".tclose"); p2.wait_for_timeout(500)
    assert arrow(".tabdown") == "0px 2px"
    assert p2.evaluate("['.tabdown','.tclose'].map(s=>getComputedStyle(document.querySelector(s+' svg')).strokeWidth)") == ["1.5px", "1.5px"], "one weight"
    assert p2.evaluate("(r=>[r.width,r.height])(document.querySelector('.tabdown svg').getBoundingClientRect())") == [12, 8]
    p2.click(".tabdown"); p2.wait_for_timeout(500)
    # Add a day: the far end of its row, a little above its words
    box = p2.locator(".addday").bounding_box(); room = p2.evaluate("(e=>e.clientWidth-40)(document.getElementById('lpscroll'))")
    assert box["width"] == room and box["height"] == 16, (box, room)
    p2.locator(".addday").scroll_into_view_if_needed(); box = p2.locator(".addday").bounding_box()
    n_days = p2.locator(".day").count()
    rest(); p2.mouse.move(box["x"] + box["width"] - 3, box["y"] - 5); p2.wait_for_timeout(100)
    assert p2.locator(".addday").evaluate("e=>getComputedStyle(e).color") == "rgb(51, 51, 51)"
    p2.mouse.click(box["x"] + box["width"] - 3, box["y"] - 5); p2.wait_for_timeout(300)
    assert p2.locator(".day").count() == n_days + 1, "and a press there adds the day"
    # the dark button, and one that is done with
    p2.evaluate("document.body.insertAdjacentHTML('beforeend','<div id=\"hv\" style=\"position:fixed;left:700px;top:500px;width:160px;z-index:999\"><button class=\"savebtn\">x</button><button class=\"savebtn\" disabled>y</button></div>')")
    assert over(p2.locator("#hv .savebtn").first, "backgroundColor") == "rgb(0, 0, 0)"
    gone = p2.locator("#hv .savebtn[disabled]"); was = gone.evaluate("e=>getComputedStyle(e).backgroundColor")
    assert over(gone, "backgroundColor", force=True) == was
    p2.evaluate("document.getElementById('hv').remove()")
    # the map's points: one that nothing covers
    FREE = "(sel=>{var l=[].filter.call(document.querySelectorAll(sel),function(e){var r=e.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===e});return l.length?[l[0].getBoundingClientRect().left+l[0].getBoundingClientRect().width/2,l[0].getBoundingClientRect().top+l[0].getBoundingClientRect().height/2]:null})"
    grew = {}
    for sel, by in ((".npin:not(.focus)", 1.1), (".dot", 1.3)):
        at = p2.evaluate(FREE + "(" + repr(sel) + ")")
        if at:
            rest(); p2.mouse.move(at[0], at[1]); p2.wait_for_timeout(300)
            grew[sel] = p2.evaluate("(a=>getComputedStyle(document.elementFromPoint(a[0],a[1])).transform)", at)
            assert grew[sel] == "matrix(%s, 0, 0, %s, 0, 0)" % (by, by), grew
    assert len(grew) == 2, ("both kinds of point were tried", grew)

    # the categories are one track with a white piece under the one in force; it slides when another is picked
    rest()
    PIECE = ("(sel=>{var t=document.querySelector(sel),b=getComputedStyle(t,'::before'),r=t.getBoundingClientRect(),o=t.querySelector('.chip.on').getBoundingClientRect(),"
             "x=r.left+parseFloat(b.left)+new DOMMatrix(b.transform).m41;return [+(x-o.left).toFixed(2),+(parseFloat(b.width)-o.width).toFixed(2),o.width,o.left%1]})")
    assert p2.evaluate(PIECE + "('#chips')") == [0, 0, 64, 0], "under the one in force, on whole pixels"
    p2.click("#chips .chip[data-cat='transit']"); p2.wait_for_timeout(110)
    mid = p2.evaluate(PIECE + "('#chips')")
    assert -198 < mid[0] < -5, ("on its way", mid)
    p2.wait_for_timeout(350)
    assert p2.evaluate(PIECE + "('#chips')") == [0, 0, 64, 0] and p2.locator("#chips .chip.on").inner_text() == "交通"
    p2.click("#chips .chip[data-cat='sight']"); p2.wait_for_timeout(400)

    # "Day 1" stands in the middle of its pill by its capitals, in all three places (this is the 2x screen)
    # (measured as for the filter: the words' box runs from the capitals' top to the line they stand on, and its
    # middle is the pill's middle; with the site's own font that box is the capitals exactly, checked on the live site)
    LOW = ("(el=>{var s=el.querySelector('span'),t=s.getBoundingClientRect(),r=el.getBoundingClientRect(),pb=parseFloat(getComputedStyle(s).paddingTop);"
           "return [Math.abs((t.top+t.height/2)-(r.top+r.height/2)),t.height-2*pb<parseFloat(getComputedStyle(s).fontSize)]})")
    if p2.evaluate("CSS.supports('text-box','trim-both cap alphabetic')"):
        if p2.locator(".day.sel").count():
            p2.locator(".day.sel .daypill").click(); p2.wait_for_timeout(500)
        for sel in (".daypill", ".daytag", ".badge"):
            assert p2.locator(sel).count() > 0, sel
            off = p2.locator(sel).first.evaluate(LOW)
            assert off[0] < 0.05 and off[1], (sel, off)

    # the left panel folds up: its sheet's foot rises to 62 in .28s, nothing in it moves, nothing shows under the
    # title on the way or after, and what is cut off cannot be pressed; then its parts are taken out
    FOLD = ("(()=>{var bg=document.querySelector('.lp-bg').getBoundingClientRect(),lp=document.getElementById('lp').getBoundingClientRect(),"
            "q=document.querySelector('.search').getBoundingClientRect(),c=getComputedStyle(document.getElementById('lp')).clipPath.replace('inset(-40px -40px ','').replace(/\\)$/,''),"
            "k=c.match(/calc\\(([\\d.]+)% ([-+]) ([\\d.]+)px/),up=k?lp.height*k[1]/100+(k[2]==='-'?-1:1)*k[3]:parseFloat(c);"
            "return {bg:Math.round(bg.height),lp:Math.round(lp.height),search:q.height?Math.round(q.top-lp.top):null,cut:Math.round(lp.height-up),lcd:document.getElementById('app').classList.contains('lcd')}})()")
    full = p2.evaluate(FOLD)
    assert full["bg"] == full["lp"] == 800 - 32 and full["search"] == 57 and full["cut"] == full["lp"], full
    p2.click(".sidebtn"); p2.wait_for_timeout(120)
    going = p2.evaluate(FOLD)
    assert 62 < going["bg"] < full["bg"] and 50 < going["cut"] <= going["bg"] and going["lp"] == full["lp"] and going["search"] == 57 and not going["lcd"], going
    p2.wait_for_timeout(400)
    shut = p2.evaluate(FOLD)
    assert shut["bg"] == 62 and shut["cut"] == 50 and shut["search"] is None and shut["lcd"], shut
    assert p2.evaluate("(e=>!e.closest('#lp')&&!e.closest('.lp-bg'))(document.elementFromPoint(100,300))"), "the map is free under the folded panel"
    assert p2.evaluate("document.elementFromPoint(100,40).closest('#lp')!==null"), "the title is still there"
    p2.click(".sidebtn"); p2.wait_for_timeout(120)
    back = p2.evaluate(FOLD)
    assert 62 < back["bg"] < full["bg"] and back["search"] == 57 and not back["lcd"], back
    p2.wait_for_timeout(400)
    assert p2.evaluate(FOLD) == full
    fine.close()

    assert not errors, errors
    browser.close()
    print("smoke test passed")
