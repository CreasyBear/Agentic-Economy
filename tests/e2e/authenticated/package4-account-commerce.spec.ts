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
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible()
    await expect(page.getByText(/immutable Account postings/iu)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Reconciliation' })).toBeVisible()
    await expect(page.getByText(/owned case until evidence closes it/iu)).toBeVisible()

    await page.goto('/activity', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Calls', level: 1 })).toBeVisible()
    await expect(page.getByText(/task, outcome, amount, and receipt/iu)).toBeVisible()
    await expect(page.getByText(/wallet signature|client_secret|private key/iu)).toHaveCount(0)
  })
})
