import { clerk } from '@clerk/testing/playwright'
import { expect, test } from '@playwright/test'

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
    await page.goto('/owner/settings')

    await expect(page.getByRole('heading', { name: 'If you suspect compromise' })).toBeVisible()
    await expect(page.getByText('This page does not mark the Account contained')).toBeVisible()
    await expect(page.getByText('Review at source')).toHaveCount(5)
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Security history' })).toBeVisible()

    await expect(page.getByRole('link', { name: /Review and revoke Clerk sessions/u }))
      .toHaveAttribute('href', '#clerk-account-security')
    await expect(page.getByRole('link', { name: /Rotate or disconnect Agents/u }))
      .toHaveAttribute('href', '/agent-access')
    await expect(page.getByRole('link', { name: /supplier connections/u }))
      .toHaveAttribute('href', '/owner/offerings#supplier-connections')
    await expect(page.getByRole('link', { name: /Review payout authority/u }))
      .toHaveAttribute('href', '/owner/offerings#earnings')
    await expect(page.getByRole('link', { name: /Retain evidence and contact support/u }))
      .toHaveAttribute('href', '/support')

    await page.getByRole('link', { name: /Rotate or disconnect Agents/u }).click()
    await expect(page).toHaveURL(/\/agent-access(?:[/?#]|$)/u)
    await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible()

    await page.goto('/owner/offerings#supplier-connections')
    await expect(page).toHaveURL(/\/owner\/offerings#supplier-connections$/u)
    await expect(page.locator('#supplier-connections').or(
      page.getByRole('button', { name: 'Create supplier workspace' }),
    )).toBeVisible()

    await page.goto('/owner/offerings#earnings')
    await expect(page).toHaveURL(/\/owner\/offerings#earnings$/u)
    await expect(page.getByRole('heading', { name: 'Earnings and payouts' }).or(
      page.getByRole('button', { name: 'Create supplier workspace' }),
    )).toBeVisible()
  })
})
