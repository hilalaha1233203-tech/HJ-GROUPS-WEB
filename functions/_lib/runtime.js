export function setRuntimeEnv(env) {
  globalThis.__HJ_RUNTIME_ENV = env || {};
  return globalThis.__HJ_RUNTIME_ENV;
}

export function getRuntimeEnv() {
  return globalThis.__HJ_RUNTIME_ENV || {};
}

export function envString(key, fallback = '') {
  const value = getRuntimeEnv()?.[key];
  return value == null ? fallback : String(value).trim();
}

export function supabaseUrl() {
  return envString('SUPABASE_URL') || envString('VITE_SUPABASE_URL') || 'https://yajkfglagnyvenddyvok.supabase.co';
}

export function serviceRoleKey() {
  return envString('SUPABASE_SERVICE_ROLE_KEY');
}

export function publishableKey() {
  return envString('SUPABASE_PUBLISHABLE_KEY') || envString('VITE_SUPABASE_PUBLISHABLE_KEY') || envString('VITE_SUPABASE_ANON_KEY');
}

export function bearerToken(request) {
  const header = String(request?.headers?.get('authorization') || '');
  return /^Bearer\s+\S+$/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : '';
}

export function headersForCors(request) {
  const origin = String(request?.headers?.get('origin') || '').trim();
  const configured = new Set(
    envString('CORS_ALLOWED_ORIGINS')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
  const trusted = new Set([
    'https://hj-groups-web.pages.dev',
    'https://hj-groups-website.getvoroa.com',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...configured,
  ]);

  const headers = new Headers({
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Cache-Control, Pragma, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), payment=()',
  });

  if (origin && trusted.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

export function mergeHeaders(...sources) {
  const headers = new Headers();
  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source instanceof Headers ? Object.fromEntries(source.entries()) : source)) {
      if (value != null && value !== '') headers.set(key, String(value));
    }
  }
  return headers;
}

export function jsonResponse(request, status, payload, extra = {}) {
  const headers = headersForCors(request);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', extra['Cache-Control'] || extra['cache-control'] || 'no-store');
  for (const [key, value] of Object.entries(extra)) {
    if (value != null) headers.set(key, String(value));
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

export function emptyResponse(request, status = 204, extra = {}) {
  const headers = headersForCors(request);
  for (const [key, value] of Object.entries(extra)) headers.set(key, String(value));
  return new Response(null, { status, headers });
}

export async function readJsonBody(request, maxBytes = 250_000) {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw Object.assign(new Error('Request body too large'), { code: 'BODY_TOO_LARGE' });
  }
  return JSON.parse(text || '{}');
}

export function validPositiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

export async function supabaseRequest(path, {
  method = 'GET',
  body,
  headers = {},
  role = 'service',
  params,
} = {}) {
  const base = supabaseUrl().replace(/\/+$/, '');
  const key = role === 'publishable' ? publishableKey() : serviceRoleKey();
  if (!base || !key) throw new Error('Supabase runtime credentials are not configured.');

  const url = new URL(base + path);
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      if (value != null) url.searchParams.set(name, String(value));
    }
  }

  const requestHeaders = new Headers({
    apikey: key,
    Accept: 'application/json',
  });
  if (role === 'user') requestHeaders.set('Authorization', 'Bearer ' + String(headers.authorization || ''));
  else requestHeaders.set('Authorization', 'Bearer ' + key);

  for (const [name, value] of Object.entries(headers)) {
    if (value != null && name.toLowerCase() !== 'authorization') requestHeaders.set(name, String(value));
  }

  if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const response = await fetch(url.toString(), {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return response;
}

export async function supabaseJson(path, options = {}) {
  const response = await supabaseRequest(path, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    const error = new Error(
      'Supabase HTTP ' + response.status + (data?.message ? ': ' + String(data.message).slice(0, 220) : '')
    );
    error.status = response.status;
    error.code = data?.code;
    error.payload = data;
    throw error;
  }
  return data;
}

export async function authenticateUser(request) {
  const token = bearerToken(request);
  if (!token) return null;
  try {
    const response = await supabaseRequest('/auth/v1/user', {
      role: 'user',
      headers: { authorization: token },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function requireUser(request) {
  const user = await authenticateUser(request);
  if (!user?.id) {
    return { ok: false, response: jsonResponse(request, 401, { error: 'Unauthorized' }) };
  }
  return { ok: true, user };
}

export function isAdminUser(user) {
  return user?.app_metadata?.role === 'admin';
}

export async function requireAdmin(request) {
  const result = await requireUser(request);
  if (!result.ok) return result;
  if (!isAdminUser(result.user)) {
    return { ok: false, response: jsonResponse(request, 403, { error: 'Forbidden' }) };
  }
  return result;
}

export async function hmacBytes(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(value)))
  );
}

export async function hmacHex(secret, value) {
  return bytesToHex(await hmacBytes(secret, value));
}

export async function hmacVerify(secret, value, signatureBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    new TextEncoder().encode(String(value))
  );
}

export function randomBytes(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function randomToken() {
  return bytesToBase64Url(randomBytes(32));
}

export async function sha256Hex(value) {
  const input = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', input);
  return bytesToHex(digest);
}

export function safeReturnPath(value) {
  const raw = String(value || '/').trim();
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\r\n]/.test(raw)) return '/';
  return raw || '/';
}

export function parseAccessTypes(value) {
  if (Array.isArray(value)) return value.map(String).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const text = String(value ?? '').trim();
  if (!text) return ['free'];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String).map((x) => x.trim().toLowerCase()).filter(Boolean);
    } catch {}
  }
  return text.split(/[+,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
}

export function isAdsEnabled(content) {
  return parseAccessTypes(content?.access_type ?? content?.accessType).includes('ads');
}

export async function getContentRecord(contentType, contentId) {
  let table;
  let select;
  if (contentType === 'audio') {
    table = 'episodes';
    select = 'id,episode_number,number,story_id,access_type,available,type,title,telegram_message_id';
  } else if (contentType === 'video') {
    table = 'video_episodes';
    select = 'id,number,video_story_id,access_type,available,type,title,telegram_message_id';
  } else {
    table = 'books';
    select = 'id,access_type,available,title,telegram_message_id';
  }

  const rows = await supabaseJson('/rest/v1/' + table, {
    params: { select, id: 'eq.' + contentId, limit: 1 },
  });

  if (!Array.isArray(rows) || !rows[0]) throw new Error('Requested content was not found.');
  if (rows[0].available === false) throw new Error('This content is currently unavailable.');
  return rows[0];
}

export function parseCookies(request) {
  const raw = String(request.headers.get('cookie') || '');
  const out = {};
  for (const item of raw.split(';')) {
    const [key, ...rest] = item.trim().split('=');
    if (key) {
      try { out[key] = decodeURIComponent(rest.join('=')); } catch { out[key] = rest.join('='); }
    }
  }
  return out;
}

export function setCookieHeaders(name, value, { maxAge = 600, httpOnly = false } = {}) {
  const secure = 'https:' === 'https:';
  return name + '=' + encodeURIComponent(value) +
    '; Path=/; Max-Age=' + maxAge + '; SameSite=Lax' +
    (httpOnly ? '; HttpOnly' : '') +
    (secure ? '; Secure' : '');
}

export function responseErrorDetail(error, fallback = 'Request failed.') {
  const message = String(error?.message || fallback).replace(/[\r\n]+/g, ' ').slice(0, 300);
  return message;
}

export function isProductionRuntime() {
  return envString('NODE_ENV', 'production') === 'production';
}
