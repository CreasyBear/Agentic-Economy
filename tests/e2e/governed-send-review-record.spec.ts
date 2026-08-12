import { expect, test, type Locator } from '@playwright/test'

import { LOCAL_E2E_BUSINESS_FIXTURES } from '../helpers/local-e2e-business-fixtures'

const admittedBusiness = LOCAL_E2E_BUSINESS_FIXTURES.find(
  (fixture) => fixture.inquiryAdmission === 'admitted',
)
if (admittedBusiness === undefined) {
  throw new Error('An admitted local E2E business fixture is required.')
}

const submittedBody =
  'Please inspect the leaking isolation valve beside the hot-water unit at 8:30 am.'
const submittedContact = {
  name: 'Alex Exact',
  email: 'alex.exact@example.test',
  phone: '+61 400 123 456',
} as const

const expectedCanonicalRows = [
  { label: 'Business', value: `business:${admittedBusiness.requestedSlug}` },
  {
    label: 'Service',
    value: `service:business:${admittedBusiness.requestedSlug}:emergency-plumbing`,
  },
  { label: 'Request type', value: 'phone_inquiry' },
  { label: 'Request', value: submittedBody },
  { label: 'Name', value: submittedContact.name },
  { label: 'Email', value: submittedContact.email },
  { label: 'Phone', value: submittedContact.phone },
  { label: 'Earlier record', value: 'Not shared' },
] as const

const proofBoundary =
  'This record proves what was sent, when, to whom, and the reply recorded. Acceptance, availability, booking, confirmation, and completed work require separate business evidence.'

test.describe('J3 governed send', () => {
  test('keeps record authority out of requests and telemetry while preserving fragment access through the legacy path', async ({ page }) => {
    const navigatedUrls: string[] = []
    const telemetryRequests: Array<{ url: string; body: string | null }> = []
    page.on('framenavigated', (frame) => navigatedUrls.push(frame.url()))
    page.on('request', (request) => {
      if (/(?:posthog|sentry|ingest)/i.test(request.url())) {
        telemetryRequests.push({ url: request.url(), body: request.postData() })
      }
    })

    await page.goto(`/${admittedBusiness.requestedSlug}/inquiry`)

    await expect(page.getByRole('heading', { name: 'Confirm what will be sent' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Review what will be sent' })).toBeVisible()
    await expect(
      page.getByText("This is exactly what will be sent. It can't change after you approve it."),
    ).toBeVisible()
    await expect(
      page.getByText(`This sends your request once to ${admittedBusiness.businessName}.`),
    ).toBeVisible()
    await expect(
      page.getByText(`Price is confirmed by ${admittedBusiness.businessName} in their reply.`),
    ).toBeVisible()

    const nameInput = page.getByLabel('Name', { exact: true })
    const emailInput = page.getByLabel('Email', { exact: true })
    const phoneInput = page.getByLabel('Phone', { exact: true })
    const bodyInput = page.getByLabel('What do you need?', { exact: true })
    await nameInput.fill(submittedContact.name)
    await emailInput.fill(submittedContact.email)
    await phoneInput.fill(submittedContact.phone)
    await bodyInput.fill(submittedBody)

    const reviewSection = page
      .getByRole('heading', { name: 'Review what will be sent' })
      .locator('xpath=ancestor::section[1]')
    await expect.poll(() => readDefinitionRows(reviewSection)).toEqual(expectedCanonicalRows)

    let releaseSubmit: () => void = () => {}
    let markSubmitStarted: () => void = () => {}
    let submitReleased = false
    const submitGate = new Promise<void>((resolve) => {
      releaseSubmit = () => {
        submitReleased = true
        resolve()
      }
    })
    const submitStarted = new Promise<void>((resolve) => {
      markSubmitStarted = () => resolve()
    })

    await page.route('**/*', async (route) => {
      if (route.request().method() !== 'POST' || submitReleased) {
        await route.continue()
        return
      }

      markSubmitStarted()
      await submitGate
      await route.continue()
    })

    const submitButton = page.getByRole('button', {
      name: `Send request to ${admittedBusiness.businessName}`,
    })
    try {
      await submitButton.click()
      await submitStarted
      await expect(page.getByText('Creating a written handoff record.')).toBeVisible()
      await expect(page.getByText('Do not close or send again.')).toBeVisible()
      await expect(
        page.getByRole('button', { name: `Sending to ${admittedBusiness.businessName}…` }),
      ).toBeDisabled()
      await expect(nameInput).toBeDisabled()
      await expect(emailInput).toBeDisabled()
      await expect(phoneInput).toBeDisabled()
      await expect(bodyInput).toBeDisabled()
    } finally {
      releaseSubmit()
    }

    await expect(page).toHaveURL(/\/t\/[^/?#]+#record$/, { timeout: 15_000 })
    const canonicalRecordUrl = new URL(page.url())
    expect(canonicalRecordUrl.pathname).toMatch(/^\/t\/[^/]+$/)
    expect(canonicalRecordUrl.search).toBe('')
    expect(canonicalRecordUrl.hash).toBe('#record')
    const credentialNavigation = navigatedUrls.find((url) => /#record\?access=iak1\./.test(url))
    expect(credentialNavigation).toBeDefined()
    if (credentialNavigation === undefined) throw new Error('missing transient fragment credential navigation')
    const credentialUrl = new URL(credentialNavigation)
    expect(credentialUrl.search).toBe('')
    expect(credentialUrl.hash).toMatch(/^#record\?access=iak1\.[a-f0-9]{64}\.[a-f0-9]{64}$/)
    expect(JSON.stringify(telemetryRequests)).not.toContain('iak1.')

    await expect(page.getByRole('heading', { name: 'Your record' })).toBeVisible()
    const recordSection = page
      .getByRole('heading', { name: 'What you sent' })
      .locator('xpath=ancestor::section[1]')
    await expect.poll(() => readDefinitionRows(recordSection)).toEqual(expectedCanonicalRows)
    await expect(page.getByText(proofBoundary, { exact: true })).toBeVisible()

    const canonicalHref = canonicalRecordUrl.toString()
    const legacyRecordUrl = new URL(credentialUrl)
    legacyRecordUrl.pathname = legacyRecordUrl.pathname.replace(/^\/t\//, '/i/')

    await page.goto(legacyRecordUrl.toString())

    await expect(page).toHaveURL(canonicalHref)
    await expect(page.getByText(proofBoundary, { exact: true })).toBeVisible()
    expect(JSON.stringify(telemetryRequests)).not.toContain('iak1.')
  })
})

async function readDefinitionRows(section: Locator) {
  return section.locator('dl > div').evaluateAll((rows) =>
    rows.map((row) => ({
      label: row.querySelector('dt')?.textContent?.trim() ?? '',
      value: row.querySelector('dd')?.textContent?.trim() ?? '',
    })),
  )
}
