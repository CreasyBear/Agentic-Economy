import { expect, test, type Page } from '@playwright/test'

const QUERY = 'plumbing parramatta'
const PROOF_BOUNDARY =
  'This artifact proves what was sent, when, to whom, and their reply. It does not prove acceptance, availability, booking, or confirmation.'
const forbiddenPreviewCopy = /\b(?:access key|bearer|kernel|mandate|protocol|provider|token)\b/i

test.describe('shortlist export preview', () => {
  test('previews the sanitized payload before copying the exact visible bytes', async ({ page }) => {
    test.setTimeout(45_000)
    await installClipboardRecorder(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')

    const search = page.getByRole('search', { name: 'Start a decision thread' })
    const searchbox = search.getByRole('searchbox', { name: 'What do you need?' })
    const submit = search.getByRole('button', { name: 'Find businesses' })
    await expect(async () => {
      await expect(searchbox).toBeEditable()
      await searchbox.fill(QUERY)
      await expect(searchbox).toHaveValue(QUERY)
      await expect(submit).toBeEnabled()
    }).toPass({ timeout: 30_000 })
    await Promise.all([
      page.waitForURL(/\/t\//, { timeout: 30_000, waitUntil: 'load' }),
      submit.click(),
    ])
    await expect(page.getByRole('heading', { name: 'Your shortlist is ready' })).toBeVisible({ timeout: 30_000 })

    const actions = page.getByLabel('Shortlist actions')
    await actions.getByRole('button', { name: 'Copy' }).click()

    await expect(page.getByRole('dialog', { name: 'Export preview' })).toBeVisible()
    expect(await clipboardWrites(page)).toEqual([])

    const dialog = page.getByRole('dialog', { name: 'Export preview' })
    await expect(dialog.getByRole('checkbox', { name: /Sanitized share/ })).toBeChecked()
    await expect(dialog).toContainText('Not sent')
    await expect(dialog).toContainText('No business reply')
    await expect(dialog).toContainText(PROOF_BOUNDARY)

    const visiblePayload = await dialog.getByLabel('Export preview text').textContent()
    expect(visiblePayload).not.toBeNull()
    expect(visiblePayload).not.toContain('?')
    expect(visiblePayload).not.toMatch(forbiddenPreviewCopy)

    await dialog.getByRole('button', { name: 'Copy summary' }).click()

    await expect.poll(() => clipboardWrites(page)).toEqual([visiblePayload])
  })
})

async function installClipboardRecorder(page: Page) {
  await page.addInitScript(() => {
    const writes: string[] = []
    Object.defineProperty(window, '__aeShortlistClipboardWrites', {
      configurable: false,
      value: writes,
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText(value: string) {
          writes.push(value)
          return Promise.resolve()
        },
      },
    })
  })
}

async function clipboardWrites(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    return [...(window as typeof window & { __aeShortlistClipboardWrites: string[] }).__aeShortlistClipboardWrites]
  })
}
