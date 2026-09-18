/*
 * Service worker de REPASSE PURO.
 *
 * Existe só para receber push e abrir a tela certa. Não guarda dado, não
 * intercepta fetch, não serve nada do cache: um painel que servisse número em
 * cache mentiria sobre quando o número foi medido (ver CLAUDE.md, "Service
 * worker").
 */
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (evento) {
  var dados = { titulo: 'Painel de Sites', corpo: '', url: '/avisos' };
  try {
    if (evento.data) dados = Object.assign(dados, evento.data.json());
  } catch {
    /* corpo não é JSON: fica o padrão */
  }
  evento.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: '/icone-192.png',
      badge: '/icone-192.png',
      data: { url: dados.url },
      // Mesmo assunto substitui a notificação anterior em vez de empilhar.
      tag: dados.url,
    }),
  );
});

self.addEventListener('notificationclick', function (evento) {
  evento.notification.close();
  var url = (evento.notification.data && evento.notification.data.url) || '/avisos';
  // O deep link abre a tela; quem autoriza é a sessão do painel, como sempre.
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (janelas) {
      for (var i = 0; i < janelas.length; i++) {
        if ('focus' in janelas[i]) {
          janelas[i].navigate(url);
          return janelas[i].focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
