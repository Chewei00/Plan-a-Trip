/* Runs on the SomeDay site. It carries two things between the page and the extension's own storage (and lets the
   page switch the extension on, see 'switch-on'):
     - from the page: the trips there are, which one is on screen, which Google places each already holds (so the
       bar on Google Maps can list the trips and the card can say whether a place is already saved), and how many
       places each trip has in each category (for the four counts in the bar). The page tells of every place by
       name; only the counts are kept
     - to the page: the places saved on Google Maps since the site was last open (the "inbox"), and, when "Open
       SomeDay" was pressed in the bar on Google Maps, which trip the bar is on, for the page to show ('show')
   The page and this script can only talk through window messages; see "browser extension" in js/main.js.

   Which trip a place is saved to (pat_target) is whichever was chosen last: picked in the bar on Google Maps, or
   switched to on the site. So it follows the site only when the trip on screen there actually changes. */
(function () {
  'use strict';
  var S = chrome.storage.local;
  function alive() { try { return !!chrome.runtime.id; } catch (e) { return false; } }
  function deliver() {
    if (!alive()) return;
    S.get(['pat_inbox'], function (r) {
      var items = (r && r.pat_inbox) || [];
      if (items.length) window.postMessage({ from: 'plan-a-trip-ext', type: 'inbox', items: items }, location.origin);
    });
  }
  function clean(t) { return t && typeof t.id === 'string' ? { id: t.id, title: String(t.title || '').slice(0, 60) } : null; }
  function tally(list) {
    var n = { sight: 0, food: 0, stay: 0, transit: 0 };
    list.forEach(function (p) { if (!p || typeof p !== 'object') return; n[Object.prototype.hasOwnProperty.call(n, p.c) ? p.c : 'sight']++; });
    return n;
  }
  window.addEventListener('message', function (e) {
    if (e.source !== window || e.origin !== location.origin || !alive()) return;
    var m = e.data;
    if (!m || m.from !== 'plan-a-trip') return;
    if (m.type === 'state') {
      var trip = clean(m.trip), trips = (Array.isArray(m.trips) ? m.trips : []).map(clean).filter(Boolean).slice(0, 200);
      var saved = {};
      if (m.saved && typeof m.saved === 'object') trips.forEach(function (t) { if (Array.isArray(m.saved[t.id])) saved[t.id] = m.saved[t.id].slice(0, 5000); });
      var counts = {};
      if (m.places && typeof m.places === 'object') trips.forEach(function (t) { if (Array.isArray(m.places[t.id])) counts[t.id] = tally(m.places[t.id].slice(0, 5000)); });
      S.get(['pat_site_trip', 'pat_target', 'pat_show'], function (r) {
        r = r || {};
        var set = { pat_trips: trips, pat_saved: saved, pat_counts: counts, pat_site_trip: trip ? trip.id : null };
        var known = trips.some(function (t) { return t.id === r.pat_target; });
        if (trip && (!known || trip.id !== r.pat_site_trip)) set.pat_target = trip.id;
        /* this tab was opened by "Open SomeDay" a moment ago: ask the page for the trip the bar is on, before it is
           handed what was saved, so that a place just saved is on screen when it arrives. The wish is used once, and
           one left over from a tab that never opened is forgotten */
        var w = r.pat_show;
        if (w) {
          S.remove('pat_show');
          if (typeof w.id === 'string' && Date.now() - w.at < 60000 && trips.some(function (t) { return t.id === w.id; }) && !(trip && trip.id === w.id)) show(w.id);
        }
        S.set(set, deliver);
        S.remove('pat_places');   /* 0.4.5, never released, kept the names here */
      });
    } else if (m.type === 'switch-on') {
      /* the empty Travel Collection on the site was clicked: it opens Google Maps, and the card should be there */
      S.set({ pat_on: true });
    } else if (m.type === 'took' && Array.isArray(m.ids)) {
      S.get(['pat_inbox'], function (r) {
        var left = ((r && r.pat_inbox) || []).filter(function (it) { return m.ids.indexOf(it.id) < 0; });
        S.set({ pat_inbox: left });
      });
    }
  });
  /* "Open SomeDay" with this tab already open: the background tells it which trip the bar is on */
  function show(id) { window.postMessage({ from: 'plan-a-trip-ext', type: 'show', id: id }, location.origin); }
  chrome.runtime.onMessage.addListener(function (m) { if (m && m.type === 'show' && typeof m.id === 'string' && alive()) show(m.id); });
  /* a place saved on Google Maps while this tab is open shows up here straight away */
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes.pat_inbox && (changes.pat_inbox.newValue || []).length) deliver();
  });
  /* the page may have started before this script: ask it to say which trip it is showing */
  window.postMessage({ from: 'plan-a-trip-ext', type: 'hello' }, location.origin);
})();
