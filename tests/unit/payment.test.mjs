import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.CASHFREE_CLIENT_ID = 'test-client-id'
process.env.CASHFREE_CLIENT_SECRET = 'test-cashfree-secret'
process.env.CASHFREE_ENVIRONMENT = 'sandbox'
process.env.HJ_PUBLIC_BASE_URL = 'https://hj-groups-website.getvoroa.com'

const {
  isFinitePositiveAmount,
  moneyEquals,
  safeProductPrice,
  verifyWebhookSignature,
  isPaymentsRuntimeEnabled,
  isLikelyJwt,
} = await import('../../server/payment.mjs')


test('malformed bearer tokens fail local JWT-shape validation', () => {
  assert.equal(isLikelyJwt('header.payload.signature'), true)
  assert.equal(isLikelyJwt('header.payload'), false)
  assert.equal(isLikelyJwt(''), false)
})

test('payment amount validation rejects zero, negative and non-numeric values', () => {
  assert.equal(isFinitePositiveAmount(1), true)
  assert.equal(isFinitePositiveAmount('99.00'), true)
  assert.equal(isFinitePositiveAmount(0), false)
  assert.equal(isFinitePositiveAmount(-1), false)
  assert.equal(isFinitePositiveAmount('nope'), false)
})

test('money comparison uses currency-amount precision safely', () => {
  assert.equal(moneyEquals(99, 99.004), true)
  assert.equal(moneyEquals(99, 99.01), false)
})

test('server price comes only from the configured admin payment setting', () => {
  assert.deepEqual(
    safeProductPrice({
      payments: {
        enabled: true,
        storyLifetime: '149',
        currency: 'INR',
      },
    }, 'story_lifetime'),
    { amount: 149, currency: 'INR' }
  )

  assert.throws(
    () => safeProductPrice({
      payments: { enabled: true, storyLifetime: '0', currency: 'INR' },
    }, 'story_lifetime'),
    /price is not configured/
  )

  assert.throws(
    () => safeProductPrice({
      payments: { enabled: true, storyLifetime: '149', currency: 'USD' },
    }, 'story_lifetime'),
    /Only INR/
  )

  assert.throws(
    () => safeProductPrice({
      payments: { enabled: true, storyLifetime: '149', currency: 'INR' },
    }, 'client_supplied_price'),
    /Unsupported payment product/
  )
})

test('Cashfree webhook signature requires timestamp + raw body HMAC', () => {
  const timestamp = '1720000000000'
  const rawBody = JSON.stringify({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: { order: { order_id: 'hj_test_order' } },
  })
  const signature = crypto
    .createHmac('sha256', process.env.CASHFREE_CLIENT_SECRET)
    .update(timestamp + rawBody)
    .digest('base64')

  assert.equal(verifyWebhookSignature(signature, timestamp, rawBody), true)
  assert.equal(verifyWebhookSignature(signature, timestamp, rawBody + 'x'), false)
  assert.equal(verifyWebhookSignature(signature, '1720000000001', rawBody), false)
  assert.equal(verifyWebhookSignature('bad', timestamp, rawBody), false)
})


test('payment runtime gate stays disabled unless explicitly enabled', () => {
  assert.equal(isPaymentsRuntimeEnabled(), false)
})
