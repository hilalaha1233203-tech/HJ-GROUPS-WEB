import { test, expect } from '@playwright/test'

test.describe('HJ GROUPS navigation and export regression', () => {
  test('admin can navigate nested views with context-aware Back behavior and download XLSX', async ({ page }) => {
    test.skip(
      !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
      'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD GitHub Actions secrets to enable authenticated QA.'
    )

    const consoleErrors = []
    const pageErrors = []
    const failedRequests = []
    const badResponses = []

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => pageErrors.push(error?.message || String(error)))
    page.on('requestfailed', (request) => {
      failedRequests.push(request.method() + ' ' + request.url() + ' :: ' + (request.failure()?.errorText || 'request failed'))
    })
    page.on('response', (response) => {
      if (response.status() >= 400) badResponses.push(response.status() + ' ' + response.request().method() + ' ' + response.url())
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Audio Stories', { exact: true }).first()).toBeVisible({ timeout: 20_000 })

    const login = page.getByRole('button', { name: /login/i }).first()
    await login.click()
    await page.getByRole('button', { name: /password login/i }).first().click()
    await page.locator('.auth-field input[type="email"]').last().fill(process.env.E2E_ADMIN_EMAIL)
    await page.locator('.auth-field input[type="password"]').last().fill(process.env.E2E_ADMIN_PASSWORD)
    await page.getByRole('button', { name: /^login$/i }).click()
    await page.waitForTimeout(1_500)

    // Audio list -> Story Details -> Player -> in-app Back minimizes -> Details -> Story list.
    await page.getByRole('button', { name: /Audio Stories/i }).first().click()
    const firstStory = page.locator('.story-card').first()
    await expect(firstStory).toBeVisible({ timeout: 15_000 })
    await firstStory.click()
    await expect(page.locator('.story-details-page').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Back to Stories/i }).first()).toBeVisible()

    const playStory = page.getByRole('button', { name: /Play Story/i }).first()
    await expect(playStory).toBeVisible()
    await playStory.click()
    await expect(page.locator('.player-overlay').first()).toBeVisible({ timeout: 10_000 })

    const playerBack = page.locator('.player-overlay').first().getByRole('button', { name: /Back to the page underneath/i }).first()
    await expect(playerBack).toBeVisible()
    await playerBack.click()
    await expect(page.locator('.player-overlay')).toHaveCount(0)
    await expect(page.locator('.story-details-page').first()).toBeVisible()

    await page.getByRole('button', { name: /Back to Stories/i }).first().click()
    await expect(page.locator('.story-details-page')).toHaveCount(0)
    await expect(page.getByText('Audio Stories', { exact: true }).first()).toBeVisible()

    // Books -> Book Details -> Reader -> Back -> Details -> Back -> Books.
    await page.getByRole('button', { name: /Books/i }).last().click()
    await page.waitForTimeout(500)
    const firstBook = page.locator('.media-catalog-card').first()
    if (await firstBook.count()) {
      await expect(firstBook).toBeVisible({ timeout: 15_000 })
      await firstBook.click()
      await expect(page.locator('.story-details-page').first()).toBeVisible()
      await expect(page.getByRole('button', { name: /Back to Books/i }).first()).toBeVisible()

      const readBook = page.getByRole('button', { name: /\bRead\b/i }).first()
      await expect(readBook).toBeVisible()
      await readBook.click()
      await expect(page.locator('.reader-overlay').first()).toBeVisible({ timeout: 10_000 })

      const readerBack = page.locator('.reader-overlay').first().getByRole('button', { name: /Close book reader/i }).first()
      await expect(readerBack).toBeVisible()
      await readerBack.click()
      await expect(page.locator('.reader-overlay')).toHaveCount(0)
      await expect(page.getByRole('button', { name: /Back to Books/i }).first()).toBeVisible()
      await page.getByRole('button', { name: /Back to Books/i }).first().click()
      await expect(page.getByRole('button', { name: /Book Language: All/i }).first()).toBeVisible({ timeout: 10_000 })
    } else {
      await expect(page.getByRole('heading', { name: /No books available/i })).toBeVisible()
    }

    // Videos -> Video Details -> Video Player -> Back minimizes -> Details -> Videos.
    await page.getByRole('button', { name: /Videos/i }).last().click()
    await page.waitForTimeout(500)
    const firstVideo = page.locator('.media-catalog-card').first()
    if (await firstVideo.count()) {
      await expect(firstVideo).toBeVisible({ timeout: 15_000 })
      await firstVideo.click()
      await expect(page.locator('.story-details-page').first()).toBeVisible()
      await expect(page.getByRole('button', { name: /Back to Videos/i }).first()).toBeVisible()

      const playVideo = page.getByRole('button', { name: /^Play$/i }).first()
      await expect(playVideo).toBeVisible()
      await playVideo.click()
      await expect(page.locator('.player-overlay').first()).toBeVisible({ timeout: 10_000 })

      const videoBack = page.locator('.player-overlay').first().getByRole('button', { name: /Back to the page underneath/i }).first()
      await expect(videoBack).toBeVisible()
      await videoBack.click()
      await expect(page.locator('.player-overlay')).toHaveCount(0)
      await expect(page.getByRole('button', { name: /Back to Videos/i }).first()).toBeVisible()
      await page.getByRole('button', { name: /Back to Videos/i }).first().click()
      await expect(page.getByRole('button', { name: /Video Language: All/i }).first()).toBeVisible({ timeout: 10_000 })
    } else {
      await expect(page.getByRole('heading', { name: /No video stories available/i })).toBeVisible()
    }

    // Account -> Settings -> Back -> Account.
    await page.getByRole('button', { name: /Account/i }).last().click()
    await expect(page.getByRole('button', { name: /Settings/i }).first()).toBeVisible()
    await page.getByRole('button', { name: /Settings/i }).first().click()
    await expect(page.getByText('Personalize & Protect Your Account', { exact: true })).toBeVisible()
    const settingsBack = page.getByRole('button', { name: /Back/i }).first()
    await expect(settingsBack).toBeVisible()
    await settingsBack.click()
    await expect(page.getByText(/Administrator email is protected here/i)).toBeVisible()

    // Admin -> nested Analytics -> Back returns to previous Admin tab; browser Back closes overlay.
    await page.getByRole('button', { name: /Admin/i }).first().click()
    const adminOverlay = page.locator('.admin-overlay')
    await expect(adminOverlay).toBeVisible()
    await adminOverlay.getByRole('button', { name: /Analytics/i }).first().click()
    await expect(adminOverlay.getByText('Analytics', { exact: true })).toBeVisible()
    await adminOverlay.getByRole('button', { name: /Back to previous admin section/i }).click()
    await expect(adminOverlay.getByText('HJ GROUPS CONTENT STUDIO', { exact: true })).toBeVisible()

    // Export endpoint is exercised through the real Admin UI and verified as an actual XLSX download.
    await adminOverlay.getByRole('button', { name: /Analytics/i }).first().click()
    const exportButton = adminOverlay.getByRole('button', { name: /Download User Data/i }).first()
    await expect(exportButton).toBeVisible()
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/user-export.xlsx')
    )
    await exportButton.click()
    const exportResponse = await responsePromise
    expect(exportResponse.status()).toBe(200)
    await expect(page.getByText('User Data Excel downloaded.', { exact: true })).toBeVisible({ timeout: 10_000 })

    const desktopMetrics = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(desktopMetrics.scrollWidth).toBeLessThanOrEqual(desktopMetrics.width)

    await page.setViewportSize({ width: 390, height: 844 })
    const mobileMetrics = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(mobileMetrics.scrollWidth).toBeLessThanOrEqual(mobileMetrics.width)

    await page.evaluate(() => window.history.back())
    await expect(adminOverlay).toHaveCount(0)
    await expect(page.locator('.app')).toBeVisible()

    expect(pageErrors, 'unexpected page errors').toEqual([])
    expect(consoleErrors, 'unexpected console errors').toEqual([])
    expect(failedRequests, 'failed network requests').toEqual([])
    expect(badResponses, 'HTTP 4xx/5xx responses').toEqual([])
  })

  test('admin user export rejects unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/admin/user-export.xlsx?range=7d')
    expect(response.status()).toBe(401)
  })
})
