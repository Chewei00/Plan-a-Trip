/* Runs on the Google Maps website. The extension's toolbar button turns it on and off (background.js), and the Plan a
   Trip site can turn it on (site.js); while it is on, two things sit in the top-right corner of the page:
     - a bar with the name of the trip places are saved to. Clicking it lists the trips, to save to another one, and
       ends with a link that opens SomeDay
     - under it, whenever the page is showing one place, the same card the SomeDay site shows after a search:
       the place's name, the four categories, and the button that saves it
   Off, there is nothing on the page at all.

   Only the place being looked at is read, and only from the address of the page:
     https://www.google.com/maps/place/<name>/@<view>/data=...!1s<place id>...!3d<lat>!4d<lng>...
   (the address can describe two places at once; see parse)
   Nothing is read from Google's lists of saved places, and nothing is sent anywhere: a saved place is kept in the
   extension's own storage (the "inbox") until the SomeDay site is open in this browser, which then takes it
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
    food: '<path d="M5.2 4.6v2.2a1.4 1.4 0 0 0 2.8 0V4.6M6.6 4.6v8.8M11.6 8.6v4.8M10.1 6.6a1.5 2 0 1 0 3 0a1.5 2 0 1 0-3 0z"/>',
    stay: '<path d="M4.5 5.6v7M4.5 11h9v1.6M7.4 11V8.6h4.1a2 2 0 0 1 2 2V11"/>',
    transit: '<path d="M7.4 4.4h3.2a1.8 1.8 0 0 1 1.8 1.8v3.8a1.8 1.8 0 0 1-1.8 1.8H7.4a1.8 1.8 0 0 1-1.8-1.8V6.2a1.8 1.8 0 0 1 1.8-1.8zM5.6 8.4h6.8M7 11.8l-1 1.8M11 11.8l1 1.8"/><circle cx="7.6" cy="10.1" r=".6" fill="currentColor" stroke="none"/><circle cx="10.4" cy="10.1" r=".6" fill="currentColor" stroke="none"/>'
  };
  function glyph(id) { return '<svg viewBox="3 3 12 12" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + GLYPH[id] + '</svg>'; }
  /* points right; turns a quarter, to point down, while the list of trips is open (like a day's arrow on the site) */
  var CHEV = '<svg class="chev" viewBox="0 0 6 10" aria-hidden="true"><path d="M1 1l4 4-4 4"/></svg>';
  /* the menu's icons, the same as the trip menu's on the site (js/icons.js): a pin in front of each trip, a round tick
     on the one places go to, the site's own icon (the D on its disc, 16 across: at 12 its lines would be under a pixel; it
     sits in the same 12 as the pins, overhanging by 2 each way), and an arrow whose shaft grows when the row is
     pointed at */
  var PIN = '<svg class="mico" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .6a3.9 3.9 0 0 1 3.9 3.9c0 2.3-2.6 5.4-3.9 6.9C4.7 9.9 2.1 6.8 2.1 4.5A3.9 3.9 0 0 1 6 .6z"/><circle cx="6" cy="4.5" r="1.55"/></svg>';
  var TICK = '<span class="rck"><svg viewBox="0 0 13 13" aria-hidden="true"><path d="M3.63 5.95l2.05 2.87c.08.11.24.11.32.01l3.36-4.2"/></svg></span>';
  var DMARK = '<svg class="dmark" viewBox="16 16 96 96" aria-hidden="true"><rect x="16" y="16" width="96" height="96" rx="48" fill="#F1EFE9"/><path d="M82 64C82 61.3186 81.5757 58.2477 79.041 55.5625C76.2225 52.5782 73.0916 52 68.4707 52H52V76H68.4707C73.0916 76 76.2225 75.4218 79.041 72.4375C81.5757 69.7523 82 66.6814 82 64ZM88 64C88 67.3179 87.4749 72.2483 83.4004 76.5625C78.8569 81.372 73.6158 82 68.4707 82H46V46H68.4707C73.6158 46 78.8569 46.628 83.4004 51.4375C87.4749 55.7517 88 60.6821 88 64Z" fill="#8A8579"/></svg>';
  var ARROW = '<span class="arr" aria-hidden="true"><i></i><svg viewBox="4.5 0 6 9.5"><path d="M5.2 .5 9.45 4.75 5.2 9"/></svg></span>';

  /* same values as css/app.css on the site */
  var CSS = [
    ':host{all:initial}',
    '.wrap{--surface:#fefefe;--ink:#333;--on-ink:#fefefe;--text-2:rgba(0,0,0,.5);--text-3:rgba(0,0,0,.4);--line:#d2d2d2;--line-soft:#e5e5e5;--fill-note:rgba(0,0,0,.04);--fill-track:rgba(0,0,0,.05);--r6:6px;--r8:8px;',
    '  --float:0 4px 14px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.04);--ui:"Noto Sans","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;',
    '  position:fixed;top:64px;right:16px;z-index:2147483646;width:236px;display:flex;flex-direction:column;gap:8px;color:var(--ink);font:400 13px/20px var(--ui);-webkit-font-smoothing:antialiased;',
    '  opacity:0;transform:translateY(-6px);transition:opacity .25s ease,transform .25s ease}',
    '.wrap.in{opacity:1;transform:none}',
    '.wrap *{box-sizing:border-box}',
    'button{font:inherit;color:inherit;cursor:pointer;margin:0}',
    'button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}',
    'svg{display:block;flex:none;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round}',
    '.bar{position:relative;border-radius:var(--r8);background:var(--surface);box-shadow:var(--float)}',
    '.trip{display:flex;align-items:center;gap:8px;width:100%;height:36px;padding:0 12px;border:0;border-radius:var(--r8);background:none;text-align:left;font:500 13px/20px var(--ui);letter-spacing:.04em}',
    '.trip span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    /* words beside an icon (.t) are centred on it by the words themselves, not by their line. A line keeps room under
       the letters for tails, and where the product's own font is not there (this is Google's page: the computer's own
       Chinese font is used) the characters sit lower in it still. So the box is cut down to capital height
       (text-box), which pins the baseline to its foot, and level() then moves it by however far the middle of the ink
       of that font is from the middle of that box. Where the words can be cut short, 4px each way keeps their tops
       and tails from being cut off with them */
    '.t{display:block;text-box:trim-both cap alphabetic}',
    '.trip .t,.menu button .t{padding-block:4px;margin-block:-4px}',
    '.chev{width:6px;height:10px;stroke-width:1.5;transition:transform .25s ease}',
    '.bar.open .chev{transform:rotate(90deg)}',
    '.menu{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:2;padding:6px;border-radius:var(--r8);background:var(--surface);box-shadow:var(--float)}',
    '.menu button{display:flex;align-items:center;gap:9px;width:100%;height:32px;padding:0 8px;border:0;border-radius:var(--r6);background:none;text-align:left;font:400 13px/20px var(--ui);white-space:nowrap}',
    '.menu button span{min-width:0;overflow:hidden;text-overflow:ellipsis}',
    '.menu button:hover,.menu button:focus-visible{background:var(--fill-note)}',
    '.mico{width:12px;height:12px;stroke-width:1}',
    '.dmark{width:16px;height:16px;margin:-2px;stroke:none}',
    '.rck{flex:none;width:12px;height:12px;margin-left:auto;border-radius:50%;background:var(--ink);color:var(--on-ink)}',
    '.rck svg{width:12px;height:12px;stroke-width:1}',
    /* shaft and head overlap: both solid, and the whole arrow made 40% at once (see .arr in css/app.css). The 2px on
       top puts the shaft through the middle of the lower-case letters */
    '.arr{position:relative;flex:none;width:10.5px;height:10px;margin:2px 0 0 auto;opacity:.4;transition:width .45s ease}',
    '.arr i{position:absolute;left:0;right:1.5px;top:4.5px;height:1.5px;background:#000}',
    '.arr svg{position:absolute;right:0;top:.5px;width:6px;height:9.5px;overflow:visible;stroke:#000;stroke-width:1.5;stroke-linecap:butt;stroke-linejoin:miter}',
    '.menu button:hover .arr,.menu button:focus-visible .arr{width:16.6px}',
    '@keyframes menu-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}',
    '.menu.pop{animation:menu-in .2s ease}',
    '@keyframes menu-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-4px)}}',
    '.menu.out{animation:menu-out .15s ease forwards;pointer-events:none}',
    '.sep{height:1px;margin:6px 8px;background:var(--line-soft)}',
    '.pend{padding:10px;border-radius:var(--r8);background:var(--surface);box-shadow:var(--float);transition:opacity .2s ease}',
    '.pend.out{opacity:0}',
    '.pend-name{font:500 13px/20px var(--ui);letter-spacing:.04em;padding:2px 2px 0;overflow-wrap:anywhere}',
    /* the categories are one control, as on the site's own save card (0.4.7, 2026-10-10; see .chips in css/app.css):
       a pale track across the card, four equal parts in one row, and a white piece under the one in force, which
       slides to it. The piece is the track's ::before at --i. Until the page has said what kind of place this is no
       category is in force (.none): the piece is not there, and comes in where it belongs. Everything is drawn afresh
       each time, so the track is drawn as it was and then switched (see draw) */
    '.chips{position:relative;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px;padding:2px;margin:12px 0 14px;border-radius:999px;background:var(--fill-track)}',
    '.chips::before{content:"";position:absolute;left:2px;top:2px;bottom:2px;width:calc((100% - 10px)/4);border-radius:999px;background:var(--surface);box-shadow:0 1px 3px rgba(0,0,0,.14);transform:translateX(calc(var(--i,0)*(100% + 2px)));transition:transform .25s ease,opacity .2s ease}',
    '.chips.none::before{opacity:0}',
    '.chip{position:relative;display:flex;align-items:center;justify-content:center;gap:4px;height:26px;padding:0;border:0;border-radius:999px;background:none;font:500 12px/20px var(--ui);letter-spacing:.04em;white-space:nowrap;transition:background-color .15s ease}',
    '.chip:not(.on):not([disabled]):hover{background:var(--fill-note)}',
    '.chip svg{width:12px;height:12px}',
    '.chip[disabled]{cursor:default}',
    '.savebtn{display:block;width:100%;height:32px;border:0;border-radius:var(--r6);background:var(--ink);color:var(--on-ink);font:500 12px/20px var(--ui);letter-spacing:.04em}',
    '.savebtn:not([disabled]){transition:background-color .15s ease}',
    '.savebtn:not([disabled]):hover{background:#000}',
    '.savebtn[disabled]{background:var(--line-soft);color:var(--text-3);cursor:default}',
    /* just pressed: the button turns into "Added" instead of being swapped for it. It hops (Chewei's idea, 2026-10-09;
       the numbers were chosen on a preview page): up 2px in the first quarter, fast then slowing, back down by 78%,
       sinking half a pixel past where it rests, then settling; .4s in all. The old words go while it rises, "Added"
       comes from the top of the hop as it falls, and the colour runs across from 10% to 70%. These are animations,
       not transitions, so that a button drawn again part-way through can be told how far along it is (see draw) */
    '@keyframes added-hop{0%{transform:translateY(0);animation-timing-function:cubic-bezier(.2,.7,.3,1)}25%{transform:translateY(-2px);animation-timing-function:cubic-bezier(.55,0,.45,1)}78%{transform:translateY(.5px);animation-timing-function:cubic-bezier(.3,0,.3,1)}100%{transform:translateY(0)}}',
    '@keyframes added-bg{0%,10%{background-color:var(--ink)}70%,100%{background-color:var(--line-soft)}}',
    '@keyframes added-out{0%{opacity:1}25%,100%{opacity:0}}',
    '@keyframes added-in{0%,25%{opacity:0}70%,100%{opacity:1}}',
    '.savebtn.adding{position:relative;animation:added-bg .4s linear both,added-hop .4s linear both}',
    '.savebtn.adding .was{color:var(--on-ink);animation:added-out .4s linear both}',
    '.savebtn.adding .now{position:absolute;left:0;right:0;top:6px;animation:added-in .4s linear both}',
    /* under the trip's name, in the same bar: how many places the trip has in each of the four categories, an icon and
       a number each, all in the one colour (Chewei's drawing from Figma, 2026-10-10: the bar 70 high, each 33 x 19
       with a 1px line, 6 apart, 12 from the left and from the foot, icon 10 with 6 to its left, number 11px and 4
       after the icon). They are a reading, not buttons, and none is lit. At a press the number of the category the
       place went into rolls: the old one goes up and out, the new one comes up from below into its place, cut off by
       the pill's own edge */
    '.counts{display:flex;gap:6px;padding:3px 12px 12px}',
    '.pill{display:inline-flex;align-items:center;gap:4px;height:19px;padding:0 5px;border:1px solid var(--line);border-radius:999px;font:500 11px/17px var(--ui);color:var(--ink);font-variant-numeric:tabular-nums;cursor:default}',
    '.pill svg{width:10px;height:10px}',
    /* the number is centred on the icon by the height of its figures, not of its line: a line keeps room under the
       figures for the tails of letters, which put them visibly lower than the icon. text-box cuts the box down to the
       figures themselves, whatever font the computer ends up using (without it, Chrome before 133, the line is centred
       as before). Old and new number share one cell, so the box is as wide as the wider of them */
    '.num{display:grid;align-items:center;height:17px;overflow:hidden}',
    '.num span{grid-area:1/1;display:block;text-box:trim-both cap alphabetic}',
    '@keyframes num-out{from{transform:translateY(0)}to{transform:translateY(-14px)}}',
    '@keyframes num-in{from{transform:translateY(14px)}to{transform:translateY(0)}}',
    '.num.roll .was{animation:num-out .3s cubic-bezier(.3,0,.3,1) both}',
    '.num.roll .now{animation:num-in .3s cubic-bezier(.3,0,.3,1) both}',
    '@supports (corner-shape:superellipse(1.4)){.wrap{--r6:7.5px;--r8:10px}.bar,.trip,.menu,.menu button,.pend,.savebtn{corner-shape:superellipse(1.4)}}',
    '@media (prefers-reduced-motion:reduce){.wrap,.chev,.pend,.arr,.chips::before{transition:none}.menu.pop{animation:none}.menu.out{display:none}}'
  ].join('\n');

  /* ---- reading the place from the page address ----
     The data part of the address is a tree written out flat: pieces "!<field><type><value>", where type m means
     "a group made of the next <value> pieces". The place that is open is the group 3 directly inside group 4; in it,
     piece 1 is the place's identifier and group 8 holds its latitude (3) and longitude (4):
       !3m1!4b1 !4m6 !3m5 !1s<id> !8m2 !3d<lat> !4d<lng> !16s...
     After a search, or with one place open and another clicked on the map, group 4 also carries a group 1 in front,
     describing what was searched for or the place that was open first, with an identifier and a position of its own:
       !4m14 !1m7 !3m6 !1s<first id> !2z<its name> !8m2 !3d.. !4d.. !16z..  !3m5 !1s<id> !8m2 !3d<lat> !4d<lng> !16s..
     so the pieces have to be read by where they sit, not by which comes first. */
  function tree(data) {
    var toks = data.split('!').filter(Boolean), i = 0, ok = true;
    function nodes(end) {
      var out = [];
      while (ok && i < end) {
        var m = /^(\d+)([a-z])(.*)$/.exec(toks[i++]);
        if (!m) { ok = false; break; }
        var n = { f: +m[1], t: m[2], v: m[3] };
        if (n.t === 'm') {
          var c = +n.v;
          if (!(c >= 0) || i + c > end) { ok = false; break; }
          n.kids = nodes(i + c);
        }
        out.push(n);
      }
      return out;
    }
    var top = nodes(toks.length);
    return ok ? top : null;
  }
  function pick(list, f, t) {   /* the last piece with this field and type */
    for (var i = (list || []).length - 1; i >= 0; i--) if (list[i].f === f && list[i].t === t) return list[i];
    return null;
  }
  var FID = /^0x[0-9a-f]+:0x[0-9a-f]+$/i;
  function placeIn(data) {
    var top = tree(data), g = top && pick(top, 4, 'm'), pl = g && pick(g.kids, 3, 'm'), pos = pl && pick(pl.kids, 8, 'm');
    var lat = pos && pick(pos.kids, 3, 'd'), lng = pos && pick(pos.kids, 4, 'd'), id = pl && pick(pl.kids, 1, 's');
    if (lat && lng) return { lat: lat.v, lng: lng.v, fid: id && FID.test(id.v) ? id.v : '' };
    /* not the shape described above: take the last position in the address, and the identifier just before it */
    var re = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g, m, last = null;
    while ((m = re.exec(data))) last = m;
    if (!last) return null;
    var ids = data.slice(0, last.index).match(/!1s0x[0-9a-f]+:0x[0-9a-f]+/gi);
    return { lat: last[1], lng: last[2], fid: ids ? ids[ids.length - 1].slice(3) : '' };
  }
  function parse(href) {
    var m = /\/maps\/place\/([^\/]+)\/(?:[^\/]*\/)?data=([^?#]*)/.exec(href);
    if (!m) return null;
    var name;
    try { name = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return null; }
    name = name.replace(/\s+/g, ' ').trim().slice(0, 40);
    var o = name ? placeIn(m[2]) : null, lat = o ? +o.lat : NaN, lng = o ? +o.lng : NaN;
    if (!o || !(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)) return null;
    var fid = o.fid.toLowerCase();
    /* What makes two addresses the same place: Google's identifier when there is one. The position cannot be part of
       it: half a second after a place is opened Google writes its address again with the last digits of the position
       changed (seen on the real site, 2026-10-10: !3d25.0351702!4d121.5628678, then !3d25.0351708!4d121.5628669), and
       the card would take that for another place and start over, its category going out and coming in again. With no
       identifier, the name and the position to five places (about a metre) */
    return { key: fid || name + '|' + lat.toFixed(5) + ',' + lng.toFixed(5), name: name, lat: lat, lng: lng, fid: fid };
  }
  /* The kind of place Google shows under the name ("主題公園", "拉麵店"). The panel is drawn a moment after the address
     changes and until then still shows the place before, so it is read only once the panel's heading is this place.
     null: the panel is not showing this place yet. '': it is, and no kind is given. */
  function kindOf(name) {
    try {
      var hs = document.querySelectorAll('h1');
      for (var i = 0; i < hs.length; i++) {
        if ((hs[i].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) !== name) continue;
        var b = (hs[i].closest('[role="main"]') || document).querySelector('button[jsaction*="category"]');
        return b ? (b.textContent || '').trim() : '';
      }
    } catch (e) {}
    return null;
  }
  /* a first guess at the category, from that kind and from the name itself. It is only a starting point: the chips
     change it */
  var STAY = /飯店|酒店|旅館|旅店|民宿|旅舍|膠囊|溫泉旅|ホテル|ゲストハウス|hotel|hostel|\binn\b|resort|ryokan|guest ?house/i;
  var TRANSIT = /車站|火車站|地鐵站|捷運站|巴士站|公車站|轉運站|機場|航廈|渡輪|碼頭|駅|バス停|station|airport|terminal|站$/i;
  var FOOD = /餐廳|餐館|食堂|小吃|拉麵|麵店|烏龍麵|蕎麥|壽司|燒肉|居酒屋|咖啡|茶館|茶屋|甜點|甜品|糕餅|糖果|蛋糕|和菓子|冰淇淋|麵包|烘焙|スイーツ|酒吧|料理|定食|火鍋|牛排|扒房|早午餐|レストラン|ラーメン|カフェ|restaurant|caf[eé]|coffee|bakery|\bbar\b|bistro|ramen|sushi|diner|\bpub\b/i;
  function guess(name, kind) {
    kind = kind || '';
    var t = kind + ' ' + name;
    if (STAY.test(t)) return 'stay';
    if (TRANSIT.test(kind) || TRANSIT.test(name)) return 'transit';
    if (FOOD.test(t)) return 'food';
    return 'sight';
  }

  /* ---- what the extension knows: whether it is on, the trips on the site, the one to save to, what each already
          holds, and what is waiting to go there ---- */
  var state = { on: false, trips: [], target: null, saved: {}, inbox: [], counts: {} };
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

  /* how many places the trip that places go to has in one category: what the site last told of, and what was saved
     here and is still waiting to be taken there (once taken, its fid is among the trip's saved ones and the site's
     own count has it) */
  function count(cat) {
    var t = trip(), tid = t ? t.id : null, n = (tid && state.counts[tid] && state.counts[tid][cat]) || 0, saved = (tid && state.saved[tid]) || [];
    state.inbox.forEach(function (it) { if ((it.tripId || null) === tid && it.cat === cat && !(it.fid && saved.indexOf(it.fid) >= 0)) n++; });
    return n;
  }

  /* see .t in the styles. How far above the baseline the middle of the ink is, for Chinese or Japanese (measured on
     one full character) or for Latin (on a capital), is asked of a canvas once for each font and kept. Whether the
     browser has cut the box down (Chrome 133 on) is read off the box itself: it is then lower than the letters are
     tall; otherwise it is a whole line, and is left where it is */
  var inkAt = {}, pen = null;
  function inkMid(font, cjk) {
    var k = font + '|' + cjk;
    if (!(k in inkAt)) {
      try {
        pen = pen || document.createElement('canvas').getContext('2d');
        pen.font = font;
        var m = pen.measureText(cjk ? '\u570b' : 'H');
        inkAt[k] = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
      } catch (e) { inkAt[k] = null; }
    }
    return inkAt[k];
  }
  function level() {
    if (!box) return;
    [].forEach.call(box.querySelectorAll('.t'), function (el) {
      var cs = getComputedStyle(el), mid = inkMid(cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily, /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(el.textContent));
      var r = el.getBoundingClientRect(), cap = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (mid == null || !isFinite(mid) || !(cap > 0) || cap >= parseFloat(cs.fontSize)) return;
      /* the baseline is put on a whole pixel of the screen, the nearest to where it should be: left between two, the
         browser picks one itself, and on an ordinary (1x) screen that can be a whole pixel off */
      var base = r.bottom - parseFloat(cs.paddingBottom), dpr = window.devicePixelRatio || 1;
      el.style.translate = '0 ' + (Math.round((base + mid - cap / 2) * dpr) / dpr - base).toFixed(3) + 'px';
    });
  }

  /* ---- the bar and the card ---- */
  var host = null, root = null, box = null, cur = null, menuOpen = false, popMenu = false, touched = false;
  /* The list of trips comes in when it opens and goes out when it closes; the arrow turns with it. Everything is drawn
     afresh each time, so the bar is drawn as it was (shownOpen) and then switched, which is what lets the arrow turn;
     a list that is closing is drawn once more, going out, and taken away when it has gone */
  var shownOpen = false, menuClosing = false, closeT = 0;
  var ADDING = 400, added = null, addedT = 0;
  /* where the white piece was last drawn (-1: nowhere), so that it can be drawn there again and then sent to where it
     belongs. It is kept from one place to the next for as long as the card stays up: while the page has not yet said
     what kind of place the new one is, the piece stays where it was, and then either does not move at all (the same
     category as the place before: Chewei, 2026-10-10, "steady, as if nothing changed") or slides to the new one. For
     that moment it lies under the last place's category, not this one's; a press on Add then saves what the name
     says, and the piece goes there. Only a card that has just come up has no piece, and it comes in */
  var shownIx = -1;
  function catIx(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i][0] === id) return i; return -1; }
  function calm() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function setMenu(open) {
    if (open === menuOpen) return;
    menuOpen = open;
    clearTimeout(closeT);
    popMenu = open; menuClosing = !open;
    if (!open) closeT = setTimeout(function () { menuClosing = false; var m = box && box.querySelector('.menu'); if (m) m.remove(); }, 150);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hide() { if (host) { host.remove(); host = null; root = null; box = null; } clearTimeout(closeT); menuOpen = shownOpen = menuClosing = false; shownIx = -1; }
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
    h += '<div class="bar' + (shownOpen ? ' open' : '') + '"><button class="trip" data-act="menu" aria-haspopup="menu" aria-expanded="' + menuOpen + '" title="要存到哪一趟旅行"><span class="t">' + esc(t ? t.title : 'SomeDay') + '</span>' + CHEV + '</button>';
    /* pressed a moment ago: the number of the category the place went into rolls, as far along as it has got */
    var gone = cur && added && added.key === cur.key ? Date.now() - added.at : -1, going = gone >= 0 && gone < ADDING;
    h += '<div class="counts" role="group" aria-label="Travel Collection">' + CATS.map(function (c) {
      var n = count(c[0]), roll = going && cur.cat === c[0] && n > 0;
      return '<span class="pill" title="' + c[1] + '" aria-label="' + c[1] + ' ' + n + '">' + glyph(c[0]) +
        '<span class="num' + (roll ? ' roll' : '') + '">' + (roll ? '<span class="was" aria-hidden="true">' + (n - 1) + '</span>' : '') + '<span class="now">' + n + '</span></span></span>';
    }).join('') + '</div>';
    if (menuOpen || menuClosing) {
      h += '<div class="menu' + (menuOpen ? (popMenu ? ' pop' : '') : ' out') + '" role="menu">' + state.trips.map(function (x) {
        return '<button role="menuitem" data-act="pick" data-id="' + esc(x.id) + '">' + PIN + '<span class="t">' + esc(x.title) + '</span>' + (t && x.id === t.id ? TICK : '') + '</button>';
      }).join('') + (state.trips.length ? '<div class="sep"></div>' : '') +
        '<button role="menuitem" data-act="open">' + DMARK + '<span class="t">Open SomeDay</span>' + ARROW + '</button></div>';
    }
    h += '</div>';
    if (cur) {
      var saved = isSaved(cur);
      /* pressed a moment ago: draw the button on its way to "Added", as far along as it has got */
      h += '<div class="pend" role="group" aria-label="Add to Travel Collection"><div class="pend-name">' + esc(cur.name) + '</div>' +
        '<div class="chips' + (shownIx >= 0 ? '' : ' none') + '">' + CATS.map(function (c) {
          return '<button class="chip' + (cur.cat === c[0] ? ' on' : '') + '" data-act="cat" data-cat="' + c[0] + '" aria-pressed="' + (cur.cat === c[0]) + '"' + (saved ? ' disabled' : '') + '>' + glyph(c[0]) + '<span class="t">' + c[1] + '</span></button>';
        }).join('') + '</div>' +
        (saved && going
          ? '<button class="savebtn adding" data-act="save" disabled aria-label="Added"><span class="was" aria-hidden="true">Add to Travel Collection</span><span class="now">Added</span></button></div>'
          : '<button class="savebtn" data-act="save"' + (saved ? ' disabled' : '') + '>' + (saved ? 'Added' : 'Add to Travel Collection') + '</button></div>');
    }
    popMenu = false;   /* the menu comes in when it opens, not each time the page is drawn again */
    box.innerHTML = h;
    /* the white piece: put where it was, then switched (see shownIx). From nowhere it comes in at its place; from
       another category it slides; with no category known yet it stays. Where it was is set here, not in the markup
       (a page may forbid styles written into tags), and before anything measures the page (level does): what the
       browser first sees of the new track is the piece where it was, or it would take the first category as the start
       and slide from there every time */
    var row = cur && box.querySelector('.chips'), ix = cur ? catIx(cur.cat) : -1, from = shownIx, to = ix >= 0 ? ix : from;
    if (row) row.style.setProperty('--i', String(Math.max(from >= 0 ? from : to, 0)));
    level();
    if (row && to !== from) { void row.offsetWidth; row.classList.remove('none'); row.style.setProperty('--i', String(to)); }
    shownIx = cur ? to : -1;   /* no card: the next one starts with no piece */
    if (cur && going) [].forEach.call(box.querySelectorAll('.savebtn.adding, .savebtn.adding span, .num.roll span'), function (el) { el.style.animationDelay = -gone + 'ms'; });
    if (shownOpen !== menuOpen) { var bar = box.querySelector('.bar'); void bar.offsetWidth; bar.classList.toggle('open', menuOpen); shownOpen = menuOpen; }
    if (fresh) setTimeout(function () { if (box) box.classList.add('in'); }, 30);
  }
  function onClick(e) {
    e.stopPropagation();
    var a = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!a) { if (menuOpen) { setMenu(false); draw(); } return; }
    var act = a.getAttribute('data-act');
    if (act === 'menu') { setMenu(!menuOpen); draw(); return; }
    if (!alive()) { a.textContent = '請重新整理這個分頁'; return; }
    if (act === 'pick') { state.target = a.getAttribute('data-id'); setMenu(false); S.set({ pat_target: state.target }); draw(); }
    else if (act === 'open') { setMenu(false); draw(); chrome.runtime.sendMessage({ type: 'open-site' }); }
    else if (act === 'cat' && cur) { cur.cat = a.getAttribute('data-cat'); touched = true; setMenu(false); draw(); }
    else if (act === 'save' && cur) {
      var t = trip();
      if (!cur.cat) cur.cat = guess(cur.name, kindOf(cur.name));
      var item = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), tripId: t ? t.id : null,
        name: cur.name, lat: cur.lat, lng: cur.lng, cat: cur.cat, fid: cur.fid, at: Date.now() };
      state.inbox = state.inbox.concat([item]);
      setMenu(false);
      /* only a press makes the button turn; changing trip or place shows "Added" as it is */
      clearTimeout(addedT);
      added = calm() ? null : { key: cur.key, at: Date.now() };
      if (added) addedT = setTimeout(function () { added = null; draw(); }, ADDING + 20);
      S.set({ pat_inbox: state.inbox });
      draw();
    }
  }
  /* a click anywhere else on the page closes the list of trips */
  document.addEventListener('pointerdown', function (e) {
    if (menuOpen && host && !(e.composedPath && e.composedPath().indexOf(host) >= 0)) { setMenu(false); draw(); }
  }, true);

  /* ---- follow the page: Google Maps changes its address without loading a new page ----
     Going from one place to the next, the address passes through forms that name no place. The card stays where it
     is through those and only its contents change; it goes away when there has been no place for a second. */
  var lastHref = '', goneT = 0, kindT = 0;
  function leave() {
    if (!cur || goneT) return;
    goneT = setTimeout(function () {
      var el = root && root.querySelector('.pend');
      if (el) el.classList.add('out');
      goneT = setTimeout(function () { goneT = 0; cur = null; draw(); }, 200);
    }, 1000);
  }
  /* the category is marked once, when the page shows what kind of place this is; if it does not within a few
     seconds, or gives no kind, the name alone decides. No chip is lit until then. */
  function settle(p) {
    var n = 0, shown = 0;
    clearInterval(kindT);
    kindT = setInterval(function () {
      if (cur !== p || touched || p.cat) { clearInterval(kindT); return; }
      var k = kindOf(p.name);
      n++;
      if (k !== null) shown++;
      if (k || shown >= 4 || n >= 15) { clearInterval(kindT); p.cat = guess(p.name, k); draw(); }
    }, 200);
  }
  function look() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    var p = parse(lastHref);
    if (!p) { leave(); return; }
    var leaving = goneT;
    clearTimeout(goneT); goneT = 0;
    if (cur && cur.key === p.key) {
      cur.lat = p.lat; cur.lng = p.lng;   /* the same place, its position as the address now gives it */
      if (cur.name !== p.name || leaving) { cur.name = p.name; draw(); }
      return;
    }
    touched = false;
    p.cat = '';
    cur = p;
    draw();
    settle(p);
  }
  function refresh() {
    if (!alive()) return;
    S.get(['pat_on', 'pat_trips', 'pat_target', 'pat_saved', 'pat_inbox', 'pat_counts'], function (r) {
      r = r || {};
      state.on = !!r.pat_on; state.trips = r.pat_trips || []; state.target = r.pat_target || null;
      state.saved = r.pat_saved || {}; state.inbox = r.pat_inbox || []; state.counts = r.pat_counts || {};
      draw();
    });
  }
  chrome.storage.onChanged.addListener(function (changes, area) { if (area === 'local') refresh(); });
  refresh();
  setInterval(look, 500);
  look();
})();
