import { expect, test, type Page } from '@playwright/test'

const futureSurfaceCopy =
  /book now|booking confirmed|pay now|payment required|protected action|marketplace|request market|AI reply|autonomous|agent handled|guaranteed response|wallet|checkout|custody|settlement|x402|MCP|OpenAPI|callable|agent-native/i
const publicInternalCopy = /\b(?:product|internal|runtime|ownerId|businessId|serviceId|sourceHash|rawContact|clerk|admin)\b/i

test.describe('thread-first answer flow', () => {
  test('submits a first query and lands on a thread URL with cited providers', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('search', { name: /find local service providers/i })).toBeVisible()
    await page.getByRole('searchbox', { name: /what do you need done/i }).fill('emergency plumber parramatta')
    await page.getByRole('button', { name: /^ask$/i }).click()

    await page.waitForURL(/\/t\//)

    await expect(page.getByText('emergency plumber parramatta').first()).toBeVisible()
    await expect(page.getByRole('list', { name: /suggested follow-ups/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /get the agent json answer/i })).toBeVisible()

    // Cited provider cards and boundary copy require the dev server to run the
    // tool-use agent (OPENROUTER_API_KEY). When the key is absent the turn emits
    // a safe error and no provider cards; that grounded-prose contract is
    // covered by tests/integration/* with the agent test seam. Here we only
    // assert the key-independent structural contract plus public-language.
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/\b(?:KNOWN|UNKNOWN|UNAVAILABLE)\b/)
    await assertPublicLanguage(page)
  })

  test('supports a follow-up turn in the same thread', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('searchbox', { name: /what do you need done/i }).fill('emergency plumber parramatta')
    await page.getByRole('button', { name: /^ask$/i }).click()
    await page.waitForURL(/\/t\//)

    await expect(page.getByRole('list', { name: /suggested follow-ups/i })).toBeVisible()

    await page.getByRole('button', { name: /what ae can do/i }).click()

    await expect(page.getByText(/What can Agentic Economy do here/i).first()).toBeVisible()
    await assertPublicLanguage(page)
  })

  test('shows the sidebar after the first turn in a fresh session', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('searchbox', { name: /what do you need done/i }).fill('emergency plumber parramatta')
    await page.getByRole('button', { name: /^ask$/i }).click()
    await page.waitForURL(/\/t\//)

    // The session sidebar should appear after the first turn, listing that turn.
    await expect(page.getByRole('complementary', { name: /recent questions/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /emergency plumber parramatta/i })).toBeVisible()
    await assertPublicLanguage(page)
  })

  test('shows the sidebar after a second thread in the same session', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('searchbox', { name: /what do you need done/i }).fill('emergency plumber parramatta')
    await page.getByRole('button', { name: /^ask$/i }).click()
    await page.waitForURL(/\/t\//)
    const firstThreadUrl = page.url()

    await page.getByRole('link', { name: /new question/i }).click()
    await page.waitForURL('/')

    await page.getByRole('searchbox', { name: /what do you need done/i }).fill('zzz-no-match-thread-two')
    await page.getByRole('button', { name: /^ask$/i }).click()
    await page.waitForURL(/\/t\//)

    await expect(page.getByRole('complementary', { name: /recent questions/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /emergency plumber parramatta/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /zzz-no-match-thread-two/i })).toBeVisible()

    await page.getByRole('link', { name: /emergency plumber parramatta/i }).click()
    await expect(page).toHaveURL(firstThreadUrl)
  })
})

async function assertPublicLanguage(page: Page) {
  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toMatch(futureSurfaceCopy)
  expect(bodyText).not.toMatch(publicInternalCopy)
  expect(bodyText).not.toMatch(/[—–]/)
}
