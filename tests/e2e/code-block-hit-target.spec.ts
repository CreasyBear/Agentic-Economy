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

test('assistant setup primary copy control works by pointer and keyboard before scrolling', async ({ context, page }) => {

  await page.goto('/for-agents', { waitUntil: 'networkidle' })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })

  const manifestCopyButton = page.getByRole('button', { name: 'Copy agent setup instruction' })

  await expectInitialHitTarget(page, manifestCopyButton)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  await manifestCopyButton.click()
  await expect(page.getByRole('status').first()).toHaveText('agent setup instruction copied.')

  await manifestCopyButton.focus()
  await expect(manifestCopyButton).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status').first()).toHaveText('agent setup instruction copied.')
})
