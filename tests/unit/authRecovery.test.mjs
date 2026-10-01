import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PASSWORD_RESET_PATH,
  getAuthRecoveryParams,
} from '../../src/lib/authRecovery.js'

const location = (pathname, search = '', hash = '') => ({
  pathname,
  search,
  hash,
})

test('password-reset PKCE callback is recognized as recovery', () => {
  const result = getAuthRecoveryParams(
    location(PASSWORD_RESET_PATH, '?code=recovery-code')
  )

  assert.equal(result.isResetPath, true)
  assert.equal(result.isRecoveryFlow, true)
  assert.equal(result.code, 'recovery-code')
})

test('password-reset implicit callback is recognized as recovery', () => {
  const result = getAuthRecoveryParams(
    location(
      PASSWORD_RESET_PATH,
      '',
      '#access_token=access-token&refresh_token=refresh-token&type=recovery'
    )
  )

  assert.equal(result.isRecoveryFlow, true)
  assert.equal(result.authType, 'recovery')
  assert.equal(result.accessToken, 'access-token')
  assert.equal(result.refreshToken, 'refresh-token')
})

test('expired recovery callback is recognized as recovery', () => {
  const result = getAuthRecoveryParams(
    location(
      PASSWORD_RESET_PATH,
      '?error=access_denied&error_code=otp_expired&error_description=Token%20has%20expired'
    )
  )

  assert.equal(result.isRecoveryFlow, true)
  assert.equal(result.authErrorCode, 'otp_expired')
  assert.equal(result.authErrorDescription, 'Token has expired')
})

test('normal Google/OTP callback is not treated as password recovery', () => {
  const result = getAuthRecoveryParams(
    location('/', '?code=normal-auth-code', '#type=email')
  )

  assert.equal(result.isResetPath, false)
  assert.equal(result.isRecoveryFlow, false)
  assert.equal(result.code, 'normal-auth-code')
  assert.equal(result.authType, 'email')
})

test('recovery type remains a recovery signal even if an old callback returned to root', () => {
  const result = getAuthRecoveryParams(
    location('/', '', '#type=recovery&error_code=otp_expired')
  )

  assert.equal(result.isRecoveryFlow, true)
  assert.equal(result.authErrorCode, 'otp_expired')
})
