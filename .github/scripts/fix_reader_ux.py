from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'src' / 'App.jsx'
CSS = ROOT / 'src' / 'App.css'
app = APP.read_text(encoding='utf-8')
css = CSS.read_text(encoding='utf-8')

app = app.replace(
"  const speechRunRef = useRef(0)\n\n  const pendingAutoReadRef = useRef(false)",
"  const speechRunRef = useRef(0)\n  const speechVoiceRef = useRef(null)\n\n  const pendingAutoReadRef = useRef(false)",1)

voice_effect = """  useEffect(() => {
    if (!('speechSynthesis' in window)) return undefined
    const chooseVoice = () => {
      const voices = window.speechSynthesis.getVoices() || []
      const tamilVoices = voices.filter((voice) => /^(ta)(?:[-_]|$)/i.test(String(voice.lang || '')))
      const tamilIndia = tamilVoices.find((voice) => /^(ta)(?:[-_]IN)/i.test(String(voice.lang || '')))
      speechVoiceRef.current = tamilIndia || tamilVoices.find((voice) => voice.localService) || tamilVoices[0] || null
    }
    chooseVoice()
    window.speechSynthesis.addEventListener?.('voiceschanged', chooseVoice)
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', chooseVoice)
  }, [])

"""
anchor = "  const sleepTimerRef = useRef(null)\n\n"
if voice_effect not in app and anchor in app:
    app = app.replace(anchor, anchor + voice_effect, 1)

sarvam_bridge = r'''const installSarvamTamilSpeechBridge = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis || window.__hjSarvamSpeechBridge) return () => {}
  const synthesis = window.speechSynthesis
  const originalSpeak = synthesis.speak.bind(synthesis)
  const originalCancel = synthesis.cancel.bind(synthesis)
  const originalPause = synthesis.pause?.bind(synthesis)
  const originalResume = synthesis.resume?.bind(synthesis)
  let activeAudio = null
  let run = 0
  const cache = new Map()
  const isTamil = (text) => /[\u0B80-\u0BFF]/u.test(String(text || ''))
  const settings = () => { try { return {...{speaker:'ishita',pace:0.92,temperature:0.72}, ...JSON.parse(localStorage.getItem('hj_tts_settings_v2') || '{}')} } catch { return {speaker:'ishita',pace:0.92,temperature:0.72} } }
  const getAudio = async (text) => {
    const key = text.trim()
    if (cache.has(key)) return cache.get(key)
    const s = settings()
    const promise = fetch('/api/sarvam-tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:key,language_code:'ta-IN',model:'bulbul:v3',speaker:String(s.speaker||'ishita').toLowerCase(),pace:Number(s.pace)||0.92,temperature:Number(s.temperature)||0.72})}).then(async response=>{if(!response.ok)throw new Error(`Sarvam TTS ${response.status}`);return response.blob()})
    cache.set(key,promise)
    try{return await promise}catch(error){cache.delete(key);throw error}
  }
  const fallbackToBrowser = utterance => { try{originalSpeak(utterance)}catch{try{utterance.onerror?.(new Event('error'))}catch{}} }
  const stopAudio = () => {
    run += 1
    if(activeAudio){try{activeAudio.pause()}catch{};try{activeAudio.currentTime=0}catch{};try{activeAudio.removeAttribute('src')}catch{};activeAudio=null}
    window.__hjSarvamActiveAudio=false;window.__hjSarvamPaused=false;window.__hjSarvamPending=false
  }
  synthesis.speak = utterance => {
    const text=String(utterance?.text||'').trim()
    if(!text||!isTamil(text)){originalSpeak(utterance);return}
    const token=++run;window.__hjSarvamPending=true;window.__hjSarvamPaused=false
    getAudio(text).then(blob=>{
      if(token!==run)return
      const url=URL.createObjectURL(blob),audio=new Audio(url);activeAudio=audio;window.__hjSarvamPending=false;window.__hjSarvamActiveAudio=true
      audio.volume=Number.isFinite(utterance.volume)?utterance.volume:1
      audio.playbackRate=Math.max(.65,Math.min(1.25,Number(utterance.rate)||1))
      try{utterance.onstart?.(new Event('start'))}catch{}
      audio.onended=()=>{if(token!==run)return;activeAudio=null;window.__hjSarvamActiveAudio=false;window.__hjSarvamPending=false;URL.revokeObjectURL(url);try{utterance.onend?.(new Event('end'))}catch{}}
      audio.onerror=()=>{if(token!==run)return;activeAudio=null;window.__hjSarvamActiveAudio=false;window.__hjSarvamPending=false;URL.revokeObjectURL(url);fallbackToBrowser(utterance)}
      return audio.play().catch(()=>{throw new Error('Sarvam audio playback failed')})
    }).catch(()=>{if(token!==run)return;window.__hjSarvamActiveAudio=false;window.__hjSarvamPending=false;fallbackToBrowser(utterance)})
  }
  synthesis.cancel=()=>{stopAudio();try{originalCancel()}catch{}}
  synthesis.pause=()=>{if(activeAudio){try{activeAudio.pause()}catch{};window.__hjSarvamPaused=true}try{originalPause?.()}catch{}}
  synthesis.resume=()=>{if(activeAudio){try{activeAudio.play()}catch{};window.__hjSarvamPaused=false}try{originalResume?.()}catch{}}
  window.__hjSarvamSpeechBridge=true
  return ()=>{stopAudio();synthesis.speak=originalSpeak;synthesis.cancel=originalCancel;if(originalPause)synthesis.pause=originalPause;if(originalResume)synthesis.resume=originalResume;cache.clear();delete window.__hjSarvamSpeechBridge}
}
'''
# Always refresh the bridge so an older deployed bridge cannot survive future builds.
app, replaced = re.subn(r"const installSarvamTamilSpeechBridge = \(\) => \{.*?\n\}\n(?=\nfunction App\(\) \{)", sarvam_bridge.rstrip(), app, count=1, flags=re.S)
if not replaced:
    app = app.replace('function App() {', sarvam_bridge + '\nfunction App() {', 1)

bridge_effect = """  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    return installSarvamTamilSpeechBridge()
  }, [])

"""
if bridge_effect not in app and voice_effect and anchor in app:
    app = app.replace(anchor + voice_effect, anchor + bridge_effect + voice_effect, 1)

app = app.replace("const chunkTextForSpeech = (text, maxLength = 700) => {", "const chunkTextForSpeech = (text, maxLength = 240) => {", 1)
app = app.replace("          700\n        )", "          240\n        )", 1)
app = app.replace("cleaned.match(/[^.!?。！？]+[.!?。！？]?/g)", "cleaned.match(/[^.!?。！？;:，,]+[.!?。！？;:，,]?/gu)", 1)

old = """      const utterance =\n        new SpeechSynthesisUtterance(\n          chunk\n        )\n\n      utterance.rate = speed\n      utterance.volume =\n        volume\n"""
new = """      const utterance =\n        new SpeechSynthesisUtterance(\n          chunk\n        )\n\n      const hasTamil = /[\\u0B80-\\u0BFF]/u.test(chunk)\n      const voices = window.speechSynthesis.getVoices?.() || []\n      const tamilVoice = voices.find((item) => /^(ta)(?:[-_]|$)/i.test(String(item.lang || '')))\n      const indianEnglish = voices.find((item) => /^en[-_]IN(?:[-_]|$)/i.test(String(item.lang || '')))\n      utterance.lang = hasTamil ? 'ta-IN' : 'en-IN'\n      utterance.voice = hasTamil ? (tamilVoice || speechVoiceRef.current || null) : (indianEnglish || speechVoiceRef.current || null)\n      utterance.rate = hasTamil ? Math.min(Math.max(speed, 0.75), 0.98) : Math.min(Math.max(speed, 0.8), 1.1)\n      utterance.pitch = 1\n      utterance.volume =\n        volume\n"""
if old in app:
    app = app.replace(old, new, 1)

APP.write_text(app, encoding='utf-8')

if 'REAL BOOK PAGE TURN + SWIPE' not in css:
    css += r'''

/* Reader surface remains a quiet paper-like canvas; no neon wave effects. */
.reader-body-full .epub-reader,
.reader-body-full .react-pdf__Page { backface-visibility: visible; transform-style: preserve-3d; }
'''
CSS.write_text(css, encoding='utf-8')
print('reader UX hardening applied')
