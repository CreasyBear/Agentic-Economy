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
    await expect(page.getByText('A$0.00 affected — opening this list does not revoke sessions or Agents.', { exact: true })).toBeVisible()
    const checks = page.getByRole('list', { name: 'Compromise recovery checks' })
    const sessions = checks.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Review and revoke sessions', exact: true }) })
    const agents = checks.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Rotate or disconnect Agents', exact: true }) })
    const connections = checks.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Revoke or reauthorize Provider connections', exact: true }) })
    const support = checks.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Retain evidence and contact support', exact: true }) })
    await expect(sessions.getByRole('link', { name: 'Review', exact: true })).toHaveAttribute('href', '/owner/settings/account')
    await expect(agents.getByRole('link', { name: 'Review', exact: true })).toHaveAttribute('href', '/owner/settings/agent-keys')
    await expect(connections.getByText('Review separately', { exact: true })).toBeVisible()
    await expect(connections.getByRole('link')).toHaveCount(0)
    await expect(support.getByRole('link', { name: 'Contact support', exact: true })).toHaveAttribute('href', '/support')
    await expect(page.getByRole('heading', { name: 'Recorded activity', exact: true })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Account security history', exact: true })).toBeVisible()

    await sessions.getByRole('link', { name: 'Review', exact: true }).click()
    await expect(page).toHaveURL(/\/owner\/settings\/account\/?$/u)
    await expect(page.getByRole('heading', { name: 'Profile', exact: true, level: 2 })).toBeVisible()

    await page.goto('/owner/settings/security-activity')
    await agents.getByRole('link', { name: 'Review', exact: true }).click()
    await expect(page).toHaveURL(/\/owner\/settings\/agent-keys(?:[/?#]|$)/u)
    await expect(page.getByRole('heading', { name: 'Agent keys', exact: true, level: 2 })).toBeVisible()
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
