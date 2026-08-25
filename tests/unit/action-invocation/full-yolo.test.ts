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
import * as developmentProviderOperationProviderSource from '../../../tools/dev/fixtures/provider-operation/development-provider-operation-provider'
import { createDevelopmentProviderOperationProvider } from '../../../tools/dev/fixtures/provider-operation/development-provider-operation-provider'
import { resumeDevelopmentProviderOperationObjective } from '../../../tools/dev/fixtures/provider-operation/development-provider-operation-objective'
import { createDevelopmentProviderOperationSigningCustody } from '../../../tools/dev/fixtures/provider-operation/development-provider-operation-signing-custody'

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
  }, 15_000)

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
      spend: { currency: 'AUD', units: '0', exponent: 2 },
      worstCaseLoss: { currency: 'AUD', units: '0', exponent: 2 },
      fallbackRef: mandate.scope.permittedFallbacks[0]!,
      risk: mandate.scope.riskCeiling,
    }
    const variants = [
      { action: { id: 'other', version: 'v1' } },
      { providerRef: 'other' },
      { recipientRef: 'other' },
      { purpose: 'other' },
      { dataFields: ['customer.phone'] },
      { spend: { currency: 'USD', units: '0', exponent: 2 } },
      { fallbackRef: 'other' },
      { risk: 'other' },
      { worstCaseLoss: { currency: 'AUD', units: '5001', exponent: 2 } },
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
    expect(store.capacity(snapshot.mandates[0]!.mandateRef).worstCaseLoss).toEqual({
      currency: 'AUD',
      units: '5000',
      exponent: 2,
    })
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
    const store = new StandingMandateStore(snapshot)
    expect(store.recordExposureOffset({ ...offset, evidenceRuleRef: 'unknown' })).toEqual({
      kind: 'refused',
      code: 'authority_use_linkage_invalid',
    })
    expect(store.recordExposureOffset({ ...offset, evidenceRuleSource: 'other.source' })).toEqual({
      kind: 'refused',
      code: 'authority_use_linkage_invalid',
    })
    expect(store.recordExposureOffset({ ...offset, evidenceRuleVersion: 'v2' })).toEqual({
      kind: 'refused',
      code: 'authority_use_linkage_invalid',
    })
  })

  it('reverifies signed release and released causal uses during cold reconstruction', async () => {
    const evidence = await runFullYoloEvidence()
    expect(() => new StandingMandateStore(structuredClone(evidence.mandateSnapshot))).not.toThrow()
    for (const state of ['uncertain', 'not_released']) {
      const notReleased = structuredClone(evidence.mandateSnapshot)
      const original = (notReleased.uses as any[]).find(({ authorityUseRef }) =>
        authorityUseRef === notReleased.exposureOffsets![0]!.authorityUseRef)
      original.state = state
      redigest(original)
      expect(() => new StandingMandateStore(notReleased))
        .toThrow('standing_mandate_snapshot_exposure_offset_refused')
    }
  })

  it('rejects exact-identity forged attestations in live and cold paths', async () => {
    expect(actionInvocationPublic).not.toHaveProperty('ExposureOffsetRuleRegistry')
    expect(actionInvocationPublic).not.toHaveProperty('sealSourceOwnedExposureOffsetRules')
    const evidence = await runFullYoloEvidence()
    const withoutOffset = structuredClone(evidence.mandateSnapshot)
    ;(withoutOffset as any).exposureOffsets = []
    const forged = structuredClone(evidence.mandateSnapshot.exposureOffsets![0]!)
    ;(forged.releaseAttestation.signature as any).signature = `ed25519:${'0'.repeat(128)}`
    redigest(forged)
    const { digest: _digest, ...forgedMaterial } = forged
    const live = new StandingMandateStore(withoutOffset)
    expect(live.recordExposureOffset(forgedMaterial)).toEqual({
      kind: 'refused',
      code: 'authority_use_linkage_invalid',
    })
    const cold = structuredClone(evidence.mandateSnapshot)
    ;(cold as any).exposureOffsets = [forged]
    expect(() => new StandingMandateStore(cold))
      .toThrow('standing_mandate_snapshot_exposure_offset_refused')
  })

  it('provider signing ignores caller-authored authority claims and refuses invented state', async () => {
    expect(developmentProviderOperationProviderSource).not.toHaveProperty('developmentProviderSigningKey')
    expect(developmentProviderOperationProviderSource).not.toHaveProperty('issueExposureReleaseAttestation')
    const evidence = await runFullYoloEvidence()
    const provider = createDevelopmentProviderOperationProvider({
      ...evidence.coldContinuation.providerSnapshot.options,
      snapshot: evidence.coldContinuation.providerSnapshot,
    })
    const maliciousAuthorityClaims = {
      mandateRef: 'other',
      originalAuthorityUseRef: 'other',
      cancellationAuthorityUseRef: 'other',
      principalRef: 'other',
      evidenceRef: 'other',
    }
    const replayed = await (provider.cancel as any)(
      evidence.authoritativeResults.cancellation.input,
      maliciousAuthorityClaims,
    )
    expect(replayed.kind).toBe('effect_cancellation_confirmed')
    if (replayed.kind !== 'effect_cancellation_confirmed') throw new Error('expected_confirmation')
    expect(replayed.exposureReleaseAttestation?.material).not.toHaveProperty('mandateRef')
    expect(replayed.exposureReleaseAttestation?.material).not.toHaveProperty('principalRef')
    expect(replayed.exposureReleaseAttestation?.material).not.toHaveProperty('originalAuthorityUseRef')
    expect(replayed.exposureReleaseAttestation?.material).not.toHaveProperty('cancellationAuthorityUseRef')
    const invented = await provider.cancel({
      environment: 'MOCK/DEVELOPMENT ONLY',
      effectRef: 'invented',
      providerRef: 'mock:provider:calendar:b',
      principalRef: 'mock:principal:full-yolo',
      reason: 'invented',
      operationKey: 'invented',
    })
    expect(invented.kind).toBe('effect_cancellation_refused')
    expect(invented).not.toHaveProperty('exposureReleaseAttestation')
  })

  it('proves restart continuation is objective-owned rather than direct provider replay', async () => {
    const evidence = await runFullYoloEvidence()
    expect(evidence.coldContinuation.continuationKind).toBe('source_owned_objective_resume')
    expect(evidence.coldContinuation).not.toHaveProperty('replayedOperation')
    expect(evidence.coldContinuation).not.toHaveProperty('replayedCancellation')
    expect(evidence.coldContinuation.freshObjectGraphRefs[0]).not.toBe(
      evidence.coldContinuation.freshObjectGraphRefs[1],
    )
    expect(evidence.coldContinuation.finalObjectiveState.digest).toBe(
      evidence.coldContinuation.replayedObjectiveState.digest,
    )
    expect(new Set([
      evidence.processColdProof.parentProcessId,
      evidence.processColdProof.operationProcessId,
      evidence.processColdProof.cancellationProcessId,
      evidence.processColdProof.replayProcessId,
    ])).toHaveProperty('size', 4)
    expect(evidence.processColdProof.privateKeySerializedInState).toBe(false)
    expect(evidence.processColdProof.cancellationEffectCounts).toEqual({
      operation: 1,
      cancellation: 1,
    })
    expect(evidence.processColdProof.replayEffectCounts).toEqual(
      evidence.processColdProof.cancellationEffectCounts,
    )
  })

  it('refuses cancellation continuation under the wrong custody key', async () => {
    const evidence = await runFullYoloEvidence()
    await expect(resumeDevelopmentProviderOperationObjective({
      processRef: 'wrong-custody-test',
      mandate: evidence.mandateSnapshot.mandates[0]!,
      mandateSnapshot: evidence.coldContinuation.midRun.mandateSnapshot,
      providerSnapshot: evidence.coldContinuation.midRun.providerSnapshot,
      objectiveState: evidence.coldContinuation.midRun.objectiveState,
      durableInvocations: evidence.coldContinuation.midRun.durableInvocations,
      signingCustody: createDevelopmentProviderOperationSigningCustody({
        keyId: 'mock:development-provider-operation-provider:release:v1',
        privateKey: '2222222222222222222222222222222222222222222222222222222222222222',
      }),
    })).rejects.toThrow('authority_use_linkage_invalid')
  })

  it.each([
    ['mode', (copy: any) => { copy.mandateSnapshot.mandates[0].mode = 'bounded_mandate' }],
    ['action scope', (copy: any) => { copy.mandateSnapshot.mandates[0].scope.actions[1].id = 'other' }],
    ['policy', (copy: any) => { copy.policyDecisions[1].fallbackOrdinal = 0 }],
    ['fallback order', (copy: any) => { copy.objectiveDecisionRecords.reverse() }],
    ['loss', (copy: any) => { copy.capacityAfterCancellation.worstCaseLoss = { currency: 'AUD', units: '5000', exponent: 2 } }],
    ['action-use linkage', (copy: any) => { copy.invocations[1].acceptedAuthority.authorityUseRef = 'other' }],
    ['evidence', (copy: any) => { copy.mandateSnapshot.exposureOffsets[0].evidenceRef = 'other' }],
    ['event order', (copy: any) => { copy.invocations[0].events.reverse() }],
    ['causal effect', (copy: any) => {
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
    ['attestation payload', (copy: any) => {
      copy.mandateSnapshot.exposureOffsets[0].releaseAttestation.material.providerRef = 'other'
      redigest(copy.mandateSnapshot.exposureOffsets[0].releaseAttestation)
      redigest(copy.mandateSnapshot.exposureOffsets[0])
    }],
    ['attestation signature', (copy: any) => {
      copy.mandateSnapshot.exposureOffsets[0].releaseAttestation.signature.signature =
        `ed25519:${'0'.repeat(128)}`
      redigest(copy.mandateSnapshot.exposureOffsets[0])
    }],
    ['authority cross-use join', (copy: any) => {
      copy.mandateSnapshot.exposureOffsets[0].offsetAuthorityUseRef =
        copy.mandateSnapshot.exposureOffsets[0].authorityUseRef
      redigest(copy.mandateSnapshot.exposureOffsets[0])
    }],
    ['authority cross-mandate join', (copy: any) => {
      copy.mandateSnapshot.exposureOffsets[0].mandateRef = 'other'
      redigest(copy.mandateSnapshot.exposureOffsets[0])
    }],
    ['attestation evidence digest', (copy: any) => {
      copy.mandateSnapshot.exposureOffsets[0].releaseAttestation.material
        .cancellationEffect.evidenceDigest = `sha256:${'0'.repeat(64)}`
      redigest(copy.mandateSnapshot.exposureOffsets[0].releaseAttestation)
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
      copy.coldContinuation.effectsAfterReplay.operation += 1
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
      copy.coldContinuation.replayedOperation = copy.authoritativeResults.operation.result
    }],
    ['raw child phase artifact', (copy: any) => {
      copy.processColdProof.phaseArtifacts.cancellation.effectCounts.operation += 1
    }],
    ['raw child process linkage', (copy: any) => {
      copy.processColdProof.phaseArtifacts.replay.processId += 1
      copy.processColdProof.phaseArtifactDigests.replay = canonicalDigest(
        copy.processColdProof.phaseArtifacts.replay,
      )
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
