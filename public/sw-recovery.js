/*
 * FitTrack service-worker recovery. Imported at the TOP of the generated sw.js
 * (vite.config.ts -> workbox.importScripts), so its listeners run before any caching route.
 * Plain script on purpose: no build step, no dependencies, nothing that can fail to bundle.
 * Full explanation: src/pwa/swPolicy.ts ("KILL SWITCH / RECOVERY").
 *
 * 1) Navigating to  /?sw=off  (any path) is answered by this worker itself with a tiny page that
 *    remembers the choice, unregisters every worker, deletes every cache and reloads the plain URL
 *    from the network. It works even when the cached app shell is broken or very old.
 * 2) A page can ask the worker to remove itself:
 *      navigator.serviceWorker.controller.postMessage({ type: 'FITTRACK_SW_SELF_DESTRUCT' })
 *
 * The storage key below must match SW_DISABLED_KEY in src/pwa/swPolicy.ts and index.html
 * (tests/pwaSwPolicy.test.ts checks that they agree).
 */
(function () {
  var DISABLED_KEY = 'fittrack:v1:sw-disabled';

  var deleteAllCaches = function () {
    return caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    });
  };

  self.addEventListener('fetch', function (event) {
    var request = event.request;
    if (request.mode !== 'navigate') return;
    var url;
    try { url = new URL(request.url); } catch (e) { return; }
    if (url.searchParams.get('sw') !== 'off') return;

    var page =
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Turning off offline mode</title><p style="font:16px system-ui;padding:24px">Turning off offline mode&hellip;</p>' +
      '<script>(function(){' +
      'try{localStorage.setItem(' + JSON.stringify(DISABLED_KEY) + ',"1");}catch(e){}' +
      'var u=new URL(location.href);u.searchParams.delete("sw");' +
      'var go=function(){location.replace(u.pathname+u.search+u.hash);};' +
      'var jobs=[];' +
      'if(navigator.serviceWorker)jobs.push(navigator.serviceWorker.getRegistrations().then(function(r){return Promise.all(r.map(function(x){return x.unregister();}));}));' +
      'if(window.caches)jobs.push(caches.keys().then(function(k){return Promise.all(k.map(function(n){return caches.delete(n);}));}));' +
      'Promise.all(jobs).then(go,go);' +
      '})();<\/script>';

    event.respondWith(new Response(page, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    }));
  });

  self.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'FITTRACK_SW_SELF_DESTRUCT') return;
    event.waitUntil(
      deleteAllCaches().then(function () { return self.registration.unregister(); })
    );
  });
})();
