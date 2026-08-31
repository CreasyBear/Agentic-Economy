import { expect, test } from '@playwright/test'

test.describe('local auth boundary', () => {
  test('renders an intentional local sign-in state without a Clerk crash', async ({ page }) => {
    await page.goto('/sign-in?redirect=%2Fagent-access', { waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { name: 'Local preview sign-in is off' })).toBeVisible()
    await expect(page.getByText('Nothing is signed in or authorized.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open agent access preview' })).toBeVisible()
    await expect(page.getByText(/clerkprovider|application error|something went wrong/i)).toHaveCount(0)
  })

  test('renders an empty local agent-access view without a source error', async ({ page }) => {
    await page.goto('/agent-access', { waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { level: 1, name: 'Agents', exact: true })).toBeVisible()
    await expect(page.getByText('Local preview — no agent is connected')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No agent is connected yet', exact: true })).toBeVisible()
    await expect(page.getByText('Agent access unavailable')).toHaveCount(0)
  })

  test('keeps operator navigation and stale agent recovery keyboard reachable', async ({ page }) => {
    const stalePrincipal = `prn_${'a'.repeat(32)}`
    await page.goto(`/agent-access?caller=${stalePrincipal}`, { waitUntil: 'networkidle' })

    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await skip.press('Enter')
    await expect(page.locator('#operator-main-content')).toBeFocused()

    const compact = (page.viewportSize()?.width ?? 1440) < 768
    if (compact) {
      const currentTrigger = page.getByRole('button', { name: /operator navigation/u })
      if (await currentTrigger.getAttribute('aria-expanded') === 'true') {
        await currentTrigger.press('Enter')
      }
      const trigger = page.getByRole('button', { name: 'Open operator navigation' })
      await trigger.focus()
      await trigger.press('Enter')
      const navigation = page.getByRole('navigation', { name: 'Operator navigation' })
      const agents = navigation.getByRole('link', { name: 'Agents' })
      await expect(agents).toHaveAttribute('aria-current', 'page')
      await agents.focus()
      await expect(agents).toBeFocused()
      await agents.press('Enter')
      await expect(page.getByRole('button', { name: 'Open operator navigation' })).toBeVisible()
      await expect.poll(() => new URL(page.url()).searchParams.has('caller')).toBe(false)
      await expect(page.getByText('Agent not found')).toHaveCount(0)
    } else {
      const navigation = page.getByRole('navigation', { name: 'Operator navigation' })
      await expect(navigation.getByRole('link', { name: 'Agents' })).toHaveAttribute('aria-current', 'page')
      await expect(page.getByText('Agent not found')).toBeVisible()
      const recover = page.getByRole('button', { name: 'Return to Agents' })
      await recover.focus()
      await recover.press('Space')
      await expect.poll(() => new URL(page.url()).searchParams.has('caller')).toBe(false)
    }
    expect(new URL(page.url()).pathname).toBe('/agent-access')
    await expect(page.getByText('Agent not found')).toHaveCount(0)
  })

  test('keeps forbidden admin recovery inside a safe shell without Clerk', async ({ page }) => {
    await page.goto('/admin/index-health', { waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { level: 1, name: 'You don’t have access' })).toBeVisible()
    await expect(page.getByText('You don’t have access to this workspace')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Return to market' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Get help' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Return home' })).toBeVisible()
    await expect(page.getByText('Something went wrong')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Catalog health' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Audit' })).toHaveCount(0)
  })
})
