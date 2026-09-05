const STYLE_ID = 'hj-reader-runtime-enhancements'
const TURN_MS = 1250

function injectReaderStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .reader-body-full { perspective:2600px !important; perspective-origin:50% 50% !important; touch-action:pan-y !important; overscroll-behavior:contain !important; isolation:isolate !important; }
    .reader-body-full .epub-reader,.reader-body-full .react-pdf__Page { transform-style:preserve-3d !important; backface-visibility:hidden !important; transform-origin:center center !important; will-change:transform,filter,box-shadow !important; }
    .hj-turn-overlay { position:absolute !important; z-index:99999 !important; pointer-events:none !important; transform-style:preserve-3d !important; overflow:visible !important; }
    .hj-turn-shadow { position:absolute !important; top:0 !important; bottom:0 !important; width:24% !important; pointer-events:none !important; opacity:0 !important; filter:blur(9px) !important; background:rgba(0,0,0,.38) !important; }
    .hj-turn-overlay.next .hj-turn-shadow { right:0 !important; }
    .hj-turn-overlay.prev .hj-turn-shadow { left:0 !important; }
    .reader-page-input::placeholder { color:#777c96 !important; opacity:1 !important; }
    .epub-reader,.epub-reader iframe { background:#fff !important; }
    @media (prefers-reduced-motion:reduce) { .hj-turn-overlay { display:none !important; } }
  `
  document.head.appendChild(style)
}

function forceEpubDocument(doc) {
  if (!doc) return
  try {
    doc.documentElement?.style.setProperty('background-color','#fff','important')
    doc.documentElement?.style.setProperty('color','#111','important')
    doc.body?.style.setProperty('background-color','#fff','important')
    doc.body?.style.setProperty('color','#111','important')
    doc.body?.style.setProperty('margin','0','important')
    doc.body?.style.setProperty('min-height','100%','important')
    doc.body?.style.setProperty('overflow-x','hidden','important')
    if (!doc.getElementById('hj-epub-force-light-runtime')) {
      const style=doc.createElement('style')
      style.id='hj-epub-force-light-runtime'
      style.textContent=`html,html body{background:#fff!important;color:#111!important}body{margin:0!important;min-height:100%!important;overflow-x:hidden!important}body,body *{color:#111!important}body *{background-color:transparent!important}img,svg,video{max-width:100%!important;background-color:transparent!important}`
      ;(doc.head||doc.documentElement).appendChild(style)
    }
  } catch {}
}

function readerHost(){ return document.querySelector('.reader-body-full') || document.querySelector('.reader-modal') || document.body }
function readerSurface(){ return document.querySelector('.epub-reader') || document.querySelector('.react-pdf__Page') }

function addTurnOverlay(direction,surface){
  const host=readerHost(), rect=surface.getBoundingClientRect(), hr=host.getBoundingClientRect()
  if (getComputedStyle(host).position==='static') host.style.position='relative'
  const overlay=document.createElement('div')
  overlay.className=`hj-turn-overlay ${direction}`
  overlay.style.left=`${rect.left-hr.left}px`; overlay.style.top=`${rect.top-hr.top}px`; overlay.style.width=`${rect.width}px`; overlay.style.height=`${rect.height}px`
  const shadow=document.createElement('div'); shadow.className='hj-turn-shadow'; overlay.appendChild(shadow); host.appendChild(overlay)
  return {overlay,shadow}
}

function removeTurnOverlay(item){ try{item?.overlay?.remove()}catch{} }

function runPhysicalTurn(direction,navigate){
  if(document.__hjTurnBusy) return
  const oldSurface=readerSurface()
  if(!oldSurface){ navigate(); return }
  document.__hjTurnBusy=true
  const forward=direction==='next'
  const overlay=addTurnOverlay(direction,oldSurface)
  const start=performance.now()
  const firstHalf=TURN_MS*.52
  let navigationDone=false
  let newSurface=oldSurface
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2

  const frame=now=>{
    const elapsed=now-start
    if(!navigationDone && elapsed>=firstHalf){
      navigationDone=true
      try{navigate()}catch{}
      // React/epub.js may replace the page surface during navigation.
      requestAnimationFrame(()=>{
        newSurface=readerSurface()||oldSurface
        try{
          newSurface.style.setProperty('transition','none','important')
          newSurface.style.setProperty('transform',forward?'rotateY(180deg)':'rotateY(-180deg)','important')
          newSurface.style.setProperty('transform-style','preserve-3d','important')
          newSurface.style.setProperty('backface-visibility','hidden','important')
        }catch{}
      })
    }

    let angle
    if(elapsed<=firstHalf){
      const t=ease(Math.max(0,Math.min(1,elapsed/firstHalf)))
      angle=(forward?-180:180)*t
      try{oldSurface.style.setProperty('transform',`rotateY(${angle}deg) scale(${1-.014*Math.sin(Math.PI*t)})`,'important')}catch{}
    }else{
      const t=ease(Math.max(0,Math.min(1,(elapsed-firstHalf)/(TURN_MS-firstHalf))))
      angle=forward?180-180*t:-180+180*t
      try{newSurface.style.setProperty('transform',`rotateY(${angle}deg) scale(${1-.014*Math.sin(Math.PI*t)})`,'important')}catch{}
    }

    const progress=Math.max(0,Math.min(1,elapsed/TURN_MS))
    const depth=Math.sin(Math.PI*progress)
    overlay.shadow.style.opacity=String(.06+.46*depth)
    overlay.shadow.style.width=`${18+18*depth}%`
    overlay.shadow.style.transform=`scaleX(${.55+depth*.8}) translateX(${forward?-10*depth:10*depth}px)`

    if(elapsed<TURN_MS){ requestAnimationFrame(frame) }
    else {
      try{newSurface.style.removeProperty('transform');newSurface.style.removeProperty('transition');newSurface.style.removeProperty('transform-style');newSurface.style.removeProperty('backface-visibility')}catch{}
      removeTurnOverlay(overlay)
      document.__hjTurnBusy=false
    }
  }
  requestAnimationFrame(frame)
}

function clickReaderNavigation(direction){
  const nav=document.querySelector('.reader-navigation'); if(!nav)return
  const buttons=nav.querySelectorAll(':scope > button')
  const button=direction==='next'?buttons[buttons.length-1]:buttons[0]
  if(!button||document.__hjTurnBusy)return
  runPhysicalTurn(direction,()=>{
    document.__hjTurnProgrammatic=true
    try{button.click()}finally{setTimeout(()=>{document.__hjTurnProgrammatic=false},0)}
  })
}

function attachNavigation(){
  document.querySelectorAll('.reader-navigation > button').forEach((button,index,buttons)=>{
    if(button.__hjTurnInterceptor)return
    button.__hjTurnInterceptor=true
    button.addEventListener('click',event=>{
      if(document.__hjTurnProgrammatic||document.__hjTurnBusy)return
      event.preventDefault();event.stopImmediatePropagation()
      const direction=index===buttons.length-1?'next':'prev'
      runPhysicalTurn(direction,()=>{
        document.__hjTurnProgrammatic=true
        try{button.click()}finally{setTimeout(()=>{document.__hjTurnProgrammatic=false},0)}
      })
    },true)
  })
}

function attachSwipe(doc){
  if(!doc||doc.__hjRuntimeSwipeAttached)return
  doc.__hjRuntimeSwipeAttached=true
  let sx=0,sy=0,active=false
  doc.addEventListener('touchstart',e=>{const t=e.changedTouches?.[0];if(!t)return;sx=t.clientX;sy=t.clientY;active=true},{passive:true})
  doc.addEventListener('touchend',e=>{if(!active)return;active=false;const t=e.changedTouches?.[0];if(!t)return;const dx=t.clientX-sx,dy=t.clientY-sy;if(Math.abs(dx)<45||Math.abs(dx)<Math.abs(dy)*1.2)return;clickReaderNavigation(dx<0?'next':'prev')},{passive:true})
}

function fixEpubIframes(){
  document.querySelectorAll('.epub-reader iframe').forEach(iframe=>{
    if(iframe.__hjRuntimeFixAttached)return
    iframe.__hjRuntimeFixAttached=true
    const apply=()=>{try{const doc=iframe.contentDocument;forceEpubDocument(doc);attachSwipe(doc)}catch{}}
    apply();iframe.addEventListener('load',apply)
  })
}

function fixPageInputs(){
  document.querySelectorAll('.reader-page-input').forEach(input=>{
    if(input.__hjInputFix)return
    input.__hjInputFix=true
    input.addEventListener('focus',()=>{if(input.value){const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;setter?.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))}})
  })
}

function init(){
  injectReaderStyles();fixEpubIframes();fixPageInputs();attachNavigation()
  const observer=new MutationObserver(()=>{fixEpubIframes();fixPageInputs();attachNavigation()})
  observer.observe(document.body,{childList:true,subtree:true})
}

if(typeof window!=='undefined'&&typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init()
}
