const CONFIG_CACHE_KEY = 'hj_web_push_config_v1'
const PROMPT_DISMISSED_KEY = 'hj_web_push_prompt_dismissed_v1'

const safeJson = async (response) => response.json().catch(() => ({}))

export const WEB_PUSH_DEFAULT_PREFERENCES = Object.freeze({
  new_episodes: true,
  new_stories: true,
  promotions: true,
  announcements: true,
})

export function isWebPushSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
}

function base64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

async function authHeaders() {
  const { supabase } = await import('../supabase')
  const { data: { session } = {} } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' } : null
}

async function getConfig() {
  const cached = sessionStorage.getItem(CONFIG_CACHE_KEY)
  if (cached) { try { return JSON.parse(cached) } catch {} }
  const response = await fetch('/api/push/config', { cache: 'no-store' })
  const data = await safeJson(response)
  if (response.ok) sessionStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(data))
  return data
}

export async function getWebPushStatus() {
  if (!isWebPushSupported()) return { supported: false, configured: false, subscribed: false, permission: 'unsupported', preferences: WEB_PUSH_DEFAULT_PREFERENCES }
  const permission = Notification.permission
  const headers = await authHeaders()
  if (!headers) return { supported: true, configured: false, subscribed: false, permission, preferences: WEB_PUSH_DEFAULT_PREFERENCES }
  const response = await fetch('/api/push/status', { headers, cache: 'no-store' })
  const data = await safeJson(response)
  return { ...data, supported: true, permission, preferences: data.preferences || WEB_PUSH_DEFAULT_PREFERENCES }
}

export async function enableWebPush(preferences = WEB_PUSH_DEFAULT_PREFERENCES) {
  if (!isWebPushSupported()) throw new Error('Push notifications are not supported in this browser.')
  const config = await getConfig()
  if (!config?.configured || !config.publicKey) throw new Error('Web Push is not configured on the server yet.')
  if (Notification.permission === 'denied') throw new Error('Notifications are blocked in your browser settings.')

  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      if (permission === 'denied') throw new Error('Notifications are blocked in your browser settings.')
      throw new Error('Notification permission was not granted.')
    }
  }

  let registration
  try {
    registration = await navigator.serviceWorker.register('/hj-push-sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })

    // register() only schedules installation. It does not guarantee that the
    // registration is active, which is why PushManager.subscribe() must never
    // run directly against the returned registration.
    registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => window.setTimeout(
        () => reject(new Error('Notifications are still getting ready. Please try again in a moment.')),
        15_000
      )),
    ])

    if (!registration?.active || registration.active.state !== 'activated' || !registration.active.scriptURL.endsWith('/hj-push-sw.js')) {
      throw new Error('Notifications are still getting ready. Please try again in a moment.')
    }
  } catch (error) {
    const message = String(error?.message || '')
    if (/still getting ready|active|service worker/i.test(message)) {
      throw new Error('Notifications are still getting ready. Please try again in a moment.')
    }
    throw error
  }

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(config.publicKey),
      })
    } catch (error) {
      const message = String(error?.message || '')
      if (/no active service worker|service worker/i.test(message)) {
        throw new Error('Notifications are still getting ready. Please try again in a moment.')
      }
      throw error
    }
  }

  const headers = await authHeaders()
  if (!headers) throw new Error('Please sign in before enabling notifications.')
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers,
    body: JSON.stringify({ subscription: subscription.toJSON(), preferences }),
  })
  const data = await safeJson(response)
  if (!response.ok) throw new Error(data.error || 'Could not save notification subscription.')
  try { sessionStorage.removeItem(PROMPT_DISMISSED_KEY) } catch {}
  return { ...data, subscription }
}
export async function disableWebPush() {
  const headers = await authHeaders()
  if (!headers) return
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) {
    await fetch('/api/push/subscribe/remove', { method: 'POST', headers, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => {})
    await subscription.unsubscribe().catch(() => {})
  }
}

export async function updateWebPushPreferences(preferences) {
  const headers = await authHeaders()
  if (!headers) throw new Error('Please sign in before changing notification settings.')
  const response = await fetch('/api/push/preferences', { method: 'POST', headers, body: JSON.stringify(preferences) })
  const data = await safeJson(response)
  if (!response.ok) throw new Error(data.error || 'Could not save notification preferences.')
  return data
}

export function shouldOfferNotificationPrompt(status) {
  if (!status?.supported || status.permission === 'denied' || status.subscribed) return false
  try { return sessionStorage.getItem(PROMPT_DISMISSED_KEY) !== '1' } catch { return true }
}

export function dismissNotificationPrompt() {
  try { sessionStorage.setItem(PROMPT_DISMISSED_KEY, '1') } catch {}
}


export async function syncStoryLibrary(storyId, inLibrary) {
  if (!storyId) return
  const { supabase } = await import('../supabase')
  const { data: { session } = {} } = await supabase.auth.getSession()
  if (!session?.user?.id) return
  const id = Number(storyId)
  if (!Number.isInteger(id)) return
  if (inLibrary) {
    const { error } = await supabase.from('user_story_library').upsert({
      user_id: session.user.id,
      story_id: id,
    }, { onConflict: 'user_id,story_id' })
    if (error) console.warn('Library notification sync failed:', error.message)
  } else {
    const { error } = await supabase.from('user_story_library').delete()
      .eq('user_id', session.user.id)
      .eq('story_id', id)
    if (error) console.warn('Library notification removal failed:', error.message)
  }
}
