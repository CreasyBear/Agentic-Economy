import { expect, test } from '@playwright/test'

test('trial entry renders without backend access and preserves the sign-up return destination', async ({ page }) => {
  const response = await page.goto('/trial')
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page.getByRole('heading', { name: 'Your Agentic Economy trial' })).toBeVisible()
  await expect(page.getByText(/Public signup does not include automatic credit/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create an Account' })).toHaveAttribute('href', '/sign-up?redirect=%2Ftrial')
  await expect(page.getByRole('link', { name: 'Sign in to activate' })).toHaveAttribute('href', '/sign-in?redirect=%2Ftrial')
  await expect(page.getByRole('button', { name: 'Activate approved trial' })).toHaveCount(0)
  await expect(page.getByRole('main')).toHaveCount(1)
})
