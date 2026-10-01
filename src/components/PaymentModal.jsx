import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const CASHFREE_SDK_URL = 'https://sdk.cashfree.com/js/v3/cashfree.js'

let sdkPromise = null

function loadCashfreeSdk() {
  if (window.Cashfree) return Promise.resolve(window.Cashfree)
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="' + CASHFREE_SDK_URL + '"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Cashfree), { once: true })
      existing.addEventListener('error', () => reject(new Error('Cashfree checkout SDK failed to load.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = CASHFREE_SDK_URL
    script.async = true
    script.onload = () => resolve(window.Cashfree)
    script.onerror = () => reject(new Error('Cashfree checkout SDK failed to load.'))
    document.head.appendChild(script)
  })

  return sdkPromise
}

function makeRequestId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, '')
  return 'hjpay' + Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export default function PaymentModal({ target, onClose }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [availability, setAvailability] = useState({ checking: true, enabled: false })

  useEffect(() => {
    let mounted = true
    fetch('/api/payments/health', { method: 'GET', credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(String(payload?.error || 'Unable to check payment availability.'))
        if (mounted) setAvailability({ checking: false, enabled: payload?.enabled === true })
      })
      .catch((healthError) => {
        if (!mounted) return
        setAvailability({ checking: false, enabled: false })
        setError(String(healthError?.message || 'Payment service is currently unavailable.'))
      })
    return () => { mounted = false }
  }, [])

  if (!target) return null

  const startPayment = async () => {
    if (!availability.enabled) {
      setError('Payments are currently disabled. Please check back later.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { data: { session } = {} } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Please sign in before making a payment.')

      const response = await fetch('/api/payments/create-order', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({
          productKey: 'story_lifetime',
          contentType: 'story',
          contentId: target.storyId,
          requestId: makeRequestId(),
        }),
        cache: 'no-store',
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(String(payload?.error || 'Unable to create payment order.'))

      if (payload?.alreadyPaid) {
        target.onSuccess?.()
        onClose?.()
        return
      }

      const Cashfree = await loadCashfreeSdk()
      if (typeof Cashfree !== 'function') throw new Error('Cashfree checkout is unavailable.')

      const cashfree = Cashfree({
        mode: payload.environment === 'production' ? 'production' : 'sandbox',
      })

      if (!payload.paymentSessionId) throw new Error('Payment session was not returned.')
      await cashfree.checkout({
        paymentSessionId: payload.paymentSessionId,
        redirectTarget: '_self',
      })
    } catch (paymentError) {
      setError(String(paymentError?.message || 'Unable to start payment.'))
      setLoading(false)
    }
  }

  return (
    <div className="ad-unlock-overlay" role="dialog" aria-modal="true" aria-label="Story payment">
      <div className="ad-unlock-card">
        <h3>👑 Unlock Story</h3>
        <p>Purchase lifetime access to <strong>{target.title || 'this story'}</strong>.</p>
        <p className="ad-unlock-countdown">
          {availability.checking
            ? 'Checking payment availability…'
            : availability.enabled
              ? 'Payment is processed securely by Cashfree. HJ GROUPS does not collect your card, UPI PIN or CVV.'
              : 'Payments are currently disabled. Story purchases are not available yet.'}
        </p>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <div className="ad-unlock-actions">
          <button type="button" className="secondary-btn" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="button" className="primary-btn" onClick={startPayment} disabled={loading || availability.checking || !availability.enabled}>
            {loading ? 'Opening payment…' : availability.checking ? 'Checking…' : availability.enabled ? 'Continue to Payment' : 'Payment Disabled'}
          </button>
        </div>
      </div>
    </div>
  )
}
