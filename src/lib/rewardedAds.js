let gptPromise = null
let activeRewarded = false

function loadGooglePublisherTag() {
  if (typeof window === 'undefined') throw new Error('Rewarded Ads are only available in a browser.')
  if (window.googletag?.defineOutOfPageSlot) return Promise.resolve(window.googletag)
  if (gptPromise) return gptPromise
  gptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-hj-gpt="rewarded"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.googletag), { once: true })
      existing.addEventListener('error', () => reject(new Error('Google Publisher Tag failed to load.')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.async = true
    script.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js'
    script.dataset.hjGpt = 'rewarded'
    script.onload = () => resolve(window.googletag)
    script.onerror = () => reject(new Error('Google Publisher Tag failed to load.'))
    document.head.appendChild(script)
  })
  return gptPromise
}

export async function showRewardedAd({ adUnitPath, onGranted } = {}) {
  if (activeRewarded) throw new Error('A rewarded ad is already active.')
  const unit = String(adUnitPath || '').trim()
  if (!/^\/\d+\/[^\s]+$/.test(unit)) {
    throw new Error('Rewarded Ad Unit ID is not configured as a Google Ad Manager web ad unit.')
  }

  const googletag = await loadGooglePublisherTag()
  activeRewarded = true

  return new Promise((resolve, reject) => {
    let rewardedSlot = null
    let granted = false
    let settled = false

    const cleanup = () => {
      try {
        if (rewardedSlot && googletag.pubads) {
          googletag.pubads().removeEventListener?.('rewardedSlotReady', onReady)
          googletag.pubads().removeEventListener?.('rewardedSlotGranted', onGrantedEvent)
          googletag.pubads().removeEventListener?.('rewardedSlotClosed', onClosed)
        }
        if (rewardedSlot && googletag.destroySlots) googletag.destroySlots([rewardedSlot])
      } catch {}
      activeRewarded = false
    }
    const finish = (error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve({ granted: true })
    }
    const onReady = (event) => {
      if (event?.slot !== rewardedSlot) return
      const shown = event.makeRewardedVisible?.()
      if (shown === false) finish(new Error('Rewarded Ad could not be displayed.'))
    }
    const onGrantedEvent = (event) => {
      if (event?.slot !== rewardedSlot || granted) return
      granted = true
      Promise.resolve(onGranted?.(event?.payload || null)).catch((error) => finish(error))
    }
    const onClosed = (event) => {
      if (event?.slot !== rewardedSlot) return
      if (!granted) finish(new Error('Rewarded Ad was closed before the reward was granted.'))
      else finish()
    }

    googletag.cmd = googletag.cmd || []
    googletag.cmd.push(() => {
      try {
        rewardedSlot = googletag.defineOutOfPageSlot(
          unit,
          googletag.enums.OutOfPageFormat.REWARDED
        )
        if (!rewardedSlot) {
          finish(new Error('This browser/device does not support rewarded web ads.'))
          return
        }
        rewardedSlot.addService(googletag.pubads())
        googletag.pubads().addEventListener('rewardedSlotReady', onReady)
        googletag.pubads().addEventListener('rewardedSlotGranted', onGrantedEvent)
        googletag.pubads().addEventListener('rewardedSlotClosed', onClosed)
        googletag.enableServices()
        googletag.display(rewardedSlot)
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Unable to start rewarded Ads.'))
      }
    })
  })
}
