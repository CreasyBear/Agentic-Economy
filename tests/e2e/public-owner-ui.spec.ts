import { mkdirSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

const phase2ThreadPath = '/owner/inquiries/inquiry_thread%3Ahash%3Af3e29153'
const phase2ArtifactDir = 'output/playwright/phase2-ui'
const futureSurfaceCopy =
  /book now|booking confirmed|pay now|payment required|protected action|marketplace|request market|AI reply|autonomous|agent handled|guaranteed response|wallet|checkout|custody|settlement|x402|MCP|OpenAPI|callable|hosted-agent/i
const publicInternalCopy = /\b(?:product|internal|runtime|ownerId|businessId|serviceId|sourceHash|rawContact|clerk|admin)\b/i
const operatorPrivateLeakage =
  /customer@example\.test|Water is leaking under the kitchen sink|saved owner contact path|rawBody|raw provider|provider payload|webhook secret/i

test.describe('public owner routes', () => {
  test('home exposes the public landing story and claim path', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /find a local business/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /plumbing/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /own a business/i }).first()).toBeVisible()
    await expect(page.getByRole('searchbox', { name: /what do you need done/i })).toBeVisible()
    await expect(page.locator('#main-content').getByText(/no phone tag/i)).toBeVisible()
    await assertPublicLanguage(page)
  })

  test('registry search lists Sam and renders truthful no-results and pagination states', async ({ page }) => {
    await page.goto('/registry')

    await expect(page.getByRole('heading', { name: /who does what, near you/i })).toBeVisible()
    await expect(page.getByLabel('Business, service, or place')).toBeVisible()
    await expect(page.getByText('Parramatta Emergency Plumbing')).toBeVisible()
    await expect(page.getByLabel('Parramatta Emergency Plumbing').getByText('Needs confirmation', { exact: true })).toBeVisible()
    await expect(page.getByText(/Compare local businesses by service/i)).toBeVisible()
    await expect(page.getByText('Published businesses', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /list your business, free/i })).toBeVisible()
    await expect(page.getByRole('navigation', { name: /business results pagination/i })).toBeVisible()
    await expect(page.getByText('First page')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()

    await page.getByLabel('Business, service, or place').fill('emergency plumber parramatta')
    await page.getByRole('button', { name: /^search businesses$/i }).click()
    await expect(page).toHaveURL(/q=emergency\+plumber\+parramatta/)
    await expect(page.getByRole('link', { name: /view details/i })).toHaveAttribute('href', '/parramatta-emergency-plumbing?from=registry')

    await page.getByLabel('Business, service, or place').fill('fremantle locksmith')
    await page.getByRole('button', { name: /^search businesses$/i }).click()
    await expect(page.getByText('No businesses here yet.')).toBeVisible()
    await expect(page.getByRole('link', { name: /list your business, free/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /clear search/i })).toBeVisible()

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/ownerId|serviceId|businessId|clerk|sourceHash|rawContact|admin/i)
    await assertPublicLanguage(page)
  })

  test('claim form preserves input and focuses the first validation error', async ({ page }) => {
    await page.goto('/claim')
    await assertPublicLanguage(page)

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
    await publishButton.click()

    await expect(page.getByLabel('Business name')).toHaveValue('Northside Solar')
    await expect(page.getByLabel('Service category')).toBeFocused()
    await expect(page.getByText('Service category is required.')).toBeVisible()
  })

  test('claim form remains usable when first request state changes', async ({ page }) => {
    await page.goto('/claim')
    await assertPublicLanguage(page)

    await page.getByRole('radio', { name: /quote request instructions supplied/i }).click()

    await expect(page.getByRole('radio', { name: /quote request instructions supplied/i })).toBeChecked()
    await page.getByLabel(/I confirm these public details/i).check()
    await expect(page.getByRole('button', { name: /publish service page/i })).toBeEnabled()
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0)
  })

  test('claim submission readbacks use the submitted catalog instead of the default Sam record', async ({ page }, testInfo) => {
    const runId = `${Date.now().toString(36)}-${testInfo.workerIndex}`
    const suffix = `${testInfo.project.name}-${runId}`.replace(/[^a-z0-9]+/giu, '-').toLowerCase()
    const slug = `fremantle-priority-electrical-${suffix}`
    const businessName = `Fremantle Priority Electrical ${suffix}`

    await page.goto('/claim')
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
    await page.getByLabel(/I confirm these public details/i).check()
    await expect(page.getByLabel('Business name')).toHaveValue(businessName)
    await expect(page.getByLabel('Business category')).toHaveValue('Emergency electrical')

    const publishButton = page.getByRole('button', { name: /publish service page/i })
    await expect(publishButton).toBeEnabled()
    await publishButton.click()

    await expect(page).toHaveURL(new RegExp(`/claim/success.*slug=${slug}`))
    await expect(page.getByRole('heading', { name: /your service page is live/i })).toBeVisible()
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

  test('claim success and owner readback show public URL, separate states, and unavailable actions', async ({ page }) => {
    await page.goto('/claim/success')

    await expect(page.getByRole('heading', { name: /your service page is live/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /view public page/i })).toHaveAttribute('href', '/parramatta-emergency-plumbing')
    await expect(page.getByText('Parramatta Emergency Plumbing')).toBeVisible()
    await assertPublicLanguage(page)

    const manageHref = await page.getByRole('link', { name: /manage your page/i }).first().getAttribute('href')
    expect(manageHref).toContain('/owner/status')
    await page.goto(manageHref ?? '/owner/status', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/owner\/status/)
    await expect(page.getByRole('heading', { name: /service page status/i })).toBeVisible()
    await expect(page.getByText(/published, searchable, and ready for inquiries/i)).toBeVisible()
  })

  test('public business page exposes citation facts without private authority fields', async ({ page }) => {
    await page.goto('/parramatta-emergency-plumbing')

    await expect(page.getByRole('heading', { name: 'Parramatta Emergency Plumbing' })).toBeVisible()
    await expect(page.getByText(/Emergency plumbing in Parramatta, NSW/)).toBeVisible()
    await expect(page.getByRole('link', { name: /ask another/i })).toBeVisible()
    await expect(page.getByText('Service area', { exact: true })).toBeVisible()
    await expect(page.getByText('What happens when you reach out', { exact: true })).toBeVisible()
    await expect(page.getByText('This service has not published a human inquiry path yet.')).toBeVisible()
    await expect(page.getByRole('link', { name: /correct or remove this page/i })).toBeVisible()
    await expect(page.getByText('Get as agent JSON')).toBeVisible()

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/ownerId|adminId|clerk|actor|trust tier|public status/i)
    expect(bodyText).not.toMatch(/Public service facts|KNOWN|UNKNOWN|NEXT_STEP/i)
    await assertPublicLanguage(page)
  })

  test('privacy removal request validates and records a receipt', async ({ page }, testInfo) => {
    const runId = `${Date.now().toString(36)}-${testInfo.workerIndex}`
    const suffix = `${testInfo.project.name}-${runId}`.replace(/[^a-z0-9]+/giu, '-').toLowerCase()
    const slug = `privacy-removal-target-${suffix}`

    await page.goto('/claim')
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

    await page.getByLabel('Page slug').fill(slug)
    await page.getByLabel('Your email').fill('owner@example.com')
    await page.getByLabel('What should change?').fill('The public facts are inaccurate and should be reviewed.')
    await page.getByRole('button', { name: /send request/i }).click()
    await expect(page.getByText('Request recorded', { exact: true }).first()).toBeVisible()
  })

  test('phase 2 inquiry flow reaches owner actions and operator reconstruction', async ({ page }, testInfo) => {
    mkdirSync(phase2ArtifactDir, { recursive: true })

    await page.goto('/plumbing-demo/inquiry')
    await expect(page.getByRole('heading', { name: /tell demo plumbing about the job/i })).toBeVisible()

    const submitButton = page.getByRole('button', { name: /send inquiry/i })
    await expect(submitButton).toBeEnabled()
    await submitButton.click()
    await expect(page.getByText('Message is required.')).toBeVisible()
    await expect(page.getByLabel('Tell them about the job')).toBeFocused()

    await page.getByLabel('Contact details for the business reply').fill('phase2.customer@example.test')
    await page.getByLabel('Tell them about the job').fill('Please have a human owner review the inquiry path.')
    await page.getByRole('button', { name: /send inquiry/i }).click()
    await expect(page.getByText(/Message saved for Demo Plumbing/i)).toBeVisible()
    await expect(page.getByText(/Delivery state: delivery awaiting review/i)).toBeVisible()
    await assertNoFutureSurfaceCopy(page)

    await page.goto('/owner/inquiries')
    await expect(page.getByRole('heading', { name: /inquiries/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Needs reply \(1\)/i })).toBeVisible()
    await assertNoFutureSurfaceCopy(page)

    await page.goto(phase2ThreadPath)
    await expect(page.getByRole('heading', { name: /emergency plumbing/i })).toBeVisible()
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
    await expect(page.getByText(/Source hash hash:/i)).toBeVisible()
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
  expect(bodyText).not.toMatch(/[—–]/)
}
