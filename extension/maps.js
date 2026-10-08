/* Runs on the Google Maps website. The extension's toolbar button turns it on and off (background.js); while it is
   on, two things sit in the top-right corner of the page:
     - a bar with the name of the trip places are saved to. Clicking it lists the trips, to save to another one, and
       ends with a link that opens Plan a Trip
     - under it, whenever the page is showing one place, the same card the Plan a Trip site shows after a search:
       the place's name, the four categories, and the button that saves it
   Off, there is nothing on the page at all.

   Only the place being looked at is read, and only from the address of the page:
     https://www.google.com/maps/place/<name>/@<view>/data=...!1s<place id>...!3d<lat>!4d<lng>...
   Nothing is read from Google's lists of saved places, and nothing is sent anywhere: a saved place is kept in the
   extension's own storage (the "inbox") until the Plan a Trip site is open in this browser, which then takes it
   (site.js). */
(function () {
  'use strict';
  if (window.__planATripCard) return;
  window.__planATripCard = true;

  var S = chrome.storage.local;
  function alive() { try { return !!chrome.runtime.id; } catch (e) { return false; } }

  var CATS = [['sight', '景點'], ['food', '飲食'], ['stay', '住宿'], ['transit', '交通']];
  var GLYPH = {
    sight: '<circle cx="9" cy="9" r="5.45"/><circle cx="7.3" cy="7.9" r=".7" fill="currentColor" stroke="none"/><circle cx="10.7" cy="7.9" r=".7" fill="currentColor" stroke="none"/><path d="M6.9 10.3c.9 1.2 3.3 1.2 4.2 0"/>',
    food: '<path d="M5.2 4.6v2.2a1.4 1.4 0 0 0 2.8 0V4.6M6.6 4.6v8.8M11.6 8.6v4.8"/><ellipse cx="11.6" cy="6.6" rx="1.5" ry="2"/>',
    stay: '<path d="M4.5 5.6v7M4.5 11h9v1.6M7.4 11V8.6h4.1a2 2 0 0 1 2 2V11"/>',
    transit: '<rect x="5.6" y="4.4" width="6.8" height="7.4" rx="1.8"/><path d="M5.6 8.4h6.8M7 11.8l-1 1.8M11 11.8l1 1.8"/><circle cx="7.6" cy="10.1" r=".6" fill="currentColor" stroke="none"/><circle cx="10.4" cy="10.1" r=".6" fill="currentColor" stroke="none"/>'
  };
  function glyph(id) { return '<svg viewBox="3 3 12 12" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + GLYPH[id] + '</svg>'; }
  var DOWN = '<svg class="down" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>';
  var TICK = '<svg class="tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.4 8.6l3 3 6.2-7.2"/></svg>';
  var OUT = '<svg class="out" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 10.5l5-5M6.5 5.5h4v4"/></svg>';

  /* same values as css/app.css on the site */
  var CSS = [
    ':host{all:initial}',
    '.wrap{--surface:#fefefe;--ink:#333;--on-ink:#fefefe;--text-2:rgba(0,0,0,.5);--line:#d2d2d2;--fill-note:rgba(0,0,0,.04);--fill-selected:#cdccca;--r6:6px;--r8:8px;',
    '  --float:0 4px 14px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.04);--ui:"Noto Sans","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;',
    '  position:fixed;top:76px;right:16px;z-index:2147483646;width:236px;display:flex;flex-direction:column;gap:8px;color:var(--ink);font:400 13px/20px var(--ui);-webkit-font-smoothing:antialiased;',
    '  opacity:0;transform:translateY(-6px);transition:opacity .25s ease,transform .25s ease}',
    '.wrap.in{opacity:1;transform:none}',
    '.wrap *{box-sizing:border-box}',
    'button{font:inherit;color:inherit;cursor:pointer;margin:0}',
    'button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}',
    'svg{display:block;flex:none;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round}',
    '.bar{position:relative;border-radius:var(--r8);background:var(--surface);box-shadow:var(--float)}',
    '.trip{display:flex;align-items:center;gap:8px;width:100%;height:36px;padding:0 12px;border:0;border-radius:var(--r8);background:none;text-align:left;font:500 13px/20px var(--ui);letter-spacing:.04em}',
    '.trip span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.down{width:10px;height:6px;stroke-width:1.5;transition:transform .25s ease}',
    '.bar.open .down{transform:rotate(180deg)}',
    '.menu{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:2;padding:6px;border-radius:var(--r8);background:var(--surface);box-shadow:var(--float)}',
    '.menu button{display:flex;align-items:center;gap:10px;width:100%;height:32px;padding:0 10px;border:0;border-radius:var(--r6);background:none;text-align:left;font:400 13px/20px var(--ui);white-space:nowrap}',
    '.menu button span{min-width:0;overflow:hidden;text-overflow:ellipsis}',
    '.menu button:hover,.menu button:focus-visible{background:var(--fill-note)}',
    '.tick,.out{width:16px;height:16px;stroke-width:1.4;margin-left:auto}',
    '.sep{height:1px;margin:6px 8px;background:var(--line)}',
    '.pend{padding:10px;border-radius:var(--r8);background:var(--surface);box-shadow:var(--float)}',
    '.pend-name{font:500 13px/20px var(--ui);letter-spacing:.04em;padding:2px 2px 0;overflow-wrap:anywhere}',
    '.chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 12px}',
    '.chip{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;border:1px solid var(--line);border-radius:999px;background:none;font:500 12px/20px var(--ui);letter-spacing:.04em;white-space:nowrap}',
    '.chip.on{background:var(--fill-selected);border-color:var(--fill-selected)}',
    '.chip svg{width:12px;height:12px}',
    '.chip[disabled]{cursor:default}',
    '.savebtn{display:block;width:100%;height:32px;border:0;border-radius:var(--r6);background:var(--ink);color:var(--on-ink);font:500 12px/20px var(--ui);letter-spacing:.04em}',
    '.savebtn[disabled]{background:var(--fill-selected);color:var(--ink);cursor:default}',
    '@supports (corner-shape:superellipse(1.4)){.wrap{--r6:7.5px;--r8:10px}.bar,.trip,.menu,.menu button,.pend,.savebtn{corner-shape:superellipse(1.4)}}',
    '@media (prefers-reduced-motion:reduce){.wrap,.down{transition:none}}'
  ].join('\n');

  /* ---- reading the place from the page address ---- */
  function parse(href) {
    var m = /\/maps\/place\/([^\/]+)\/(?:[^\/]*\/)?data=([^?#]*)/.exec(href);
    if (!m) return null;
    var name;
    try { name = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return null; }
    name = name.replace(/\s+/g, ' ').trim().slice(0, 40);
    var ll = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(m[2]);
    if (!name || !ll) return null;
    var fid = ((/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(m[2]) || [])[1] || '').toLowerCase();
    return { key: (fid || name) + '|' + ll[1] + ',' + ll[2], name: name, lat: +ll[1], lng: +ll[2], fid: fid };
  }
  /* a first guess at the category, from the kind of place Google shows under the name (when it can be found) and
     from the name itself. It is only a starting point: the chips change it */
  var STAY = /飯店|酒店|旅館|旅店|民宿|旅舍|膠囊|溫泉旅|ホテル|ゲストハウス|hotel|hostel|\binn\b|resort|ryokan|guest ?house/i;
  var TRANSIT = /車站|火車站|地鐵站|捷運站|巴士站|公車站|轉運站|機場|航廈|渡輪|碼頭|駅|バス停|station|airport|terminal|站$/i;
  var FOOD = /餐廳|餐館|食堂|小吃|拉麵|麵店|烏龍麵|蕎麥|壽司|燒肉|居酒屋|咖啡|茶館|茶屋|甜點|甜品|糕餅|糖果|蛋糕|和菓子|冰淇淋|麵包|烘焙|スイーツ|酒吧|料理|定食|火鍋|牛排|早午餐|レストラン|ラーメン|カフェ|restaurant|caf[eé]|coffee|bakery|\bbar\b|bistro|ramen|sushi|diner|\bpub\b/i;
  function guess(name) {
    var kind = '';
    try { var b = document.querySelector('button[jsaction*="category"]'); if (b) kind = b.textContent || ''; } catch (e) {}
    var t = kind + ' ' + name;
    if (STAY.test(t)) return 'stay';
    if (TRANSIT.test(kind) || TRANSIT.test(name)) return 'transit';
    if (FOOD.test(t)) return 'food';
    return 'sight';
  }

  /* ---- what the extension knows: whether it is on, the trips on the site, the one to save to, what each already
          holds, and what is waiting to go there ---- */
  var state = { on: false, trips: [], target: null, saved: {}, inbox: [] };
  function trip() {
    for (var i = 0; i < state.trips.length; i++) if (state.trips[i].id === state.target) return state.trips[i];
    return state.trips[0] || null;
  }
  function isSaved(p) {
    var t = trip(), tid = t ? t.id : null;
    if (p.fid && tid && (state.saved[tid] || []).indexOf(p.fid) >= 0) return true;
    return state.inbox.some(function (it) {
      return (it.tripId || null) === tid && (p.fid ? it.fid === p.fid : it.name === p.name && it.lat === p.lat && it.lng === p.lng);
    });
  }

  /* ---- the bar and the card ---- */
  var host = null, root = null, box = null, cur = null, menuOpen = false, touched = false;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hide() { if (host) { host.remove(); host = null; root = null; box = null; } menuOpen = false; }
  function draw() {
    if (!state.on) { hide(); return; }
    var fresh = false;
    if (!host) {
      host = document.createElement('div');
      host.id = 'plan-a-trip-card';
      root = host.attachShadow({ mode: 'open' });
      /* a stylesheet object rather than a <style> tag, so it works whatever the page's rules on inline styles are */
      try { var sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); root.adoptedStyleSheets = [sheet]; }
      catch (e) { var st = document.createElement('style'); st.textContent = CSS; root.appendChild(st); }
      box = document.createElement('div');
      box.className = 'wrap';
      root.appendChild(box);
      root.addEventListener('click', onClick);
      document.documentElement.appendChild(host);
      fresh = true;
    }
    var t = trip(), h = '';
    h += '<div class="bar' + (menuOpen ? ' open' : '') + '"><button class="trip" data-act="menu" aria-haspopup="menu" aria-expanded="' + menuOpen + '" title="要存到哪一趟旅行"><span>' + esc(t ? t.title : 'Plan a Trip') + '</span>' + DOWN + '</button>';
    if (menuOpen) {
      h += '<div class="menu" role="menu">' + state.trips.map(function (x) {
        return '<button role="menuitem" data-act="pick" data-id="' + esc(x.id) + '"><span>' + esc(x.title) + '</span>' + (t && x.id === t.id ? TICK : '') + '</button>';
      }).join('') + (state.trips.length ? '<div class="sep"></div>' : '') +
        '<button role="menuitem" data-act="open"><span>Open Plan a Trip</span>' + OUT + '</button></div>';
    }
    h += '</div>';
    if (cur) {
      var saved = isSaved(cur);
      h += '<div class="pend" role="group" aria-label="存到 Plan a Trip"><div class="pend-name">' + esc(cur.name) + '</div>' +
        '<div class="chips">' + CATS.map(function (c) {
          return '<button class="chip' + (cur.cat === c[0] ? ' on' : '') + '" data-act="cat" data-cat="' + c[0] + '" aria-pressed="' + (cur.cat === c[0]) + '"' + (saved ? ' disabled' : '') + '>' + glyph(c[0]) + c[1] + '</button>';
        }).join('') + '</div>' +
        '<button class="savebtn" data-act="save"' + (saved ? ' disabled' : '') + '>' + (saved ? '已儲存' : '存到想去的地方') + '</button></div>';
    }
    box.innerHTML = h;
    if (fresh) setTimeout(function () { if (box) box.classList.add('in'); }, 30);
  }
  function onClick(e) {
    e.stopPropagation();
    var a = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!a) { if (menuOpen) { menuOpen = false; draw(); } return; }
    var act = a.getAttribute('data-act');
    if (act === 'menu') { menuOpen = !menuOpen; draw(); return; }
    if (!alive()) { a.textContent = '請重新整理這個分頁'; return; }
    if (act === 'pick') { state.target = a.getAttribute('data-id'); menuOpen = false; S.set({ pat_target: state.target }); draw(); }
    else if (act === 'open') { menuOpen = false; draw(); chrome.runtime.sendMessage({ type: 'open-site' }); }
    else if (act === 'cat' && cur) { cur.cat = a.getAttribute('data-cat'); touched = true; menuOpen = false; draw(); }
    else if (act === 'save' && cur) {
      var t = trip();
      var item = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), tripId: t ? t.id : null,
        name: cur.name, lat: cur.lat, lng: cur.lng, cat: cur.cat, fid: cur.fid, at: Date.now() };
      state.inbox = state.inbox.concat([item]);
      menuOpen = false;
      S.set({ pat_inbox: state.inbox });
      draw();
    }
  }
  /* a click anywhere else on the page closes the list of trips */
  document.addEventListener('pointerdown', function (e) {
    if (menuOpen && host && !(e.composedPath && e.composedPath().indexOf(host) >= 0)) { menuOpen = false; draw(); }
  }, true);

  /* ---- follow the page: Google Maps changes its address without loading a new page ---- */
  var lastHref = '';
  function look() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    var p = parse(lastHref);
    if (!p) { if (cur) { cur = null; draw(); } return; }
    if (cur && cur.key === p.key) return;
    touched = false;
    p.cat = guess(p.name);
    cur = p;
    draw();
    /* the kind of place appears a moment after the address changes: guess once more unless a chip was chosen */
    setTimeout(function () { if (cur === p && !touched) { var c = guess(p.name); if (c !== p.cat) { p.cat = c; draw(); } } }, 1500);
  }
  function refresh() {
    if (!alive()) return;
    S.get(['pat_on', 'pat_trips', 'pat_target', 'pat_saved', 'pat_inbox'], function (r) {
      r = r || {};
      state.on = !!r.pat_on; state.trips = r.pat_trips || []; state.target = r.pat_target || null;
      state.saved = r.pat_saved || {}; state.inbox = r.pat_inbox || [];
      draw();
    });
  }
  chrome.storage.onChanged.addListener(function (changes, area) { if (area === 'local') refresh(); });
  refresh();
  setInterval(look, 500);
  look();
})();
