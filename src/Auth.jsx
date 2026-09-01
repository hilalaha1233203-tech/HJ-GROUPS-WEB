import { useState, useEffect } from 'react'
import { supabase } from './supabase'

function Auth({ onBack }) {
  const [mode, setMode] = useState('login')
  const [loginMethod, setLoginMethod] = useState(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [otp, setOtp] = useState('')

  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  
  const [otpCooldown, setOtpCooldown] = useState(0)

  const clearMessages = () => {
    setMessage('')
    setError('')
  }

  const getRedirectUrl = () => `${window.location.origin}/`

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
      Intentionally no `emailRedirectTo` here.
      This is the "type in a 6-digit code" login
      path, not a magic-link path — we don't want
      Supabase treating this as a link-based flow.
      The rest of the fix (making the email actually
      CONTAIN a code instead of only a clickable
      link) has to happen in the Supabase Dashboard
      email template — see the instructions that
      came with this file.
    */
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
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

  const selectMethod = (method) => {
    setLoginMethod(method)
    setOtpSent(false)
    setOtp('')
    clearMessages()
  }

  const switchMode = (newMode) => {
    setMode(newMode)
    setLoginMethod(null)
    setOtpSent(false)
    setOtp('')
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
          <form onSubmit={handleSignup}>
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
          </form>
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