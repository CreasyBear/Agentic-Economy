import { expect, test, type Page } from '@playwright/test'

const QUERY = 'emergency plumber parramatta'
const INQUIRY_READY_QUERY = 'diagnostic plumbing parramatta'
const INQUIRY_HANDOFF_QUERY = 'Send a qualified inquiry to the first listed business'
const futureSurfaceCopy =
  /book now|booking confirmed|pay now|payment required|protected action|marketplace|request market|AI reply|autonomous|agent handled|guaranteed response|wallet|checkout|custody|settlement|x402|MCP|OpenAPI|callable|agent-native/i
const publicInternalCopy = /\b(?:product|internal|runtime|ownerId|businessId|serviceId|sourceHash|rawContact|clerk|admin)\b/i

test.describe('chat discovery to inquiry loop', () => {
  test('keeps the discovery loop boundary-honest when inquiry is not published', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('search', { name: /find local service businesses/i })).toBeVisible()

    await submitLandingQuery(page, QUERY)
    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    const threadPath = new URL(page.url()).pathname
    await expectQueryInTranscript(page, QUERY)
    await waitForLatestReadyAnswer(page)

    await expect(page.getByRole('region', { name: /inquiry path/i })).toContainText(/1 listed business ready to compare/i)
    await expect(page.getByRole('region', { name: /session context/i })).toContainText(/listed businesses/i)
    await expect(page.getByRole('region', { name: /business shortlist/i })).toContainText(/These are the listed businesses AE found/i)
    await expect(page.getByRole('region', { name: /continue this thread/i })).toContainText(
      /These listings need a published inquiry path before AE can route contact/i,
    )
    await expect(page.getByRole('region', { name: /continue this thread/i })).not.toContainText(/Start qualified inquiry/i)
    await expect(page.getByRole('region', { name: /business shortlist/i })).toContainText(/No AE inquiry form is published yet/i)

    const reviewLink = page
      .getByRole('region', { name: /business shortlist/i })
      .getByRole('link', { name: /review listing|view details/i })
    await expect(reviewLink).toHaveAttribute(
      'href',
      new RegExp(`/parramatta-emergency-plumbing\\?from=thread&id=${threadPath.split('/').at(-1)}`),
    )
    await reviewLink.click()

    await expect(page).toHaveURL(/\/parramatta-emergency-plumbing\?from=thread&id=.+/, { timeout: 15_000 })
    await expect(page.getByText(/This service has not published a human inquiry path yet/i)).toBeVisible()
    await expect(page.getByText(/the business handles timing, price, and availability/i)).toBeVisible()
    await assertPublicLanguage(page)
  })

  test('carries an inquiry-ready listed business into the qualified inquiry form', async ({ page }) => {
    test.setTimeout(45_000)
    await page.goto('/')
    await expect(page.getByRole('search', { name: /find local service businesses/i })).toBeVisible()

    await submitLandingQuery(page, INQUIRY_READY_QUERY)
    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    const threadPath = new URL(page.url()).pathname
    await expectQueryInTranscript(page, INQUIRY_READY_QUERY)
    await waitForLatestReadyAnswer(page)

    await expect(page.getByRole('region', { name: /inquiry path/i })).toContainText(/1 listed business ready to compare/i)
    await expect(page.getByRole('region', { name: /business shortlist/i })).toContainText(/Demo Plumbing/i)
    await expect(page.getByRole('region', { name: /business shortlist/i })).toContainText(/AE inquiry form published/i)
    await expect(page.getByRole('region', { name: /continue this thread/i })).toContainText(
      /Narrow, compare, or start a qualified inquiry from the listed businesses above/i,
    )

    const startInquiryButton = page.getByRole('button', { name: /start qualified inquiry/i })
    await expect(startInquiryButton).toBeEnabled()
    await startInquiryButton.click()
    await expectQueryInTranscript(page, INQUIRY_HANDOFF_QUERY)
    await waitForLatestReadyAnswer(page)

    const selectedBusiness = page.getByRole('region', { name: /selected business/i })
    await expect(selectedBusiness).toContainText(/Demo Plumbing/i, { timeout: 30_000 })
    await expect(selectedBusiness).toContainText(/Choice 1 from this thread/i)
    await expect(selectedBusiness).toContainText(/The business still confirms timing, quote, and availability/i)

    const inquiryLink = selectedBusiness.getByRole('link', { name: /open inquiry form/i })
    await expect(inquiryLink).toHaveAttribute('href', /\/plumbing-demo\/inquiry\?from=thread&id=.+/)
    await inquiryLink.click()

    await expect(page).toHaveURL(/\/plumbing-demo\/inquiry\?from=thread&id=.+/, { timeout: 15_000 })
    await expect(page.getByRole('note', { name: /answer context/i })).toContainText(
      /This inquiry continues Demo Plumbing from your answer thread/i,
    )
    await expect(
      page.getByRole('note', { name: /answer context/i }).getByRole('link', { name: /back to answer/i }),
    ).toHaveAttribute('href', threadPath)
    await assertPublicLanguage(page)
  })
})

async function submitLandingQuery(page: Page, query: string) {
  const search = page.getByRole('search', { name: /find local service businesses/i })
  const searchbox = search.getByRole('searchbox', { name: /what do you need done/i })
  await expect(searchbox).toBeEditable({ timeout: 30_000 })
  await searchbox.fill(query)
  await expect(searchbox).toHaveValue(query)
  const sendButton = search.getByRole('button', { name: /^send$/i })
  await expect(sendButton).toBeEnabled()
  await searchbox.press('Enter')
}

async function expectQueryInTranscript(page: Page, query: string) {
  await expect(
    page.getByRole('log', { name: /chat transcript/i }).getByText(query).first(),
  ).toBeVisible({ timeout: 15_000 })
}

async function waitForLatestReadyAnswer(page: Page) {
  await expect(page.getByText(/Answer ready\./i).last()).toBeVisible({ timeout: 30_000 })
}

async function assertPublicLanguage(page: Page) {
  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toMatch(futureSurfaceCopy)
  expect(bodyText).not.toMatch(publicInternalCopy)
  expect(bodyText).not.toMatch(/[—–]/)
}
