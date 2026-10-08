import {
  authenticateUser,
  envString,
  hmacBytes,
  isAdminUser,
  jsonResponse,
  readJsonBody,
  supabaseJson,
  supabaseRequest,
  validPositiveId,
} from './runtime.js';

function runtimeEnabled() {
  return envString('HJ_PAYMENTS_ENABLED').toLowerCase() === 'true';
}

function cashfreeEnvironment() {
  const value=envString('CASHFREE_ENVIRONMENT','sandbox').toLowerCase();
  return ['sandbox','production'].includes(value) ? value : '';
}

function cashfreeBase() {
  return cashfreeEnvironment()==='production' ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com';
}

function requireConfigured(request) {
  if (!runtimeEnabled()) throw Object.assign(new Error('Payments are currently disabled.'),{status:503});
  if (!envString('CASHFREE_CLIENT_ID') || !envString('CASHFREE_CLIENT_SECRET')) throw Object.assign(new Error('Cashfree server credentials are not configured.'),{status:503});
  if (!cashfreeEnvironment()) throw Object.assign(new Error('CASHFREE_ENVIRONMENT must be sandbox or production.'),{status:503});
  return request;
}

async function cashfree(path, options={}) {
  const response=await fetch(cashfreeBase()+path,{
    ...options,
    headers:{
      Accept:'application/json',
      'Content-Type':'application/json',
      'x-client-id':envString('CASHFREE_CLIENT_ID'),
      'x-client-secret':envString('CASHFREE_CLIENT_SECRET'),
      'x-api-version':'2025-01-01',
      ...(options.headers||{}),
    },
  });
  const text=await response.text();
  let data=null; try{data=text?JSON.parse(text):null}catch{}
  if(!response.ok) throw Object.assign(new Error('Cashfree API request failed ('+response.status+')'),{status:502,providerStatus:response.status});
  return data;
}

function moneyEquals(a,b){return Math.abs(Number(a)-Number(b))<0.005;}

async function settings() {
  const rows=await supabaseJson('/rest/v1/app_settings',{params:{select:'value',id:'eq.hj_admin_settings',limit:1}});
  return Array.isArray(rows)?rows[0]?.value||{}:{};
}

function priceFromSettings(value) {
  const payments=value?.payments;
  if(!payments?.enabled) throw new Error('Payments are not enabled in Admin Settings.');
  const amount=Number(payments.storyLifetime);
  if(!Number.isFinite(amount)||amount<=0) throw new Error('Story Lifetime price is not configured.');
  const currency=String(payments.currency||'INR').toUpperCase();
  if(currency!=='INR') throw new Error('Only INR payments are currently supported.');
  return {amount:Number(amount.toFixed(2)),currency};
}

async function createOrder(request) {
  const user=await authenticateUser(request);
  if(!user?.id) return jsonResponse(request,401,{error:'Unauthorized'});
  requireConfigured(request);

  const body=await readJsonBody(request);
  const productKey=String(body?.productKey||'').trim();
  const contentType=String(body?.contentType||'').trim().toLowerCase();
  const contentId=validPositiveId(body?.contentId);
  const requestId=String(body?.requestId||'').trim();
  if(productKey!=='story_lifetime'||contentType!=='story'||!contentId) return jsonResponse(request,400,{error:'Invalid payment target.'});
  if(!/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) return jsonResponse(request,400,{error:'Invalid payment request ID.'});

  const config=await settings();
  const price=priceFromSettings(config);
  const stories=await supabaseJson('/rest/v1/stories',{params:{select:'id,title',id:'eq.'+contentId,limit:1}});
  const story=Array.isArray(stories)?stories[0]:null;
  if(!story) return jsonResponse(request,404,{error:'Story not found.'});

  const existingRows=await supabaseJson('/rest/v1/payment_orders',{params:{select:'cashfree_order_id,status,amount,currency',user_id:'eq.'+user.id,idempotency_key:'eq.'+requestId,limit:1}});
  const existing=Array.isArray(existingRows)?existingRows[0]:null;
  if(existing){
    if(!moneyEquals(existing.amount,price.amount)||existing.currency!==price.currency) return jsonResponse(request,409,{error:'This payment request no longer matches the configured price.'});
    if(existing.status==='PAID') return jsonResponse(request,200,{alreadyPaid:true,orderId:existing.cashfree_order_id});
    const existingOrder=await cashfree('/pg/orders/'+encodeURIComponent(existing.cashfree_order_id));
    return jsonResponse(request,200,{orderId:existing.cashfree_order_id,paymentSessionId:existingOrder?.payment_session_id||null});
  }

  const orderId='hj_'+requestId.slice(0,48);
  const base=new URL(envString('HJ_PUBLIC_BASE_URL')||request.url);
  const returnUrl=new URL('/',base);
  returnUrl.searchParams.set('cashfree_order_id',orderId);
  const notifyUrl=new URL('/api/payments/webhook',base).toString();
  const phone=String(user.phone||user.user_metadata?.phone||'').replace(/\D/g,'');
  if(phone.length<10) return jsonResponse(request,400,{error:'Please bind a valid mobile number to your HJ GROUPS account before payment.'});

  const order=await cashfree('/pg/orders',{
    method:'POST',
    body:JSON.stringify({
      order_amount:price.amount,order_currency:price.currency,order_id:orderId,
      customer_details:{customer_id:user.id,customer_email:String(user.email||''),customer_phone:phone.slice(-10)},
      order_meta:{return_url:returnUrl.toString(),notify_url:notifyUrl},
      order_note:'HJ GROUPS Story Lifetime',
      order_tags:{product_key:productKey,story_id:String(contentId)},
    }),
  });
  const paymentSessionId=String(order?.payment_session_id||'').trim();
  if(!paymentSessionId) throw new Error('Cashfree did not return a payment session.');

  const inserted=await supabaseRequest('/rest/v1/payment_orders',{
    method:'POST',
    body:{
      user_id:user.id,cashfree_order_id:orderId,idempotency_key:requestId,
      product_key:productKey,content_type:contentType,content_id:contentId,
      amount:price.amount,currency:price.currency,status:'CREATED',
      metadata:{story_title:story.title},
    },
    headers:{Prefer:'return=representation'},
  });
  if(!inserted.ok && inserted.status!==409) return jsonResponse(request,500,{error:'Unable to save the payment order.'});
  return jsonResponse(request,200,{orderId,paymentSessionId,environment:cashfreeEnvironment()});
}

async function verifyPayment(orderId,storedOrder) {
  const rows=await cashfree('/pg/orders/'+encodeURIComponent(orderId)+'/payments');
  const payments=Array.isArray(rows)?rows:[];
  const successful=payments.find((p)=>String(p?.payment_status||'').toUpperCase()==='SUCCESS');
  if(!successful) return {status:payments.some((p)=>String(p?.payment_status||'').toUpperCase()==='PENDING')?'PENDING':'FAILED',payment:null};
  if(!moneyEquals(successful.payment_amount,storedOrder.amount)||String(successful.payment_currency||'').toUpperCase()!==String(storedOrder.currency||'').toUpperCase()) throw new Error('Cashfree payment amount/currency does not match the stored order.');
  return {status:'PAID',payment:successful};
}

async function fulfil(orderId) {
  const rows=await supabaseJson('/rest/v1/payment_orders',{params:{select:'*',cashfree_order_id:'eq.'+orderId,limit:1}});
  const order=Array.isArray(rows)?rows[0]:null;
  if(!order) throw new Error('Payment order not found.');
  const verified=await verifyPayment(orderId,order);
  const now=new Date().toISOString();

  if(verified.status==='PAID'){
    if(order.product_key==='story_lifetime'){
      const response=await supabaseRequest('/rest/v1/purchases',{
        method:'POST',
        body:{user_id:order.user_id,story_id:order.content_id,product_type:'story_lifetime',expires_at:null},
        headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      });
      if(!response.ok) throw new Error('Payment verified, but purchase activation failed.');
    }
    await supabaseRequest('/rest/v1/payment_orders',{
      method:'PATCH',
      body:{
        status:'PAID',
        cashfree_payment_id:String(verified.payment?.cf_payment_id||''),
        paid_at:String(verified.payment?.payment_time||now),
        last_webhook_at:now,updated_at:now,
      },
      params:{id:'eq.'+order.id,status:'neq.PAID'},
    });
    return {status:'PAID'};
  }

  await supabaseRequest('/rest/v1/payment_orders',{
    method:'PATCH',
    body:{status:verified.status,last_webhook_at:now,updated_at:now},
    params:{id:'eq.'+order.id,status:'neq.PAID'},
  });
  return {status:verified.status};
}

async function verifyWebhookSignature(signature,timestamp,rawBody) {
  const secret=envString('CASHFREE_CLIENT_SECRET');
  if(!secret) return false;
  const expected=await hmacBytes(secret,String(timestamp||'')+String(rawBody||''));
  const actualText=String(signature||'').trim();
  let actual;
  try{
    const binary=atob(actualText);
    actual=Uint8Array.from(binary,(c)=>c.charCodeAt(0));
  }catch{return false;}
  return actual.length===expected.length && await crypto.subtle.verify(
    'HMAC',
    await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']),
    actual,
    new TextEncoder().encode(String(timestamp||'')+String(rawBody||''))
  );
}

export async function handlePayments(request) {
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/api/payments/')) return null;
  if(request.method==='OPTIONS') return new Response(null,{status:204});
  try{
    if(path==='/api/payments/create-order'&&request.method==='POST') return createOrder(request);
    if(path==='/api/payments/status'&&request.method==='GET'){
      const user=await authenticateUser(request);
      if(!user?.id) return jsonResponse(request,401,{error:'Unauthorized'});
      const orderId=String(new URL(request.url).searchParams.get('order_id')||'').trim();
      if(!orderId) return jsonResponse(request,400,{error:'Order ID is required.'});
      const rows=await supabaseJson('/rest/v1/payment_orders',{params:{select:'*',cashfree_order_id:'eq.'+orderId,user_id:'eq.'+user.id,limit:1}});
      const order=Array.isArray(rows)?rows[0]:null;
      if(!order) return jsonResponse(request,404,{error:'Payment order not found.'});
      const result=await fulfil(orderId);
      return jsonResponse(request,200,{orderId,status:result.status,productKey:order.product_key,contentId:order.content_id});
    }
    if(path==='/api/payments/webhook'&&request.method==='POST'){
      const rawBody=await request.text();
      if(!await verifyWebhookSignature(request.headers.get('x-webhook-signature'),request.headers.get('x-webhook-timestamp'),rawBody)) return jsonResponse(request,401,{error:'Invalid webhook signature.'});
      let body={}; try{body=JSON.parse(rawBody||'{}')}catch{return jsonResponse(request,400,{error:'Invalid webhook JSON.'});}
      const orderId=String(body?.data?.order?.order_id||'').trim();
      if(!orderId) return jsonResponse(request,400,{error:'Webhook order ID is missing.'});
      const result=await fulfil(orderId);
      return jsonResponse(request,200,{ok:true,status:result.status});
    }
    if(path==='/api/payments/health'&&request.method==='GET'){
      let adminEnabled=false; try{const v=await settings();adminEnabled=v?.payments?.enabled===true}catch{}
      const configured=Boolean(envString('CASHFREE_CLIENT_ID')&&envString('CASHFREE_CLIENT_SECRET')&&envString('SUPABASE_SERVICE_ROLE_KEY'));
      return jsonResponse(request,200,{enabled:runtimeEnabled()&&adminEnabled&&configured,adminEnabled,runtimeEnabled:runtimeEnabled(),environment:cashfreeEnvironment()||'sandbox',configured});
    }
    return jsonResponse(request,404,{error:'Not found'});
  }catch(error){
    const status=Number(error?.status)||(/Authentication required|Authentication failed/i.test(String(error?.message))?401:500);
    return jsonResponse(request,status,{error:status===401?String(error.message):String(error?.message||'Payment service error.')});
  }
}
