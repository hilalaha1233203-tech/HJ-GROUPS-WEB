import { createClient } from '@supabase/supabase-js'
import { isHjAdminUser } from './adminAuth.mjs'

function resolveSupabaseUrl() {
  const candidates = [process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL, 'https://yajkfglagnyvenddyvok.supabase.co']
  for (const candidate of candidates) {
    const value = String(candidate || '').trim().replace(/\/+$/, '')
    try {
      const parsed = new URL(value)
      if (parsed.protocol === 'https:' && parsed.hostname) return value
    } catch {}
  }
  return ''
}

const SUPABASE_URL = resolveSupabaseUrl()
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
let client = null

function db() {
  if (!SERVICE_ROLE_KEY || !SUPABASE_URL) throw new Error('VIP access service is not configured.')
  if (!client) {
    client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  }
  return client
}

function bearer(req) {
  const value = String(req.headers.authorization || '')
  return /^Bearer\s+\S+$/i.test(value) ? value : ''
}

async function authenticate(req) {
  const token = bearer(req)
  if (!token) throw Object.assign(new Error('Authentication required.'), { statusCode: 401 })
  const { data, error } = await db().auth.getUser(token.replace(/^Bearer\s+/i, ''))
  if (error || !data?.user) throw Object.assign(new Error('Authentication failed.'), { statusCode: 401 })
  return data.user
}

async function authenticateAdmin(req) {
  const user = await authenticate(req)
  if (!isHjAdminUser(user)) throw Object.assign(new Error('Admin access required.'), { statusCode: 403 })
  return user
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim())
}

function safeExpiry(value) {
  if (value == null || value === '') return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
    throw Object.assign(new Error('VIP expiry must be a future date or empty for lifetime access.'), { statusCode: 400 })
  }
  return date.toISOString()
}

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify(payload))
}

async function listUsers() {
  const users = []
  for (let page = 1; page <= 1000; page += 1) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const batch = Array.isArray(data?.users) ? data.users : []
    users.push(...batch)
    if (batch.length < 1000) break
  }
  return users
    .filter((user) => user?.is_anonymous !== true && !user?.deleted_at)
    .map((user) => ({
      id: user.id,
      email: String(user.email || ''),
      name: String(user.user_metadata?.full_name || user.user_metadata?.name || ''),
      createdAt: user.created_at || null,
      isAdmin: isHjAdminUser(user),
    }))
    .sort((a, b) => (a.email || '').localeCompare(b.email || ''))
}

async function listGrants() {
  const { data, error } = await db()
    .from('user_vip_grants')
    .select('user_id, granted_by, granted_at, expires_at, note')
    .order('granted_at', { ascending: false })
  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function handleVipAdminRequest(req, res, { readJson, corsHeaders = {} }) {
  try {
    const admin = await authenticateAdmin(req)
    if (req.method === 'GET') {
      const [users, grants] = await Promise.all([listUsers(), listGrants()])
      return json(res, 200, { ok: true, users, grants }, corsHeaders)
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' }, { ...corsHeaders, Allow: 'GET, POST' })

    const body = await readJson(req)
    const action = String(body?.action || '').trim().toLowerCase()
    const userId = String(body?.userId || '').trim()
    if (!validUuid(userId)) return json(res, 400, { error: 'Invalid user id.' }, corsHeaders)
    if (userId === admin.id) return json(res, 400, { error: 'The admin account does not need a separate VIP grant.' }, corsHeaders)

    const target = (await db().auth.admin.getUserById(userId))?.data?.user
    if (!target || target.deleted_at || target.is_anonymous) return json(res, 404, { error: 'User was not found.' }, corsHeaders)

    if (action === 'grant') {
      const expiresAt = safeExpiry(body?.expiresAt)
      const note = String(body?.note || '').trim().slice(0, 500)
      const { error } = await db().from('user_vip_grants').upsert({
        user_id: userId,
        granted_by: admin.id,
        granted_at: new Date().toISOString(),
        expires_at: expiresAt,
        note,
      }, { onConflict: 'user_id' })
      if (error) throw error
      return json(res, 200, { ok: true, action: 'granted', userId, expiresAt }, corsHeaders)
    }

    if (action === 'revoke') {
      const { error } = await db().from('user_vip_grants').delete().eq('user_id', userId)
      if (error) throw error
      return json(res, 200, { ok: true, action: 'revoked', userId }, corsHeaders)
    }

    return json(res, 400, { error: 'Unsupported VIP action.' }, corsHeaders)
  } catch (error) {
    const status = Number(error?.statusCode) || 500
    return json(res, status, { error: status === 500 ? 'VIP access service error.' : String(error?.message || 'Request failed.') }, corsHeaders)
  }
}

export async function handleVipSelfRequest(req, res, { corsHeaders = {} }) {
  try {
    const user = await authenticate(req)
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' }, { ...corsHeaders, Allow: 'GET' })

    if (isHjAdminUser(user)) return json(res, 200, { ok: true, active: true, expiresAt: null, source: 'admin' }, corsHeaders)

    const { data, error } = await db()
      .from('user_vip_grants')
      .select('expires_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error

    const expiry = data?.expires_at ? Date.parse(data.expires_at) : null
    const active = Boolean(data) && (expiry == null || (Number.isFinite(expiry) && expiry > Date.now()))
    return json(res, 200, { ok: true, active, expiresAt: active ? data?.expires_at || null : null, source: active ? 'admin_vip' : null }, corsHeaders)
  } catch (error) {
    const status = Number(error?.statusCode) || 500
    return json(res, status, { error: status === 500 ? 'VIP access verification failed.' : String(error?.message || 'Request failed.') }, corsHeaders)
  }
}

export async function hasActiveVipGrant(userId) {
  if (!validUuid(userId)) return false
  const { data, error } = await db()
    .from('user_vip_grants')
    .select('expires_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return false
  if (!data.expires_at) return true
  const expiry = Date.parse(data.expires_at)
  return Number.isFinite(expiry) && expiry > Date.now()
}
