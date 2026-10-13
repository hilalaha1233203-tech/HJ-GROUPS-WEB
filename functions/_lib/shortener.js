import {
  authenticateUser,
  envString,
  hmacHex,
  isAdminUser,
  jsonResponse,
  parseCookies,
  randomToken,
  readJsonBody,
  safeReturnPath,
  supabaseJson,
  supabaseRequest,
  validPositiveId,
} from './runtime.js';
import { resolveAdUnlockPlan, validateAdUnlockRules } from '../../src/lib/adUnlockRules.js';
import { hasActiveVipGrant } from './vip.js';

const UNLOCK_INTENT_TTL_MINUTES = 20;
const UNLOCK_CODE_TTL_MINUTES = 10;
const PROVIDER_TIMEOUT_MS = 12_000;
const ALLOWED_CONTENT_TYPES = new Set(['audio','video','book']);

function isAdsEnabled(content) {
  const value = content?.access_type ?? content?.accessType;
  if (Array.isArray(value)) return value.map(String).map((v)=>v.trim().toLowerCase()).includes('ads');
  const raw = String(value || '').trim();
  if (raw.startsWith('[')) {
    try { return JSON.parse(raw).map(String).map((v)=>v.trim().toLowerCase()).includes('ads'); } catch {}
  }
  return raw.split(/[+,\s]+/).map((v)=>v.trim().toLowerCase()).includes('ads');
}

async function adminAuth(request) {
  const user = await authenticateUser(request);
  return user?.id && isAdminUser(user) ? user : null;
}

async function settings() {
  const rows = await supabaseJson('/rest/v1/app_settings', {
    params: { select:'value', id:'eq.hj_admin_settings', limit:1 },
  });
  const value = Array.isArray(rows) ? rows[0]?.value || {} : {};
  const shortener = value.shortener || value.ads || {};
  const validation = validateAdUnlockRules(shortener.episodeUnlockRules || shortener.shortenerEpisodeUnlockRules);
  if (!validation.valid) throw new Error('Shortener episode unlock rules are invalid.');
  return {
    shortenerEnabled: shortener.enabled === true || shortener.shortenerEnabled === true,
    primary: String(shortener.primaryProvider || shortener.primaryShortener || 'arolinks').trim().toLowerCase(),
    fallback: String(shortener.fallbackProvider || shortener.fallbackShortener || 'earn4link').trim().toLowerCase(),
    unlockDurationMinutes: Math.min(1440, Math.max(1, Number(shortener.unlockDurationMinutes || shortener.shortenerUnlockDurationMinutes) || 360)),
    episodeUnlockRules: validation.normalizedRules,
  };
}

const adapters = {
  arolinks: { host:'arolinks.com', tokenEnv:'AROLINKS_API_TOKEN' },
  earn4link: { host:'earn4link.in', tokenEnv:'EARN4LINK_API_TOKEN' },
};

function providerOrder(s) {
  return [...new Set([s.primary,s.fallback].filter((p)=>Object.prototype.hasOwnProperty.call(adapters,p)))];
}

function providerUrl(body, provider) {
  const host = adapters[provider]?.host;
  if (!host) return '';
  const values = [];
  const walk = (v) => {
    if (typeof v === 'string') values.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  try { walk(JSON.parse(body)); } catch {}
  values.push(String(body || ''));
  for (const value of values) {
    for (const match of value.match(/https?:\/\/[^\s"'<>\\]+/g) || []) {
      try {
        const u = new URL(match);
        if (u.hostname === host || u.hostname.endsWith('.' + host)) return u.toString();
      } catch {}
    }
  }
  return '';
}

async function createShortLink(provider, destinationUrl) {
  const adapter = adapters[provider];
  const token = envString(adapter?.tokenEnv);
  if (!adapter || !token) throw new Error('Provider is not configured.');

  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const endpoint = new URL('https://' + adapter.host + '/api');
    endpoint.searchParams.set('api', token);
    endpoint.searchParams.set('url', destinationUrl);
    const response = await fetch(endpoint.toString(), {
      method:'GET',
      headers:{Accept:'application/json,text/plain;q=0.9,*/*;q=0.8'},
      signal:controller.signal,
    });
    const body = await response.text();
    if (!response.ok) throw new Error('Provider HTTP ' + response.status);
    const shortUrl = providerUrl(body, provider);
    if (!shortUrl) throw new Error('Provider returned no valid shortened URL.');
    return shortUrl;
  } catch {
    throw new Error('Shortener provider request failed.');
  } finally { clearTimeout(timer); }
}

async function createShortLinkWithFallback(destinationUrl, order) {
  let lastError = null;
  for (const provider of order) {
    try { return { provider, shortUrl: await createShortLink(provider, destinationUrl) }; }
    catch (error) { lastError = error; }
  }
  throw lastError || new Error('All shortener providers failed.');
}

async function content(contentType, contentId) {
  const table = contentType === 'audio' ? 'episodes' : contentType === 'video' ? 'video_episodes' : 'books';
  const select = contentType === 'audio'
    ? 'id,episode_number,number,story_id,access_type,available,type'
    : contentType === 'video'
      ? 'id,number,video_story_id,access_type,available,type'
      : 'id,access_type,available';
  const rows = await supabaseJson('/rest/v1/' + table, { params:{select,id:'eq.'+contentId,limit:1} });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error('Requested content was not found.');
  if (row.available === false) throw new Error('This content is currently unavailable.');
  return row;
}

function episodeContext(type,row) {
  if (type === 'audio') {
    return { storyId:Number(row.story_id), episodeNumber:Number(row.number ?? row.episode_number) };
  }
  if (type === 'video') return { storyId:Number(row.video_story_id), episodeNumber:Number(row.number) };
  return { storyId:null, episodeNumber:null };
}

async function existingNumbers(type, storyId, start, end) {
  if (!storyId || type === 'book') return [];
  if (type === 'audio') {
    const [a,b] = await Promise.all([
      supabaseJson('/rest/v1/episodes',{params:{select:'number,episode_number,available',story_id:'eq.'+storyId,number:'gte.'+start,order:'number.asc',limit:1000}}),
      supabaseJson('/rest/v1/episodes',{params:{select:'number,episode_number,available',story_id:'eq.'+storyId,episode_number:'gte.'+start,order:'episode_number.asc',limit:1000}}),
    ]);
    return [...new Set([...(a||[]),...(b||[])].filter((r)=>r?.available!==false).map((r)=>Number(r.number ?? r.episode_number)).filter((n)=>Number.isInteger(n)&&n>=start&&n<=end))].sort((x,y)=>x-y);
  }
  const rows = await supabaseJson('/rest/v1/video_episodes',{params:{select:'number,available',video_story_id:'eq.'+storyId,number:'gte.'+start,order:'number.asc',limit:1000}});
  return [...new Set((rows||[]).filter((r)=>r?.available!==false).map((r)=>Number(r.number)).filter((n)=>Number.isInteger(n)&&n>=start&&n<=end))].sort((x,y)=>x-y);
}

async function activeShortenerUnlock(userId,type,id,row) {
  const now = new Date().toISOString();
  const exact = await supabaseJson('/rest/v1/shortener_unlocks',{params:{select:'id,content_id,expires_at,story_id,start_episode_number,end_episode_number',user_id:'eq.'+userId,content_type:'eq.'+type,content_id:'eq.'+id,expires_at:'gt.'+now,order:'expires_at.desc',limit:1}});
  if (Array.isArray(exact) && exact[0]) return exact[0];
  if (!isAdsEnabled(row) || !['audio','video'].includes(type)) return null;
  const {storyId,episodeNumber}=episodeContext(type,row);
  const ranged = await supabaseJson('/rest/v1/shortener_unlocks',{params:{select:'id,content_id,expires_at,story_id,start_episode_number,end_episode_number',user_id:'eq.'+userId,content_type:'eq.'+type,story_id:'eq.'+storyId,start_episode_number:'lte.'+episodeNumber,end_episode_number:'gte.'+episodeNumber,expires_at:'gt.'+now,order:'expires_at.desc',limit:1}});
  return Array.isArray(ranged) ? ranged[0] || null : null;
}

async function purchaseAccess(userId,row,type) {
  const ids = type === 'audio' ? [row.story_id,row.id] : type === 'video' ? [row.video_story_id,row.id] : [row.id];
  const values=[...new Set(ids.map(Number).filter((id)=>Number.isInteger(id)&&id>0))];
  if (!values.length) return false;
  const rows=await supabaseJson('/rest/v1/purchases',{params:{select:'story_id,expires_at',user_id:'eq.'+userId,story_id:'in.('+values.join(',')+')',limit:1000}});
  return (rows||[]).some((r)=>!r.expires_at || Date.parse(r.expires_at)>Date.now());
}

async function existingAccess(user,type,id,row,userId) {
  if (!user) return null;
  if (isAdminUser(user)) return { source:'admin', expiresAt:null };
  if (await hasActiveVipGrant(userId)) return { source:'admin_vip', expiresAt:null };
  const short = await activeShortenerUnlock(userId,type,id,row);
  if (short?.expires_at) return {
    source:'shortener_unlock', expiresAt:short.expires_at,
    storyId:short.story_id ?? null,
    unlockStartEpisode:short.start_episode_number ?? null,
    unlockEndEpisode:short.end_episode_number ?? null,
  };
  if (await purchaseAccess(userId,row,type)) return { source:'purchase', expiresAt:null };
  return null;
}

async function findPermanentLink(type,id) {
  const rows = await supabaseJson('/rest/v1/shortener_links',{
    params:{select:'id,provider,short_url,destination_path,provider_chain,active',content_type:'eq.'+type,content_id:'eq.'+id,active:'eq.true',limit:1},
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

function reusable(link, chain) {
  return Boolean(link?.active===true && link.short_url && String(link.destination_path||'').startsWith('/unlock/') && link.provider_chain===chain);
}

async function permanentLink(type,id,requestUrl) {
  const s=await settings();
  const order=providerOrder(s);
  if (!order.length) throw new Error('No shortener provider is configured.');
  const chain=order.join('>');
  const existing=await findPermanentLink(type,id);
  if (reusable(existing,chain)) return {link:existing,reused:true};
  const destinationPath='/unlock/'+type+'/'+id;
  const destinationUrl=new URL(destinationPath,requestUrl).toString();
  const created=await createShortLinkWithFallback(destinationUrl,order);
  if (existing?.id) {
    const response=await supabaseRequest('/rest/v1/shortener_links',{
      method:'PATCH',
      body:{provider:created.provider,short_url:created.shortUrl,destination_path:destinationPath,provider_chain:chain,active:true,updated_at:new Date().toISOString()},
      params:{id:'eq.'+existing.id},
    });
    if (!response.ok) throw new Error('Unable to save shortener link.');
    return {link:{...existing,provider:created.provider,short_url:created.shortUrl,destination_path:destinationPath,provider_chain:chain,active:true},reused:false};
  }
  const response=await supabaseRequest('/rest/v1/shortener_links',{
    method:'POST',
    body:{content_type:type,content_id:id,provider:created.provider,short_url:created.shortUrl,destination_path:destinationPath,provider_chain:chain,active:true},
    headers:{Prefer:'return=representation'},
  });
  if (!response.ok) {
    const latest=await findPermanentLink(type,id);
    if (reusable(latest,chain)) return {link:latest,reused:true};
    throw new Error('Unable to save shortener link.');
  }
  const data=await response.json().catch(()=>[]);
  return {link:Array.isArray(data)?data[0]:data,reused:false};
}

function cookieHeader(name,value,maxAge,httpOnly=true) {
  return name+'='+encodeURIComponent(value)+'; Path=/; Max-Age='+maxAge+'; SameSite=Lax'+(httpOnly?'; HttpOnly':'')+'; Secure';
}

async function createIntent(user,type,id,provider,destinationPath,returnPath) {
  const secret=envString('UNLOCK_TOKEN_SECRET');
  if (!secret) throw new Error('Temporary unlock is not configured.');
  const rawToken=randomToken();
  const tokenHash=await hmacHex(secret,rawToken);
  const expiresAt=new Date(Date.now()+UNLOCK_INTENT_TTL_MINUTES*60_000).toISOString();
  const response=await supabaseRequest('/rest/v1/ad_unlock_intents',{
    method:'POST',
    body:{
      token_hash:tokenHash,user_id:user.id,content_type:type,content_id:id,provider,
      destination_path:destinationPath,return_path:safeReturnPath(returnPath),status:'pending',expires_at:expiresAt,
    },
  });
  if (!response.ok) throw new Error('Unable to create unlock session.');
  return {rawToken,expiresAt};
}

export async function handleShortener(request) {
  const path=new URL(request.url).pathname;
  if (!(path.startsWith('/api/shortener/') || path.startsWith('/unlock/'))) return null;
  if (request.method==='OPTIONS') return new Response(null,{status:204});

  try {
    if (path.startsWith('/unlock/')) {
      if (request.method!=='GET') return jsonResponse(request,405,{error:'Method not allowed'},{Allow:'GET'});
      const parts=path.split('/').filter(Boolean);
      if (parts.length!==3) return jsonResponse(request,404,{error:'Unlock route not found.'});
      const type=parts[1], id=validPositiveId(parts[2]);
      if (!ALLOWED_CONTENT_TYPES.has(type)||!id) return Response.redirect(new URL('/?unlock_error=invalid_target',request.url),303);

      const cookies=parseCookies(request);
      const rawToken=String(cookies.hj_unlock_intent||cookies.hj_unlock_code||'');
      if (!rawToken) return Response.redirect(new URL('/?unlock_error=missing_session',request.url),303);

      const secret=envString('UNLOCK_TOKEN_SECRET');
      if (!secret) return Response.redirect(new URL('/?unlock_error=not_configured',request.url),303);
      const hash=await hmacHex(secret,rawToken);
      const rows=await supabaseJson('/rest/v1/ad_unlock_intents',{
        params:{select:'id,user_id,content_type,content_id,status,expires_at,return_path',token_hash:'eq.'+hash,limit:1},
      });
      const intent=Array.isArray(rows)?rows[0]:null;
      if (!intent) return Response.redirect(new URL('/?unlock_error=invalid_session',request.url),303);
      if (intent.content_type!==type || Number(intent.content_id)!==id) return Response.redirect(new URL('/?unlock_error=target_mismatch',request.url),303);
      if (intent.status!=='pending') return Response.redirect(new URL('/?unlock_error=already_used',request.url),303);
      if (String(intent.user_id)!==String((await authenticateUser(request))?.id||'')) return Response.redirect(new URL('/?unlock_error=user_mismatch',request.url),303);
      if (Date.parse(intent.expires_at||'')<=Date.now()) {
        await supabaseRequest('/rest/v1/ad_unlock_intents',{method:'PATCH',body:{status:'expired'},params:{id:'eq.'+intent.id}});
        return Response.redirect(new URL('/?unlock_error=expired',request.url),303);
      }
      const target=new URL(safeReturnPath(intent.return_path),new URL(request.url).origin);
      const headers=new Headers();
      headers.set('Location',target.pathname+target.search+target.hash);
      headers.append('Set-Cookie',cookieHeader('hj_unlock_intent','',0,true));
      headers.append('Set-Cookie',cookieHeader('hj_unlock_code',rawToken,UNLOCK_CODE_TTL_MINUTES*60,true));
      headers.set('Cache-Control','no-store');
      return new Response(null,{status:303,headers});
    }

    const user=await authenticateUser(request);
    if (!user?.id) return jsonResponse(request,401,{error:'Unauthorized'});

    if (path==='/api/shortener/preview' && request.method==='POST') {
      const body=await readJsonBody(request);
      const type=String(body?.contentType||'').toLowerCase();
      const id=validPositiveId(body?.contentId);
      if (!['audio','video'].includes(type)||!id) return jsonResponse(request,400,{error:'Invalid unlock target.'});
      const row=await content(type,id);
      if (!isAdsEnabled(row)) return jsonResponse(request,400,{error:'This content does not have an ad unlock access path.'});
      const s=await settings();
      if (!s.shortenerEnabled) return jsonResponse(request,503,{error:'Shortener unlock is currently disabled.'});
      const order=providerOrder(s);
      if (!order.length) return jsonResponse(request,503,{error:'No shortener provider is configured.'});
      const {storyId,episodeNumber}=episodeContext(type,row);
      const plan=resolveAdUnlockPlan(episodeNumber,s.episodeUnlockRules);
      const episodeNumbers=await existingNumbers(type,storyId,plan.startEpisode,plan.endEpisode);
      const access=await existingAccess(user,type,id,row,user.id);
      return jsonResponse(request,200,{ok:true,contentType:type,contentId:id,storyId,episodeNumber,unlockCount:plan.unlockCount,unlockStartEpisode:plan.startEpisode,unlockEndEpisode:plan.endEpisode,episodeNumbers,durationMinutes:s.unlockDurationMinutes,alreadyGranted:Boolean(access),source:access?.source||null,expiresAt:access?.expiresAt||null});
    }

    if (path==='/api/shortener/start' && request.method==='POST') {
      const body=await readJsonBody(request);
      const type=String(body?.contentType||'').toLowerCase();
      const id=validPositiveId(body?.contentId);
      if (!ALLOWED_CONTENT_TYPES.has(type)||!id) return jsonResponse(request,400,{error:'Invalid unlock target.'});
      const row=await content(type,id);
      const access=await existingAccess(user,type,id,row,user.id);
      if (access) return jsonResponse(request,200,{ok:true,alreadyGranted:true,source:access.source,expiresAt:access.expiresAt});
      const s=await settings();
      if (!s.shortenerEnabled) return jsonResponse(request,503,{error:'Shortener unlock is currently disabled.'});
      const order=providerOrder(s);
      if (!order.length) return jsonResponse(request,503,{error:'No shortener provider is configured.'});

      const link=await permanentLink(type,id,request.url);
      const returnPath=safeReturnPath(body?.returnPath || '/');
      const intent=await createIntent(user,type,id,link.link.provider,link.link.destination_path,returnPath);
      const headers= new Headers({'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'});
      headers.append('Set-Cookie',cookieHeader('hj_unlock_intent',intent.rawToken,UNLOCK_INTENT_TTL_MINUTES*60,true));
      const {storyId,episodeNumber}=episodeContext(type,row);
      let episodeNumbers=[];
      let unlockStartEpisode=episodeNumber;
      let unlockEndEpisode=episodeNumber;
      let unlockCount=1;
      if (['audio','video'].includes(type)) {
        const plan=resolveAdUnlockPlan(episodeNumber,s.episodeUnlockRules);
        unlockStartEpisode=plan.startEpisode; unlockEndEpisode=plan.endEpisode; unlockCount=plan.unlockCount;
        episodeNumbers=await existingNumbers(type,storyId,plan.startEpisode,plan.endEpisode);
      }
      headers.set('Access-Control-Allow-Origin',request.headers.get('origin')||'');
      const payload={ok:true,contentType:type,contentId:id,storyId,episodeNumber,unlockCount,unlockStartEpisode,unlockEndEpisode,episodeNumbers,durationMinutes:s.unlockDurationMinutes,shortUrl:link.link.short_url,provider:link.link.provider,expiresAt:intent.expiresAt};
      const cors=Object.fromEntries((await import('./runtime.js')).headersForCors(request).entries());
      for(const [k,v] of Object.entries(cors)) headers.set(k,v);
      return new Response(JSON.stringify(payload),{status:200,headers});
    }

    if (path==='/api/shortener/access' && request.method==='POST') {
      const body=await readJsonBody(request);
      const type=String(body?.contentType||'').toLowerCase();
      const id=validPositiveId(body?.contentId);
      if (!ALLOWED_CONTENT_TYPES.has(type)||!id) return jsonResponse(request,400,{error:'Invalid content target.'});
      const row=await content(type,id);
      const access=await existingAccess(user,type,id,row,user.id);
      return access
        ? jsonResponse(request,200,{ok:true,...access})
        : jsonResponse(request,403,{error:'Temporary or paid access required.'});
    }

    if (path==='/api/shortener/complete' && request.method==='POST') {
      const cookies=parseCookies(request);
      const rawCode=String(cookies.hj_unlock_code||'').trim();
      if (!rawCode) return jsonResponse(request,400,{error:'Unlock session is missing.'});
      const secret=envString('UNLOCK_TOKEN_SECRET');
      if (!secret) return jsonResponse(request,503,{error:'Temporary unlock is not configured.'});
      const hash=await hmacHex(secret,rawCode);
      const rows=await supabaseJson('/rest/v1/ad_unlock_intents',{params:{select:'*',token_hash:'eq.'+hash,limit:1}});
      const intent=Array.isArray(rows)?rows[0]:null;
      if(!intent||intent.user_id!==user.id||intent.status!=='pending') return jsonResponse(request,403,{error:'Invalid unlock session.'});
      if(Date.parse(intent.expires_at||'')<=Date.now()) return jsonResponse(request,410,{error:'Unlock session expired.'});
      const type=String(intent.content_type||'');
      const id=Number(intent.content_id);
      const row=await content(type,id);
      const s=await settings();
      const existing=await activeShortenerUnlock(user.id,type,id,row);
      const newExpiry=new Date(Date.now()+s.unlockDurationMinutes*60_000).toISOString();
      const finalExpiry=existing?.expires_at && Date.parse(existing.expires_at)>Date.now() ? existing.expires_at : newExpiry;

      let episodeNumbers=[],storyId=null,episodeNumber=null,start=null,end=null,count=1;
      if(['audio','video'].includes(type)) {
        ({storyId,episodeNumber}=episodeContext(type,row));
        const plan=resolveAdUnlockPlan(episodeNumber,s.episodeUnlockRules);
        start=plan.startEpisode; end=plan.endEpisode; count=plan.unlockCount;
        episodeNumbers=await existingNumbers(type,storyId,start,end);
      }

      if(!existing){
        const insert=await supabaseRequest('/rest/v1/shortener_unlocks',{
          method:'POST',
          body:{user_id:user.id,content_type:type,content_id:id,provider:intent.provider||'arolinks',expires_at:finalExpiry,story_id:storyId,start_episode_number:start,end_episode_number:end,updated_at:new Date().toISOString()},
        });
        if(!insert.ok) return jsonResponse(request,500,{error:'Unable to save temporary access.'});
      }
      await supabaseRequest('/rest/v1/ad_unlock_intents',{method:'PATCH',body:{status:'completed',completed_at:new Date().toISOString()},params:{id:'eq.'+intent.id,status:'eq.pending'}});
      const headers=new Headers();
      const cors=Object.fromEntries((await import('./runtime.js')).headersForCors(request).entries()); for(const [k,v] of Object.entries(cors)) headers.set(k,v);
      headers.set('Content-Type','application/json; charset=utf-8'); headers.set('Cache-Control','no-store');
      headers.append('Set-Cookie',cookieHeader('hj_unlock_code','',0,true));
      return new Response(JSON.stringify({ok:true,contentType:type,contentId:id,provider:intent.provider||null,expiresAt:finalExpiry,storyId,episodeNumber,unlockCount:count,unlockStartEpisode:start??episodeNumber,unlockEndEpisode:end??episodeNumber,episodeNumbers,reusedExisting:Boolean(existing)}),{status:200,headers});
    }

    if (path==='/api/shortener/entitlements' && request.method==='GET') {
      const rows=await supabaseJson('/rest/v1/shortener_unlocks',{params:{select:'id,content_type,content_id,expires_at,story_id,start_episode_number,end_episode_number',user_id:'eq.'+user.id,expires_at:'gt.'+new Date().toISOString(),order:'expires_at.desc'}});
      return jsonResponse(request,200,{unlocks:Array.isArray(rows)?rows:[]});
    }

    if (path==='/api/shortener/status') {
      if (request.method!=='GET') return jsonResponse(request,405,{error:'Method not allowed'},{Allow:'GET'});
      const admin=await adminAuth(request);
      if(!admin) return jsonResponse(request,403,{error:'Forbidden'});
      const s=await settings();
      return jsonResponse(request,200,{
        ok:true,
        enabled:s.shortenerEnabled,
        primary:s.primary,
        fallback:s.fallback,
        chain:providerOrder(s),
        configured:{
          arolinks:Boolean(envString('AROLINKS_API_TOKEN')),
          earn4link:Boolean(envString('EARN4LINK_API_TOKEN')),
          unlockSecret:Boolean(envString('UNLOCK_TOKEN_SECRET')),
          supabaseServiceRole:Boolean(envString('SUPABASE_SERVICE_ROLE_KEY')),
          publicBaseUrl:Boolean(new URL(request.url).hostname),
        },
        unlockDurationMinutes:s.unlockDurationMinutes,
      });
    }

    return jsonResponse(request,404,{error:'Not found'});
  } catch(error) {
    return jsonResponse(request,Number(error?.status)||500,{error:String(error?.message||'Shortener service error.').slice(0,300)});
  }
}
