import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  evaluateStandingMandatePolicy,
  StandingMandateStore,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
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
      objectiveRef: 'mock:objective:test',
      objective: mandate.scope.objective,
      sourceOptionRef: 'mock:option:test',
      materialDigest: 'sha256:test',
      authorityUseRef: 'mock:use:test',
      invocationRef: 'mock:invocation:test',
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
        policyDecisionRef: 'mock:policy:test',
      }).kind).toBe('refused')
    }
  })

  it('holds uncertain/released exposure and offsets only provider-confirmed cancellation evidence', async () => {
    const evidence = await runFullYoloEvidence()
    const snapshot = structuredClone(evidence.mandateSnapshot)
    ;(snapshot as any).exposureOffsets = []
    const store = new StandingMandateStore(snapshot)
    expect(store.capacity(snapshot.mandates[0]!.mandateRef).worstCaseLossMinor).toBe(5_000)
    const { digest: _digest, ...offset } = evidence.mandateSnapshot.exposureOffsets![0]!
    expect(store.recordExposureOffset({
      ...offset,
      offsetAuthorityUseRef: 'mock:authority-use:full-yolo:a',
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
    ['causal reservation', (copy: any) => {
      copy.mandateSnapshot.exposureOffsets[0].exposureSubjectRef = 'other'
      redigest(copy.mandateSnapshot.exposureOffsets[0])
    }],
    ['causal provider', (copy: any) => {
      copy.mandateSnapshot.exposureOffsets[0].providerRef = 'other'
      redigest(copy.mandateSnapshot.exposureOffsets[0])
    }],
    ['causal principal', (copy: any) => {
      copy.mandateSnapshot.exposureOffsets[0].principalRef = 'other'
      redigest(copy.mandateSnapshot.exposureOffsets[0])
    }],
    ['causal evidence', (copy: any) => {
      copy.mandateSnapshot.exposureOffsets[0].offsetEvidenceRef = 'other'
      redigest(copy.mandateSnapshot.exposureOffsets[0])
    }],
    ['causal use', (copy: any) => {
      copy.mandateSnapshot.exposureOffsets[0].offsetAuthorityUseRef =
        copy.mandateSnapshot.exposureOffsets[0].authorityUseRef
      redigest(copy.mandateSnapshot.exposureOffsets[0])
    }],
    ['offset reuse', (copy: any) => {
      copy.mandateSnapshot.exposureOffsets.push(structuredClone(copy.mandateSnapshot.exposureOffsets[0]))
    }],
    ['policy material', (copy: any) => {
      copy.policyDecisions[1].proposal.providerRef = 'other'
      redigest(copy.policyDecisions[1])
    }],
    ['cold source result', (copy: any) => {
      copy.invocations[1].durable.source.result.providerRef = 'other'
    }],
    ['cold provider effect count', (copy: any) => {
      copy.coldContinuation.effectsAfterReplay.booking += 1
    }],
  ])('rejects valid outer-checksum tampering of %s', async (_label, mutate) => {
    const evidence = structuredClone(await runFullYoloEvidence())
    mutate(evidence)
    expect(createHash('sha256').update(JSON.stringify(evidence)).digest('hex')).toHaveLength(64)
    expect(() => verifyFullYoloEvidence(evidence)).toThrow()
  })
})

function redigest(record: Record<string, unknown>) {
  const { digest: _digest, ...material } = record
  record.digest = canonicalDigest(material as never)
}
