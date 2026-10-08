import {
  authenticateUser,
  envString,
  hmacHex,
  isAdsEnabled,
  jsonResponse,
  randomToken,
  readJsonBody,
  supabaseJson,
  supabaseRequest,
  validPositiveId,
} from './runtime.js';
import { resolveAdUnlockPlan, validateAdUnlockRules } from '../../src/lib/adUnlockRules.js';

const INTENT_TTL_MS = 10 * 60_000;

async function settings() {
  const rows = await supabaseJson('/rest/v1/app_settings', {
    params: { select: 'value', id: 'eq.hj_admin_settings', limit: 1 },
  });
  const value = Array.isArray(rows) ? rows[0]?.value || {} : {};
  const ads = value.ads || {};
  const rules = validateAdUnlockRules(ads.episodeUnlockRules);
  if (!rules.valid) throw new Error('Ads episode unlock rules are invalid.');
  return {
    enabled: ads.enabled === true,
    provider: String(ads.provider || '').trim().toLowerCase(),
    rewardedAdUnitId: String(ads.rewardedAdUnitId || '').trim(),
    durationMinutes: Math.min(1440, Math.max(1, Number(ads.unlockDurationMinutes) || 360)),
    rules: rules.normalizedRules,
  };
}

async function content(type, id) {
  const table = type === 'audio' ? 'episodes' : 'video_episodes';
  const select = type === 'audio'
    ? 'id,number,episode_number,story_id,access_type,available,type'
    : 'id,number,video_story_id,access_type,available,type';
  const rows = await supabaseJson('/rest/v1/' + table, {
    params: { select, id: 'eq.' + id, limit: 1 },
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error('Requested content was not found.');
  if (row.available === false) throw new Error('This content is currently unavailable.');
  if (!isAdsEnabled(row)) throw new Error('This content does not have an Ads unlock path.');
  return row;
}

function contextFor(type, row) {
  const storyId = Number(type === 'audio' ? row.story_id : row.video_story_id);
  const episodeNumber = Number(type === 'audio' ? (row.number ?? row.episode_number) : row.number);
  if (!Number.isInteger(storyId) || storyId < 1 || !Number.isInteger(episodeNumber) || episodeNumber < 1) {
    throw new Error('Ads unlock target is missing a valid story or episode number.');
  }
  return { storyId, episodeNumber };
}

// Exact range query helper; kept separate because query parameters are unique-keyed.
async function rangeEpisodes(type, storyId, start, end) {
  if (type === 'audio') {
    const base = {
      story_id: 'eq.' + storyId,
      limit: '1000',
    };
    const [numbers, legacy] = await Promise.all([
      supabaseJson('/rest/v1/episodes', { params: { ...base, select:'number,episode_number,available', number:'gte.'+start, order:'number.asc' } }),
      supabaseJson('/rest/v1/episodes', { params: { ...base, select:'number,episode_number,available', episode_number:'gte.'+start, order:'episode_number.asc' } }),
    ]);
    return [...new Set([...(numbers||[]), ...(legacy||[])]
      .filter((row) => row?.available !== false)
      .map((row)=>Number(row?.number ?? row?.episode_number))
      .filter((n)=>Number.isInteger(n)&&n>=start&&n<=end)
    )].sort((a,b)=>a-b);
  }
  const rows = await supabaseJson('/rest/v1/video_episodes', {
    params: { select:'number,available', video_story_id:'eq.'+storyId, number:'gte.'+start, order:'number.asc', limit:'1000' },
  });
  return [...new Set((rows||[]).filter((row)=>row?.available!==false).map((row)=>Number(row.number)).filter((n)=>Number.isInteger(n)&&n>=start&&n<=end))].sort((a,b)=>a-b);
}

async function activeUnlock(userId, type, id, row) {
  const now = new Date().toISOString();
  const exact = await supabaseJson('/rest/v1/ad_unlocks', {
    params: { select:'id,expires_at,story_id,start_episode_number,end_episode_number', user_id:'eq.'+userId, provider:'eq.rewarded_ad', content_type:'eq.'+type, content_id:'eq.'+id, expires_at:'gt.'+now, order:'expires_at.desc', limit:1 },
  });
  if (Array.isArray(exact) && exact[0]) return exact[0];

  if (!isAdsEnabled(row)) return null;
  const { storyId, episodeNumber } = contextFor(type, row);
  const ranged = await supabaseJson('/rest/v1/ad_unlocks', {
    params: { select:'id,expires_at,story_id,start_episode_number,end_episode_number', user_id:'eq.'+userId, provider:'eq.rewarded_ad', content_type:'eq.'+type, story_id:'eq.'+storyId, start_episode_number:'lte.'+episodeNumber, end_episode_number:'gte.'+episodeNumber, expires_at:'gt.'+now, order:'expires_at.desc', limit:1 },
  });
  return Array.isArray(ranged) ? ranged[0] || null : null;
}

async function purchased(userId, type, row) {
  const candidates = type === 'audio'
    ? [row.story_id, row.id]
    : [row.video_story_id, row.id];
  const ids = [...new Set(candidates.map(Number).filter((id)=>Number.isInteger(id)&&id>0))];
  if (!ids.length) return false;
  const rows = await supabaseJson('/rest/v1/purchases', {
    params: { select:'story_id,expires_at', user_id:'eq.'+userId, story_id:'in.('+ids.join(',')+')', limit:'1000' },
  });
  const now = Date.now();
  return (rows || []).some((p)=>Number.isFinite(Date.parse(p.expires_at || '')) ? Date.parse(p.expires_at) > now : !p.expires_at);
}
export async function handleAds(request) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/ads/')) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  try {
    const user = await authenticateUser(request);
    if (!user?.id) return jsonResponse(request, 401, { error: 'Unauthorized' });

    if (path === '/api/ads/entitlements' && request.method === 'GET') {
      const rows = await supabaseJson('/rest/v1/ad_unlocks', {
        params: { select:'id,content_type,content_id,expires_at,story_id,start_episode_number,end_episode_number', user_id:'eq.'+user.id, provider:'eq.rewarded_ad', expires_at:'gt.'+new Date().toISOString(), order:'expires_at.desc' },
      });
      return jsonResponse(request, 200, { unlocks: Array.isArray(rows) ? rows : [] });
    }

    if (path === '/api/ads/preview' && request.method === 'POST') {
      const body = await readJsonBody(request);
      const type = String(body?.contentType || '').toLowerCase();
      const id = validPositiveId(body?.contentId);
      if (!['audio','video'].includes(type) || !id) return jsonResponse(request, 400, { error: 'Invalid unlock target.' });
      const s = await settings();
      if (!s.enabled) return jsonResponse(request, 503, { error: 'Ads unlock is disabled.' });
      if (s.provider !== 'google' || !s.rewardedAdUnitId) return jsonResponse(request, 503, { error: 'Rewarded Ads provider is not configured for web.' });
      const row = await content(type, id);
      const { storyId, episodeNumber } = contextFor(type, row);
      const plan = resolveAdUnlockPlan(episodeNumber, s.rules);
      const episodeNumbers = await rangeEpisodes(type, storyId, plan.startEpisode, plan.endEpisode);
      const existing = await activeUnlock(user.id, type, id, row);
      return jsonResponse(request, 200, {
        ok: true, provider: s.provider, storyId, episodeNumber,
        unlockCount: plan.unlockCount, unlockStartEpisode: plan.startEpisode,
        unlockEndEpisode: plan.endEpisode, episodeNumbers,
        durationMinutes: s.durationMinutes,
        alreadyGranted: Boolean(existing), expiresAt: existing?.expires_at || null,
      });
    }

    if (path === '/api/ads/start' && request.method === 'POST') {
      const body = await readJsonBody(request);
      const type = String(body?.contentType || '').toLowerCase();
      const id = validPositiveId(body?.contentId);
      if (!['audio','video'].includes(type) || !id) return jsonResponse(request, 400, { error: 'Invalid unlock target.' });
      const s = await settings();
      if (!s.enabled) return jsonResponse(request, 503, { error: 'Ads unlock is currently disabled.' });
      if (s.provider !== 'google' || !s.rewardedAdUnitId) return jsonResponse(request, 503, { error: 'Rewarded Ads provider is not configured for web.' });
      const row = await content(type, id);
      const { storyId, episodeNumber } = contextFor(type, row);
      const existing = await activeUnlock(user.id, type, id, row);
      if (existing?.expires_at) return jsonResponse(request, 200, { ok:true, alreadyGranted:true, expiresAt:existing.expires_at });
      const plan = resolveAdUnlockPlan(episodeNumber, s.rules);
      const episodeNumbers = await rangeEpisodes(type, storyId, plan.startEpisode, plan.endEpisode);
      const rawToken = randomToken();
      const expiresAt = new Date(Date.now() + INTENT_TTL_MS).toISOString();
      const tokenHash = await hmacHex(envString('UNLOCK_TOKEN_SECRET'), rawToken);
      const response = await supabaseRequest('/rest/v1/rewarded_ad_unlock_intents', {
        method:'POST',
        body:{
          token_hash:tokenHash, user_id:user.id, content_type:type, content_id:id,
          story_id:storyId, start_episode_number:plan.startEpisode,
          end_episode_number:plan.endEpisode, status:'pending', expires_at:expiresAt,
        },
        headers:{Prefer:'return=minimal'},
      });
      if (!response.ok) return jsonResponse(request, 500, { error:'Unable to create Ads unlock session.' });
      return jsonResponse(request, 200, {
        ok:true, token:rawToken, provider:s.provider, rewardedAdUnitId:s.rewardedAdUnitId,
        storyId, episodeNumber, unlockCount:plan.unlockCount,
        unlockStartEpisode:plan.startEpisode, unlockEndEpisode:plan.endEpisode,
        episodeNumbers, durationMinutes:s.durationMinutes,
      });
    }

    if (path === '/api/ads/complete' && request.method === 'POST') {
      const body = await readJsonBody(request);
      const rawToken = String(body?.token || '').trim();
      if (!rawToken) return jsonResponse(request, 400, { error:'Invalid Ads completion session.' });
      const tokenHash = await hmacHex(envString('UNLOCK_TOKEN_SECRET'), rawToken);
      const rows = await supabaseJson('/rest/v1/rewarded_ad_unlock_intents', {
        params:{ select:'*', token_hash:'eq.'+tokenHash, limit:1 },
      });
      const intent = Array.isArray(rows) ? rows[0] : null;
      if (!intent || intent.user_id !== user.id || intent.status !== 'pending') return jsonResponse(request, 403, { error:'Invalid Ads completion session.' });
      if (Date.parse(intent.expires_at || '') <= Date.now()) {
        await supabaseRequest('/rest/v1/rewarded_ad_unlock_intents',{
          method:'PATCH', body:{status:'expired'},
          params:{id:'eq.'+intent.id},
        });
        return jsonResponse(request, 410, { error:'Ads completion session expired.' });
      }

      const type = String(intent.content_type || '').toLowerCase();
      const id = Number(intent.content_id);
      const row = await content(type, id);
      const s = await settings();
      const { storyId, episodeNumber } = contextFor(type, row);
      const plan = resolveAdUnlockPlan(episodeNumber, s.rules);
      const episodeNumbers = await rangeEpisodes(type, storyId, plan.startEpisode, plan.endEpisode);
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + s.durationMinutes * 60_000).toISOString();

      const covered = await activeUnlock(user.id, type, id, row);
      let finalExpiry = expiresAt;
      if (covered?.expires_at && Date.parse(covered.expires_at) > Date.now()) finalExpiry = covered.expires_at;

      if (!covered) {
        const insert = await supabaseRequest('/rest/v1/ad_unlocks', {
          method:'POST',
          body:{
            user_id:user.id, content_type:type, content_id:id, provider:'rewarded_ad',
            expires_at:finalExpiry, story_id:storyId,
            start_episode_number:plan.startEpisode, end_episode_number:plan.endEpisode,
            updated_at:now,
          },
          headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},
        });
        if (!insert.ok) return jsonResponse(request, 500, { error:'Unable to save Ads temporary access.' });
      }

      await supabaseRequest('/rest/v1/rewarded_ad_unlock_intents',{
        method:'PATCH', body:{status:'completed',completed_at:now},
        params:{id:'eq.'+intent.id,status:'eq.pending'},
      });

      return jsonResponse(request, 200, {
        ok:true, contentType:type, contentId:id, storyId, episodeNumber,
        expiresAt:finalExpiry, unlockCount:plan.unlockCount,
        unlockStartEpisode:plan.startEpisode, unlockEndEpisode:plan.endEpisode,
        episodeNumbers, reusedExisting:Boolean(covered),
      });
    }

    return jsonResponse(request, 404, { error:'Not found' });
  } catch (error) {
    return jsonResponse(request, Number(error?.status) || 500, { error: String(error?.message || 'Ads service error.').slice(0,300) });
  }
}
