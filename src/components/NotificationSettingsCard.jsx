import { useEffect, useState } from 'react'
import {
  disableWebPush,
  enableWebPush,
  getWebPushStatus,
  updateWebPushPreferences,
  WEB_PUSH_DEFAULT_PREFERENCES,
} from '../lib/webPush'

const LABELS = [
  ['new_episodes', 'New Episodes'],
  ['new_stories', 'New Stories'],
  ['promotions', 'Promotions'],
  ['announcements', 'Announcements'],
]

export default function NotificationSettingsCard() {
  const [status, setStatus] = useState(null)
  const [preferences, setPreferences] = useState(WEB_PUSH_DEFAULT_PREFERENCES)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const refresh = async () => {
    try {
      const next = await getWebPushStatus()
      setStatus(next)
      setPreferences(next.preferences || WEB_PUSH_DEFAULT_PREFERENCES)
    } catch (error) {
      setMessage(String(error?.message || 'Could not load notification status.'))
    }
  }

  useEffect(() => {
    void refresh()
    const onUpdated = () => void refresh()
    window.addEventListener('hj-web-push-updated', onUpdated)
    return () => window.removeEventListener('hj-web-push-updated', onUpdated)
  }, [])

  const toggle = async (key, checked) => {
    const next = { ...preferences, [key]: checked }
    setPreferences(next)
    setBusy(true)
    setMessage('')
    try {
      if (status?.subscribed) await updateWebPushPreferences(next)
      else if (checked) await enableWebPush(next)
      else return
      await refresh()
    } catch (error) {
      setMessage(String(error?.message || 'Could not update notification settings.'))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    setMessage('')
    try {
      await disableWebPush()
      await refresh()
      setMessage('Notifications disabled for this browser.')
    } catch (error) {
      setMessage(String(error?.message || 'Could not disable notifications.'))
    } finally {
      setBusy(false)
    }
  }

  const enable = async () => {
    setBusy(true)
    setMessage('')
    try {
      await enableWebPush(preferences)
      await refresh()
      setMessage('Notifications enabled.')
    } catch (error) {
      setMessage(String(error?.message || 'Could not enable notifications.'))
    } finally {
      setBusy(false)
    }
  }

  const unsupported = status && !status.supported
  const blocked = status?.permission === 'denied'

  return (
    <section className="account-settings-card notification-settings-card">
      <div className="account-settings-card-head">
        <div><small>WEB PUSH</small><h2>🔔 Notifications</h2></div>
        <span className="account-settings-icon">💎</span>
      </div>
      <p className="account-settings-note">Notifications work through your normal browser experience. No app installation is required. Browser permission always remains in control.</p>

      {unsupported && <div className="account-settings-note">This browser does not support Web Push notifications.</div>}
      {blocked && <div className="account-settings-error">Notifications are blocked by the browser. Allow them in browser/site settings before enabling again.</div>}

      {!unsupported && !blocked && (
        <>
          <div className="notification-settings-grid">
            {LABELS.map(([key, label]) => (
              <label className="admin-settings-toggle notification-toggle" key={key}>
                <input
                  type="checkbox"
                  checked={preferences[key] !== false}
                  onChange={(event) => toggle(key, event.target.checked)}
                  disabled={busy}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="notification-settings-actions">
            {status?.subscribed ? (
              <button type="button" className="secondary-btn" onClick={disable} disabled={busy}>Disable Notifications</button>
            ) : (
              <button type="button" className="primary-btn" onClick={enable} disabled={busy}>🔔 Enable Notifications</button>
            )}
          </div>
        </>
      )}
      {message && <div className="account-settings-status">{message}</div>}
    </section>
  )
}
