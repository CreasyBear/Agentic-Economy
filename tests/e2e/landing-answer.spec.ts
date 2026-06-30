import { expect, test, type Page } from '@playwright/test'

const futureSurfaceCopy =
  /book now|booking confirmed|pay now|payment required|protected action|marketplace|request market|AI reply|autonomous|agent handled|guaranteed response|wallet|checkout|custody|settlement|x402|MCP|OpenAPI|callable|agent-native/i
const publicInternalCopy = /\b(?:product|internal|runtime|ownerId|businessId|serviceId|sourceHash|rawContact|clerk|admin)\b/i

test.describe('landing query -> generative answer', () => {
  test('submits a need and streams a cited provider answer', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('search', { name: /find local service providers/i })).toBeVisible()

    await page.getByRole('searchbox', { name: /what do you need done/i }).fill('emergency plumber parramatta')
    await page.getByRole('button', { name: /^ask$/i }).click()

    // Home hands off to the shareable answer page (/q/$answerId).
    await page.waitForURL(/\/q\//)

    const answer = page.locator('section[aria-label="Answer"]')
    await expect(answer).toBeVisible()
    await expect(answer.getByRole('link', { name: /Parramatta Emergency Plumbing/i })).toBeVisible()
    await expect(answer.getByText(/No booking or payment happens on this page/i).first()).toBeVisible()
    await expect(answer.getByRole('button', { name: /get the agent json answer/i })).toBeVisible()

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/\b(?:KNOWN|UNKNOWN|UNAVAILABLE)\b/)
    await assertPublicLanguage(page)
  })

  test('shows a listing nudge when no providers match', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('searchbox', { name: /what do you need done/i }).fill('zzz-no-such-trade-xyz')
    await page.getByRole('button', { name: /^ask$/i }).click()

    await page.waitForURL(/\/q\//)

    const answer = page.locator('section[aria-label="Answer"]')
    await expect(answer).toBeVisible()
    await expect(answer.getByText(/No listed businesses match/i)).toBeVisible()
    await expect(answer.getByRole('link', { name: /list your business/i })).toBeVisible()
    await assertPublicLanguage(page)
  })
})

async function assertPublicLanguage(page: Page) {
  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toMatch(futureSurfaceCopy)
  expect(bodyText).not.toMatch(publicInternalCopy)
  expect(bodyText).not.toMatch(/[—–]/)
}
