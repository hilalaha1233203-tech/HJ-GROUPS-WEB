import { sendPushNotification, WebPushError } from '@mmmike/web-push/send';
import {
  authenticateUser,
  envString,
  isAdminUser,
  jsonResponse,
  readJsonBody,
  supabaseJson,
  supabaseRequest,
} from './runtime.js';

const MAX_TARGETS=5000;
const buckets=new Map();

function rateLimit(key,limit=40){
  const now=Date.now(); const item=buckets.get(key);
  if(!item||now-item.startedAt>=60_000){buckets.set(key,{startedAt:now,count:1});return true;}
  item.count+=1; return item.count<=limit;
}

function cleanText(value,max,fallback=''){
  const text=String(value??'').replace(/[\u0000-\u001F\u007F]/g,'').trim();
  return text&&text.length<=max?text:fallback;
}

function subscriptionFromBody(body){
  const s=body?.subscription;
  if(!s||typeof s!=='object') return null;
  const endpoint=cleanText(s.endpoint,4096);
  const p256dh=cleanText(s?.keys?.p256dh,512);
  const auth=cleanText(s?.keys?.auth,512);
  if(!endpoint||!/^https:\/\//i.test(endpoint)||!p256dh||!auth) return null;
  return {endpoint,keys:{p256dh,auth}};
}

export async function handleWebPush(request){
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/api/push/')) return null;
  if(path==='/api/push/config'){
    if(request.method!=='GET') return jsonResponse(request,405,{error:'Method not allowed'},{Allow:'GET'});
    return jsonResponse(request,200,{supported:true,configured:Boolean(envString('WEB_PUSH_VAPID_PUBLIC_KEY')),publicKey:envString('WEB_PUSH_VAPID_PUBLIC_KEY')});
  }
  const user=await authenticateUser(request);
  if(!user?.id) return jsonResponse(request,401,{error:'Unauthorized'});
  if(!rateLimit('push:'+user.id)) return jsonResponse(request,429,{error:'Too many notification requests'});

  if(path==='/api/push/status'&&request.method==='GET'){
    const subscriptions=await supabaseJson('/rest/v1/web_push_subscriptions',{
      params:{select:'id,active,last_seen_at',user_id:'eq.'+user.id,active:'eq.true'},
    });
    const preferences=await supabaseJson('/rest/v1/web_push_preferences',{
      params:{select:'new_episodes,new_stories,promotions,announcements',user_id:'eq.'+user.id,limit:1},
    });
    return jsonResponse(request,200,{
      configured:Boolean(envString('WEB_PUSH_VAPID_PUBLIC_KEY')),
      subscribed:Array.isArray(subscriptions)&&subscriptions.length>0,
      preferences:Array.isArray(preferences)&&preferences[0]?preferences[0]:{new_episodes:true,new_stories:true,promotions:true,announcements:true},
    });
  }

  if(path==='/api/push/subscribe'&&request.method==='POST'){
    if(!envString('WEB_PUSH_VAPID_PUBLIC_KEY')) return jsonResponse(request,503,{error:'Web Push is not configured yet.'});
    const body=await readJsonBody(request);
    const subscription=subscriptionFromBody(body);
    if(!subscription) return jsonResponse(request,400,{error:'Invalid push subscription'});
    const response=await supabaseRequest('/rest/v1/web_push_subscriptions',{
      method:'POST',
      body:{
        user_id:user.id,
        endpoint:subscription.endpoint,
        subscription,
        user_agent:cleanText(request.headers.get('user-agent'),800),
        active:true,last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString(),
      },
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
    });
    if(!response.ok) return jsonResponse(request,500,{error:'Could not save notification subscription'});
    const preferences=body?.preferences&&typeof body.preferences==='object'?body.preferences:{};
    await supabaseRequest('/rest/v1/web_push_preferences',{
      method:'POST',
      body:{
        user_id:user.id,
        new_episodes:preferences.new_episodes!==false,
        new_stories:preferences.new_stories!==false,
        promotions:preferences.promotions!==false,
        announcements:preferences.announcements!==false,
        updated_at:new Date().toISOString(),
      },
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
    });
    return jsonResponse(request,200,{ok:true});
  }

  if(path==='/api/push/preferences'&&request.method==='POST'){
    const body=await readJsonBody(request); const values={};
    for(const key of ['new_episodes','new_stories','promotions','announcements']) if(typeof body?.[key]==='boolean') values[key]=body[key];
    if(!Object.keys(values).length) return jsonResponse(request,400,{error:'No valid preferences supplied'});
    values.user_id=user.id; values.updated_at=new Date().toISOString();
    const response=await supabaseRequest('/rest/v1/web_push_preferences',{
      method:'POST',body:values,headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
    });
    if(!response.ok) return jsonResponse(request,500,{error:'Could not save notification preferences'});
    return jsonResponse(request,200,{ok:true,preferences:values});
  }

  return jsonResponse(request,404,{error:'Not found'});
}

export async function handleWebPushUnsubscribe(request){
  if(new URL(request.url).pathname!=='/api/push/subscribe/remove') return null;
  if(request.method!=='POST') return jsonResponse(request,405,{error:'Method not allowed'},{Allow:'POST'});
  const user=await authenticateUser(request);
  if(!user?.id) return jsonResponse(request,401,{error:'Unauthorized'});
  const body=await readJsonBody(request);
  const endpoint=cleanText(body?.endpoint,4096);
  if(!endpoint) return jsonResponse(request,400,{error:'endpoint is required'});
  await supabaseRequest('/rest/v1/web_push_subscriptions',{
    method:'PATCH',
    body:{active:false,updated_at:new Date().toISOString()},
    params:{user_id:'eq.'+user.id,endpoint:'eq.'+endpoint},
  });
  return jsonResponse(request,200,{ok:true});
}

async function subscriptionsForTarget(targetType, storyId) {
  if (targetType === 'story_library') {
    const rows = await supabaseJson('/rest/v1/user_story_library', { params: { select:'user_id', story_id:'eq.'+storyId, limit:MAX_TARGETS } });
    return [...new Set((rows||[]).map((row)=>row.user_id))];
  }
  if (targetType === 'story_followers') {
    const rows = await supabaseJson('/rest/v1/user_activity', { params: { select:'user_id', story_id:'eq.'+storyId, event_type:'in.(story_view,episode_play)', user_id:'not.is.null', limit:MAX_TARGETS } });
    return [...new Set((rows||[]).map((row)=>row.user_id))];
  }
  if (targetType === 'inactive_30d') {
    const subscriptions = await supabaseJson('/rest/v1/web_push_subscriptions',{params:{select:'user_id',active:'eq.true',limit:MAX_TARGETS}});
    const subscribed=[...new Set((subscriptions||[]).map((row)=>String(row.user_id)))];
    const cutoff=new Date(Date.now()-30*86400000).toISOString();
    const recent=await supabaseJson('/rest/v1/user_activity',{params:{select:'user_id',created_at:'gte.'+cutoff,user_id:'not.is.null',limit:10000}});
    const active=new Set((recent||[]).map((row)=>String(row.user_id)));
    return subscribed.filter((id)=>!active.has(id));
  }
  const rows=await supabaseJson('/rest/v1/web_push_subscriptions',{params:{select:'user_id',active:'eq.true',limit:MAX_TARGETS}});
  return [...new Set((rows||[]).map((row)=>row.user_id))];
}

async function sendAdminNotification(user, body) {
  const kind=['promotion','announcement','new_story','new_episode'].includes(body?.kind)?body.kind:'';
  const category=kind==='new_episode'?'new_episodes':kind==='new_story'?'new_stories':kind==='announcement'?'announcements':'promotions';
  const title=cleanText(body?.title,120);
  const message=cleanText(body?.message,500);
  const targetType=['all','story_library','story_followers','inactive_30d'].includes(body?.targetType)?body.targetType:'all';
  const storyId=Number.isInteger(Number(body?.storyId))?Number(body.storyId):null;
  const targetUrl=String(body?.targetUrl||'/').startsWith('/')&&!String(body?.targetUrl||'/').startsWith('//')?String(body.targetUrl).slice(0,500):'/';
  if(!kind||!title||!message) throw Object.assign(new Error('kind, title and message are required'),{status:400});
  if(targetType!=='all'&&targetType!=='inactive_30d'&&!storyId) throw Object.assign(new Error('storyId is required for this target'),{status:400});

  const userIds=await subscriptionsForTarget(targetType,storyId);
  const uniqueIds=[...new Set(userIds.map(String))].slice(0,MAX_TARGETS);
  if(!uniqueIds.length) return {sent:0,failed:0,targetedUsers:0};

  const [subs,prefs]=await Promise.all([
    supabaseJson('/rest/v1/web_push_subscriptions',{params:{select:'id,user_id,subscription',user_id:'in.('+uniqueIds.join(',')+')',active:'eq.true',limit:MAX_TARGETS}}),
    supabaseJson('/rest/v1/web_push_preferences',{params:{select:'user_id,new_episodes,new_stories,promotions,announcements',user_id:'in.('+uniqueIds.join(',')+')',limit:MAX_TARGETS}}),
  ]);
  const prefMap=new Map((prefs||[]).map((row)=>[String(row.user_id),row]));
  const rows=(subs||[]).filter((row)=>prefMap.get(String(row.user_id))?.[category]!==false);

  const vapid={
    publicKey:envString('WEB_PUSH_VAPID_PUBLIC_KEY'),
    privateKey:envString('WEB_PUSH_VAPID_PRIVATE_KEY'),
    subject:envString('WEB_PUSH_VAPID_SUBJECT','mailto:admin@hj-groups.com'),
  };
  if(!vapid.publicKey||!vapid.privateKey) throw Object.assign(new Error('Web Push VAPID keys are not configured'),{status:503});

  let sent=0,failed=0;
  const gone=[];
  for(const row of rows){
    try{
      const delivered=await sendPushNotification(row.subscription,{title,body:message,url:targetUrl,tag:'hj-'+kind},vapid,{ttl:3600,urgency:kind==='new_episode'?'high':'normal'});
      if(delivered) sent+=1; else {failed+=1;gone.push(row.id);}
    }catch(error){
      failed+=1;
      if(error instanceof WebPushError && (error.statusCode===404||error.statusCode===410)) gone.push(row.id);
    }
  }
  if(gone.length){
    await supabaseRequest('/rest/v1/web_push_subscriptions',{
      method:'PATCH',body:{active:false,updated_at:new Date().toISOString()},
      params:{id:'in.('+gone.join(',')+')'},
    });
  }
  await supabaseRequest('/rest/v1/web_push_notifications',{
    method:'POST',
    body:{kind,title,message,target_url:targetUrl,target_type:targetType,target_story_id:storyId,requested_by:user.id,sent_count:sent,failed_count:failed},
  });
  return {sent,failed,targetedUsers:uniqueIds.length};
}

export async function handleAdminNotificationSend(request){
  if(new URL(request.url).pathname!=='/api/admin/notifications/send') return null;
  const user=await authenticateUser(request);
  if(!user?.id) return jsonResponse(request,401,{error:'Unauthorized'});
  if(!isAdminUser(user)) return jsonResponse(request,403,{error:'Forbidden'});
  if(!rateLimit('push-admin:'+user.id,20)) return jsonResponse(request,429,{error:'Too many notification sends'});
  try{
    const body=await readJsonBody(request,60_000);
    const result=await sendAdminNotification(user,body);
    return jsonResponse(request,200,{ok:true,...result});
  }catch(error){
    return jsonResponse(request,Number(error?.status)||500,{error:String(error?.message||'Notification send failed').slice(0,300)});
  }
}
