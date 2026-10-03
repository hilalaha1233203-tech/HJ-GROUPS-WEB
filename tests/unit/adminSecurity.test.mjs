import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')

test('admin authorization is role-based and not source-visible email/password based', () => {
  const app = read('src/App.jsx')
  const auth = read('server/adminAuth.mjs')
  const server = read('server.mjs')
  const exportSource = read('server/adminUserExport.mjs')
  const shortener = read('server/shortenerUnlock.mjs')

  assert.match(app, /user\?\.app_metadata\?\.role\s*===\s*'admin'/)
  assert.match(auth, /app_metadata\?\.role\s*===\s*'admin'/)
  assert.match(server, /isHjAdminUser\(userData\?\.user\)/)
  assert.match(exportSource, /isHjAdminUser\(userData\?\.user\)/)
  assert.match(shortener, /isHjAdminUser\(user\)/)

  for (const source of [app, server, exportSource, shortener]) {
    assert.equal(source.includes("const ADMIN_EMAIL"), false)
    assert.equal(/ADMIN_PASSWORD\\s*=/.test(source), false)
  }

  assert.equal(fs.existsSync('src/Admin.jsx'), false)
})
