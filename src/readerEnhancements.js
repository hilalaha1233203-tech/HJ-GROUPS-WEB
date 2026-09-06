const STYLE_ID='hj-reader-runtime-enhancements-v4'
const TTS_KEY='hj_tts_settings_v2'
const PAPER_KEY='hj_reader_paper_v3'
const PAPER_FORMATS={auto:{label:'Auto',ratio:null},a4:{label:'A4',ratio:210/297},a3:{label:'A3',ratio:297/420},letter:{label:'Letter',ratio:8.5/11},legal:{label:'Legal',ratio:8.5/14},b5:{label:'B5',ratio:176/250}}

const getTtsSettings=()=>{try{return {...{speaker:'ishita',pace:.92,temperature:.72},...JSON.parse(localStorage.getItem(TTS_KEY)||'{}')}}catch{return {speaker:'ishita',pace:.92,temperature:.72}}}
const saveTtsSettings=v=>{try{localStorage.setItem(TTS_KEY,JSON.stringify(v));window.dispatchEvent(new CustomEvent('hj-tts-settings',{detail:v}))}catch{}}
const getPaper=()=>{try{const v=localStorage.getItem(PAPER_KEY)||'auto';return PAPER_FORMATS[v]?v:'auto'}catch{return 'auto'}}
const savePaper=v=>{try{localStorage.setItem(PAPER_KEY,v)}catch{}}

function injectReaderStyles(){
 if(document.getElementById(STYLE_ID))return
 const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
 .reader-body-full{position:relative!important;isolation:isolate!important;background:#fff!important;overflow:hidden!important;touch-action:pan-y!important;overscroll-behavior:contain!important}
.reader-body-full .epub-reader,.reader-body-full .react-pdf__Page{background:#fff!important;backface-visibility:visible!important;transform:none!important;filter:none!important}
.reader-body-full .epub-reader iframe{background:#fff!important;transform:none!important;filter:none!important}
.reader-body-full .react-pdf__Page canvas{background:#fff!important;display:block!important;width:100%!important;height:auto!important}
.reader-body-full[data-paper-format="a4"] .react-pdf__Page{width:min(88vw,690px)!important}
.reader-body-full[data-paper-format="a3"] .react-pdf__Page{width:min(92vw,820px)!important}
.reader-body-full[data-paper-format="letter"] .react-pdf__Page{width:min(88vw,670px)!important}
.reader-body-full[data-paper-format="legal"] .react-pdf__Page{width:min(86vw,610px)!important}
.reader-body-full[data-paper-format="b5"] .react-pdf__Page{width:min(88vw,650px)!important}
.hj-page-transition{position:absolute!important;z-index:99990!important;inset:0!important;pointer-events:none!important;overflow:hidden!important;opacity:0!important;background:linear-gradient(90deg,#fff 0%,#fbfaf2 48%,#eee9dc 50%,#fff 52%,#fbfaf2 100%)!important;transform-origin:50% 50%!important;will-change:transform,clip-path,opacity!important;box-shadow:0 16px 55px rgba(0,0,0,.22)!important;transition:opacity 90ms linear,transform 760ms cubic-bezier(.16,.76,.18,1),clip-path 760ms cubic-bezier(.16,.76,.18,1)!important}
.hj-page-transition.show.next{opacity:1!important;transform:perspective(1800px) rotateY(-7deg) translateX(-8%)!important;clip-path:polygon(0 0,78% 0,100% 6%,96% 50%,100% 94%,78% 100%,0 100%)!important}
.hj-page-transition.show.prev{opacity:1!important;transform:perspective(1800px) rotateY(7deg) translateX(8%)!important;clip-path:polygon(22% 0,100% 0,100% 100%,22% 100%,0 94%,4% 50%,0 6%)!important}
.hj-page-transition::before{content:'';position:absolute;inset:-2%;background:linear-gradient(90deg,rgba(255,255,255,.98) 0%,rgba(255,255,255,.96) 40%,rgba(245,242,232,.92) 47%,rgba(70,65,55,.28) 50%,rgba(255,255,255,.86) 53%,rgba(247,244,235,.98) 100%);box-shadow:inset 0 0 28px rgba(0,0,0,.16);transform-origin:50% 50%;animation-duration:760ms;animation-timing-function:cubic-bezier(.16,.76,.18,1);animation-fill-mode:both}
.hj-page-transition.show.next::before{animation-name:hjBookPageNext}
.hj-page-transition.show.prev::before{animation-name:hjBookPagePrev}
.hj-page-transition::after{content:'';position:absolute;top:0;bottom:0;width:22%;filter:blur(14px);opacity:.6;background:linear-gradient(90deg,transparent,rgba(0,0,0,.25),transparent)}
.hj-page-transition.next::after{right:2%}.hj-page-transition.prev::after{left:2%;transform:scaleX(-1)}
@keyframes hjBookPageNext{0%{transform:rotateY(0) scaleX(1);border-radius:0;filter:brightness(1)}35%{transform:rotateY(-48deg) scaleX(.84);border-radius:0 18% 18% 0;filter:brightness(.96)}68%{transform:rotateY(-82deg) scaleX(.42);border-radius:0 32% 32% 0;filter:brightness(.9)}100%{transform:rotateY(-110deg) scaleX(.02);border-radius:0 50% 50% 0;filter:brightness(.82)}}
@keyframes hjBookPagePrev{0%{transform:rotateY(0) scaleX(1);border-radius:0}35%{transform:rotateY(48deg) scaleX(.84);border-radius:18% 0 0 18%}68%{transform:rotateY(82deg) scaleX(.42);border-radius:32% 0 0 32%}100%{transform:rotateY(110deg) scaleX(.02);border-radius:50% 0 0 50%}}
.hj-reader-tools{position:fixed;right:14px;bottom:14px;z-index:100050;display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid rgba(124,131,255,.28);border-radius:14px;background:rgba(14,16,28,.96);backdrop-filter:blur(14px);box-shadow:0 10px 30px rgba(0,0,0,.28);font:500 12px/1.2 system-ui,sans-serif;color:#e9ebff}
.hj-reader-tools select{height:32px;border:1px solid rgba(255,255,255,.13);border-radius:9px;background:#1b1e31;color:#eef0ff;padding:0 10px;cursor:pointer;min-width:105px}
.hj-paper-label{color:#9ea5c7;font-size:11px}
.hj-tts-launcher{position:fixed;left:14px;bottom:14px;z-index:100052;width:42px;height:42px;border:1px solid rgba(124,131,255,.35);border-radius:50%;background:rgba(14,16,28,.97);color:#fff;font-size:18px;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.3)}
.hj-tts-launcher.active{border-color:#7c83ff;box-shadow:0 0 0 3px rgba(124,131,255,.12),0 10px 30px rgba(0,0,0,.32)}
.hj-tts-panel{position:fixed;left:14px;bottom:64px;z-index:100053;width:280px;padding:15px;border:1px solid rgba(124,131,255,.3);border-radius:16px;background:rgba(14,16,28,.98);backdrop-filter:blur(18px);box-shadow:0 16px 42px rgba(0,0,0,.4);font:500 12px/1.35 system-ui,sans-serif;color:#eef0ff;display:none}
.hj-tts-panel.open{display:block}.hj-tts-title{font-size:15px;font-weight:700;margin-bottom:12px}.hj-tts-row{display:grid;grid-template-columns:72px 1fr 44px;align-items:center;gap:8px;margin:11px 0}.hj-tts-row label{color:#aeb3d2}.hj-tts-row select{width:100%;height:30px;border:1px solid rgba(255,255,255,.13);border-radius:8px;background:#1b1e31;color:#eef0ff;padding:0 7px}.hj-tts-row input{width:100%;accent-color:#7c83ff}.hj-tts-value{text-align:right;color:#fff}.hj-tts-note{font-size:10px;color:#858ba9;margin-top:10px}
@media(max-width:700px){.hj-reader-tools{right:8px;bottom:8px;max-width:calc(100vw - 58px);overflow-x:auto}.hj-tts-launcher{left:8px;bottom:8px}.hj-tts-panel{left:8px;bottom:58px;width:min(280px,calc(100vw - 16px))}}
`;
 document.head.appendChild(s)
}

function forceEpubDocument(d){if(!d)return;try{const root=d.documentElement,body=d.body;root?.style.setProperty('background','#fff','important');root?.style.setProperty('color','#111','important');body?.style.setProperty('background','#fff','important');body?.style.setProperty('color','#111','important');body?.style.setProperty('margin','0','important');body?.style.setProperty('min-height','100%','important');body?.style.setProperty('overflow-x','hidden','important');if(!d.getElementById('hj-epub-force-light-runtime')){const x=d.createElement('style');x.id='hj-epub-force-light-runtime';x.textContent='html,body{background:#fff!important;color:#111!important}body{margin:0!important;min-height:100%!important;overflow-x:hidden!important}img,svg,video{max-width:100%!important;height:auto!important}';(d.head||root).appendChild(x)}}catch{}}
function host(){return document.querySelector('.reader-body-full')||document.querySelector('.reader-modal')||document.body}
function surface(){return document.querySelector('.epub-reader')||document.querySelector('.react-pdf__Page')}

function applyPaperFormat(){
 const h=document.querySelector('.reader-body-full');if(!h)return
 const key=getPaper(),fmt=PAPER_FORMATS[key];h.dataset.paperFormat=key
 const s=surface();if(!s)return
 s.style.setProperty('background','#fff','important');s.style.setProperty('box-shadow','0 18px 55px rgba(0,0,0,.30)','important');s.style.setProperty('border-radius','2px','important')
 if(!fmt.ratio){s.style.removeProperty('width');s.style.removeProperty('height');s.style.removeProperty('margin');return}
 const maxW=key==='a3'?'min(92vw,820px)':key==='a4'?'min(88vw,690px)':key==='letter'?'min(88vw,670px)':key==='legal'?'min(86vw,610px)':'min(88vw,650px)'
 if(s.classList.contains('epub-reader')){s.style.setProperty('width',maxW,'important');s.style.setProperty('height',`min(84vh,calc(${maxW} / ${fmt.ratio}))`,'important');s.style.setProperty('margin','0 auto','important')}
 h.style.setProperty('--hj-paper-ratio',String(fmt.ratio));h.style.setProperty('--hj-paper-width',maxW)
}

function mountControls(){
 if(!document.querySelector('.reader-body-full')||document.querySelector('.hj-reader-tools'))return
 const tools=document.createElement('div');tools.className='hj-reader-tools';tools.innerHTML=`<span class="hj-paper-label">Paper</span><select data-hj-paper aria-label="Paper format"><option value="auto">Auto</option><option value="a4">A4</option><option value="a3">A3</option><option value="letter">Letter</option><option value="legal">Legal</option><option value="b5">B5</option></select>`;document.body.appendChild(tools)
 const sel=tools.querySelector('[data-hj-paper]');sel.value=getPaper();sel.addEventListener('change',()=>{savePaper(sel.value);applyPaperFormat();window.dispatchEvent(new CustomEvent('hj-reader-paper-change',{detail:sel.value}))})
 const launch=document.createElement('button');launch.type='button';launch.className='hj-tts-launcher';launch.textContent='🔊';launch.setAttribute('aria-label','TTS settings');document.body.appendChild(launch)
 const panel=document.createElement('div');panel.className='hj-tts-panel';panel.innerHTML=`<div class="hj-tts-title">Tamil Read Aloud</div><div class="hj-tts-row"><label>Voice</label><select data-hj-voice><option value="ishita">Ishita</option><option value="priya">Priya</option><option value="ritu">Ritu</option><option value="shreya">Shreya</option><option value="roopa">Roopa</option><option value="shubh">Shubh</option><option value="aditya">Aditya</option><option value="rahul">Rahul</option><option value="vijay">Vijay</option></select><span></span></div><div class="hj-tts-row"><label>Speed</label><input data-hj-pace type="range" min="0.65" max="1.25" step="0.01"><span class="hj-tts-value" data-hj-pace-value>0.92x</span></div><div class="hj-tts-row"><label>Expression</label><input data-hj-temp type="range" min="0.35" max="1" step="0.01"><span class="hj-tts-value" data-hj-temp-value>0.72</span></div><div class="hj-tts-note">Sarvam Bulbul v3 settings apply to the next narration chunk.</div>`;document.body.appendChild(panel)
 const settings=getTtsSettings(),voice=panel.querySelector('[data-hj-voice]'),pace=panel.querySelector('[data-hj-pace]'),temp=panel.querySelector('[data-hj-temp]'),pv=panel.querySelector('[data-hj-pace-value]'),tv=panel.querySelector('[data-hj-temp-value]');voice.value=settings.speaker;pace.value=settings.pace;temp.value=settings.temperature;pv.textContent=`${Number(pace.value).toFixed(2)}x`;tv.textContent=Number(temp.value).toFixed(2)
 const update=()=>{const v={speaker:voice.value,pace:Number(pace.value),temperature:Number(temp.value)};saveTtsSettings(v);pv.textContent=`${v.pace.toFixed(2)}x`;tv.textContent=v.temperature.toFixed(2)};voice.addEventListener('change',update);pace.addEventListener('input',update);temp.addEventListener('input',update)
 launch.addEventListener('click',()=>{panel.classList.toggle('open');launch.classList.toggle('active',panel.classList.contains('open'))})
}

function transitionOverlay(dir){const h=host();if(!h)return;const old=h.querySelector('.hj-page-transition');if(old)old.remove();const o=document.createElement('div');o.className=`hj-page-transition ${dir}`;h.appendChild(o);requestAnimationFrame(()=>o.classList.add('show'));setTimeout(()=>o.remove(),500)}
function waitForEpubPaint(done){const start=performance.now();const check=()=>{const f=document.querySelector('.epub-reader iframe');let ready=false;try{ready=!!(f&&f.contentDocument&&f.contentDocument.body&&f.contentDocument.body.childNodes.length)}catch{}if(ready||performance.now()-start>1400){requestAnimationFrame(()=>requestAnimationFrame(done));return}requestAnimationFrame(check)};check()}
function transitionNavigation(dir,action){if(document.__hjTurnBusy)return;document.__hjTurnBusy=true;const s=surface();if(!s){document.__hjTurnBusy=false;action();return}transitionOverlay(dir);try{action()}catch{}const finish=()=>{applyPaperFormat();document.__hjTurnBusy=false};if(s.classList.contains('epub-reader'))waitForEpubPaint(finish);else setTimeout(finish,120)}
function attachNav(){document.querySelectorAll('.reader-navigation > button').forEach((b,i,bs)=>{if(b.__hjStableTurn)return;b.__hjStableTurn=true;b.addEventListener('click',ev=>{if(document.__hjTurnProgrammatic||document.__hjTurnBusy)return;ev.preventDefault();ev.stopImmediatePropagation();const dir=i===bs.length-1?'next':'prev';transitionNavigation(dir,()=>{document.__hjTurnProgrammatic=true;try{b.click()}finally{setTimeout(()=>document.__hjTurnProgrammatic=false,0)}})},true)})}
function clickNav(dir){const n=document.querySelector('.reader-navigation');if(!n)return;const b=n.querySelectorAll(':scope > button'),x=dir==='next'?b[b.length-1]:b[0];if(x&&!document.__hjTurnBusy)transitionNavigation(dir,()=>{document.__hjTurnProgrammatic=true;try{x.click()}finally{setTimeout(()=>document.__hjTurnProgrammatic=false,0)}})}
function attachSwipe(d){
 if(!d||d.__hjRuntimeSwipeAttached)return
 d.__hjRuntimeSwipeAttached=true
 let sx=0,sy=0,active=false
 const start=e=>{const p=e.touches?.[0]||e.changedTouches?.[0]||e;if(!p)return;sx=p.clientX;sy=p.clientY;active=true}
 const end=e=>{if(!active)return;active=false;const p=e.changedTouches?.[0]||e;if(!p)return;const dx=p.clientX-sx,dy=p.clientY-sy;if(Math.abs(dx)>=45&&Math.abs(dx)>Math.abs(dy)*1.12){e.preventDefault?.();e.stopPropagation?.();clickNav(dx<0?'next':'prev')}}
 d.addEventListener('touchstart',start,{passive:true})
 d.addEventListener('touchend',end,{passive:false})
 d.addEventListener('pointerdown',start,{passive:true})
 d.addEventListener('pointerup',end,{passive:false})
}
function fixFrames(){document.querySelectorAll('.epub-reader iframe').forEach(f=>{const apply=()=>{try{forceEpubDocument(f.contentDocument);attachSwipe(f.contentDocument)}catch{}};apply();if(!f.__hjRuntimeFrameAttached){f.__hjRuntimeFrameAttached=true;f.addEventListener('load',apply)}})}
function fixInputs(){document.querySelectorAll('.reader-page-input').forEach(i=>{if(i.__hjInputFix)return;i.__hjInputFix=true;i.addEventListener('focus',()=>{try{i.select()}catch{}})})}
function fixSpeechState(){const s=window.speechSynthesis;if(!s||s.__hjStateFixed)return;s.__hjStateFixed=true;try{Object.defineProperties(s,{speaking:{configurable:true,get(){return Boolean(window.__hjSarvamActiveAudio)||Boolean(this.__hjNativeSpeaking)}},pending:{configurable:true,get(){return Boolean(window.__hjSarvamPending)}},paused:{configurable:true,get(){return Boolean(window.__hjSarvamPaused)}}})}catch{}}
function injectRevealKeyframes(){if(document.getElementById('hj-reader-keyframes-v4'))return;const s=document.createElement('style');s.id='hj-reader-keyframes-v4';s.textContent=`@keyframes hjReaderRevealNext{from{opacity:.82;transform:translate3d(20px,0,0) rotateZ(.35deg);filter:drop-shadow(-9px 8px 16px rgba(0,0,0,.14))}to{opacity:1;transform:none;filter:none}}@keyframes hjReaderRevealPrev{from{opacity:.82;transform:translate3d(-20px,0,0) rotateZ(-.35deg);filter:drop-shadow(9px 8px 16px rgba(0,0,0,.14))}to{opacity:1;transform:none;filter:none}}`;document.head.appendChild(s)}
function init(){injectReaderStyles();injectRevealKeyframes();mountControls();applyPaperFormat();fixFrames();fixInputs();attachNav();fixSpeechState();new MutationObserver(()=>{fixFrames();fixInputs();attachNav();mountControls();applyPaperFormat();fixSpeechState()}).observe(document.body,{childList:true,subtree:true})}
if(typeof window!=='undefined'&&typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init()}
