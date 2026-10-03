import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl=Deno.env.get('SUPABASE_URL')!
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
const serviceKey=secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const db=createClient(supabaseUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}})
const repo='hilalaha1233203-tech/HJ-GROUPS-WEB'
const productionBase='https://hj-groups-website.getvoroa.com'
let monitorKeyPromise: Promise<string> | null = null
async function getMonitorKey(){
  if(monitorKeyPromise) return monitorKeyPromise
  monitorKeyPromise=(async()=>{const {data,error}=await db.rpc('get_security_monitor_key');if(error||!data) throw new Error('monitor key unavailable');return String(data)})()
  return monitorKeyPromise
}

const safe=(v,max=700)=>String(v??'').replace(/(?:sk_|eyJ|sb_(?:secret|publishable)_)[A-Za-z0-9_\-.]+/g,'[REDACTED]').slice(0,max)
const finding=(severity,category,component,location,description,impact,evidence,root,recommend,verification)=>({severity,category,component,location,description,impact,evidence:safe(evidence),root_cause:root,recommended_fix:recommend,verification})

async function check(url,init={}){try{const r=await fetch(url,{...init,redirect:'manual'});return {ok:true,status:r.status,headers:Object.fromEntries([...r.headers].filter(([k])=>['content-security-policy','strict-transport-security','x-content-type-options','referrer-policy','permissions-policy','access-control-allow-origin'].includes(k.toLowerCase()))),body:safe(await r.text(),500)}}catch(e){return {ok:false,error:safe(e)}}}
async function github(path){const r=await fetch('https://raw.githubusercontent.com/'+repo+'/main/'+path,{headers:{'User-Agent':'HJ-GROUPS-Security-Monitor'}});return r.ok?await r.text():''}
async function osv(packages){try{const body=packages.map(p=>({package:{name:p.name,ecosystem:'npm'},version:p.version}));const r=await fetch('https://api.osv.dev/v1/querybatch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({queries:body})});if(!r.ok)return [];const j=await r.json();return (j.results||[]).flatMap((x,i)=>(x.vulns||[]).map(v=>({...v,package:packages[i]})))}catch{return []}}

async function runScan(){
 const started=new Date().toISOString();const findings=[]
 const health=await check(productionBase+'/health')
 if(!health.ok||health.status!==200) findings.push(finding('high','infrastructure','web-server','/health','Production health endpoint did not return HTTP 200.','Availability and integration health cannot be confirmed.',JSON.stringify(health),'Production service unavailable or health route failing.','Restore service health and verify the endpoint from an external client.','Repeat GET /health and confirm HTTP 200.'))
 const settings=await check(productionBase+'/api/public-settings')
 if(!settings.ok||settings.status!==200) findings.push(finding('medium','bug','public-settings','/api/public-settings','Public settings endpoint is unavailable.','Site identity/support configuration may not load.',JSON.stringify(settings),'Endpoint or backend configuration failure.','Restore endpoint and keep response limited to non-sensitive public settings.','Repeat GET and verify only approved public fields are returned.'))
 const admin=await check(productionBase+'/api/admin/analytics')
 if(admin.status!==401&&admin.status!==403) findings.push(finding('critical','security','admin-auth','/api/admin/analytics','Unauthenticated request was not rejected by the admin analytics endpoint.','A caller could potentially access privileged analytics data.',JSON.stringify(admin),'Admin route authorization boundary may be missing or changed.','Require a valid Supabase session and server-side admin role check before returning data.','Repeat unauthenticated request and verify HTTP 401/403.'))
 const sources=['server.mjs','server/payment.mjs','server/shortenerUnlock.mjs','server/rewardedAdUnlock.mjs','src/supabase.js','src/App.jsx','src/AdminPanel.jsx']
 for(const path of sources){const source=await github(path);if(/(?:SUPABASE_SERVICE_ROLE_KEY|CASHFREE_CLIENT_SECRET|AROLINKS_API_TOKEN|EARN4LINK_API_TOKEN|UNLOCK_TOKEN_SECRET)\s*[:=]\s*['"][^'"]{8,}/i.test(source)) findings.push(finding('critical','security','secret-exposure',path,'A server secret appears to be hardcoded in source.','Credentials committed to source can be copied and abused.',path,'Confirmed by source scan.','Move the value to server-side environment/secrets and reference it only at runtime.','Rescan repository and verify no literal secret remains.'))}
 const lock=await github('package-lock.json');
 if(lock){try{const j=JSON.parse(lock);const pk=Object.entries(j.packages||{}).filter(([k])=>k.startsWith('node_modules/')).map(([k,v])=>({name:k.replace('node_modules/',''),version:v.version})).slice(0,120);for(const v of await osv(pk))if(['HIGH','CRITICAL'].includes(String(v.severity||'').toUpperCase())||v.database_specific?.severity==='HIGH'||v.database_specific?.severity==='CRITICAL')findings.push(finding('high','dependency',v.package.name,'package-lock.json','A dependency has a high/critical OSV advisory.','Known vulnerable dependencies may be exploitable depending on reachability.',JSON.stringify({id:v.id,summary:v.summary,version:v.package.version}),'Published vulnerability advisory.','Upgrade or replace the affected dependency after compatibility review; do not auto-upgrade in the scanner.','Run the full dependency audit after the approved dependency change.'))}catch{}}
 let snapshot=null;try{const {data,error}=await db.rpc('security_monitor_snapshot');if(error)throw error;snapshot=data}catch(e){findings.push(finding('medium','security','database','security_monitor_snapshot','Database security introspection could not be completed.','RLS/function/policy state was not fully verified.',String(e?.message||e),'Snapshot RPC unavailable or authorization changed.','Restore the server-only introspection path and retest.','Run the snapshot RPC from the monitoring function.'))}
 if(snapshot){for(const row of snapshot.public_execute_security_definer||[])findings.push(finding('high','security','database',row.name,'A SECURITY DEFINER function in public is executable by PUBLIC.','A privileged database function may become an unintended public API.',JSON.stringify(row),'PUBLIC execute privilege on a SECURITY DEFINER function.','Revoke PUBLIC execute and expose only through an authenticated server boundary.','Query function privileges and verify PUBLIC cannot execute it.'))}
 const scan={started_at:started,finished_at:new Date().toISOString(),status:'completed',summary:{finding_count:findings.length,critical:findings.filter(x=>x.severity==='critical').length,high:findings.filter(x=>x.severity==='high').length,medium:findings.filter(x=>x.severity==='medium').length,low:findings.filter(x=>x.severity==='low').length,informational:findings.filter(x=>x.severity==='informational').length}}
 const {data:scanRow,error:scanError}=await db.from('security_scans').insert(scan).select('id').single();if(scanError)throw scanError
 for(const f of findings){
   const fingerprint=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([f.category,f.component,f.location,f.description]))).then(b=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join(''))
   const {data:existing}=await db.from('security_findings').select('first_detected_at,recurring_count,status').eq('fingerprint',fingerprint).maybeSingle()
   const nextStatus=existing?.status&&['fixed','retested','closed'].includes(existing.status)?'new':(existing?.status||'new')
   await db.from('security_findings').upsert({
     fingerprint,
     first_detected_at:existing?.first_detected_at||new Date().toISOString(),
     last_detected_at:new Date().toISOString(),
     severity:f.severity,category:f.category,status:nextStatus,component:f.component,location:f.location,description:f.description,impact:f.impact,evidence:f.evidence,root_cause:f.root_cause,recommended_fix:f.recommended_fix,verification:f.verification,
     recurring_count:Number(existing?.recurring_count||0)+1,last_scan_id:scanRow.id,updated_at:new Date().toISOString()
   },{onConflict:'fingerprint',ignoreDuplicates:false})
 }
 return {scanId:scanRow.id,summary:scan.summary,findings:findings.length}
}

Deno.serve(async(req)=>{
  if(req.method!=='POST')return new Response('Method Not Allowed',{status:405})
  try{
    const expected=await getMonitorKey()
    const supplied=req.headers.get('x-hj-monitor-key')||''
    if(!supplied||supplied!==expected)return new Response('Forbidden',{status:403})
    return Response.json({ok:true,...await runScan()})
  }catch(e){return Response.json({ok:false,error:'Security scan failed'}, {status:500})}
})
