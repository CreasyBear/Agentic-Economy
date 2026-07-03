import { expect, test, type Page } from '@playwright/test'

const QUERY = 'emergency plumber parramatta'
const INQUIRY_READY_QUERY = 'diagnostic plumbing parramatta'
const MULTI_PROVIDER_QUERY = 'plumbing parramatta'
const INQUIRY_HANDOFF_QUERY = 'Send a qualified inquiry to Demo Plumbing'
const BOUNDARY_FOLLOW_UP_QUERY = 'Can AE book this for me?'
const NON_INQUIRY_PROVIDER_QUERY = 'Message Parramatta Emergency Plumbing'
const FILTER_FOLLOW_UP_QUERY = 'Show only businesses that accept inquiries'
const FILTER_FOLLOW_UP_LABEL = /Inquiry-ready listings/
const COMPARE_FOLLOW_UP_QUERY = 'Compare the top two'
const COMPARE_FOLLOW_UP_LABEL = /Compare the top two/
const futureSurfaceCopy =
  /book now|booking confirmed|pay now|payment required|protected action|marketplace|request market|AI reply|autonomous|agent handled|guaranteed response|wallet|checkout|custody|settlement|x402|MCP|OpenAPI|callable|agent-native/i
const publicInternalCopy = /\b(?:product|internal|runtime|ownerId|businessId|serviceId|sourceHash|rawContact|clerk|admin)\b/i

test.describe('chat discovery to inquiry loop', () => {
  test.describe.configure({ mode: 'serial' })

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

    const startInquiryButton = page.getByRole('button', { name: /start qualified inquiry with demo plumbing/i })
    await expect(startInquiryButton).toBeEnabled()
    await startInquiryButton.click()
    await expectQueryInTranscript(page, INQUIRY_HANDOFF_QUERY)
    await waitForLatestReadyAnswer(page)

    await expect(page.getByRole('region', { name: /inquiry path/i })).toContainText(
      /Demo Plumbing selected for inquiry review/i,
    )
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

  test('keeps a compare follow-up grounded in the businesses already found', async ({ page }) => {
    test.setTimeout(45_000)
    await page.goto('/')
    await expect(page.getByRole('search', { name: /find local service businesses/i })).toBeVisible()

    await submitLandingQuery(page, MULTI_PROVIDER_QUERY)
    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    await expectQueryInTranscript(page, MULTI_PROVIDER_QUERY)
    await waitForLatestReadyAnswer(page)

    const shortlist = page.getByRole('region', { name: /business shortlist/i })
    await expect(shortlist).toContainText(/Demo Plumbing/i)
    await expect(shortlist).toContainText(/Parramatta Emergency Plumbing/i)

    const compareButton = page.getByRole('button', { name: /compare the top two listings/i })
    await expect(compareButton).toBeEnabled()
    await compareButton.click()

    await expectQueryInTranscript(page, COMPARE_FOLLOW_UP_QUERY, COMPARE_FOLLOW_UP_LABEL)
    await waitForLatestReadyAnswer(page)
    await expect(page.getByLabel(/turn context/i).last()).toContainText(
      /Comparing 2 listed businesses from this thread/i,
    )

    const checks = page.getByRole('button', { name: /how ae checked this/i }).last()
    await expect(checks).toContainText(/0 searches.*2 read.*2 listed.*5\/5 checks/i)
    await expect(page.getByRole('list', { name: /ae check steps/i }).last()).toContainText(
      /Using previous listed businesses/i,
    )
    await expect(page.getByRole('list', { name: /ae check steps/i }).last()).toContainText(
      /Comparing listed options/i,
    )

    const comparison = page.getByRole('region', { name: /business comparison/i })
    await expect(comparison).toContainText(/Published fit, side by side/i)
    await expect(comparison).toContainText(/Demo Plumbing/i)
    await expect(comparison).toContainText(/Parramatta Emergency Plumbing/i)
    await expect(comparison).toContainText(/Next step/i)
    await expect(page.getByRole('region', { name: /continue this thread/i })).toContainText(
      /Narrow, compare, or start a qualified inquiry from the listed businesses above/i,
    )
    await expect(page.getByRole('button', { name: /start qualified inquiry with demo plumbing/i })).toBeVisible()
    await assertPublicLanguage(page)
  })

  test('keeps an inquiry-ready filter as context for the qualified inquiry handoff', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')
    await expect(page.getByRole('search', { name: /find local service businesses/i })).toBeVisible()

    await submitLandingQuery(page, MULTI_PROVIDER_QUERY)
    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    await expectQueryInTranscript(page, MULTI_PROVIDER_QUERY)
    await waitForLatestReadyAnswer(page)

    const firstShortlist = page.getByRole('region', { name: /business shortlist/i }).last()
    await expect(firstShortlist).toContainText(/Demo Plumbing/i)
    await expect(firstShortlist).toContainText(/Parramatta Emergency Plumbing/i)

    const inquiryReadyButton = page.getByRole('button', { name: /only inquiry-ready listings/i })
    await expect(inquiryReadyButton).toBeEnabled()
    await inquiryReadyButton.click()

    await expectQueryInTranscript(page, FILTER_FOLLOW_UP_QUERY, FILTER_FOLLOW_UP_LABEL)
    await waitForLatestReadyAnswer(page)
    await expect(page.getByLabel(/turn context/i).last()).toContainText(
      /Filtering 1 listed business from this thread/i,
    )

    const checks = page.getByRole('button', { name: /how ae checked this/i }).last()
    await expect(checks).toContainText(/0 searches.*1 read.*1 listed.*5\/5 checks/i)
    await expect(page.getByRole('list', { name: /ae check steps/i }).last()).toContainText(
      /Using previous listed businesses/i,
    )
    await expect(page.getByRole('list', { name: /ae check steps/i }).last()).toContainText(/Checking fit/i)

    const filteredShortlist = page.getByRole('region', { name: /business shortlist/i }).last()
    await expect(filteredShortlist).toContainText(/1 listing/i)
    await expect(filteredShortlist).toContainText(/Demo Plumbing/i)
    await expect(filteredShortlist).not.toContainText(/Parramatta Emergency Plumbing/i)
    const sessionContext = page.getByRole('region', { name: /session context/i })
    await expect(sessionContext).toContainText(
      /This answer is narrowed to Demo Plumbing while AE keeps earlier listed businesses in the thread/i,
      { timeout: 30_000 },
    )
    await expect(sessionContext).toContainText(/Current answer/i)
    await expect(sessionContext).toContainText(/Demo Plumbing in this answer/i)
    await expect(sessionContext).toContainText(/Listed businesses/i)
    await expect(sessionContext).toContainText(/Parramatta Emergency Plumbing/i)
    await expect(page.getByRole('region', { name: /continue this thread/i })).toContainText(
      /Narrow, compare, or start a qualified inquiry from the listed businesses above/i,
    )

    const startInquiryButton = page.getByRole('button', { name: /start qualified inquiry with demo plumbing/i })
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
    await assertPublicLanguage(page)
  })

  test('keeps a named provider without an inquiry form out of the inquiry handoff', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')
    await expect(page.getByRole('search', { name: /find local service businesses/i })).toBeVisible()

    await submitLandingQuery(page, MULTI_PROVIDER_QUERY)
    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    await expectQueryInTranscript(page, MULTI_PROVIDER_QUERY)
    await waitForLatestReadyAnswer(page)

    const firstShortlist = page.getByRole('region', { name: /business shortlist/i }).last()
    await expect(firstShortlist).toContainText(/Demo Plumbing/i)
    await expect(firstShortlist).toContainText(/Parramatta Emergency Plumbing/i)
    await expect(firstShortlist).toContainText(/No AE inquiry form is published yet/i)

    await submitThreadFollowUp(page, NON_INQUIRY_PROVIDER_QUERY)
    await expectQueryInTranscript(page, NON_INQUIRY_PROVIDER_QUERY)
    await waitForLatestReadyAnswer(page)

    await expect(page.getByLabel(/turn context/i).last()).toContainText(
      /Preparing the qualified inquiry next step for Parramatta Emergency Plumbing/i,
    )
    await expect(page.getByText(/Parramatta Emergency Plumbing does not publish an AE inquiry form yet/i).last()).toBeVisible()

    const inquiryPath = page.getByRole('region', { name: /inquiry path/i })
    await expect(inquiryPath).toContainText(/Parramatta Emergency Plumbing selected for listing review/i)
    await expect(inquiryPath).toContainText(
      /This business needs a published inquiry path before AE can route contact/i,
    )
    await expect(inquiryPath).toContainText(/Needs listed inquiry path/i)

    const checks = page.getByRole('button', { name: /how ae checked this/i }).last()
    await expect(checks).toContainText(/0 searches.*1 read.*1 listed/i)
    const steps = page.getByRole('list', { name: /ae check steps/i }).last()
    await expect(steps).toContainText(/Resolving provider/i)
    await expect(steps).toContainText(/Selected business.*Parramatta Emergency Plumbing/i)
    await expect(steps).toContainText(/Inquiry path.*Not published/i)

    const selectedBusiness = page.getByRole('region', { name: /selected business/i })
    await expect(selectedBusiness).toContainText(/Parramatta Emergency Plumbing/i, { timeout: 30_000 })
    await expect(selectedBusiness).toContainText(/Review listing first/i)
    await expect(selectedBusiness).toContainText(/This business does not publish an AE inquiry form yet/i)
    await expect(selectedBusiness).toContainText(/Review the listing and use its published contact guidance/i)
    await expect(selectedBusiness.getByRole('link', { name: /open inquiry form/i })).toHaveCount(0)

    const reviewLink = selectedBusiness.getByRole('link', { name: /review listing/i })
    await expect(reviewLink).toHaveAttribute('href', /\/parramatta-emergency-plumbing\?from=thread&id=.+/)
    await reviewLink.click()

    await expect(page).toHaveURL(/\/parramatta-emergency-plumbing\?from=thread&id=.+/, { timeout: 15_000 })
    await expect(page.getByText(/This service has not published a human inquiry path yet/i)).toBeVisible()
    await assertPublicLanguage(page)
  })

  test('keeps a boundary follow-up recoverable into a qualified inquiry handoff', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')
    await expect(page.getByRole('search', { name: /find local service businesses/i })).toBeVisible()

    await submitLandingQuery(page, INQUIRY_READY_QUERY)
    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    await expectQueryInTranscript(page, INQUIRY_READY_QUERY)
    await waitForLatestReadyAnswer(page)

    await expect(page.getByRole('region', { name: /business shortlist/i }).last()).toContainText(/Demo Plumbing/i)

    await submitThreadFollowUp(page, BOUNDARY_FOLLOW_UP_QUERY)
    await expectQueryInTranscript(page, BOUNDARY_FOLLOW_UP_QUERY)
    await waitForLatestReadyAnswer(page)

    await expect(page.getByLabel(/turn context/i).last()).toContainText(
      /Checking this request against AE's inquiry-only limits/i,
    )
    await expect(page.getByText(/Agentic Economy reads and compares published listings/i).last()).toBeVisible()
    await expect(page.getByText(/It does not book, charge, or dispatch/i).last()).toBeVisible()
    await expect(page.getByText(/Agentic Economy does not book or take payment on this page/i).last()).toBeVisible()

    const checks = page.getByRole('button', { name: /how ae checked this/i }).last()
    await expect(checks).toContainText(/0 searches.*1 read.*1 listed/i)
    const steps = page.getByRole('list', { name: /ae check steps/i }).last()
    await expect(steps).toContainText(/Preparing the next step/i)
    await expect(steps).toContainText(/Listed businesses carried forward/i)

    const continuePanel = page.getByRole('region', { name: /continue this thread/i })
    await expect(continuePanel).toContainText(
      /Narrow, compare, or start a qualified inquiry from the businesses already found in this thread/i,
    )
    const startInquiryButton = page.getByRole('button', { name: /start qualified inquiry with demo plumbing/i })
    await expect(startInquiryButton).toBeEnabled()
    await startInquiryButton.click()

    await expectQueryInTranscript(page, INQUIRY_HANDOFF_QUERY)
    await waitForLatestReadyAnswer(page)

    const selectedBusiness = page.getByRole('region', { name: /selected business/i })
    await expect(selectedBusiness).toContainText(/Demo Plumbing/i, { timeout: 30_000 })
    await expect(selectedBusiness).toContainText(/The business still confirms timing, quote, and availability/i)
    await expect(selectedBusiness.getByRole('link', { name: /open inquiry form/i })).toHaveAttribute(
      'href',
      /\/plumbing-demo\/inquiry\?from=thread&id=.+/,
    )
    await assertPublicLanguage(page)
  })
})

async function submitLandingQuery(page: Page, query: string) {
  const search = page.getByRole('search', { name: /find local service businesses/i })
  const searchbox = search.getByRole('searchbox', { name: /what do you need done/i })
  const sendButton = search.getByRole('button', { name: /^send$/i })
  await expect(searchbox).toBeEditable({ timeout: 30_000 })

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await searchbox.click()
    await searchbox.fill(query)
    await page.waitForTimeout(100)
    if ((await searchbox.inputValue()) === query && (await sendButton.isEnabled())) {
      break
    }
  }

  await expect(searchbox).toHaveValue(query)
  await expect(sendButton).toBeEnabled()
  await sendButton.click()
}

async function expectQueryInTranscript(page: Page, query: string, displayLabel: string | RegExp = query) {
  const headers = page.getByRole('log', { name: /chat transcript/i }).locator('header')
  const queryLabel = typeof displayLabel === 'string'
    ? headers.getByText(displayLabel, { exact: true }).first()
    : headers.getByText(displayLabel).first()
  await expect(queryLabel).toBeVisible({ timeout: 15_000 })
}

async function submitThreadFollowUp(page: Page, query: string) {
  const search = page.getByRole('search', { name: /find local service businesses/i }).last()
  const searchbox = search.getByRole('searchbox')
  const sendButton = search.getByRole('button', { name: /^send$/i })
  await expect(searchbox).toBeEditable({ timeout: 30_000 })

  await searchbox.click()
  await searchbox.fill(query)
  await expect(searchbox).toHaveValue(query)
  await expect(sendButton).toBeEnabled()
  await sendButton.click()
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
