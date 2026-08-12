import { describe, expect, it } from 'vitest'

import {
  runDevelopmentProviderConformanceScenario,
} from '@/modules/capability-supply/development-provider-conformance-scenario'

describe('explicit paid-operation provider selection', () => {
  it('runs the closed two-provider conformance matrix', async () => {
    const scenario = await runDevelopmentProviderConformanceScenario()
    const { A, B } = scenario.successes

    expect(A.commands).toEqual(['authorize', 'execute'])
    expect(B.commands).toEqual(A.commands)
    for (const selected of [A, B]) {
      expect(selected.executed.kind).toBe('accepted')
      if (selected.executed.kind !== 'accepted') continue
      const { semantics, human, agent } = selected.executed.value
      expect(semantics.schema).toBe('agentic-paid-operation:v1')
      expect(human.semantics).toEqual(agent.semantics)
      expect(human.semanticDigest).toBe(agent.semanticDigest)
      expect(semantics.operation.providerId).toBe(selected.operation.identity.businessId)
      expect(semantics.operation.operationKey).toBe(selected.operation.operationId)
      expect(semantics.operation.operationRevision)
        .toBe(String(selected.operation.identity.publicationRevision))
      expect(selected.prepared.prepared?.target).toMatchObject({
        businessId: selected.operation.identity.businessId,
        publicationRef: selected.operation.identity.publicationRef,
        publicationRevision: selected.operation.identity.publicationRevision,
        publicationDigest: selected.operation.identity.publicationDigest,
        contractId: selected.operation.identity.contractId,
        contractVersion: selected.operation.identity.contractVersion,
        contractDigest: selected.operation.identity.contractDigest,
        offeringId: selected.operation.identity.offeringId,
        offeringDigest: selected.operation.identity.offeringDigest,
        bindingId: selected.operation.identity.bindingId,
        bindingDigest: selected.operation.identity.bindingDigest,
        adapterId: selected.operation.identity.adapterId,
        transportConfigDigest: selected.operation.identity.transportConfigDigest,
        priceDigest: selected.operation.identity.priceDigest,
        price: selected.operation.identity.price,
        pricingConfig: selected.operation.identity.pricingConfig,
      })
      const connectionAuthority = selected.operation.identity.connectionAuthority
      if (connectionAuthority !== undefined) {
        expect(selected.prepared.prepared?.target).toMatchObject({
          connectionAuthority: {
            authorityDigest: connectionAuthority.authorityDigest,
            authorityGeneration: connectionAuthority.authorityGeneration,
            operationRef: connectionAuthority.operationRef,
          },
        })
      }
      expect(selected.paymentAttempt?.providerEndpoint)
        .toMatch(new RegExp(`^${selected.operation.binding.endpointUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?`))
      expect(selected.operation.identity.payment.kind).toBe('x402')
      if (selected.operation.identity.payment.kind === 'x402') {
        expect(selected.paymentAttempt?.payTo).toBe(selected.operation.identity.payment.payTo)
      }
      expect(selected.normalized.kind).toBe('accepted')
      expect(selected.counters).toEqual({ authorizations: 1, signatures: 1, sends: 1 })
    }

    expect(A.operation.identity.businessId).not.toBe(B.operation.identity.businessId)
    expect(A.operation.operationId).not.toBe(B.operation.operationId)
    expect(A.operation.identity.publicationRevision).not.toBe(B.operation.identity.publicationRevision)
    expect(A.operation.identity.payment.kind).toBe('x402')
    expect(B.operation.identity.payment.kind).toBe('x402')
    if (A.operation.identity.payment.kind === 'x402' && B.operation.identity.payment.kind === 'x402') {
      expect(A.operation.identity.payment.payTo).not.toBe(B.operation.identity.payment.payTo)
    }
    expect(A.normalized.kind === 'accepted' && A.normalized.result.source)
      .not.toEqual(B.normalized.kind === 'accepted' && B.normalized.result.source)

    expect(scenario.uncertainA.executed.kind).toBe('accepted')
    if (scenario.uncertainA.executed.kind === 'accepted') {
      const continuations = scenario.uncertainA.executed.value.semantics.continuations.map(({ kind }) => kind)
      expect(continuations).toContain('reconcile')
      expect(continuations).not.toContain('authorize')
      expect(continuations).not.toContain('execute')
      expect(continuations).not.toContain('retry')
    }
    expect(scenario.uncertainA.counters).toEqual({ authorizations: 1, signatures: 1, sends: 1 })
    expect(scenario.countersBeforeExplicitB).toEqual({
      authorizations: 0,
      signatures: 0,
      sends: 0,
    })
    expect(scenario.aNotSettled.source).toBe('reconciliation')
    expect(scenario.aNotSettled.outcome.kind).toBe('reconciled')
    expect(scenario.aNotSettled.after.snapshot.paymentAttempts[0])
      .toMatchObject({ state: 'not_settled' })

    const explicitB = scenario.explicitBAfterANotSettled
    expect([
      explicitB.prepared.invocationRef,
      explicitB.prepared.authority?.reference,
      explicitB.paymentAttempt?.paymentIdentifier,
      `${explicitB.view.attempts[0]?.attemptRef}:${explicitB.view.attempts[0]?.effectGeneration}`,
    ]).not.toContain(undefined)
    expect(explicitB.prepared.invocationRef).not.toBe(scenario.uncertainA.prepared.invocationRef)
    expect(explicitB.prepared.authority?.reference).not.toBe(scenario.uncertainA.prepared.authority?.reference)
    expect(explicitB.paymentAttempt?.paymentIdentifier)
      .not.toBe(scenario.uncertainA.paymentAttempt?.paymentIdentifier)
    expect(explicitB.view.attempts[0]).not.toEqual(scenario.uncertainA.view.attempts[0])

    expect(scenario.invalidA.normalized).toEqual({
      kind: 'refused',
      code: 'btc_usd_quote_payload_invalid',
    })
    expect(scenario.invalidA.counters.sends).toBe(1)
    if (scenario.invalidA.executed.kind === 'accepted') {
      expect(scenario.invalidA.executed.value.semantics.settlement).toMatchObject({
        state: 'unknown',
        evidenceRefs: expect.arrayContaining([expect.any(String)]),
      })
      expect(scenario.invalidA.executed.value.semantics.resultDelivery)
        .toMatchObject({ state: 'invalid', code: 'btc_usd_quote_payload_invalid' })
    }
    expect(scenario.explicitBAfterAInvalid.prepared.invocationRef)
      .not.toBe(scenario.invalidA.prepared.invocationRef)

    expect(scenario.crossedPayloads.aIntoB.kind).toBe('refused')
    expect(scenario.crossedPayloads.bIntoA.kind).toBe('refused')
    for (const refusal of scenario.crossRefusals) {
      expect(refusal.source).toBe('command')
      expect(refusal.outcome.kind, refusal.caseName).toBe('refused')
      expect(refusal.after, refusal.caseName).toEqual(refusal.before)
    }
    expect(scenario.reconciliationReplay.source).toBe('reconciliation')
    expect(scenario.reconciliationReplay.outcome.kind).toBe('refused')
    expect(scenario.reconciliationReplay.after).toEqual(scenario.reconciliationReplay.before)
    expect(scenario.restoreRefusals.map(({ selected }) => selected)).toEqual([
      'A-as-B',
      'B-as-A',
      'A-payee-tamper',
      'forced-payment-identifier-collision',
    ])
    for (const refusal of scenario.restoreRefusals) {
      expect(refusal.source, refusal.selected).toBe('snapshot_restore')
      expect(refusal.outcome.kind, refusal.selected).toBe('refused')
      expect(refusal.after, refusal.selected).toEqual(refusal.before)
    }
  })
})
