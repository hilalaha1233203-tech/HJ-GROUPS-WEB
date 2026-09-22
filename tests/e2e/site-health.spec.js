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
      baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://hj-groups-web.vercel.app',
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


test.describe('HJ GROUPS Telegram streaming health', () => {
  test('streaming server health and CORS preflight', async ({ request }) => {
    const streamingURL =
      process.env.PLAYWRIGHT_STREAMING_URL ||
      'https://hj-telegram-streaming.vercel.app'

    const health = await request.get(streamingURL + '/health')
    expect(health.status()).toBe(200)

    const preflight = await request.fetch(streamingURL + '/telegram/messages', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://hj-groups-web.vercel.app',
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
    ).toBe('https://hj-groups-web.vercel.app')
  })
})
