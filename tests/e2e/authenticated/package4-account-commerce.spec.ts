import { clerk } from '@clerk/testing/playwright'
import { expect, test } from '@playwright/test'

import {
  authenticatedE2EEnvironment,
  requireAuthenticatedE2EEnvironment,
} from './environment'

test.describe('Package 4 Account commerce', () => {
  test.skip(
    !authenticatedE2EEnvironment.configured,
    'Requires Clerk test-instance keys, a dedicated owner, and a configured Convex-backed application.',
  )

  test('keeps funding, documents, reconciliation, and Calls attached to the owner Account', async ({ page }) => {
    const environment = requireAuthenticatedE2EEnvironment()
    if (environment.ownerEmail === undefined) {
      throw new Error('authenticated_e2e_owner_email_missing')
    }

    await page.goto('/')
    await clerk.signIn({ page, emailAddress: environment.ownerEmail })

    await page.goto('/owner/credit', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Funding', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Account balance' })).toBeVisible()
    await expect(page.getByText(/Paid Calls reserve AUD from this Account/iu)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible()
    await expect(page.getByText(/immutable Account postings/iu)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Reconciliation', exact: true })).toBeVisible()
    await expect(page.getByText(/scope-limited cases until an owner closes them with evidence/iu)).toBeVisible()

    await page.getByLabel('Account funding amount (AUD)').fill('5.00')
    await expect(page.getByRole('definition').filter({ hasText: 'AUD 5.000000' })).toBeVisible()
    await page.getByRole('button', { name: 'Continue to Stripe Checkout' }).click()
    await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//u)
    await expect(page.getByText('AE credit', { exact: true })).toBeVisible()
    await expect(page.getByText(/A\$5\.28/u)).toBeVisible()

    await page.goto(`${environment.baseURL}/activity`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Calls', level: 1 })).toBeVisible()
    await expect(page.getByText(/task, outcome, amount, and receipt/iu)).toBeVisible()
    await expect(page.getByText(/wallet signature|client_secret|private key/iu)).toHaveCount(0)
  })
})
