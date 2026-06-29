import { expect, test } from '@playwright/test'

const forbiddenFutureSurfaceCopy =
  /book now|booking confirmed|pay now|payment required|marketplace|request market|autonomous protected execution|auto-execute|provider success/i
const approvedProposalPath = '/owner/actions/contact-follow-up%3Acontact-follow-up%3Alocal-e2e-proposal'
const pendingProposalPath = '/owner/actions/contact-follow-up%3Acontact-follow-up%3Alocal-e2e-pending-proposal'
const failedProposalPath = '/owner/actions/contact-follow-up%3Acontact-follow-up%3Alocal-e2e-failed-proposal'

test.describe('selected protected action routes', () => {
  test('owner queue and approval detail use populated contact-follow-up source state', async ({ page }) => {
    await page.goto('/owner/actions')

    await expect(page.getByRole('heading', { name: /contact follow-up requests need approval/i })).toBeVisible()
    await expect(page.getByText(/contact follow-up is owner-pending/i)).toBeVisible()
    await expect(page.getByText('Pat Customer')).toBeVisible()
    await expect(page.getByText('Taylor Customer')).toBeVisible()
    await expect(page.getByText('Jordan Customer')).toBeVisible()
    await expect(page.getByText(/No contact follow-up requests/i)).toHaveCount(0)
    expect(await page.locator('body').innerText()).not.toMatch(forbiddenFutureSurfaceCopy)

    await page.goto(pendingProposalPath)
    await expect(page.getByRole('heading', { name: /review contact follow-up/i })).toBeVisible()
    await expect(page.getByText('Taylor Customer')).toBeVisible()
    await expect(page.getByText(/does not book work, charge money, guarantee response, or authorize future actions/i)).toBeVisible()

    await page.getByRole('button', { name: /approve contact follow-up/i }).click()
    await expect(page.getByText(/consequence acknowledgement is required/i)).toBeVisible()
    await expect(page.getByLabel(/I understand this approves one contact follow-up attempt/i)).toBeFocused()

    await page.getByLabel(/I understand this approves one contact follow-up attempt/i).check()
    await page.getByRole('button', { name: /approve contact follow-up/i }).click()
    await expect(page.getByText(/contact follow-up approved and source readback recorded/i)).toBeVisible()
    await expect(page.getByText(/receipt recorded/i).first()).toBeVisible()
    expect(await page.locator('body').innerText()).not.toMatch(forbiddenFutureSurfaceCopy)
  })

  test('owner reject path records decision without gateway or attempt', async ({ page }) => {
    await page.goto(pendingProposalPath)

    await page.getByRole('button', { name: /reject contact follow-up/i }).click()
    await expect(page.getByText(/reject reason is required/i)).toBeVisible()
    await expect(page.getByLabel(/reject reason/i)).toBeFocused()

    await page.getByLabel(/reject reason/i).fill('Owner declined this source-owned follow-up.')
    await page.getByRole('button', { name: /reject contact follow-up/i }).click()
    await expect(page.getByText(/contact follow-up rejected/i)).toBeVisible()
    await expect(page.getByText(/owner rejected/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /approve contact follow-up/i })).toBeDisabled()
    expect(await page.locator('body').innerText()).not.toMatch(forbiddenFutureSurfaceCopy)
  })

  test('owner receipt and admin reconstruction expose source-owned readback only', async ({ page }) => {
    await page.goto(`${approvedProposalPath}/receipt`)
    await expect(page.getByRole('heading', { name: /contact follow-up reconstruction/i })).toBeVisible()
    await expect(page.getByText(/receipt recorded/i).first()).toBeVisible()
    await expect(page.getByText(/private evidence refs/i)).toBeVisible()
    await expect(page.getByText(/No raw provider payload is shown/i)).toBeVisible()

    await page.goto(`${failedProposalPath}/receipt`)
    await expect(page.getByText(/proof gap/i).first()).toBeVisible()
    await expect(page.getByText(/retry available/i).first()).toBeVisible()

    await page.goto('/admin/protected-actions')
    await expect(page.getByRole('heading', { name: /contact follow-up reconstruction/i })).toBeVisible()
    await expect(page.getByText(/No protected action rows/i)).toHaveCount(0)
    await expect(page.getByText(/contact-follow-up:contact-follow-up:local-e2e-proposal/i)).toBeVisible()
    await expect(page.getByText(/proof gap/i).first()).toBeVisible()

    await page.goto('/admin/protected-actions/contact-follow-up%3Acontact-follow-up%3Alocal-e2e-failed-proposal')
    await expect(page.getByRole('heading', { name: /protected action detail/i })).toBeVisible()
    await expect(page.getByText(/proof gap/i).first()).toBeVisible()
    await expect(page.getByText(/No raw provider payloads are exposed/i)).toBeVisible()
    expect(await page.locator('body').innerText()).not.toMatch(forbiddenFutureSurfaceCopy)
  })
})
