"""Phone test: "Send to phone" on the desktop, and the phone page (m/index.html) that opens what it sends.

The whole path is checked without a network: a trip is put in the desktop's storage, the link is made there, and a
second, phone-sized browser opens it. Then: what the phone shows, ticks kept on the phone, a newer link of the same
trip, links that cannot be read, words that try to be markup, and opening with the network off.

    python3 -m http.server 8765 --bind 127.0.0.1 &     # from the repository root
    python3 tests/phone.py

SHOTS=<folder> saves pictures. The QR code is read back from a picture when OpenCV is installed and can read it.
"""
import json
import os
import pathlib
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8765/"
MOCK = (pathlib.Path(__file__).parent / "mock-googlemaps.js").read_text(encoding="utf-8")
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
SHOTS = os.environ.get("SHOTS")
EVIL = "<img src=x onerror=window.__x=1>"

def P(pid, name, cat, lat, lng, **more):
    return dict({"id": pid, "name": name, "cat": cat, "lat": lat, "lng": lng, "note": "", "img": ""}, **more)

TRIP = {
    "id": "t1", "title": "測試旅行", "legs": {"p1>p2": "walk", "p2>p3": "train"},
    "places": [
        P("p1", "久保田一竹美術館", "sight", 35.5252, 138.7715, gid="ChIJgid-kubota_1", at=1),
        P("p2", "烏龍麵店", "food", 35.49004, 138.80801),
        P("p3", EVIL, "stay", 35.5075, 138.769),
        P("p4", "河口湖站", "transit", 35.4983, 138.7689),
        P("p5", "沒排進行程的地點", "sight", 35.4, 138.7)],
    "days": [
        {"id": "d1", "stops": [
            {"id": "s1", "place": "p1", "plan": [
                {"k": "n", "text": "12 點左右到\n第二行"},
                {"k": "c", "text": "已買票", "done": True, "link": "https://example.com/tickets",
                 "file": {"id": "f1", "name": "門票.pdf", "type": "application/pdf", "size": 1000}}]},
            {"id": "s2", "place": "p2", "plan": [
                {"k": "c", "text": "訂位", "done": False, "link": "", "file": None},
                {"k": "c", "text": "訂位", "done": False, "link": "", "file": None},
                {"k": "c", "text": "壞連結", "done": False, "link": "javascript:window.__x=2", "file": None}]},
            {"id": "s3", "place": "p3", "plan": []}]},
        {"id": "d2", "stops": [{"id": "s4", "place": "p4", "plan": []}]}],
    "memo": {"open": False, "plan": [{"k": "c", "text": "護照", "done": False, "link": "", "file": None},
                                     {"k": "c", "text": "國際駕照", "done": True, "link": "", "file": None},
                                     {"k": "n", "text": "日幣先換 5 萬"}]}}

def seed(trip):
    return "localStorage.setItem('plan-a-trip:v1', %s)" % json.dumps(json.dumps({"v": 2, "current": trip["id"], "trips": [trip]}))

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []

    # ---------- the desktop: the menu, the box, the link ----------
    desk = browser.new_context(viewport={"width": 1440, "height": 800}, device_scale_factor=2,
                               permissions=["clipboard-read", "clipboard-write"])
    desk.route("https://maps.googleapis.com/maps/api/js*", lambda r: r.fulfill(status=200, content_type="text/javascript", body=MOCK))
    desk.route("https://fonts.googleapis.com/**", lambda r: r.abort())

    def geoapify(route):   # every road leg takes 20 minutes
        a, b = [[float(v) for v in w.split(",")] for w in route.request.url.split("waypoints=")[1].split("&")[0].replace("%7C", "|").split("|")]
        body = {"features": [{"geometry": {"type": "MultiLineString", "coordinates": [[[a[1], a[0]], [b[1], b[0]]]]},
                              "properties": {"time": 1200, "distance": 1500}}]}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body), headers=CORS)
    desk.route("https://api.geoapify.com/**", geoapify)

    def desktop(trip):
        """open the site with this trip saved, press Send to phone, and return the page and the link"""
        page = desk.new_page()
        page.on("pageerror", lambda e: errors.append("desktop: " + str(e)))
        page.add_init_script(seed(trip))
        page.goto(BASE + "index.html")
        page.wait_for_timeout(900)
        page.hover(".tzone")
        page.click(".tripbtn")
        page.wait_for_timeout(250)
        page.click("#menu button:has-text('Send to phone')")
        page.wait_for_timeout(600)
        page.click("#sendcopy")
        page.wait_for_timeout(100)
        return page, page.evaluate("navigator.clipboard.readText()")

    page = desk.new_page()
    page.add_init_script(seed(TRIP))
    page.goto(BASE + "index.html")
    page.wait_for_timeout(900)
    left = page.evaluate("[].map.call(document.querySelectorAll('.lp .sname'),e=>Math.round(e.getBoundingClientRect().left))")
    assert len(set(left)) == 1, "the left panel's names stand in one column (the box's styles must not reach them): %s" % left
    page.hover(".tzone")
    page.click(".tripbtn")
    page.wait_for_timeout(250)
    assert [x.strip() for x in page.locator("#menu button").all_inner_texts()] == ["測試旅行", "Create a new trip", "Send to phone", "Delete this trip"]
    assert page.locator("#sendbox").is_hidden()
    page.close()

    page, url = desktop(TRIP)
    assert page.locator("#sendbox").is_visible() and page.locator("#menu").is_hidden(), "the box opens and the menu closes"
    assert page.inner_text("#sendname") == "Send to phone"
    assert page.inner_text("#sendhint") == "Scan with your phone’s camera, or copy the link."
    assert page.inner_text("#sendcopy") == "Copied", "the button says so for a moment"
    assert url.startswith(BASE + "m/#1."), url[:60]
    qr = page.evaluate("(()=>{var s=document.querySelector('#sendqr svg'),b=s.getBoundingClientRect(),n=+s.getAttribute('viewBox').split(' ')[2];"
                       "return {w:b.width,h:b.height,n:n,px:b.width/n*devicePixelRatio}})()")
    assert qr["w"] == qr["h"] <= 240 and qr["n"] >= 21, qr
    assert abs(qr["px"] - round(qr["px"])) < 1e-6 and qr["px"] >= 2, "a whole number of the screen's pixels to a square: %s" % qr
    if SHOTS:
        page.screenshot(path=SHOTS + "/send-box.png")
    # Read the code back from the picture. OpenCV's reader gives up on about a third of valid codes of this size
    # (the same codes read 40 out of 40 with a browser's own reader, checked on the live site on 2026-10-10), so not
    # being able to read one proves nothing; reading something else than the link would.
    try:
        import cv2
        import numpy as np
        shot = cv2.imdecode(np.frombuffer(page.screenshot(), np.uint8), cv2.IMREAD_COLOR)
        read = cv2.QRCodeDetector().detectAndDecode(shot)[0]
        assert read in ("", url), "the QR code holds the link that is copied"
        qr_read = "read back" if read else "not readable by OpenCV this time"
    except ImportError:
        qr_read = "not read back: OpenCV is not installed"
    page.wait_for_timeout(2100)
    assert page.inner_text("#sendcopy") == "Copy link"
    page.keyboard.press("Escape")
    assert page.locator("#sendbox").is_hidden() and page.locator("#sendqr svg").count() == 0, "Esc closes it"
    page.hover(".tzone")
    page.click(".tripbtn")
    page.wait_for_timeout(250)
    page.click("#menu button:has-text('Send to phone')")
    page.wait_for_timeout(500)
    page.mouse.click(20, 20)
    assert page.locator("#sendbox").is_hidden(), "so does a click outside it"
    assert json.loads(page.evaluate("localStorage.getItem('plan-a-trip:v1')"))["trips"][0] == TRIP, "sending changes nothing in the trip"
    page.close()

    # a trip too long for a QR code: the link alone
    long_trip = json.loads(json.dumps(TRIP))
    long_trip["memo"]["plan"] = [{"k": "n", "text": "第 %d 則備註，寫得很長很長很長：%s" % (i, os.urandom(24).hex())} for i in range(40)]
    page, long_url = desktop(long_trip)
    assert len(long_url) > 1500 and page.locator("#sendqr svg").count() == 0
    assert page.inner_text("#sendhint") == "This trip is too long for a QR code. Copy the link and send it to your phone."
    page.close()

    # the same trip later, one item ticked on the desktop and one removed
    later = json.loads(json.dumps(TRIP))
    later["days"][0]["stops"][1]["plan"][0]["done"] = True      # the first "訂位"
    later["memo"]["plan"].pop(1)                                 # 國際駕照 is gone
    later["title"] = "測試旅行（改過）"
    page, url2 = desktop(later)
    page.close()

    # ---------- the phone ----------
    phone = browser.new_context(viewport={"width": 390, "height": 760}, device_scale_factor=3, has_touch=True, is_mobile=True)
    phone.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    m = phone.new_page()
    m.on("pageerror", lambda e: errors.append("phone: " + str(e)))

    def texts(sel):
        return [t.strip() for t in m.locator(sel).all_inner_texts()]

    def boxes(scope):
        return m.evaluate("s=>[].map.call(document.querySelectorAll(s+' .cbtn'),b=>b.getAttribute('aria-checked')==='true')", scope)

    # nothing opened here yet
    m.goto(BASE + "m/")
    m.wait_for_timeout(300)
    assert m.locator(".blank").count() == 1 and "Send to phone" in m.inner_text(".blank")

    m.goto(url)
    m.wait_for_timeout(500)
    assert m.evaluate("innerWidth") == 390 and not m.evaluate("document.documentElement.scrollWidth>innerWidth"), "fits a phone, nothing sticks out"
    assert m.inner_text(".top h3") == "測試旅行" and m.title() == "測試旅行"
    assert m.inner_text(".top p").startswith("Updated 20")
    assert texts(".daypill") == ["Day 1", "Day 2"] and texts(".daysum") == ["3 places", "1 place"]
    assert texts(".sname") == ["久保田一竹美術館", "烏龍麵店", EVIL, "河口湖站"], "only what is in the itinerary, in order"
    assert m.evaluate("window.__x") is None and m.locator(".sname img").count() == 0, "a name is words, never markup"
    assert m.evaluate("[].map.call(document.querySelectorAll('.cat'),c=>c.className)") == ["cat cat-sight", "cat cat-food", "cat cat-stay", "cat cat-transit"]
    hrefs = m.evaluate("[].map.call(document.querySelectorAll('.go'),a=>a.getAttribute('href'))")
    assert hrefs[0] == "https://www.google.com/maps/search/?api=1&query=" + "%E4%B9%85%E4%BF%9D%E7%94%B0%E4%B8%80%E7%AB%B9%E7%BE%8E%E8%A1%93%E9%A4%A8" + "&query_place_id=ChIJgid-kubota_1", hrefs[0]
    assert hrefs[1] == "https://www.google.com/maps/search/?api=1&query=35.49004%2C138.80801", hrefs[1]
    code = m.evaluate("location.hash")
    raw = m.evaluate("""async s=>{var b=Uint8Array.from(atob(s.slice(3).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
        return await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text()}""", code)
    sent = json.loads(raw)
    assert "g" in sent["d"][0][0] and "p" not in sent["d"][0][0], "a place from the search goes by Google's ID, without its position"
    assert "沒排進行程的地點" not in raw and "f1" not in raw, "places outside the itinerary and the files themselves are not sent"
    assert texts(".stop:nth-child(1) .nb") == ["12 點左右到\n第二行"]
    assert texts(".stop:nth-child(1) .tag") == ["Link", "門票.pdf・在電腦上"]
    assert m.get_attribute(".stop:nth-child(1) a.tag", "href") == "https://example.com/tickets"
    assert m.locator(".stop:nth-child(2) a.tag").count() == 0, "a link that is not http(s) is dropped"
    assert texts(".day:nth-of-type(1) .leg") == ["20 m", ""], "minutes for a road, the icon alone for a train"
    assert boxes(".day") == [True, False, False, False] and boxes(".memo") == [False, True]
    assert m.locator(".nb.smooth").count() == m.locator(".nb").count() == 2, "smooth corners drawn"
    if SHOTS:
        m.screenshot(path=SHOTS + "/phone-open.png")

    # ticks: the second of two items with the same words, and one in the notes
    m.locator(".stop:nth-child(2) .cbtn").nth(1).tap()
    m.tap(".memo-handle")
    m.wait_for_timeout(600)
    assert "open" in m.get_attribute(".memo", "class") and m.get_attribute(".memo-handle", "aria-expanded") == "true"
    m.locator(".memo .cbtn").nth(0).tap()
    m.locator(".memo .cbtn").nth(1).tap()                      # un-ticked here
    assert boxes(".day") == [True, False, True, False] and boxes(".memo") == [True, False]
    m.tap("[data-day='1']")
    m.wait_for_timeout(350)
    assert m.evaluate("[].map.call(document.querySelectorAll('.day'),d=>d.className)") == ["day", "day shut dim"]
    if SHOTS:
        m.screenshot(path=SHOTS + "/phone-notes.png")
    m.reload()
    m.wait_for_timeout(400)
    assert boxes(".day") == [True, False, True, False] and boxes(".memo") == [True, False], "kept on the phone"
    assert "open" in m.get_attribute(".memo", "class") and "shut" in m.get_attribute(".day:nth-of-type(2)", "class")

    # the bare address shows the trip opened last
    m.goto(BASE + "m/")
    m.wait_for_timeout(400)
    assert m.inner_text(".top h3") == "測試旅行" and boxes(".memo") == [True, False]

    # a newer link of the same trip: its content, with the ticks made here on the items it still has
    m.goto(url2)
    m.wait_for_timeout(500)
    assert m.inner_text(".top h3") == "測試旅行（改過）"
    assert boxes(".day") == [True, True, True, False], "the desktop ticked the first 訂位, the phone the second"
    assert texts(".memo .ctext") == ["護照"] and boxes(".memo") == [True], "what the desktop removed is gone"
    # and the old link still shows the old trip
    m.goto(url)
    m.wait_for_timeout(500)
    assert m.inner_text(".top h3") == "測試旅行" and texts(".memo .ctext") == ["護照", "國際駕照"]

    # links that cannot be read
    for bad in ("1.AAAA", "1." + url.split("#1.")[1][:40], "nonsense", "0." + "e30"):
        m.goto(BASE + "m/#" + bad)
        m.wait_for_timeout(300)
        assert m.locator(".blank").count() == 1 and "讀不出來" in m.inner_text(".blank"), bad
    m.goto(url2)
    m.wait_for_timeout(400)
    assert m.inner_text(".top h3") == "測試旅行（改過）", "a bad link does not harm what was kept"

    # with the network off: the page and the trip are still there
    m.evaluate("navigator.serviceWorker.ready.then(()=>1)")
    m.wait_for_timeout(600)
    assert m.evaluate("caches.open('someday-m-v1').then(c=>c.keys()).then(k=>k.map(r=>new URL(r.url).pathname))").count("/m/") == 1, "the page is kept"
    phone.set_offline(True)
    m.reload()
    m.wait_for_timeout(500)
    assert m.inner_text(".top h3") == "測試旅行（改過）" and boxes(".memo") == [True], "opens with no network"
    m.goto(url)
    m.wait_for_timeout(500)
    assert m.inner_text(".top h3") == "測試旅行", "and so does another link"
    phone.set_offline(False)

    # the phone page takes nothing from, and leaves nothing in, the desktop's storage
    assert m.evaluate("Object.keys(localStorage)") == ["someday-phone:v1"]

    assert not errors, errors
    browser.close()
    print("phone test passed (QR code " + qr_read + ")")
