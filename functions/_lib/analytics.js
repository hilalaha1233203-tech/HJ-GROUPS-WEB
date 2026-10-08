import {
  authenticateUser,
  bearerToken,
  envString,
  jsonResponse,
  supabaseJson,
  supabaseRequest,
  readJsonBody,
} from './runtime.js';

export async function handleAnalyticsLinkSession(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return jsonResponse(request, 405, { error: 'Method not allowed' }, { Allow: 'POST, OPTIONS' });

  const user = await authenticateUser(request);
  if (!user?.id) return jsonResponse(request, 401, { error: 'Unauthorized' });

  try {
    const body = await readJsonBody(request);
    const sessionId = String(body?.session_id || '').trim();
    if (!/^hj_[A-Za-z0-9_-]{13,127}$/.test(sessionId)) {
      return jsonResponse(request, 400, { error: 'Invalid analytics session id.' });
    }

    const response = await supabaseRequest('/rest/v1/analytics_session_links', {
      method: 'POST',
      body: { session_id: sessionId, user_id: user.id },
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    });

    if (!response.ok) return jsonResponse(request, 500, { error: 'Analytics session link failed.' });
    return jsonResponse(request, 200, { linked: true });
  } catch {
    return jsonResponse(request, 400, { error: 'Invalid analytics session link request.' });
  }
}

export async function handleAdminAnalytics(request) {
  if (request.method !== 'GET') return jsonResponse(request, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
  const user = await authenticateUser(request);
  if (!user?.id) return jsonResponse(request, 401, { error: 'Unauthorized' });
  if (user.app_metadata?.role !== 'admin') return jsonResponse(request, 403, { error: 'Forbidden' });

  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '7d';
  const requestedStart = url.searchParams.get('start');
  const requestedEnd = url.searchParams.get('end');
  const grouping = ['day','week','month'].includes(url.searchParams.get('group')) ? url.searchParams.get('group') : 'day';

  let start = null;
  let end = null;
  if (requestedStart && requestedEnd) {
    const startDate = new Date(requestedStart);
    const endDate = new Date(requestedEnd);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || startDate >= endDate) {
      return jsonResponse(request, 400, { error: 'Invalid analytics date range' });
    }
    start = startDate.toISOString();
    end = endDate.toISOString();
  } else if (range !== 'all') {
    const now = new Date();
    const startDate = new Date(now);
    if (range === 'today') startDate.setUTCHours(0, 0, 0, 0);
    else if (range === '30d') startDate.setUTCDate(startDate.getUTCDate() - 30);
    else startDate.setUTCDate(startDate.getUTCDate() - 7);
    start = startDate.toISOString();
    end = now.toISOString();
  }

  try {
    const data = await supabaseJson('/rest/v1/rpc/get_hj_admin_analytics_v2', {
      method: 'POST',
      body: { p_start_at: start, p_end_at: end, p_grouping: grouping },
    });
    return jsonResponse(request, 200, data || {});
  } catch {
    return jsonResponse(request, 500, { error: 'Analytics unavailable' });
  }
}
