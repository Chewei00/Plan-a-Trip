/* The toolbar button. It is the extension's only switch: a click while a Google Maps tab is in front turns saving on
   or off, for every Google Maps tab, and the choice is remembered (pat_on in the extension's storage; maps.js watches
   it). On: the coloured icon. Off: the grey one. A click on any other site does nothing: the "activeTab" permission
   lets the click handler see the address of the tab that was clicked on, and only that. */
var SITE = 'https://chewei00.github.io/Plan-a-Trip/';
function icons(off) {
  var p = {};
  [16, 32, 48, 128].forEach(function (n) { p[n] = 'icon-' + (off ? 'off-' : '') + n + '.png'; });
  return p;
}
function paint(on) {
  chrome.action.setIcon({ path: icons(!on) });
  chrome.action.setTitle({ title: on ? 'Plan a Trip：開啟中，點一下關閉' : 'Plan a Trip：點一下開啟' });
}
function sync() { chrome.storage.local.get(['pat_on'], function (r) { paint(!!(r && r.pat_on)); }); }
var MAPS = /^https:\/\/www\.google\.com(\.tw)?\/maps(\/|\?|$)/;
chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);
chrome.action.onClicked.addListener(function (tab) {
  if (!tab || !MAPS.test(tab.url || '')) return;
  chrome.storage.local.get(['pat_on'], function (r) {
    var on = !(r && r.pat_on);
    chrome.storage.local.set({ pat_on: on });
    paint(on);
  });
});
/* "Open Plan a Trip" in the bar on Google Maps: go to the tab that already has it, or open one */
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
