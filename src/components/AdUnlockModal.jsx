import { useState } from 'react'

function AdUnlockModal({
  onClose,
  onUnlock,
  providerOptions = null,
}) {
  const [loadingProvider, setLoadingProvider] = useState('')

  const options = Array.isArray(providerOptions) ? providerOptions.filter(Boolean) : []

  const handleSelect = async (provider) => {
    setLoadingProvider(provider)
    try {
      await onUnlock?.(provider)
    } finally {
      setLoadingProvider('')
    }
  }

  const formatCount = (value) => {
    const count = Number(value)
    if (!Number.isInteger(count) || count < 1) return 'Episodes'
    return `${count} Episode${count === 1 ? '' : 's'}`
  }

  return (
    <div className="ad-unlock-overlay">
      <div className="ad-unlock-card">
        <h3>Unlock Episodes</h3>
        <p>Choose how you want to unlock this content.</p>

        <div
          className="ad-unlock-actions"
          style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
        >
          <button
            type="button"
            className="secondary-btn"
            onClick={onClose}
            disabled={Boolean(loadingProvider)}
          >
            Cancel
          </button>

          {options.map((option) => {
            const providerName = option.provider === 'ads' ? 'Ads' : 'Shortener'
            const countLabel = formatCount(option.unlockCount)
            const unavailable = option.available === false

            return (
              <button
                key={option.provider}
                type="button"
                className={unavailable ? 'secondary-btn' : 'primary-btn'}
                onClick={() => handleSelect(option.provider)}
                disabled={Boolean(loadingProvider) || unavailable}
                aria-disabled={unavailable}
              >
                {loadingProvider === option.provider
                  ? 'Opening…'
                  : `Unlock ${countLabel} with ${providerName}${unavailable ? ' — Unavailable' : ''}`}
              </button>
            )
          })}
        </div>

        {options.length > 0 && (
          <p className="ad-unlock-countdown">
            {options.map((option) => {
              const providerName = option.provider === 'ads' ? 'Ads' : 'Shortener'
              if (option.available === false) {
                return `${providerName}: Temporarily unavailable`
              }
              if (option.unlockStartEpisode != null && option.unlockEndEpisode != null) {
                return `${providerName}: Episodes ${option.unlockStartEpisode}–${option.unlockEndEpisode}`
              }
              return providerName
            }).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}

export default AdUnlockModal
