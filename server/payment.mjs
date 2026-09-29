import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = String(
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://yajkfglagnyvenddyvok.supabase.co'
).trim().replace(/\/+$/, '')

const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const CASHFREE_CLIENT_ID = String(process.env.CASHFREE_CLIENT_ID || '').trim()
const CASHFREE_CLIENT_SECRET = String(process.env.CASHFREE_CLIENT_SECRET || '').trim()
const CASHFREE_ENVIRONMENT = String(process.env.CASHFREE_ENVIRONMENT || 'sandbox').trim().toLowerCase()
const PUBLIC_BASE_URL = String(process.env.HJ_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '')
const CASHFREE_API_VERSION = '2025-01-01'
const CASHFREE_BASE_URL = CASHFREE_ENVIRONMENT === 'production'
  ? 'https://api.cashfree.com'
  : 'https://sandbox.cashfree.com'

let serviceClient = null
function db() {
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.')
  if (!serviceClient) {
    serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  }
  return serviceClient
}

function parsePositiveId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function extractBearer(req) {
  const header = String(req.headers.authorization || '')
  if (!/^Bearer\s+/i.test(header)) return ''
  return header.replace(/^Bearer\s+/i, '').trim()
}

async function authenticate(req) {
  const token = extractBearer(req)
  if (!token) throw new Error('Authentication required.')
  const { data, error } = await db().auth.getUser(token)
  if (error || !data?.user) throw new Error('Authentication failed.')
  return data.user
}

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  })
  res.end(JSON.stringify(payload))
}

function requireConfigured() {
  if (!CASHFREE_CLIENT_ID || !CASHFREE_CLIENT_SECRET) {
    throw new Error('Cashfree server credentials are not configured.')
  }
  if (!['sandbox', 'production'].includes(CASHFREE_ENVIRONMENT)) {
    throw new Error('CASHFREE_ENVIRONMENT must be sandbox or production.')
  }
  if (!PUBLIC_BASE_URL) throw new Error('HJ_PUBLIC_BASE_URL is not configured.')
}

async function cashfreeRequest(pathname, options = {}) {
  requireConfigured()
  const response = await fetch(CASHFREE_BASE_URL + pathname, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-client-id': CASHFREE_CLIENT_ID,
      'x-client-secret': CASHFREE_CLIENT_SECRET,
      'x-api-version': CASHFREE_API_VERSION,
      ...(options.headers || {}),
    },
  })
  const text = await response.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch {}
  if (!response.ok) {
    const code = response.status
    const detail = String(payload?.message || payload?.message_text || '').slice(0, 200)
    throw new Error('Cashfree API request failed (' + code + ')' + (detail ? ': ' + detail : ''))
  }
  return payload
}

function isFinitePositiveAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0
}

function moneyEquals(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.005
}

function safeProductPrice(settings, productKey) {
  const payments = settings?.payments
  if (!payments?.enabled) throw new Error('Payments are not enabled in Admin Settings.')
  if (productKey !== 'story_lifetime') throw new Error('Unsupported payment product.')
  const amount = Number(payments.storyLifetime)
  if (!isFinitePositiveAmount(amount)) throw new Error('Story Lifetime price is not configured.')
  const currency = String(payments.currency || 'INR').trim().toUpperCase()
  if (currency !== 'INR') throw new Error('Only INR payments are currently supported.')
  return { amount: Number(amount.toFixed(2)), currency }
}

async function getAdminSettings() {
  const { data, error } = await db()
    .from('app_settings')
    .select('value')
    .eq('id', 'hj_admin_settings')
    .maybeSingle()
  if (error) throw new Error('Unable to load payment settings.')
  return data?.value || {}
}

async function createOrder(req, res, body) {
  const user = await authenticate(req)
  requireConfigured()

  const productKey = String(body?.productKey || '').trim()
  const contentType = String(body?.contentType || '').trim().toLowerCase()
  const contentId = parsePositiveId(body?.contentId)
  const requestId = String(body?.requestId || '').trim()

  if (productKey !== 'story_lifetime' || contentType !== 'story' || !contentId) {
    return json(res, 400, { error: 'Invalid payment target.' })
  }
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) {
    return json(res, 400, { error: 'Invalid payment request ID.' })
  }

  const settings = await getAdminSettings()
  const price = safeProductPrice(settings, productKey)

  const { data: story, error: storyError } = await db()
    .from('stories')
    .select('id, title')
    .eq('id', contentId)
    .maybeSingle()
  if (storyError || !story) return json(res, 404, { error: 'Story not found.' })

  const { data: existing } = await db()
    .from('payment_orders')
    .select('cashfree_order_id, status, amount, currency')
    .eq('user_id', user.id)
    .eq('idempotency_key', requestId)
    .maybeSingle()

  if (existing) {
    if (!moneyEquals(existing.amount, price.amount) || existing.currency !== price.currency) {
      return json(res, 409, { error: 'This payment request no longer matches the configured price.' })
    }
    if (existing.status === 'PAID') {
      return json(res, 200, { alreadyPaid: true, orderId: existing.cashfree_order_id })
    }
    const existingOrder = await cashfreeRequest('/pg/orders/' + encodeURIComponent(existing.cashfree_order_id))
    return json(res, 200, {
      orderId: existing.cashfree_order_id,
      paymentSessionId: existingOrder?.payment_session_id || null,
    })
  }

  const orderId = 'hj_' + requestId.slice(0, 48)
  const returnUrl = new URL('/', PUBLIC_BASE_URL)
  returnUrl.searchParams.set('cashfree_order_id', orderId)
  const notifyUrl = new URL('/api/payments/webhook', PUBLIC_BASE_URL).toString()

  const customerPhone = String(user.phone || user.user_metadata?.phone || '').replace(/\D/g, '')
  if (customerPhone.length < 10) {
    return json(res, 400, { error: 'Please bind a valid mobile number to your HJ GROUPS account before payment.' })
  }

  const order = await cashfreeRequest('/pg/orders', {
    method: 'POST',
    body: JSON.stringify({
      order_amount: price.amount,
      order_currency: price.currency,
      order_id: orderId,
      customer_details: {
        customer_id: user.id,
        customer_email: String(user.email || ''),
        customer_phone: customerPhone.slice(-10),
      },
      order_meta: {
        return_url: returnUrl.toString(),
        notify_url: notifyUrl,
      },
      order_note: 'HJ GROUPS Story Lifetime',
      order_tags: {
        product_key: productKey,
        story_id: String(contentId),
      },
    }),
  })

  const paymentSessionId = String(order?.payment_session_id || '').trim()
  if (!paymentSessionId) throw new Error('Cashfree did not return a payment session.')

  const { error: insertError } = await db()
    .from('payment_orders')
    .insert({
      user_id: user.id,
      cashfree_order_id: orderId,
      idempotency_key: requestId,
      product_key: productKey,
      content_type: contentType,
      content_id: contentId,
      amount: price.amount,
      currency: price.currency,
      status: 'CREATED',
      metadata: { story_title: story.title },
    })

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: duplicate } = await db()
        .from('payment_orders')
        .select('cashfree_order_id')
        .eq('user_id', user.id)
        .eq('idempotency_key', requestId)
        .maybeSingle()
      if (duplicate?.cashfree_order_id) {
        return json(res, 200, { orderId: duplicate.cashfree_order_id, paymentSessionId })
      }
    }
    throw new Error('Unable to save the payment order.')
  }

  return json(res, 200, {
    orderId,
    paymentSessionId,
    environment: CASHFREE_ENVIRONMENT,
  })
}

async function fetchVerifiedPayment(orderId, storedOrder) {
  const payments = await cashfreeRequest('/pg/orders/' + encodeURIComponent(orderId) + '/payments')
  const rows = Array.isArray(payments) ? payments : []
  const successful = rows.find((payment) =>
    String(payment?.payment_status || '').toUpperCase() === 'SUCCESS'
  )
  if (!successful) {
    const pending = rows.some((payment) =>
      String(payment?.payment_status || '').toUpperCase() === 'PENDING'
    )
    return { status: pending ? 'PENDING' : 'FAILED', payment: null }
  }

  const amount = Number(successful.payment_amount)
  const currency = String(successful.payment_currency || '').toUpperCase()
  if (!moneyEquals(amount, storedOrder.amount) || currency !== String(storedOrder.currency).toUpperCase()) {
    throw new Error('Cashfree payment amount/currency does not match the stored order.')
  }

  return {
    status: 'PAID',
    payment: successful,
  }
}

async function fulfilPaidOrder(orderId) {
  const { data: order, error } = await db()
    .from('payment_orders')
    .select('*')
    .eq('cashfree_order_id', orderId)
    .maybeSingle()
  if (error || !order) throw new Error('Payment order not found.')

  const verified = await fetchVerifiedPayment(orderId, order)
  const now = new Date().toISOString()

  if (verified.status === 'PAID') {
    if (order.status !== 'PAID') {
      const { error: updateError } = await db()
        .from('payment_orders')
        .update({
          status: 'PAID',
          cashfree_payment_id: String(verified.payment?.cf_payment_id || ''),
          paid_at: String(verified.payment?.payment_time || now),
          last_webhook_at: now,
          updated_at: now,
        })
        .eq('id', order.id)
        .neq('status', 'PAID')
      if (updateError) throw new Error('Unable to finalize payment order.')

      if (order.product_key === 'story_lifetime') {
        const { error: purchaseError } = await db()
          .from('purchases')
          .upsert({
            user_id: order.user_id,
            story_id: order.content_id,
            product_type: 'story_lifetime',
            expires_at: null,
          }, {
            onConflict: 'user_id,story_id,product_type',
          })
        if (purchaseError) throw new Error('Payment verified, but purchase activation failed.')
      }
    }
    return { status: 'PAID' }
  }

  const nextStatus = verified.status === 'PENDING' ? 'PENDING' : 'FAILED'
  await db()
    .from('payment_orders')
    .update({ status: nextStatus, last_webhook_at: now, updated_at: now })
    .eq('id', order.id)
    .neq('status', 'PAID')

  return { status: nextStatus }
}

function verifyWebhookSignature(signature, timestamp, rawBody) {
  if (!CASHFREE_CLIENT_SECRET) throw new Error('Cashfree server credentials are not configured.')
  const signedPayload = String(timestamp || '') + String(rawBody || '')
  const expected = crypto
    .createHmac('sha256', CASHFREE_CLIENT_SECRET)
    .update(signedPayload)
    .digest('base64')
  const actual = String(signature || '')
  if (!actual || actual.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

async function webhook(req, res, rawBody) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' })

  const signature = req.headers['x-webhook-signature']
  const timestamp = req.headers['x-webhook-timestamp']
  if (!verifyWebhookSignature(signature, timestamp, rawBody)) {
    return json(res, 401, { error: 'Invalid webhook signature.' })
  }

  let payload
  try { payload = JSON.parse(rawBody || '{}') } catch {
    return json(res, 400, { error: 'Invalid webhook JSON.' })
  }

  const orderId = String(payload?.data?.order?.order_id || '').trim()
  if (!orderId) return json(res, 400, { error: 'Webhook order ID is missing.' })

  try {
    const result = await fulfilPaidOrder(orderId)
    return json(res, 200, { ok: true, status: result.status })
  } catch (error) {
    console.error('[payments] webhook processing failed:', String(error?.message || 'unknown error').slice(0, 300))
    return json(res, 500, { error: 'Payment webhook processing failed.' })
  }
}

async function status(req, res, orderId) {
  const user = await authenticate(req)
  const safeOrderId = String(orderId || '').trim()
  if (!safeOrderId) return json(res, 400, { error: 'Order ID is required.' })

  const { data: order } = await db()
    .from('payment_orders')
    .select('cashfree_order_id, user_id, status, product_key, content_type, content_id, amount, currency')
    .eq('cashfree_order_id', safeOrderId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!order) return json(res, 404, { error: 'Payment order not found.' })

  const result = await fulfilPaidOrder(safeOrderId)
  return json(res, 200, {
    orderId: safeOrderId,
    status: result.status,
    productKey: order.product_key,
    contentId: order.content_id,
  })
}

async function health(req, res) {
  return json(res, 200, {
    enabled: Boolean(CASHFREE_CLIENT_ID && CASHFREE_CLIENT_SECRET),
    environment: CASHFREE_ENVIRONMENT,
    configured: Boolean(CASHFREE_CLIENT_ID && CASHFREE_CLIENT_SECRET && PUBLIC_BASE_URL && SERVICE_ROLE_KEY),
  })
}

export async function handlePaymentRequest(req, res, url, readBody, readRawBody) {
  try {
    if (url.pathname === '/api/payments/create-order' && req.method === 'POST') {
      return createOrder(req, res, await readBody())
    }
    if (url.pathname === '/api/payments/status' && req.method === 'GET') {
      return status(req, res, url.searchParams.get('order_id'))
    }
    if (url.pathname === '/api/payments/webhook') {
      const rawBody = await readRawBody()
      return webhook(req, res, rawBody)
    }
    if (url.pathname === '/api/payments/health' && req.method === 'GET') {
      return health(req, res)
    }
    return false
  } catch (error) {
    const message = String(error?.message || 'Payment service error.')
    console.error('[payments] request failed:', message.slice(0, 300))
    const authError = /Authentication required|Authentication failed/.test(message)
    return json(res, authError ? 401 : 500, {
      error: authError ? message : 'Payment service error.',
    })
  }
}

export {
  isFinitePositiveAmount,
  moneyEquals,
  safeProductPrice,
  verifyWebhookSignature,
}
