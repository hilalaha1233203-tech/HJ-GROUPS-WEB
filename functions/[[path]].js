import { jsonResponse, setRuntimeEnv } from './_lib/runtime.js';
import { handlePublicSettings } from './_lib/publicSettings.js';
import { handleAnalyticsLinkSession, handleAdminAnalytics } from './_lib/analytics.js';
import { handleVipAdmin, handleVipSelf } from './_lib/vip.js';
import { handleAds } from './_lib/ads.js';
import { handleShortener } from './_lib/shortener.js';
import { handlePayments } from './_lib/payment.js';
import { handleTtsRequest, healthTts } from './_lib/tts.js';
import { handleWebPush, handleWebPushUnsubscribe, handleAdminNotificationSend } from './_lib/webPush.js';
import { handleAdminPlaywright } from './_lib/playwright.js';
import { handleAdminUserExport } from './_lib/adminExport.js';

function health(request) {
  const env=globalThis.__HJ_RUNTIME_ENV || {};
  return jsonResponse(request,200,{
    ok:true,
    service:'hj-groups-web',
    runtime:'cloudflare-pages-functions',
    ttsConfigured:true,
    ttsProviders:healthTts(),
    webPushConfigured:Boolean(String(env.WEB_PUSH_VAPID_PUBLIC_KEY || '')),
    containerRuntime:false,
  });
}

function addSecurityHeaders(response) {
  const headers=new Headers(response.headers);
  headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=(), usb=(), payment=()');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function route(request) {
  const path=new URL(request.url).pathname;
  if(path==='/health') return health(request);
  if(path==='/api/public-settings') return handlePublicSettings(request);
  if(path==='/api/analytics/link-session') return handleAnalyticsLinkSession(request);
  if(path==='/api/admin/analytics') return handleAdminAnalytics(request);
  if(path==='/api/admin/user-export.xlsx') return handleAdminUserExport(request);
  if(path==='/api/admin/playwright') return handleAdminPlaywright(request);
  if(path==='/api/admin/vip-access') return handleVipAdmin(request);
  if(path==='/api/vip-access') return handleVipSelf(request);
  if(path==='/api/admin/notifications/send') return handleAdminNotificationSend(request);
  if(path==='/api/push/subscribe/remove') return handleWebPushUnsubscribe(request);
  const push=await handleWebPush(request); if(push) return push;
  if(path==='/api/tts') return handleTtsRequest(request,'auto');
  if(path==='/api/edge-tts') return handleTtsRequest(request,'edge');
  if(path==='/api/sarvam-tts') return handleTtsRequest(request,'sarvam');
  const ads=await handleAds(request); if(ads) return ads;
  const payment=await handlePayments(request); if(payment) return payment;
  const shortener=await handleShortener(request); if(shortener) return shortener;
  return jsonResponse(request,404,{error:'Not found'});
}

export async function onRequest(context) {
  setRuntimeEnv(context.env || {});
  try {
    return addSecurityHeaders(await route(context.request));
  } catch {
    return addSecurityHeaders(jsonResponse(context.request,500,{error:'Internal server error'}));
  }
}
