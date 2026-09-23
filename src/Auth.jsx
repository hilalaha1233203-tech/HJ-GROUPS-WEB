import { useState, useEffect } from 'react'
import { supabase } from './supabase'

function Auth({ onBack }) {
  const [mode, setMode] = useState('login')
  const [loginMethod, setLoginMethod] = useState(null)
  const [signupOtpSent, setSignupOtpSent] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [otp, setOtp] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneOtp, setPhoneOtp] = useState('')
  const [phoneOtpSent, setPhoneOtpSent] = useState(false)

  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  
  const [otpCooldown, setOtpCooldown] = useState(0)

  const clearMessages = () => {
    setMessage('')
    setError('')
  }

  const getRedirectUrl = () => {
    const configured = String(
      import.meta.env.VITE_PUBLIC_SITE_URL || ''
    ).trim().replace(/\/+$/, '')

    return configured
      ? `${configured}/`
      : `${window.location.origin}/`
  }


  const handlePasswordLogin = async (event) => {
    event.preventDefault()
    clearMessages()

    if (!email) {
      setError('Enter your email')
      return
    }

    if (!password) {
      setError('Enter your password')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Login successful.')
    }

    setLoading(false)
  }

  const handleSignup = async (event) => {
    event.preventDefault()
    clearMessages()

    if (!fullName.trim()) {
      setError('Enter your full name')
      return
    }

    if (!email.trim()) {
      setError('Enter your email')
      return
    }

    if (!password) {
      setError('Create a password')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: getRedirectUrl(),
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Account created. Check your email for verification if required.')
    }

    setLoading(false)
  }

  const sendSignupOtp = async (event) => {
    if (event) event.preventDefault()
    clearMessages()

    if (!fullName.trim()) {
      setError('Enter your full name')
      return
    }

    if (!email.trim()) {
      setError('Enter your email')
      return
    }

    if (otpCooldown > 0) return

    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: getRedirectUrl(),
        data: {
          full_name: fullName.trim(),
        },
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setSignupOtpSent(true)
      setOtpSent(true)
      setOtpCooldown(60)
      setMessage('OTP sent to your email. Enter the code below to finish creating your account.')
    }

    setLoading(false)
  }

  const verifySignupOtp = async (event) => {
    event.preventDefault()
    clearMessages()

    if (!fullName.trim()) {
      setError('Enter your full name')
      return
    }

    if (!email.trim()) {
      setError('Enter your email')
      return
    }

    if (!otp.trim()) {
      setError('Enter the OTP')
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: 'email',
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    try {
      await supabase.auth.updateUser({
        data: { full_name: fullName.trim() },
      })
    } catch (updateError) {
      console.warn('Signup profile metadata update failed:', updateError)
    }

    setMessage(
      data?.user
        ? 'Account verified successfully. You are now logged in.'
        : 'Account verified successfully. Please continue.'
    )
    setLoading(false)
  }

  useEffect(() => {
    let interval = null
    if (otpCooldown > 0) {
      interval = setInterval(() => {
        setOtpCooldown((c) => c - 1)
      }, 1000)
    } else if (otpCooldown === 0) {
      clearInterval(interval)
    }
    return () => clearInterval(interval)
  }, [otpCooldown])

  const sendPhoneOtp = async (event) => {
    if (event) event.preventDefault()
    clearMessages()

    const value = phone.trim()
    if (!/^\+?[1-9]\d{9,14}$/.test(value)) {
      setError('Enter a valid mobile number with country code, e.g. +919876543210')
      return
    }

    if (otpCooldown > 0) return

    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      phone: value,
      options: {
        shouldCreateUser: false,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setPhoneOtpSent(true)
      setOtpCooldown(60)
      setMessage('Mobile OTP sent. Enter the code below.')
    }

    setLoading(false)
  }

  const verifyPhoneOtp = async (event) => {
    event.preventDefault()
    clearMessages()

    if (!phoneOtp.trim()) {
      setError('Enter the mobile OTP')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      phone: phone.trim(),
      token: phoneOtp.trim(),
      type: 'sms',
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Login successful.')
    }

    setLoading(false)
  }

  const sendOtp = async (event) => {
    if (event) event.preventDefault()
    clearMessages()

    if (!email.trim()) {
      setError('Enter your email')
      return
    }

    if (otpCooldown > 0) {
      return
    }

    setLoading(true)

    /*
      Login OTP is intentionally restricted to existing
      accounts. Signup has its own OTP flow below, so an
      unknown email cannot silently create an account.
      The Supabase email template must render `{{ .Token }}`
      when a numeric OTP email is required instead of only
      rendering a magic-link button.
    */
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: getRedirectUrl(),
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setOtpSent(true)
      setOtpCooldown(60)
      setMessage('OTP sent to your email.')
    }

    setLoading(false)
  }

  const verifyOtp = async (event) => {
    event.preventDefault()
    clearMessages()

    if (!otp.trim()) {
      setError('Enter the OTP')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: 'email',
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Login successful.')
    }

    setLoading(false)
  }

  const sendPasswordReset = async () => {
    clearMessages()

    if (!email.trim()) {
      setError('Enter your email first')
      return
    }

    setLoading(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getRedirectUrl(),
    })

    if (resetError) {
      setError(resetError.message)
    } else {
      setMessage('Password reset email sent. Open it to set a new password on this same account.')
    }

    setLoading(false)
  }

  const selectMethod = (method) => {
    setLoginMethod(method)
    setOtpSent(false)
    setSignupOtpSent(false)
    setOtp('')
    setPhoneOtpSent(false)
    setPhoneOtp('')
    clearMessages()
  }

  const switchMode = (newMode) => {
    setMode(newMode)
    setLoginMethod(null)
    setOtpSent(false)
    setSignupOtpSent(false)
    setOtp('')
    setOtpCooldown(0)
    setPhoneOtpSent(false)
    setPhoneOtp('')
    clearMessages()
  }

  return (
    <div className="auth-page">
      <button className="auth-back" onClick={onBack}>← Back</button>

      <div className="auth-card">
        <div className="auth-logo">
          <img src="/hj-groups-logo.png" alt="HJ GROUPS" />
        </div>

        <div className="auth-heading">
          <h1>{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h1>
          <p>{mode === 'login' ? 'Login to continue your journey.' : 'Create your HJ GROUPS account.'}</p>
        </div>

        {mode === 'signup' && (
          <>
            {!loginMethod && (
              <div className="login-method-selection">
                <button type="button" className="login-method-card" onClick={() => selectMethod('password')}>
                  <span className="method-icon">🔐</span>
                  <span className="method-text">
                    <strong className="method-title">Password Sign Up</strong>
                    <small className="method-description">Create an account with a password</small>
                  </span>
                </button>

                <button type="button" className="login-method-card" onClick={() => selectMethod('otp')}>
                  <span className="method-icon">📧</span>
                  <span className="method-text">
                    <strong className="method-title">Email OTP Sign Up</strong>
                    <small className="method-description">Create and verify your account with a one-time code</small>
                  </span>
                </button>
              </div>
            )}

            {loginMethod === 'password' && (
              <form onSubmit={handleSignup} className="login-box">
                <div className="login-box-title">Password Sign Up</div>

                <div className="auth-field">
                  <label>Full Name</label>
                  <input type="text" placeholder="Your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>

                <div className="auth-field">
                  <label>Email</label>
                  <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>

                <div className="auth-field">
                  <label>Password</label>
                  <input type="password" placeholder="Create password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>

                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? 'Creating Account...' : 'Create Account'}
                </button>

                <button type="button" className="method-back" onClick={() => selectMethod(null)}>
                  ← Choose another method
                </button>
              </form>
            )}

            {loginMethod === 'otp' && (
              <form onSubmit={signupOtpSent ? verifySignupOtp : sendSignupOtp} className="login-box">
                <div className="login-box-title">Email OTP Sign Up</div>

                <div className="auth-field">
                  <label>Full Name</label>
                  <input type="text" placeholder="Your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={signupOtpSent} />
                </div>

                <div className="auth-field">
                  <label>Email</label>
                  <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={signupOtpSent} />
                </div>

                {!signupOtpSent ? (
                  <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? 'Sending OTP...' : 'Send Signup OTP'}
                  </button>
                ) : (
                  <>
                    <div className="otp-message">Enter the 6-digit OTP sent to your email.</div>
                    <div className="auth-field">
                      <label>Enter OTP</label>
                      <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength="6" placeholder="6 digit OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                    </div>
                    <button type="submit" className="auth-submit" disabled={loading}>
                      {loading ? 'Verifying...' : 'Verify & Create Account'}
                    </button>

                    <button
                      type="button"
                      className="auth-submit secondary-btn"
                      disabled={loading || otpCooldown > 0}
                      onClick={sendSignupOtp}
                      style={{ marginTop: '0.5rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      {otpCooldown > 0 ? `Resend OTP in ${otpCooldown}s` : 'Resend OTP'}
                    </button>
                  </>
                )}

                <button type="button" className="method-back" onClick={() => selectMethod(null)}>
                  ← Choose another method
                </button>
              </form>
            )}
          </>
        )}

        {mode === 'login' && (
          <>
            {!loginMethod && (
              <div className="login-method-selection">
                <button type="button" className="login-method-card" onClick={() => selectMethod('password')}>
                  <span className="method-icon">🔐</span>
                  <span className="method-text">
                    <strong className="method-title">Password Login</strong>
                    <small className="method-description">Login using your password</small>
                  </span>
                </button>

                <button type="button" className="login-method-card" onClick={() => selectMethod('otp')}>
                  <span className="method-icon">📧</span>
                  <span className="method-text">
                    <strong className="method-title">Email OTP Login</strong>
                    <small className="method-description">Login using a one-time password</small>
                  </span>
                </button>

                <button type="button" className="login-method-card" onClick={() => selectMethod('phone')}>
                  <span className="method-icon">📱</span>
                  <span className="method-text">
                    <strong className="method-title">Phone OTP Login</strong>
                    <small className="method-description">Login with your verified recovery mobile number</small>
                  </span>
                </button>
              </div>
            )}

            {loginMethod === 'password' && (
              <form onSubmit={handlePasswordLogin} className="login-box">
                <div className="login-box-title">Password Login</div>

                <div className="auth-field">
                  <label>Email</label>
                  <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>

                <div className="auth-field">
                  <label>Password</label>
                  <input type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>

                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? 'Logging in...' : 'Login'}
                </button>
                <button type="button" className="method-back" onClick={sendPasswordReset} disabled={loading}>
                  Forgot Password? Send Reset Email
                </button>
                <button type="button" className="method-back" onClick={() => selectMethod('phone')} disabled={loading}>
                  📱 Recover with Mobile OTP
                </button>

                <button type="button" className="method-back" onClick={() => selectMethod(null)}>
                  ← Choose another method
                </button>
              </form>
            )}

            {loginMethod === 'phone' && (
              <form onSubmit={phoneOtpSent ? verifyPhoneOtp : sendPhoneOtp} className="login-box">
                <div className="login-box-title">Phone OTP Login</div>

                {!phoneOtpSent && (
                  <>
                    <div className="auth-field">
                      <label>Mobile Number</label>
                      <input type="tel" inputMode="tel" autoComplete="tel" placeholder="+919876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>

                    <button type="submit" className="auth-submit" disabled={loading}>
                      {loading ? 'Sending OTP...' : 'Send Mobile OTP'}
                    </button>
                  </>
                )}

                {phoneOtpSent && (
                  <>
                    <div className="otp-message">Enter the OTP sent to your verified mobile number.</div>
                    <div className="auth-field">
                      <label>Mobile OTP</label>
                      <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength="6" placeholder="6 digit OTP" value={phoneOtp} onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                    </div>
                    <button type="submit" className="auth-submit" disabled={loading}>
                      {loading ? 'Verifying...' : 'Verify Mobile OTP'}
                    </button>
                    <button type="button" className="method-back" onClick={() => { setPhoneOtpSent(false); setPhoneOtp(''); setOtpCooldown(0); clearMessages() }} disabled={loading}>
                      ← Change Mobile
                    </button>
                  </>
                )}

                <button type="button" className="method-back" onClick={() => selectMethod(null)}>
                  ← Choose another method
                </button>
              </form>
            )}

            {loginMethod === 'otp' && (
              <form onSubmit={otpSent ? verifyOtp : sendOtp} className="login-box">
                <div className="login-box-title">Email OTP Login</div>

                {!otpSent && (
                  <>
                    <div className="auth-field">
                      <label>Email</label>
                      <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>

                    <button type="submit" className="auth-submit" disabled={loading}>
                      {loading ? 'Sending OTP...' : 'Send OTP'}
                    </button>
                  </>
                )}

                {otpSent && (
                  <>
                    <div className="otp-message">Enter the OTP sent to your email.</div>

                    <div className="auth-field">
                      <label>Enter OTP</label>
                      <input type="text" inputMode="numeric" maxLength="6" placeholder="6 digit OTP" value={otp} onChange={(e) => setOtp(e.target.value)} />
                    </div>

                    <button type="submit" className="auth-submit" disabled={loading}>
                      {loading ? 'Verifying...' : 'Verify OTP'}
                    </button>

                    <button
                      type="button"
                      className="auth-submit secondary-btn"
                      disabled={loading || otpCooldown > 0}
                      onClick={sendOtp}
                      style={{ marginTop: '0.5rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      {otpCooldown > 0 ? `Resend OTP in ${otpCooldown}s` : 'Resend OTP'}
                    </button>

                    <button type="button" className="method-back" onClick={() => { setOtpSent(false); setOtp(''); setOtpCooldown(0); clearMessages() }}>
                      ← Change Email
                    </button>
                  </>
                )}

                <button type="button" className="method-back" onClick={() => selectMethod(null)}>
                  ← Choose another method
                </button>
              </form>
            )}
          </>
        )}

        {message && <div className="auth-success">{message}</div>}
        {error && <div className="auth-error">{error}</div>}

        <div className="auth-switch">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          <button type="button" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Sign Up' : 'Login'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Auth