import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  evaluateStandingMandatePolicy,
  StandingMandateStore,
} from '@/modules/action-invocation'
import {
  runFullYoloEvidence,
  verifyFullYoloEvidence,
} from '../../../tools/dev/full-yolo-evidence-packet'

describe('full_yolo bounded authority mode', () => {
  it('executes fallback and cancellation through three exact standing-mandate uses', async () => {
    const evidence = await runFullYoloEvidence()
    expect(verifyFullYoloEvidence(evidence)).toMatchObject({
      verdict: 'PASS_FOR_DECLARED_CLASS',
      authorityUseCount: 3,
    })
    expect(evidence.comparison).toEqual({
      approveEachPrincipalDecisions: 3,
      boundedMandateStopsAtDifferentAction: true,
      fullYoloPrincipalGrantDecisions: 1,
      repeatedPrincipalDecisions: 0,
      retainedExactAuthorityUses: 3,
    })
  })

  it('steps up on action, provider, recipient, purpose, data, currency, fallback, risk and loss widening', async () => {
    const evidence = await runFullYoloEvidence()
    const mandate = evidence.mandateSnapshot.mandates[0]!
    const base = {
      objective: mandate.scope.objective,
      action: mandate.scope.actions![0]!,
      providerRef: mandate.scope.providerRefs[0]!,
      recipientRef: mandate.scope.recipientRefs[0]!,
      purpose: mandate.scope.purposes[0]!,
      dataFields: ['customer.name'],
      spend: { amountMinor: 0, currency: 'AUD' },
      worstCaseLoss: { amountMinor: 0, currency: 'AUD' },
      fallbackRef: mandate.scope.permittedFallbacks[0]!,
      risk: mandate.scope.riskCeiling,
    }
    const variants = [
      { action: { id: 'other', version: 'v1' } },
      { providerRef: 'other' },
      { recipientRef: 'other' },
      { purpose: 'other' },
      { dataFields: ['customer.phone'] },
      { spend: { amountMinor: 0, currency: 'USD' } },
      { fallbackRef: 'other' },
      { risk: 'other' },
      { worstCaseLoss: { amountMinor: 5_001, currency: 'AUD' } },
    ]
    for (const variant of variants) {
      expect(evaluateStandingMandatePolicy({
        mandate,
        proposal: { ...base, ...variant },
        uses: [],
      }).kind).toBe('refused')
    }
  })

  it('holds uncertain/released exposure and offsets only provider-confirmed cancellation evidence', async () => {
    const evidence = await runFullYoloEvidence()
    const snapshot = structuredClone(evidence.mandateSnapshot)
    snapshot.exposureOffsets = []
    const store = new StandingMandateStore(snapshot)
    expect(store.capacity(snapshot.mandates[0]!.mandateRef).worstCaseLossMinor).toBe(5_000)
    expect(store.recordExposureOffset({
      authorityUseRef: 'mock:authority-use:full-yolo:b',
      offsetAuthorityUseRef: 'mock:authority-use:full-yolo:a',
      amountMinor: 5_000,
      currency: 'AUD',
      evidenceRef: 'request-only',
      offsetAction: { id: 'booking.createDevelopmentReservation', version: 'v1' },
      evidenceRuleRef: 'provider_confirmed_cancellation:v1',
      recordedAt: '2026-07-19T04:00:00.000Z',
    }, () => false)).toEqual({ kind: 'refused', code: 'authority_use_linkage_invalid' })
  })

  it.each([
    ['mode', (copy: any) => { copy.mandateSnapshot.mandates[0].mode = 'bounded_mandate' }],
    ['action scope', (copy: any) => { copy.mandateSnapshot.mandates[0].scope.actions[1].id = 'other' }],
    ['policy', (copy: any) => { copy.policyDecisions[1].fallbackOrdinal = 0 }],
    ['fallback order', (copy: any) => { copy.objectiveDecisionRecords.reverse() }],
    ['loss', (copy: any) => { copy.capacityAfterCancellation.worstCaseLossMinor = 5_000 }],
    ['action-use linkage', (copy: any) => { copy.invocations[1].acceptedAuthority.authorityUseRef = 'other' }],
    ['evidence', (copy: any) => { copy.mandateSnapshot.exposureOffsets[0].evidenceRef = 'other' }],
    ['event order', (copy: any) => { copy.invocations[0].events.reverse() }],
  ])('rejects valid outer-checksum tampering of %s', async (_label, mutate) => {
    const evidence = structuredClone(await runFullYoloEvidence())
    mutate(evidence)
    expect(createHash('sha256').update(JSON.stringify(evidence)).digest('hex')).toHaveLength(64)
    expect(() => verifyFullYoloEvidence(evidence)).toThrow()
  })
})
