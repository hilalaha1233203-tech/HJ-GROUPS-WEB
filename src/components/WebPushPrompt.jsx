import { useEffect, useState } from 'react'
import {
  dismissNotificationPrompt,
  enableWebPush,
  getWebPushStatus,
  shouldOfferNotificationPrompt,
  WEB_PUSH_DEFAULT_PREFERENCES,
} from '../lib/webPush'

export default function WebPushPrompt({ user }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') return undefined
    let mounted = true
    let armed = false

    const offer = async () => {
      if (armed || !mounted) return
      armed = true
      try {
        const status = await getWebPushStatus()
        if (mounted && shouldOfferNotificationPrompt(status) && status.configured) setOpen(true)
      } catch {}
    }

    const onInteraction = () => {
      void offer()
      window.removeEventListener('pointerdown', onInteraction)
      window.removeEventListener('keydown', onInteraction)
    }

    window.addEventListener('pointerdown', onInteraction, { once: true, passive: true })
    window.addEventListener('keydown', onInteraction, { once: true })

    return () => {
      mounted = false
      window.removeEventListener('pointerdown', onInteraction)
      window.removeEventListener('keydown', onInteraction)
    }
  }, [user?.id])

  if (!open) return null

  const enable = async () => {
    setBusy(true)
    setError('')
    try {
      await enableWebPush(WEB_PUSH_DEFAULT_PREFERENCES)
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('hj-web-push-updated'))
      setOpen(false)
    } catch (err) {
      setError(String(err?.message || 'Could not enable notifications.'))
    } finally {
      setBusy(false)
    }
  }

  const later = () => {
    dismissNotificationPrompt()
    setOpen(false)
    setError('')
  }

  return (
    <div className="web-push-prompt" role="dialog" aria-modal="false" aria-labelledby="web-push-prompt-title">
      <div className="web-push-prompt-icon" aria-hidden="true">🔔</div>
      <div className="web-push-prompt-copy">
        <strong id="web-push-prompt-title">Stay updated with HJ GROUPS</strong>
        <p>Get useful alerts for new episodes, new stories and important announcements. You can change these choices later.</p>
        {error && <small className="web-push-prompt-error">{error}</small>}
      </div>
      <div className="web-push-prompt-actions">
        <button type="button" className="secondary-btn" onClick={later} disabled={busy}>Later</button>
        <button type="button" className="primary-btn" onClick={enable} disabled={busy}>{busy ? 'Enabling…' : '🔔 Enable Notifications'}</button>
      </div>
    </div>
  )
}
