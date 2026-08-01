import { expect, test } from '@playwright/test'

test.describe('local auth boundary', () => {
  test('renders an intentional local sign-in state without a Clerk crash', async ({ page }) => {
    await page.goto('/sign-in?redirect=%2Fagent-access', { waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { name: 'Local preview sign-in is off' })).toBeVisible()
    await expect(page.getByText('Nothing is signed in or authorized.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open assistant access preview' })).toBeVisible()
    await expect(page.getByText(/clerkprovider|application error|something went wrong/i)).toHaveCount(0)
  })

  test('renders an empty local assistant-access view without a source error', async ({ page }) => {
    await page.goto('/agent-access', { waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { name: 'Assistant access', exact: true })).toBeVisible()
    await expect(page.getByText('Local preview — no assistant is connected')).toBeVisible()
    await expect(page.getByText('No assistant is connected yet.')).toBeVisible()
    await expect(page.getByText('Assistant access unavailable')).toHaveCount(0)
  })
})
