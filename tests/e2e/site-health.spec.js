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
    await expect(page.getByText('Audio Stories', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
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

  test('featured audio story stays within a controlled first viewport on desktop and mobile', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  const hero = page.locator('.hero-section').first()
  if (await hero.count()) {
    const desktopViewport = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    }))
    const desktopBox = await hero.boundingBox()
    expect(desktopBox?.height || 0).toBeLessThan(desktopViewport.height * 0.82)
    await expect(page.locator('.top-header').first()).toBeVisible()

    const nextSection = page.locator('.stories-section').first()
    if (await nextSection.count() && desktopBox) {
      const nextBox = await nextSection.boundingBox()
      expect(nextBox?.y || 0).toBeLessThan(desktopViewport.height * 1.35)
      expect((nextBox?.y || 0) + (nextBox?.height || 0)).toBeGreaterThan(desktopBox.y)
    }

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(700)

    const mobileViewport = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    const mobileHero = page.locator('.hero-section').first()
    const mobileBox = await mobileHero.boundingBox()
    expect(mobileBox?.height || 0).toBeLessThan(mobileViewport.height * 0.78)
    expect(mobileViewport.scrollWidth).toBeLessThanOrEqual(mobileViewport.width)

    const mobileNextSection = page.locator('.stories-section').first()
    if (await mobileNextSection.count()) {
      const nextBox = await mobileNextSection.boundingBox()
      expect(nextBox?.y || 0).toBeLessThan(mobileViewport.height * 1.6)
    }
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


test.describe('HJ GROUPS password recovery UI health', () => {
  test('password visibility toggle works on desktop and mobile', async ({ page }) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error?.message || String(error)))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /login/i }).first().click()
    await page.getByRole('button', { name: /password login/i }).first().click()

    const loginPassword = page.locator('.auth-field .password-input input').first()
    const showLoginPassword = page.getByRole('button', { name: 'Show password' }).first()
    await expect(loginPassword).toHaveAttribute('type', 'password')
    await showLoginPassword.click()
    await expect(loginPassword).toHaveAttribute('type', 'text')
    await expect(page.getByRole('button', { name: 'Hide password' }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Hide password' }).first().click()
    await expect(loginPassword).toHaveAttribute('type', 'password')

    await page.getByRole('button', { name: /sign up/i }).last().click()
    await page.getByRole('button', { name: /password sign up/i }).first().click()
    const signupPassword = page.locator('.auth-field .password-input input').first()
    await expect(signupPassword).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Show password' }).first().click()
    await expect(signupPassword).toHaveAttribute('type', 'text')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Hide password' }).first().click()
    await expect(signupPassword).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Show password' }).first().click()
    await expect(signupPassword).toHaveAttribute('type', 'text')

    expect(errors).toEqual([])
  })

  test('dedicated reset route handles invalid or expired links without opening the normal site shell', async ({ page }) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error?.message || String(error)))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })

    await page.goto(
      '/reset-password?error=access_denied&error_code=otp_expired&error_description=Token%20has%20expired',
      { waitUntil: 'domcontentloaded' }
    )

    await expect(page.getByRole('heading', { name: 'Reset Your Password' })).toBeVisible()
    await expect(page.getByText(/expired or was already used/i)).toBeVisible()
    await expect(page.getByRole('textbox', { name: /email address/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Request New Reset Email/i })).toBeVisible()
    await expect(page.getByText('Audio Stories', { exact: true })).toHaveCount(0)

    expect(errors).toEqual([])
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
  test('Latest Episodes renders the 10 newest uploaded episodes globally in upload order', async ({ page }) => {
    const episodeResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().includes('/rest/v1/episodes')
    )

    await page.goto('/?qa-latest=' + Date.now(), { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Latest Episodes', { exact: true })).toBeVisible({ timeout: 20_000 })

    const response = await episodeResponsePromise
    expect(response.ok()).toBe(true)

    const rows = await response.json()
    expect(Array.isArray(rows)).toBe(true)

    const validRows = rows.filter((row) => {
      const messageId = row?.telegram_message_id
      const importKey = String(row?.telegram_import_key || '').trim()
      const canonical = messageId ? String(row?.story_id) + ':' + String(messageId) : ''
      const duplicate = Boolean(messageId && importKey && canonical && importKey !== canonical)
      return !duplicate
    })

    const expected = validRows
      .slice()
      .sort((a, b) => {
        const aTime = Date.parse(a?.created_at || '')
        const bTime = Date.parse(b?.created_at || '')
        if (Number.isFinite(aTime) && Number.isFinite(bTime) && bTime !== aTime) return bTime - aTime
        if (Number.isFinite(aTime) !== Number.isFinite(bTime)) return Number.isFinite(bTime) ? -1 : 1
        return (Number(b?.id) || 0) - (Number(a?.id) || 0)
      })
      .slice(0, 10)

    const renderedTitles = await page.locator('.latest-list .latest-item h3').allTextContents()
    expect(renderedTitles.length).toBe(Math.min(10, expected.length))
    expect(renderedTitles).toEqual(expected.map((row) => row.title))
  })

  test('streaming server health and CORS preflight', async ({ request }) => {
    const streamingURL = String(
      process.env.PLAYWRIGHT_STREAMING_URL || 'https://hj-telegram-streaming.onrender.com'
    ).trim().replace(/\/+$/, '')

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

  test('public preview audio episode accepts browser range playback without 416 or 5xx', async ({ page }) => {
    await page.goto('/?qa-media=' + Date.now(), { waitUntil: 'domcontentloaded' })

    const storyCard = page.locator('.story-card').first()
    await expect(storyCard).toBeVisible({ timeout: 20_000 })
    await storyCard.click()

    await expect(page.locator('.episode-range-select')).toBeVisible({ timeout: 20_000 })
    const episodeOne = page.locator('.details-episodes button').filter({ hasText: /01/ }).first()
    await expect(episodeOne).toBeVisible()

    await page.route(/\/audio\/message\//i, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800))
      await route.continue()
    })

    const mediaResponsePromise = page.waitForResponse(
      (response) => /\/audio\/message\//i.test(response.url()),
      { timeout: 20_000 }
    )

    await episodeOne.click()

    await expect(page.locator('.media-loading-toast')).toContainText(
      'This episode will load in a few seconds depending on your network.'
    )

    const mediaResponse = await mediaResponsePromise
    expect([200, 206]).toContain(
      mediaResponse.status(),
      'Telegram audio must not return 416/5xx during normal browser playback'
    )

    if (mediaResponse.status() === 206) {
      expect(mediaResponse.headers()['content-range'] || '').toMatch(/^bytes \d+-\d+\/\d+$/)
    }

    const audio = page.locator('audio').first()
    await expect(audio).toHaveAttribute('src', /\/audio\/message\//i)
    await expect.poll(
      async () => audio.evaluate((element) => element.readyState),
      { timeout: 10_000 }
    ).toBeGreaterThan(0)
  })

  test('mobile episode range selector and Load More stay visible and functional', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/?qa-range=' + Date.now(), { waitUntil: 'domcontentloaded' })

    const storyCard = page.locator('.story-card').first()
    await expect(storyCard).toBeVisible({ timeout: 20_000 })
    await storyCard.click()

    const rangeSelect = page.getByLabel('Episode ranges')
    await expect(rangeSelect).toBeVisible({ timeout: 20_000 })

    const selectStyles = await rangeSelect.evaluate((element) => {
      const styles = getComputedStyle(element)
      return {
        color: styles.color,
        backgroundColor: styles.backgroundColor,
      }
    })
    expect(selectStyles.color).toBe('rgb(255, 255, 255)')
    expect(selectStyles.backgroundColor).toBe('rgb(20, 20, 43)')

    const viewport = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width)

    const caption = page.locator('.episode-range-caption')
    await expect(caption).toContainText('Showing episodes 1-50')

    const moreButton = page.getByRole('button', { name: /Load More Episodes/i })
    if (await moreButton.count()) {
      await expect(moreButton).toBeVisible()
      await moreButton.click()
      await expect(caption).toContainText('Showing episodes 51-100')
      await expect(page.locator('.details-episodes button').first()).toContainText('51')
    }
  })
})
