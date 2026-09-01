import { useEffect, useRef, useState } from 'react'

const AD_DURATION_SECONDS = 5

function AdUnlockModal({ onClose, onUnlocked }) {
  const [secondsLeft, setSecondsLeft] = useState(AD_DURATION_SECONDS)
  const [done, setDone] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          clearInterval(timerRef.current)
          setDone(true)
          return 0
        }
        return value - 1
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [])

  const progress = Math.round(((AD_DURATION_SECONDS - secondsLeft) / AD_DURATION_SECONDS) * 100)

  return (
    <div className="ad-unlock-overlay">
      <div className="ad-unlock-card">
        <h3>📺 Watch Ad to Unlock</h3>

        {!done ? (
          <>
            <p>This content unlocks automatically when the ad finishes.</p>

            <div className="ad-unlock-progress-track">
              <div className="ad-unlock-progress-fill" style={{ width: `${progress}%` }} />
            </div>

            <p className="ad-unlock-countdown">{secondsLeft}s remaining</p>

            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <p>✓ Ad complete — this content is now unlocked.</p>

            <button type="button" className="primary-btn" onClick={onUnlocked}>
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default AdUnlockModal
