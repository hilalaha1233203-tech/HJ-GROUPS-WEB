import { createSupabaseContext } from 'npm:@supabase/server@1'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const repo = 'hilalaha1233203-tech/HJ-GROUPS-WEB'
const productionBase = 'https://hj-groups-website.getvoroa.com'
const allowedOrigins = new Set(['https://hj-groups-website.getvoroa.com', 'https://hj-groups-web.vercel.app'])
const rateBuckets = new Map<string, { startedAt: number; count: number }>()
let monitorKeyPromise: Promise<string> | null = null

async function getMonitorKey(db: any) {
  if (monitorKeyPromise) return monitorKeyPromise
  monitorKeyPromise = (async () => {
    const { data, error } = await db.rpc('get_security_monitor_key')
    if (error || !data) throw new Error('monitor key unavailable')
    return String(data)
  })()
  return monitorKeyPromise
}

const corsHeaders = (req: Request) => {
  const origin = req.headers.get('origin') || ''
  const trustedOrigin = allowedOrigins.has(origin) ? origin : 'https://hj-groups-website.getvoroa.com'
  return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hj-monitor-key',
    'Access-Control-Allow-Origin': trustedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const safe = (v: unknown, max = 700) => String(v ?? '')
  .replace(/(?:sk_|eyJ|sb_(?:secret|publishable)_)[A-Za-z0-9_\-.]+/g, '[REDACTED]')
  .slice(0, max)

const finding = (
  severity: string,
  category: string,
  component: string,
  location: string,
  description: string,
  impact: string,
  evidence: unknown,
  root: string,
  recommend: string,
  verification: string,
) => ({
  severity,
  category,
  component,
  location,
  description,
  impact,
  evidence: safe(evidence),
  root_cause: root,
  recommended_fix: recommend,
  verification,
})

function rateLimit(key: string, limit = 4, windowMs = 60_000) {
  const now = Date.now()
  const bucket = rateBuckets.get(key)
  if (!bucket || now - bucket.startedAt >= windowMs) {
    rateBuckets.set(key, { startedAt: now, count: 1 })
    return true
  }
  bucket.count += 1
  return bucket.count <= limit
}

async function authorize(req: Request, db: any) {
  const suppliedKey = req.headers.get('x-hj-monitor-key') || ''
  if (suppliedKey) {
    const expected = await getMonitorKey(db)
    if (suppliedKey === expected) return { kind: 'internal', userId: null }
  }

  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user || data.user.app_metadata?.role !== 'admin') return null
  return { kind: 'admin', userId: data.user.id }
}

async function check(url: string, init: RequestInit = {}) {
  try {
    const r = await fetch(url, { ...init, redirect: 'manual' })
    return {
      ok: true,
      status: r.status,
      headers: Object.fromEntries(
        [...r.headers].filter(([k]) => [
          'content-security-policy',
          'strict-transport-security',
          'x-content-type-options',
          'referrer-policy',
          'permissions-policy',
          'access-control-allow-origin',
        ].includes(k.toLowerCase()))
      ),
      body: safe(await r.text(), 500),
    }
  } catch (e) {
    return { ok: false, error: safe(e) }
  }
}

async function github(path: string) {
  const r = await fetch('https://raw.githubusercontent.com/' + repo + '/main/' + path, {
    headers: { 'User-Agent': 'HJ-GROUPS-Security-Monitor' },
  })
  return r.ok ? await r.text() : ''
}

async function osv(packages: Array<{ name: string; version: string }>) {
  try {
    const body = packages.map((p) => ({ package: { name: p.name, ecosystem: 'npm' }, version: p.version }))
    const r = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: body }),
    })
    if (!r.ok) return []
    const j = await r.json()
    return (j.results || []).flatMap((x: any, i: number) =>
      (x.vulns || []).map((v: any) => ({ ...v, package: packages[i] }))
    )
  } catch {
    return []
  }
}

async function runScan(db: any, trigger: 'manual' | 'scheduled' = 'manual') {
  const started = new Date().toISOString()
  const findings: any[] = []
  const phases = [
    { key: 'infrastructure', label: 'Infrastructure & Headers' },
    { key: 'api', label: 'API & CORS' },
    { key: 'authentication', label: 'Admin Authentication' },
    { key: 'environment', label: 'Source & Environment Secrets' },
    { key: 'client-media', label: 'Client & Media Protection' },
    { key: 'dependencies', label: 'Dependency Advisories' },
    { key: 'database', label: 'Database / RLS' },
  ]
  const checks = phases.map((phase) => ({ ...phase, status: 'pending', completedAt: null }))
  let scanId: number | null = null

  const persistProgress = async (completedChecks: number, currentCheck: string | null = null) => {
    if (!scanId) return
    const percent = Math.round((completedChecks / phases.length) * 100)
    const nextChecks = checks.map((item, index) => ({
      ...item,
      status: index < completedChecks ? 'completed' : index === completedChecks && currentCheck ? 'running' : 'pending',
      completedAt: index < completedChecks ? new Date().toISOString() : null,
    }))
    const { error } = await db.from('security_scans').update({
      summary: {
        progress_percent: percent,
        completed_checks: completedChecks,
        total_checks: phases.length,
        current_check: currentCheck,
        checks: nextChecks,
        trigger,
      },
    }).eq('id', scanId)
    if (error) throw error
  }

  const { data: initialScan, error: initialScanError } = await db.from('security_scans').insert({
    started_at: started,
    status: 'running',
    summary: {
      progress_percent: 0,
      completed_checks: 0,
      total_checks: phases.length,
      current_check: phases[0].label,
      checks,
      trigger,
    },
  }).select('id').single()
  if (initialScanError) throw initialScanError
  scanId = initialScan.id

  const health = await check(productionBase + '/health')
  if (!health.ok || health.status !== 200) {
    findings.push(finding(
      'high', 'infrastructure', 'web-server', '/health',
      'Production health endpoint did not return HTTP 200.',
      'Availability and integration health cannot be confirmed.',
      JSON.stringify(health),
      'Production service unavailable or health route failing.',
      'Restore service health and verify the endpoint from an external client.',
      'Repeat GET /health and confirm HTTP 200.',
    ))
  }

  for (const header of ['x-content-type-options', 'referrer-policy', 'permissions-policy', 'strict-transport-security']) {
    if (!health.headers?.[header]) {
      findings.push(finding(
        header === 'strict-transport-security' ? 'medium' : 'low',
        'security', 'security-headers', '/health',
        'A recommended security response header is missing: ' + header + '.',
        'The missing header reduces browser-side hardening for the production origin.',
        JSON.stringify({ header, status: health.status }),
        'Header was not observed on the production health response.',
        'Add the header at the server/CDN boundary without weakening trusted-origin behavior.',
        'Repeat the external header check and verify the header is present.',
      ))
    }
  }

  await persistProgress(1, phases[1].label)

  const evilCors = await check(productionBase + '/api/tts', {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
  })
  if (evilCors.headers?.['access-control-allow-origin'] === '*' || evilCors.headers?.['access-control-allow-origin'] === 'https://evil.example') {
    findings.push(finding(
      'high', 'security', 'cors', '/api/tts',
      'CORS permits an untrusted origin.',
      'An untrusted website could make cross-origin API requests where browser credentials or responses are otherwise usable.',
      JSON.stringify(evilCors.headers),
      'Trusted-origin CORS boundary is too broad.',
      'Allow only explicitly trusted HJ GROUPS web origins.',
      'Repeat the preflight with an untrusted Origin and verify no permissive ACAO is returned.',
    ))
  }

  const publicSettings = await check(productionBase + '/api/public-settings')
  if (!publicSettings.ok || publicSettings.status !== 200) {
    findings.push(finding(
      'medium', 'bug', 'public-settings', '/api/public-settings',
      'Public settings endpoint is unavailable.',
      'Site identity/support configuration may not load.',
      JSON.stringify(publicSettings),
      'Endpoint or backend configuration failure.',
      'Restore the endpoint and keep its response limited to non-sensitive public settings.',
      'Repeat GET and verify only approved public fields are returned.',
    ))
  }

  await persistProgress(2, phases[2].label)

  const protectedApis = [
    '/api/admin/analytics',
    '/api/admin/user-export.xlsx',
    '/api/admin/notifications/send',
  ]
  for (const path of protectedApis) {
    const method = path.endsWith('send') ? 'POST' : 'GET'
    const result = await check(productionBase + path, { method })
    if (result.status !== 401 && result.status !== 403) {
      findings.push(finding(
        'critical', 'security', 'admin-auth', path,
        'Unauthenticated request was not rejected by an admin-only endpoint.',
        'A caller could potentially access privileged administrative data or actions.',
        JSON.stringify({ status: result.status }),
        'Admin route authorization boundary may be missing or changed.',
        'Require a valid Supabase session and server-side admin role check.',
        'Repeat the unauthenticated request and verify HTTP 401/403.',
      ))
    }
  }

  await persistProgress(3, phases[3].label)

  const sources = [
    'server.mjs',
    'server/payment.mjs',
    'server/shortenerUnlock.mjs',
    'server/rewardedAdUnlock.mjs',
    'server/webPush.mjs',
    'server/adminAuth.mjs',
    'src/supabase.js',
    'src/Auth.jsx',
    'src/App.jsx',
    'src/AdminPanel.jsx',
    'src/lib/secureMedia.js',
  ]
  const sourceMap = new Map<string, string>()
  for (const path of sources) sourceMap.set(path, await github(path))

  for (const [path, source] of sourceMap) {
    if (/(?:SUPABASE_SERVICE_ROLE_KEY|CASHFREE_CLIENT_SECRET|WEB_PUSH_VAPID_PRIVATE_KEY|TELEGRAM_API_HASH|AROLINKS_API_TOKEN|EARN4LINK_API_TOKEN|UNLOCK_TOKEN_SECRET)\s*[:=]\s*['"][^'"]{8,}/i.test(source)) {
      findings.push(finding(
        'critical', 'security', 'secret-exposure', path,
        'A server secret appears to be hardcoded in source.',
        'Credentials committed to source can be copied and abused.',
        path,
        'Confirmed by source scan.',
        'Move the value to server-side environment/secrets and reference it only at runtime.',
        'Rescan the repository and verify no literal secret remains.',
      ))
    }
  }

  const envSecretNames = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'CASHFREE_CLIENT_SECRET',
    'WEB_PUSH_VAPID_PRIVATE_KEY',
    'TELEGRAM_API_HASH',
    'AROLINKS_API_TOKEN',
    'EARN4LINK_API_TOKEN',
    'UNLOCK_TOKEN_SECRET',
    'GITHUB_TOKEN',
    'HJ_GITHUB_ACTIONS_TOKEN',
  ]
  const combinedSource = [...sourceMap.values()].join('\n')
  for (const name of envSecretNames) {
    if (new RegExp('VITE_' + name + '\\b').test(combinedSource)) {
      findings.push(finding(
        'critical', 'security', 'environment-secrets', name,
        'A server-only secret name is exposed through a VITE_ client environment variable.',
        'VITE_ variables are bundled into browser code and are not suitable for server credentials.',
        'VITE_' + name,
        'Server-only environment variable is prefixed for client exposure.',
        'Keep this credential server-side and remove the VITE_ prefix.',
        'Search the source and build output for the secret name and verify it is not client-exposed.',
      ))
    }
  }

  await persistProgress(4, phases[4].label)

  const clientSecurity = await github('src/App.jsx') + '\n' + await github('src/AdminPanel.jsx')
  if (/dangerouslySetInnerHTML|\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(clientSecurity)) {
    findings.push(finding(
      'high', 'security', 'client-security', 'src/App.jsx / src/AdminPanel.jsx',
      'A dangerous client-side HTML/JavaScript sink is present.',
      'Unsafe rendering can create an XSS path when attacker-controlled content reaches the sink.',
      clientSecurity.match(/dangerouslySetInnerHTML|\beval\s*\(|new Function\s*\(|document\.write\s*\(/)?.[0],
      'A dangerous browser execution sink exists in client code.',
      'Remove the sink or strictly sanitize and constrain the input at a trusted boundary.',
      'Retest the affected UI with hostile HTML/URL payloads and verify it renders as text.',
    ))
  }

  const secureMedia = sourceMap.get('src/lib/secureMedia.js') || ''
  if (!/protectedTypes|premium|vip|ads/.test(secureMedia) || !/api\/(?:shortener|ads|media|telegram)/.test(secureMedia)) {
    findings.push(finding(
      'medium', 'security', 'media-protection', 'src/lib/secureMedia.js',
      'The source scan could not fully confirm the protected-media access boundary.',
      'Premium/VIP/Ads media could be exposed if access checks are bypassed.',
      'Protected media source markers were incomplete.',
      'Expected protected media checks were not fully detectable from the static source scan.',
      'Review the server-side media authorization and signed/protected URL flow.',
      'Run authenticated and unauthenticated media access tests for free and protected content.',
    ))
  }

  await persistProgress(5, phases[5].label)

  const lock = await github('package-lock.json')
  if (lock) {
    try {
      const j = JSON.parse(lock)
      const pk = Object.entries(j.packages || {})
        .filter(([k]) => k.startsWith('node_modules/'))
        .map(([k, v]: any) => ({ name: k.replace('node_modules/', ''), version: v.version }))
        .filter((v) => v.version)
        .slice(0, 200)
      for (const v of await osv(pk)) {
        const severity = String(v.severity || v.database_specific?.severity || '').toUpperCase()
        if (['HIGH', 'CRITICAL'].includes(severity)) {
          findings.push(finding(
            'high', 'dependency', v.package.name, 'package-lock.json',
            'A dependency has a high/critical OSV advisory.',
            'Known vulnerable dependencies may be exploitable depending on reachability.',
            JSON.stringify({ id: v.id, summary: v.summary, version: v.package.version }),
            'Published vulnerability advisory.',
            'Upgrade or replace the affected dependency after compatibility review; do not auto-upgrade in the scanner.',
            'Run the full dependency audit after the approved dependency change.',
          ))
        }
      }
    } catch {
      findings.push(finding(
        'medium', 'dependency', 'package-lock.json', 'package-lock.json',
        'Dependency lockfile could not be parsed.',
        'Dependency security status cannot be fully verified.',
        'JSON parse failed.',
        'Lockfile is malformed or unavailable to the scanner.',
        'Restore a valid package-lock.json and rerun dependency verification.',
        'Run npm ci and npm audit in CI.',
      ))
    }
  }

  await persistProgress(6, phases[6].label)

  let snapshot: any = null
  try {
    const { data, error } = await db.rpc('security_monitor_snapshot')
    if (error) throw error
    snapshot = data
  } catch (e) {
    findings.push(finding(
      'medium', 'security', 'database', 'security_monitor_snapshot',
      'Database security introspection could not be completed.',
      'RLS/function/policy state was not fully verified.',
      String(e?.message || e),
      'Snapshot RPC unavailable or authorization changed.',
      'Restore the server-only introspection path and retest.',
      'Run the snapshot RPC from the monitoring function.',
    ))
  }

  if (snapshot) {
    const publicTables = new Set(['security_scans', 'security_findings'])
    for (const row of snapshot.tables || []) {
      if (!row.rls_enabled && !publicTables.has(row.table_name)) {
        findings.push(finding(
          'high', 'security', 'database-rls', row.table_name,
          'A public table has Row Level Security disabled.',
          'Data exposed through the Supabase Data API may be accessible without row-level authorization.',
          JSON.stringify(row),
          'RLS is disabled on an exposed public table.',
          'Enable RLS and add narrowly scoped policies for the required access model.',
          'Run the Supabase security advisor and verify RLS is enabled.',
        ))
      }
    }
    for (const row of snapshot.public_execute_security_definer || []) {
      findings.push(finding(
        'high', 'security', 'database', row.name,
        'A SECURITY DEFINER function in public is executable by PUBLIC.',
        'A privileged database function may become an unintended public API.',
        JSON.stringify(row),
        'PUBLIC execute privilege on a SECURITY DEFINER function.',
        'Revoke PUBLIC execute and expose only through an authenticated server boundary.',
        'Query function privileges and verify PUBLIC cannot execute it.',
      ))
    }
  }

  await persistProgress(7, null)

  const summary = {
    finding_count: findings.length,
    critical: findings.filter((x) => x.severity === 'critical').length,
    high: findings.filter((x) => x.severity === 'high').length,
    medium: findings.filter((x) => x.severity === 'medium').length,
    low: findings.filter((x) => x.severity === 'low').length,
    informational: findings.filter((x) => x.severity === 'informational').length,
    trigger,
  }
  const status = summary.critical || summary.high ? 'issues_found' : summary.medium ? 'warnings' : 'secure'
  const scan = {
    finished_at: new Date().toISOString(),
    status: 'completed',
    summary: {
      ...summary,
      overall: status,
      progress_percent: 100,
      completed_checks: phases.length,
      total_checks: phases.length,
      current_check: null,
      checks: checks.map((item) => ({ ...item, status: 'completed', completedAt: new Date().toISOString() })),
    },
  }

  const { data: scanRow, error: scanError } = await db.from('security_scans').update(scan).eq('id', scanId).select('id').single()
  if (scanError || !scanRow) throw (scanError || new Error('Security scan row was not found.'))

  for (const f of findings) {
    const fingerprint = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify([f.category, f.component, f.location, f.description]))
    ).then((b) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join(''))

    const { data: existing } = await db
      .from('security_findings')
      .select('first_detected_at,recurring_count,status')
      .eq('fingerprint', fingerprint)
      .maybeSingle()

    const nextStatus = existing?.status && ['fixed', 'retested', 'closed'].includes(existing.status)
      ? 'new'
      : (existing?.status || 'new')

    await db.from('security_findings').upsert({
      fingerprint,
      first_detected_at: existing?.first_detected_at || new Date().toISOString(),
      last_detected_at: new Date().toISOString(),
      severity: f.severity,
      category: f.category,
      status: nextStatus,
      component: f.component,
      location: f.location,
      description: f.description,
      impact: f.impact,
      evidence: f.evidence,
      root_cause: f.root_cause,
      recommended_fix: f.recommended_fix,
      verification: f.verification,
      recurring_count: Number(existing?.recurring_count || 0) + 1,
      last_scan_id: scanRow.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'fingerprint', ignoreDuplicates: false })
  }

  return { scanId: scanRow.id, summary, findings, progress: scan.summary }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors })

  let db: any = null
  try {
    const { data: context, error: contextError } = await createSupabaseContext(req, { auth: 'none' })
    if (contextError || !context?.supabaseAdmin) {
      return Response.json({ ok: false, error: 'Security monitor backend context is unavailable.' }, { status: 500, headers: cors })
    }
    db = context.supabaseAdmin

    const caller = await authorize(req, db)
    if (!caller) return Response.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: cors })

    const key = caller.kind === 'internal' ? 'internal' : 'admin:' + caller.userId
    if (!rateLimit(key)) {
      return Response.json({ ok: false, error: 'Security scan is rate-limited. Please wait before running another scan.' }, { status: 429, headers: cors })
    }

    const body = await req.json().catch(() => ({}))
    const trigger = caller.kind === 'internal' || body?.scheduled === true ? 'scheduled' : 'manual'

    const { data: running } = await db
      .from('security_scans')
      .select('id,started_at')
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (running) {
      return Response.json({ ok: false, error: 'A security scan is already running.', scanId: running.id }, { status: 409, headers: cors })
    }

    const result = await runScan(db, trigger)
    return Response.json({ ok: true, ...result }, { headers: cors })
  } catch (e) {
    try {
      if (!db) throw new Error('Security monitor database context unavailable.')
      const { data: running } = await db
        .from('security_scans')
        .select('id,summary')
        .eq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (running?.id) {
        await db.from('security_scans').update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          summary: {
            ...(running.summary || {}),
            current_check: null,
            error: 'Security scan failed before completion.',
          },
        }).eq('id', running.id)
      }
    } catch {
      // Preserve the generic failure response even if failure-state persistence is unavailable.
    }
    return Response.json({ ok: false, error: 'Security scan failed' }, { status: 500, headers: cors })
  }
})
