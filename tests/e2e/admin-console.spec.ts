import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { authenticatedE2EEnvironment } from './authenticated/environment'

const adminConfigured = Boolean(process.env.ADMIN_BOOTSTRAP_PRINCIPAL_IDS?.trim())

async function signIn(page: Page): Promise<void> {
  await page.goto('/')
  const url = execFileSync('npm', ['run', '-s', 'dev:sign-in-url', '--', new URL(page.url()).origin], { encoding: 'utf8' }).trim()
  await page.goto(url)
  await page.waitForURL((current) => !current.pathname.startsWith('/sign-in'), { timeout: 20_000 })
}

test.describe('Admin console operator', () => {
  test.skip(!authenticatedE2EEnvironment.configured, 'Requires Clerk test-instance keys, a dedicated owner, and a configured Convex-backed application.')

  test('search and audit show an admin surface or the role gate', async ({ page }) => {
    await signIn(page)
    await page.goto('/admin/search')

    const roleGate = page.getByRole('heading', { name: 'Admin access required' })
    const searchForm = page.locator('form').filter({ has: page.getByRole('searchbox', { name: 'Reference' }) })
    if (adminConfigured) {
      await expect(searchForm).toBeVisible()
    } else {
      await expect(roleGate).toBeVisible()
    }

    await page.goto('/admin/audit-events')
    if (adminConfigured) {
      await expect(page.getByRole('table')).toBeVisible()
    } else {
      await expect(page.getByRole('heading', { name: 'Admin access required' })).toBeVisible()
    }
  })

  test('admin search distinguishes malformed and missing Call references', async ({ page }) => {
    test.skip(!adminConfigured, 'Requires non-empty ADMIN_BOOTSTRAP_PRINCIPAL_IDS for admin-only assertions.')
    await signIn(page)
    await page.goto('/admin/search')

    await expect(page.locator('form').filter({ has: page.getByRole('searchbox', { name: 'Reference' }) })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Reference' }).fill('notaref')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('The Call reference is not valid.')

    await page.getByRole('searchbox', { name: 'Reference' }).fill(`operation-invocation:v1:${'a'.repeat(64)}`)
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('No object with that reference.')
  })

  test('commercial policy reason is selectable by pointer and keyboard inside its review drawer', async ({ page }) => {
    test.skip(!adminConfigured || process.env.AE_DEPLOYMENT_ENVIRONMENT !== 'production', 'Requires an Admin owner and production policy preparation in the configured Clerk test instance.')
    await signIn(page)
    await page.goto('/admin/treasury')
    await page.getByRole('combobox', { name: 'Policy family' }).selectOption('commercial_perimeter')
    await page.getByRole('button', { name: /^(Prepare new policy|Replace active policy)$/u }).click()
    await page.getByRole('checkbox', { name: /^I confirm Agentic Economy is the principal reseller/u }).check()
    const effectiveAt = new Date()
    const expiresAt = new Date(effectiveAt.getTime() + 24 * 60 * 60 * 1000)
    await page.getByLabel('Effective date and time', { exact: true }).fill(effectiveAt.toISOString().slice(0, 16))
    await page.getByLabel('Expiry date and time', { exact: true }).fill(expiresAt.toISOString().slice(0, 16))
    await page.getByRole('button', { name: 'Review policy', exact: true }).click()
    const reason = page.getByRole('combobox', { name: 'Reason', exact: true })
    await reason.click()
    const pricing = page.getByRole('option', { name: 'Pricing update', exact: true })
    await expect(pricing).toBeVisible()
    await expect(pricing).toBeInViewport()
    expect(await pricing.evaluate(node => {
      const box = node.getBoundingClientRect()
      return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
    })).toBe(true)
    await pricing.click()
    await expect(reason).toHaveText('Pricing update')
    await reason.focus()
    await reason.press('ArrowDown')
    await page.getByRole('option', { name: 'Correction', exact: true }).press('Enter')
    await expect(reason).toHaveText('Correction')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByLabel('Other evidence reference', { exact: true })).toBeVisible()
    // End at the evidence step: this selection regression must never submit a policy.
    await page.keyboard.press('Escape')
  })
})
