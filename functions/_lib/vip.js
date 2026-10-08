import {
  authenticateUser,
  envString,
  isAdminUser,
  jsonResponse,
  readJsonBody,
  supabaseJson,
  supabaseRequest,
  validUuid,
} from './runtime.js';

function futureExpiry(value) {
  if (value == null || value === '') return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time <= Date.now()) throw Object.assign(new Error('VIP expiry must be a future date or empty for lifetime access.'), { status: 400 });
  return new Date(time).toISOString();
}

async function adminUserById(id) {
  return supabaseJson('/auth/v1/admin/users/' + encodeURIComponent(id));
}

async function listUsers() {
  const all = [];
  for (let page = 1; page <= 1000; page += 1) {
    const batch = await supabaseJson('/auth/v1/admin/users', { params: { page, per_page: 1000 } });
    const users = Array.isArray(batch?.users) ? batch.users : [];
    all.push(...users);
    if (users.length < 1000) break;
  }
  return all
    .filter((user) => user?.is_anonymous !== true && !user?.deleted_at)
    .map((user) => ({
      id: user.id,
      email: String(user.email || ''),
      name: String(user.user_metadata?.full_name || user.user_metadata?.name || ''),
      createdAt: user.created_at || null,
      isAdmin: isAdminUser(user),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

async function listGrants() {
  return supabaseJson('/rest/v1/user_vip_grants', {
    params: { select: 'user_id,granted_by,granted_at,expires_at,note', order: 'granted_at.desc' },
  });
}

export async function handleVipAdmin(request) {
  const user = await authenticateUser(request);
  if (!user?.id) return jsonResponse(request, 401, { error: 'Unauthorized' });
  if (!isAdminUser(user)) return jsonResponse(request, 403, { error: 'Admin access required.' });

  try {
    if (request.method === 'GET') {
      const [users, grants] = await Promise.all([listUsers(), listGrants()]);
      return jsonResponse(request, 200, { ok: true, users, grants });
    }
    if (request.method !== 'POST') return jsonResponse(request, 405, { error: 'Method not allowed' }, { Allow: 'GET, POST' });

    const body = await readJsonBody(request);
    const action = String(body?.action || '').trim().toLowerCase();
    const userId = String(body?.userId || '').trim();
    if (!validUuid(userId)) return jsonResponse(request, 400, { error: 'Invalid user id.' });
    if (userId === user.id) return jsonResponse(request, 400, { error: 'The admin account does not need a separate VIP grant.' });

    const targetResponse = await adminUserById(userId);
    const target = targetResponse?.user || null;
    if (!target || target.deleted_at || target.is_anonymous) return jsonResponse(request, 404, { error: 'User was not found.' });

    if (action === 'grant') {
      const expiresAt = futureExpiry(body?.expiresAt);
      const note = String(body?.note || '').trim().slice(0, 500);
      const result = await supabaseRequest('/rest/v1/user_vip_grants', {
        method: 'POST',
        body: {
          user_id: userId,
          granted_by: user.id,
          granted_at: new Date().toISOString(),
          expires_at: expiresAt,
          note,
        },
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      });
      if (!result.ok) return jsonResponse(request, 500, { error: 'Unable to save VIP grant.' });
      return jsonResponse(request, 200, { ok: true, action: 'granted', userId, expiresAt });
    }

    if (action === 'revoke') {
      const response = await supabaseRequest('/rest/v1/user_vip_grants', {
        method: 'DELETE',
        params: { user_id: 'eq.' + userId },
      });
      if (!response.ok) return jsonResponse(request, 500, { error: 'Unable to revoke VIP grant.' });
      return jsonResponse(request, 200, { ok: true, action: 'revoked', userId });
    }

    return jsonResponse(request, 400, { error: 'Unsupported VIP action.' });
  } catch (error) {
    return jsonResponse(request, Number(error?.status) || 500, { error: error?.message || 'VIP access service error.' });
  }
}

export async function hasActiveVipGrant(userId) {
  if (!validUuid(userId)) return false;
  try {
    const rows = await supabaseJson('/rest/v1/user_vip_grants', {
      params: { select: 'expires_at', user_id: 'eq.' + userId, limit: 1 },
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    return Boolean(row) && (!row.expires_at || Date.parse(row.expires_at) > Date.now());
  } catch {
    return false;
  }
}

export async function handleVipSelf(request) {
  const user = await authenticateUser(request);
  if (!user?.id) return jsonResponse(request, 401, { error: 'Unauthorized' });
  if (request.method !== 'GET') return jsonResponse(request, 405, { error: 'Method not allowed' }, { Allow: 'GET' });

  if (isAdminUser(user)) return jsonResponse(request, 200, { ok: true, active: true, expiresAt: null, source: 'admin' });

  try {
    const rows = await supabaseJson('/rest/v1/user_vip_grants', {
      params: { select: 'expires_at', user_id: 'eq.' + user.id, limit: 1 },
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    const active = Boolean(row) && (!row.expires_at || Date.parse(row.expires_at) > Date.now());
    return jsonResponse(request, 200, { ok: true, active, expiresAt: active ? row.expires_at || null : null, source: active ? 'admin_vip' : null });
  } catch {
    return jsonResponse(request, 500, { error: 'VIP access verification failed.' });
  }
}
