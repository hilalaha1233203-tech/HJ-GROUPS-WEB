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
      hint:'Edge TTS currently requires a provider-specific WebSocket client rewrite; use /api/tts with Sarvam configured.',
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
    return jsonResponse(request,503,{error:'Text-to-speech service unavailable',detail:String(error?.message||'Sarvam TTS failed').slice(0,300)});
  }
}

export function healthTts(){
  return {
    edge:{configured:false,reason:'not_migrated_to_pages'},
    sarvam:{configured:Boolean(envString('SARVAM_API_KEY'))},
    strategy:'Tamil/other text: Sarvam; Edge TTS requires a future provider-specific WebSocket rewrite.',
  };
}

export { handleTtsRequest };
