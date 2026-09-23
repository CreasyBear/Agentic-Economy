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
})
