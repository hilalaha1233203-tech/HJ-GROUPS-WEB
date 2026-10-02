import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { resolveAdUnlockPlan, validateAdUnlockRules } from '../src/lib/adUnlockRules.js'

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://yajkfglagnyvenddyvok.supabase.co').trim().replace(/\/+$/, '')
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const UNLOCK_TOKEN_SECRET = String(process.env.UNLOCK_TOKEN_SECRET || '').trim()
const ADMIN_EMAIL = 'hilalaha1233203@gmail.com'
const INTENT_TTL_MS = 10 * 60_000

let client = null
function db() {
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.')
  if (!client) client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false } })
  return client
}
function json(res,status,payload) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'})
  res.end(JSON.stringify(payload))
}
function bearer(req) {
  const value=String(req.headers.authorization||'')
  return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i,'').trim() : ''
}
async function auth(req) {
  const token=bearer(req)
  if (!token) throw new Error('Authentication required.')
  const {data,error}=await db().auth.getUser(token)
  if(error||!data?.user) throw new Error('Authentication failed.')
  return data.user
}
function tokenHash(value) {
  return crypto.createHmac('sha256',UNLOCK_TOKEN_SECRET).update(String(value)).digest('hex')
}
function randomToken() { return crypto.randomBytes(32).toString('hex') }
function parseId(value) {
  const id=Number(value)
  return Number.isInteger(id)&&id>0?id:null
}
async function settings() {
  const {data,error}=await db().from('app_settings').select('value').eq('id','hj_admin_settings').maybeSingle()
  if(error) throw new Error('Unable to load Ads settings.')
  const ads=data?.value?.ads||{}
  const rules=validateAdUnlockRules(ads.episodeUnlockRules)
  if(!rules.valid) throw new Error('Ads episode unlock rules are invalid: '+rules.errors.join(' '))
  return {
    enabled: ads.enabled===true,
    provider:String(ads.provider||'').trim().toLowerCase(),
    rewardedAdUnitId:String(ads.rewardedAdUnitId||'').trim(),
    durationMinutes:Math.min(1440,Math.max(1,Number(ads.unlockDurationMinutes)||360)),
    rules:rules.normalizedRules,
  }
}
async function content(type,id) {
  let q
  if(type==='audio') q=db().from('episodes').select('id,number,episode_number,story_id,access_type,available,type').eq('id',id).maybeSingle()
  else if(type==='video') q=db().from('video_episodes').select('id,number,video_story_id,access_type,available,type').eq('id',id).maybeSingle()
  else q=db().from('books').select('id,access_type').eq('id',id).maybeSingle()
  const {data,error}=await q
  if(error||!data) throw new Error('Requested content was not found.')
  if(data.available===false) throw new Error('This content is currently unavailable.')
  const access=String(data.access_type||'')
  if(!(access==='ads'||access.includes('"ads"')||access.includes('ads'))) throw new Error('This content does not have an Ads unlock path.')
  return data
}
async function episodeContext(type,row) {
  if(type==='audio') return {storyId:parseId(row.story_id),episodeNumber:parseId(row.number??row.episode_number)}
  if(type==='video') return {storyId:parseId(row.video_story_id),episodeNumber:parseId(row.number)}
  return {storyId:null,episodeNumber:null}
}
async function existingNumbers(type,storyId,start,end) {
  if(!storyId||!Number.isInteger(start)||!Number.isInteger(end)) return []
  let rows=[]
  if(type==='audio') {
    const [a,b]=await Promise.all([
      db().from('episodes').select('number,available').eq('story_id',storyId).gte('number',start).lte('number',end),
      db().from('episodes').select('episode_number,available').eq('story_id',storyId).gte('episode_number',start).lte('episode_number',end),
    ])
    if(a.error||b.error) throw new Error('Unable to determine existing episodes.')
    rows=[...(a.data||[]),...(b.data||[])]
  } else {
    const q=await db().from('video_episodes').select('number,available').eq('video_story_id',storyId).gte('number',start).lte('number',end)
    if(q.error) throw new Error('Unable to determine existing episodes.')
    rows=q.data||[]
  }
  return [...new Set(rows.filter(x=>x?.available!==false).map(x=>Number(x.number??x.episode_number)).filter(n=>Number.isInteger(n)&&n>=start&&n<=end))].sort((a,b)=>a-b)
}
async function start(req,res,body) {
  const user=await auth(req)
  const type=String(body?.contentType||'').toLowerCase()
  const id=parseId(body?.contentId)
  if(!['audio','video'].includes(type)||!id) return json(res,400,{error:'Invalid unlock target.'})
  const s=await settings()
  if(!s.enabled) return json(res,503,{error:'Ads unlock is currently disabled.'})
  if(s.provider!=='google' || !s.rewardedAdUnitId) return json(res,503,{error:'Rewarded Ads provider is not configured for web.'})
  const row=await content(type,id)
  const {storyId,episodeNumber}=await episodeContext(type,row)
  const plan=resolveAdUnlockPlan(episodeNumber,s.rules)
  const episodeNumbers=await existingNumbers(type,storyId,plan.startEpisode,plan.endEpisode)
  if(!episodeNumbers.includes(episodeNumber)) return json(res,409,{error:'The selected episode does not exist or is unavailable.'})
  const raw=randomToken(), expiresAt=new Date(Date.now()+INTENT_TTL_MS).toISOString()
  const {error}=await db().from('rewarded_ad_unlock_intents').insert({
    token_hash:tokenHash(raw),user_id:user.id,content_type:type,content_id:id,
    story_id:storyId,start_episode_number:plan.startEpisode,end_episode_number:plan.endEpisode,
    status:'pending',expires_at:expiresAt,
  })
  if(error) return json(res,500,{error:'Unable to create Ads unlock session.'})
  return json(res,200,{ok:true,token:raw,provider:s.provider,rewardedAdUnitId:s.rewardedAdUnitId,
    storyId,episodeNumber,unlockCount:plan.unlockCount,unlockStartEpisode:plan.startEpisode,
    unlockEndEpisode:plan.endEpisode,episodeNumbers,durationMinutes:s.durationMinutes})
}
async function complete(req,res,body) {
  const user=await auth(req)
  const raw=String(body?.token||'').trim()
  if(!raw||!UNLOCK_TOKEN_SECRET) return json(res,400,{error:'Invalid Ads completion session.'})
  const hash=tokenHash(raw)
  const {data:intent,error}=await db().from('rewarded_ad_unlock_intents')
    .select('*').eq('token_hash',hash).maybeSingle()
  if(error||!intent) return json(res,403,{error:'Invalid Ads completion session.'})
  if(intent.user_id!==user.id||intent.status!=='pending') return json(res,409,{error:'Ads completion session is no longer valid.'})
  if(new Date(intent.expires_at).getTime()<=Date.now()){
    await db().from('rewarded_ad_unlock_intents').update({status:'expired'}).eq('id',intent.id)
    return json(res,410,{error:'Ads completion session expired.'})
  }
  const s=await settings()
  const row=await content(intent.content_type,intent.content_id)
  const {storyId,episodeNumber}=await episodeContext(intent.content_type,row)
  const plan=resolveAdUnlockPlan(episodeNumber,s.rules)
  const episodeNumbers=await existingNumbers(intent.content_type,storyId,plan.startEpisode,plan.endEpisode)
  const now=new Date().toISOString()
  const expiresAt=new Date(Date.now()+s.durationMinutes*60_000).toISOString()
  const {data:covered}=await db().from('ad_unlocks').select('id,expires_at,story_id,start_episode_number,end_episode_number')
    .eq('user_id',user.id).eq('provider','rewarded_ad').eq('content_type',intent.content_type)
    .eq('story_id',storyId).lte('start_episode_number',plan.startEpisode).gte('end_episode_number',plan.endEpisode)
    .gt('expires_at',now).limit(1).maybeSingle()
  if(!covered?.id){
    const {error:insertError}=await db().from('ad_unlocks').insert({
      user_id:user.id,content_type:intent.content_type,content_id:intent.content_id,
      provider:'rewarded_ad',expires_at:expiresAt,story_id:storyId,
      start_episode_number:plan.startEpisode,end_episode_number:plan.endEpisode,updated_at:now,
    })
    if(insertError) return json(res,500,{error:'Unable to save Ads temporary access.'})
  }
  await db().from('rewarded_ad_unlock_intents').update({status:'completed',completed_at:now}).eq('id',intent.id).eq('status','pending')
  return json(res,200,{ok:true,contentType:intent.content_type,contentId:intent.content_id,storyId,episodeNumber,
    expiresAt:covered?.expires_at||expiresAt,unlockCount:plan.unlockCount,unlockStartEpisode:plan.startEpisode,
    unlockEndEpisode:plan.endEpisode,episodeNumbers,reusedExisting:Boolean(covered?.id)})
}
export async function handleRewardedAdRequest(req,res,url,readJson) {
  if(!url.pathname.startsWith('/api/ads/')) return false
  if(req.method==='OPTIONS'){res.writeHead(204,{'Cache-Control':'no-store'});res.end();return true}
  try {
    if(url.pathname==='/api/ads/start'&&req.method==='POST') return start(req,res,await readJson(req))
    if(url.pathname==='/api/ads/complete'&&req.method==='POST') return complete(req,res,await readJson(req))
    return json(res,404,{error:'Not found'})
  } catch(error) {
    console.warn('[rewarded-ads]',String(error?.message||error))
    return json(res,500,{error:String(error?.message||'Rewarded Ads service unavailable.').slice(0,300)})
  }
}
