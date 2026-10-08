import { clerk } from '@clerk/testing/playwright'
import { expect } from '@playwright/test'
import { test } from './fixtures'

import {
  authenticatedE2EEnvironment,
  requireAuthenticatedE2EEnvironment,
} from './environment'

test.describe('Package 3 Account security recovery', () => {
  test.skip(
    !authenticatedE2EEnvironment.configured,
    'Requires Clerk test-instance keys, a dedicated owner, and a configured Convex-backed application.',
  )

  test('keeps each compromise check attached to its authoritative subsystem', async ({ page }) => {
    const environment = requireAuthenticatedE2EEnvironment()
    if (environment.ownerEmail === undefined) {
      throw new Error('authenticated_e2e_owner_email_missing')
    }

    await page.goto('/')
    await clerk.signIn({ page, emailAddress: environment.ownerEmail })
    await page.goto('/owner/settings/security-activity')

    await expect(page.getByRole('heading', { name: 'If you suspect compromise' })).toBeVisible()
    await expect(page.getByText('This page does not mark the account contained', { exact: true })).toBeVisible()
    await expect(page.getByText('Viewing this checklist changes no access or funds. Financial impact has not been assessed here.', { exact: true })).toBeVisible()
    const checks = page.locator('.arc-security-recovery')
    const sessions = checks.getByRole('link', { name: 'Review', exact: true }).and(page.locator('[href="/owner/settings/account/security"]'))
    const agents = checks.getByRole('link', { name: 'Review', exact: true }).and(page.locator('[href="/owner/settings/agent-keys"]'))
    const connections = checks.getByRole('link', { name: 'Review', exact: true }).and(page.locator('[href="/owner/settings/integrations"]'))
    await expect(sessions).toBeVisible()
    await expect(agents).toBeVisible()
    await expect(connections).toBeVisible()
    await expect(checks.getByRole('link', { name: 'Contact support', exact: true })).toHaveAttribute('href', '/support')
    await expect(page.getByRole('heading', { name: 'Recorded activity', exact: true })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Account security history', exact: true })).toBeVisible()

    await sessions.click()
    await expect(page).toHaveURL(/\/owner\/settings\/account\/security\/?$/u)
    await expect(page.getByRole('heading', { name: 'Security', exact: true, level: 1 })).toBeVisible()

    await page.goto('/owner/settings/security-activity')
    await agents.click()
    await expect(page).toHaveURL(/\/owner\/settings\/agent-keys(?:[/?#]|$)/u)
    await expect(page.getByRole('heading', { name: 'Agent keys', exact: true, level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Issued keys', exact: true })).toBeVisible()

    await page.goto('/owner/settings/integrations')
    await expect(page).toHaveURL(/\/owner\/settings\/integrations\/?$/u)
    await expect(page.getByRole('heading', { name: 'Provider connections', exact: true })).toBeVisible()
    await expect(page.getByText('Connections unavailable', { exact: true })).toHaveCount(0)

    await page.goto('/owner/operations#earnings')
    await expect(page).toHaveURL(/\/owner\/operations#earnings$/u)
    await expect(page.getByRole('heading', { name: 'Earnings', exact: true }).or(
      page.getByRole('heading', { name: 'Provider setup', exact: true }),
    )).toBeVisible()
  })
})
