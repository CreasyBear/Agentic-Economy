import { expect, test, type Page } from '@playwright/test'

const futureSurfaceCopy =
  /book now|booking confirmed|pay now|payment required|protected action|marketplace|request market|AI reply|autonomous|agent handled|guaranteed response|wallet|checkout|custody|settlement|x402|MCP|OpenAPI|callable|agent-native/i
const publicInternalCopy = /\b(?:product|internal|runtime|ownerId|businessId|serviceId|sourceHash|rawContact|clerk|admin)\b/i

test.describe('landing query -> thread answer', () => {
  test('submits a need and streams a cited provider answer on a thread page', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('search', { name: /find local service businesses/i })).toBeVisible()

    const query = 'emergency plumber parramatta'
    await submitLandingQuery(page, query)

    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    await expectQueryInTranscript(page, query)

    await expect(page.getByRole('link', { name: /Parramatta Emergency Plumbing/i })).toBeVisible()
    await expect(page.getByText(/publishes service coverage/i).first()).toBeVisible()
    await expect(page.getByText(/Open a listed business page and send an inquiry/i).first()).toBeVisible()

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/\b(?:KNOWN|UNKNOWN|UNAVAILABLE)\b/)
    await assertPublicLanguage(page)
  })

  test('shows a listing nudge when no providers match', async ({ page }) => {
    await page.goto('/')

    const query = 'dentist parramatta'
    await submitLandingQuery(page, query)

    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    await expectQueryInTranscript(page, query)

    await expect(page.getByText(/No listed businesses match/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /Browse listed businesses/i })).toBeVisible()
    await assertPublicLanguage(page)
  })
})

async function submitLandingQuery(page: Page, query: string) {
  const search = page.getByRole('search', { name: /find local service businesses/i })
  const searchbox = search.getByRole('searchbox')
  const sendButton = search.getByRole('button', { name: /^find businesses$/i })
  await expect(async () => {
    await expect(searchbox).toBeEditable()
    await searchbox.fill(query)
    await expect(searchbox).toHaveValue(query)
    await expect(sendButton).toBeEnabled()
    await sendButton.click()
  }).toPass({ timeout: 30_000 })
}

async function expectQueryInTranscript(page: Page, query: string) {
  await expect(
    page.getByRole('log', { name: /chat transcript/i }).getByText(query).first(),
  ).toBeVisible({ timeout: 15_000 })
}

async function assertPublicLanguage(page: Page) {
  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toMatch(futureSurfaceCopy)
  expect(bodyText).not.toMatch(publicInternalCopy)
  expect(bodyText).not.toMatch(/[—–]/)
}
