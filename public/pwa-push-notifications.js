/**
 * Logica di Push Notifications per FLOW — Work in Motion.
 * Caricato dal service worker (Workbox importScripts).
 * Gestisce gli eventi `push` per mostrare notifiche nel centro notifiche del sistema.
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Push_API
 */
(function () {
  var TAG_PUSH = 'osteria-push-notification';

  /**
   * Evento `push`: ricevuto quando il server invia una notifica push.
   * Mostra la notifica nel centro notifiche del sistema.
   */
  self.addEventListener('push', function (event) {
    if (!event.data) {
      console.warn('[Push] Notifica push ricevuta senza payload');
      return;
    }

    let notificationData = {};
    try {
      // Tenta di parsare il payload come JSON
      notificationData = event.data.json();
    } catch (e) {
      // Se non è JSON, usa il testo direttamente
      notificationData = {
        title: 'Nuova notifica',
        body: event.data.text(),
      };
    }

    // Se è una notifica di aggiornamento forzato: non mostrare nel centro notifiche,
    // ma postare direttamente a tutte le finestre aperte per triggerare l'overlay.
    if (notificationData.type === 'force_reload') {
      event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
          clientList.forEach(function (client) {
            client.postMessage({ type: 'FORCE_DATA_RELOAD' });
          });
        })
      );
      return;
    }

    // Valori di default se non presenti nel payload
    const title = notificationData.title || 'Nuova notifica';
    // Usa la foto del mittente come icona se disponibile, altrimenti icona app
    const iconUrl = notificationData.icon || '/icon-192.png';
    const options = {
      body: notificationData.body || 'Nuovo messaggio',
      icon: iconUrl,
      badge: '/icon-192.png',
      tag: TAG_PUSH,
      requireInteraction: notificationData.requireInteraction || false,
      // Immagine espansa (visibile su Android in modalità espansa)
      ...(notificationData.image ? { image: notificationData.image } : {}),
      // Dati aggiuntivi (visibili quando l'utente clicca sulla notifica)
      data: {
        url: notificationData.url || '/',
        type: notificationData.type || 'notification',
      },
      // Vibrazioni (ms)
      vibrate: [200, 100, 200],
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  });

  /**
   * Evento `notificationclick`: apre l'app e mostra il pannello notifiche.
   * - Se l'app è già aperta: manda un messaggio per aprire il modal
   * - Se l'app è chiusa: apre con parametro ?open=notifications
   */
  self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    var baseUrl = self.location.origin;
    var data = event.notification.data || {};
    var pathFromData =
      data.url && typeof data.url === 'string' ? data.url : '/?open=notifications';
    var openUrl =
      pathFromData.indexOf('http') === 0 ? pathFromData : baseUrl + pathFromData;
    var openMsgType = 'OPEN_NOTIFICATIONS';
    if (data.type === 'punch_exit_reminder') openMsgType = 'OPEN_PUNCH_EXIT';
    else if (data.type === 'schedule_week_available' || data.type === 'shift_change')
      openMsgType = 'OPEN_TURNI';

    event.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then(function (clientList) {
          for (var i = 0; i < clientList.length; i++) {
            var client = clientList[i];
            if ('focus' in client) {
              client.postMessage({ type: openMsgType });
              return client.focus();
            }
          }
          if (self.clients.openWindow) {
            return self.clients.openWindow(openUrl);
          }
        })
    );

    // Pulisci il badge (SW context: usa self.registration, non navigator)
    if (self.registration.clearBadge) {
      self.registration.clearBadge().catch(function () {});
    }
  });

  /**
   * Evento `notificationclose`: log quando l'utente chiude la notifica.
   */
  self.addEventListener('notificationclose', function (event) {
    console.log('[Push] Notifica chiusa:', event.notification.tag);
    // Pulisci anche alla chiusura della notifica
    if (self.registration.clearBadge) {
      self.registration.clearBadge().catch(function () {});
    }
  });

  /**
   * Messaggio dall'app per pulire il badge.
   */
  self.addEventListener('message', function (event) {
    if (event.data === 'CLEAR_BADGE') {
      if (self.registration.clearBadge) {
        self.registration.clearBadge().catch(function () {});
      }
    }
  });
})();
