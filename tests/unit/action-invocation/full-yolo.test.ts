import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import * as actionInvocationPublic from '@/modules/action-invocation'
import {
  evaluateStandingMandatePolicy,
  StandingMandateStore,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  runFullYoloEvidence,
  verifyFullYoloEvidence,
} from '../../../tools/dev/full-yolo-evidence-packet'
import {
  createDevelopmentBookingOffsetRuleTrust,
  developmentCancellationConfirmationRule,
} from '@/modules/booking/development-booking-offset-rule'
import { createTrustedExposureOffsetRuleTestCapability } from '../../support/trusted-exposure-offset-rule-test-factory'

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
    expect((store.recordExposureOffset as any)({
      ...offset,
      offsetAuthorityUseRef: 'mock:authority-use:full-yolo:a',
    }, () => true)).toEqual({ kind: 'refused', code: 'authority_use_linkage_invalid' })
  })

  it('selects only the exact mandate-allowed registered offset rule', async () => {
    const evidence = await runFullYoloEvidence()
    const snapshot = structuredClone(evidence.mandateSnapshot)
    ;(snapshot as any).exposureOffsets = []
    const { digest: _digest, ...offset } = evidence.mandateSnapshot.exposureOffsets![0]!
    const authoritativeTrust = createDevelopmentBookingOffsetRuleTrust(
      evidence.coldContinuation.providerSnapshot,
    )
    const store = new StandingMandateStore(snapshot, { offsetRuleTrust: authoritativeTrust })
    expect(store.recordExposureOffset({ ...offset, evidenceRuleRef: 'unknown' })).toEqual({
      kind: 'refused',
      code: 'authority_use_linkage_invalid',
    })
    const wrongTrust = createTrustedExposureOffsetRuleTestCapability([{
      identity: {
        ...developmentCancellationConfirmationRule,
        source: 'other.source',
      },
      resolve: () => true,
    }])
    const wrongStore = new StandingMandateStore(snapshot, { offsetRuleTrust: wrongTrust })
    expect(wrongStore.recordExposureOffset(offset)).toEqual({
      kind: 'refused',
      code: 'authority_use_linkage_invalid',
    })
    const wrongVersionStore = new StandingMandateStore(snapshot, {
      offsetRuleTrust: createTrustedExposureOffsetRuleTestCapability([{
        identity: {
          ...developmentCancellationConfirmationRule,
          version: 'v2',
        },
        resolve: () => true,
      }]),
    })
    expect(wrongVersionStore.recordExposureOffset(offset)).toEqual({
      kind: 'refused',
      code: 'authority_use_linkage_invalid',
    })
  })

  it('requires the trusted resolver and released causal uses during cold reconstruction', async () => {
    const evidence = await runFullYoloEvidence()
    expect(() => new StandingMandateStore(structuredClone(evidence.mandateSnapshot))).toThrow(
      'standing_mandate_snapshot_exposure_offset_refused',
    )
    for (const state of ['uncertain', 'not_released']) {
      const notReleased = structuredClone(evidence.mandateSnapshot)
      const original = (notReleased.uses as any[]).find(({ authorityUseRef }) =>
        authorityUseRef === notReleased.exposureOffsets![0]!.authorityUseRef)
      original.state = state
      redigest(original)
      expect(() => new StandingMandateStore(notReleased, {
        offsetRuleTrust: createDevelopmentBookingOffsetRuleTrust(
          evidence.coldContinuation.providerSnapshot,
        ),
      })).toThrow('standing_mandate_snapshot_exposure_offset_refused')
    }
  })

  it('rejects an exact-identity forged resolver in live and cold paths', async () => {
    expect(actionInvocationPublic).not.toHaveProperty('ExposureOffsetRuleRegistry')
    expect(actionInvocationPublic).not.toHaveProperty('sealSourceOwnedExposureOffsetRules')
    const evidence = await runFullYoloEvidence()
    const withoutOffset = structuredClone(evidence.mandateSnapshot)
    ;(withoutOffset as any).exposureOffsets = []
    const { digest: _digest, ...offset } = evidence.mandateSnapshot.exposureOffsets![0]!
    const forged = {
      identity: developmentCancellationConfirmationRule,
      resolve: () => true,
    }
    const live = new StandingMandateStore(withoutOffset, {
      offsetRuleTrust: forged as never,
    })
    expect(live.recordExposureOffset(offset)).toEqual({
      kind: 'refused',
      code: 'authority_use_linkage_invalid',
    })
    expect(() => new StandingMandateStore(structuredClone(evidence.mandateSnapshot), {
      offsetRuleTrust: forged as never,
    })).toThrow('standing_mandate_snapshot_exposure_offset_refused')
  })

  it('proves restart continuation is objective-owned rather than direct provider replay', async () => {
    const evidence = await runFullYoloEvidence()
    expect(evidence.coldContinuation.continuationKind).toBe('source_owned_objective_resume')
    expect(evidence.coldContinuation).not.toHaveProperty('replayedBooking')
    expect(evidence.coldContinuation).not.toHaveProperty('replayedCancellation')
    expect(evidence.coldContinuation.freshProcessRefs[0]).not.toBe(
      evidence.coldContinuation.freshProcessRefs[1],
    )
    expect(evidence.coldContinuation.finalObjectiveState.digest).toBe(
      evidence.coldContinuation.replayedObjectiveState.digest,
    )
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
    ['offset rule source', (copy: any) => {
      copy.mandateSnapshot.exposureOffsets[0].evidenceRuleSource = 'other'
      redigest(copy.mandateSnapshot.exposureOffsets[0])
    }],
    ['offset rule version', (copy: any) => {
      copy.mandateSnapshot.exposureOffsets[0].evidenceRuleVersion = 'v2'
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
    ['objective stage', (copy: any) => {
      copy.coldContinuation.midRun.objectiveState.stage = 'completed'
      redigest(copy.coldContinuation.midRun.objectiveState)
    }],
    ['objective current action', (copy: any) => {
      copy.coldContinuation.midRun.objectiveState.currentActionRef = 'other'
      redigest(copy.coldContinuation.midRun.objectiveState)
    }],
    ['objective fallback progress', (copy: any) => {
      copy.coldContinuation.midRun.objectiveState.fallbackProgress.attemptedProviderRefs.reverse()
      redigest(copy.coldContinuation.midRun.objectiveState)
    }],
    ['objective result linkage', (copy: any) => {
      copy.coldContinuation.finalObjectiveState.cancellationResultRef = 'other'
      redigest(copy.coldContinuation.finalObjectiveState)
    }],
    ['direct provider replay evidence', (copy: any) => {
      copy.coldContinuation.replayedBooking = copy.authoritativeResults.booking.result
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
