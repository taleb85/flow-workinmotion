/**
 * Caricato dal service worker (Workbox importScripts).
 * Alla riconnessione il browser può risvegliare lo SW con l’evento `sync` e notificare le finestre aperte.
 * @see https://developer.chrome.com/docs/workbox/modules/workbox-background-sync/ (pattern analogo)
 */
(function () {
  var TAG = 'osteria-data-sync';
  var MSG = 'OSTERIA_BACKGROUND_SYNC';

  self.addEventListener('sync', function (event) {
    if (event.tag === TAG) {
      event.waitUntil(notifyClients());
    }
  });

  function notifyClients() {
    return self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          try {
            clientList[i].postMessage({ type: MSG });
          } catch (_) {
            /* ignore */
          }
        }
      });
  }
})();
