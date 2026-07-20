import { expect, test, type BrowserContext, type Page } from '@playwright/test'

type ProofSnapshot = Readonly<{
  fixtureState: string
  expectedInvocationVersion: number
  counters: Readonly<{
    invocationCreations: number
    effectGenerations: number
    releaseAttempts: number
    commandAttempts: number
    readOnlyInspections: number
  }>
  structured: Readonly<{
    kind: string
    semanticDigest?: string
    commands?: readonly unknown[]
  }>
  humanDigest: string | null
  agentDigest: string | null
  humanVersion: number | null
  agentVersion: number | null
}>

test('golden path preserves durable truth while pending and restores without new effects', async ({
  page,
  context,
}) => {
  const path = '/?state=golden&run=forward-golden'
  await page.goto(path)

  await expectMappingBoundary(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(1)
  await expect(page.getByText('Ready for permission', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Authorize up to A$2.50' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Do not authorize' })).toBeVisible()

  const before = await snapshot(page)
  expectParity(before, 3)
  expect(before.counters).toEqual({
    invocationCreations: 1,
    effectGenerations: 0,
    releaseAttempts: 0,
    commandAttempts: 0,
    readOnlyInspections: 0,
  })

  await page.getByRole('button', { name: 'Authorize up to A$2.50' }).click({ noWaitAfter: true })
  await expect(page.locator('[data-paid-operation-state]')).toHaveAttribute('aria-busy', 'true')
  await expect(page.getByText('Ready for permission', { exact: true })).toBeVisible()
  await expect(page.getByText('Payment prepared', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Authorize up to A$2.50' })).toBeDisabled()

  await expect(page.getByText('Payment prepared', { exact: true })).toBeVisible()
  await expect(page.getByText(
    'Permission recorded. Nothing has been submitted yet.',
    { exact: true },
  )).toBeVisible()
  const prepared = await snapshot(page)
  expectParity(prepared, 4)
  expect(prepared.counters).toEqual({
    invocationCreations: 1,
    effectGenerations: 0,
    releaseAttempts: 0,
    commandAttempts: 1,
    readOnlyInspections: 0,
  })

  await page.getByRole('button', { name: 'Continue operation' }).click({ noWaitAfter: true })
  await expect(page.locator('[data-paid-operation-state]')).toHaveAttribute('aria-busy', 'true')
  await expect(page.getByText('Payment prepared', { exact: true })).toBeVisible()
  await expect(page.getByText('Result received', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Continue operation' })).toBeDisabled()

  await expect(page.getByText('Result received', { exact: true })).toBeVisible()
  await expect(page.getByText('Validated local mock result', { exact: true })).toBeVisible()
  const completed = await snapshot(page)
  expectParity(completed, 5)
  expect(completed.counters).toEqual({
    invocationCreations: 1,
    effectGenerations: 1,
    releaseAttempts: 1,
    commandAttempts: 2,
    readOnlyInspections: 0,
  })

  await page.reload()
  await expect(page.getByText('Result received', { exact: true })).toBeVisible()
  const reloaded = await snapshot(page)
  expectParity(reloaded, 5)
  expect(reloaded.counters).toEqual(completed.counters)

  const restoredPage = await coldRestore(context, path)
  await expect(restoredPage.getByText('Result received', { exact: true })).toBeVisible()
  const restored = await snapshot(restoredPage)
  expectParity(restored, 5)
  expect(restored.counters).toEqual(completed.counters)
  await restoredPage.close()
})

test('named goblins expose one source-owned rejoin or a visible stop', async ({ page }) => {
  const goblins = [
    ['invalid_selector', 'Not sent', null],
    ['refused_before_release', 'Not sent', 'Review details'],
    ['duplicate_stale_disallowed', 'Not sent', 'Review details'],
    ['possibly_submitted', 'Needs checking', 'Check existing payment'],
    ['settlement_unknown', 'Needs checking', 'Check existing payment'],
    ['reconciliation_in_progress', 'Checking existing payment', 'Review details'],
    ['reconciled_not_settled', 'Checked — not paid', 'Review details'],
    ['invalid_result', 'Result not validated', 'Check existing payment'],
    ['settled_invalid_result', 'Paid — result unusable', 'Review details'],
  ] as const

  for (const [state, truth, action] of goblins) {
    await page.goto(`/?state=${state}&run=goblin-${state}`)
    await expect(page.getByText(truth, { exact: true })).toBeVisible()
    await expect(page.locator('[data-command]')).toHaveCount(action === null ? 0 : 1)
    if (action !== null) {
      await expect(page.getByRole('button', { name: action })).toBeVisible()
    }
    expectParity(await snapshot(page), 3)
  }

  await page.goto('/?state=read_unavailable&run=goblin-read')
  await expect(page.getByRole('status')).toContainText('invocation not found')
  await expect(page.locator('[data-paid-operation-state]')).toHaveCount(0)
  await expect(page.locator('[data-command]')).toHaveCount(0)
})

test('ambiguous transport permits read-only reload and never repeats a command', async ({ page }) => {
  await page.goto('/?state=update_not_confirmed&run=ambiguous')
  await expect(page.getByText('Update not confirmed.', { exact: false })).toBeVisible()
  await expect(page.locator('[data-command]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reload operation' })).toBeVisible()

  const before = await snapshot(page)
  await page.getByRole('button', { name: 'Reload operation' }).click()
  const after = await snapshot(page)
  expect(after.counters).toEqual({
    ...before.counters,
    readOnlyInspections: before.counters.readOnlyInspections + 1,
  })
  expect(after.counters.commandAttempts).toBe(0)
  expect(after.counters.effectGenerations).toBe(0)
  expect(after.counters.releaseAttempts).toBe(0)
})

test('keeps the card ordered, keyboard-commandable, and reflow-safe', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The proof contract requests Chromium.')
  await page.setViewportSize({ width: 320, height: 800 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?state=golden&run=accessibility')

  const headings = await page.getByRole('heading').allTextContents()
  expect(headings).toEqual([
    'Local development paid operation',
    'Translate the supplied document',
    'Consequence',
    'Current truth',
    'Payment and result truth',
    'Safe next action',
    'Operation details',
    'Evidence',
  ])
  await expect(page.locator('[aria-live]')).toHaveCount(1)
  await expect(page.locator('[aria-live]')).toHaveAttribute('aria-atomic', 'true')
  await expectNoHorizontalOverflow(page)

  await page.keyboard.press('Tab')
  const action = page.getByRole('button', { name: 'Authorize up to A$2.50' })
  await expect(action).toBeFocused()
  const mechanics = await action.evaluate((element) => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow,
      height: rect.height,
      width: rect.width,
      transitionDuration: style.transitionDuration,
      animationDuration: style.animationDuration,
    }
  })
  expect(
    (mechanics.outlineStyle !== 'none' && mechanics.outlineWidth > 0)
    || mechanics.boxShadow !== 'none',
  ).toBe(true)
  expect(mechanics.height).toBeGreaterThanOrEqual(44)
  expect(mechanics.width).toBeGreaterThanOrEqual(44)
  expect(durationInMilliseconds(mechanics.transitionDuration)).toBeLessThanOrEqual(0.01)
  expect(durationInMilliseconds(mechanics.animationDuration)).toBeLessThanOrEqual(0.01)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(() => {
    document.body.style.zoom = '4'
  })
  await expectNoHorizontalOverflow(page)
})

test('labels local evidence and rejects any hosted-evidence upgrade', async ({ page }) => {
  await page.goto('/?state=completed&run=evidence-class')
  await expectMappingBoundary(page)
  await expect(page.getByText('Local labelled sandbox', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('local_labelled_sandbox_fixture', { exact: true })).toBeVisible()
  expect(await page.locator('body').innerText()).not.toContain(
    'authenticated_exact_revision_hosted_sandbox',
  )
})

async function coldRestore(context: BrowserContext, path: string) {
  const restoredPage = await context.newPage()
  await restoredPage.goto(path)
  return restoredPage
}

async function snapshot(page: Page): Promise<ProofSnapshot> {
  return page.evaluate(() =>
    (window as typeof window & {
      __PAID_OPERATION_DEVELOPMENT_PROOF__: {
        snapshot: () => ProofSnapshot
      }
    }).__PAID_OPERATION_DEVELOPMENT_PROOF__.snapshot())
}

function expectParity(proof: ProofSnapshot, expectedVersion: number) {
  expect(proof.structured.kind).toBe('accepted')
  expect(proof.humanDigest).toBe(proof.agentDigest)
  expect(proof.structured.semanticDigest).toBe(proof.humanDigest)
  expect(proof.expectedInvocationVersion).toBe(expectedVersion)
  expect(proof.humanVersion).toBe(expectedVersion)
  expect(proof.agentVersion).toBe(expectedVersion)
}

async function expectMappingBoundary(page: Page) {
  const boundary = await page.evaluate(() =>
    (window as typeof window & {
      __PAID_OPERATION_DEVELOPMENT_PROOF__: {
        fixtureBoundary: string
      }
    }).__PAID_OPERATION_DEVELOPMENT_PROOF__.fixtureBoundary)
  expect(boundary).toBe(
    'local browser mechanics + authenticated route fixtures; not protected-route browser proof',
  )
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
}

function durationInMilliseconds(value: string): number {
  return Math.max(...value.split(',').map((part) => {
    const duration = Number.parseFloat(part)
    return part.trim().endsWith('ms') ? duration : duration * 1_000
  }))
}
