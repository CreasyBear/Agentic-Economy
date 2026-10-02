import { clerk } from '@clerk/testing/playwright'
import { expect } from '@playwright/test'
import { test } from './fixtures'

import {
  authenticatedE2EEnvironment,
  requireAuthenticatedE2EEnvironment,
} from './environment'

test.describe('Package 4 Account commerce', () => {
  test.skip(
    !authenticatedE2EEnvironment.configured,
    'Requires Clerk test-instance keys, a dedicated owner, and a configured Convex-backed application.',
  )

  test('reads Credit, documents, reconciliation, and Calls for the owner Account', async ({ page }) => {
    const environment = requireAuthenticatedE2EEnvironment()
    if (environment.ownerEmail === undefined) {
      throw new Error('authenticated_e2e_owner_email_missing')
    }

    await page.goto('/')
    await clerk.signIn({ page, emailAddress: environment.ownerEmail })

    await page.goto('/owner/credit')
    await expect(page.getByRole('heading', { name: 'Credit', level: 1 })).toBeVisible()
    await expect(page.locator('#fund').getByText('Available credit', { exact: true })).toBeVisible()
    await expect(page.locator('#fund').locator('[aria-live="polite"]')).toHaveText(/^Available credit A\$[\d,]+\.\d{2}\.$/u)
    await expect(page.locator('#fund').getByRole('heading', { name: 'Add funds' })).toBeVisible()
    await expect(page.getByText(/Paid Calls reserve AUD from this Account/iu)).toBeVisible()
    await page.getByText('Accounting records and administration', { exact: true }).click()
    await expect(page.getByRole('group', { name: 'Accounting records', exact: true })).toHaveAttribute('aria-busy', 'false')
    const documents = page.getByRole('region', { name: 'Documents', exact: true })
    await expect(documents.getByText('No accounting documents yet', { exact: true }).or(
      documents.getByText('Reference', { exact: true }).first(),
    )).toBeVisible()
    await expect(documents.getByText('Documents unavailable', { exact: true })).toHaveCount(0)
    const reconciliation = page.getByRole('region', { name: 'Reconciliation', exact: true })
    await expect(reconciliation.getByText('No reconciliation differences', { exact: true }).or(
      reconciliation.getByText('Reference', { exact: true }).first(),
    )).toBeVisible()
    await expect(reconciliation.getByText('Reconciliation unavailable', { exact: true })).toHaveCount(0)

    await page.goto('/activity')
    await expect(page.getByRole('heading', { name: 'Calls', level: 1 })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: /^(?:No Calls yet\.|\d+ Calls need attention\. \d+ recent Calls shown\.)$/u })).toHaveCount(1)
    await expect(page.getByText('Calls are temporarily unavailable', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/wallet signature|client_secret|private key/iu)).toHaveCount(0)
  })

  test('preserves the displayed Account funding quote in Stripe Checkout', async ({ page }) => {
    const environment = requireAuthenticatedE2EEnvironment()
    if (environment.ownerEmail === undefined) {
      throw new Error('authenticated_e2e_owner_email_missing')
    }

    await page.goto('/')
    await clerk.signIn({ page, emailAddress: environment.ownerEmail })
    await page.goto('/owner/credit')
    await page.getByLabel('Other amount (AUD)', { exact: true }).fill('5.00')
    const quote = page.getByLabel('Funding quote', { exact: true })
    await expect(quote.locator('dt').filter({ hasText: /^Credit added$/u }).locator('+ dd')).toHaveText('A$5.00')
    const total = quote.locator('dt').filter({ hasText: /^Total payable$/u }).locator('+ dd')
    await expect(total).toHaveText(/^A\$[\d,]+\.\d{2}$/u)
    const totalPayable = await total.innerText()
    await page.getByRole('button', { name: `Pay ${totalPayable} and add A$5.00`, exact: true }).click()
    await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//u)
    await expect(page.getByText('Agentic Economy Account credit', { exact: true })).toBeVisible()
    await expect(page.getByText('Australian GST', { exact: true })).toBeVisible()
    await expect(page.getByTestId('product-summary-total-amount').getByText(totalPayable, { exact: true })).toBeVisible()
  })
})
