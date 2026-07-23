import { expect, test, type Page } from '@playwright/test'

const FIRST_QUERY = 'emergency plumber parramatta'
const SECOND_QUERY = 'emergency roofer nowhere 9999'

const futureSurfaceCopy =
  /book now|booking confirmed|pay now|payment required|protected action|marketplace|request market|AI reply|autonomous|agent handled|guaranteed response|wallet|checkout|custody|settlement|x402|MCP|OpenAPI|callable|agent-native/i
const publicInternalCopy = /\b(?:product|internal|runtime|ownerId|businessId|serviceId|sourceHash|rawContact|clerk|admin)\b/i

test.describe('thread-first answer flow', () => {
  test.describe.configure({ mode: 'serial' })

  test('submits a first query and lands on a thread URL with cited providers', async ({ page }, testInfo) => {
    await startFirstThread(page, testInfo.project.name)
    await waitForReadyAnswer(page)

    await expect(page.getByRole('region', { name: 'Published offerings' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Review business' })).toHaveCount(2)
    await expect(page.getByRole('button', { name: /get as agent json/i })).toBeVisible()

    // Cited provider cards and boundary copy require the dev server to run the
    // tool-use agent (OPENROUTER_API_KEY). When the key is absent the turn emits
    // a safe error and no provider cards; that grounded-prose contract is
    // covered by tests/integration/* with the agent test seam. Here we only
    // assert the key-independent structural contract plus public-language.
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/\b(?:KNOWN|UNKNOWN|UNAVAILABLE)\b/)
    await assertPublicLanguage(page)
  })

  test('shows the desktop sidebar after a second thread in the same session', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'compact-chromium', 'The recent-questions sidebar is not shown by default on compact viewports.')
    await startFirstThread(page, testInfo.project.name)
    await waitForReadyAnswer(page)
    await expect(page.getByRole('region', { name: 'Published offerings' })).toBeVisible({ timeout: 15_000 })
    const firstThreadUrl = page.url()

    await page.getByRole('link', { name: /ask another/i }).click()
    await expect(page).toHaveURL(/\/(?:\?q=)?$/)

    await startThreadFromQueryUrl(page, SECOND_QUERY, { expectTranscript: false })

    const recentQuestions = page.getByRole('complementary', { name: /recent questions/i })
    await expect(recentQuestions).toBeVisible()
    const firstThreadLink = recentQuestions.locator(`a[href="${new URL(firstThreadUrl).pathname}"]`)
    await expect(firstThreadLink).toBeVisible({ timeout: 15_000 })
    await expect(
      recentQuestions.getByRole('link', { name: /emergency roofer nowhere 9999/i }).first(),
    ).toBeVisible({ timeout: 15_000 })

    await firstThreadLink.click()
    await expect(page).toHaveURL(firstThreadUrl)
  })
})

async function startFirstThread(page: Page, projectName: string) {
  if (projectName === 'compact-chromium') {
    await startThreadFromQueryUrl(page, FIRST_QUERY)
    return
  }

  await page.goto('/')
  await expect(page.getByRole('search', { name: /find local service businesses/i })).toBeVisible()
  await submitThreadQuery(page, FIRST_QUERY)
}

async function startThreadFromQueryUrl(
  page: Page,
  query: string,
  options: { expectTranscript?: boolean } = {},
) {
  await page.goto(`/?q=${encodeURIComponent(query)}`)
  await expect(page).toHaveURL(/\/t\//, { timeout: 30_000 })
  if (options.expectTranscript !== false) {
    await expectQueryInTranscript(page, query)
  }
}

async function submitThreadQuery(page: Page, query: string) {
  const search = page.getByRole('search', { name: /find local service businesses/i })
  const searchbox = search.getByRole('searchbox')
  await expect(searchbox).toBeEditable({ timeout: 30_000 })
  await searchbox.fill(query)
  await expect(searchbox).toHaveValue(query)
  const sendButton = search.getByRole('button', { name: /^find businesses$/i })
  await expect(sendButton).toBeEnabled()
  await sendButton.click()
  await expect(page).toHaveURL(/\/t\//, { timeout: 30_000 })
  await expectQueryInTranscript(page, query)
}

async function expectQueryInTranscript(page: Page, query: string) {
  await expect(
    page.getByRole('log', { name: /chat transcript/i }).getByText(query).first(),
  ).toBeVisible({ timeout: 15_000 })
}

async function waitForReadyAnswer(page: Page) {
  await expect(page.getByText(/Answer ready\./i)).toBeVisible({ timeout: 30_000 })
}

async function assertPublicLanguage(page: Page) {
  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toMatch(futureSurfaceCopy)
  expect(bodyText).not.toMatch(publicInternalCopy)
  expect(bodyText).not.toMatch(/[—–]/)
}
