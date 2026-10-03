import React,{useEffect,useRef} from 'react'

let echartsPromise
function loadECharts(){
  if(window.echarts) return Promise.resolve(window.echarts)
  if(echartsPromise) return echartsPromise
  echartsPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-hj-echarts]')
    if(existing){existing.addEventListener('load',()=>resolve(window.echarts));existing.addEventListener('error',reject);return}
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/echarts@6.0.0/dist/echarts.min.js';script.async=true;script.dataset.hjEcharts='1';script.onload=()=>window.echarts?resolve(window.echarts):reject(new Error('ECharts loaded without global'));script.onerror=()=>reject(new Error('Apache ECharts could not be loaded'));document.head.appendChild(script)
  })
  return echartsPromise
}

function Chart({option,className=''}){
 const ref=useRef(null)
 useEffect(()=>{let chart;let disposed=false;loadECharts().then(e=>{if(disposed||!ref.current)return;chart=e.init(ref.current);chart.setOption(option);const resize=()=>chart.resize();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)}).catch(()=>{});return()=>{disposed=true;if(chart){chart.dispose()}}},[option])
 return <div ref={ref} className={'hj-echart '+className} role="img" aria-label="Interactive analytics chart" />
}

const series=(rows,key)=>Array.isArray(rows)?rows.map(r=>Number(r?.[key]||0)):[]
const labels=(rows,key='bucket')=>Array.isArray(rows)?rows.map(r=>String(r?.[key]||'')):[]

export default function AdminAnalyticsCharts({data}){
 const daily=data?.daily||data?.timeline||[]
 const stories=(data?.stories||[]).slice(0,12)
 const episodes=(data?.episodes||[]).slice(0,12)
 const device=Array.isArray(data?.devices)?data.devices:[]
 const browsers=Array.isArray(data?.browsers)?data.browsers:[]
 const traffic=Array.isArray(data?.traffic)?data.traffic:[]
 const base={animation:false,tooltip:{trigger:'axis'},legend:{top:0,textStyle:{color:'#a9aec3'}},grid:{left:40,right:20,top:40,bottom:35},xAxis:{type:'category',data:labels(daily),axisLabel:{color:'#a9aec3'}},yAxis:{type:'value',axisLabel:{color:'#a9aec3'}},series:[]}
 const activity={...base,series:[{name:'Visitors',type:'line',smooth:true,data:series(daily,'visitors')},{name:'Sessions',type:'line',smooth:true,data:series(daily,'sessions')},{name:'Episode Plays',type:'line',smooth:true,data:series(daily,'episode_plays')}]}
 const story={animation:false,tooltip:{trigger:'axis'},grid:{left:45,right:20,top:20,bottom:70},xAxis:{type:'category',data:stories.map(x=>String(x.title||'Untitled').slice(0,18)),axisLabel:{color:'#a9aec3',rotate:35}},yAxis:{type:'value',axisLabel:{color:'#a9aec3'}},series:[{name:'Views',type:'bar',data:stories.map(x=>Number(x.story_views||0))},{name:'Plays',type:'bar',data:stories.map(x=>Number(x.episode_plays||0))}]}
 const completion={animation:false,tooltip:{trigger:'axis'},grid:{left:45,right:20,top:20,bottom:70},xAxis:{type:'category',data:episodes.map(x=>'Ep '+String(x.episode_number||x.number||'')),axisLabel:{color:'#a9aec3'}},yAxis:{type:'value',max:100,axisLabel:{color:'#a9aec3',formatter:'{value}%'}},series:[{name:'Completion %',type:'bar',data:episodes.map(x=>Number(x.completion_rate||x.completion_percent||0))}]}
 const donut=(title,rows)=>({animation:false,tooltip:{trigger:'item'},legend:{bottom:0,textStyle:{color:'#a9aec3'}},series:[{name:title,type:'pie',radius:['45%','72%'],avoidLabelOverlap:true,data:rows.map(x=>({name:String(x.name||x.device||x.browser||'Unknown'),value:Number(x.value||x.count||0)}))}]})
 return <div className="hj-echarts-grid">
   <section className="hj-echart-card"><header><strong>Traffic & Engagement</strong><small>Real recorded analytics only</small></header><Chart option={activity}/></section>
   <section className="hj-echart-card"><header><strong>Story Interest</strong><small>Views and episode plays</small></header><Chart option={story}/></section>
   <section className="hj-echart-card"><header><strong>Episode Completion</strong><small>Recorded completion percentage</small></header><Chart option={completion}/></section>
   {device.length>0&&<section className="hj-echart-card"><header><strong>Device Mix</strong><small>Only available telemetry</small></header><Chart option={donut('Device',device)}/></section>}
   {browsers.length>0&&<section className="hj-echart-card"><header><strong>Browser Mix</strong><small>Only available telemetry</small></header><Chart option={donut('Browser',browsers)}/></section>}
   {traffic.length>0&&<section className="hj-echart-card"><header><strong>Traffic Sources</strong><small>Referrer data where available</small></header><Chart option={donut('Referrer',traffic)}/></section>}
 </div>
}
