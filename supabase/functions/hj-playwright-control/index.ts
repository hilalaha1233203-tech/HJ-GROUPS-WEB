import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
const serviceKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const repo = 'hilalaha1233203-tech/HJ-GROUPS-WEB'
const workflow = 'playwright.yml'
const ref = 'main'
const githubApi = 'https://api.github.com'
const allowedOrigins = new Set(['https://hj-groups-website.getvoroa.com', 'https://hj-groups-web.vercel.app'])
const rateBuckets = new Map<string, { startedAt: number; count: number }>()

function cors(req: Request) {
  const origin = req.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://hj-groups-website.getvoroa.com',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function rateLimit(key: string, limit = 2, windowMs = 60_000) {
  const now = Date.now()
  const bucket = rateBuckets.get(key)
  if (!bucket || now - bucket.startedAt >= windowMs) {
    rateBuckets.set(key, { startedAt: now, count: 1 })
    return true
  }
  bucket.count += 1
  return bucket.count <= limit
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user || data.user.app_metadata?.role !== 'admin') return null
  return data.user
}

function githubHeaders(token: string) {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'HJ-GROUPS-Playwright-Control',
  }
}

function safeRun(run: any) {
  if (!run) return null
  const created = Date.parse(run.created_at || '')
  const updated = Date.parse(run.updated_at || '')
  const durationMs = Number.isFinite(created) && Number.isFinite(updated) && updated >= created
    ? updated - created
    : null
  return {
    id: run.id,
    runNumber: run.run_number,
    status: run.status || 'unknown',
    conclusion: run.conclusion || null,
    htmlUrl: run.html_url || null,
    commitSha: run.head_sha || null,
    branch: run.head_branch || null,
    event: run.event || null,
    createdAt: run.created_at || null,
    updatedAt: run.updated_at || null,
    durationMs,
  }
}

async function githubFetch(path: string, token: string, init: RequestInit = {}) {
  return fetch(githubApi + path, {
    ...init,
    headers: { ...githubHeaders(token), ...(init.headers || {}) },
  })
}

async function latestRun(token: string) {
  const response = await githubFetch(
    '/repos/' + repo + '/actions/workflows/' + workflow + '/runs?branch=' + ref + '&per_page=10',
    token,
  )
  if (!response.ok) throw new Error('GitHub workflow status could not be read.')
  const payload = await response.json()
  return payload.workflow_runs?.[0] || null
}

async function getRunDetails(run: any, token: string) {
  if (!run?.id) return { run: null, tests: null, jobs: [] }
  const jobsResponse = await githubFetch(
    '/repos/' + repo + '/actions/runs/' + encodeURIComponent(String(run.id)) + '/jobs?per_page=20',
    token,
  )
  const jobsPayload = jobsResponse.ok ? await jobsResponse.json() : { jobs: [] }
  const jobs = jobsPayload.jobs || []
  const job = jobs[0]
  let logText = ''
  if (job?.id) {
    const logResponse = await githubFetch(
      '/repos/' + repo + '/actions/jobs/' + encodeURIComponent(String(job.id)) + '/logs',
      token,
    )
    if (logResponse.ok) logText = await logResponse.text()
  }

  const passed = logText.match(/(\d+) passed(?:,|\s|$)/i)?.[1]
  const failed = logText.match(/(\d+) failed(?:,|\s|$)/i)?.[1]
  const skipped = logText.match(/(\d+) skipped(?:,|\s|$)/i)?.[1]
  const flaky = logText.match(/(\d+) flaky(?:,|\s|$)/i)?.[1]
  const tests = (passed || failed || skipped || flaky)
    ? {
        passed: Number(passed || 0),
        failed: Number(failed || 0),
        skipped: Number(skipped || 0),
        flaky: Number(flaky || 0),
      }
    : null

  return {
    run: safeRun(run),
    tests,
    jobs: jobs.map((item: any) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      conclusion: item.conclusion,
      startedAt: item.started_at || null,
      completedAt: item.completed_at || null,
    })),
  }
}

Deno.serve(async (req) => {
  const headers = cors(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers })

  try {
    const user = await requireAdmin(req)
    if (!user) return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers })

    const token = Deno.env.get('HJ_GITHUB_ACTIONS_TOKEN') || ''
    if (!token) {
      return Response.json({
        ok: false,
        status: 'not_configured',
        error: 'Playwright control is not configured on the server. HJ_GITHUB_ACTIONS_TOKEN is missing.',
      }, { status: 503, headers })
    }

    const body = await req.json().catch(() => ({}))
    const action = body?.action === 'start' ? 'start' : 'status'

    if (!rateLimit('admin:' + user.id, action === 'start' ? 1 : 10)) {
      return Response.json({ ok: false, error: 'Playwright control is rate-limited. Please wait before trying again.' }, { status: 429, headers })
    }

    if (action === 'start') {
      const existing = await latestRun(token)
      if (existing?.status && ['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(existing.status)) {
        return Response.json({
          ok: true,
          status: 'already_running',
          ...await getRunDetails(existing, token),
        }, { headers })
      }

      const dispatch = await githubFetch(
        '/repos/' + repo + '/actions/workflows/' + workflow + '/dispatches',
        token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ref }),
        },
      )
      if (!dispatch.ok) {
        const detail = await dispatch.text()
        return Response.json({
          ok: false,
          status: 'trigger_failed',
          error: 'GitHub rejected the Playwright workflow trigger.',
          detail: detail.slice(0, 300),
        }, { status: 502, headers })
      }

      // GitHub may take a moment to materialize the run. Return a queued state
      // and let the Security page poll the same fixed workflow status endpoint.
      return Response.json({
        ok: true,
        status: 'queued',
        workflow,
        ref,
        repository: repo,
      }, { headers })
    }

    const run = await latestRun(token)
    return Response.json({
      ok: true,
      workflow,
      ref,
      repository: repo,
      ...await getRunDetails(run, token),
      browserCoverage: ['Chromium / Desktop Chrome', 'Admin mobile regression at 390px'],
    }, { headers })
  } catch {
    return Response.json({ ok: false, error: 'Playwright control failed.' }, { status: 500, headers })
  }
})
