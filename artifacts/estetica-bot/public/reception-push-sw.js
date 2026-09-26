self.addEventListener('push', (event) => {
  // Never display untrusted push content. The notification is deliberately generic.
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const inbox = new URL('./conversations', self.registration.scope);
    if (windows.some((client) => client.visibilityState === 'visible' &&
      new URL(client.url).origin === inbox.origin && new URL(client.url).pathname === inbox.pathname)) return;
    await self.registration.showNotification('Nueva solicitud para recepción', {
      body: 'Abre la bandeja protegida para atenderla.',
      tag: 'reception-handoff',
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const destination = new URL('./conversations', self.registration.scope).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin &&
      new URL(client.url).pathname === new URL(destination).pathname);
    if (existing) return existing.focus();
    return self.clients.openWindow(destination);
  })());
});