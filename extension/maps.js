/* Runs on the Google Maps website. When the page is showing one place, a small card appears in the top-right corner:
   the place's name, the four categories, and a button that saves it to Plan a Trip. It is the same card the Plan a
   Trip site shows after a search.

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
  var X = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

  /* same values as css/app.css on the site */
  var CSS = [
    ':host{all:initial}',
    '.pend{--surface:#fefefe;--ink:#333;--on-ink:#fefefe;--text-2:rgba(0,0,0,.5);--text-3:rgba(0,0,0,.4);--line:#d2d2d2;--fill-note:rgba(0,0,0,.04);--fill-selected:#cdccca;--r6:6px;--r8:8px;',
    '  --ui:"Noto Sans","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;',
    '  position:fixed;top:76px;right:16px;z-index:2147483646;box-sizing:border-box;width:236px;padding:10px;border-radius:var(--r8);background:var(--surface);color:var(--ink);',
    '  box-shadow:0 4px 14px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.04);font:400 13px/20px var(--ui);-webkit-font-smoothing:antialiased;',
    '  opacity:0;transform:translateY(-6px);transition:opacity .25s ease,transform .25s ease}',
    '.pend.in{opacity:1;transform:none}',
    '.pend *{box-sizing:border-box}',
    'button{font:inherit;color:inherit;cursor:pointer;margin:0}',
    'button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}',
    '.pend-top{display:flex;align-items:flex-start;gap:8px}',
    '.pend-name{flex:1;min-width:0;font:500 13px/20px var(--ui);letter-spacing:.04em;padding:2px 0 0 2px;overflow-wrap:anywhere}',
    '.xbtn{width:24px;height:24px;border:0;border-radius:50%;background:none;color:var(--text-2);display:grid;place-items:center;padding:0;flex:none}',
    '.xbtn:hover{background:var(--fill-note);color:var(--ink)}',
    '.xbtn svg{width:16px;height:16px;display:block;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}',
    '.chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 10px}',
    '.chip{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;border:1px solid var(--line);border-radius:999px;background:none;font:500 12px/20px var(--ui);letter-spacing:.04em;color:var(--ink);white-space:nowrap}',
    '.chip.on{background:var(--fill-selected);border-color:var(--fill-selected)}',
    '.chip svg{display:block;flex:none;width:12px;height:12px}',
    '.dest{margin:0 0 8px 2px;font:400 12px/16px var(--ui);letter-spacing:.04em;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.savebtn{display:block;width:100%;height:32px;border:0;border-radius:var(--r6);background:var(--ink);color:var(--on-ink);font:500 12px/20px var(--ui);letter-spacing:.04em}',
    '.savebtn[disabled]{background:var(--fill-selected);color:var(--ink);cursor:default}',
    '@supports (corner-shape:superellipse(1.4)){.pend{--r6:7.5px;--r8:10px;corner-shape:superellipse(1.4)}.savebtn{corner-shape:superellipse(1.4)}}',
    '@media (prefers-reduced-motion:reduce){.pend{transition:none}}'
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
  var FOOD = /餐廳|餐館|食堂|小吃|拉麵|麵店|烏龍麵|蕎麥|壽司|燒肉|居酒屋|咖啡|茶館|茶屋|甜點|麵包|烘焙|酒吧|料理|定食|火鍋|牛排|早午餐|レストラン|ラーメン|カフェ|restaurant|caf[eé]|coffee|bakery|\bbar\b|bistro|ramen|sushi|diner|\bpub\b/i;
  function guess(name) {
    var kind = '';
    try { var b = document.querySelector('button[jsaction*="category"]'); if (b) kind = b.textContent || ''; } catch (e) {}
    var t = kind + ' ' + name;
    if (STAY.test(t)) return 'stay';
    if (TRANSIT.test(kind) || TRANSIT.test(name)) return 'transit';
    if (FOOD.test(t)) return 'food';
    return 'sight';
  }

  /* ---- what the extension knows: the trip the site is showing, what it holds, what is waiting to go there ---- */
  var state = { trip: null, fids: [], inbox: [] };
  function isSaved(p) {
    var tid = state.trip ? state.trip.id : null;
    if (p.fid && state.fids.indexOf(p.fid) >= 0) return true;
    return state.inbox.some(function (it) {
      return (it.tripId || null) === tid && (p.fid ? it.fid === p.fid : it.name === p.name && it.lat === p.lat && it.lng === p.lng);
    });
  }

  /* ---- the card ---- */
  var host = null, root = null, box = null, cur = null, closedKey = '', touched = false;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hide() { if (host) { host.remove(); host = null; root = null; box = null; } }
  function draw(fresh) {
    if (!cur) { hide(); return; }
    if (!host) {
      host = document.createElement('div');
      host.id = 'plan-a-trip-card';
      root = host.attachShadow({ mode: 'open' });
      /* a stylesheet object rather than a <style> tag, so it works whatever the page's rules on inline styles are */
      try { var sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); root.adoptedStyleSheets = [sheet]; }
      catch (e) { var st = document.createElement('style'); st.textContent = CSS; root.appendChild(st); }
      box = document.createElement('div');
      root.appendChild(box);
      root.addEventListener('click', onClick);
      document.documentElement.appendChild(host);
      fresh = true;
    }
    var saved = isSaved(cur);
    box.innerHTML = '<div class="pend' + (fresh ? '' : ' in') + '" role="group" aria-label="存到 Plan a Trip">' +
      '<div class="pend-top"><span class="pend-name">' + esc(cur.name) + '</span><button class="xbtn" data-act="close" aria-label="關閉" title="關閉">' + X + '</button></div>' +
      '<div class="chips">' + CATS.map(function (c) {
        return '<button class="chip' + (cur.cat === c[0] ? ' on' : '') + '" data-act="cat" data-cat="' + c[0] + '" aria-pressed="' + (cur.cat === c[0]) + '"' + (saved ? ' disabled' : '') + '>' + glyph(c[0]) + c[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="dest">存到：' + esc(state.trip ? state.trip.title : 'Plan a Trip 目前的旅行') + '</p>' +
      '<button class="savebtn" data-act="save"' + (saved ? ' disabled' : '') + '>' + (saved ? '已儲存' : '存到想去的地方') + '</button></div>';
    if (fresh) setTimeout(function () { var el = root && root.querySelector('.pend'); if (el) el.classList.add('in'); }, 30);
  }
  function onClick(e) {
    e.stopPropagation();
    var a = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!a || !cur) return;
    var act = a.getAttribute('data-act');
    if (act === 'close') { closedKey = cur.key; cur = null; hide(); }
    else if (act === 'cat') { cur.cat = a.getAttribute('data-cat'); touched = true; draw(); }
    else if (act === 'save') {
      if (!alive()) { a.textContent = '請重新整理這個分頁'; return; }
      var item = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), tripId: state.trip ? state.trip.id : null,
        name: cur.name, lat: cur.lat, lng: cur.lng, cat: cur.cat, fid: cur.fid, at: Date.now() };
      state.inbox = state.inbox.concat([item]);
      S.set({ pat_inbox: state.inbox });
      draw();
    }
  }

  /* ---- follow the page: Google Maps changes its address without loading a new page ---- */
  var lastHref = '';
  function look() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    var p = parse(lastHref);
    if (!p) { cur = null; hide(); return; }
    if (cur && cur.key === p.key) return;
    if (p.key === closedKey) return;
    closedKey = '';
    touched = false;
    p.cat = guess(p.name);
    cur = p;
    hide();
    draw(true);
    /* the kind of place appears a moment after the address changes: guess once more unless a chip was chosen */
    setTimeout(function () { if (cur === p && !touched) { var c = guess(p.name); if (c !== p.cat) { p.cat = c; draw(); } } }, 1500);
  }
  function refresh() {
    if (!alive()) return;
    S.get(['pat_trip', 'pat_fids', 'pat_inbox'], function (r) {
      r = r || {};
      state.trip = r.pat_trip || null; state.fids = r.pat_fids || []; state.inbox = r.pat_inbox || [];
      if (cur) draw();
    });
  }
  chrome.storage.onChanged.addListener(function (changes, area) { if (area === 'local') refresh(); });
  refresh();
  setInterval(look, 500);
  look();
})();
