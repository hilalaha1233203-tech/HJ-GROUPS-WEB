import {
  authenticateUser,
  envString,
  isAdminUser,
  jsonResponse,
  readJsonBody,
} from './runtime.js';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 6;
const buckets = new Map();

function allowed(request) {
  const userAgent = String(request.headers.get('user-agent') || '');
  return !/bot|crawler|spider/i.test(userAgent);
}

function rateLimit(userId) {
  const now = Date.now();
  const current = buckets.get(userId);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(userId,{startedAt:now,count:1});
    return true;
  }
  current.count += 1;
  return current.count <= MAX_REQUESTS;
}

function getWorkflowPayload(body) {
  const mode = ['smoke','security','full'].includes(body?.mode) ? body.mode : 'smoke';
  const ref = String(body?.ref || 'main').trim().replace(/[^A-Za-z0-9._/-]/g,'').slice(0,120) || 'main';
  return { ref, mode };
}

export async function handleAdminPlaywright(request) {
  if (request.method !== 'POST') return jsonResponse(request,405,{error:'Method not allowed'},{Allow:'POST'});
  if (!allowed(request)) return jsonResponse(request,403,{error:'Forbidden'});
  const user=await authenticateUser(request);
  if(!user?.id) return jsonResponse(request,401,{error:'Unauthorized'});
  if(!isAdminUser(user)) return jsonResponse(request,403,{error:'Forbidden'});
  if(!rateLimit(String(user.id))) return jsonResponse(request,429,{error:'Too many Playwright requests'});

  const token=envString('HJ_GITHUB_ACTIONS_TOKEN');
  const owner='hilalaha1233203-tech';
  const repo='HJ-GROUPS-WEB';
  const workflow=String(envString('HJ_PLAYWRIGHT_WORKFLOW') || 'playwright.yml').trim();
  if(!token) return jsonResponse(request,503,{error:'Playwright GitHub Actions integration is not configured.'});

  let body; try{body=await readJsonBody(request);}catch{return jsonResponse(request,400,{error:'Invalid JSON request'});}
  const {ref,mode}=getWorkflowPayload(body);

  const response=await fetch(
    'https://api.github.com/repos/'+owner+'/'+repo+'/actions/workflows/'+encodeURIComponent(workflow)+'/dispatches',
    {
      method:'POST',
      headers:{
        Accept:'application/vnd.github+json',
        Authorization:'Bearer '+token,
        'X-GitHub-Api-Version':'2022-11-28',
        'Content-Type':'application/json',
      },
      body:JSON.stringify({ref,inputs:{mode}}),
    }
  );
  if(response.status!==204) return jsonResponse(request,502,{error:'Failed to trigger Playwright workflow.'});
  return jsonResponse(request,202,{ok:true,accepted:true,workflow,ref,mode});
}
