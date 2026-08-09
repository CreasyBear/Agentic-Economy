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

test('assistant setup copy buttons work by pointer and keyboard before scrolling', async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name.includes('compact'), 'Both setup controls share the initial wide viewport only.')

  await page.goto('/for-agents', { waitUntil: 'networkidle' })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })

  const claudeCopyButton = page.getByRole('button', { name: 'Copy Claude command' })
  const codexCopyButton = page.getByRole('button', { name: 'Copy Codex command' })

  await expectInitialHitTarget(page, claudeCopyButton)
  await expectInitialHitTarget(page, codexCopyButton)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  await claudeCopyButton.click()
  await expect(page.getByRole('status')).toHaveText('Claude command copied.')

  await codexCopyButton.focus()
  await expect(codexCopyButton).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('Codex command copied.')
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})
