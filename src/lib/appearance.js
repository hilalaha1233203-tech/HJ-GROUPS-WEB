export const FONT_OPTIONS = [
  'Montserrat','Inter','Poppins','Nunito Sans','Manrope','DM Sans','Roboto','Open Sans','Lato',
  'Merriweather','Noto Sans','Noto Serif','Space Grotesk','Sora','Outfit','Plus Jakarta Sans',
  'Urbanist','Raleway','Archivo','Lexend','Work Sans','Figtree','Bricolage Grotesque','Playfair Display',
  'Cormorant Garamond','Libre Baskerville','IBM Plex Sans','IBM Plex Serif'
]
export const ANIMATION_INTENSITIES = ['off','minimal','normal','enhanced']
export const EMOJI_ANIMATIONS = ['none','heartbeat','flame','sparkle','bounce','pulse','wiggle','float']
export const EMOJI_STYLES = ['native','soft','bold','mono']

export const DEFAULT_APPEARANCE = Object.freeze({
  typography:{primary:'Montserrat',heading:'Montserrat',body:'Montserrat',ui:'Montserrat',reader:'Noto Serif'},
  colors:{primary:'#7C83FF',secondary:'#9AA0FF',accent:'#FFFFFF',background:'#050509',surface:'#10121B',text:'#F7F8FF',muted:'#A9AEC3',success:'#36D399',warning:'#FBBF24',error:'#F87171',premium:'#FFD166'},
  ui:{radius:12,cardStyle:'subtle',buttonStyle:'solid',shadowIntensity:'low',animationIntensity:'normal'},
  emoji:{enabled:true,style:'native',animationEnabled:true,speed:1,mapping:{'❤️':'heartbeat','🔥':'flame','⭐':'sparkle','🔒':'pulse','👑':'float','🎧':'pulse','▶️':'pulse','🔔':'wiggle','📚':'float','🎁':'bounce','✨':'sparkle','🎨':'sparkle','🎬':'bounce','📖':'float','🔊':'pulse','👤':'float','😴':'float','🛡':'pulse','✏️':'wiggle','🗑️':'bounce','⬆️':'bounce','✓':'pulse','⚡':'sparkle','💎':'float'}},
  logo:{main:'',mobile:'',watermark:true},
  motion:{global:true,pageTransition:true,cardHover:true,buttonHover:true,loading:true,skeleton:true,storyCard:true,player:true,emoji:true,premium:true,notification:true,modal:true,reader:true,scroll:true},
})

const hex = (value,fallback) => /^#[0-9a-f]{6}$/i.test(String(value||'')) ? String(value) : fallback
const safeText = (value,fallback,max=80) => { const v=String(value??'').trim(); return v.length && v.length<=max ? v : fallback }

export function normalizeAppearance(input={}){
  const source=input&&typeof input==='object'?input:{}
  const typography=source.typography&&typeof source.typography==='object'?source.typography:{}
  const colors=source.colors&&typeof source.colors==='object'?source.colors:{}
  const ui=source.ui&&typeof source.ui==='object'?source.ui:{}
  const emoji=source.emoji&&typeof source.emoji==='object'?source.emoji:{}
  const logo=source.logo&&typeof source.logo==='object'?source.logo:{}
  const motion=source.motion&&typeof source.motion==='object'?source.motion:{}
  const mapping=emoji.mapping&&typeof emoji.mapping==='object'?emoji.mapping:{}
  const allowedAnimations=new Set(EMOJI_ANIMATIONS)
  const cleanMapping={}
  for(const [key,value] of Object.entries({...DEFAULT_APPEARANCE.emoji.mapping,...mapping}).slice(0,40)) if(typeof key==='string'&&key.length<=12&&allowedAnimations.has(value)) cleanMapping[key]=value
  const cleanBool={}
  for(const key of Object.keys(DEFAULT_APPEARANCE.motion)) cleanBool[key]=motion[key]!==false
  return {
    typography:Object.fromEntries(Object.keys(DEFAULT_APPEARANCE.typography).map(k=>[k,FONT_OPTIONS.includes(typography[k])?typography[k]:DEFAULT_APPEARANCE.typography[k]])),
    colors:Object.fromEntries(Object.keys(DEFAULT_APPEARANCE.colors).map(k=>[k,hex(colors[k],DEFAULT_APPEARANCE.colors[k])])),
    ui:{radius:Math.max(0,Math.min(28,Number(ui.radius)||12)),cardStyle:['subtle','flat','outlined'].includes(ui.cardStyle)?ui.cardStyle:'subtle',buttonStyle:['solid','outline','soft'].includes(ui.buttonStyle)?ui.buttonStyle:'solid',shadowIntensity:['none','low','medium'].includes(ui.shadowIntensity)?ui.shadowIntensity:'low',animationIntensity:ANIMATION_INTENSITIES.includes(ui.animationIntensity)?ui.animationIntensity:'normal'},
    emoji:{enabled:emoji.enabled!==false,style:EMOJI_STYLES.includes(emoji.style)?emoji.style:'native',animationEnabled:emoji.animationEnabled!==false,speed:Math.max(.5,Math.min(2,Number(emoji.speed)||1)),mapping:cleanMapping},
    logo:{main:safeText(logo.main,'',500),mobile:safeText(logo.mobile,'',500),watermark:logo.watermark!==false},
    motion:cleanBool,
  }
}

let emojiObserver = null
const emojiEscape = (value) => String(value).replace(/[.*+?^$\\{}()|[\]\\]/g,'\\$&')

function resetAnimatedEmojiNodes(){
  if(typeof document==='undefined') return
  document.querySelectorAll('.hj-animated-emoji').forEach((node)=>{
    const parent=node.parentNode
    if(!parent) return
    parent.replaceChild(document.createTextNode(node.dataset.hjEmojiChar || node.textContent || ''),node)
    parent.normalize()
  })
}

function installEmojiEnhancer(appearance){
  if(typeof document==='undefined') return
  if(emojiObserver){ try{emojiObserver.disconnect()}catch{} emojiObserver=null }
  resetAnimatedEmojiNodes()
  if(!appearance.emoji.enabled || !appearance.emoji.animationEnabled || appearance.motion.emoji===false) return

  const entries=Object.entries(appearance.emoji.mapping).filter(([emoji,animation])=>emoji && animation).sort((a,b)=>b[0].length-a[0].length)
  if(!entries.length) return
  const regex=new RegExp(entries.map(([emoji])=>emojiEscape(emoji)).join('|'),'gu')
  const animationFor=(emoji)=>appearance.emoji.mapping[emoji] || 'none'
  const shouldSkip=(node)=>{
    const parent=node.parentElement
    if(!parent) return true
    if(parent.closest('.hj-animated-emoji,[data-hj-emoji-skip]')) return true
    return ['SCRIPT','STYLE','TEXTAREA','INPUT','SELECT','OPTION'].includes(parent.tagName)
  }

  const enhanceTextNode=(node)=>{
    if(!node?.nodeValue || shouldSkip(node)) return
    const text=node.nodeValue
    regex.lastIndex=0
    if(!regex.test(text)){regex.lastIndex=0;return}
    regex.lastIndex=0
    const fragment=document.createDocumentFragment()
    let last=0
    for(const match of text.matchAll(regex)){
      const index=match.index ?? 0
      if(index>last) fragment.appendChild(document.createTextNode(text.slice(last,index)))
      const emoji=match[0]
      const animation=animationFor(emoji)
      const span=document.createElement('span')
      span.className='hj-animated-emoji hj-emoji-'+animation
      span.dataset.hjEmojiChar=emoji
      span.dataset.hjEmojiAnimation=animation
      span.dataset.hjEmojiStyle=appearance.emoji.style
      span.setAttribute('aria-hidden','true')
      span.textContent=emoji
      fragment.appendChild(span)
      last=index+emoji.length
    }
    if(last<text.length) fragment.appendChild(document.createTextNode(text.slice(last)))
    node.parentNode?.replaceChild(fragment,node)
  }

  const scan=(root)=>{
    if(!root) return
    if(root.nodeType===Node.TEXT_NODE){enhanceTextNode(root);return}
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT)
    const nodes=[]
    let current
    while((current=walker.nextNode())) nodes.push(current)
    nodes.forEach(enhanceTextNode)
  }

  scan(document.body)
  emojiObserver=new MutationObserver((mutations)=>mutations.forEach((mutation)=>mutation.addedNodes.forEach((node)=>scan(node))))
  emojiObserver.observe(document.body,{subtree:true,childList:true})
}

export function applyAppearanceToDocument(input){
  if(typeof document==='undefined') return
  const a=normalizeAppearance(input)
  const root=document.documentElement
  const vars={'--hj-primary':a.colors.primary,'--hj-secondary':a.colors.secondary,'--hj-accent':a.colors.accent,'--hj-bg':a.colors.background,'--hj-surface':a.colors.surface,'--hj-text':a.colors.text,'--hj-muted':a.colors.muted,'--hj-success':a.colors.success,'--hj-warning':a.colors.warning,'--hj-error':a.colors.error,'--hj-premium':a.colors.premium,'--hj-radius':a.ui.radius+'px','--hj-font-primary':a.typography.primary,'--hj-font-heading':a.typography.heading,'--hj-font-body':a.typography.body,'--hj-font-ui':a.typography.ui,'--hj-font-reader':a.typography.reader}
  for(const [k,v] of Object.entries(vars)) root.style.setProperty(k,v)
  document.body.dataset.animationIntensity=a.ui.animationIntensity
  root.style.setProperty('--hj-emoji-speed',String(a.emoji.speed))
  document.body.dataset.emojiEnabled=a.emoji.enabled?'true':'false'
  document.body.dataset.emojiAnimation=a.emoji.animationEnabled?'true':'false'
  document.body.dataset.emojiStyle=a.emoji.style
  for(const [key,value] of Object.entries(a.motion)) document.body.dataset['motion'+key[0].toUpperCase()+key.slice(1)]=value?'true':'false'
  root.classList.toggle('hj-global-motion-off',!a.motion.global)
  root.classList.toggle('hj-reduced-motion',window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true)
  root.dataset.emojiSpeed=String(a.emoji.speed)
  root.dataset.fontPrimary=a.typography.primary
  const fontFamilies=[...new Set([...Object.values(a.typography),'Noto Sans Tamil','Noto Serif Tamil'].filter(Boolean))]
  const fontUrl='https://fonts.googleapis.com/css2?'+fontFamilies.map(font=>'family='+encodeURIComponent(font).replace(/%20/g,'+')).join('&')+'&display=swap'
  let link=document.querySelector('link[data-hj-fonts]')
  if(!link){link=document.createElement('link');link.rel='stylesheet';link.dataset.hjFonts='1';document.head.appendChild(link)}
  if(link.href!==fontUrl) link.href=fontUrl
  installEmojiEnhancer(a)
  return a
}
