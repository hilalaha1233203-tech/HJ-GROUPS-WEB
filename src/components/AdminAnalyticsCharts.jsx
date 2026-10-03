import React,{useEffect,useRef} from 'react'

let echartsPromise
function loadECharts(){
  if(window.echarts) return Promise.resolve(window.echarts)
  if(echartsPromise) return echartsPromise
  echartsPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-hj-echarts]')
    if(existing){existing.addEventListener('load',()=>resolve(window.echarts));existing.addEventListener('error',reject);return}
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/echarts@6.1.0/dist/echarts.min.js';script.async=true;script.dataset.hjEcharts='1';script.onload=()=>window.echarts?resolve(window.echarts):reject(new Error('ECharts loaded without global'));script.onerror=()=>reject(new Error('Apache ECharts could not be loaded'));document.head.appendChild(script)
  })
  return echartsPromise
}

function Chart({option,className=''}){
 const ref=useRef(null)
 useEffect(()=>{let chart;let disposed=false;let resize=()=>{};loadECharts().then(e=>{if(disposed||!ref.current)return;chart=e.init(ref.current);chart.setOption(option);resize=()=>chart.resize();window.addEventListener('resize',resize)}).catch(()=>{});return()=>{disposed=true;window.removeEventListener('resize',resize);if(chart)chart.dispose()}},[option])
 return <div ref={ref} className={'hj-echart '+className} role="img" aria-label="Interactive analytics chart" />
}

const series=(rows,key)=>Array.isArray(rows)?rows.map(r=>Number(r?.[key]||0)):[]
const labels=(rows,key='bucket')=>Array.isArray(rows)?rows.map(r=>String(r?.[key]||'')):[]

export default function AdminAnalyticsCharts({data}){
 const overview=data?.overview||{}
 const stories=(data?.stories||[]).slice().sort((a,b)=>Number(b.story_views||0)-Number(a.story_views||0)).slice(0,20)
 const episodes=(data?.episodes||[]).slice().sort((a,b)=>Number(b.total_plays||0)-Number(a.total_plays||0)).slice(0,20)
 const unlocks=[['Ad unlocks',Number(overview.actual_ad_unlocks||overview.ad_unlock_completions||0)],['Shortener unlocks',Number(overview.actual_shortener_unlocks||overview.shortener_unlock_completions||0)],['Premium/VIP accesses',Number(overview.premium_vip_accesses||0)]]
 const overviewOption={animation:false,tooltip:{trigger:'axis'},grid:{left:45,right:20,top:20,bottom:70},xAxis:{type:'category',data:['Registered','Active logged-in','Anonymous sessions','Story views','Episode plays','Completions'],axisLabel:{color:'#a9aec3',rotate:25}},yAxis:{type:'value',axisLabel:{color:'#a9aec3'}},dataZoom:[{type:'inside'},{type:'slider',bottom:5}],series:[{name:'Recorded count',type:'bar',data:[Number(overview.registered_users||0),Number(overview.active_logged_in_users||0),Number(overview.active_anonymous_sessions||0),Number(overview.story_views||0),Number(overview.episode_plays||0),Number(overview.episode_completions||0)]}]}
 const storyOption={animation:false,tooltip:{trigger:'axis'},grid:{left:45,right:20,top:20,bottom:80},xAxis:{type:'category',data:stories.map(x=>String(x.title||'Untitled').slice(0,20)),axisLabel:{color:'#a9aec3',rotate:35}},yAxis:{type:'value',axisLabel:{color:'#a9aec3'}},dataZoom:[{type:'inside'},{type:'slider',bottom:5}],series:[{name:'Views',type:'bar',data:stories.map(x=>Number(x.story_views||0))},{name:'Episode plays',type:'bar',data:stories.map(x=>Number(x.episode_plays||0))}]}
 const completionRate=(x)=>Number(x.total_plays||0)>0?Math.round(Number(x.completed_plays||0)/Number(x.total_plays||0)*1000)/10:0
 const episodeOption={animation:false,tooltip:{trigger:'axis'},grid:{left:45,right:20,top:20,bottom:80},xAxis:{type:'category',data:episodes.map(x=>'Ep '+String(x.episode_number??'')),axisLabel:{color:'#a9aec3',rotate:35}},yAxis:{type:'value',max:100,axisLabel:{color:'#a9aec3',formatter:'{value}%'}},dataZoom:[{type:'inside'},{type:'slider',bottom:5}],series:[{name:'Completion %',type:'bar',data:episodes.map(completionRate)}]}
 const unlockOption={animation:false,tooltip:{trigger:'item'},legend:{bottom:0,textStyle:{color:'#a9aec3'}},series:[{name:'Unlocks / access',type:'pie',radius:['45%','72%'],data:unlocks.map(([name,value])=>({name,value}))}]}
 const hasData=Object.values(overview).some(v=>Number(v)>0)||stories.length>0||episodes.length>0
 if(!hasData) return <div className="hj-echarts-empty">No recorded analytics are available for the selected range. Charts intentionally do not invent or estimate data.</div>
 return <div className="hj-echarts-grid">
   <section className="hj-echart-card"><header><strong>Recorded Overview</strong><small>Real aggregate counts from the existing analytics RPC</small></header><Chart option={overviewOption}/></section>
   <section className="hj-echart-card"><header><strong>Story Interest</strong><small>Recorded views and episode plays</small></header><Chart option={storyOption}/></section>
   <section className="hj-echart-card"><header><strong>Episode Completion</strong><small>Completion is calculated only where plays were recorded</small></header><Chart option={episodeOption}/></section>
   <section className="hj-echart-card"><header><strong>Unlock / Premium Activity</strong><small>Actual unlock and purchase-access records</small></header><Chart option={unlockOption}/></section>
 </div>
}
