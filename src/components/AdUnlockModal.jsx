import { useState } from 'react'

function AdUnlockModal({
  onClose,
  onUnlock,
  providerLabel = 'Ad shortener',
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const startUnlock = async () => {
    setLoading(true)
    setError('')

    try {
      await onUnlock?.()
    } catch (unlockError) {
      setError(String(unlockError?.message || 'Unable to start the ad unlock flow.'))
      setLoading(false)
    }
  }

  return (
    <div className="ad-unlock-overlay">
      <div className="ad-unlock-card">
        <h3>📺 Unlock with an Ad</h3>

        <p>
          Complete the {providerLabel} link flow to unlock this content for the
          configured temporary duration.
        </p>

        <p className="ad-unlock-countdown">
          You will return to HJ GROUPS automatically after the provider flow.
        </p>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <div className="ad-unlock-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>

          <button
            type="button"
            className="primary-btn"
            onClick={startUnlock}
            disabled={loading}
          >
            {loading ? 'Opening…' : 'Continue to Unlock'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AdUnlockModal
