const STYLE_ID='hj-reader-runtime-enhancements'
const TURN_MS=1050
const TTS_KEY='hj_tts_settings_v2'
const PAGE_ZOOM_KEY='hj_reader_page_zoom_v2'

const getTtsSettings=()=>{try{return {...{speaker:'ishita',pace:0.92,temperature:0.72},...JSON.parse(localStorage.getItem(TTS_KEY)||'{}')}}catch{return {speaker:'ishita',pace:0.92,temperature:0.72}}}
const saveTtsSettings=v=>{try{localStorage.setItem(TTS_KEY,JSON.stringify(v));window.dispatchEvent(new CustomEvent('hj-tts-settings',{detail:v}))}catch{}}
const getPageZoom=()=>{try{return Math.max(.7,Math.min(1.3,Number(localStorage.getItem(PAGE_ZOOM_KEY)||1)))}catch{return 1}}
const savePageZoom=v=>{try{localStorage.setItem(PAGE_ZOOM_KEY,String(v))}catch{}}

function injectReaderStyles(){
  if(document.getElementById(STYLE_ID))return
  const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
.reader-body-full{position:relative!important;perspective:1800px!important;perspective-origin:50% 50%!important;transform-style:preserve-3d!important;touch-action:pan-y!important;overscroll-behavior:contain!important;isolation:isolate!important}
.reader-body-full .epub-reader,.reader-body-full .react-pdf__Page{transform-style:preserve-3d!important;will-change:transform,clip-path,filter!important;background:#fff!important;backface-visibility:visible!important}
.reader-body-full .react-pdf__Page canvas{background:#fff!important}
.hj-book-turn{position:absolute!important;z-index:100000!important;pointer-events:none!important;overflow:hidden!important;transform-style:preserve-3d!important;background:#fff!important;backface-visibility:visible!important;box-shadow:0 12px 34px rgba(0,0,0,.22)!important;contain:paint!important}
.hj-book-turn.next{transform-origin:left center!important}.hj-book-turn.prev{transform-origin:right center!important}
.hj-book-turn::before{content:'';position:absolute;inset:0;z-index:20;pointer-events:none;background:linear-gradient(90deg,rgba(255,255,255,.12),rgba(0,0,0,.035) 18%,rgba(0,0,0,.16) 48%,rgba(255,255,255,.26) 72%,rgba(255,255,255,.03));opacity:.9}
.hj-book-turn::after{content:'';position:absolute;top:-10%;bottom:-10%;width:34%;z-index:21;pointer-events:none;filter:blur(7px);opacity:.85;background:linear-gradient(90deg,transparent,rgba(255,255,255,.9),rgba(0,0,0,.18),transparent)}
.hj-book-turn.next::after{left:0}.hj-book-turn.prev::after{right:0;transform:scaleX(-1)}
.hj-book-turn-shadow{position:absolute!important;top:-5%!important;bottom:-5%!important;width:46%!important;z-index:22!important;pointer-events:none!important;opacity:0!important;filter:blur(14px)!important}
.hj-book-turn.next .hj-book-turn-shadow{right:-3%!important;background:linear-gradient(90deg,transparent,rgba(0,0,0,.52),rgba(0,0,0,.02))!important}.hj-book-turn.prev .hj-book-turn-shadow{left:-3%!important;background:linear-gradient(270deg,transparent,rgba(0,0,0,.52),rgba(0,0,0,.02))!important}
.hj-book-fold{position:absolute!important;top:-5%!important;bottom:-5%!important;width:16%!important;z-index:23!important;pointer-events:none!important;opacity:0!important;filter:blur(1.5px)!important;background:linear-gradient(90deg,transparent,rgba(255,255,255,.86),rgba(0,0,0,.20),rgba(255,255,255,.20),transparent)!important}
.hj-book-turn.next .hj-book-fold{left:0!important}.hj-book-turn.prev .hj-book-fold{right:0!important;transform:scaleX(-1)!important}
.hj-book-edge{position:absolute!important;top:-5%!important;bottom:-5%!important;width:3px!important;z-index:24!important;pointer-events:none!important;opacity:0!important;background:rgba(255,255,255,.98)!important;filter:blur(1px)!important;border-radius:50%!important}
.hj-book-turn.next .hj-book-edge{left:-1px!important}.hj-book-turn.prev .hj-book-edge{right:-1px!important}
.hj-reader-tools{position:fixed;right:14px;bottom:14px;z-index:100050;display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid rgba(124,131,255,.28);border-radius:14px;background:rgba(14,16,28,.94);backdrop-filter:blur(14px);box-shadow:0 10px 30px rgba(0,0,0,.28);font:500 12px/1.2 system-ui,sans-serif;color:#e9ebff}
.hj-reader-tools button,.hj-reader-tools select{height:30px;border:1px solid rgba(255,255,255,.13);border-radius:9px;background:#1b1e31;color:#eef0ff;padding:0 9px;cursor:pointer}
.hj-reader-tools button:hover,.hj-reader-tools select:hover{border-color:rgba(124,131,255,.7)}
.hj-reader-tools .hj-size-label{min-width:42px;text-align:center;color:#aeb3d2}
.hj-reader-tools input[type=range]{width:82px;accent-color:#7c83ff}
.hj-reader-tools .hj-tool-sep{width:1px;height:22px;background:rgba(255,255,255,.12)}
.hj-tts-panel{position:fixed;right:14px;bottom:58px;z-index:100051;width:260px;padding:14px;border:1px solid rgba(124,131,255,.3);border-radius:16px;background:rgba(14,16,28,.97);backdrop-filter:blur(18px);box-shadow:0 16px 42px rgba(0,0,0,.38);font:500 12px/1.35 system-ui,sans-serif;color:#eef0ff;display:none}
.hj-tts-panel.open{display:block}.hj-tts-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0}.hj-tts-row label{color:#aeb3d2}.hj-tts-panel select{width:145px}.hj-tts-panel input{width:120px;accent-color:#7c83ff}.hj-tts-value{min-width:38px;text-align:right;color:#fff}.hj-tts-note{font-size:10px;color:#858ba9;margin-top:8px}
.reader-page-input::placeholder{color:#777c96!important;opacity:1!important}
@media(max-width:700px){.reader-body-full{perspective:1200px!important}.hj-reader-tools{right:8px;bottom:8px;max-width:calc(100vw - 16px);overflow-x:auto}.hj-tts-panel{right:8px;bottom:52px;width:min(260px,calc(100vw - 16px))}}
`;
  document.head.appendChild(s)
}

function forceEpubDocument(d){
  if(!d)return
  try{const root=d.documentElement,body=d.body;root?.style.setProperty('background','#fff','important');root?.style.setProperty('color','#111','important');body?.style.setProperty('background','#fff','important');body?.style.setProperty('color','#111','important');body?.style.setProperty('margin','0','important');body?.style.setProperty('min-height','100%','important');body?.style.setProperty('overflow-x','hidden','important');if(!d.getElementById('hj-epub-force-light-runtime')){const s=d.createElement('style');s.id='hj-epub-force-light-runtime';s.textContent='html,body{background:#fff!important;color:#111!important}body{margin:0!important;min-height:100%!important;overflow-x:hidden!important}::selection{background:rgba(124,131,255,.25)!important;color:#111!important}img,svg,video{max-width:100%!important;height:auto!important}';(d.head||root).appendChild(s)}}catch{}
}
function host(){return document.querySelector('.reader-body-full')||document.querySelector('.reader-modal')||document.body}
function surface(){return document.querySelector('.epub-reader')||document.querySelector('.react-pdf__Page')}

function applyPageZoom(){
  const h=document.querySelector('.reader-body-full');if(!h)return
  const z=getPageZoom();h.style.setProperty('--hj-page-zoom',String(z));
  const s=surface();if(!s)return
  if(document.__hjTurnBusy)return
  s.style.setProperty('transform-origin','center top','important')
  s.style.setProperty('scale',String(z),'important')
  s.style.setProperty('margin-bottom',`${Math.max(0,(z-1)*18)}px`,'important')
}

function mountTools(){
  if(!document.querySelector('.reader-body-full')||document.querySelector('.hj-reader-tools'))return
  const tools=document.createElement('div');tools.className='hj-reader-tools';tools.innerHTML=`<button type="button" data-hj-size="minus" aria-label="Decrease page size">−</button><span class="hj-size-label">100%</span><button type="button" data-hj-size="plus" aria-label="Increase page size">+</button><input data-hj-zoom type="range" min="70" max="130" step="5" value="100" aria-label="Page size"><span class="hj-tool-sep"></span><button type="button" data-hj-tts aria-label="TTS settings">🔊 TTS</button>`
  document.body.appendChild(tools)
  const panel=document.createElement('div');panel.className='hj-tts-panel';panel.innerHTML=`<div style="font-size:14px;font-weight:700;margin-bottom:8px">Tamil Read Aloud</div><div class="hj-tts-row"><label>Voice</label><select data-hj-voice><option value="ishita">Ishita</option><option value="priya">Priya</option><option value="ritu">Ritu</option><option value="shreya">Shreya</option><option value="roopa">Roopa</option><option value="shubh">Shubh</option><option value="aditya">Aditya</option><option value="rahul">Rahul</option><option value="vijay">Vijay</option></select></div><div class="hj-tts-row"><label>Speed</label><input data-hj-pace type="range" min="0.65" max="1.25" step="0.01"><span class="hj-tts-value" data-hj-pace-value>0.92x</span></div><div class="hj-tts-row"><label>Expression</label><input data-hj-temp type="range" min="0.35" max="1" step="0.01"><span class="hj-tts-value" data-hj-temp-value>0.72</span></div><div class="hj-tts-note">Natural narration uses Sarvam Bulbul v3 when the server key is configured.</div>`
  document.body.appendChild(panel)
  const settings=getTtsSettings();const voice=panel.querySelector('[data-hj-voice]'),pace=panel.querySelector('[data-hj-pace]'),temp=panel.querySelector('[data-hj-temp]'),pv=panel.querySelector('[data-hj-pace-value]'),tv=panel.querySelector('[data-hj-temp-value]'),zoom=tools.querySelector('[data-hj-zoom]'),label=tools.querySelector('.hj-size-label')
  voice.value=settings.speaker;pace.value=settings.pace;temp.value=settings.temperature;zoom.value=Math.round(getPageZoom()*100);label.textContent=`${zoom.value}%`;pv.textContent=`${Number(pace.value).toFixed(2)}x`;tv.textContent=Number(temp.value).toFixed(2)
  const update=()=>{const v={speaker:voice.value,pace:Number(pace.value),temperature:Number(temp.value)};saveTtsSettings(v);pv.textContent=`${v.pace.toFixed(2)}x`;tv.textContent=v.temperature.toFixed(2)}
  voice.addEventListener('change',update);pace.addEventListener('input',update);temp.addEventListener('input',update)
  zoom.addEventListener('input',()=>{const z=Number(zoom.value)/100;savePageZoom(z);label.textContent=`${zoom.value}%`;applyPageZoom()})
  tools.querySelector('[data-hj-size="minus"]').addEventListener('click',()=>{zoom.value=String(Math.max(70,Number(zoom.value)-5));zoom.dispatchEvent(new Event('input'))})
  tools.querySelector('[data-hj-size="plus"]').addEventListener('click',()=>{zoom.value=String(Math.min(130,Number(zoom.value)+5));zoom.dispatchEvent(new Event('input'))})
  tools.querySelector('[data-hj-tts]').addEventListener('click',()=>panel.classList.toggle('open'))
}

function makeTurnPage(source,dir){
  const h=host(),r=source.getBoundingClientRect(),hr=h.getBoundingClientRect();if(getComputedStyle(h).position==='static')h.style.position='relative'
  const live=source.classList.contains('epub-reader')
  if(live){
    source.style.setProperty('transform-origin',dir==='next'?'left center':'right center','important')
    source.style.setProperty('transform-style','preserve-3d','important')
    source.style.setProperty('backface-visibility','visible','important')
    source.style.setProperty('will-change','transform,clip-path,filter','important')
    return{page:source,fold:null,shadow:null,edge:null,live:true,originalTransform:source.style.transform,originalFilter:source.style.filter,originalClip:source.style.clipPath,originalOpacity:source.style.opacity}
  }
  const page=document.createElement('div');page.className=`hj-book-turn ${dir}`;page.style.cssText=`left:${r.left-hr.left}px;top:${r.top-hr.top}px;width:${r.width}px;height:${r.height}px;background:#fff`
  const clone=source.cloneNode(true);clone.style.cssText='position:absolute!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;transform:none!important;overflow:hidden!important;backface-visibility:visible!important;pointer-events:none!important;background:#fff!important';clone.querySelectorAll?.('canvas').forEach(c=>{c.style.maxWidth='100%';c.style.height='auto';c.style.background='#fff'})
  const fold=document.createElement('div'),shadow=document.createElement('div'),edge=document.createElement('div');fold.className='hj-book-fold';shadow.className='hj-book-turn-shadow';edge.className='hj-book-edge';page.append(clone,fold,shadow,edge);h.appendChild(page);return{page,fold,shadow,edge,live:false}
}

function turn(dir,navigate){
  if(document.__hjTurnBusy)return
  const old=surface();if(!old){navigate();return}
  document.__hjTurnBusy=true
  const f=dir==='next',made=makeTurnPage(old,dir),page=made.page,start=performance.now(),mid=TURN_MS*.55;let navigated=false
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2
  const frame=now=>{
    const elapsed=now-start,p=Math.max(0,Math.min(1,elapsed/TURN_MS)),depth=Math.sin(Math.PI*p)
    if(made.live){
      const phase=p<.55?p/.55:(p-.55)/.45
      const curve=Math.sin(Math.PI*Math.min(1,phase))
      if(!navigated&&elapsed>=mid){
        navigated=true
        page.style.setProperty('opacity','0','important')
        try{navigate()}catch{}
        requestAnimationFrame(()=>{const current=surface();if(current&&current===page){current.style.setProperty('opacity','0','important')}})
      }
      if(p<.55){
        const t=ease(Math.max(0,Math.min(1,p/.55))),x=(f?-96:96)*t,clip=Math.max(0,Math.min(88,t*92)),tilt=(f?-1:1)*(1+3*Math.sin(Math.PI*t)),lift=4+10*Math.sin(Math.PI*t)
        page.style.setProperty('transform',`translate3d(${x}px,${-lift*.12}px,${lift}px) rotateZ(${tilt}deg) scale(${1-.01*Math.sin(Math.PI*t)})`,'important')
        page.style.setProperty('clip-path',f?`inset(0 0 0 ${clip}% round ${8+18*curve}px)`:`inset(0 ${clip}% 0 0 round ${8+18*curve}px)`,'important')
        page.style.setProperty('filter',`drop-shadow(${f?-2:2}px ${4+15*Math.sin(Math.PI*t)}px ${7+20*Math.sin(Math.PI*t)}px rgba(0,0,0,.26))`,'important')
      }else{
        const t=ease(Math.max(0,Math.min(1,(p-.55)/.45))),x=(f?96:-96)*(1-t),clip=Math.max(0,Math.min(88,(1-t)*92)),tilt=(f?1:-1)*(1+3*Math.sin(Math.PI*t)),lift=4+10*Math.sin(Math.PI*t)
        page.style.setProperty('opacity',String(t),'important')
        page.style.setProperty('transform',`translate3d(${x}px,${-lift*.12}px,${lift}px) rotateZ(${tilt}deg) scale(${1-.01*Math.sin(Math.PI*t)})`,'important')
        page.style.setProperty('clip-path',f?`inset(0 0 0 ${clip}% round ${8+18*curve}px)`:`inset(0 ${clip}% 0 0 round ${8+18*curve}px)`,'important')
        page.style.setProperty('filter',`drop-shadow(${f?-2:2}px ${4+15*Math.sin(Math.PI*t)}px ${7+20*Math.sin(Math.PI*t)}px rgba(0,0,0,.24))`,'important')
      }
      if(elapsed<TURN_MS)requestAnimationFrame(frame)
      else{page.style.removeProperty('transform');page.style.removeProperty('clip-path');page.style.removeProperty('filter');page.style.removeProperty('opacity');page.style.removeProperty('will-change');document.__hjTurnBusy=false;applyPageZoom()}
      return
    }
    if(!navigated&&elapsed>=mid){navigated=true;try{navigate()}catch{}}
    const travel=f?-105:105,x=travel*(p/.55),curl=Math.sin(Math.PI*Math.min(1,p/.9)),tilt=(f?-1:1)*(1.4+2.6*curl),lift=6+14*depth,scale=1-.012*curl
    page.style.transform=`translate3d(${x}px,${-lift*.16}px,${lift}px) rotateZ(${tilt}deg) scale(${scale})`
    page.style.filter=`brightness(${1-.10*curl}) drop-shadow(${f?-2:2}px ${5+18*depth}px ${8+24*depth}px rgba(0,0,0,.28))`
    page.style.clipPath=f?`inset(0 0 0 ${Math.max(0,Math.min(100,100*p-8*curl))}% round ${10+18*curl}px)`: `inset(0 ${Math.max(0,Math.min(100,100*p-8*curl))}% 0 0 round ${10+18*curl}px)`
    page.style.transformOrigin=f?'left center':'right center'
    made.shadow.style.opacity=String(.06+.72*depth);made.shadow.style.width=`${30+40*depth}%`;made.fold.style.opacity=String(.10+.78*depth);made.fold.style.transform=`scaleX(${1+.7*depth})`;made.edge.style.opacity=String(.08+.82*depth)
    if(elapsed<TURN_MS)requestAnimationFrame(frame)
    else{page.remove();document.__hjTurnBusy=false;applyPageZoom()}
  }
  requestAnimationFrame(frame)
}

function clickNav(dir){const n=document.querySelector('.reader-navigation');if(!n)return;const b=n.querySelectorAll(':scope > button'),x=dir==='next'?b[b.length-1]:b[0];if(!x||document.__hjTurnBusy)return;turn(dir,()=>{document.__hjTurnProgrammatic=true;try{x.click()}finally{setTimeout(()=>document.__hjTurnProgrammatic=false,0)}})}
function attachNav(){document.querySelectorAll('.reader-navigation > button').forEach((b,i,bs)=>{if(b.__hjTurnInterceptor)return;b.__hjTurnInterceptor=true;b.addEventListener('click',ev=>{if(document.__hjTurnProgrammatic||document.__hjTurnBusy)return;ev.preventDefault();ev.stopImmediatePropagation();turn(i===bs.length-1?'next':'prev',()=>{document.__hjTurnProgrammatic=true;try{b.click()}finally{setTimeout(()=>document.__hjTurnProgrammatic=false,0)}})},true)})}
function attachSwipe(d){if(!d||d.__hjRuntimeSwipeAttached)return;d.__hjRuntimeSwipeAttached=true;let sx=0,sy=0;d.addEventListener('touchstart',e=>{const t=e.changedTouches?.[0];if(t){sx=t.clientX;sy=t.clientY}},{passive:true});d.addEventListener('touchend',e=>{const t=e.changedTouches?.[0];if(!t)return;const dx=t.clientX-sx,dy=t.clientY-sy;if(Math.abs(dx)>=55&&Math.abs(dx)>Math.abs(dy)*1.18)clickNav(dx<0?'next':'prev')},{passive:true})}
function fixFrames(){document.querySelectorAll('.epub-reader iframe').forEach(f=>{const apply=()=>{try{forceEpubDocument(f.contentDocument);attachSwipe(f.contentDocument)}catch{}};apply();if(!f.__hjRuntimeFrameAttached){f.__hjRuntimeFrameAttached=true;f.addEventListener('load',apply)}})}
function fixInputs(){document.querySelectorAll('.reader-page-input').forEach(i=>{if(i.__hjInputFix)return;i.__hjInputFix=true;i.addEventListener('focus',()=>{try{i.select()}catch{}})})}
function fixSpeechState(){const s=window.speechSynthesis;if(!s||s.__hjStateFixed)return;s.__hjStateFixed=true;try{Object.defineProperties(s,{speaking:{configurable:true,get(){return Boolean(window.__hjSarvamActiveAudio)||Boolean(this.__hjNativeSpeaking)}},pending:{configurable:true,get(){return Boolean(window.__hjSarvamPending)}},paused:{configurable:true,get(){return Boolean(window.__hjSarvamPaused)}}})}catch{}}
function init(){injectReaderStyles();mountTools();applyPageZoom();fixFrames();fixInputs();attachNav();fixSpeechState();new MutationObserver(()=>{fixFrames();fixInputs();attachNav();mountTools();applyPageZoom();fixSpeechState()}).observe(document.body,{childList:true,subtree:true})}
if(typeof window!=='undefined'&&typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init()}
