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

    await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL)
    await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD)
    await page.getByRole('button', { name: /^login$/i }).click()

    await page.waitForTimeout(1800)

    const adminButton = page.getByRole('button', { name: /admin/i }).first()
    await expect(adminButton).toBeVisible()
    await adminButton.click()

    await expect(page.getByText('HJ GROUPS CONTENT STUDIO', { exact: true })).toBeVisible()

    const tabs = ['Overview', 'Audio Stories', 'Books', 'Videos']
    for (const tab of tabs) {
      const button = page.getByRole('button', { name: new RegExp(tab, 'i') }).first()
      await expect(button).toBeVisible()
      await button.click()
      await page.waitForTimeout(500)
      await expect(page.locator('body')).toBeVisible()
    }

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
