/* The toolbar button. It is the extension's switch: a click while a Google Maps tab is in front turns saving on
   or off, for every Google Maps tab, and the choice is remembered (pat_on in the extension's storage; maps.js watches
   it). The SomeDay site can also turn it on (site.js), never off. The icon is the earth-coloured D; while it is on, the toolbar shows the blue one (icon-on-*). A click on any other site does nothing: the "activeTab" permission
   lets the click handler see the address of the tab that was clicked on, and only that. */
var SITE = 'https://chewei00.github.io/SomeDay/';
function icons(on) {
  var p = {};
  [16, 32, 48, 128].forEach(function (n) { p[n] = 'icon-' + (on ? 'on-' : '') + n + '.png'; });
  return p;
}
function paint(on) {
  chrome.action.setIcon({ path: icons(on) });
  chrome.action.setTitle({ title: on ? 'SomeDay：開啟中，點一下關閉' : 'SomeDay：點一下開啟' });
}
function sync() { chrome.storage.local.get(['pat_on'], function (r) { paint(!!(r && r.pat_on)); }); }
var MAPS = /^https:\/\/www\.google\.com(\.tw)?\/maps(\/|\?|$)/;
chrome.runtime.onInstalled.addListener(sync);
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
