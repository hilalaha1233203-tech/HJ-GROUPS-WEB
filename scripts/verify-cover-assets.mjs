import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

const ROOT = process.cwd()
const EXPECTED_COVERS = [
  'stories/1788411106863-file_0000000014e882068f423cd2bef840db.png',
  'stories/1788586464860-6217308045835357343.jpg',
  'stories/1789997726308-6217308045835357343.jpg',
  'stories/1789997771808-6217308045835357343.jpg',
  'stories/1789998931387-6217308045835357343.jpg',
  'stories/1789999579655-6217308045835357343.jpg',
  'stories/1789999694248-6217308045835357343.jpg',
  'stories/1790000595773-8283a78b-0be0-4a14-b379-d8a549491564.jfif',
  'stories/1790866658189-Epic-Fantasy-Warriors_-75M-Plays.png',
  'stories/1790951665948-Cinematic-King_-H7-Groups-Boss-Poster.png',
  'stories/1790951925575-Mythic-Cobra-Fortress-Heroes.png',
  'stories/1790952513979-Warrior-of-the-Golden-Battlefield.png',
  'stories/1790951665948-Cinematic-King_-H7-Groups-Boss-Poster.png',
]
const EXPECTED_COVER_COUNT = 13
const MAX_STATIC_FILE_BYTES = 25 * 1024 * 1024
const MAX_THUMB_BYTES = 80 * 1024
const MAX_LARGE_BYTES = 2 * 1024 * 1024
const errors = []

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = path.join(dir, item.name)
    return item.isDirectory() ? walk(full) : [full]
  })
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) }
  catch (error) {
    errors.push('Cannot read valid JSON from ' + path.relative(ROOT, file) + ': ' + error.message)
    return null
  }
}

const sourceManifestPath = path.join(ROOT, 'src/lib/cover-manifest.json')
const publicManifestPath = path.join(ROOT, 'public/cover-manifest.json')
const sourceManifest = readJson(sourceManifestPath)
const publicManifest = readJson(publicManifestPath)
if (sourceManifest && publicManifest && JSON.stringify(sourceManifest) !== JSON.stringify(publicManifest)) {
  errors.push('src/lib/cover-manifest.json and public/cover-manifest.json are not identical.')
}

const manifest = publicManifest && publicManifest.covers && typeof publicManifest.covers === 'object'
  ? publicManifest
  : { version: null, covers: {} }
const byOriginalPath = new Map()
for (const entry of Object.values(manifest.covers)) {
  if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string') continue
  if (!byOriginalPath.has(entry.path)) byOriginalPath.set(entry.path, entry)
}
const expectedSet = new Set(EXPECTED_COVERS)
if (byOriginalPath.size !== EXPECTED_COVER_COUNT) {
  errors.push('Manifest unique original cover paths: ' + byOriginalPath.size + '; expected ' + EXPECTED_COVER_COUNT + '.')
}
for (const sourcePath of EXPECTED_COVERS) {
  if (!byOriginalPath.has(sourcePath)) errors.push('Manifest does not contain expected source cover: ' + sourcePath)
}
for (const sourcePath of byOriginalPath.keys()) {
  if (!expectedSet.has(sourcePath)) errors.push('Manifest contains an unexpected source cover path: ' + sourcePath)
}

const requiredAssets = new Set()
for (const [sourcePath, entry] of byOriginalPath) {
  const src = String(entry.src || '')
  const srcMatch = src.match(/^\/covers\/([a-f0-9]{64}-800\.webp)$/i)
  if (!srcMatch) {
    errors.push(sourcePath + ': src must be a hashed /covers/<sha256>-800.webp path.')
  } else {
    requiredAssets.add(srcMatch[1])
  }
  const srcSet = String(entry.srcSet || '')
  const variantMatches = [...srcSet.matchAll(/\/covers\/([a-f0-9]{64}-(?:400|800)\.webp)\s+\d+w/gi)]
  const variants = new Set(variantMatches.map((match) => match[1]))
  if (variants.size !== 2 || ![...variants].some((name) => name.endsWith('-400.webp')) || ![...variants].some((name) => name.endsWith('-800.webp'))) {
    errors.push(sourcePath + ': srcSet must contain both hashed 400w and 800w WebP variants.')
  }
  for (const match of variantMatches) requiredAssets.add(match[1])
}

const publicCoverDir = path.join(ROOT, 'public/covers')
const staticCoverFiles = walk(publicCoverDir).filter((file) => file.toLowerCase().endsWith('.webp'))
const staticCoverNames = new Set(staticCoverFiles.map((file) => path.relative(publicCoverDir, file).split(path.sep).join('/')))
if (staticCoverNames.size !== 26) {
  errors.push('Committed public/covers WebP file count: ' + staticCoverNames.size + '; expected 26 (13 covers × 400/800 variants).')
}
for (const required of requiredAssets) {
  if (!staticCoverNames.has(required)) errors.push('Manifest asset is missing from public/covers: ' + required)
}
for (const actual of staticCoverNames) {
  if (!requiredAssets.has(actual)) errors.push('Orphan/unreferenced WebP asset in public/covers: ' + actual)
}
for (const file of staticCoverFiles) {
  const name = path.basename(file)
  const bytes = fs.statSync(file).size
  if (bytes > MAX_STATIC_FILE_BYTES) errors.push(name + ': exceeds Pages 25 MiB static-file limit (' + bytes + ' bytes).')
  if (/-400\.webp$/i.test(name) && bytes > MAX_THUMB_BYTES) errors.push(name + ': thumbnail exceeds 80 KiB target (' + bytes + ' bytes).')
  if (/-800\.webp$/i.test(name) && bytes > MAX_LARGE_BYTES) errors.push(name + ': large variant exceeds 2 MiB target (' + bytes + ' bytes).')
}

const distFiles = walk(path.join(ROOT, 'dist'))
if (!fs.existsSync(path.join(ROOT, 'dist'))) {
  errors.push('dist/ is missing; run npm run build before cover/Pages limit verification.')
}
if (distFiles.length > 20000) errors.push('dist/ contains ' + distFiles.length + ' files; Pages static asset limit is 20,000 files.')
for (const file of distFiles) {
  const bytes = fs.statSync(file).size
  if (bytes > MAX_STATIC_FILE_BYTES) errors.push(path.relative(ROOT, file) + ': exceeds Pages 25 MiB static-file limit (' + bytes + ' bytes).')
}
const distCoverFiles = walk(path.join(ROOT, 'dist/covers')).filter((file) => file.toLowerCase().endsWith('.webp'))
if (distCoverFiles.length !== 26) {
  errors.push('Built dist/covers WebP file count: ' + distCoverFiles.length + '; expected 26.')
}
let trackedOriginals = ''
try {
  trackedOriginals = execFileSync('git', ['ls-files', '--', 'tools/cover-source/stories'], { encoding: 'utf8' }).trim()
} catch (error) {
  errors.push('Could not inspect tracked source originals via git ls-files: ' + error.message)
}
if (trackedOriginals) errors.push('Downloaded originals must never be committed; tracked source files found under tools/cover-source/stories.')

console.log('Cover asset audit: expected originals=' + EXPECTED_COVER_COUNT +
  ', manifest paths=' + byOriginalPath.size +
  ', public WebP files=' + staticCoverNames.size +
  ', dist files=' + distFiles.length +
  ', dist WebP files=' + distCoverFiles.length)
if (errors.length) {
  console.error('Cover asset verification FAILED:')
  for (const error of errors) console.error(' - ' + error)
  process.exitCode = 1
} else {
  console.log('Cover asset verification PASS: manifests match, 13 source covers mapped, 26 optimized WebP files present, no source originals tracked, and Pages static asset limits satisfied.')
}
