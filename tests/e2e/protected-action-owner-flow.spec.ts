import { expect, test } from '@playwright/test'

const forbiddenFutureSurfaceCopy =
  /book now|booking confirmed|pay now|payment required|marketplace|request market|autonomous protected execution|auto-execute|provider success/i

test.describe('selected protected action routes', () => {
  test('owner queue and detail stay contact-follow-up specific', async ({ page }) => {
    await page.goto('/owner/actions')

    await expect(page.getByRole('heading', { name: /contact follow-up requests need approval/i })).toBeVisible()
    await expect(page.getByText(/contact follow-up is owner-pending/i)).toBeVisible()
    await expect(page.getByText(/No contact follow-up requests/i)).toBeVisible()
    expect(await page.locator('body').innerText()).not.toMatch(forbiddenFutureSurfaceCopy)

    await page.goto('/owner/actions/contact-follow-up%3Amissing-route')
    await expect(page.getByRole('heading', { name: /review contact follow-up/i })).toBeVisible()
    await expect(page.getByText(/No source-owned request exists for this ID/i)).toBeVisible()
    await expect(page.getByText(/does not book work, charge money, guarantee response, or authorize future actions/i)).toBeVisible()
  })

  test('owner receipt and admin reconstruction expose source-owned readback only', async ({ page }) => {
    await page.goto('/owner/actions/contact-follow-up%3Amissing-route/receipt')
    await expect(page.getByRole('heading', { name: /contact follow-up reconstruction/i })).toBeVisible()
    await expect(page.getByText(/No raw provider payload is shown/i)).toBeVisible()

    await page.goto('/admin/protected-actions')
    await expect(page.getByRole('heading', { name: /contact follow-up reconstruction/i })).toBeVisible()
    await expect(page.getByText(/No protected action rows/i)).toBeVisible()

    await page.goto('/admin/protected-actions/contact-follow-up%3Amissing-route')
    await expect(page.getByRole('heading', { name: /protected action detail/i })).toBeVisible()
    await expect(page.getByText(/No raw provider payloads are exposed/i)).toBeVisible()
    expect(await page.locator('body').innerText()).not.toMatch(forbiddenFutureSurfaceCopy)
  })
})
