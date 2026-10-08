const base=String(process.env.PAGES_TEST_URL||'').replace(/\/+$/,'');
if(!base) throw new Error('PAGES_TEST_URL is required');

const cases=[
  ['GET','/health',200],
  ['GET','/api/public-settings',200],
  ['GET','/api/public-catalog',[200,503]],
  ['GET','/api/analytics/link-session',405],
  ['GET','/api/admin/analytics',401],
  ['GET','/api/admin/user-export.xlsx',401],
  ['POST','/api/admin/playwright',401],
  ['GET','/api/admin/vip-access',401],
  ['GET','/api/vip-access',401],
  ['POST','/api/admin/notifications/send',401],
  ['GET','/api/push/config',200],
  ['GET','/api/push/status',401],
  ['POST','/api/push/subscribe',401],
  ['POST','/api/push/preferences',401],
  ['POST','/api/push/subscribe/remove',401],
  ['POST','/api/tts',503],
  ['POST','/api/edge-tts',503],
  ['POST','/api/sarvam-tts',503],
  ['GET','/api/ads/entitlements',401],
  ['POST','/api/ads/start',401],
  ['POST','/api/ads/complete',401],
  ['POST','/api/shortener/preview',401],
  ['POST','/api/shortener/start',401],
  ['POST','/api/shortener/complete',401],
  ['POST','/api/shortener/access',401],
  ['GET','/api/shortener/entitlements',401],
  ['GET','/api/shortener/status',401],
  ['POST','/api/payments/create-order',401],
  ['GET','/api/payments/status',401],
  ['POST','/api/payments/webhook',401],
  ['GET','/api/payments/health',200],
  ['GET','/unlock/audio/1',303],
];

for (const [method,path,expected] of cases){
  const response=await fetch(base+path,{
    method,
    headers: method==='POST' ? {'Content-Type':'application/json'} : undefined,
    body: method==='POST'
      ? (['/api/tts','/api/edge-tts','/api/sarvam-tts'].includes(path)
        ? JSON.stringify({text:'HJ Groups preview smoke test'})
        : '{}')
      : undefined,
    redirect:'manual',
  });
  const accepted=Array.isArray(expected)?expected: [expected];
  if(!accepted.includes(response.status)){
    const text=await response.text();
    throw new Error(method+' '+path+' expected '+accepted.join(' or ')+' got '+response.status+' body='+text.slice(0,160));
  }
  console.log('PASS',method,path,response.status);
}

const preflight=await fetch(base+'/api/public-settings',{
  method:'OPTIONS',
  headers:{Origin:'https://hj-groups-web.pages.dev','Access-Control-Request-Method':'GET'},
});
if(preflight.status!==204 || preflight.headers.get('Access-Control-Allow-Origin')!=='https://hj-groups-web.pages.dev'){
  throw new Error('OPTIONS/CORS check failed');
}
console.log('PASS OPTIONS /api/public-settings',preflight.status);
