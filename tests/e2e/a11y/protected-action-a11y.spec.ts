import { expect, test, type Page } from '@playwright/test'

const pendingProposalPath = '/owner/actions/contact-follow-up%3Acontact-follow-up%3Alocal-e2e-pending-proposal'
const staleProposalPath = '/owner/actions/contact-follow-up%3Acontact-follow-up%3Alocal-e2e-stale-proposal'
const wrongOwnerProposalPath = '/owner/actions/contact-follow-up%3Acontact-follow-up%3Alocal-e2e-wrong-owner-proposal'

test.describe('selected protected action accessibility', () => {
  test('owner/admin protected-action routes keep keyboard-visible controls and mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })

    await page.goto('/owner/actions')
    await expect(page.getByRole('heading', { name: /contact follow-up requests need approval/i })).toBeVisible()
    await expect(page.getByText('Taylor Customer')).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await page.goto(pendingProposalPath)
    await expect(page.getByRole('button', { name: /approve contact follow-up/i })).toBeEnabled()
    await expect(page.getByRole('button', { name: /reject contact follow-up/i })).toBeEnabled()
    await page.getByRole('button', { name: /approve contact follow-up/i }).click()
    await expect(page.getByLabel(/I understand this approves one contact follow-up attempt/i)).toBeFocused()
    await page.getByLabel(/reject reason/i).fill('')
    await page.getByRole('button', { name: /reject contact follow-up/i }).click()
    await expect(page.getByLabel(/reject reason/i)).toBeFocused()
    await expectNoHorizontalOverflow(page)

    await page.goto('/admin/protected-actions')
    await expect(page.getByLabel('Proposal ID')).toBeVisible()
    await expect(page.getByRole('button', { name: /filter/i })).toBeVisible()
    await expect(page.getByText(/receipt recorded/i).first()).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await page.goto(staleProposalPath)
    await expect(page.getByText(/owner decision disabled/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /approve contact follow-up/i })).toBeDisabled()
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await page.goto(wrongOwnerProposalPath)
    await expect(page.getByText(/contact follow-up unavailable/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /approve contact follow-up/i })).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
  })
})

async function expectNoHorizontalOverflow(page: Page) {
  const hasNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  expect(hasNoOverflow).toBe(true)
}
