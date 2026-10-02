import { expect, test, type Locator, type Page } from '@playwright/test'

async function expectInitialHitTarget(page: Page, button: Locator) {
  const box = await button.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) return

  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  expect(center.y).toBeGreaterThanOrEqual(0)
  expect(center.y).toBeLessThan(await page.evaluate(() => window.innerHeight))
  expect(await button.evaluate((node, point) => node.contains(document.elementFromPoint(point.x, point.y)), center)).toBe(true)
}

test('native setup copy and alternatives work by pointer and keyboard', async ({ context, page }) => {

  await page.goto('/for-agents')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })

  const manifestCopyButton = page.getByRole('button', { name: 'Copy Codex MCP command' })

  await expect(page.getByRole('link', { name: 'Start setup', exact: true })).toHaveAttribute('href', '#agent-setup')
  await manifestCopyButton.scrollIntoViewIfNeeded()
  await expectInitialHitTarget(page, manifestCopyButton)

  await expect(async () => {
    await manifestCopyButton.click()
    await expect(page.getByRole('status').filter({ hasText: 'Codex MCP command copied.' })).toBeVisible({ timeout: 1_000 })
  }).toPass()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain('codex mcp add agentic-economy --url "')
  expect(copied).not.toContain('$ORIGIN')

  await manifestCopyButton.focus()
  await expect(manifestCopyButton).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Codex MCP command copied.' })).toBeVisible()
  const alternatives = page.getByRole('button', { name: 'Use Claude Code or Cursor' })
  await expect(alternatives).toHaveAttribute('aria-expanded', 'false')
  await alternatives.focus()
  await page.keyboard.press('Enter')
  await expect(alternatives).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: 'Copy Claude Code MCP command' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('support keeps private contact and current records keyboard reachable', async ({ page }) => {
  await page.goto('/support')
  const support = page.getByRole('link', { name: 'Email support (opens email app)', exact: true })
  await expect(support).toHaveAttribute('href', 'mailto:support@aecon.ai')
  await support.focus()
  await expect(support).toBeFocused()
  await expect(page.getByRole('link', { name: 'Open Calls', exact: true })).toHaveAttribute('href', '/activity')
  const currentTopic = page.getByRole('tab', { name: /^Current status/ })
  await expect(async () => {
    await currentTopic.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('tab', { name: /^Agent connection/ })).toBeFocused({ timeout: 1_000 })
    await expect(page.getByRole('tab', { name: /^Agent connection/ })).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 })
  }).toPass()
  const diagnostics = page.getByRole('button', { name: 'Advanced connection diagnostics' })
  await diagnostics.focus()
  await expect(async () => {
    await page.keyboard.press('Enter')
    await expect(diagnostics).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 })
  }).toPass()
  await expect(page.getByRole('button', { name: 'Copy diagnostic command' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('receipt Help preserves a raw Call reference in the email draft', async ({ page }) => {
  const callRef = `operation-invocation:v1:${'b'.repeat(64)}`
  await page.goto(`/support?callRef=${encodeURIComponent(callRef)}`)
  await expect(page.getByText(`Referenced Call: ${callRef}`)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open this Call' })).toHaveAttribute(
    'href',
    `/calls/${encodeURIComponent(callRef)}`,
  )
  const email = page.getByRole('link', { name: 'Email support (opens email app)' })
  await expect(email).toHaveAttribute('href', new RegExp(`subject=Help%20with%20Call%20${encodeURIComponent(callRef)}`))
  await expect(email).toHaveAttribute('href', new RegExp(`body=I%20need%20help%20with%20Call%20reference%3A%20${encodeURIComponent(callRef)}`))
})
