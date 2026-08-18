import { mkdirSync } from 'node:fs'

import slugify from '@sindresorhus/slugify'

import { expect, test, type Page } from '@playwright/test'
import { LOCAL_E2E_BUSINESS_FIXTURES, type LocalE2eBusinessFixture } from '../helpers/local-e2e-business-fixtures'
import { CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES } from '../../src/modules/discovery/public'
import { HOME } from '../../src/content/brand-copy'

const demoBusiness = LOCAL_E2E_BUSINESS_FIXTURES.find((fixture) => fixture.requestedSlug === 'plumbing-demo')
if (demoBusiness === undefined) {
  throw new Error('The plumbing-demo local E2E fixture is required.')
}

const admittedBusiness = LOCAL_E2E_BUSINESS_FIXTURES.find((fixture) => fixture.inquiryAdmission === 'admitted')
if (admittedBusiness === undefined) {
  throw new Error('An admitted local E2E business fixture is required.')
}

function requireFirstOffering(fixture: LocalE2eBusinessFixture): LocalE2eBusinessFixture['offerings'][number] {
  const offering = fixture.offerings[0]
  if (offering === undefined) {
    throw new Error(`The ${fixture.requestedSlug} local E2E fixture requires an Offering.`)
  }
  return offering
}

const demoOffering = requireFirstOffering(demoBusiness)

const phase2ArtifactDir = 'output/playwright/phase2-ui'
const futureSurfaceCopy =
  /book now|booking confirmed|pay now|payment required|protected action|marketplace|request market|AI reply|autonomous|agent handled|guaranteed response|wallet|checkout|custody|settlement|x402|MCP|OpenAPI|callable|hosted-agent/i
const publicInternalCopy = /\b(?:product|internal|runtime|ownerId|businessId|offeringRef|sourceHash|rawContact|clerk|admin)\b/i
const operatorPrivateLeakage =
  /customer@example\.test|Water is leaking under the kitchen sink|saved owner contact path|rawBody|raw provider|provider payload|webhook secret/i

test.describe('public owner routes', () => {
  test('home exposes the public landing story and claim path', async ({ page }, testInfo) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: HOME.heroHeading })).toBeVisible()
    await expect(page.getByLabel('What do you need done?')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ask' })).toBeVisible()
    await page.getByLabel('What do you need done?').fill('Emergency plumbing in Parramatta')
    await page.getByRole('button', { name: 'Ask' }).click()
    await expect(page).toHaveURL(/\/t\//u)
    await expect(page.getByRole('heading', { name: /options|plan/i })).toBeVisible()
    await page.goto('/')

    if (testInfo.project.name.includes('compact')) {
      const menuButton = page.getByRole('button', { name: 'Open public menu' })
      const compactClaimLink = page.getByRole('link', { name: 'List your business' })
      await expect(async () => {
        if (!(await compactClaimLink.isVisible())) await menuButton.click()
        await expect(compactClaimLink).toBeVisible()
      }).toPass({ timeout: 15_000 })
    }
    await expect(async () => {
      const claimLink = page.getByRole('link', { name: 'List your business' })
      await expect(claimLink).toBeVisible()
      await claimLink.click()
      await expect(page).toHaveURL('/claim')
    }).toPass({ timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'Get your business found — and quoted — by AI assistants and the people they work for.' })).toBeVisible()
    await expect(page.getByText('Sign in first — then you’ll add your services and prices and publish your page.')).toBeVisible()
    await expect(page.getByText('You review every public detail before anything appears.')).toBeVisible()
    await expect(page.getByText('You confirm availability, price, and every request before work begins.')).toBeVisible()
    const preparation = page.locator('section[aria-labelledby="claim-before-you-start"]')
    await expect(preparation.getByText('Your business facts:', { exact: false })).toBeVisible()
    await expect(preparation.getByText('The services you offer:', { exact: false })).toBeVisible()
    await expect(preparation.getByText('Your prices:', { exact: false })).toBeVisible()
    await expect(await preparation.evaluate((node) => {
      const input = document.querySelector('input[name="claim-business-name"]')
      return input !== null && Boolean(node.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING)
    })).toBe(true)
    await expect(page.getByRole('link', { name: 'Sign in to start' })).toHaveCSS('min-height', '44px')
    await expect(page.getByRole('button', { name: 'Find my business' })).toHaveCSS('min-height', '44px')
    await expect(page.getByRole('button', { name: 'Build my page from the web' })).toHaveCSS('min-height', '44px')
    await expect(page.getByRole('link', { name: /start fresh/i })).toHaveCSS('min-height', '44px')
    await expect(page.getByLabel('Search your business name').locator('..')).toHaveCSS('min-height', '44px')
    await expect(page.getByRole('link', { name: 'Sign in to start' })).toHaveAttribute('href', '/claim/form')
    await assertPublicLanguage(page)
  })

  test('human and agent entries keep their own projections and current boundary', async ({ page }) => {
    await page.goto('/')
    const assistantIndex = await page.request.get('/llms.txt')

    expect(assistantIndex.ok()).toBe(true)
    const assistantText = await assistantIndex.text()
    for (const statement of CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES) {
      expect(assistantText).toContain(statement)
    }
    await expect(page.getByRole('heading', { name: HOME.heroHeading })).toBeVisible()
    const humanText = await page.locator('body').innerText()
    for (const statement of CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES) {
      expect(humanText).not.toContain(statement)
    }

    await expect(page.getByRole('button', { name: 'Ask' })).toBeVisible()
    expect(assistantText).toContain('Human entry=')
    expect(assistantText).toContain('/api/v1/requests')
    expect(assistantText).toContain('auth=Authorization: Bearer <Clerk API key>; scopes=customer_requests:create plus exactly one mode:')
    expect(assistantText).toContain('You decide whether to confirm an option. Starting it is a separate decision.')
  })

  test('home search lists Sam and renders truthful no-results and pagination states', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /who does what, near you/i })).toBeVisible()
    await expect(page.getByLabel('Business, service, or place')).toBeVisible()
    await expect(page.getByLabel('Parramatta Emergency Plumbing').getByText('Parramatta Emergency Plumbing', { exact: true })).toBeVisible()
    const plumbingCard = page.getByLabel('Parramatta Emergency Plumbing')
    await expect(plumbingCard.getByText('No reply history yet', { exact: true })).toBeVisible()
    await expect(plumbingCard.getByText('Phone not published here', { exact: true })).toBeVisible()
    await expect(page.getByText(/Compare local businesses by service/i)).toBeVisible()
    await expect(page.getByText('Published businesses', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /list your business, free/i })).toBeVisible()
    await expect(page.getByRole('navigation', { name: /business results pagination/i })).toBeVisible()
    await expect(page.getByText('First page')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()

    await page.getByLabel('Business, service, or place').fill('emergency plumber parramatta')
    await page.getByRole('button', { name: /^search businesses$/i }).click()
    await expect(page).toHaveURL(/q=emergency\+plumber\+parramatta/)
    await expect(page.getByRole('link', { name: /view parramatta emergency plumbing/i })).toHaveAttribute('href', '/parramatta-emergency-plumbing')

    await page.getByLabel('Business, service, or place').fill('fremantle locksmith')
    await page.getByRole('button', { name: /^search businesses$/i }).click()
    await expect(page.getByText('No businesses here yet.')).toBeVisible()
    await expect(page.getByRole('link', { name: /own a business.*list it free/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /clear search/i })).toBeVisible()

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/ownerId|offeringRef|businessId|clerk|sourceHash|rawContact|admin/i)
    await assertPublicLanguage(page)
  })

  test('claim form preserves input and focuses the first validation error', async ({ page }) => {
    await page.goto('/claim/form', { waitUntil: 'networkidle' })
    await assertPublicLanguage(page)
    await expect(page.getByText('a written contact path appears only when it is ready.')).toBeVisible()

    await page.getByLabel('Business name').fill('Northside Solar')
    await page.getByLabel('Business category').fill('Solar repairs')
    await page.getByLabel('Suburb').fill('Leederville')
    await page.getByLabel('State or territory').fill('WA')
    await page.getByLabel('Public page slug').fill('northside-solar')
    await page.getByLabel('Detail note').fill('Owner supplied')
    await page.getByLabel('Service name').fill('Solar inverter repair')
    await page.getByLabel(/I confirm these public details/i).check()
    const publishButton = page.getByRole('button', { name: /publish service page/i })
    await expect(publishButton).toBeEnabled()
    await expect(async () => {
      await publishButton.click()
      await expect(page.getByLabel('Business name')).toHaveValue('Northside Solar')
      await expect(page.getByText('Service category is required.')).toBeVisible()
      await expect(page.getByLabel('Service category')).toBeFocused()
    }).toPass({ timeout: 15_000 })
  })

  test('agent access shows the assistant controls and revocation boundary', async ({ page }) => {
    await page.goto('/agent-access', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Assistant access', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Check your balance' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Review recent activity' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Manage assistant access' })).toBeVisible()
    const body = await page.locator('body').innerText()
    expect(body).not.toMatch(/clerk_api_key:|ownerId|businessId|offeringRef|sourceHash|rawContact/i)
  })

  test('claim form remains usable when first request state changes', async ({ page }) => {
    await page.goto('/claim', { waitUntil: 'networkidle' })
    await assertPublicLanguage(page)

    await page.getByRole('radio', { name: /quote request instructions supplied/i }).click()

    await expect(page.getByRole('radio', { name: /quote request instructions supplied/i })).toBeChecked()
    await page.getByLabel(/I confirm these public details/i).check()
    await expect(page.getByRole('button', { name: /publish service page/i })).toBeEnabled()
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0)
  })

  test('claim submission readbacks use the submitted catalog instead of the default Sam record', async ({ page }, testInfo) => {
    const runId = `${Date.now().toString(36)}-${testInfo.workerIndex}`
    const suffix = slugify(`${testInfo.project.name}-${runId}`)
    const slug = `fremantle-priority-electrical-${suffix}`
    const businessName = `Fremantle Priority Electrical ${suffix}`

    await page.goto('/claim', { waitUntil: 'networkidle' })
    await assertPublicLanguage(page)

    await page.getByLabel('Business name').fill(businessName)
    await page.getByLabel('Business category').fill('Emergency electrical')
    await page.getByLabel('Suburb').fill('Fremantle')
    await page.getByLabel('State or territory').fill('WA')
    await page.getByLabel('Public page slug').fill(slug)
    await page.getByLabel('Detail note').fill('Owner supplied electrical service facts')
    await page.getByLabel('Service name').fill('After-hours switchboard repair')
    await page.getByLabel('Service category').fill('Emergency electrical')
    await page.getByLabel('Service summary').fill('Urgent switchboard fault triage for Fremantle homes and shops.')
    await page.getByLabel('Service area').fill('Fremantle, South Fremantle, and Beaconsfield')
    await page.getByLabel('Hours (or say if not sure)').fill('After-hours availability supplied by owner')
    await page.getByLabel('Unavailable reason').fill('Owner has not supplied a public contact path yet.')
    await page.getByLabel('Owner message').fill('Owner supplied switchboard repair facts for the public service page.')
    await page.getByLabel('Public page slug').fill(slug)
    await page.getByLabel(/I confirm these public details/i).check()
    await expect(page.getByLabel('Business name')).toHaveValue(businessName)
    await expect(page.getByLabel('Business category')).toHaveValue('Emergency electrical')
    await expect(page.getByLabel('Public page slug')).toHaveValue(slug)

    const publishButton = page.getByRole('button', { name: /publish service page/i })
    await expect(publishButton).toBeEnabled()
    await publishButton.click()

    await expect(page).toHaveURL(new RegExp(`/claim/success.*slug=${slug}`))
    await expect(page.getByRole('heading', { name: /service page is ready to preview/i })).toBeVisible()
    await expect(page.getByText(businessName)).toBeVisible()
    await expect(page.getByText('Emergency electrical')).toBeVisible()
    await expect(page.getByText('Fremantle, WA')).toBeVisible()
    await expect(page.getByText(`/${slug}`)).toBeVisible()
    await expect(page.getByText('Parramatta Emergency Plumbing')).toHaveCount(0)
    await assertPublicLanguage(page)

    const submittedManageHref = await page.getByRole('link', { name: /manage your page/i }).first().getAttribute('href')
    expect(submittedManageHref).toContain(`/owner/status?slug=${slug}`)
    await page.goto(submittedManageHref ?? '/owner/status', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(new RegExp(`/owner/status.*slug=${slug}`))
    await expect(page.getByText(businessName)).toBeVisible()

    await page.goto(`/${slug}`)
    await expect(page.getByRole('heading', { name: businessName })).toBeVisible()
    await expect(page.getByText('Urgent switchboard fault triage for Fremantle homes and shops.')).toBeVisible()
    await expect(page.getByText('Parramatta Emergency Plumbing')).toHaveCount(0)
    await assertPublicLanguage(page)
  })

  test('claim success and owner readback label fixture data as preview and keep actions unavailable', async ({ page }) => {
    await page.goto('/claim/success')

    await expect(page.getByRole('heading', { name: /service page is ready to preview/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /open preview/i })).toHaveAttribute('href', '/parramatta-emergency-plumbing')
    await expect(page.getByText('Parramatta Emergency Plumbing')).toBeVisible()
    await assertPublicLanguage(page)

    const manageHref = await page.getByRole('link', { name: /manage your page/i }).first().getAttribute('href')
    expect(manageHref).toContain('/owner/status')
    await page.goto(manageHref ?? '/owner/status', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/owner\/status/)
    await expect(page.getByRole('heading', { name: /service page status/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Request admission' })).toBeVisible()
    await expect(
      page.getByText('Preview only. Connect the public source before sharing this page.', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Add a usable owner notification email', { exact: true })).toBeVisible()
    await expect(page.getByText('Finish inquiry setup', { exact: true })).toBeVisible()
  })

  test('public business page exposes citation facts without private authority fields', async ({ page }) => {
    await page.goto('/parramatta-emergency-plumbing')

    await expect(page.getByRole('heading', { name: 'Parramatta Emergency Plumbing' })).toBeVisible()
    await expect(page.getByText('Emergency plumbing', { exact: true })).toBeVisible()
    await expect(page.getByText('Parramatta and nearby suburbs', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /ask another/i })).toBeVisible()
    await expect(page.getByLabel('Published business details').getByText('Service area', { exact: true })).toBeVisible()
    await expect(page.getByText('What happens when you reach out', { exact: true })).toBeVisible()
    await expect(page.getByText('Owner has not supplied public contact instructions.')).toBeVisible()
    await expect(page.getByRole('link', { name: /correct or remove this page/i })).toBeVisible()
    const pageInfo = page.getByText('Page info', { exact: true }).first()
    await expect(pageInfo).toBeVisible()
    await expect(page.getByText('Data for AI assistants')).not.toBeVisible()
    await pageInfo.click()
    await expect(page.getByText('Data for AI assistants')).toBeVisible()

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/ownerId|adminId|clerk|actor|trust tier|public status/i)
    expect(bodyText).not.toMatch(/Public service facts|KNOWN|UNKNOWN|NEXT_STEP/i)
    await assertPublicLanguage(page)
  })

  test('privacy removal request validates and records a receipt', async ({ page }, testInfo) => {
    const runId = `${Date.now().toString(36)}-${testInfo.workerIndex}`
    const suffix = slugify(`${testInfo.project.name}-${runId}`)
    const slug = `privacy-removal-target-${suffix}`

    await page.goto('/claim', { waitUntil: 'networkidle' })
    await assertPublicLanguage(page)
    await page.getByLabel('Business name').fill(`Privacy Removal Target ${suffix}`)
    await page.getByLabel('Business category').fill('Home repairs')
    await page.getByLabel('Suburb').fill('Parramatta')
    await page.getByLabel('State or territory').fill('NSW')
    await page.getByLabel('Public page slug').fill(slug)
    await page.getByLabel('Detail note').fill('Owner supplied correction target')
    await page.getByLabel('Service name').fill('General home repair')
    await page.getByLabel('Service category').fill('Home repairs')
    await page.getByLabel('Service summary').fill('Owner supplied home repair facts for correction testing.')
    await page.getByLabel('Service area').fill('Parramatta')
    await page.getByLabel('Hours (or say if not sure)').fill('Owner supplied hours')
    await page.getByLabel('Unavailable reason').fill('Owner has not supplied a public contact path yet.')
    await page.getByLabel('Owner message').fill('Owner supplied correction target facts for the public service page.')
    await page.getByLabel(/I confirm these public details/i).check()
    await page.getByRole('button', { name: /publish service page/i }).click()
    await expect(page).toHaveURL(new RegExp(`/claim/success.*slug=${slug}`))

    await page.goto('/privacy/remove-business')
    await assertPublicLanguage(page)

    const submitButton = page.getByRole('button', { name: /send request/i })
    await expect(submitButton).toBeEnabled()
    await submitButton.click()
    await expect(page.getByLabel('Your email')).toBeFocused()

    const slugInput = page.getByLabel('Page slug')
    const emailInput = page.getByLabel('Your email')
    const detailInput = page.getByLabel('What should change?')
    await expect(async () => {
      await slugInput.fill(slug)
      await emailInput.fill('owner@example.com')
      await detailInput.fill('The public facts are inaccurate and should be reviewed.')
      await expect(slugInput).toHaveValue(slug)
      await expect(emailInput).toHaveValue('owner@example.com')
      await expect(detailInput).toHaveValue('The public facts are inaccurate and should be reviewed.')
      await submitButton.click()
      await expect(page.getByText('Request recorded', { exact: true }).first()).toBeVisible()
    }).toPass({ timeout: 20_000 })
  })

  test('phase 2 inquiry flow reaches owner actions and operator reconstruction', async ({ page }, testInfo) => {
    mkdirSync(phase2ArtifactDir, { recursive: true })

    await page.goto(`/${demoBusiness.requestedSlug}/inquiry`)
    await expect(page.getByRole('heading', { name: 'Inquiry not open yet' })).toBeVisible()
    await expect(
      page.getByText('This business isn’t receiving inquiries through AE yet.', { exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to service page' })).toHaveAttribute(
      'href',
      `/${demoBusiness.requestedSlug}`,
    )

    await page.goto(`/${admittedBusiness.requestedSlug}/inquiry`)
    await expect(
      page.getByRole('heading', { name: `Tell ${admittedBusiness.businessName} about the job.` }),
    ).toBeVisible()

    const submitButton = page.getByRole('button', { name: /send inquiry/i })
    await expect(submitButton).toBeEnabled()
    await expect(async () => {
      await submitButton.click()
      await expect(page.getByText('Message is required.')).toBeVisible()
      await expect(page.getByLabel('Tell them about the job')).toBeFocused()
    }).toPass({ timeout: 15_000 })

    const contactInput = page.getByLabel('Contact details for the business reply')
    const messageInput = page.getByLabel('Tell them about the job')
    const successMessage = page.getByText(new RegExp(`Message saved for ${admittedBusiness.businessName}`, 'i'))
    await expect(async () => {
      await contactInput.fill('phase2.customer@example.com')
      await messageInput.fill('Please have a human owner review the inquiry path.')
      await expect(contactInput).toHaveValue('phase2.customer@example.com')
      await expect(messageInput).toHaveValue('Please have a human owner review the inquiry path.')
      await submitButton.click()
      await expect(successMessage).toBeVisible()
    }).toPass({ timeout: 20_000 })
    await expect(page.getByText(/Delivery state: delivery awaiting review/i)).toBeVisible()
    await assertNoFutureSurfaceCopy(page)

    await page.goto('/owner/inquiries')
    await expect(page.getByRole('heading', { name: /inquiries/i })).toBeVisible()
    const needsReplyFilter = page.getByRole('button', { name: /Needs reply \(1\)/i })
    await expect(needsReplyFilter).toBeVisible()
    await assertNoFutureSurfaceCopy(page)

    const inboxInquiryLink = page.getByRole('link', {
      name: new RegExp(`${demoOffering.name}.*${demoBusiness.businessName}`, 'i'),
    }).first()
    await expect(inboxInquiryLink).toContainText(demoBusiness.businessName)
    const inboxInquiryHref = await inboxInquiryLink.getAttribute('href')
    expect(inboxInquiryHref).toMatch(/^\/owner\/inquiries\/inquiry_thread%3Ahash%3A[0-9a-f]+$/u)
    await page.goto(inboxInquiryHref ?? '/owner/inquiries')
    await expect(page).toHaveURL(inboxInquiryHref ?? '/owner/inquiries')
    await expect(page.getByRole('heading', { name: demoOffering.name, exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: /delivery status/i })).toBeVisible()

    const markReadButton = page.getByRole('button', { name: /mark read/i })
    await expect(markReadButton).toBeEnabled()
    await markReadButton.click()
    await expect(page.getByText(/Read state recorded/i)).toBeVisible({ timeout: 10_000 })

    const emptyReplyButton = page.getByRole('button', { name: /^reply$/i })
    await expect(emptyReplyButton).toBeEnabled()
    await emptyReplyButton.click()
    await expect(page.getByText('Reply body is required.').first()).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Owner reply' })).toBeFocused()

    await page.getByRole('textbox', { name: 'Owner reply' }).fill('I received this and will follow up through the saved owner path.')
    const replyButton = page.getByRole('button', { name: /^reply$/i })
    await expect(replyButton).toBeEnabled()
    await replyButton.click()
    await expect(page.getByText(/Reply recorded/i)).toBeVisible()

    const closeButton = page.getByRole('button', { name: /close inquiry/i })
    await expect(closeButton).toBeEnabled()
    await closeButton.click()
    await page.getByRole('alertdialog', { name: /close this inquiry/i }).getByRole('button', { name: /close inquiry/i }).click()
    await expect(page.getByText(/Close recorded/i)).toBeVisible()
    await assertNoFutureSurfaceCopy(page)

    await page.goto('/admin/inquiries?dispatchId=notification_dispatch%3Alocal-e2e%3A1')
    await expect(page.getByRole('heading', { name: /inquiry reconstruction/i })).toBeVisible()
    await expect(page.getByText(/Reconstruction available/i)).toBeVisible()
    await expect(page.getByText(/Source summary/i)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Dispatch refs' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Audit refs' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Funnel refs' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Operation refs' })).toBeVisible()
    await expect(page.getByText(/Source hash sha256:/i)).toBeVisible()
    await expect(page.locator('dt').filter({ hasText: /^Correlation$/ })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(operatorPrivateLeakage)

    const screenshotName = testInfo.project.name.includes('wide')
      ? 'operator-reconstruction-wide.png'
      : 'operator-reconstruction-compact.png'
    await page.screenshot({ path: `${phase2ArtifactDir}/${screenshotName}`, fullPage: true })
  })
})

async function assertNoFutureSurfaceCopy(page: Page) {
  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toMatch(futureSurfaceCopy)
}

async function assertPublicLanguage(page: Page) {
  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toMatch(futureSurfaceCopy)
  expect(bodyText).not.toMatch(publicInternalCopy)
  expect(
    bodyText
      .replaceAll('AE sends your request in writing and keeps a record — or call directly.', '')
      .replaceAll('AE sends your request in writing and keeps a record.', ''),
  ).not.toMatch(/[—–]/)
}
