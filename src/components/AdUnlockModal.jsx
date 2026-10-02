import { useState } from 'react'

function AdUnlockModal({
  onClose,
  onUnlock,
  providerLabel = 'Unlock',
  unlockPreview = null,
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

  return (
    <div className="ad-unlock-overlay">
      <div className="ad-unlock-card">
        <h3>{options.length > 1 ? 'Unlock Episode' : '📺 Unlock with an Ad'}</h3>

        {options.length > 1 ? (
          <>
            <p>Choose how you want to unlock:</p>
            <div className="ad-unlock-actions" style={{ display: 'grid', gap: '10px' }}>
              {options.map((option) => (
                <button
                  key={option.provider}
                  type="button"
                  className="primary-btn"
                  onClick={() => handleSelect(option.provider)}
                  disabled={Boolean(loadingProvider)}
                >
                  {loadingProvider === option.provider
                    ? 'Opening…'
                    : \`${option.icon || '🔓'} ${option.label} — Unlock ${option.unlockCount} episode${option.unlockCount === 1 ? '' : 's'}\`}
                </button>
              ))}
            </div>
            <p className="ad-unlock-countdown">
              {options.map((option) => \`${option.label}: Episodes ${option.unlockStartEpisode}–${option.unlockEndEpisode}\`).join(' · ')}
            </p>
          </>
        ) : (
          <>
            <p>
              {providerLabel} will unlock {unlockPreview?.unlockCount || 1} episode{(unlockPreview?.unlockCount || 1) === 1 ? '' : 's'} starting from Episode {unlockPreview?.episodeNumber ?? 'current'}.
            </p>
            {unlockPreview?.unlockStartEpisode != null && unlockPreview?.unlockEndEpisode != null && (
              <p className="ad-unlock-countdown">
                Episodes {unlockPreview.unlockStartEpisode}–{unlockPreview.unlockEndEpisode}
              </p>
            )}
            <div className="ad-unlock-actions">
              <button type="button" className="secondary-btn" onClick={onClose} disabled={Boolean(loadingProvider)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => handleSelect(options[0]?.provider || 'shortener')}
                disabled={Boolean(loadingProvider)}
              >
                {loadingProvider ? 'Opening…' : 'Continue to Unlock'}
              </button>
            </div>
          </>
        )}

        {options.length > 1 && (
          <button type="button" className="secondary-btn" onClick={onClose} disabled={Boolean(loadingProvider)}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

export default AdUnlockModal
