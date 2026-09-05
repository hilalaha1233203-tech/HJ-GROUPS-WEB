const STYLE_ID = 'hj-reader-runtime-enhancements'
const TURN_MS = 1250

function injectReaderStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .reader-body-full { perspective: 2400px !important; perspective-origin: 50% 50% !important; touch-action: pan-y !important; overscroll-behavior: contain !important; isolation:isolate !important; }
    .reader-body-full .epub-reader, .reader-body-full .react-pdf__Page { transform-style:preserve-3d !important; backface-visibility:hidden !important; transform-origin:center center !important; will-change:transform,filter,box-shadow !important; }
    .hj-turn-layer { position:absolute !important; inset:0 !important; z-index:10000 !important; pointer-events:none !important; perspective:2400px !important; transform-style:preserve-3d !important; overflow:visible !important; }
    .hj-turn-sheet { position:absolute !important; transform-style:preserve-3d !important; backface-visibility:hidden !important; transform-origin:var(--hj-origin) !important; overflow:hidden !important; background:#fff !important; border-radius:2px !important; }
    .hj-turn-sheet::before { content:'' !important; position:absolute !important; inset:0 !important; z-index:2 !important; background:linear-gradient(90deg,rgba(0,0,0,.22),transparent 16%,rgba(255,255,255,.28) 50%,rgba(0,0,0,.20)) !important; opacity:.35 !important; pointer-events:none !important; }
    .hj-turn-sheet::after { content:'' !important; position:absolute !important; top:0 !important; bottom:0 !important; width:12% !important; z-index:3 !important; background:rgba(0,0,0,.32) !important; filter:blur(10px) !important; opacity:0 !important; pointer-events:none !important; }
    .hj-turn-layer.next .hj-turn-sheet::after { right:0 !important; }
    .hj-turn-layer.prev .hj-turn-sheet::after { left:0 !important; }
    .reader-page-input::placeholder { color:#777c96 !important; opacity:1 !important; }
    @keyframes hjBookNext { 0%{transform:rotateY(0deg) translateZ(0) scale(1);filter:brightness(1)} 12%{transform:rotateY(-8deg) translateZ(0) scale(.999);filter:brightness(.98)} 35%{transform:rotateY(-45deg) translateZ(-5px) scale(.994);filter:brightness(.94)} 55%{transform:rotateY(-92deg) translateZ(-14px) scale(.986);filter:brightness(.84)} 72%{transform:rotateY(-142deg) translateZ(-8px) scale(.992);filter:brightness(.92)} 88%{transform:rotateY(-172deg) translateZ(0) scale(.998);filter:brightness(.99)} 100%{transform:rotateY(-180deg) translateZ(0) scale(1);filter:brightness(1)} }
    @keyframes hjBookPrev { 0%{transform:rotateY(0deg) translateZ(0) scale(1);filter:brightness(1)} 12%{transform:rotateY(8deg) translateZ(0) scale(.999);filter:brightness(.98)} 35%{transform:rotateY(45deg) translateZ(-5px) scale(.994);filter:brightness(.94)} 55%{transform:rotateY(92deg) translateZ(-14px) scale(.986);filter:brightness(.84)} 72%{transform:rotateY(142deg) translateZ(-8px) scale(.992);filter:brightness(.92)} 88%{transform:rotateY(172deg) translateZ(0) scale(.998);filter:brightness(.99)} 100%{transform:rotateY(180deg) translateZ(0) scale(1);filter:brightness(1)} }
    .reader-body-full.hj-fallback-next .epub-reader,.reader-body-full.hj-fallback-next .react-pdf__Page{animation:hjBookNext ${TURN_MS}ms cubic-bezier(.22,.61,.36,1) both !important}
    .reader-body-full.hj-fallback-prev .epub-reader,.reader-body-full.hj-fallback-prev .react-pdf__Page{animation:hjBookPrev ${TURN_MS}ms cubic-bezier(.22,.61,.36,1) both !important}
    .epub-reader,.epub-reader iframe{background:#fff !important}
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
      const style=doc.createElement('style'); style.id='hj-epub-force-light-runtime'; style.textContent=`html,html body{background:#fff!important;color:#111!important}body{margin:0!important;min-height:100%!important;overflow-x:hidden!important}body,body *{color:#111!important}body *{background-color:transparent!important}img,svg,video{max-width:100%!important;background-color:transparent!important}`; (doc.head||doc.documentElement).appendChild(style)
    }
  } catch {}
}

function readerHost(){ return document.querySelector('.reader-body-full') || document.querySelector('.reader-modal') || document.body }
function readerSurface(){ return document.querySelector('.epub-reader') || document.querySelector('.react-pdf__Page') }

function clearTurnLayer(){ document.querySelectorAll('.hj-turn-layer').forEach((n)=>n.remove()) }

function createTurnSheet(surface,direction){
  const host=readerHost(), layer=document.createElement('div'), sheet=document.createElement('div')
  const r=surface.getBoundingClientRect(), hr=host.getBoundingClientRect()
  if (getComputedStyle(host).position==='static') host.style.position='relative'
  layer.className=`hj-turn-layer ${direction}`
  sheet.className='hj-turn-sheet'
  sheet.style.setProperty('--hj-origin',direction==='next'?'right center':'left center')
  sheet.style.left=`${r.left-hr.left}px`; sheet.style.top=`${r.top-hr.top}px`; sheet.style.width=`${r.width}px`; sheet.style.height=`${r.height}px`
  const clone=surface.cloneNode(true)
  clone.removeAttribute?.('id')
  clone.style.setProperty('position','absolute','important'); clone.style.setProperty('inset','0','important'); clone.style.setProperty('width','100%','important'); clone.style.setProperty('height','100%','important'); clone.style.setProperty('margin','0','important'); clone.style.setProperty('transform','none','important'); clone.style.setProperty('pointer-events','none','important')
  sheet.appendChild(clone); layer.appendChild(sheet); host.appendChild(layer)
  return {layer,sheet}
}

function fallbackTurn(direction){
  const host=document.querySelector('.reader-body-full'); if(!host) return
  host.classList.remove('hj-fallback-next','hj-fallback-prev'); void host.offsetWidth
  host.classList.add(direction==='next'?'hj-fallback-next':'hj-fallback-prev')
  clearTimeout(host.__hjFallbackTimer); host.__hjFallbackTimer=setTimeout(()=>host.classList.remove('hj-fallback-next','hj-fallback-prev'),TURN_MS+40)
}

function runTurn(direction,navigate){
  if(document.__hjTurnBusy) return
  const surface=readerSurface()
  if(!surface){ navigate(); return }
  document.__hjTurnBusy=true
  clearTurnLayer()
  const snapshot=createTurnSheet(surface,direction)
  requestAnimationFrame(()=>{
    try{navigate()}catch{}
    requestAnimationFrame(()=>{
      if(!snapshot){ fallbackTurn(direction); setTimeout(()=>{document.__hjTurnBusy=false},TURN_MS); return }
      const {layer,sheet}=snapshot, start=performance.now(), forward=direction==='next'
      const ease=t=>1-Math.pow(1-t,3)
      const frame=now=>{
        const raw=Math.min(1,(now-start)/TURN_MS), t=ease(raw), angle=(forward?-180:180)*t, depth=Math.sin(Math.PI*t)
        sheet.style.transform=`rotateY(${angle}deg) translateZ(${-18*depth}px) scale(${1-.012*depth})`
        sheet.style.boxShadow=forward?`${18+40*depth}px ${10+18*depth}px ${28+32*depth}px rgba(0,0,0,${.20+.30*depth})`:`${-18-40*depth}px ${10+18*depth}px ${28+32*depth}px rgba(0,0,0,${.20+.30*depth})`
        sheet.style.filter=`brightness(${1-.16*depth})`
        if(raw<1) requestAnimationFrame(frame); else { layer.remove(); document.__hjTurnBusy=false }
      }
      requestAnimationFrame(frame)
    })
  })
}

function clickReaderNavigation(direction){
  const nav=document.querySelector('.reader-navigation'); if(!nav) return
  const buttons=nav.querySelectorAll(':scope > button'), button=direction==='next'?buttons[buttons.length-1]:buttons[0]
  if(!button || document.__hjTurnBusy) return
  runTurn(direction,()=>{ document.__hjTurnProgrammatic=true; try{button.click()}finally{setTimeout(()=>{document.__hjTurnProgrammatic=false},0)} })
}

function attachNavigation(){
  document.querySelectorAll('.reader-navigation > button').forEach((button,index,buttons)=>{
    if(button.__hjTurnIntercept) return
    button.__hjTurnIntercept=true
    button.addEventListener('click',event=>{
      if(document.__hjTurnProgrammatic || document.__hjTurnBusy) return
      event.preventDefault(); event.stopImmediatePropagation()
      const direction=index===buttons.length-1?'next':'prev'
      runTurn(direction,()=>{document.__hjTurnProgrammatic=true; try{button.click()}finally{setTimeout(()=>{document.__hjTurnProgrammatic=false},0)}})
    },true)
  })
}

function attachSwipe(doc){
  if(!doc||doc.__hjRuntimeSwipeAttached) return
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
    apply(); iframe.addEventListener('load',apply)
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
