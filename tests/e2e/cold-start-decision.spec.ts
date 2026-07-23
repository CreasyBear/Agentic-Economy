import { expect, test } from '@playwright/test'

import {
  ColdStartDecisionOutcomeValues,
  projectColdStartDecisionSupport,
  type ColdStartDecisionOutcome,
} from '../../src/modules/answer/answer-synthesizer'

const GOLDEN_QUERY =
  'I run a small startup in Perth and need a simple website. I would prefer someone local or an affordable freelancer. Who should I consider, and roughly what should I expect to pay?'

const REFLECTION =
  'You need a simple website for a small startup in Perth. You would prefer someone local or an affordable freelancer, and you want to understand the likely price.'

const CLARIFICATION =
  'Does the website only need to explain your business and collect enquiries, or must customers buy, book or log in?'

test.describe('zero-instruction public decision support', () => {
  test('starts from ordinary language, asks at most one material question, and causes no effect', async ({ page }) => {
    const effectRequests: string[] = []
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname
      if (
        request.method() !== 'GET'
        && /(?:inquir|requests?|invocations?|payments?|endpoint|run)/i.test(pathname)
        && pathname !== '/api/answer/turn'
      ) {
        effectRequests.push(`${request.method()} ${pathname}`)
      }
    })

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'What do you need done?' })).toBeVisible()
    const search = page.getByRole('search', { name: /find local service businesses/i })
    await search.getByRole('searchbox').fill(GOLDEN_QUERY)
    await search.getByRole('button', { name: /^find businesses$/i }).click()

    await page.waitForURL(/\/t\//, { timeout: 30_000 })
    await expect(page.getByText(REFLECTION, { exact: true })).toBeVisible()
    await expect(page.getByText(CLARIFICATION, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Information and enquiries' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Customers need to buy, book or log in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'I’m not sure' })).toBeVisible()
    await expect(page.getByText(/\bOffering\b|revision|shortlist|priorit/i)).toHaveCount(0)

    await page.getByRole('button', { name: 'Information and enquiries' }).click()
    await expect(page.getByRole('region', { name: 'Decision support' })).toBeVisible()
    await expect(page.getByText(CLARIFICATION, { exact: true })).toHaveCount(1)
    await expect(page.getByText(/AE searched \d+ items? of registered supply/)).toBeVisible()
    await expect(page.getByText('Price unavailable', { exact: true })).toBeVisible()
    await expect(page.getByText('Not supplied', { exact: true })).toBeVisible()
    await expect(page.getByText(
      /does not yet have a registered|not enough current comparable information/i,
    )).toBeVisible()
    expect(effectRequests).toEqual([])
  })

  test('keeps all seven source outcomes distinct and preserves price evidence classes', () => {
    expect(ColdStartDecisionOutcomeValues).toEqual([
      'no_registered_supply',
      'no_current_match',
      'one_plausible_option',
      'insufficient_comparable_evidence',
      'constraints_too_narrow',
      'usable_comparison',
      'unsupported_category',
    ])

    const results = ColdStartDecisionOutcomeValues.map((outcome) => (
      projectColdStartDecisionSupport(decision(outcome))
    ))
    expect(new Set(results.map((result) => result.outcome)).size).toBe(7)
    expect(new Set(results.map((result) => result.posture)).size).toBe(7)
    expect(results.every((result) => result.reflection === REFLECTION)).toBe(true)
    expect(results.every((result) => result.searchedSupplyStatement.includes('registered supply'))).toBe(true)
    for (const result of results) {
      expect(result.confirmedConstraintIds).toEqual([
        'website:v1:simple',
        'website:v1:small_startup',
        'website:v1:perth_local_preference',
        'website:v1:affordability_preference',
        'website:v1:indicative_price_requested',
      ])
    }

    const one = results.find((result) => result.outcome === 'one_plausible_option')
    expect(one?.posture).toContain('one current option')
    expect(one?.posture).toContain('not enough to compare the market or call it the best choice')
    expect(one?.prices).toEqual([
      { label: 'Provider-published price', value: '$1,500' },
      { label: 'Price unavailable', value: 'Not supplied' },
    ])

    const narrow = results.find((result) => result.outcome === 'constraints_too_narrow')
    expect(narrow?.posture).toContain('local preference')
    expect(narrow?.safeContinuations).toContainEqual({
      kind: 'relax_named_preference',
      constraintId: 'website:v1:perth_local_preference',
      label: 'I’m flexible',
    })
    expect(JSON.stringify(results)).not.toMatch(/inquiry|requestRef|invocation|endpoint|payment/i)
  })
})

function decision(outcome: ColdStartDecisionOutcome) {
  return {
    outcome,
    confirmedChoiceId: 'im_not_sure' as const,
    confirmedConstraintIds: [
      'website:v1:simple',
      'website:v1:small_startup',
      'website:v1:perth_local_preference',
      'website:v1:affordability_preference',
      'website:v1:indicative_price_requested',
    ] as const,
    searchedRegisteredSupplyCount: outcome === 'no_registered_supply' ? 0 : 2,
    prices: [
      { evidenceClass: 'provider_published_price' as const, value: '$1,500' },
      { evidenceClass: 'price_unavailable' as const, value: 'Not supplied' },
    ],
    ...(outcome === 'constraints_too_narrow'
      ? { relaxableConstraintId: 'website:v1:perth_local_preference' as const }
      : {}),
  }
}
