import { useMemo, useState } from 'react'
import { supabase } from './supabase'

const DEFAULTS = Object.freeze({
  sleepTimer: 0,
  audioVolume: 1,
  audioSpeed: 1,
  audioAutoplay: true,
  audioRememberPosition: true,
  videoVolume: 1,
  videoSpeed: 1,
  videoAutoplay: false,
  videoRememberPosition: true,
  ttsVolume: 1,
  ttsSpeed: 1,
  tamilVoice: 'ta-IN-PallaviNeural',
  englishVoice: 'en-IN-NeerjaNeural',
  readerTheme: 'dark',
  readerFontSize: 100,
  readerPdfScale: 1,
  readerRememberPosition: true,
  reducedMotion: false,
  dataSaver: false,
})

function AccountSettings({ user, settings, onSettingsChange, onBack, onSleepTimer, onApplyPlayerSettings, isAdmin = false }) {
  const [name, setName] = useState(() => String(user?.user_metadata?.full_name || ''))
  const [newEmail, setNewEmail] = useState(() => String(user?.email || ''))
  const [phone, setPhone] = useState(() => String(user?.phone || ''))
  const [phoneOtp, setPhoneOtp] = useState('')
  const [phonePending, setPhonePending] = useState(false)
  const [password, setPassword] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const mergedSettings = useMemo(
    () => ({ ...DEFAULTS, ...(settings || {}) }),
    [settings]
  )

  const setSetting = (key, value) => {
    const next = { ...DEFAULTS, ...mergedSettings, [key]: value }
    onSettingsChange?.(next)

    if (key === 'sleepTimer') onSleepTimer?.(Number(value))

    if (['audioVolume', 'audioSpeed', 'videoVolume', 'videoSpeed', 'ttsVolume', 'ttsSpeed'].includes(key)) {
      onApplyPlayerSettings?.(next)
    }
  }

  const saveName = async (event) => {
    event.preventDefault()
    setStatus('')
    setError('')
    const nextName = name.trim()
    if (!nextName) {
      setError('Enter your name.')
      return
    }

    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({
      data: { ...(user?.user_metadata || {}), full_name: nextName },
    })
    setBusy(false)

    if (updateError) {
      setError(updateError.message)
      return
    }
    setName(nextName)
    setStatus('Name updated successfully.')
  }

  const changeEmail = async (event) => {
    event.preventDefault()
    setStatus('')
    setError('')
    const email = newEmail.trim().toLowerCase()

    if (!email || !email.includes('@')) {
      setError('Enter a valid Gmail/email address.')
      return
    }
    if (email === String(user?.email || '').toLowerCase()) {
      setError('This is already your current email.')
      return
    }

    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ email })
    setBusy(false)

    if (updateError) {
      setError(updateError.message)
      return
    }
    setStatus('Email change requested. Check the confirmation email(s) from Supabase.')
  }

  const sendPrimaryReset = async () => {
    setStatus('')
    setError('')
    const email = String(user?.email || '').trim()
    if (!email) {
      setError('No primary email is available for password recovery.')
      return
    }

    setBusy(true)
    const configured = String(import.meta.env.VITE_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '')
    const redirectTo = configured ? configured + '/' : window.location.origin + '/'
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })
    setBusy(false)

    if (resetError) {
      setError(resetError.message)
      return
    }

    setResetSent(true)
    setStatus('Password reset email sent to your primary email. Your purchases stay on the same account.')
  }

  const savePassword = async (event) => {
    event.preventDefault()
    setStatus('')
    setError('')

    if (password.length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }

    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setPassword('')
    setStatus('Password updated. Keep your recovery email/phone connected.')
  }

  const sendPhoneOtp = async () => {
    setStatus('')
    setError('')
    const normalized = phone.trim()

    if (!/^\+?[1-9]\d{9,14}$/.test(normalized)) {
      setError('Enter a valid mobile number with country code, e.g. +919876543210.')
      return
    }

    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ phone: normalized })
    setBusy(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setPhonePending(true)
    setStatus('Verification OTP sent to your mobile.')
  }

  const verifyPhone = async (event) => {
    event.preventDefault()
    setStatus('')
    setError('')

    if (!phoneOtp.trim()) {
      setError('Enter the 6-digit mobile OTP.')
      return
    }

    setBusy(true)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: phone.trim(),
      token: phoneOtp.trim(),
      type: 'phone_change',
    })
    setBusy(false)

    if (verifyError) {
      setError(verifyError.message)
      return
    }

    setPhonePending(false)
    setPhoneOtp('')
    setPhone(phone.trim())
    setStatus('Mobile number verified and bound to this account.')
  }

  const connectGoogleBackup = async () => {
    setStatus('')
    setError('')
    setBusy(true)

    try {
      const configured = String(import.meta.env.VITE_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '')
      const redirectTo = configured ? configured + '/' : window.location.origin + '/'
      const { data, error: linkError } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo },
      })

      if (linkError) {
        setError(linkError.message)
      } else if (data?.url) {
        window.location.assign(data.url)
      } else {
        setStatus('Google backup linking started. Finish Google verification to attach it to this same account.')
      }
    } catch (linkError) {
      setError(linkError?.message || 'Unable to start Google backup linking.')
    } finally {
      setBusy(false)
    }
  }

  const clearPlaybackPositions = () => {
    let removed = 0
    try {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index)
        if (String(key || '').startsWith('hj_media_position_v2:')) {
          localStorage.removeItem(key)
          removed += 1
        }
      }
    } catch (clearError) {
      setError(clearError?.message || 'Unable to clear playback positions.')
      return
    }
    setStatus(removed ? 'Saved playback positions cleared from this browser.' : 'No saved playback positions were found.')
  }

  const signOutAllDevices = async () => {
    setStatus('')
    setError('')
    setBusy(true)
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' })
    setBusy(false)
    if (signOutError) {
      setError(signOutError.message)
      return
    }
    setStatus('Signed out from all active sessions.')
  }

  const clearReaderDefaults = () => {
    const next = {
      ...mergedSettings,
      readerTheme: 'dark',
      readerFontSize: 100,
      readerPdfScale: 1,
      readerRememberPosition: true,
    }
    onSettingsChange?.(next)
    setStatus('Reader settings reset.')
  }

  const setSleep = (value) => setSetting('sleepTimer', Number(value))

  return (
    <main className="account-page account-settings-page">
      <div className="account-settings-header">
        <div>
          <div className="eyebrow">ACCOUNT SETTINGS</div>
          <h1>Personalize & Protect Your Account</h1>
          <p>Player controls, reading preferences and recovery methods are kept separate from your content purchases.</p>
        </div>
        <button className="secondary-btn" type="button" onClick={onBack}>← Account</button>
      </div>

      {status && <div className="account-settings-status">{status}</div>}
      {error && <div className="account-settings-error">{error}</div>}

      <section className="account-settings-card">
        <div className="account-settings-card-head">
          <div><small>ACCOUNT PROFILE</small><h2>Name & Email</h2></div>
          <span className="account-settings-icon">👤</span>
        </div>

        <form className="account-settings-form" onSubmit={saveName}>
          <label><span>Display name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label>
          <button className="primary-btn" type="submit" disabled={busy}>Save Name</button>
        </form>

        {!isAdmin ? (
          <>
            <form className="account-settings-form" onSubmit={changeEmail}>
              <label><span>Primary Gmail / Email</span><input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="you@gmail.com" /></label>
              <button className="secondary-btn" type="submit" disabled={busy}>Change Gmail</button>
            </form>
            <div className="account-settings-note">
              Changing the email address does not create a new HJ GROUPS account. The same Supabase user ID is retained, so purchases tied to this account remain on it.
            </div>
          </>
        ) : (
          <div className="account-settings-note">
            Administrator email is protected here so changing it cannot accidentally remove the HJ GROUPS admin role.
          </div>
        )}
      </section>

      <section className="account-settings-card">
        <div className="account-settings-card-head">
          <div><small>RECOVERY & SECURITY</small><h2>Keep Your Paid Content Recoverable</h2></div>
          <span className="account-settings-icon">🛡️</span>
        </div>

        <div className="account-settings-recovery-grid">
          <div className="account-settings-mini">
            <strong>Primary password reset</strong>
            <p>Send the normal Supabase recovery email to your current primary email.</p>
            <button className="secondary-btn" type="button" onClick={sendPrimaryReset} disabled={busy}>
              {resetSent ? 'Reset Email Sent' : 'Send Password Reset'}
            </button>
          </div>

          <div className="account-settings-mini">
            <strong>Backup Google account</strong>
            <p>Link a Google identity to this same account so the backup identity can recover access without creating a separate purchaser account.</p>
            <button className="secondary-btn" type="button" onClick={connectGoogleBackup} disabled={busy}>
              {user?.identities?.some((identity) => identity?.provider === 'google') || user?.user_metadata?.backup_google_connected
                ? 'Google Backup Connected'
                : 'Connect Google Backup'}
            </button>
            {(user?.identities?.some((identity) => identity?.provider === 'google') || user?.user_metadata?.backup_google_connected) && (
              <small className="account-settings-ok">✓ Google backup identity connected</small>
            )}
          </div>

          <div className="account-settings-mini account-settings-phone">
            <strong>Recovery mobile</strong>
            <p>Bind and verify a mobile number. After verification it can be used with HJ GROUPS Phone OTP login when SMS auth is enabled.</p>
            <label><span>Mobile number</span><input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+919876543210" disabled={phonePending} /></label>

            {!phonePending ? (
              <button className="secondary-btn" type="button" onClick={sendPhoneOtp} disabled={busy}>Send Mobile OTP</button>
            ) : (
              <form onSubmit={verifyPhone} className="account-settings-form">
                <label><span>Mobile OTP</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={phoneOtp} onChange={(event) => setPhoneOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 digit OTP" /></label>
                <button className="primary-btn" type="submit" disabled={busy}>Verify Mobile</button>
              </form>
            )}
          </div>
        </div>

        <form className="account-settings-form" onSubmit={savePassword}>
          <label><span>New password</span><input type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" /></label>
          <button className="primary-btn" type="submit" disabled={busy}>Change Password</button>
        </form>
      </section>

      <section className="account-settings-card">
        <div className="account-settings-card-head">
          <div><small>AUDIO PLAYER</small><h2>Listening Preferences</h2></div>
          <span className="account-settings-icon">🎧</span>
        </div>
        <div className="account-settings-grid">
          <label><span>Default volume: {Math.round(mergedSettings.audioVolume * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={mergedSettings.audioVolume} onChange={(event) => setSetting('audioVolume', Number(event.target.value))} /></label>
          <label><span>Default speed</span><select value={mergedSettings.audioSpeed} onChange={(event) => setSetting('audioSpeed', Number(event.target.value))}>{[0.75,1,1.1,1.25,1.5,1.75,2].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>
          <label className="settings-check"><input type="checkbox" checked={!!mergedSettings.audioAutoplay} onChange={(event) => setSetting('audioAutoplay', event.target.checked)} /><span>Autoplay next episode</span></label>
          <label className="settings-check"><input type="checkbox" checked={!!mergedSettings.audioRememberPosition} onChange={(event) => setSetting('audioRememberPosition', event.target.checked)} /><span>Remember episode position</span></label>
        </div>
      </section>

      <section className="account-settings-card">
        <div className="account-settings-card-head">
          <div><small>VIDEO PLAYER</small><h2>Video Preferences</h2></div>
          <span className="account-settings-icon">🎬</span>
        </div>
        <div className="account-settings-grid">
          <label><span>Default volume: {Math.round(mergedSettings.videoVolume * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={mergedSettings.videoVolume} onChange={(event) => setSetting('videoVolume', Number(event.target.value))} /></label>
          <label><span>Default speed</span><select value={mergedSettings.videoSpeed} onChange={(event) => setSetting('videoSpeed', Number(event.target.value))}>{[0.75,1,1.1,1.25,1.5,1.75,2].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>
          <label className="settings-check"><input type="checkbox" checked={!!mergedSettings.videoAutoplay} onChange={(event) => setSetting('videoAutoplay', event.target.checked)} /><span>Autoplay videos</span></label>
          <label className="settings-check"><input type="checkbox" checked={!!mergedSettings.videoRememberPosition} onChange={(event) => setSetting('videoRememberPosition', event.target.checked)} /><span>Remember video position</span></label>
        </div>
      </section>

      <section className="account-settings-card">
        <div className="account-settings-card-head">
          <div><small>TTS & READ ALOUD</small><h2>Voice & Reading Controls</h2></div>
          <span className="account-settings-icon">🔊</span>
        </div>
        <div className="account-settings-grid">
          <label><span>Read Aloud volume: {Math.round(mergedSettings.ttsVolume * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={mergedSettings.ttsVolume} onChange={(event) => setSetting('ttsVolume', Number(event.target.value))} /></label>
          <label><span>Read Aloud speed</span><select value={mergedSettings.ttsSpeed} onChange={(event) => setSetting('ttsSpeed', Number(event.target.value))}>{[0.5,0.75,1,1.25,1.5,2].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>
          <label><span>Tamil voice</span><select value={mergedSettings.tamilVoice} onChange={(event) => setSetting('tamilVoice', event.target.value)}><option value="ta-IN-PallaviNeural">Pallavi</option><option value="ta-IN-ValluvarNeural">Valluvar</option></select></label>
          <label><span>English (India) voice</span><select value={mergedSettings.englishVoice} onChange={(event) => setSetting('englishVoice', event.target.value)}><option value="en-IN-NeerjaNeural">Neerja</option><option value="en-IN-PrabhatNeural">Prabhat</option></select></label>
        </div>
        <div className="account-settings-note">The Read Aloud button is directly available in the book reader header and player. Voice selection is a setting; it is not a replacement for the Read Aloud control.</div>
      </section>

      <section className="account-settings-card">
        <div className="account-settings-card-head">
          <div><small>BOOK READER</small><h2>Reader Appearance</h2></div>
          <span className="account-settings-icon">📖</span>
        </div>
        <div className="account-settings-grid">
          <label><span>Reader theme</span><select value={mergedSettings.readerTheme} onChange={(event) => setSetting('readerTheme', event.target.value)}><option value="dark">Dark</option><option value="paper">Paper</option><option value="sepia">Sepia</option><option value="night">Night Blue</option></select></label>
          <label><span>Reader font size: {mergedSettings.readerFontSize}%</span><input type="range" min="75" max="180" step="5" value={mergedSettings.readerFontSize} onChange={(event) => setSetting('readerFontSize', Number(event.target.value))} /></label>
          <label><span>Default PDF zoom: {Math.round(mergedSettings.readerPdfScale * 100)}%</span><input type="range" min="0.5" max="2.5" step="0.05" value={mergedSettings.readerPdfScale} onChange={(event) => setSetting('readerPdfScale', Number(event.target.value))} /></label>
          <label className="settings-check"><input type="checkbox" checked={!!mergedSettings.readerRememberPosition} onChange={(event) => setSetting('readerRememberPosition', event.target.checked)} /><span>Remember last reader position</span></label>
        </div>

        <div className="reader-theme-buttons">
          {[['dark','Dark'],['paper','Paper'],['sepia','Sepia'],['night','Night Blue']].map(([value,label]) => (
            <button key={value} type="button" className={mergedSettings.readerTheme === value ? 'active' : ''} onClick={() => setSetting('readerTheme', value)}>{label}</button>
          ))}
        </div>
        <button className="secondary-btn" type="button" onClick={clearReaderDefaults}>Reset Reader Settings</button>
      </section>

      <section className="account-settings-card">
        <div className="account-settings-card-head">
          <div><small>DEVICE & DATA</small><h2>Privacy, Data Saver & Session Safety</h2></div>
          <span className="account-settings-icon">🔐</span>
        </div>

        <div className="account-settings-recovery-grid">
          <div className="account-settings-mini">
            <strong>Clear playback positions</strong>
            <p>Removes only this browser's saved audio/video resume positions. Purchases, library content and account data are not removed.</p>
            <button className="secondary-btn" type="button" onClick={clearPlaybackPositions} disabled={busy}>Clear Resume Data</button>
          </div>
          <div className="account-settings-mini">
            <strong>Data Saver</strong>
            <p>Reduce background media loading and bandwidth usage. Playback still uses the normal player when you start an item.</p>
            <label className="settings-check"><input type="checkbox" checked={!!mergedSettings.dataSaver} onChange={(event) => setSetting('dataSaver', event.target.checked)} /><span>Use lower-bandwidth media loading</span></label>
          </div>
          <div className="account-settings-mini">
            <strong>Sign out all devices</strong>
            <p>Ends active Supabase sessions across the account. Use this after changing a password or if another device is no longer trusted.</p>
            <button className="secondary-btn" type="button" onClick={signOutAllDevices} disabled={busy}>Sign Out All Devices</button>
          </div>
          <div className="account-settings-mini">
            <strong>Recovery status</strong>
            <p>Keep more than one verified recovery path so a device or login method can be replaced without creating a new purchaser account.</p>
            <div className="account-recovery-status-list">
              <span className={user?.email_confirmed_at || user?.confirmed_at ? 'is-ok' : 'is-warn'}>{user?.email_confirmed_at || user?.confirmed_at ? '✓ Email verified' : '• Email verification pending'}</span>
              <span className={user?.identities?.some((identity) => identity?.provider === 'google') ? 'is-ok' : 'is-warn'}>{user?.identities?.some((identity) => identity?.provider === 'google') ? '✓ Google backup linked' : '• Google backup not linked'}</span>
              <span className={user?.phone ? 'is-ok' : 'is-warn'}>{user?.phone ? '✓ Recovery mobile bound' : '• Recovery mobile not bound'}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="account-settings-card">
        <div className="account-settings-card-head">
          <div><small>SLEEP TIMER & ACCESSIBILITY</small><h2>Playback Safety & Comfort</h2></div>
          <span className="account-settings-icon">😴</span>
        </div>
        <div className="account-settings-grid">
          <label><span>Sleep timer</span><select value={mergedSettings.sleepTimer} onChange={(event) => setSleep(event.target.value)}><option value="0">Off</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option><option value="120">2 hours</option></select></label>
          <label className="settings-check"><input type="checkbox" checked={!!mergedSettings.reducedMotion} onChange={(event) => setSetting('reducedMotion', event.target.checked)} /><span>Reduce reader/page-turn motion</span></label>
        </div>
      </section>
    </main>
  )
}

export default AccountSettings
