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
    await expect(page.getByLabel('Funding quote').getByText('AUD 5.000000', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Continue to Stripe' }).click()
    await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//u)
    await expect(page.getByText('Agentic Economy Account credit', { exact: true })).toBeVisible()
    await expect(page.getByTestId('product-summary-total-amount').getByText('A$5.28', { exact: true })).toBeVisible()

    await page.goto(`${environment.baseURL}/activity`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Calls', level: 1 })).toBeVisible()
    await expect(page.getByText(/amount, outcome, and durable receipt together/iu)).toBeVisible()
    await expect(page.getByText(/wallet signature|client_secret|private key/iu)).toHaveCount(0)
  })
})
