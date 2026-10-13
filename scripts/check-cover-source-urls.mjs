import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const RUNTIME_ROOTS = ['src', 'functions', 'public', 'index.html']
const EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx', '.html', '.css', '.json'])
const MANIFESTS = new Set(['src/lib/cover-manifest.json', 'public/cover-manifest.json'])
const SUPABASE_STORAGE_URL = /https?:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/(?:public|authenticated|sign)\//i
const WSERV = /wsrv\.nl/i
const errors = []

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

function walk(entry) {
  if (!fs.existsSync(entry)) return []
  const stat = fs.statSync(entry)
  if (stat.isFile()) return [entry]
  return fs.readdirSync(entry, { withFileTypes: true }).flatMap((item) => {
    const full = path.join(entry, item.name)
    return item.isDirectory() ? walk(full) : [full]
  })
}

function isAllowedStoryCoverFallback(value, expectedPath) {
  try {
    const url = new URL(String(value || ''))
    const prefix = '/storage/v1/object/public/story-covers/'
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'yajkfglagnyvenddyvok.supabase.co') return false
    if (!url.pathname.startsWith(prefix)) return false
    const objectPath = decodeURIComponent(url.pathname.slice(prefix.length))
    return Boolean(expectedPath) && objectPath === String(expectedPath)
  } catch {
    return false
  }
}

function inspectManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    errors.push('Missing cover manifest: ' + relative(manifestPath))
    return
  }
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    errors.push('Invalid JSON in ' + relative(manifestPath) + ': ' + error.message)
    return
  }
  const covers = manifest && manifest.covers && typeof manifest.covers === 'object' ? manifest.covers : {}
  for (const [key, entry] of Object.entries(covers)) {
    if (WSERV.test(key)) errors.push(relative(manifestPath) + ': wsrv.nl is not allowed as a manifest key.')
    if (SUPABASE_STORAGE_URL.test(key) && (!entry || key !== entry.originalUrl || !isAllowedStoryCoverFallback(key, entry.path))) {
      errors.push(relative(manifestPath) + ': direct Supabase URL is allowed only as the matching originalUrl fallback key.')
    }
    if (!entry || typeof entry !== 'object') continue
    for (const field of ['src', 'srcSet']) {
      const value = String(entry[field] || '')
      if (SUPABASE_STORAGE_URL.test(value)) errors.push(relative(manifestPath) + ': ' + field + ' must not point to Supabase Storage.')
      if (WSERV.test(value)) errors.push(relative(manifestPath) + ': ' + field + ' must not point to wsrv.nl.')
    }
    const original = String(entry.originalUrl || '')
    if (SUPABASE_STORAGE_URL.test(original) && !isAllowedStoryCoverFallback(original, entry.path)) {
      errors.push(relative(manifestPath) + ': originalUrl must be a matching story-covers fallback URL.')
    }
    if (WSERV.test(original)) errors.push(relative(manifestPath) + ': originalUrl must not point to wsrv.nl.')
  }
}

for (const item of RUNTIME_ROOTS) {
  const root = path.join(ROOT, item)
  for (const file of walk(root)) {
    const rel = relative(file)
    if (MANIFESTS.has(rel)) continue
    if (!EXTENSIONS.has(path.extname(file).toLowerCase())) continue
    const source = fs.readFileSync(file, 'utf8')
    if (SUPABASE_STORAGE_URL.test(source)) {
      errors.push(rel + ': hard-coded Supabase Storage object URL found in runtime source.')
    }
    if (WSERV.test(source)) {
      if (rel !== 'src/lib/coverAssets.js') {
        errors.push(rel + ': wsrv.nl is allowed only in src/lib/coverAssets.js legacy URL un-wrapper.')
      }
    }
  }
}

const coverAssetsPath = path.join(ROOT, 'src/lib/coverAssets.js')
if (!fs.existsSync(coverAssetsPath)) {
  errors.push('Missing src/lib/coverAssets.js legacy URL compatibility helper.')
} else {
  const coverAssets = fs.readFileSync(coverAssetsPath, 'utf8')
  const wsrvMatches = coverAssets.match(/wsrv\.nl/gi) || []
  if (wsrvMatches.length !== 1) errors.push('src/lib/coverAssets.js must have exactly one wsrv.nl reference for legacy URL parsing.')
  if (!/parsed\.hostname\.toLowerCase\(\)\s*===\s*['"]wsrv\.nl['"]/.test(coverAssets) ||
      !/parsed\.searchParams\.get\(['"]url['"]\)/.test(coverAssets)) {
    errors.push('The wsrv.nl allowlist is valid only for parsing the pre-existing ?url= value.')
  }
  if (/https?:\/\/wsrv\.nl/i.test(coverAssets) || /searchParams\.set\(['"](?:w|h|q|output|fit)['"]/.test(coverAssets)) {
    errors.push('Runtime source must not construct new wsrv.nl transformation requests.')
  }
}

for (const file of ['src/lib/cover-manifest.json', 'public/cover-manifest.json']) {
  inspectManifest(path.join(ROOT, file))
}

const optimizerPath = path.join(ROOT, 'scripts/optimize-covers.py')
if (fs.existsSync(optimizerPath)) {
  const optimizer = fs.readFileSync(optimizerPath, 'utf8')
  if (!optimizer.includes('SUPABASE_BUCKET_BASE') || !optimizer.includes('storage/v1/object/public/story-covers/')) {
    errors.push('Offline cover generator must document its source bucket only for originalUrl fallback metadata.')
  }
  if (WSERV.test(optimizer)) errors.push('Offline cover generator must not generate wsrv.nl URLs.')
}

if (errors.length) {
  console.error('Cover source URL guard FAILED:')
  for (const error of errors) console.error(' - ' + error)
  process.exitCode = 1
} else {
  console.log('Cover source URL guard PASS: no hard-coded Supabase Storage object URLs in runtime source; only the documented story-covers originalUrl fallback and legacy wsrv.nl URL un-wrapper are allowed.')
}
