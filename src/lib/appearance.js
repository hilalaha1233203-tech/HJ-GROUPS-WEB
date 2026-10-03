export const FONT_OPTIONS = ['Montserrat','Inter','Poppins','Nunito Sans','Manrope','DM Sans','Roboto','Open Sans','Lato','Merriweather','Noto Sans','Noto Serif']
export const ANIMATION_INTENSITIES = ['off','minimal','normal','enhanced']
export const EMOJI_ANIMATIONS = ['none','heartbeat','flame','sparkle','bounce','pulse','wiggle','float']

export const DEFAULT_APPEARANCE = Object.freeze({
  typography:{primary:'Montserrat',heading:'Montserrat',body:'Montserrat',ui:'Montserrat',reader:'Noto Serif'},
  colors:{primary:'#7C83FF',secondary:'#9AA0FF',accent:'#FFFFFF',background:'#050509',surface:'#10121B',text:'#F7F8FF',muted:'#A9AEC3',success:'#36D399',warning:'#FBBF24',error:'#F87171',premium:'#FFD166'},
  ui:{radius:12,cardStyle:'subtle',buttonStyle:'solid',shadowIntensity:'low',animationIntensity:'normal'},
  emoji:{enabled:true,style:'native',animationEnabled:true,speed:1,mapping:{'❤️':'heartbeat','🔥':'flame','⭐':'sparkle','🔒':'pulse','👑':'float','🎧':'pulse','▶️':'pulse','🔔':'wiggle','📚':'float','🎁':'bounce','✨':'sparkle'}},
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
  for(const [key,value] of Object.entries({...DEFAULT_APPEARANCE.emoji.mapping,...mapping}).slice(0,30)) if(typeof key==='string'&&key.length<=8&&allowedAnimations.has(value)) cleanMapping[key]=value
  const cleanBool={}
  for(const key of Object.keys(DEFAULT_APPEARANCE.motion)) cleanBool[key]=motion[key]!==false
  return {
    typography:{primary:safeText(typography.primary,DEFAULT_APPEARANCE.typography.primary),heading:safeText(typography.heading,DEFAULT_APPEARANCE.typography.heading),body:safeText(typography.body,DEFAULT_APPEARANCE.typography.body),ui:safeText(typography.ui,DEFAULT_APPEARANCE.typography.ui),reader:safeText(typography.reader,DEFAULT_APPEARANCE.typography.reader)},
    colors:Object.fromEntries(Object.keys(DEFAULT_APPEARANCE.colors).map(k=>[k,hex(colors[k],DEFAULT_APPEARANCE.colors[k])])),
    ui:{radius:Math.max(0,Math.min(28,Number(ui.radius)||12)),cardStyle:['subtle','flat','outlined'].includes(ui.cardStyle)?ui.cardStyle:'subtle',buttonStyle:['solid','outline','soft'].includes(ui.buttonStyle)?ui.buttonStyle:'solid',shadowIntensity:['none','low','medium'].includes(ui.shadowIntensity)?ui.shadowIntensity:'low',animationIntensity:ANIMATION_INTENSITIES.includes(ui.animationIntensity)?ui.animationIntensity:'normal'},
    emoji:{enabled:emoji.enabled!==false,style:safeText(emoji.style,'native',30),animationEnabled:emoji.animationEnabled!==false,speed:Math.max(.5,Math.min(2,Number(emoji.speed)||1)),mapping:cleanMapping},
    logo:{main:safeText(logo.main,'' ,500),mobile:safeText(logo.mobile,'',500),watermark:logo.watermark!==false},
    motion:cleanBool,
  }
}

export function applyAppearanceToDocument(input){
  if(typeof document==='undefined') return
  const a=normalizeAppearance(input)
  const root=document.documentElement
  const vars={
    '--hj-primary':a.colors.primary,'--hj-secondary':a.colors.secondary,'--hj-accent':a.colors.accent,'--hj-bg':a.colors.background,'--hj-surface':a.colors.surface,'--hj-text':a.colors.text,'--hj-muted':a.colors.muted,'--hj-success':a.colors.success,'--hj-warning':a.colors.warning,'--hj-error':a.colors.error,'--hj-premium':a.colors.premium,'--hj-radius':a.ui.radius+'px','--hj-font-primary':a.typography.primary,'--hj-font-heading':a.typography.heading,'--hj-font-body':a.typography.body,'--hj-font-ui':a.typography.ui,'--hj-font-reader':a.typography.reader,
  }
  for(const [k,v] of Object.entries(vars)) root.style.setProperty(k,v)
  document.body.dataset.animationIntensity=a.ui.animationIntensity
  root.style.setProperty('--hj-emoji-speed', String(a.emoji.speed))
  document.body.dataset.emojiEnabled=a.emoji.enabled?'true':'false'
  document.body.dataset.emojiAnimation=a.emoji.animationEnabled?'true':'false'
  for(const [key,value] of Object.entries(a.motion)) document.body.dataset['motion'+key[0].toUpperCase()+key.slice(1)]=value?'true':'false'
  root.classList.toggle('hj-global-motion-off',!a.motion.global)
  root.classList.toggle('hj-reduced-motion',window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true)
  root.dataset.emojiSpeed=String(a.emoji.speed)
  root.dataset.fontPrimary=a.typography.primary
  const fontFamilies=[...new Set(Object.values(a.typography).filter(Boolean))]
  const fontUrl='https://fonts.googleapis.com/css2?'+fontFamilies.map(font=>'family='+encodeURIComponent(font).replace(/%20/g,'+')).join('&')+'&display=swap'
  let link=document.querySelector('link[data-hj-fonts]')
  if(!link){link=document.createElement('link');link.rel='stylesheet';link.dataset.hjFonts='1';document.head.appendChild(link)}
  if(link.href!==fontUrl) link.href=fontUrl
  return a
}
