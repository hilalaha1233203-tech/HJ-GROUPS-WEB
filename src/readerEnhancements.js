const STYLE_ID='hj-reader-runtime-enhancements'
const TURN_MS=900

function injectReaderStyles(){
  if(document.getElementById(STYLE_ID))return
  const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
.reader-body-full{position:relative!important;perspective:2200px!important;perspective-origin:50% 50%!important;transform-style:preserve-3d!important;touch-action:pan-y!important;overscroll-behavior:contain!important;isolation:isolate!important}
.reader-body-full .epub-reader,.reader-body-full .react-pdf__Page{transform-style:preserve-3d!important;will-change:transform,filter,clip-path!important;background:#fff!important}
.reader-body-full .epub-reader{backface-visibility:visible!important}
.reader-body-full .react-pdf__Page{backface-visibility:visible!important}
.reader-body-full .react-pdf__Page canvas{background:#fff!important}
.hj-book-turn{position:absolute!important;z-index:100000!important;pointer-events:none!important;overflow:hidden!important;transform-style:preserve-3d!important;background:#fff!important;backface-visibility:visible!important;box-shadow:0 8px 30px rgba(0,0,0,.18)!important}
.hj-book-turn.next{transform-origin:left center!important}.hj-book-turn.prev{transform-origin:right center!important}
.hj-book-turn::before{content:'';position:absolute;inset:0;z-index:20;pointer-events:none;background:linear-gradient(90deg,rgba(255,255,255,.18),rgba(0,0,0,.035) 24%,rgba(0,0,0,.24) 50%,rgba(255,255,255,.16) 72%,rgba(0,0,0,.015));opacity:.82}
.hj-book-turn::after{content:'';position:absolute;top:-8%;bottom:-8%;width:28%;z-index:21;pointer-events:none;filter:blur(8px);opacity:.9;background:linear-gradient(90deg,transparent,rgba(255,255,255,.82),rgba(0,0,0,.20),transparent)}
.hj-book-turn.next::after{left:0}.hj-book-turn.prev::after{right:0;transform:scaleX(-1)}
.hj-book-turn-shadow{position:absolute!important;top:-4%!important;bottom:-4%!important;width:42%!important;z-index:22!important;pointer-events:none!important;opacity:0!important;filter:blur(13px)!important}
.hj-book-turn.next .hj-book-turn-shadow{right:-2%!important;background:linear-gradient(90deg,transparent,rgba(0,0,0,.48),rgba(0,0,0,.03))!important}.hj-book-turn.prev .hj-book-turn-shadow{left:-2%!important;background:linear-gradient(270deg,transparent,rgba(0,0,0,.48),rgba(0,0,0,.03))!important}
.hj-book-fold{position:absolute!important;top:-5%!important;bottom:-5%!important;width:13%!important;z-index:23!important;pointer-events:none!important;opacity:0!important;filter:blur(2px)!important;background:linear-gradient(90deg,transparent,rgba(255,255,255,.78),rgba(0,0,0,.24),rgba(255,255,255,.12),transparent)!important}
.hj-book-turn.next .hj-book-fold{left:0!important}.hj-book-turn.prev .hj-book-fold{right:0!important;transform:scaleX(-1)!important}
.hj-book-edge{position:absolute!important;top:-4%!important;bottom:-4%!important;width:3px!important;z-index:24!important;pointer-events:none!important;opacity:0!important;background:rgba(255,255,255,.96)!important;filter:blur(1px)!important;border-radius:50%!important}
.hj-book-turn.next .hj-book-edge{left:-1px!important}.hj-book-turn.prev .hj-book-edge{right:-1px!important}
.reader-page-input::placeholder{color:#777c96!important;opacity:1!important}
@media(max-width:700px){.reader-body-full{perspective:1500px!important}.hj-book-turn-shadow{filter:blur(9px)!important}}
`;
  document.head.appendChild(s)
}

function forceEpubDocument(d){
  if(!d)return
  try{const root=d.documentElement,body=d.body;root?.style.setProperty('background','#fff','important');root?.style.setProperty('color','#111','important');body?.style.setProperty('background','#fff','important');body?.style.setProperty('color','#111','important');body?.style.setProperty('margin','0','important');body?.style.setProperty('min-height','100%','important');body?.style.setProperty('overflow-x','hidden','important');if(!d.getElementById('hj-epub-force-light-runtime')){const s=d.createElement('style');s.id='hj-epub-force-light-runtime';s.textContent='html,body{background:#fff!important;color:#111!important}body{margin:0!important;min-height:100%!important;overflow-x:hidden!important}::selection{background:rgba(124,131,255,.25)!important;color:#111!important}img,svg,video{max-width:100%!important;height:auto!important}';(d.head||root).appendChild(s)}}catch{}
}
function host(){return document.querySelector('.reader-body-full')||document.querySelector('.reader-modal')||document.body}
function surface(){return document.querySelector('.epub-reader')||document.querySelector('.react-pdf__Page')}

function makeTurnPage(source,dir){
  const h=host(),r=source.getBoundingClientRect(),hr=h.getBoundingClientRect();if(getComputedStyle(h).position==='static')h.style.position='relative'
  const live=source.classList.contains('epub-reader')
  if(live){
    source.style.setProperty('transform-origin',dir==='next'?'left center':'right center','important')
    source.style.setProperty('transform-style','preserve-3d','important')
    source.style.setProperty('backface-visibility','visible','important')
    source.style.setProperty('will-change','transform,filter,clip-path','important')
    source.style.setProperty('background','#fff','important')
    return{page:source,fold:null,shadow:null,edge:null,live:true}
  }
  const page=document.createElement('div');page.className=`hj-book-turn ${dir}`;page.style.cssText=`left:${r.left-hr.left}px;top:${r.top-hr.top}px;width:${r.width}px;height:${r.height}px;background:#fff`
  const clone=source.cloneNode(true);clone.style.cssText='position:absolute!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;transform:none!important;overflow:hidden!important;backface-visibility:visible!important;pointer-events:none!important;background:#fff!important';clone.querySelectorAll?.('canvas').forEach(c=>{c.style.maxWidth='100%';c.style.height='auto';c.style.background='#fff'})
  const fold=document.createElement('div'),shadow=document.createElement('div'),edge=document.createElement('div');fold.className='hj-book-fold';shadow.className='hj-book-turn-shadow';edge.className='hj-book-edge';page.append(clone,fold,shadow,edge);h.appendChild(page);return{page,fold,shadow,edge,live:false}
}

function clearLivePage(page){try{['transform','filter','transform-origin','transform-style','backface-visibility','will-change','background'].forEach(x=>page?.style.removeProperty(x))}catch{}}

function turn(dir,navigate){
  if(document.__hjTurnBusy)return
  const old=surface();if(!old){navigate();return}
  document.__hjTurnBusy=true;const f=dir==='next',made=makeTurnPage(old,dir),page=made.page,start=performance.now(),mid=TURN_MS*.46;let navigated=false
  const ease=t=>1-Math.pow(1-t,4)
  const frame=now=>{
    const elapsed=now-start,p=Math.max(0,Math.min(1,elapsed/TURN_MS)),depth=Math.sin(Math.PI*p)
    if(!navigated&&elapsed>=mid){navigated=true;try{navigate()}catch{}}
    if(elapsed<mid){
      const t=ease(Math.max(0,Math.min(1,elapsed/mid))),angle=(f?-176:176)*t,curve=Math.sin(Math.PI*t),lift=20*curve,bend=(f?-4.2:4.2)*curve,skew=(f?-1:1)*2.2*curve
      page.style.transform=`translate3d(0,0,${lift}px) rotateY(${angle}deg) rotateZ(${bend}deg) skewY(${skew}deg) scale(${1-.018*curve})`
      page.style.filter=`brightness(${1-.18*curve}) contrast(${1+.045*curve}) drop-shadow(${f?-2:2}px ${4+16*curve}px ${7+22*curve}px rgba(0,0,0,.30))`
    }else{
      const t=ease(Math.max(0,Math.min(1,(elapsed-mid)/(TURN_MS-mid)))),angle=f?-176+176*t:176-176*t,curve=Math.sin(Math.PI*(1-t)),lift=20*curve,bend=(f?4.2:-4.2)*curve,skew=(f?1:-1)*2.2*curve
      page.style.transform=`translate3d(0,0,${lift}px) rotateY(${angle}deg) rotateZ(${bend}deg) skewY(${skew}deg) scale(${1-.012*curve})`
      page.style.filter=`brightness(${.82+.18*t}) contrast(${1+.03*curve}) drop-shadow(${f?'':'-'}${3+13*(1-t)}px ${2+7*(1-t)}px ${8+18*(1-t)}px rgba(0,0,0,.24))`
    }
    if(made.live){
      const curl=Math.sin(Math.PI*p)
      const side=Math.min(9,curl*9)
      page.style.setProperty('border-radius',`${f?0:side/2}% ${f?side/2:0}% ${f?side/2:0}% ${f?0:side/2}%`,'important')
      page.style.setProperty('clip-path',`inset(0 ${f?0:side}% 0 ${f?side:0}% round ${1+curl*12}px)`,'important')
    }else{
      made.shadow.style.opacity=String(.05+.76*depth);made.shadow.style.width=`${28+42*depth}%`;made.fold.style.opacity=String(.08+.82*depth);made.fold.style.transform=`scaleX(${1+.95*depth})`;made.edge.style.opacity=String(.08+.84*depth)
    }
    if(elapsed<TURN_MS)requestAnimationFrame(frame)
    else{if(made.live){clearLivePage(page);page.style.removeProperty('border-radius');page.style.removeProperty('clip-path')}else page.remove();document.__hjTurnBusy=false}
  }
  requestAnimationFrame(frame)
}

function clickNav(dir){const n=document.querySelector('.reader-navigation');if(!n)return;const b=n.querySelectorAll(':scope > button'),x=dir==='next'?b[b.length-1]:b[0];if(!x||document.__hjTurnBusy)return;turn(dir,()=>{document.__hjTurnProgrammatic=true;try{x.click()}finally{setTimeout(()=>document.__hjTurnProgrammatic=false,0)}})}
function attachNav(){document.querySelectorAll('.reader-navigation > button').forEach((b,i,bs)=>{if(b.__hjTurnInterceptor)return;b.__hjTurnInterceptor=true;b.addEventListener('click',ev=>{if(document.__hjTurnProgrammatic||document.__hjTurnBusy)return;ev.preventDefault();ev.stopImmediatePropagation();turn(i===bs.length-1?'next':'prev',()=>{document.__hjTurnProgrammatic=true;try{b.click()}finally{setTimeout(()=>document.__hjTurnProgrammatic=false,0)}})},true)})}
function attachSwipe(d){if(!d||d.__hjRuntimeSwipeAttached)return;d.__hjRuntimeSwipeAttached=true;let sx=0,sy=0;d.addEventListener('touchstart',e=>{const t=e.changedTouches?.[0];if(t){sx=t.clientX;sy=t.clientY}},{passive:true});d.addEventListener('touchend',e=>{const t=e.changedTouches?.[0];if(!t)return;const dx=t.clientX-sx,dy=t.clientY-sy;if(Math.abs(dx)>=55&&Math.abs(dx)>Math.abs(dy)*1.18)clickNav(dx<0?'next':'prev')},{passive:true})}
function fixFrames(){document.querySelectorAll('.epub-reader iframe').forEach(f=>{const apply=()=>{try{forceEpubDocument(f.contentDocument);attachSwipe(f.contentDocument)}catch{}};apply();if(!f.__hjRuntimeFrameAttached){f.__hjRuntimeFrameAttached=true;f.addEventListener('load',apply)}})}
function fixInputs(){document.querySelectorAll('.reader-page-input').forEach(i=>{if(i.__hjInputFix)return;i.__hjInputFix=true;i.addEventListener('focus',()=>{try{i.select()}catch{}})})}
function init(){injectReaderStyles();fixFrames();fixInputs();attachNav();new MutationObserver(()=>{fixFrames();fixInputs();attachNav()}).observe(document.body,{childList:true,subtree:true})}
if(typeof window!=='undefined'&&typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init()}
