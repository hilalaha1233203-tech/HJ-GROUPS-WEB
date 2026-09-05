const STYLE_ID='hj-reader-runtime-enhancements'
const TURN_MS=720

function injectReaderStyles(){
  if(document.getElementById(STYLE_ID))return
  const s=document.createElement('style')
  s.id=STYLE_ID
  s.textContent=`
.reader-body-full{perspective:1800px!important;perspective-origin:50% 50%!important;touch-action:pan-y!important;overscroll-behavior:contain!important;isolation:isolate!important}
.reader-body-full .epub-reader,.reader-body-full .react-pdf__Page{transform-style:preserve-3d!important;backface-visibility:hidden!important;will-change:transform!important}
.reader-body-full .react-pdf__Page{background:#fff!important}
.hj-book-turn{position:absolute!important;z-index:100000!important;pointer-events:none!important;overflow:visible!important;transform-style:preserve-3d!important;background:#fff!important;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 18px 45px rgba(0,0,0,.28)!important;backface-visibility:hidden!important}
.hj-book-turn.next{transform-origin:left center!important}.hj-book-turn.prev{transform-origin:right center!important}
.hj-book-turn:after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(0,0,0,.02),rgba(0,0,0,.20),rgba(0,0,0,.02));opacity:.72}
.hj-book-turn.next:after{background:linear-gradient(90deg,rgba(255,255,255,.16),rgba(0,0,0,.20),rgba(0,0,0,.04))}
.hj-book-turn.prev:after{background:linear-gradient(270deg,rgba(255,255,255,.16),rgba(0,0,0,.20),rgba(0,0,0,.04))}
.hj-book-turn-shadow{position:absolute!important;top:-2%!important;bottom:-2%!important;width:38%!important;z-index:100001!important;pointer-events:none!important;opacity:0!important;filter:blur(10px)!important}
.hj-book-turn.next .hj-book-turn-shadow{right:0!important;background:linear-gradient(90deg,transparent,rgba(0,0,0,.34))!important}
.hj-book-turn.prev .hj-book-turn-shadow{left:0!important;background:linear-gradient(270deg,transparent,rgba(0,0,0,.34))!important}
.reader-page-input::placeholder{color:#777c96!important;opacity:1!important}
.epub-reader,.epub-reader iframe{background:#fff!important}
.reader-body-full .react-pdf__Page canvas{background:#fff!important}
`
  document.head.appendChild(s)
}

function forceEpubDocument(d){
  if(!d)return
  try{
    const root=d.documentElement
    const body=d.body
    root?.style.setProperty('background','#fff','important')
    root?.style.setProperty('color','#111','important')
    body?.style.setProperty('background','#fff','important')
    body?.style.setProperty('color','#111','important')
    body?.style.setProperty('margin','0','important')
    body?.style.setProperty('min-height','100%','important')
    body?.style.setProperty('overflow-x','hidden','important')
    if(!d.getElementById('hj-epub-force-light-runtime')){
      const s=d.createElement('style')
      s.id='hj-epub-force-light-runtime'
      s.textContent='html,body{background:#fff!important;color:#111!important}body{margin:0!important;min-height:100%!important;overflow-x:hidden!important}body::selection{background:rgba(124,131,255,.25)!important;color:#111!important}img,svg,video{max-width:100%!important;height:auto!important}'
      ;(d.head||root).appendChild(s)
    }
  }catch{}
}

function host(){return document.querySelector('.reader-body-full')||document.querySelector('.reader-modal')||document.body}
function surface(){return document.querySelector('.epub-reader')||document.querySelector('.react-pdf__Page')}

function makeTurnPage(source,dir){
  const h=host(),r=source.getBoundingClientRect(),hr=h.getBoundingClientRect()
  const page=document.createElement('div')
  page.className=`hj-book-turn ${dir}`
  page.style.cssText=`left:${r.left-hr.left}px;top:${r.top-hr.top}px;width:${r.width}px;height:${r.height}px`
  const clone=source.cloneNode(true)
  clone.style.cssText='position:absolute!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;transform:none!important;overflow:hidden!important;backface-visibility:hidden!important;pointer-events:none!important'
  clone.querySelectorAll?.('canvas').forEach(c=>{c.style.maxWidth='100%';c.style.height='auto'})
  page.appendChild(clone)
  const shadow=document.createElement('div')
  shadow.className='hj-book-turn-shadow'
  page.appendChild(shadow)
  h.appendChild(page)
  return {page,shadow}
}

function turn(dir,navigate){
  if(document.__hjTurnBusy)return
  const old=surface()
  if(!old){navigate();return}
  document.__hjTurnBusy=true
  const f=dir==='next'
  const made=makeTurnPage(old,dir)
  const page=made.page
  const shadow=made.shadow
  const start=performance.now()
  const mid=TURN_MS*.46
  let navigated=false
  const ease=t=>1-Math.pow(1-t,3)
  const frame=now=>{
    const elapsed=now-start
    const p=Math.max(0,Math.min(1,elapsed/TURN_MS))
    if(!navigated&&elapsed>=mid){
      navigated=true
      try{navigate()}catch{}
    }
    if(elapsed<mid){
      const t=ease(Math.max(0,Math.min(1,elapsed/mid)))
      const angle=(f?-180:180)*t
      const lift=18*Math.sin(Math.PI*t)
      page.style.transform=`translateZ(${lift}px) rotateY(${angle}deg)`
      page.style.filter=`brightness(${1-.18*Math.sin(Math.PI*t)})`
      shadow.style.opacity=String(.08+.78*Math.sin(Math.PI*t))
      shadow.style.width=`${26+34*Math.sin(Math.PI*t)}%`
    }else{
      const t=ease(Math.max(0,Math.min(1,(elapsed-mid)/(TURN_MS-mid))))
      page.style.transform=`translateZ(${18*(1-t)}px) rotateY(${f?-180:180}deg)`
      page.style.filter=`brightness(${.82+.18*t})`
      shadow.style.opacity=String(.82*(1-t))
      shadow.style.width=`${60-38*t}%`
    }
    if(elapsed<TURN_MS){requestAnimationFrame(frame)}else{
      page.remove()
      document.__hjTurnBusy=false
    }
  }
  requestAnimationFrame(frame)
}

function clickNav(dir){
  const n=document.querySelector('.reader-navigation')
  if(!n)return
  const b=n.querySelectorAll(':scope > button')
  const x=dir==='next'?b[b.length-1]:b[0]
  if(!x||document.__hjTurnBusy)return
  turn(dir,()=>{document.__hjTurnProgrammatic=true;try{x.click()}finally{setTimeout(()=>document.__hjTurnProgrammatic=false,0)}})
}

function attachNav(){
  document.querySelectorAll('.reader-navigation > button').forEach((b,i,bs)=>{
    if(b.__hjTurnInterceptor)return
    b.__hjTurnInterceptor=true
    b.addEventListener('click',ev=>{
      if(document.__hjTurnProgrammatic||document.__hjTurnBusy)return
      ev.preventDefault();ev.stopImmediatePropagation()
      turn(i===bs.length-1?'next':'prev',()=>{document.__hjTurnProgrammatic=true;try{b.click()}finally{setTimeout(()=>document.__hjTurnProgrammatic=false,0)}})
    },true)
  })
}

function attachSwipe(d){
  if(!d||d.__hjRuntimeSwipeAttached)return
  d.__hjRuntimeSwipeAttached=true
  let sx=0,sy=0
  d.addEventListener('touchstart',e=>{const t=e.changedTouches?.[0];if(t){sx=t.clientX;sy=t.clientY}},{passive:true})
  d.addEventListener('touchend',e=>{const t=e.changedTouches?.[0];if(!t)return;const dx=t.clientX-sx,dy=t.clientY-sy;if(Math.abs(dx)>=55&&Math.abs(dx)>Math.abs(dy)*1.25)clickNav(dx<0?'next':'prev')},{passive:true})
}

function fixFrames(){
  document.querySelectorAll('.epub-reader iframe').forEach(f=>{
    const apply=()=>{try{forceEpubDocument(f.contentDocument);attachSwipe(f.contentDocument)}catch{}}
    apply()
    if(!f.__hjRuntimeFrameAttached){f.__hjRuntimeFrameAttached=true;f.addEventListener('load',apply)}
  })
}

function fixInputs(){
  document.querySelectorAll('.reader-page-input').forEach(i=>{
    if(i.__hjInputFix)return
    i.__hjInputFix=true
    i.addEventListener('focus',()=>{try{i.select()}catch{}})
  })
}

function init(){
  injectReaderStyles();fixFrames();fixInputs();attachNav()
  new MutationObserver(()=>{fixFrames();fixInputs();attachNav()}).observe(document.body,{childList:true,subtree:true})
}

if(typeof window!=='undefined'&&typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true})
  else init()
}
