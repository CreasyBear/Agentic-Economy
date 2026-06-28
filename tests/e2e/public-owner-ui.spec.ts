import { expect, test } from '@playwright/test'

test.describe('public owner routes', () => {
  test('home exposes one primary claim path and honest unavailable capability copy', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /claim and publish a truthful service page/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /claim your service page/i })).toHaveCount(1)
    await expect(page.getByRole('link', { name: /open registry/i })).toBeVisible()
    await expect(page.locator('#main-content').getByText(/bookings, payments, and automated actions are not live/i)).toBeVisible()
  })

  test('registry search lists Sam and renders truthful no-results and pagination states', async ({ page }) => {
    await page.goto('/registry')

    await expect(page.getByRole('heading', { name: /search published service catalog facts/i })).toBeVisible()
    await expect(page.getByLabel('Search registry')).toBeVisible()
    await expect(page.getByText('Parramatta Emergency Plumbing')).toBeVisible()
    await expect(page.getByRole('navigation', { name: /registry pagination/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()

    await page.getByLabel('Search registry').fill('emergency plumber parramatta')
    await page.getByRole('button', { name: /^search$/i }).click()
    await expect(page).toHaveURL(/q=emergency\+plumber\+parramatta/)
    await expect(page.getByText('1 result for "emergency plumber parramatta".')).toBeVisible()
    await expect(page.getByRole('link', { name: /open page/i })).toHaveAttribute('href', '/parramatta-emergency-plumbing')

    await page.getByLabel('Search registry').fill('fremantle locksmith')
    await page.getByRole('button', { name: /^search$/i }).click()
    await expect(page.getByText('No registry results')).toBeVisible()
    await expect(page.getByRole('link', { name: /clear search/i })).toBeVisible()

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/ownerId|serviceId|businessId|clerk|sourceHash|rawContact|admin/i)
  })

  test('claim form preserves input and focuses the first validation error', async ({ page }) => {
    await page.goto('/claim')

    await page.getByLabel('Business name').fill('Northside Solar')
    await page.getByLabel('Business category').fill('Solar repairs')
    await page.getByLabel('Suburb').fill('Leederville')
    await page.getByLabel('State or territory').fill('WA')
    await page.getByLabel('Public page slug').fill('northside-solar')
    await page.getByLabel('Source label').fill('Owner supplied')
    await page.getByLabel('Service name').fill('Solar inverter repair')
    const publishButton = page.getByRole('button', { name: /publish service page/i })
    await expect(publishButton).toBeEnabled()
    await publishButton.click()

    await expect(page.getByLabel('Business name')).toHaveValue('Northside Solar')
    await expect(page.getByLabel('Service category')).toBeFocused()
    await expect(page.getByText('Service category is required.')).toBeVisible()
  })

  test('claim form remains usable when first request state changes', async ({ page }) => {
    await page.goto('/claim')

    await page.getByLabel('First request state').selectOption('inquiry_available')

    await expect(page.getByLabel('First request state')).toHaveValue('inquiry_available')
    await expect(page.getByRole('button', { name: /publish service page/i })).toBeEnabled()
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0)
  })

  test('claim submission readbacks use the submitted catalog instead of the default Sam record', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name.replace(/[^a-z0-9]+/giu, '-').toLowerCase()
    const slug = `fremantle-priority-electrical-${suffix}`
    const businessName = `Fremantle Priority Electrical ${suffix}`

    await page.goto('/claim')

    await page.getByLabel('Business name').fill(businessName)
    await page.getByLabel('Business category').fill('Emergency electrical')
    await page.getByLabel('Suburb').fill('Fremantle')
    await page.getByLabel('State or territory').fill('WA')
    await page.getByLabel('Public page slug').fill(slug)
    await page.getByLabel('Source label').fill('Owner supplied electrical service facts')
    await page.getByLabel('Service name').fill('After-hours switchboard repair')
    await page.getByLabel('Service category').fill('Emergency electrical')
    await page.getByLabel('Service summary').fill('Urgent switchboard fault triage for Fremantle homes and shops.')
    await page.getByLabel('Service area').fill('Fremantle, South Fremantle, and Beaconsfield')
    await page.getByLabel('Hours or unknown').fill('After-hours availability supplied by owner')
    await page.getByLabel('Unavailable reason').fill('Owner has not supplied a public contact path yet.')
    await page.getByLabel('Owner message').fill('Owner supplied switchboard repair facts for the public service page.')

    await page.getByRole('button', { name: /publish service page/i }).click()

    await expect(page).toHaveURL(new RegExp(`/claim/success.*slug=${slug}`))
    await expect(page.getByRole('heading', { name: /your service page is published/i })).toBeVisible()
    await expect(page.getByText(businessName)).toBeVisible()
    await expect(page.getByText('After-hours switchboard repair')).toBeVisible()
    await expect(page.getByText('Fremantle, South Fremantle, and Beaconsfield')).toBeVisible()
    await expect(page.getByText('Parramatta Emergency Plumbing')).toHaveCount(0)

    await page.getByRole('link', { name: /view owner status/i }).click()
    await expect(page).toHaveURL(new RegExp(`/owner/status.*slug=${slug}`))
    await expect(page.getByText(businessName)).toBeVisible()

    await page.goto(`/${slug}`)
    await expect(page.getByRole('heading', { name: businessName })).toBeVisible()
    await expect(page.getByText('Urgent switchboard fault triage for Fremantle homes and shops.')).toBeVisible()
    await expect(page.getByText('Parramatta Emergency Plumbing')).toHaveCount(0)
  })

  test('claim success and owner readback show public URL, separate states, and unavailable actions', async ({ page }) => {
    await page.goto('/claim/success')

    await expect(page.getByRole('heading', { name: /your service page is published/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /open page/i })).toHaveAttribute('href', '/parramatta-emergency-plumbing')
    await expect(page.getByText('Bookings not live')).toBeVisible()
    await expect(page.getByText('Payments not live')).toBeVisible()
    await expect(page.getByText('Automated actions not live')).toBeVisible()

    await page.getByRole('link', { name: /view owner status/i }).click()
    await expect(page).toHaveURL(/\/owner\/status/)
    await expect(page.getByRole('heading', { name: /service page status/i })).toBeVisible()
    await expect(page.getByText(/index, discovery, trust, and capability states stay separate/i)).toBeVisible()
  })

  test('public business page exposes service facts without private authority fields', async ({ page }) => {
    await page.goto('/parramatta-emergency-plumbing')

    await expect(page.getByRole('heading', { name: 'Parramatta Emergency Plumbing' })).toBeVisible()
    await expect(page.getByRole('definition').filter({ hasText: 'Parramatta, NSW' })).toBeVisible()
    await expect(page.getByText('Public service facts')).toBeVisible()
    await expect(page.getByText('First request not available yet')).toBeVisible()
    await expect(page.getByRole('link', { name: /request removal or correction/i })).toBeVisible()

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/ownerId|adminId|clerk|actor|trust tier|public status/i)
  })

  test('privacy removal request validates and records a receipt', async ({ page }) => {
    await page.goto('/privacy/remove-business')

    const submitButton = page.getByRole('button', { name: /submit request/i })
    await expect(submitButton).toBeEnabled()
    await submitButton.click()
    await expect(page.getByLabel('Contact email')).toBeFocused()
    await expect(page.getByRole('alert').getByText('A contact email is required.')).toBeVisible()

    await page.getByLabel('Contact email').fill('owner@example.com')
    await page.getByLabel('Evidence summary').fill('The public facts are inaccurate and should be reviewed.')
    await page.getByRole('button', { name: /submit request/i }).click()
    await expect(page.getByText(/request recorded/i)).toBeVisible()
  })
})
