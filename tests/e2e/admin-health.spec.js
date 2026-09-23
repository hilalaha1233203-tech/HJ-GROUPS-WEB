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

    const tabs = ['Overview', 'Audio Stories', 'Books', 'Videos', 'Management & Settings']
    for (const tab of tabs) {
      const button = adminOverlay.getByRole('button', { name: new RegExp(tab, 'i') }).first()
      await expect(button).toBeVisible()
      await button.click()
      await page.waitForTimeout(500)
      await expect(page.locator('body')).toBeVisible()
    }

    await adminOverlay.getByRole('button', { name: /Audio Stories/i }).first().click()
    await expect(page.getByText(/Bulk Telegram Import/i)).toBeVisible()
    const audioStorySection = page.locator('section.admin-section').filter({ hasText: /Add New Audio Story|Edit Audio Story/i }).first()
    const audioStoryForm = audioStorySection.locator('form.admin-form').first()
    await expect(audioStoryForm.locator('select').nth(0)).toBeVisible()
    await expect(audioStoryForm.locator('label').nth(0)).toBeVisible()
    await expect(audioStoryForm.locator('label').nth(1)).toBeVisible()
    await expect(audioStoryForm.locator('select').nth(1)).toBeVisible()
    await expect(page.getByRole('button', { name: /Scan Telegram Messages/i })).toBeVisible()
    await expect(page.getByText('Access Types', { exact: true }).first()).toBeVisible()
    const audioVip = page.locator('input[name="bulk-audio-default-access_vip"]').first()
    await expect(audioVip).toBeVisible()
    await audioVip.check()
    await expect(audioVip).toBeChecked()

    await adminOverlay.getByRole('button', { name: /Books/i }).first().click()
    await expect(page.getByText(/Bulk Telegram Book Import/i)).toBeVisible()
    const bookForm = page.locator('section.admin-section').filter({ hasText: /Add New Book|Edit Book/i }).first().locator('form.admin-form').first()
    await expect(bookForm.locator('label').nth(0)).toBeVisible()
    await expect(bookForm.locator('label').nth(1)).toBeVisible()
    await expect(bookForm.locator('select').nth(1)).toBeVisible()
    await expect(bookForm.locator('select').nth(2)).toBeVisible()
    await expect(page.getByRole('button', { name: /Scan Telegram Books/i })).toBeVisible()
    const bookAds = page.locator('input[name="bulk-book-default-access_ads"]').first()
    await expect(bookAds).toBeVisible()
    await bookAds.check()
    await expect(bookAds).toBeChecked()

    await adminOverlay.getByRole('button', { name: /Videos/i }).first().click()
    await expect(page.getByText(/Bulk Telegram Video Import/i)).toBeVisible()
    const videoForm = page.locator('section.admin-section').filter({ hasText: /Add New Video Story|Edit Video Story/i }).first().locator('form.admin-form').first()
    await expect(videoForm.locator('label').nth(0)).toBeVisible()
    await expect(videoForm.locator('label').nth(1)).toBeVisible()
    await expect(videoForm.locator('select').nth(0)).toBeVisible()
    await expect(videoForm.locator('select').nth(1)).toBeVisible()
    await expect(page.getByRole('button', { name: /Scan Telegram Videos/i })).toBeVisible()
    const videoPremium = page.locator('input[name="bulk-video-default-access_premium"]').first()
    await expect(videoPremium).toBeVisible()
    await videoPremium.check()
    await expect(videoPremium).toBeChecked()

    await adminOverlay.getByRole('button', { name: /Management & Settings/i }).first().click()
    await expect(page.getByText('Management & Settings', { exact: true })).toBeVisible()
    await expect(page.getByText('CONTENT MANAGEMENT', { exact: true })).toBeVisible()
    await expect(page.getByText('ADS PROVIDER', { exact: true })).toBeVisible()
    await expect(page.getByText('PAYMENTS', { exact: true })).toBeVisible()
    await expect(page.getByText('WEBSITE SETTINGS', { exact: true })).toBeVisible()
    await expect(page.getByText('CONTENT ACCESS', { exact: true })).toBeVisible()

    const settingsSave = adminOverlay.getByRole('button', { name: /Save All Settings/i })
    await expect(settingsSave).toBeVisible()

    const siteNameInput = adminOverlay.locator('.admin-settings-card').filter({ hasText: 'WEBSITE SETTINGS' }).locator('input').first()
    await siteNameInput.fill('HJ GROUPS')
    await settingsSave.click()
    await expect(page.getByText('Management settings saved in this browser', { exact: true })).toBeVisible()

    const adminClose = adminOverlay.getByRole('button', { name: /close|×|✕/i }).first()
    if (await adminClose.count()) await adminClose.click().catch(() => {})

    const accountButton = page.locator('.bottom-nav button').filter({ hasText: /^Account$/i }).first()
    if (await accountButton.count()) {
      await accountButton.click()
      await expect(page.getByRole('button', { name: /Settings/i }).first()).toBeVisible()
      await page.getByRole('button', { name: /Settings/i }).first().click()
      await expect(page.getByText('Personalize & Protect Your Account', { exact: true })).toBeVisible()
      await expect(page.getByText('RECOVERY & SECURITY', { exact: true })).toBeVisible()
      await expect(page.getByText('AUDIO PLAYER', { exact: true })).toBeVisible()
      await expect(page.getByText('VIDEO PLAYER', { exact: true })).toBeVisible()
      await expect(page.getByText('TTS & READ ALOUD', { exact: true })).toBeVisible()
      await expect(page.getByText('BOOK READER', { exact: true })).toBeVisible()
      await expect(page.getByText('DEVICE & DATA', { exact: true })).toBeVisible()
      await expect(page.getByText('Data Saver', { exact: true })).toBeVisible()
      await expect(page.getByText('Recovery status', { exact: true })).toBeVisible()
      await expect(page.getByText('Backup Google account', { exact: true })).toBeVisible()
      await expect(page.getByText('Recovery mobile', { exact: true })).toBeVisible()
      await expect(page.getByText('SLEEP TIMER & ACCESSIBILITY', { exact: true })).toBeVisible()
      await expect(page.getByText('Recommended recovery setup:', { exact: false })).toBeVisible()
    }

    const booksNav = page.locator('.bottom-nav button').filter({ hasText: /^Books$/i }).first()
    if (await booksNav.count()) {
      await booksNav.click()
      await page.waitForTimeout(600)

      const firstBookCard = page.locator('.media-catalog-card').first()
      if (await firstBookCard.count()) {
        await firstBookCard.click()
        await expect(page.getByRole('button', { name: /Read Aloud/i }).first()).toBeVisible()
        await expect(page.getByRole('button', { name: /\\bRead\\b/i }).first()).toBeVisible()

        await page.getByRole('button', { name: /Read Aloud/i }).first().click()
        await page.waitForTimeout(900)

        const readerOverlay = page.locator('.reader-overlay').first()
        await expect(readerOverlay).toBeVisible()

        const readAloudButton = readerOverlay.getByRole('button', { name: /Read Aloud/i }).first()
        await expect(readAloudButton).toBeVisible()

        const zoomButtons = readerOverlay.locator('.reader-zoom button')
        await expect(zoomButtons.first()).toBeVisible()
        await expect(zoomButtons.last()).toBeVisible()

        const paperButton = readerOverlay.getByRole('button', { name: /^Paper$/i }).first()
        if (await paperButton.count()) await expect(paperButton).toBeVisible()

        await page.keyboard.press('Escape').catch(() => {})
      }
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
