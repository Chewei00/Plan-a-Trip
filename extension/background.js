/* The toolbar button. It is the extension's switch: a click while a Google Maps tab is in front turns saving on
   or off, for every Google Maps tab, and the choice is remembered (pat_on in the extension's storage; maps.js watches
   it). It is on from the moment it is installed. The SomeDay site can also turn it on (site.js), never off. The icon is the earth-coloured D; while it is on, the toolbar shows the blue one (icon-on-*). A click on any other site does nothing: the "activeTab" permission
   lets the click handler see the address of the tab that was clicked on, and only that. */
var SITE = 'https://chewei00.github.io/SomeDay/';
function icons(on) {
  var p = {};
  [16, 32, 48, 128].forEach(function (n) { p[n] = 'icon-' + (on ? 'on-' : '') + n + '.png'; });
  return p;
}
function paint(on) {
  chrome.action.setIcon({ path: icons(on) });
  chrome.action.setTitle({ title: on ? 'SomeDay: click to turn off' : 'SomeDay: click to turn on' });
}
function sync() { chrome.storage.local.get(['pat_on'], function (r) { paint(!!(r && r.pat_on)); }); }
var MAPS = /^https:\/\/www\.google\.com(\.tw)?\/maps(\/|\?|$)/;
/* newly installed, it is on (2026-10-10: someone who has just put it in wants to see it at once, and the icon is not on
   the toolbar until they pin it there). An update leaves the choice as it was */
chrome.runtime.onInstalled.addListener(function (d) {
  if (!d || d.reason !== 'install') { sync(); return; }
  chrome.storage.local.get(['pat_on'], function (r) {
    if (r && r.pat_on !== undefined) { sync(); return; }
    chrome.storage.local.set({ pat_on: true });
    paint(true);
  });
});
/* switched from somewhere else (the site): the button follows */
chrome.storage.onChanged.addListener(function (changes, area) { if (area === 'local' && changes.pat_on) paint(!!changes.pat_on.newValue); });
chrome.runtime.onStartup.addListener(sync);
chrome.action.onClicked.addListener(function (tab) {
  if (!tab || !MAPS.test(tab.url || '')) return;
  chrome.storage.local.get(['pat_on'], function (r) {
    var on = !(r && r.pat_on);
    chrome.storage.local.set({ pat_on: on });
    paint(on);
  });
});
/* "Open SomeDay" in the bar on Google Maps: go to the tab that already has it, or open one */
chrome.runtime.onMessage.addListener(function (m) {
  if (!m || m.type !== 'open-site') return;
  chrome.tabs.query({ url: SITE + '*' }, function (tabs) {
    if (tabs && tabs.length) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else chrome.tabs.create({ url: SITE });
  });
});
sync();
