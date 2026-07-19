import { describe, expect, it } from 'vitest'

import { runFrozenDirectEndpointBaseline } from '@/modules/capability-supply/direct-endpoint-baseline-executor'

describe('frozen direct endpoint baseline', () => {
  it('executes success, correction, and lost-response recovery without Action Invocation', async () => {
    const run = await runFrozenDirectEndpointBaseline()
    expect(run.cases.map((entry) => entry.case)).toEqual([
      'success',
      'material_correction',
      'post_release_uncertainty',
    ])
    expect(run.cases.map((entry) => entry.final.state)).toEqual([
      'completed',
      'completed',
      'reconciled_released',
    ])
    expect(run.cases.every((entry) => (
      entry.final.providerCalls === 1 && entry.final.paymentAttempts === 1
    ))).toBe(true)
    const correction = run.cases[1]!
    expect(correction.trace.map((event) => event.kind)).toEqual(expect.arrayContaining([
      'authority_invalidated',
      'authority_refused',
      'payment_signature_created',
      'provider_release',
    ]))
    expect(correction.trace.findIndex((event) => event.kind === 'authority_invalidated'))
      .toBeLessThan(correction.trace.findIndex((event) => event.kind === 'authority_refused'))
    expect(correction.trace.findIndex((event) => event.kind === 'authority_refused'))
      .toBeLessThan(correction.trace.findIndex((event) => (
        event.kind === 'authority_decision' && event.detail.authorityRef === 'direct:material_correction:authority:2'
      )))
    const uncertainty = run.cases[2]!
    expect(uncertainty.trace.some((event) => (
      event.kind === 'continuation' && event.detail.humanDecisionRequired === false
    ))).toBe(true)
    expect(uncertainty.trace.some((event) => event.kind === 'provider_reconciliation')).toBe(true)
    expect(run.executableDigest).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('binds exact endpoint, payment, disclosure, task facts, and predeclared policy', async () => {
    const run = await runFrozenDirectEndpointBaseline()
    expect(run.task).toMatchObject({
      sourceBaseCommit: '43c7151a1f11a3c3db870cc2a275af8fdc019460',
      operation: {
        method: 'GET',
        path: '/x402/v3/cryptocurrency/quotes/latest',
        price: { currency: 'USD', amountMinor: 1 },
        payment: {
          network: 'eip155:8453',
          asset: '0xmock-usdc',
          payTo: '0xmock-provider-recipient',
        },
        recipient: 'selected_binding',
        purpose: 'retrieve_quote',
        disclosedFields: ['/symbol', '/convert'],
      },
      startingFacts: { symbol: 'BTC' },
      initialMissingFields: ['convert'],
      correction: { symbol: 'ETH' },
      recoveryCondition: 'provider_released_response_lost',
    })
    expect(run.policy.perCase.humanEffort).toBe('componentwise_non_increasing')
    expect(run.policy.aggregate.humanEffort).toBe('at_least_one_component_strictly_lower')
  })
})
