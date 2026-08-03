/* Custom SW — attivazione immediata, niente navigation interception */
importScripts('pwa-background-sync.js', 'pwa-push-notifications.js');

// Queste variabili vengono iniettate da workbox-build injectManifest
// self.__WB_MANIFEST — lista file da precache
// workbox — oggetto workbox con i moduli

// Pulisci TUTTE le cache all'attivazione (incluse vecchie versioni)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
  // Prendi il controllo di tutti i client immediatamente
  self.clients.claim();
});

// Non intercettare le navigazioni — ogni richiesta va al server
// Il precaching (self.__WB_MANIFEST) viene comunque applicato da workbox
