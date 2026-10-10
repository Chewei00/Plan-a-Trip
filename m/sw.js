/* SomeDay on a phone, without a network. Keeps a copy of the page (m/index.html, which holds its own styles, script
   and icons) and of the fonts it has used, and answers from the copies first, so the page opens at once on a bad
   connection and at all on none. The page is fetched again in the background each time, so a newer version is there
   at the next opening. The trip is not kept here: it is in the address, and the page remembers it itself.
   Only pages under /SomeDay/m/ are served by this; the desktop site is not touched. */
var CACHE = 'someday-m-v1';
var PAGE = './';
var FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.add(new Request(PAGE, { cache: 'reload' })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('someday-m-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* fetch and keep; `key` is what the copy is filed under */
function fresh(c, key, request) {
  return fetch(request).then(function (res) { if (res.ok) c.put(key, res.clone()); return res; });
}
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (r.mode === 'navigate' && u.origin === location.origin) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(PAGE).then(function (hit) {
        var net = fresh(c, PAGE, new Request(PAGE, { cache: 'no-cache' }));
        if (hit) { e.waitUntil(net.catch(function () {})); return hit; }
        return net;
      });
    }));
    return;
  }
  /* fonts never change under one address: the copy is enough */
  if (FONTS.test(r.url)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(r.url).then(function (hit) { return hit || fresh(c, r.url, new Request(r.url, { mode: 'cors', credentials: 'omit' })); });
    }));
    return;
  }
  /* the site's small pictures (the icon): copy first, refreshed behind */
  if (u.origin === location.origin) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(r.url).then(function (hit) {
        var net = fresh(c, r.url, r);
        if (hit) { e.waitUntil(net.catch(function () {})); return hit; }
        return net;
      });
    }));
  }
});
/* the page names the fonts it fetched before this was in place */
self.addEventListener('message', function (e) {
  var urls = e.data && e.data.keep;
  if (!Array.isArray(urls)) return;
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(urls.filter(function (u) { return typeof u === 'string' && FONTS.test(u); }).map(function (u) {
      return c.match(u).then(function (hit) { return hit || fresh(c, u, new Request(u, { mode: 'cors', credentials: 'omit' })).catch(function () {}); });
    }));
  }));
});
