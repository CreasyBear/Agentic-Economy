import { expect, test, type Page } from '@playwright/test'
import { LOCAL_E2E_BUSINESS_FIXTURES } from '../helpers/local-e2e-business-fixtures'

const demoBusiness = LOCAL_E2E_BUSINESS_FIXTURES.find((fixture) => fixture.requestedSlug === 'demo-inquiry-provider')
if (demoBusiness === undefined) {
  throw new Error('The demo-inquiry-provider local E2E fixture is required.')
}

const futureSurfaceCopy =
  /book now|booking confirmed|pay now|payment required|protected action|marketplace|request market|AI reply|autonomous|agent handled|guaranteed response|wallet|checkout|custody|settlement|x402|MCP|OpenAPI|callable|agent-native/i
const publicInternalCopy = /\b(?:product|internal|runtime|ownerId|businessId|offeringRef|sourceHash|rawContact|clerk|admin)\b/i

test.describe('landing query -> thread answer', () => {
  test('submits a need and streams a cited provider answer on a thread page', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('search', { name: /ask a question or describe what you need done/i })).toBeVisible()

    const query = 'listed offering parramatta'
    await submitLandingQuery(page, query)

    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    await expectQueryInTranscript(page, query)

    await expect(page.getByRole('link', { name: demoBusiness.businessName })).toBeVisible()
    await expect(page.getByRole('link', { name: /Demo listed provider/i })).toBeVisible()
    await expect(page.getByText(/publishes Listed offering/i).first()).toBeVisible()
    await expect(page.getByText(/Published matches do not confirm price or current availability/i).first()).toBeVisible()
    await expect(page.getByText(/confirm timing, price, and current availability directly/i).first()).toBeVisible()

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/\b(?:KNOWN|UNKNOWN|UNAVAILABLE)\b/)
    await assertPublicLanguage(page)
  })

  test('shows an options nudge when no matches are found', async ({ page }) => {
    await page.goto('/')
    const query = 'dentist parramatta'
    const search = page.getByRole('search', { name: /ask a question or describe what you need done/i })
    const searchbox = search.getByRole('searchbox')
    const sendButton = search.getByRole('button', { name: /^ask$/i })
    await expect(searchbox).toBeEditable()
    await searchbox.fill(query)
    await expect(sendButton).toBeEnabled()

    const todayTiming = page.getByRole('radio', { name: 'Today' })
    await expect(todayTiming).toBeEnabled()
    await todayTiming.click()
    await expect(todayTiming).toHaveAttribute('aria-checked', 'true')
    await sendButton.click()

    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    await expectQueryInTranscript(page, query)

    await expect(page.getByText(/No (?:businesses match|matches found)/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /See other options/i })).toBeVisible()
    await expect(page.getByText('No request was sent to a business.', { exact: true })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Today' })).toHaveAttribute('aria-checked', 'true')
    const jsonAction = page.getByRole('button', { name: 'Data for AI assistants' })
    await jsonAction.click()
    const preview = page.getByRole('dialog', { name: 'Data for AI assistants' })
    await expect(preview).toBeVisible()
    await expect(preview.getByLabel('Assistant data')).toContainText(`"query": "${query}"`)
    await expect(preview.getByRole('button', { name: 'Confirm and copy data' })).toBeEnabled()
    await assertPublicLanguage(page)
  })
})

async function submitLandingQuery(page: Page, query: string) {
  const search = page.getByRole('search', { name: /ask a question or describe what you need done/i })
  const searchbox = search.getByRole('searchbox')
  const sendButton = search.getByRole('button', { name: /^ask$/i })
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
