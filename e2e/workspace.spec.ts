import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Security, at a glance.' })).toBeVisible()
})

test('overview reports actual data and exports a CSV', async ({ page }) => {
  await expect(page.getByRole('button', { name: /Protected records/ })).toContainText('128')
  await page.getByRole('combobox', { name: 'Overview reporting period' }).selectOption('30')
  await expect(page.locator('.chart-period')).toHaveText('30 days')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export report', exact: true }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('medguard-security-overview.csv')
  const path = await file.path()
  expect(await readFile(path!, 'utf8')).toContain('Protected records,128')
})

test('uploads, filters, downloads, and deletes an encrypted record', async ({ page }) => {
  await page.getByRole('link', { name: 'Records vault', exact: true }).click()
  await page.getByRole('button', { name: 'Upload record', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Upload a record' })
  const content = 'Synthetic E2E record. Never use real patient information in tests.'
  await dialog.getByLabel('Choose record file').setInputFiles({
    name: 'E2E-roundtrip-record.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(content),
  })
  await dialog.getByRole('textbox', { name: 'Patient reference ID' }).fill('E2E-2048')
  await dialog.getByRole('combobox', { name: 'Department', exact: true }).selectOption('Radiology')
  await dialog.getByRole('button', { name: 'Encrypt & upload' }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('textbox', { name: 'Search records', exact: true }).fill('E2E-2048')
  const row = page.locator('tbody tr').filter({ hasText: 'E2E-2048' })
  await expect(row).toHaveCount(1)
  await row.locator('.file-name-cell').click()
  const details = page.getByRole('dialog', { name: 'Record details' })
  await expect(details).toContainText('SHA3-256 CHECKSUM')
  const download = page.waitForEvent('download')
  await details.getByRole('button', { name: 'Download', exact: true }).click()
  const path = await (await download).path()
  expect(await readFile(path!, 'utf8')).toBe(content)
  await details.getByRole('button', { name: 'Delete record', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Delete this record?' })
  await confirm.getByRole('button', { name: 'Delete record', exact: true }).click()
  await expect(confirm).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'No records match these filters' })).toBeVisible()
})

test('manages staff roles and revokes a deactivated account', async ({ page }) => {
  await page.getByRole('link', { name: 'People & access', exact: true }).click()
  await page.getByRole('button', { name: 'Add team member', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a team member' })
  await dialog.getByRole('textbox', { name: 'Full name' }).fill('Browser Test Auditor')
  await dialog.getByRole('textbox', { name: 'Work email' }).fill('browser-test@hospital.example')
  await dialog.getByLabel('Initial password', { exact: true }).fill('BrowserTest!2026')
  await dialog.getByRole('combobox', { name: 'Access role' }).selectOption('auditor')
  await dialog.getByRole('button', { name: 'Add team member' }).click()
  await expect(dialog).not.toBeVisible()
  await page
    .getByRole('textbox', { name: 'Search team members' })
    .fill('browser-test@hospital.example')
  const row = page.locator('tbody tr').filter({ hasText: 'browser-test@hospital.example' })
  await expect(row).toHaveCount(1)
  await row.locator('.staff-name').click()
  const edit = page.getByRole('dialog', { name: 'Manage team access' })
  await edit.getByRole('combobox', { name: 'Access role' }).selectOption('doctor')
  await edit.getByRole('button', { name: 'Save access' }).click()
  await expect(edit).not.toBeVisible()
  await expect(row).toContainText('Doctor')
  await row.locator('.staff-name').click()
  await edit.getByRole('button', { name: 'Reset password', exact: true }).click()
  const reset = page.getByRole('dialog', { name: 'Reset member password' })
  await reset.getByLabel('New password', { exact: true }).fill('BrowserReset!2026')
  await reset.getByLabel('Confirm new password', { exact: true }).fill('BrowserReset!2026')
  await reset.getByRole('button', { name: 'Reset password', exact: true }).click()
  await expect(reset).not.toBeVisible()
  await row.locator('.staff-name').click()
  await edit.getByRole('switch', { name: 'Account active' }).uncheck()
  await edit.getByRole('button', { name: 'Save access' }).click()
  await expect(edit).not.toBeVisible()
  await expect(row).toContainText('Inactive')
})

test('resolves an alert and exposes filtered audit history', async ({ page }) => {
  await page.getByRole('link', { name: /Security alerts/, exact: false }).click()
  const first = page.locator('.alert-card').first()
  await first.getByRole('button', { name: 'Review alert' }).click()
  const dialog = page.getByRole('dialog', { name: 'Review security alert' })
  await dialog
    .getByRole('textbox', { name: 'Resolution note' })
    .fill('Verified synthetic sign-in activity with the demonstration team.')
  await dialog.getByRole('button', { name: 'Mark resolved' }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('tab', { name: /Resolved/ }).click()
  await expect(
    page.locator('.alert-card').filter({ hasText: 'Multiple failed sign-in attempts' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Audit trail', exact: true }).click()
  await page.getByRole('combobox', { name: 'Filter by event type' }).selectOption('alert_resolved')
  await expect(page.locator('tbody')).toContainText('Resolved an alert')
  await page
    .locator('tbody')
    .getByRole('button', { name: /View event/ })
    .first()
    .click()
  await expect(page.getByRole('dialog', { name: 'Activity details' })).toContainText(
    'Verified synthetic sign-in activity',
  )
})

test('global search, settings, sign-out, and demo sign-in work', async ({ page }) => {
  await page.keyboard.press('Control+k')
  const search = page.getByRole('dialog', { name: 'Search your workspace' })
  await search.getByRole('textbox', { name: 'Search your workspace' }).fill('GF-2026-1048')
  await search.getByRole('button', { name: /GF-2026-1048/ }).click()
  await expect(page.getByRole('dialog', { name: 'Record details' })).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Hospital / workspace name' })
    .fill('Greenfield Medical Test')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.locator('.workspace-button')).toContainText('Greenfield Medical Test')
  await page.getByRole('button', { name: /Dr. Ananya Rao Administrator/ }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome to your workspace.' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome to your workspace.' })).toBeVisible()
  await page.getByRole('button', { name: 'Explore demo workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Security, at a glance.' })).toBeVisible()
})

test('mobile navigation fits the screen and remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('link', { name: 'Records vault', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A safer place for every record.' })).toBeVisible()
  await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar-open/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.getByRole('button', { name: 'Upload record', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Upload a record' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('overview has no serious automated accessibility violations', async ({ page }) => {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(
    result.violations.map(violation => ({
      id: violation.id,
      nodes: violation.nodes.map(node => ({ target: node.target, reason: node.failureSummary })),
    })),
  ).toEqual([])
})

for (const route of ['/vault', '/staff', '/audit', '/alerts', '/settings?tab=security']) {
  test(`accessibility checks pass for ${route}`, async ({ page }) => {
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(
      result.violations.map(violation => ({
        id: violation.id,
        targets: violation.nodes.map(node => node.target),
      })),
    ).toEqual([])
  })
}

test('auditor sign-in hides privileged controls and prevents direct staff navigation', async ({
  page,
}) => {
  const created = await page.request.post('/api/staff', {
    headers: { 'X-Requested-With': 'MedGuard' },
    data: {
      username: 'E2E Readonly Auditor',
      email: 'e2e-auditor@hospital.example',
      password: 'AuditorLogin!2026',
      role: 'auditor',
      department: 'Administration',
    },
  })
  expect(created.status()).toBe(201)
  await page.getByRole('button', { name: /Dr. Ananya Rao Administrator/ }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('textbox', { name: 'Work email' }).fill('e2e-auditor@hospital.example')
  await page.getByLabel('Password', { exact: true }).fill('AuditorLogin!2026')
  await page.getByRole('button', { name: 'Sign in securely' }).click()
  await expect(page.getByRole('heading', { name: 'Security, at a glance.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'People & access', exact: true })).not.toBeVisible()
  await page.getByRole('link', { name: 'Records vault', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Upload record', exact: true })).not.toBeVisible()
  await page.locator('tbody .file-name-cell').first().click()
  await expect(page.getByRole('dialog', { name: 'Record details' })).toContainText(
    'Auditor access includes metadata only',
  )
  await expect(page.getByRole('button', { name: 'Download', exact: true })).not.toBeVisible()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.goto('/staff')
  await expect(
    page.getByRole('heading', { name: 'A different role is needed here.' }),
  ).toBeVisible()
})
