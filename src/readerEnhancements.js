const STYLE_ID='hj-reader-runtime-enhancements'
const TURN_MS=1250

function injectReaderStyles(){
  if(document.getElementById(STYLE_ID))return
  const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
.reader-body-full{position:relative!important;perspective:1900px!important;perspective-origin:50% 48%!important;transform-style:preserve-3d!important;touch-action:pan-y!important;overscroll-behavior:contain!important;isolation:isolate!important}
.reader-body-full .epub-reader,.reader-body-full .react-pdf__Page{transform-style:preserve-3d!important;backface-visibility:hidden!important;will-change:transform,filter,box-shadow!important}
.reader-body-full .react-pdf__Page{background:#fff!important}.epub-reader,.epub-reader iframe{background:#fff!important}.reader-body-full .react-pdf__Page canvas{background:#fff!important}
.hj-book-turn{position:absolute!important;z-index:100000!important;pointer-events:none!important;overflow:hidden!important;transform-style:preserve-3d!important;background:#fff!important;backface-visibility:hidden!important;border-radius:1px!important;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 20px 48px rgba(0,0,0,.30)!important}
.hj-book-turn.next{transform-origin:left center!important}.hj-book-turn.prev{transform-origin:right center!important}
.hj-book-turn::before{content:'';position:absolute;inset:0;z-index:3;pointer-events:none;background:linear-gradient(90deg,rgba(255,255,255,.12),rgba(0,0,0,.03) 28%,rgba(0,0,0,.24) 53%,rgba(255,255,255,.10) 72%,rgba(0,0,0,.02));opacity:.78}
.hj-book-turn.next::after,.hj-book-turn.prev::after{content:'';position:absolute;top:-4%;bottom:-4%;width:34%;z-index:4;pointer-events:none;filter:blur(7px);opacity:.85;background:linear-gradient(90deg,transparent,rgba(255,255,255,.72),rgba(0,0,0,.22),transparent)}
.hj-book-turn.next::after{left:0}.hj-book-turn.prev::after{right:0;transform:scaleX(-1)}
.hj-book-turn-shadow{position:absolute!important;top:-3%!important;bottom:-3%!important;width:44%!important;z-index:5!important;pointer-events:none!important;opacity:0!important;filter:blur(12px)!important}
.hj-book-turn.next .hj-book-turn-shadow{right:-2%!important;background:linear-gradient(90deg,transparent,rgba(0,0,0,.52),rgba(0,0,0,.04))!important}.hj-book-turn.prev .hj-book-turn-shadow{left:-2%!important;background:linear-gradient(270deg,transparent,rgba(0,0,0,.52),rgba(0,0,0,.04))!important}
.hj-book-fold{position:absolute!important;top:-4%!important;bottom:-4%!important;width:11%!important;z-index:6!important;pointer-events:none!important;opacity:0!important;filter:blur(2px)!important;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.82),rgba(0,0,0,.25),rgba(255,255,255,.05),transparent)!important}
.hj-book-turn.next .hj-book-fold{left:0!important}.hj-book-turn.prev .hj-book-fold{right:0!important;transform:scaleX(-1)!important}
.hj-book-edge{position:absolute!important;top:-3%!important;bottom:-3%!important;width:4px!important;z-index:7!important;pointer-events:none!important;opacity:0!important;background:rgba(255,255,255,.92)!important;filter:blur(1px)!important;border-radius:50%!important}
.hj-book-turn.next .hj-book-edge{left:-1px!important}.hj-book-turn.prev .hj-book-edge{right:-1px!important}
.reader-page-input::placeholder{color:#777c96!important;opacity:1!important}
@media(max-width:700px){.reader-body-full{perspective:1350px!important}.hj-book-turn-shadow{filter:blur(8px)!important}}
`;
  document.head.appendChild(s)
}

function forceEpubDocument(d){
  if(!d)return
  try{const root=d.documentElement,body=d.body;root?.style.setProperty('background','#fff','important');root?.style.setProperty('color','#111','important');body?.style.setProperty('background','#fff','important');body?.style.setProperty('color','#111','important');body?.style.setProperty('margin','0','important');body?.style.setProperty('min-height','100%','important');body?.style.setProperty('overflow-x','hidden','important');if(!d.getElementById('hj-epub-force-light-runtime')){const s=d.createElement('style');s.id='hj-epub-force-light-runtime';s.textContent='html,body{background:#fff!important;color:#111!important}body{margin:0!important;min-height:100%!important;overflow-x:hidden!important}body::selection{background:rgba(124,131,255,.25)!important;color:#111!important}img,svg,video{max-width:100%!important;height:auto!important}';(d.head||root).appendChild(s)}}catch{}
}
function host(){return document.querySelector('.reader-body-full')||document.querySelector('.reader-modal')||document.body}
function surface(){return document.querySelector('.epub-reader')||document.querySelector('.react-pdf__Page')}

function makeTurnPage(source,dir){
  const h=host(),r=source.getBoundingClientRect(),hr=h.getBoundingClientRect();if(getComputedStyle(h).position==='static')h.style.position='relative'
  const live=source.classList.contains('epub-reader')
  if(live){
    source.style.setProperty('transform-origin',dir==='next'?'left center':'right center','important')
    source.style.setProperty('transform-style','preserve-3d','important')
    source.style.setProperty('backface-visibility','hidden','important')
    source.style.setProperty('will-change','transform,filter','important')
    return{page:source,fold:null,shadow:null,edge:null,live:true}
  }
  const page=document.createElement('div');page.className=`hj-book-turn ${dir}`;page.style.cssText=`left:${r.left-hr.left}px;top:${r.top-hr.top}px;width:${r.width}px;height:${r.height}px`
  const clone=source.cloneNode(true);clone.style.cssText='position:absolute!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;transform:none!important;overflow:hidden!important;backface-visibility:hidden!important;pointer-events:none!important';clone.querySelectorAll?.('canvas').forEach(c=>{c.style.maxWidth='100%';c.style.height='auto'})
  const fold=document.createElement('div'),shadow=document.createElement('div'),edge=document.createElement('div');fold.className='hj-book-fold';shadow.className='hj-book-turn-shadow';edge.className='hj-book-edge';page.append(clone,fold,shadow,edge);h.appendChild(page);return{page,fold,shadow,edge,live:false}
}

function clearLivePage(page){try{['transform','filter','transform-origin','transform-style','backface-visibility','will-change'].forEach(x=>page?.style.removeProperty(x))}catch{}}

function turn(dir,navigate){
  if(document.__hjTurnBusy)return
  const old=surface();if(!old){navigate();return}
  document.__hjTurnBusy=true;const f=dir==='next',made=makeTurnPage(old,dir),page=made.page,start=performance.now(),mid=TURN_MS*.48;let navigated=false
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2
  const frame=now=>{
    const elapsed=now-start,p=Math.max(0,Math.min(1,elapsed/TURN_MS)),depth=Math.sin(Math.PI*p)
    if(!navigated&&elapsed>=mid){navigated=true;try{navigate()}catch{}}
    if(elapsed<mid){
      const t=ease(Math.max(0,Math.min(1,elapsed/mid))),angle=(f?-178:178)*t,curve=Math.sin(Math.PI*t),lift=16*curve,bend=(f?-3.8:3.8)*curve
      page.style.transform=`translateZ(${lift}px) rotateY(${angle}deg) rotateZ(${bend}deg) scale(${1-.012*curve})`
      page.style.filter=`brightness(${1-.22*curve}) contrast(${1+.04*curve}) drop-shadow(${f?-2:2}${5+14*curve}px ${2+5*curve}px ${8+18*curve}px rgba(0,0,0,.34))`
    }else{
      const t=ease(Math.max(0,Math.min(1,(elapsed-mid)/(TURN_MS-mid)))),angle=f?-178+178*t:178-178*t,curve=Math.sin(Math.PI*(1-t)),lift=16*curve,bend=(f?3.8:-3.8)*curve
      page.style.transform=`translateZ(${lift}px rotateY(${angle}deg) rotateZ(${bend}deg) scale(${1-.008*curve})`
      page.style.filter=`brightness(${.76+.24*t}) contrast(${1+.025*curve}) drop-shadow(${f?'':'-'}${3+12*(1-t)}px ${2+5*(1-t)}px ${8+16*(1-t)}px rgba(0,0,0,.28))`
    }
    if(made.live){
      const fold=Math.sin(Math.PI*p)
      page.style.setProperty('border-radius',`${f?0:3}% ${f?3:0}% ${f?3:0}% ${f?0:3}%`,'important')
      page.style.setProperty('clip-path',`inset(0 ${f?0:Math.min(7,fold*7)}% 0 ${f?Math.min(7,fold*7):0}% round ${2+fold*10}px)`,'important')
    }else{
      made.shadow.style.opacity=String(.06+.78*depth);made.shadow.style.width=`${30+38*depth}%`;made.fold.style.opacity=String(.10+.78*depth);made.fold.style.transform=`scaleX(${1+.8*depth})`;made.edge.style.opacity=String(.10+.78*depth)
    }
    if(elapsed<TURN_MS)requestAnimationFrame(frame)
    else{if(made.live){clearLivePage(page);page.style.removeProperty('border-radius');page.style.removeProperty('clip-path')}else page.remove();document.__hjTurnBusy=false}
  }
  requestAnimationFrame(frame)
}

function clickNav(dir){const n=document.querySelector('.reader-navigation');if(!n)return;const b=n.querySelectorAll(':scope > button'),x=dir==='next'?b[b.length-1]:b[0];if(!x||document.__hjTurnBusy)return;turn(dir,()=>{document.__hjTurnProgrammatic=true;try{x.click()}finally{setTimeout(()=>document.__hjTurnProgrammatic=false,0)}})}
function attachNav(){document.querySelectorAll('.reader-navigation > button').forEach((b,i,bs)=>{if(b.__hjTurnInterceptor)return;b.__hjTurnInterceptor=true;b.addEventListener('click',ev=>{if(document.__hjTurnProgrammatic||document.__hjTurnBusy)return;ev.preventDefault();ev.stopImmediatePropagation();turn(i===bs.length-1?'next':'prev',()=>{document.__hjTurnProgrammatic=true;try{b.click()}finally{setTimeout(()=>document.__hjTurnProgrammatic=false,0)}})},true)})}
function attachSwipe(d){if(!d||d.__hjRuntimeSwipeAttached)return;d.__hjRuntimeSwipeAttached=true;let sx=0,sy=0;d.addEventListener('touchstart',e=>{const t=e.changedTouches?.[0];if(t){sx=t.clientX;sy=t.clientY}},{passive:true});d.addEventListener('touchend',e=>{const t=e.changedTouches?.[0];if(!t)return;const dx=t.clientX-sx,dy=t.clientY-sy;if(Math.abs(dx)>=50&&Math.abs(dx)>Math.abs(dy)*1.15)clickNav(dx<0?'next':'prev')},{passive:true})}
function fixFrames(){document.querySelectorAll('.epub-reader iframe').forEach(f=>{const apply=()=>{try{forceEpubDocument(f.contentDocument);attachSwipe(f.contentDocument)}catch{}};apply();if(!f.__hjRuntimeFrameAttached){f.__hjRuntimeFrameAttached=true;f.addEventListener('load',apply)}})}
function fixInputs(){document.querySelectorAll('.reader-page-input').forEach(i=>{if(i.__hjInputFix)return;i.__hjInputFix=true;i.addEventListener('focus',()=>{try{i.select()}catch{}})})}
function init(){injectReaderStyles();fixFrames();fixInputs();attachNav();new MutationObserver(()=>{fixFrames();fixInputs();attachNav()}).observe(document.body,{childList:true,subtree:true})}
if(typeof window!=='undefined'&&typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init()}
