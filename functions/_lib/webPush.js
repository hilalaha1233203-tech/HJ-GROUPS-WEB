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

export async function handleAdminNotificationSend(request){
  if(new URL(request.url).pathname!=='/api/admin/notifications/send') return null;
  const user=await authenticateUser(request);
  if(!user?.id) return jsonResponse(request,401,{error:'Unauthorized'});
  if(!isAdminUser(user)) return jsonResponse(request,403,{error:'Forbidden'});
  return jsonResponse(request,503,{
    error:'Serverless notification sending is not migrated yet.',
    code:'WEB_PUSH_SEND_NOT_MIGRATED',
    hint:'Subscription/config/status management is available; delivery requires a Web Crypto Web Push sender or scheduled Worker migration.',
  });
}
