import { expect, test, type Page } from '@playwright/test'

const canonicalStates = [
  ['prepared', 'Prepared'],
  ['refused_before_release', 'Not sent'],
  ['possibly_submitted', 'Needs checking'],
  ['reconciled_not_settled', 'Checked — not paid'],
  ['settled_invalid_result', 'Paid — result unusable'],
  ['completed', 'Result received'],
] as const

test('renders all six canonical paid-operation states with non-colour truth labels', async ({
  page,
}) => {
  for (const [state, label] of canonicalStates) {
    await page.goto(`/?state=${state}`)
    await expect(page.getByRole('main')).toHaveAttribute('data-development-only', 'true')
    await expect(page.getByText(label, { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Translate the supplied document' })).toBeVisible()
    await expect(page.getByText('Labelled local mock', { exact: true }).first()).toBeVisible()
  }
})

test('answers the exact six comprehension questions from visible customer semantics', async ({
  page,
}) => {
  await page.goto('/?state=possibly_submitted')
  const questions = [
    ['What task is being done?', 'Translate the supplied document'],
    ['Which provider is involved?', 'Local Translation Provider'],
    ['What is the maximum charge?', 'A$2.50'],
    ['What data-sharing state is shown?', 'Sharing status unknown'],
    ['What is the payment or release truth?', 'The provider may have received the payment request. AE will not try again until the exact payment is checked.'],
    ['What is the safe next action?', 'Check the existing payment and request. Do not start this purchase again.'],
  ] as const

  expect(questions.map(([question]) => question)).toEqual([
    'What task is being done?',
    'Which provider is involved?',
    'What is the maximum charge?',
    'What data-sharing state is shown?',
    'What is the payment or release truth?',
    'What is the safe next action?',
  ])
  for (const [, answer] of questions) {
    await expect(page.getByText(answer, { exact: true }).first()).toBeVisible()
  }
})

test('supports keyboard activation, computed visible focus, and 44px targets', async ({ page }) => {
  await page.goto('/?state=possibly_submitted')
  await page.keyboard.press('Tab')
  const action = page.getByRole('button', { name: 'Check existing payment' })
  await expect(action).toBeFocused()

  const focusAndTarget = await action.evaluate((element) => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow,
      height: rect.height,
      width: rect.width,
    }
  })
  const computedFocusIsVisible = (
    focusAndTarget.outlineStyle !== 'none'
    && focusAndTarget.outlineWidth > 0
  ) || focusAndTarget.boxShadow !== 'none'
  expect(computedFocusIsVisible).toBe(true)
  expect(focusAndTarget.height).toBeGreaterThanOrEqual(44)
  expect(focusAndTarget.width).toBeGreaterThanOrEqual(44)

  await page.keyboard.press('Enter')
  await expect(page.locator('main > [role="status"]')).toBeFocused()
})

test('bounds the action announcement to one status update', async ({ page }) => {
  await page.goto('/?state=possibly_submitted')
  const developmentStatus = page.locator('main > [role="status"]')
  await expect(developmentStatus).toHaveText('Development projection ready.')

  await page.getByRole('button', { name: 'Check existing payment' }).click()
  await expect(developmentStatus).toHaveText('Development projection ready.')
  await expect(developmentStatus).toBeFocused()

  const liveRegions = page.locator('[aria-live]')
  await expect(liveRegions).toHaveCount(1)
  await expect(liveRegions).toHaveAttribute('role', 'status')
  await expect(liveRegions).toHaveAttribute('aria-atomic', 'true')

  const accessibilityTree = await page.locator('main').ariaSnapshot()
  expect(accessibilityTree).toContain('status')
  expect(accessibilityTree).toContain('Development projection ready.')
})

test('has no horizontal overflow at 320 CSS pixels or declared 400 percent zoom emulation', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The proof contract requests Chromium.')
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/?state=possibly_submitted')
  await expectNoHorizontalOverflow(page)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(() => {
    document.body.style.zoom = '4'
  })
  expect(await page.evaluate(() => getComputedStyle(document.body).zoom)).toBe('4')
  await expectNoHorizontalOverflow(page)
})

test('computes reduced-motion behavior without animation or transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?state=possibly_submitted')

  const actionMotion = await page.getByRole('button', {
    name: 'Check existing payment',
  }).evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      transitionDuration: style.transitionDuration,
      animationDuration: style.animationDuration,
    }
  })
  expect(durationInMilliseconds(actionMotion.transitionDuration)).toBeLessThanOrEqual(0.01)
  expect(durationInMilliseconds(actionMotion.animationDuration)).toBeLessThanOrEqual(0.01)
})

test('exposes one shared digest and requires both reconciliation evidence envelopes', async ({
  page,
}) => {
  await page.goto('/?state=possibly_submitted')
  const contract = await page.evaluate(() =>
    (window as typeof window & {
      __PAID_OPERATION_DEVELOPMENT_PROOF__: {
        structured: {
          kind: string
          semanticDigest: string
          commands: unknown[]
        }
        humanDigest: string | null
        agentDigest: string | null
      }
    }).__PAID_OPERATION_DEVELOPMENT_PROOF__)
  expect(contract.structured.kind).toBe('accepted')
  expect(contract.humanDigest).toBe(contract.agentDigest)
  expect(contract.structured.semanticDigest).toBe(contract.humanDigest)
  expect(contract.structured.commands).toEqual([{
    command: 'reconcile',
    requiredInput: ['reconciliationEvidence', 'paymentReconciliationEvidence'],
    inputTemplate: {
      kind: 'reconcile',
      reconciliationEvidence: null,
      paymentReconciliationEvidence: null,
    },
    expectedInvocationVersion: 3,
  }])
})

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
