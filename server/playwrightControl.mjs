import { createClient } from '@supabase/supabase-js'
import { isHjAdminUser } from './adminAuth.mjs'

const REPO = 'hilalaha1233203-tech/HJ-GROUPS-WEB'
const WORKFLOW = 'playwright.yml'
const REF = 'main'
const GITHUB_API = 'https://api.github.com'
const rateBuckets = new Map()

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://yajkfglagnyvenddyvok.supabase.co').trim()
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const db = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

function rateLimit(key, limit = 2, windowMs = 60_000) {
  const now = Date.now()
  const bucket = rateBuckets.get(key)
  if (!bucket || now - bucket.startedAt >= windowMs) {
    rateBuckets.set(key, { startedAt: now, count: 1 })
    return true
  }
  bucket.count += 1
  return bucket.count <= limit
}

function getAccessToken(req) {
  const authorization = String(req.headers.authorization || '')
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

async function getAdmin(req) {
  const token = getAccessToken(req)
  if (!token || !db) return null
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user || !isHjAdminUser(data.user)) return null
  return data.user
}

function githubHeaders(token) {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
    'User-Agent': 'HJ-GROUPS-Playwright-Control',
  }
}

async function github(path, token, init = {}) {
  return fetch(GITHUB_API + path, {
    ...init,
    headers: { ...githubHeaders(token), ...(init.headers || {}) },
  })
}

function normalizeRun(run) {
  if (!run) return null
  const created = Date.parse(run.created_at || '')
  const updated = Date.parse(run.updated_at || '')
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
    durationMs: Number.isFinite(created) && Number.isFinite(updated) && updated >= created ? updated - created : null,
  }
}

async function latestRun(token) {
  const response = await github(
    '/repos/' + REPO + '/actions/workflows/' + WORKFLOW + '/runs?branch=' + REF + '&per_page=10',
    token,
  )
  if (!response.ok) throw new Error('GitHub workflow status could not be read.')
  const payload = await response.json()
  return payload.workflow_runs?.[0] || null
}

async function runDetails(run, token) {
  if (!run?.id) return { run: null, tests: null, jobs: [] }
  const jobsResponse = await github(
    '/repos/' + REPO + '/actions/runs/' + encodeURIComponent(String(run.id)) + '/jobs?filter=latest&per_page=20',
    token,
  )
  const jobsPayload = jobsResponse.ok ? await jobsResponse.json() : { jobs: [] }
  const jobs = jobsPayload.jobs || []
  const job = jobs[0]
  let logs = ''
  if (job?.id) {
    const logResponse = await github(
      '/repos/' + REPO + '/actions/jobs/' + encodeURIComponent(String(job.id)) + '/logs',
      token,
    )
    if (logResponse.ok) logs = (await logResponse.text()).slice(-120_000)
  }

  const passed = logs.match(/(\d+) passed(?:,|\s|$)/i)?.[1]
  const failed = logs.match(/(\d+) failed(?:,|\s|$)/i)?.[1]
  const skipped = logs.match(/(\d+) skipped(?:,|\s|$)/i)?.[1]
  const flaky = logs.match(/(\d+) flaky(?:,|\s|$)/i)?.[1]
  const tests = passed || failed || skipped || flaky
    ? {
        passed: Number(passed || 0),
        failed: Number(failed || 0),
        skipped: Number(skipped || 0),
        flaky: Number(flaky || 0),
      }
    : null

  return {
    run: normalizeRun(run),
    tests,
    jobs: jobs.map((item) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      conclusion: item.conclusion,
      startedAt: item.started_at || null,
      completedAt: item.completed_at || null,
    })),
    browserCoverage: ['Chromium / Desktop Chrome', 'Admin mobile regression at 320–430px'],
  }
}

export async function handleAdminPlaywright(req, res, { send, jsonHeaders, readJson }) {
  if (req.method !== 'POST') {
    return send(res, 405, JSON.stringify({ error: 'Method not allowed' }), { ...jsonHeaders(req), Allow: 'POST' })
  }

  const user = await getAdmin(req)
  if (!user) return send(res, 403, JSON.stringify({ error: 'Forbidden' }), jsonHeaders(req))

  const token = String(process.env.HJ_GITHUB_ACTIONS_TOKEN || '').trim()
  if (!token) {
    return send(res, 503, JSON.stringify({
      status: 'not_configured',
      error: 'Playwright control is not configured on the server.',
    }), jsonHeaders(req))
  }

  const body = await readJson(req).catch(() => ({}))
  const action = body?.action === 'start' ? 'start' : 'status'
  if (!rateLimit('admin:' + user.id + ':' + action, action === 'start' ? 1 : 12)) {
    return send(res, 429, JSON.stringify({ error: 'Playwright control is rate-limited. Please wait before trying again.' }), jsonHeaders(req))
  }

  try {
    const current = await latestRun(token)
    if (action === 'start') {
      if (current?.status && ['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(current.status)) {
        return send(res, 200, JSON.stringify({ ok: true, status: 'already_running', ...(await runDetails(current, token)) }), jsonHeaders(req))
      }

      const response = await github('/repos/' + REPO + '/actions/workflows/' + WORKFLOW + '/dispatches', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: REF }),
      })
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300)
        return send(res, 502, JSON.stringify({
          status: 'trigger_failed',
          error: 'GitHub rejected the Playwright workflow trigger.',
          detail,
        }), jsonHeaders(req))
      }

      return send(res, 200, JSON.stringify({
        ok: true,
        status: 'queued',
        repository: REPO,
        workflow: WORKFLOW,
        ref: REF,
      }), jsonHeaders(req))
    }

    return send(res, 200, JSON.stringify({
      ok: true,
      repository: REPO,
      workflow: WORKFLOW,
      ref: REF,
      ...(await runDetails(current, token)),
    }), jsonHeaders(req))
  } catch (error) {
    console.warn('[admin-playwright] control failed:', String(error?.message || error).slice(0, 300))
    return send(res, 502, JSON.stringify({ error: 'Playwright control failed.' }), jsonHeaders(req))
  }
}
