/* Runs on the Plan a Trip site. It carries two things between the page and the extension's own storage:
     - from the page: which trip is being shown and which Google places it already holds (so the card on Google Maps
       can say where a place will go and whether it is already saved)
     - to the page: the places saved on Google Maps since the site was last open (the "inbox")
   The page and this script can only talk through window messages; see "browser extension" in js/main.js. */
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
  window.addEventListener('message', function (e) {
    if (e.source !== window || e.origin !== location.origin || !alive()) return;
    var m = e.data;
    if (!m || m.from !== 'plan-a-trip') return;
    if (m.type === 'state') {
      var trip = m.trip && typeof m.trip.id === 'string' ? { id: m.trip.id, title: String(m.trip.title || '').slice(0, 60) } : null;
      S.set({ pat_trip: trip, pat_fids: Array.isArray(m.fids) ? m.fids.slice(0, 5000) : [] }, deliver);
    } else if (m.type === 'took' && Array.isArray(m.ids)) {
      S.get(['pat_inbox'], function (r) {
        var left = ((r && r.pat_inbox) || []).filter(function (it) { return m.ids.indexOf(it.id) < 0; });
        S.set({ pat_inbox: left });
      });
    }
  });
  /* a place saved on Google Maps while this tab is open shows up here straight away */
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes.pat_inbox && (changes.pat_inbox.newValue || []).length) deliver();
  });
  /* the page may have started before this script: ask it to say which trip it is showing */
  window.postMessage({ from: 'plan-a-trip-ext', type: 'hello' }, location.origin);
})();
