import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import * as actionExecutionPublic from '@/modules/action-execution'
import {
  evaluateSpendingPolicy,
  SpendingPolicyStore,
} from '@/modules/action-execution'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  runUnrestrictedTestOnlyEvidence,
  verifyUnrestrictedTestOnlyEvidence,
} from '../../../tools/dev/unrestricted-test-only-evidence-packet'
import * as developmentProviderToolProviderSource from '../../../tools/dev/fixtures/provider-tool/development-provider-tool-provider'
import { createDevelopmentProviderToolProvider } from '../../../tools/dev/fixtures/provider-tool/development-provider-tool-provider'
import { resumeDevelopmentProviderToolObjective } from '../../../tools/dev/fixtures/provider-tool/development-provider-tool-objective'
import { createDevelopmentProviderToolSigningCustody } from '../../../tools/dev/fixtures/provider-tool/development-provider-tool-signing-custody'

describe('unrestricted_test_only authority mode', () => {
  it('requires command, packet path, and revision when invoked as the package CLI', () => {
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      resolve('tools/dev/unrestricted-test-only-evidence-packet.ts'),
    ], { encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toContain('command_path_and_revision_required')
  })

  it('executes fallback and cancellation through three exact spending-policy uses', async () => {
    const evidence = await runUnrestrictedTestOnlyEvidence()
    expect(verifyUnrestrictedTestOnlyEvidence(evidence)).toMatchObject({
      verdict: 'PASS_FOR_DECLARED_CLASS',
      authorityUseCount: 3,
    })
    expect(evidence.comparison).toEqual({
      approveEachPrincipalDecisions: 3,
      spendingPolicyStopsAtDifferentAction: true,
      unrestrictedTestOnlyPrincipalGrantDecisions: 1,
      repeatedPrincipalDecisions: 0,
      retainedExactAuthorityUses: 3,
    })
  }, 15_000)

  it('steps up on action, provider, recipient, purpose, data, currency, fallback, risk and loss widening', async () => {
    const evidence = await runUnrestrictedTestOnlyEvidence()
    const spendingPolicy = evidence.spendingPolicySnapshot.mandates[0]!
    const base = {
      objectiveRef: 'mock:objective:test',
      objective: spendingPolicy.scope.objective,
      sourceOptionRef: 'mock:option:test',
      materialDigest: 'sha256:test',
      authorityUseRef: 'mock:use:test',
      executionRef: 'mock:invocation:test',
      action: spendingPolicy.scope.actions![0]!,
      providerRef: spendingPolicy.scope.providerRefs[0]!,
      recipientRef: spendingPolicy.scope.recipientRefs[0]!,
      purpose: spendingPolicy.scope.purposes[0]!,
      dataFields: ['customer.name'],
      spend: { currency: 'AUD', units: '0', exponent: 2 },
      worstCaseLoss: { currency: 'AUD', units: '0', exponent: 2 },
      fallbackRef: spendingPolicy.scope.permittedFallbacks[0]!,
      risk: spendingPolicy.scope.riskCeiling,
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
      expect(evaluateSpendingPolicy({
        spendingPolicy,
        proposal: { ...base, ...variant },
        uses: [],
        policyDecisionRef: 'mock:policy:test',
      }).kind).toBe('refused')
    }
  })

  it('holds uncertain/released exposure and offsets only provider-confirmed cancellation evidence', async () => {
    const evidence = await runUnrestrictedTestOnlyEvidence()
    const snapshot = structuredClone(evidence.spendingPolicySnapshot)
    ;(snapshot as any).exposureOffsets = []
    const store = new SpendingPolicyStore(snapshot)
    expect(store.capacity(snapshot.mandates[0]!.spendingPolicyRef).worstCaseLoss).toEqual({
      currency: 'AUD',
      units: '5000',
      exponent: 2,
    })
    const { digest: _digest, ...offset } = evidence.spendingPolicySnapshot.exposureOffsets![0]!
    expect((store.recordExposureOffset as any)({
      ...offset,
      offsetAuthorityUseRef: 'mock:authority-use:full-yolo:a',
    }, () => true)).toEqual({ kind: 'refused', code: 'authority_use_linkage_invalid' })
  })

  it('selects only the exact spending-policy-allowed registered offset rule', async () => {
    const evidence = await runUnrestrictedTestOnlyEvidence()
    const snapshot = structuredClone(evidence.spendingPolicySnapshot)
    ;(snapshot as any).exposureOffsets = []
    const { digest: _digest, ...offset } = evidence.spendingPolicySnapshot.exposureOffsets![0]!
    const store = new SpendingPolicyStore(snapshot)
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
    const evidence = await runUnrestrictedTestOnlyEvidence()
    expect(() => new SpendingPolicyStore(structuredClone(evidence.spendingPolicySnapshot))).not.toThrow()
    for (const state of ['uncertain', 'not_released']) {
      const notReleased = structuredClone(evidence.spendingPolicySnapshot)
      const original = (notReleased.uses as any[]).find(({ authorityUseRef }) =>
        authorityUseRef === notReleased.exposureOffsets![0]!.authorityUseRef)
      original.state = state
      redigest(original)
      expect(() => new SpendingPolicyStore(notReleased))
        .toThrow('spending_policy_snapshot_exposure_offset_refused')
    }
  })

  it('rejects exact-identity forged attestations in live and cold paths', async () => {
    expect(actionExecutionPublic).not.toHaveProperty('ExposureOffsetRuleRegistry')
    expect(actionExecutionPublic).not.toHaveProperty('sealSourceOwnedExposureOffsetRules')
    const evidence = await runUnrestrictedTestOnlyEvidence()
    const withoutOffset = structuredClone(evidence.spendingPolicySnapshot)
    ;(withoutOffset as any).exposureOffsets = []
    const forged = structuredClone(evidence.spendingPolicySnapshot.exposureOffsets![0]!)
    ;(forged.releaseAttestation.signature as any).signature = `ed25519:${'0'.repeat(128)}`
    redigest(forged)
    const { digest: _digest, ...forgedMaterial } = forged
    const live = new SpendingPolicyStore(withoutOffset)
    expect(live.recordExposureOffset(forgedMaterial)).toEqual({
      kind: 'refused',
      code: 'authority_use_linkage_invalid',
    })
    const cold = structuredClone(evidence.spendingPolicySnapshot)
    ;(cold as any).exposureOffsets = [forged]
    expect(() => new SpendingPolicyStore(cold))
      .toThrow('spending_policy_snapshot_exposure_offset_refused')
  })

  it('provider signing ignores caller-authored authority claims and refuses invented state', async () => {
    expect(developmentProviderToolProviderSource).not.toHaveProperty('developmentProviderSigningKey')
    expect(developmentProviderToolProviderSource).not.toHaveProperty('issueExposureReleaseAttestation')
    const evidence = await runUnrestrictedTestOnlyEvidence()
    const provider = createDevelopmentProviderToolProvider({
      ...evidence.coldContinuation.providerSnapshot.options,
      snapshot: evidence.coldContinuation.providerSnapshot,
    })
    const maliciousAuthorityClaims = {
      spendingPolicyRef: 'other',
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
    expect(replayed.exposureReleaseAttestation?.material).not.toHaveProperty('spendingPolicyRef')
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
    const evidence = await runUnrestrictedTestOnlyEvidence()
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
    expect(evidence.processColdProof.phaseArtifacts.cancellation.invocationRecords[2]?.executionRef)
      .toBe(evidence.invocations[2]?.executionRef)
  })

  it('rejects a cancellation artifact missing its execution identity after phase redigest', async () => {
    const evidence = structuredClone(await runUnrestrictedTestOnlyEvidence())
    delete (evidence.processColdProof.phaseArtifacts.cancellation.invocationRecords[2] as any).executionRef
    evidence.processColdProof.phaseArtifactDigests.cancellation = canonicalDigest(
      evidence.processColdProof.phaseArtifacts.cancellation as never,
    )
    expect(() => verifyUnrestrictedTestOnlyEvidence(evidence))
      .toThrow('full_yolo_process_artifact_verification_refused')
  })

  it('refuses cancellation continuation under the wrong custody key', async () => {
    const evidence = await runUnrestrictedTestOnlyEvidence()
    await expect(resumeDevelopmentProviderToolObjective({
      processRef: 'wrong-custody-test',
      spendingPolicy: evidence.spendingPolicySnapshot.mandates[0]!,
      spendingPolicySnapshot: evidence.coldContinuation.midRun.spendingPolicySnapshot,
      providerSnapshot: evidence.coldContinuation.midRun.providerSnapshot,
      objectiveState: evidence.coldContinuation.midRun.objectiveState,
      durableInvocations: evidence.coldContinuation.midRun.durableInvocations,
      signingCustody: createDevelopmentProviderToolSigningCustody({
        keyId: 'mock:development-provider-operation-provider:release:v1',
        privateKey: '2222222222222222222222222222222222222222222222222222222222222222',
      }),
    })).rejects.toThrow('authority_use_linkage_invalid')
  })

  it.each([
    ['mode', (copy: any) => { copy.spendingPolicySnapshot.mandates[0].mode = 'spending_policy' }],
    ['action scope', (copy: any) => { copy.spendingPolicySnapshot.mandates[0].scope.actions[1].id = 'other' }],
    ['policy', (copy: any) => { copy.policyDecisions[1].fallbackOrdinal = 0 }],
    ['fallback order', (copy: any) => { copy.objectiveDecisionRecords.reverse() }],
    ['loss', (copy: any) => { copy.capacityAfterCancellation.worstCaseLoss = { currency: 'AUD', units: '5000', exponent: 2 } }],
    ['action-use linkage', (copy: any) => { copy.invocations[1].acceptedAuthority.authorityUseRef = 'other' }],
    ['evidence', (copy: any) => { copy.spendingPolicySnapshot.exposureOffsets[0].evidenceRef = 'other' }],
    ['event order', (copy: any) => { copy.invocations[0].events.reverse() }],
    ['causal effect', (copy: any) => {
      copy.spendingPolicySnapshot.exposureOffsets[0].exposureSubjectRef = 'other'
      redigest(copy.spendingPolicySnapshot.exposureOffsets[0])
    }],
    ['causal provider', (copy: any) => {
      copy.spendingPolicySnapshot.exposureOffsets[0].providerRef = 'other'
      redigest(copy.spendingPolicySnapshot.exposureOffsets[0])
    }],
    ['causal principal', (copy: any) => {
      copy.spendingPolicySnapshot.exposureOffsets[0].principalRef = 'other'
      redigest(copy.spendingPolicySnapshot.exposureOffsets[0])
    }],
    ['causal evidence', (copy: any) => {
      copy.spendingPolicySnapshot.exposureOffsets[0].offsetEvidenceRef = 'other'
      redigest(copy.spendingPolicySnapshot.exposureOffsets[0])
    }],
    ['offset rule source', (copy: any) => {
      copy.spendingPolicySnapshot.exposureOffsets[0].evidenceRuleSource = 'other'
      redigest(copy.spendingPolicySnapshot.exposureOffsets[0])
    }],
    ['offset rule version', (copy: any) => {
      copy.spendingPolicySnapshot.exposureOffsets[0].evidenceRuleVersion = 'v2'
      redigest(copy.spendingPolicySnapshot.exposureOffsets[0])
    }],
    ['causal use', (copy: any) => {
      copy.spendingPolicySnapshot.exposureOffsets[0].offsetAuthorityUseRef =
        copy.spendingPolicySnapshot.exposureOffsets[0].authorityUseRef
      redigest(copy.spendingPolicySnapshot.exposureOffsets[0])
    }],
    ['attestation payload', (copy: any) => {
      copy.spendingPolicySnapshot.exposureOffsets[0].releaseAttestation.material.providerRef = 'other'
      redigest(copy.spendingPolicySnapshot.exposureOffsets[0].releaseAttestation)
      redigest(copy.spendingPolicySnapshot.exposureOffsets[0])
    }],
    ['attestation signature', (copy: any) => {
      copy.spendingPolicySnapshot.exposureOffsets[0].releaseAttestation.signature.signature =
        `ed25519:${'0'.repeat(128)}`
      redigest(copy.spendingPolicySnapshot.exposureOffsets[0])
    }],
    ['authority cross-use join', (copy: any) => {
      copy.spendingPolicySnapshot.exposureOffsets[0].offsetAuthorityUseRef =
        copy.spendingPolicySnapshot.exposureOffsets[0].authorityUseRef
      redigest(copy.spendingPolicySnapshot.exposureOffsets[0])
    }],
    ['authority cross-spending-policy join', (copy: any) => {
      copy.spendingPolicySnapshot.exposureOffsets[0].spendingPolicyRef = 'other'
      redigest(copy.spendingPolicySnapshot.exposureOffsets[0])
    }],
    ['attestation evidence digest', (copy: any) => {
      copy.spendingPolicySnapshot.exposureOffsets[0].releaseAttestation.material
        .cancellationEffect.evidenceDigest = `sha256:${'0'.repeat(64)}`
      redigest(copy.spendingPolicySnapshot.exposureOffsets[0].releaseAttestation)
      redigest(copy.spendingPolicySnapshot.exposureOffsets[0])
    }],
    ['offset reuse', (copy: any) => {
      copy.spendingPolicySnapshot.exposureOffsets.push(structuredClone(copy.spendingPolicySnapshot.exposureOffsets[0]))
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
    const evidence = structuredClone(await runUnrestrictedTestOnlyEvidence())
    mutate(evidence)
    expect(createHash('sha256').update(JSON.stringify(evidence)).digest('hex')).toHaveLength(64)
    expect(() => verifyUnrestrictedTestOnlyEvidence(evidence)).toThrow()
  })
})

function redigest(record: Record<string, unknown>) {
  const { digest: _digest, ...material } = record
  record.digest = canonicalDigest(historicalDigestMaterial(material) as never)
}

function historicalDigestMaterial(material: Record<string, unknown>): Record<string, unknown> {
  const {
    executionRef,
    spendingPolicyRef,
    spendingPolicyVersion,
    spendingPolicyGeneration,
    proposal,
    ...unchangedFields
  } = material
  return {
    ...unchangedFields,
    ...(spendingPolicyRef === undefined ? {} : {
      mandateRef: spendingPolicyRef,
      mandateVersion: spendingPolicyVersion,
      mandateGeneration: spendingPolicyGeneration,
    }),
    ...(executionRef === undefined ? {} : { invocationRef: executionRef }),
    ...(proposal === undefined ? {} : {
      proposal: historicalDigestMaterial(proposal as Record<string, unknown>),
    }),
  }
}
