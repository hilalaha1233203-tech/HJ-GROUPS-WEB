import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')

test('manual security check is admin-only and server-side', () => {
  const fn = read('supabase/functions/hj-security-monitor/index.ts')
  const panel = read('src/AdminPanel.jsx')
  assert.match(fn, /app_metadata\?\.role !== 'admin'/)
  assert.match(fn, /security_scans/)
  assert.match(fn, /security_monitor_snapshot/)
  assert.match(fn, /VITE_/)
  assert.match(fn, /WEB_PUSH_VAPID_PRIVATE_KEY/)
  assert.match(panel, /Run Security Check/)
  assert.match(panel, /hj-security-monitor/)
  assert.match(panel, /disabled=\{manualSecurityRunning\}/)
})

test('Playwright control uses only the fixed workflow and ref', () => {
  const fn = read('server/playwrightControl.mjs')
  const workflow = read('.github/workflows/playwright.yml')
  const panel = read('src/AdminPanel.jsx')
  assert.match(fn, /const REPO = 'hilalaha1233203-tech\/HJ-GROUPS-WEB'/)
  assert.match(fn, /const WORKFLOW = 'playwright\.yml'/)
  assert.match(fn, /const REF = 'main'/)
  assert.match(fn, /HJ_GITHUB_ACTIONS_TOKEN/)
  assert.doesNotMatch(fn, /body\.repo|body\.workflow|body\.ref/)
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(panel, /Run Playwright Check/)
  assert.match(panel, /\/api\/admin\/playwright/)
})

test('mobile admin overlay uses dynamic viewport units and safe-area padding', () => {
  const css = read('src/App.css')
  assert.match(css, /\.admin-overlay\s*\{[\s\S]*height: 100dvh/)
  assert.match(css, /\.admin-panel\s*\{[\s\S]*height: calc\(100dvh/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
  assert.match(css, /\.bulk-telegram-section\s*\{[\s\S]*overflow: visible/)
})
