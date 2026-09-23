import { test, expect } from '@playwright/test'

async function collectHealth(page, action) {
  const consoleErrors = []
  const pageErrors = []
  const failedRequests = []
  const badResponses = []

  const onConsole = (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    consoleErrors.push(text)
  }

  const onPageError = (error) => {
    const text = error?.message || String(error)
    pageErrors.push(text)
  }

  const onRequestFailed = (request) => {
    const text = request.method() + ' ' + request.url() + ' :: ' + (request.failure()?.errorText || 'request failed')
    failedRequests.push(text)
  }

  const onResponse = (response) => {
    if (response.status() < 400) return
    const text = response.status() + ' ' + response.request().method() + ' ' + response.url()
    badResponses.push(text)
  }

  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('requestfailed', onRequestFailed)
  page.on('response', onResponse)

  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await action()
    await page.waitForTimeout(1000)
  } finally {
    page.off('console', onConsole)
    page.off('pageerror', onPageError)
    page.off('requestfailed', onRequestFailed)
    page.off('response', onResponse)
  }

  return { consoleErrors, pageErrors, failedRequests, badResponses }
}

function mergeHealth(items) {
  return {
    consoleErrors: items.flatMap((item) => item.consoleErrors),
    pageErrors: items.flatMap((item) => item.pageErrors),
    failedRequests: items.flatMap((item) => item.failedRequests),
    badResponses: items.flatMap((item) => item.badResponses),
  }
}

test.describe('HJ GROUPS public website health', () => {
  test('home shell loads', async ({ page }) => {
    const health = await collectHealth(page, async () => {
      await expect(page.locator('body')).toBeVisible()
      await expect(page.getByText('Audio Stories', { exact: true }).first()).toBeVisible()

      const particleCanvas = page.locator('.particle-canvas').first()
      await expect(particleCanvas).toBeVisible()
      const particlePosition = await particleCanvas.evaluate((element) => getComputedStyle(element).position)
      expect(particlePosition).toBe('fixed')

      const logoParticleData = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
        hasCanvas: Boolean(document.querySelector('.particle-canvas')),
        hasTouchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      }))
      expect(logoParticleData.hasCanvas).toBe(true)
    })

    await test.info().attach('home-health.json', {
      body: JSON.stringify(health, null, 2),
      contentType: 'application/json',
    })

    if (process.env.STRICT_QA === 'true') {
      expect(health.pageErrors, 'unexpected page errors').toEqual([])
      expect(health.consoleErrors, 'unexpected console errors').toEqual([])
      expect(health.failedRequests, 'failed network requests').toEqual([])
      expect(health.badResponses, 'HTTP 4xx/5xx responses').toEqual([])
    }
  })

  test('public tabs and modals open without crashing', async ({ page }) => {
    const labels = ['Home', 'Audio Stories', 'Books', 'Videos', 'VIP', 'Library', 'Login']
    const reports = []

    for (const label of labels) {
      const health = await collectHealth(page, async () => {
        const button = page.getByRole('button', { name: new RegExp('^.*' + label + '.*$', 'i') }).first()
        if (await button.count()) {
          await button.click()
          await page.waitForTimeout(700)
        }
        await expect(page.locator('body')).toBeVisible()
      })
      reports.push({ label, ...health })
      await page.keyboard.press('Escape').catch(() => {})
    }

    await test.info().attach('public-tabs-health.json', {
      body: JSON.stringify(reports, null, 2),
      contentType: 'application/json',
    })

    const merged = mergeHealth(reports)
    console.log(JSON.stringify({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://hj-groups-website.getvoroa.com',
      scanned: labels,
      ...merged,
    }, null, 2))

    if (process.env.STRICT_QA === 'true') {
      expect(merged.pageErrors, 'unexpected page errors').toEqual([])
      expect(merged.consoleErrors, 'unexpected console errors').toEqual([])
      expect(merged.failedRequests, 'failed network requests').toEqual([])
      expect(merged.badResponses, 'HTTP 4xx/5xx responses').toEqual([])
    }
  })
})


test.describe('HJ GROUPS authentication UI health', () => {
  test('login and signup expose both password and email OTP methods', async ({ page }) => {
    const health = await collectHealth(page, async () => {
      const login = page.getByRole('button', { name: /login/i }).first()
      await expect(login).toBeVisible()
      await login.click()

      await expect(page.getByText('Password Login', { exact: true })).toBeVisible()
      await expect(page.getByText('Email OTP Login', { exact: true })).toBeVisible()
      await expect(page.getByText('Phone OTP Login', { exact: true })).toBeVisible()
      await expect(page.getByText('Google Backup Login', { exact: true })).toBeVisible()

      await page.getByRole('button', { name: /sign up/i }).last().click()
      await expect(page.getByText('Password Sign Up', { exact: true })).toBeVisible()
      await expect(page.getByText('Email OTP Sign Up', { exact: true })).toBeVisible()

      await page.locator('.auth-switch button').filter({ hasText: /^Login$/i }).click()
      await expect(page.getByText('Password Login', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: /password login/i }).first().click()
      await expect(page.getByRole('button', { name: /Forgot Password/i })).toBeVisible()
    })

    const merged = mergeHealth([health])
    if (process.env.STRICT_QA === 'true') {
      expect(merged.pageErrors, 'unexpected page errors').toEqual([])
      expect(merged.consoleErrors, 'unexpected console errors').toEqual([])
      expect(merged.failedRequests, 'failed network requests').toEqual([])
      expect(merged.badResponses, 'HTTP 4xx/5xx responses').toEqual([])
    }
  })
})


test.describe('HJ GROUPS TTS health', () => {
  test('production TTS endpoint returns playable audio', async ({ request }) => {
    test.skip(
      process.env.STRICT_TTS_QA !== 'true',
      'Set STRICT_TTS_QA=true to run the live TTS audio smoke test.'
    )

    test.setTimeout(90_000)

    const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'https://hj-groups-website.getvoroa.com'

    const healthResponse = await request.get(baseURL + '/health')
    expect(healthResponse.status()).toBe(200)
    const health = await healthResponse.json()
    expect(health?.ttsProviders?.edge?.configured).toBe(true)

    const response = await request.post(baseURL + '/api/tts', {
      data: {
        text: 'வணக்கம் HJ GROUPS.',
        language_code: 'ta-IN',
        provider: 'auto',
        speaker: 'ratan',
        pace: 0.92,
        temperature: 0.35,
      },
      timeout: 80_000,
    })

    const status = response.status()
    const errorBody = status === 200 ? '' : await response.text()
    expect(status, errorBody).toBe(200)
    const contentType = String(response.headers()['content-type'] || '')
    expect(contentType).toMatch(/^audio\/mpeg(?:;|$)/i)

    const provider = String(response.headers()['x-tts-provider'] || '')
    expect(['sarvam', 'edge']).toContain(provider)

    const audio = await response.body()
    expect(audio.byteLength).toBeGreaterThan(1000)
  })
})

test.describe('HJ GROUPS Telegram streaming health', () => {
  test('streaming server health and CORS preflight', async ({ request }) => {
    const streamingURL = String(process.env.PLAYWRIGHT_STREAMING_URL || '').trim().replace(/\/+$/, '')
    test.skip(!streamingURL, 'PLAYWRIGHT_STREAMING_URL is not configured')

    const health = await request.get(streamingURL + '/health')
    expect(health.status()).toBe(200)

    const preflight = await request.fetch(streamingURL + '/telegram/messages', {
      method: 'OPTIONS',
      headers: {
        Origin: process.env.PLAYWRIGHT_BASE_URL || 'https://hj-groups-website.getvoroa.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
      maxRedirects: 0,
    })

    expect(
      preflight.status(),
      'OPTIONS must not redirect; browser CORS preflight rejects redirects'
    ).toBe(204)

    expect(
      preflight.headers()['access-control-allow-origin'],
      'streaming server must allow the website origin'
    ).toBe(process.env.PLAYWRIGHT_BASE_URL || 'https://hj-groups-website.getvoroa.com')
  })
})
