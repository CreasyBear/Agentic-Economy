import { expect, test, type Page } from '@playwright/test'
import { LOCAL_E2E_BUSINESS_FIXTURES } from '../helpers/local-e2e-business-fixtures'

const demoBusiness = LOCAL_E2E_BUSINESS_FIXTURES.find((fixture) => fixture.requestedSlug === 'plumbing-demo')
if (demoBusiness === undefined) {
  throw new Error('The plumbing-demo local E2E fixture is required.')
}

const admittedBusiness = LOCAL_E2E_BUSINESS_FIXTURES.find((fixture) => fixture.inquiryAdmission === 'admitted')
if (admittedBusiness === undefined) {
  throw new Error('An admitted local E2E business fixture is required.')
}

const QUERY = 'emergency plumber parramatta'
const ADMITTED_QUERY = 'emergency plumber joondalup'
const INQUIRY_READY_QUERY = 'diagnostic plumbing parramatta'
const MULTI_PROVIDER_QUERY = 'plumbing parramatta'
const INQUIRY_HANDOFF_QUERY = `Message ${admittedBusiness.businessName}`
const BOUNDARY_FOLLOW_UP_QUERY = 'Can you book this for me?'
const NON_INQUIRY_PROVIDER_QUERY = 'Message Parramatta Emergency Plumbing'
const FILTER_FOLLOW_UP_QUERY = 'Show only businesses accepting requests'
const FILTER_FOLLOW_UP_LABEL = /Businesses accepting requests/
const COMPARE_FOLLOW_UP_QUERY = 'Compare the top two'
const COMPARE_FOLLOW_UP_LABEL = /Compare the top two matches/
const futureSurfaceCopy =
  /book now|booking confirmed|pay now|payment required|protected action|marketplace|request market|AI reply|autonomous|agent handled|guaranteed response|wallet|checkout|custody|settlement|x402|MCP|OpenAPI|callable|agent-native/i
const publicInternalCopy = /\b(?:product|internal|runtime|ownerId|businessId|offeringRef|sourceHash|rawContact|clerk|admin)\b/i

test.describe('chat discovery to inquiry loop', () => {
  test.describe.configure({ mode: 'serial' })

  test('keeps the discovery loop boundary-honest when inquiry is not published', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('search', { name: /ask a question or describe what you need done/i })).toBeVisible()

    await submitLandingQuery(page, QUERY)
    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    const threadPath = new URL(page.url()).pathname
    await expectQueryInTranscript(page, QUERY)
    await waitForLatestReadyAnswer(page, QUERY)

    await expect(page.getByRole('region', { name: /next steps/i })).toContainText(/2 matches ready to compare/i)
    await expect(page.getByRole('region', { name: /session context/i })).toContainText(/matches/i)
    await expect(page.getByRole('region', { name: /business shortlist/i })).toContainText(/matches/i)
    await expect(page.getByRole('region', { name: /business shortlist/i })).toContainText(demoBusiness.businessName)
    const terminal = page.getByRole('region', { name: /your options are ready/i })
    await expect(terminal.getByRole('button', { name: /change criteria/i })).toBeVisible()
    await expect(terminal.getByRole('link', { name: /^open$/i })).toBeVisible()
    await expect(terminal.getByRole('button', { name: /^copy$/i })).toBeVisible()
    await expect(terminal.getByRole('button', { name: /^call$/i })).toBeDisabled()
    await expect(terminal.getByRole('button', { name: /^close$/i })).toBeVisible()

    const reviewLink = page
      .getByRole('region', { name: /business shortlist/i })
      .getByRole('link', { name: 'Parramatta Emergency Plumbing' })
    await expect(reviewLink).toHaveAttribute(
      'href',
      new RegExp(`/parramatta-emergency-plumbing\\?from=thread&id=${threadPath.split('/').at(-1)}`),
    )
    await reviewLink.click()

    await expect(page).toHaveURL(/\/parramatta-emergency-plumbing\?from=thread&id=.+/, { timeout: 15_000 })
    await expect(page.getByText(/This business hasn’t joined AE yet/i).first()).toBeVisible()
    await expect(page.getByText(/the business handles timing, price, and availability/i)).toBeVisible()
    await assertPublicLanguage(page)
  })

  test('carries a request-ready match into the request form', async ({ page }) => {
    test.setTimeout(45_000)
    await page.goto('/')
    await expect(page.getByRole('search', { name: /ask a question or describe what you need done/i })).toBeVisible()

    await submitLandingQuery(page, ADMITTED_QUERY)
    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    const threadPath = new URL(page.url()).pathname
    await expectQueryInTranscript(page, ADMITTED_QUERY)
    await waitForLatestReadyAnswer(page, ADMITTED_QUERY)

    await expect(page.getByRole('region', { name: /next steps/i })).toContainText(/1 match ready to compare/i)
    const shortlist = page.getByRole('region', { name: /business shortlist/i })
    await expect(shortlist).toContainText(admittedBusiness.businessName)
    const listingLink = shortlist.getByRole('link', { name: admittedBusiness.businessName })
    await expect(listingLink).toHaveAttribute(
      'href',
      new RegExp(`/${admittedBusiness.requestedSlug}\\?from=thread&id=${threadPath.split('/').at(-1)}`),
    )
    await listingLink.click()

    await expect(page).toHaveURL(
      new RegExp(`/${admittedBusiness.requestedSlug}\\?from=thread&id=.+`),
      { timeout: 15_000 },
    )
    const inquiryLink = page.getByRole('link', { name: 'Ask this business' }).first()
    await expect(inquiryLink).toHaveAttribute(
      'href',
      new RegExp(`/${admittedBusiness.requestedSlug}/inquiry\\?from=thread&id=.+`),
    )
    await inquiryLink.click()

    await expect(page).toHaveURL(
      new RegExp(`/${admittedBusiness.requestedSlug}/inquiry\\?from=thread&id=.+`),
      { timeout: 15_000 },
    )
    await expect(page.getByRole('note', { name: /answer context/i })).toContainText(
      `This inquiry continues ${admittedBusiness.businessName} from your answer thread`,
    )
    await expect(
      page.getByRole('note', { name: /answer context/i }).getByRole('link', { name: /back to answer/i }),
    ).toHaveAttribute('href', threadPath)
    await assertPublicLanguage(page)
  })

  test('keeps a compare follow-up grounded in the businesses already found', async ({ page }) => {
    test.setTimeout(45_000)
    await page.goto('/')
    await expect(page.getByRole('search', { name: /ask a question or describe what you need done/i })).toBeVisible()

    await submitLandingQuery(page, MULTI_PROVIDER_QUERY)
    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    await expectQueryInTranscript(page, MULTI_PROVIDER_QUERY)
    await waitForLatestReadyAnswer(page, MULTI_PROVIDER_QUERY)

    const shortlist = page.getByRole('region', { name: /business shortlist/i })
    await expect(shortlist).toContainText(/Demo Plumbing/i)
    await expect(shortlist).toContainText(/Parramatta Emergency Plumbing/i)

    await submitThreadFollowUp(page, COMPARE_FOLLOW_UP_QUERY)

    await expectQueryInTranscript(page, COMPARE_FOLLOW_UP_QUERY, COMPARE_FOLLOW_UP_LABEL)
    await waitForLatestReadyAnswer(page, COMPARE_FOLLOW_UP_LABEL)
    await expect(page.getByLabel(/turn context/i).last()).toContainText(
      /Comparing 2 matches from this thread/i,
    )

    const checks = page.getByRole('button', { name: /how this was checked/i }).last()
    await expect(checks).toContainText(/compared 2 matches; checked 5 facts/i)
    await checks.click()
    const checkSteps = page.getByRole('list', { name: /answer work steps/i }).last()
    await expect(checkSteps).toContainText(/Reading the details already found/i)
    await expect(checkSteps).toContainText(/Comparing the matches already in the answer thread/i)

    const comparison = page.getByRole('region', { name: /business comparison/i })
    await expect(comparison).toContainText(/Published details, side by side/i)
    await expect(comparison).toContainText(/Demo Plumbing/i)
    await expect(comparison).toContainText(/Parramatta Emergency Plumbing/i)
    await expect(comparison).toContainText(/Next step/i)
    const comparisonTerminal = page.getByRole('region', { name: /your options are ready/i }).last()
    await expect(comparisonTerminal.getByRole('button', { name: /change criteria/i })).toBeVisible()
    await expect(comparisonTerminal.getByRole('link', { name: /^open$/i })).toBeVisible()
    await assertPublicLanguage(page)
  })

  test('keeps a request-ready filter as context for the request handoff', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')
    await expect(page.getByRole('search', { name: /ask a question or describe what you need done/i })).toBeVisible()

    await submitLandingQuery(page, ADMITTED_QUERY)
    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    await expectQueryInTranscript(page, ADMITTED_QUERY)
    await waitForLatestReadyAnswer(page, ADMITTED_QUERY)

    const firstShortlist = page.getByRole('region', { name: /business shortlist/i }).last()
    await expect(firstShortlist).toContainText(admittedBusiness.businessName)

    await submitThreadFollowUp(page, FILTER_FOLLOW_UP_QUERY)

    await expectQueryInTranscript(page, FILTER_FOLLOW_UP_QUERY, FILTER_FOLLOW_UP_LABEL)
    await waitForLatestReadyAnswer(page, FILTER_FOLLOW_UP_LABEL)
    await expect(page.getByLabel(/turn context/i).last()).toContainText(
      /Narrowing 1 match from this thread/i,
    )

    const checks = page.getByRole('button', { name: /how this was checked/i }).last()
    await expect(checks).toContainText(/compared 1 match; checked 5 facts/i)

    const filteredShortlist = page.getByRole('region', { name: /business shortlist/i }).last()
    await expect(filteredShortlist).toContainText(/1 match/i)
    await expect(filteredShortlist).toContainText(admittedBusiness.businessName)
    const sessionContext = page.getByRole('region', { name: /session context/i })
    await expect(sessionContext).toContainText(new RegExp(`Current answer.*${admittedBusiness.businessName}`, 'i'), {
      timeout: 30_000,
    })

    await submitThreadFollowUp(page, INQUIRY_HANDOFF_QUERY)
    await expectQueryInTranscript(page, INQUIRY_HANDOFF_QUERY)
    await waitForLatestReadyAnswer(page, INQUIRY_HANDOFF_QUERY)

    const selectedBusiness = page.getByRole('region', { name: /selected business/i })
    await expect(selectedBusiness).toContainText(admittedBusiness.businessName, { timeout: 30_000 })
    await expect(selectedBusiness).toContainText(/The business still confirms timing, quote, and availability/i)

    const inquiryLink = selectedBusiness.getByRole('link', { name: /open request form/i })
    await expect(inquiryLink).toHaveAttribute(
      'href',
      new RegExp(`/${admittedBusiness.requestedSlug}/inquiry\\?from=thread&id=.+`),
    )
    await assertPublicLanguage(page)
  })

  test('keeps a named provider without an inquiry form out of the inquiry handoff', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')
    await expect(page.getByRole('search', { name: /ask a question or describe what you need done/i })).toBeVisible()

    await submitLandingQuery(page, MULTI_PROVIDER_QUERY)
    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    await expectQueryInTranscript(page, MULTI_PROVIDER_QUERY)
    await waitForLatestReadyAnswer(page, MULTI_PROVIDER_QUERY)

    const firstShortlist = page.getByRole('region', { name: /business shortlist/i }).last()
    await expect(firstShortlist).toContainText(/Demo Plumbing/i)
    await expect(firstShortlist).toContainText(/Parramatta Emergency Plumbing/i)

    await submitThreadFollowUp(page, NON_INQUIRY_PROVIDER_QUERY)
    await expectQueryInTranscript(page, NON_INQUIRY_PROVIDER_QUERY)
    await waitForLatestReadyAnswer(page, NON_INQUIRY_PROVIDER_QUERY)

    await expect(page.getByLabel(/turn context/i).last()).toContainText(
      /Preparing a request to Parramatta Emergency Plumbing/i,
    )
    await expect(page.getByText(/Parramatta Emergency Plumbing does not have a request form yet/i).last()).toBeVisible()

    const inquiryPath = page.getByRole('region', { name: /next steps/i })
    await expect(inquiryPath).toContainText(/Parramatta Emergency Plumbing selected for review/i)
    await expect(inquiryPath).toContainText(
      /This business does not have a request form yet/i,
    )
    await expect(inquiryPath).toContainText(/No request form yet/i)

    const selectedBusiness = page.getByRole('region', { name: /selected business/i })
    await expect(selectedBusiness).toContainText(/Parramatta Emergency Plumbing/i, { timeout: 30_000 })
    await expect(selectedBusiness).toContainText(/Review this business first/i)
    await expect(selectedBusiness).toContainText(/This business does not have a request form yet/i)
    await expect(selectedBusiness).toContainText(/Review the business page and use the contact details it provides/i)
    await expect(selectedBusiness.getByRole('link', { name: /open request form/i })).toHaveCount(0)

    const reviewLink = selectedBusiness.getByRole('link', { name: /review business/i })
    await expect(reviewLink).toHaveAttribute('href', /\/parramatta-emergency-plumbing\?from=thread&id=.+/)
    await reviewLink.click()

    await expect(page).toHaveURL(/\/parramatta-emergency-plumbing\?from=thread&id=.+/, { timeout: 15_000 })
    await expect(page.getByText('Owner has not supplied public contact instructions.', { exact: true })).toBeVisible()
    await expect(page.getByText('No request path published yet.', { exact: true })).toBeVisible()
    await assertPublicLanguage(page)
  })

  test('lets a later provider search replace the selected inquiry journey state', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')
    await expect(page.getByRole('search', { name: /ask a question or describe what you need done/i })).toBeVisible()

    await submitLandingQuery(page, ADMITTED_QUERY)
    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    await expectQueryInTranscript(page, ADMITTED_QUERY)
    await waitForLatestReadyAnswer(page, ADMITTED_QUERY)

    await expect(page.getByRole('region', { name: /next steps/i })).toContainText(/1 match ready to compare/i)
    await submitThreadFollowUp(page, INQUIRY_HANDOFF_QUERY)
    await expectQueryInTranscript(page, INQUIRY_HANDOFF_QUERY)
    await waitForLatestReadyAnswer(page, INQUIRY_HANDOFF_QUERY)
    await expect(page.getByRole('region', { name: /next steps/i })).toContainText(
      new RegExp(`${admittedBusiness.businessName} selected for contact`, 'i'),
    )
    await expect(page.getByRole('region', { name: /session context/i })).toContainText(/Selected business/i)

    await submitThreadFollowUp(page, MULTI_PROVIDER_QUERY)
    await expectQueryInTranscript(page, MULTI_PROVIDER_QUERY)
    await waitForLatestReadyAnswer(page, MULTI_PROVIDER_QUERY)

    const inquiryPath = page.getByRole('region', { name: /next steps/i })
    await expect(inquiryPath).toContainText(/3 matches ready to compare/i)
    await expect(inquiryPath).not.toContainText(/Demo Plumbing selected for contact/i)

    const sessionContext = page.getByRole('region', { name: /session context/i })
    await expect(sessionContext).toContainText(/Current answer/i)
    await expect(sessionContext).toContainText(/2 matches in this answer/i)
    await expect(sessionContext).toContainText(admittedBusiness.businessName)
    await expect(sessionContext).not.toContainText(/Selected business/i)
    const replacementTerminal = page.getByRole('region', { name: /your options are ready/i }).last()
    await expect(replacementTerminal.getByRole('button', { name: /change criteria/i })).toBeVisible()
    await expect(replacementTerminal.getByRole('link', { name: /^open$/i })).toBeVisible()

    const shortlist = page.getByRole('region', { name: /business shortlist/i }).last()
    await expect(shortlist).toContainText(/Demo Plumbing/i)
    await expect(shortlist).toContainText(/Parramatta Emergency Plumbing/i)
    await assertPublicLanguage(page)
  })

  test('keeps a boundary follow-up recoverable into a request to the business', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')
    await expect(page.getByRole('search', { name: /ask a question or describe what you need done/i })).toBeVisible()

    await submitLandingQuery(page, ADMITTED_QUERY)
    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    await expectQueryInTranscript(page, ADMITTED_QUERY)
    await waitForLatestReadyAnswer(page, ADMITTED_QUERY)

    await expect(page.getByRole('region', { name: /business shortlist/i }).last()).toContainText(admittedBusiness.businessName)

    await submitThreadFollowUp(page, BOUNDARY_FOLLOW_UP_QUERY)
    await expectQueryInTranscript(page, BOUNDARY_FOLLOW_UP_QUERY)
    await waitForLatestReadyAnswer(page, BOUNDARY_FOLLOW_UP_QUERY)

    await expect(page.getByLabel(/turn context/i).last()).toContainText(
      /Checking the supported next step/i,
    )
    await expect(page.getByText(/The assistant compares published details, but it cannot book or start the job/i).last()).toBeVisible()
    await expect(page.getByText(/Timing, price, and availability still need confirmation from the business/i).last()).toBeVisible()


    await submitThreadFollowUp(page, INQUIRY_HANDOFF_QUERY)

    await expectQueryInTranscript(page, INQUIRY_HANDOFF_QUERY)
    await waitForLatestReadyAnswer(page, INQUIRY_HANDOFF_QUERY)

    const selectedBusiness = page.getByRole('region', { name: /selected business/i })
    await expect(selectedBusiness).toContainText(admittedBusiness.businessName, { timeout: 30_000 })
    await expect(selectedBusiness).toContainText(/The business still confirms timing, quote, and availability/i)
    await expect(selectedBusiness.getByRole('link', { name: /open request form/i })).toHaveAttribute(
      'href',
      new RegExp(`/${admittedBusiness.requestedSlug}/inquiry\\?from=thread&id=.+`),
    )
    await assertPublicLanguage(page)
  })
})

async function submitLandingQuery(page: Page, query: string) {
  await expect(async () => {
    const search = page.getByRole('search', { name: /ask a question or describe what you need done/i })
    const searchbox = search.getByRole('searchbox', { name: /what do you need/i })
    const sendButton = search.getByRole('button', { name: /^ask$/i })
    await expect(searchbox).toBeEditable({ timeout: 10_000 })
    await searchbox.fill(query)
    await expect(searchbox).toHaveValue(query)
    await expect(sendButton).toBeEnabled()
    await sendButton.click()
    await page.waitForURL(/\/t\//, { timeout: 30_000, waitUntil: 'domcontentloaded' })
  }).toPass({ timeout: 45_000 })
}

async function expectQueryInTranscript(page: Page, query: string, displayLabel: string | RegExp = query) {
  const headers = page.getByRole('log', { name: /chat transcript/i }).locator('header')
  const queryLabel = typeof displayLabel === 'string'
    ? headers.getByText(displayLabel, { exact: true }).first()
    : headers.getByText(displayLabel).first()
  await expect(queryLabel).toBeVisible({ timeout: 15_000 })
}

async function submitThreadFollowUp(page: Page, query: string) {
  const changeCriteriaButton = page.getByRole('button', { name: /change criteria/i }).last()
  if (await changeCriteriaButton.count() > 0) {
    await expect(changeCriteriaButton).toBeVisible()
    await changeCriteriaButton.click()
  }

  const search = page.getByRole('search', { name: /ask a question or describe what you need done/i }).last()
  const searchbox = search.getByRole('searchbox')
  await expect(searchbox).toBeEditable({ timeout: 15_000 })
  await searchbox.fill(query)
  await expect(searchbox).toHaveValue(query)
  await searchbox.press('Enter')
}

async function waitForLatestReadyAnswer(page: Page, displayLabel: string | RegExp) {
  const headers = page.getByRole('log', { name: /chat transcript/i }).locator('header')
  const header = typeof displayLabel === 'string'
    ? headers.filter({ hasText: displayLabel }).last()
    : headers.filter({ hasText: displayLabel }).last()
  await expect(header).toBeVisible({ timeout: 15_000 })
  await expect(header.locator('xpath=following-sibling::*').getByText(/Answer ready\./i)).toBeVisible({
    timeout: 30_000,
  })
}

async function assertPublicLanguage(page: Page) {
  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toMatch(futureSurfaceCopy)
  expect(bodyText).not.toMatch(publicInternalCopy)
}
