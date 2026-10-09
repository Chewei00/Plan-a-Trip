"""Smoke test. The Google Maps library is replaced by tests/mock-googlemaps.js (same camera maths, no rendering), and
the place search and the routing service are answered with canned data, so this runs without network access.

    python3 -m http.server 8765 --bind 127.0.0.1 &     # from the repository root
    python3 tests/smoke.py
"""
import json
import pathlib
import time
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
    page.click(".savebtn")
    page.wait_for_timeout(300)
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
    assert page.locator(".title").inner_text() == "富士山 5 日" and page.locator(".day").count() == 2
    assert page.locator(".card").count() == 7 and page.evaluate("__map.lines.length") == 8, "its places and routes are all there"

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
    assert page.locator("#menu button").all_inner_texts() == ["富士山 5 日", "Create a new trip", "Delete this trip"]
    assert page.locator("#menu button > svg.mico").count() == 3 and page.locator("#menu button >> nth=0 >> .rck").count() == 1
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
    assert page.locator(".collect .arr").bounding_box()["width"] == 10
    page.hover(".collect"); page.wait_for_timeout(700)
    assert page.locator(".collect .arr").bounding_box()["width"] == 17 and page.locator(".collect-s").bounding_box() == words, "the words stay put"
    page.evaluate("window.__said = []; window.addEventListener('message', e => { if (e.data && e.data.from === 'plan-a-trip') __said.push(e.data.type); })")
    with ctx.expect_page() as opened:
        page.click(".collect")
    assert opened.value.url.startswith("https://www.google.com/maps"), opened.value.url
    opened.value.close()
    page.wait_for_timeout(200)
    assert "switch-on" in page.evaluate("__said"), "the extension, if there is one, is asked to switch on"
    assert page.evaluate("__map.moves.length") == moves, "and the map has not moved"
    d = stored()
    assert [t["title"] for t in d["trips"]] == ["富士山 5 日", "東京 3 日"] and d["current"] == d["trips"][1]["id"]
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
    assert page.evaluate("__state[__state.length-1]") == {"from": "plan-a-trip", "type": "state", "trip": {"id": tokyo, "title": "東京 3 日"},
        "trips": [{"id": fuji, "title": "富士山 5 日"}, {"id": tokyo, "title": "東京 3 日"}],
        "saved": {fuji: ["0x6019600000000001:0x1"], tokyo: ["0x60188ec1a4463df1:0x6c0d289a8292810d"]}}, "the page tells the extension about every trip"
    page.evaluate("items => window.postMessage({from:'plan-a-trip-ext', type:'inbox', items}, location.origin)", inbox[:1] + [dict(inbox[0], id="a9")])
    page.wait_for_timeout(300)
    assert len(stored()["trips"][1]["places"]) == 1, "the same place is not added twice"
    page.keyboard.press("Escape")

    # going back to the other trip shows it as it was left and moves the map to it
    moves = page.evaluate("__map.moves.length")
    open_trips()
    assert page.locator("#menu button >> nth=1 >> .rck").count() == 1, "the trip on screen is ticked"
    page.click("#menu button:has-text('富士山 5 日')")
    page.wait_for_timeout(1300)
    assert page.locator(".title").inner_text() == "富士山 5 日" and page.locator(".day").count() == 2 and page.locator(".day.sel").count() == 0
    assert page.evaluate("__map.moves.length") > moves + 20, "the map glides to the trip"

    # deleting a trip asks once more; deleting the last one leaves an empty trip
    open_trips()
    page.click("#menu button:has-text('東京 3 日')")
    page.wait_for_timeout(300)
    open_trips()
    page.click("#menu button:has-text('Delete this trip')")
    page.wait_for_timeout(200)
    assert page.locator("#menu").is_visible() and len(stored()["trips"]) == 2, "the first press only asks"
    assert page.locator("#menu button >> nth=-1").inner_text() == "Delete “東京 3 日”?"
    page.click("#menu button >> nth=-1")
    page.wait_for_timeout(300)
    assert [t["title"] for t in stored()["trips"]] == ["富士山 5 日"] and page.locator(".title").inner_text() == "富士山 5 日"
    open_trips()
    page.click("#menu button:has-text('Delete this trip')")
    page.wait_for_timeout(200)
    page.click("#menu button >> nth=-1")
    page.wait_for_timeout(300)
    d = stored()
    assert len(d["trips"]) == 1 and d["trips"][0]["title"] == "New trip" and d["trips"][0]["places"] == [] and len(d["trips"][0]["days"]) == 1

    assert not errors, errors
    browser.close()
    print("smoke test passed")
