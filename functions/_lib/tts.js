import {
  envString,
  jsonResponse,
  headersForCors,
} from './runtime.js';

const SARVAM_ENDPOINT='https://api.sarvam.ai/text-to-speech/stream';
const MAX_CHARS=6000;

const cleanText=(value)=>String(value||'').replace(/\u00a0/g,' ').replace(/[ \t\r\n]+/g,' ').trim();
const isTamilText=(value)=>/[\u0B80-\u0BFF]/u.test(String(value||''));

function normalizeSpeechText(value){
  let text=cleanText(value);
  return text.replace(/(?:[\u0B80-\u0BFF](?:\s+|$)){3,}/gu,(run)=>run.replace(/\s+/gu,''));
}

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

function normalizeLanguage(code,text){
  const raw=String(code||'').trim();
  if (/^(ta-IN|en-IN|hi-IN)$/i.test(raw)) return raw;
  return isTamilText(text)?'ta-IN':'en-IN';
}

function normalizeSpeaker(value){
  const raw=String(value||'ratan').trim().toLowerCase();
  return /^[a-z][a-z0-9_-]{1,40}$/.test(raw)?raw:'ratan';
}

async function sarvamAudio({text,languageCode,speaker='ratan',pace=1,temperature=.35}){
  const apiKey=envString('SARVAM_API_KEY');
  if(!apiKey) throw Object.assign(new Error('Sarvam TTS is not configured'),{status:503,code:'NOT_CONFIGURED'});
  if(text.length>3500) throw Object.assign(new Error('text exceeds 3500 characters for Sarvam TTS'),{status:413});
  const response=await fetch(SARVAM_ENDPOINT,{
    method:'POST',
    headers:{'api-subscription-key':apiKey,'Content-Type':'application/json','Accept':'audio/mpeg'},
    body:JSON.stringify({
      text,
      target_language_code:normalizeLanguage(languageCode,text),
      speaker:normalizeSpeaker(speaker),
      pace:clamp(Number(pace)||1,.5,2),
      temperature:clamp(Number(temperature)||.35,.01,1),
      model:'bulbul:v3',
      output_audio_codec:'mp3',
    }),
  });
  if(!response.ok) throw Object.assign(new Error('Sarvam TTS request failed ('+response.status+')'),{status:response.status});
  const buffer=await response.arrayBuffer();
  if(!buffer.byteLength) throw new Error('Sarvam TTS returned empty audio');
  return buffer;
}


// Temporary compatibility bridge: when the legacy backend is explicitly configured,
// keep its existing Edge-first / Sarvam-fallback TTS behavior during migration.
// This is not the final runtime target and is not considered live-verified.
export async function handleLegacyTtsProxy(request, provider='auto'){
  const configuredBase=envString('HJ_WEB_BACKEND_URL');
  if(!configuredBase) return null;

  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:headersForCors(request)});
  if(request.method!=='POST') return jsonResponse(request,405,{error:'Method not allowed'},{Allow:'POST, OPTIONS'});

  let rawBody;
  try {
    rawBody=await request.text();
    if(rawBody.length>64000) return jsonResponse(request,413,{error:'TTS request body is too large'});
  } catch {
    return jsonResponse(request,400,{error:'Invalid request body'});
  }

  let body;
  try { body=JSON.parse(rawBody); } catch {
    return jsonResponse(request,400,{error:'Invalid JSON request'});
  }
  const text=normalizeSpeechText(body?.text);
  if(!text) return jsonResponse(request,400,{error:'text is required'});
  if(text.length>MAX_CHARS) return jsonResponse(request,413,{error:'text exceeds '+MAX_CHARS+' characters'});

  let upstream;
  try {
    const base=new URL(configuredBase);
    if(base.protocol!=='https:' || base.username || base.password) throw new Error('Invalid backend URL');
    const route=provider==='edge'?'edge-tts':provider==='sarvam'?'sarvam-tts':'tts';
    upstream=new URL('/api/'+route,base);
    if(upstream.origin===new URL(request.url).origin) throw new Error('Recursive backend URL');
  } catch {
    return jsonResponse(request,503,{
      error:'Legacy TTS bridge is not safely configured',
      code:'LEGACY_TTS_BACKEND_INVALID',
    });
  }

  try {
    const response=await fetch(upstream.toString(),{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'audio/mpeg, application/json'},
      body:JSON.stringify({...body,text}),
      redirect:'error',
    });
    const headers=headersForCors(request);
    headers.set('Content-Type',response.headers.get('Content-Type')||'application/json; charset=utf-8');
    const cacheControl=response.headers.get('Cache-Control');
    if(cacheControl) headers.set('Cache-Control',cacheControl);
    const providerHeader=response.headers.get('X-TTS-Provider');
    if(providerHeader) headers.set('X-TTS-Provider',providerHeader);
    return new Response(response.body,{status:response.status,headers});
  } catch {
    return jsonResponse(request,503,{
      error:'Legacy TTS backend is unavailable',
      code:'LEGACY_TTS_BACKEND_UNAVAILABLE',
      hint:'Temporary Edge TTS compatibility requires HJ_WEB_BACKEND_URL to point to a working HTTPS backend. The final Pages runtime must not depend on this bridge.',
    });
  }
}

async function handleTtsRequest(request,provider){
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:headersForCors(request)});
  if(request.method!=='POST') return jsonResponse(request,405,{error:'Method not allowed'},{Allow:'POST, OPTIONS'});
  let body; try{body=await request.json()}catch{return jsonResponse(request,400,{error:'Invalid JSON request'});}
  const text=normalizeSpeechText(body?.text);
  if(!text) return jsonResponse(request,400,{error:'text is required'});
  if(text.length>MAX_CHARS) return jsonResponse(request,413,{error:'text exceeds '+MAX_CHARS+' characters'});

  if(provider==='edge'){
    return jsonResponse(request,503,{
      error:'Text-to-speech provider unavailable',
      code:'EDGE_TTS_NOT_MIGRATED',
      hint:'Cloudflare Workers supports outbound WebSockets, but the legacy Microsoft Edge TTS client uses Node ws/crypto/Buffer APIs and has not been ported or tested in Pages Functions. Options: configure SARVAM_API_KEY and use /api/tts, or explicitly retain and test /api/edge-tts on the legacy backend.'
    });
  }

  if(!envString('SARVAM_API_KEY')) {
    return jsonResponse(request,503,{error:'Text-to-speech service unavailable',code:'SARVAM_TTS_NOT_CONFIGURED'});
  }
  try{
    const audio=await sarvamAudio({text,languageCode:body?.language_code,speaker:body?.speaker,pace:body?.pace??body?.rate,temperature:body?.temperature});
    const headers=headersForCors(request);
    headers.set('Content-Type','audio/mpeg');
    headers.set('Content-Length',String(audio.byteLength));
    headers.set('Cache-Control','private, max-age=3600');
    headers.set('X-TTS-Provider','sarvam');
    return new Response(audio,{status:200,headers});
  }catch(error){
    return jsonResponse(request,503,{error:'Text-to-speech service unavailable',code:'SARVAM_TTS_REQUEST_FAILED',detail:String(error?.message||'Sarvam TTS failed').slice(0,300)});
  }
}

export function healthTts(){
  const legacyBackendConfigured=Boolean(envString('HJ_WEB_BACKEND_URL'));
  const sarvamConfigured=Boolean(envString('SARVAM_API_KEY'));
  return {
    edge:{
      configured:false,
      routeConfiguredViaLegacyBackend:legacyBackendConfigured,
      reason:legacyBackendConfigured?'legacy_backend_configured_not_live_verified':'not_migrated_to_pages',
    },
    sarvam:{configured:sarvamConfigured},
    legacyBackend:{configured:legacyBackendConfigured,liveVerified:false},
    strategy:legacyBackendConfigured
      ? 'Temporary legacy backend TTS bridge: use configured Sarvam when available, with Edge fallback; live runtime not verified.'
      : 'Pages Sarvam requires SARVAM_API_KEY; Edge TTS needs the temporary legacy backend bridge until a Workers-compatible port is live-tested.',
  };
}

export { handleTtsRequest };
