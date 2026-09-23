import { test, expect } from '@playwright/test'

test.describe('HJ GROUPS admin health', () => {
  test('admin dashboard and tabs open without page/console/network errors', async ({ page }) => {
    test.skip(
      !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
      'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD GitHub Actions secrets to enable admin QA.'
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
      failedRequests.push(
        request.method() + ' ' + request.url() + ' :: ' + (request.failure()?.errorText || 'request failed')
      )
    })
    page.on('response', (response) => {
      if (response.status() >= 400) {
        badResponses.push(
          response.status() + ' ' + response.request().method() + ' ' + response.url()
        )
      }
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)

    const login = page.getByRole('button', { name: /login/i }).first()
    await expect(login).toBeVisible()
    await login.click()

    await expect(page.getByText('Password Login', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /password login/i }).first().click()

    const emailInput = page.locator('.auth-field input[type="email"]').last()
    const passwordInput = page.locator('.auth-field input[type="password"]').last()
    await expect(emailInput).toBeVisible()
    await expect(passwordInput).toBeVisible()
    await emailInput.fill(process.env.E2E_ADMIN_EMAIL)
    await passwordInput.fill(process.env.E2E_ADMIN_PASSWORD)
    await page.getByRole('button', { name: /^login$/i }).click()

    await page.waitForTimeout(1800)

    const adminButton = page.getByRole('button', { name: /admin/i }).first()
    await expect(adminButton).toBeVisible()
    await adminButton.click()

    await expect(page.getByText('HJ GROUPS CONTENT STUDIO', { exact: true })).toBeVisible()

    const adminOverlay = page.locator('.admin-overlay')
    await expect(adminOverlay).toBeVisible()

    const tabs = ['Overview', 'Audio Stories', 'Books', 'Videos']
    for (const tab of tabs) {
      const button = adminOverlay.getByRole('button', { name: new RegExp(tab, 'i') }).first()
      await expect(button).toBeVisible()
      await button.click()
      await page.waitForTimeout(500)
      await expect(page.locator('body')).toBeVisible()
    }

    await adminOverlay.getByRole('button', { name: /Audio Stories/i }).first().click()
    await expect(page.getByText(/Bulk Telegram Import/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Scan Telegram Messages/i })).toBeVisible()
    const audioAccess = page.locator('select[name="bulk-audio-default-access"]')
    await expect(audioAccess).toBeVisible()
    await expect(audioAccess.locator('option')).toHaveText(['Free', 'VIP', 'Premium', 'Ads'])
    await audioAccess.selectOption('vip')
    await expect(audioAccess).toHaveValue('vip')

    await page.getByRole('button', { name: /Books/i }).first().click()
    await expect(page.getByText(/Bulk Telegram Book Import/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Scan Telegram Books/i })).toBeVisible()
    const bookAccess = page.locator('select[name="bulk-book-default-access"]')
    await expect(bookAccess).toBeVisible()
    await expect(bookAccess.locator('option')).toHaveText(['Free', 'VIP', 'Premium', 'Ads'])

    await page.getByRole('button', { name: /Videos/i }).first().click()
    await expect(page.getByText(/Bulk Telegram Video Import/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Scan Telegram Videos/i })).toBeVisible()
    const videoAccess = page.locator('select[name="bulk-video-default-access"]')
    await expect(videoAccess).toBeVisible()
    await expect(videoAccess.locator('option')).toHaveText(['Free', 'VIP', 'Premium', 'Ads'])

    await test.info().attach('admin-health.json', {
      body: JSON.stringify(
        { consoleErrors, pageErrors, failedRequests, badResponses },
        null,
        2
      ),
      contentType: 'application/json',
    })

    expect(pageErrors, 'unexpected page errors').toEqual([])
    expect(consoleErrors, 'unexpected console errors').toEqual([])
    expect(failedRequests, 'failed network requests').toEqual([])
    expect(badResponses, 'HTTP 4xx/5xx responses').toEqual([])
  })
})
