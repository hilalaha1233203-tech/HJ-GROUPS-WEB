self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch {}
  const title = String(data.title || 'HJ GROUPS').slice(0, 120)
  const body = String(data.message || 'New content is waiting for you.').slice(0, 500)
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/'
  const icon = typeof data.icon === 'string' && data.icon.startsWith('/') ? data.icon : '/icon-192.png'
  event.waitUntil(self.registration.showNotification(title, { body, icon, badge: icon, data: { url }, tag: String(data.kind || 'hj-groups').slice(0, 64), renotify: true }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification?.data?.url || '/'
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const sameOrigin = clients.find((client) => {
      try { return new URL(client.url).origin === self.location.origin } catch { return false }
    })
    if (sameOrigin && 'focus' in sameOrigin) {
      await sameOrigin.focus()
      if ('navigate' in sameOrigin) await sameOrigin.navigate(new URL(target, self.location.origin).toString())
      return
    }
    await self.clients.openWindow(new URL(target, self.location.origin).toString())
  })())
})
