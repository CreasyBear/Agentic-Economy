import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from '../ae/lib/args'

import {
  evaluateSpendingPolicy,
  materialDigest,
  SpendingPolicyStore,
  verifiedGrantMatchesSpendingPolicy,
} from '../../src/modules/action-execution'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import {
  compareExactAmounts,
  type ExactAmount,
} from '../../src/modules/money/public'
import {
  developmentProviderToolObjectiveStateValid,
  runUnrestrictedTestOnlyDevelopmentObjective,
} from './fixtures/provider-tool/development-provider-tool-objective'
import {
  developmentCancellationConfirmationRule,
} from './fixtures/provider-tool/development-provider-tool-offset-rule'
import {
  cancelDevelopmentProviderToolAction,
  executeDevelopmentProviderToolAction,
} from './fixtures/provider-tool/development-provider-tool.actions'
import { createDevelopmentProviderToolSigningCustody } from './fixtures/provider-tool/development-provider-tool-signing-custody'
import {
  captureOfficialEvidenceProvenance,
  verifyOfficialEvidenceProvenance,
  type EvidenceProvenanceV1,
} from './evidence-provenance'

export const developmentEvidenceCustodyFixture = {
  keyId: 'mock:development-provider-tool-provider:release:v1',
  privateKey: '1111111111111111111111111111111111111111111111111111111111111111',
} as const
let processColdProofCache: Promise<Awaited<ReturnType<typeof runProcessColdProof>>> | undefined
const officialClaimCeiling =
  'Labelled local separate-process mock execution only; no independently operated provider, deployment, production safety, or customer value.'
function exactAud(units: string): ExactAmount {
  return { currency: 'AUD', units, exponent: 2 }
}

export type UnrestrictedTestOnlyEvidence = Awaited<ReturnType<typeof runUnrestrictedTestOnlyDevelopmentObjective>> & {
  gitRevision: string
  safetyEvals: Readonly<{
    revokeRace: string
    concurrencyExhaustion: string
    countExhaustion: string
    spendExhaustion: string
    lossExhaustion: string
    unknownHeldLoss: ExactAmount
  }>
  processColdProof: Awaited<ReturnType<typeof runProcessColdProof>>
}

export async function runUnrestrictedTestOnlyEvidence(): Promise<UnrestrictedTestOnlyEvidence> {
  const objective = await runUnrestrictedTestOnlyDevelopmentObjective(
    createDevelopmentProviderToolSigningCustody(developmentEvidenceCustodyFixture),
  )
  const freshSnapshot = {
    ...structuredClone(objective.spendingPolicySnapshot),
    uses: [],
    exposureOffsets: [],
  }
  const fresh = () => new SpendingPolicyStore(structuredClone(freshSnapshot))
  const spendingPolicy = freshSnapshot.mandates[0]!
  const material = (authorityUseRef: string, overrides: Record<string, unknown> = {}) => ({
    authorityUseRef,
    spendingPolicyRef: spendingPolicy.spendingPolicyRef,
    spendingPolicyVersion: spendingPolicy.version,
    spendingPolicyGeneration: spendingPolicy.generation,
    callerRef: spendingPolicy.callerRef,
    principalRef: spendingPolicy.principalRef,
    delegateRef: spendingPolicy.delegateRef,
    executionRef: `mock:invocation:${authorityUseRef}`,
    action: spendingPolicy.scope.actions![0]!,
    preparedMaterialDigest: `sha256:${authorityUseRef}`,
    providerRef: spendingPolicy.scope.providerRefs[0]!,
    recipientRef: spendingPolicy.scope.recipientRefs[0]!,
    purpose: 'create_development_effect',
    dataFields: ['customer.name'],
    reservedSpend: exactAud('0'),
    reservedLoss: exactAud('0'),
    fallbackRef: 'provider_a_primary',
    risk: spendingPolicy.scope.riskCeiling,
    effectGeneration: 1,
    policyDecisionRef: `mock:policy:${authorityUseRef}`,
    ...overrides,
  })
  const reserve = (store: SpendingPolicyStore, use: ReturnType<typeof material>) => {
    const decision = evaluateSpendingPolicy({
      spendingPolicy,
      policyDecisionRef: use.policyDecisionRef,
      uses: store.exportSnapshot().uses,
      proposal: {
        objectiveRef: 'mock:objective:safety-eval',
        objective: spendingPolicy.scope.objective,
        sourceOptionRef: `mock:option:${use.authorityUseRef}`,
        materialDigest: use.preparedMaterialDigest,
        authorityUseRef: use.authorityUseRef,
        executionRef: use.executionRef,
        action: use.action,
        providerRef: use.providerRef,
        recipientRef: use.recipientRef,
        purpose: use.purpose,
        dataFields: use.dataFields,
        spend: use.reservedSpend,
        worstCaseLoss: use.reservedLoss,
        fallbackRef: use.fallbackRef ?? 'none',
        risk: use.risk,
      },
    })
    if (decision.kind === 'refused') return decision
    const accepted = store.acceptPolicyDecision(decision.value)
    return accepted.kind === 'refused' ? accepted : store.reserve(use, developmentNow())
  }
  const revoked = fresh()
  const revokeMaterial = material('revoke')
  const revokePolicy = evaluateSpendingPolicy({
    spendingPolicy,
    policyDecisionRef: revokeMaterial.policyDecisionRef,
    uses: [],
    proposal: {
      objectiveRef: 'mock:objective:safety-eval',
      objective: spendingPolicy.scope.objective,
      sourceOptionRef: 'mock:option:revoke',
      materialDigest: revokeMaterial.preparedMaterialDigest,
      authorityUseRef: revokeMaterial.authorityUseRef,
      executionRef: revokeMaterial.executionRef,
      action: revokeMaterial.action,
      providerRef: revokeMaterial.providerRef,
      recipientRef: revokeMaterial.recipientRef,
      purpose: revokeMaterial.purpose,
      dataFields: revokeMaterial.dataFields,
      spend: revokeMaterial.reservedSpend,
      worstCaseLoss: revokeMaterial.reservedLoss,
      fallbackRef: revokeMaterial.fallbackRef ?? 'none',
      risk: revokeMaterial.risk,
    },
  })
  if (revokePolicy.kind === 'refused') throw new Error(revokePolicy.code)
  revoked.acceptPolicyDecision(revokePolicy.value)
  revoked.revoke({
    spendingPolicyRef: spendingPolicy.spendingPolicyRef,
    expectedGeneration: 1,
    reason: 'Development revoke race.',
    revokedAt: '2026-07-19T04:00:01.000Z',
  })
  const revokeRace = revoked.reserve(revokeMaterial, '2026-07-19T04:00:02.000Z')
  const concurrent = fresh()
  reserve(concurrent, material('concurrent:1'))
  reserve(concurrent, material('concurrent:2'))
  const concurrency = reserve(concurrent, material('concurrent:3'))
  const count = fresh()
  for (const id of ['1', '2', '3', '4']) {
    reserve(count, material(`count:${id}`))
    count.settle(`count:${id}`, 'released', developmentNow())
  }
  const countExhaustion = reserve(count, material('count:5'))
  const spend = fresh()
  reserve(spend, material('spend:1', {
    reservedSpend: exactAud('10000'),
  }))
  const spendExhaustion = reserve(spend, material('spend:2', {
    reservedSpend: exactAud('1'),
  }))
  const loss = fresh()
  reserve(loss, material('loss:1', {
    reservedLoss: exactAud('5000'),
  }))
  const lossExhaustion = reserve(loss, material('loss:2', {
    reservedLoss: exactAud('1'),
  }))
  loss.settle('loss:1', 'uncertain', developmentNow())
  const unknownHeldLoss = loss.capacity(spendingPolicy.spendingPolicyRef).worstCaseLoss
  if (unknownHeldLoss === undefined) throw new Error('full_yolo_unknown_loss_missing')
  return {
    ...objective,
    gitRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    safetyEvals: {
      revokeRace: refusal(revokeRace),
      concurrencyExhaustion: refusal(concurrency),
      countExhaustion: refusal(countExhaustion),
      spendExhaustion: refusal(spendExhaustion),
      lossExhaustion: refusal(lossExhaustion),
      unknownHeldLoss,
    },
    processColdProof: await (processColdProofCache ??= runProcessColdProof()),
  }
}

async function runProcessColdProof() {
  const directory = await mkdtemp(join(tmpdir(), 'ae-full-yolo-process-proof-'))
  const custodyPath = join(directory, 'development-custody.json')
  const operationPath = join(directory, 'operation.json')
  const resumePath = join(directory, 'resume.json')
  const replayPath = join(directory, 'replay.json')
  await writeFile(custodyPath, JSON.stringify(developmentEvidenceCustodyFixture), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
  const worker = resolve('tools/dev/full-yolo-process-worker.ts')
  const tsx = resolve('node_modules/.bin/tsx')
  execFileSync(tsx, [worker, 'operation', '-', operationPath, custodyPath], { stdio: 'pipe' })
  execFileSync(tsx, [worker, 'resume', operationPath, resumePath, custodyPath], { stdio: 'pipe' })
  execFileSync(tsx, [worker, 'replay', resumePath, replayPath, custodyPath], { stdio: 'pipe' })
  const operationRaw = await readFile(operationPath, 'utf8')
  const resumeRaw = await readFile(resumePath, 'utf8')
  const replayRaw = await readFile(replayPath, 'utf8')
  const operation = JSON.parse(operationRaw) as any
  const resume = JSON.parse(resumeRaw) as any
  const replay = JSON.parse(replayRaw) as any
  const serializedState = `${operationRaw}${resumeRaw}${replayRaw}`
  return {
    parentProcessId: process.pid,
    operationProcessId: operation.processId as number,
    cancellationProcessId: resume.processId as number,
    replayProcessId: replay.processId as number,
    phaseArtifactDigests: {
      operation: canonicalDigest(operation as never),
      cancellation: canonicalDigest(resume as never),
      replay: canonicalDigest(replay as never),
    },
    phaseArtifacts: {
      operation,
      cancellation: resume,
      replay,
    },
    custodyRef: 'development-custody.json',
    privateKeySerializedInState: serializedState.includes(
      developmentEvidenceCustodyFixture.privateKey,
    ),
    operationEffectCounts: {
      providerA: operation.providerAEffects as number,
      providerB: operation.midRun.providerSnapshot.effects as number,
      cancellation: operation.midRun.providerSnapshot.cancellationEffects as number,
    },
    cancellationEffectCounts: resume.effectCounts as Readonly<{ operation: number; cancellation: number }>,
    replayEffectCounts: replay.effectCounts as Readonly<{ operation: number; cancellation: number }>,
    midObjectiveDigest: operation.midRun.objectiveState.digest as string,
    finalObjectiveDigest: resume.objectiveState.digest as string,
    replayObjectiveDigest: replay.objectiveState.digest as string,
    cancellationReconstructedInvocationRefs:
      resume.reconstructedInvocationRefs as readonly string[],
    replayReconstructedInvocationRefs: replay.reconstructedInvocationRefs as readonly string[],
  }
}

export function verifyUnrestrictedTestOnlyEvidence(evidence: UnrestrictedTestOnlyEvidence) {
  const operation = evidence.authoritativeResults.operation
  const cancellation = evidence.authoritativeResults.cancellation
  const cancellationInput = cancellation.input as Readonly<{
    providerRef: string
    principalRef: string
  }>
  const processPids = [
    evidence.processColdProof.parentProcessId,
    evidence.processColdProof.operationProcessId,
    evidence.processColdProof.cancellationProcessId,
    evidence.processColdProof.replayProcessId,
  ]
  const phaseArtifacts = evidence.processColdProof.phaseArtifacts
  const authoritativeInvocationRefs = evidence.invocations.map(({ executionRef }) => executionRef)
  const cancellationArtifactInvocationRefs: readonly (string | undefined)[] =
    phaseArtifacts.cancellation.invocationRecords.map(
      ({ executionRef }: { executionRef?: string }) => executionRef,
    )
  if (
    canonicalDigest(phaseArtifacts.operation as never)
      !== evidence.processColdProof.phaseArtifactDigests.operation
    || canonicalDigest(phaseArtifacts.cancellation as never)
      !== evidence.processColdProof.phaseArtifactDigests.cancellation
    || canonicalDigest(phaseArtifacts.replay as never)
      !== evidence.processColdProof.phaseArtifactDigests.replay
    || phaseArtifacts.operation.processId !== evidence.processColdProof.operationProcessId
    || phaseArtifacts.cancellation.processId !== evidence.processColdProof.cancellationProcessId
    || phaseArtifacts.replay.processId !== evidence.processColdProof.replayProcessId
    || phaseArtifacts.operation.kind !== 'operation_phase_complete'
    || phaseArtifacts.cancellation.kind !== 'cancellation_resume_complete'
    || phaseArtifacts.replay.kind !== 'terminal_replay_complete'
    || phaseArtifacts.operation.midRun.objectiveState.digest
      !== evidence.processColdProof.midObjectiveDigest
    || phaseArtifacts.cancellation.objectiveState.digest
      !== evidence.processColdProof.finalObjectiveDigest
    || phaseArtifacts.replay.objectiveState.digest
      !== evidence.processColdProof.replayObjectiveDigest
    || phaseArtifacts.cancellation.midRun.objectiveState.digest
      !== phaseArtifacts.operation.midRun.objectiveState.digest
    || cancellationArtifactInvocationRefs.length !== authoritativeInvocationRefs.length
    || cancellationArtifactInvocationRefs.some((executionRef, index) =>
      executionRef !== authoritativeInvocationRefs[index])
    || phaseArtifacts.cancellation.reconstructedInvocationRefs.join(',')
      !== evidence.processColdProof.cancellationReconstructedInvocationRefs.join(',')
    || phaseArtifacts.replay.reconstructedInvocationRefs.join(',')
      !== evidence.processColdProof.replayReconstructedInvocationRefs.join(',')
  ) throw new Error('full_yolo_process_artifact_verification_refused')
  const providerFacts = evidence.spendingPolicySnapshot.exposureOffsets?.[0]
    ?.releaseAttestation.material
  const verifyOffset = (offset: NonNullable<typeof evidence.spendingPolicySnapshot.exposureOffsets>[number]) =>
    operation.result.kind === 'effect_confirmed'
    && cancellation.result.kind === 'effect_cancellation_confirmed'
    && operation.principalRef === cancellation.principalRef
    && operation.principalRef === offset.principalRef
    && operation.result.effectRef === offset.exposureSubjectRef
    && operation.result.effectRef === offset.exposureResultRef
    && operation.result.evidenceRef === offset.exposureEvidenceRef
    && operation.result.providerRef === offset.providerRef
    && cancellation.result.effectRef === operation.result.effectRef
    && cancellation.result.effectRef === offset.offsetSubjectRef
    && cancellation.result.cancellationRef === offset.offsetResultRef
    && cancellation.result.evidenceRef === offset.offsetEvidenceRef
    && cancellationInput.providerRef === operation.result.providerRef
    && cancellationInput.principalRef === operation.principalRef
  const store = new SpendingPolicyStore(structuredClone(evidence.spendingPolicySnapshot))
  const spendingPolicy = evidence.spendingPolicySnapshot.mandates[0]
  if (
    evidence.environment !== 'MOCK/DEVELOPMENT ONLY'
    || spendingPolicy?.mode !== 'unrestricted_test_only'
    || spendingPolicy.scope.actions?.length !== 2
    || spendingPolicy.scope.actions[0]?.id !== executeDevelopmentProviderToolAction.id
    || spendingPolicy.scope.actions[1]?.id !== cancelDevelopmentProviderToolAction.id
    || !verifiedGrantMatchesSpendingPolicy(evidence.grant, spendingPolicy, evidence.grant.verifiedAt)
    || evidence.policyDecisions.length !== 3
    || evidence.policyDecisions.map(({ fallbackOrdinal }) => fallbackOrdinal).join(',') !== '0,1,2'
    || compareExactAmounts(evidence.policyDecisions[0]?.proposedWorstCaseLoss, exactAud('0')) !== 0
    || compareExactAmounts(evidence.policyDecisions[1]?.proposedWorstCaseLoss, exactAud('5000')) !== 0
    || compareExactAmounts(evidence.policyDecisions[2]?.proposedWorstCaseLoss, exactAud('0')) !== 0
    || compareExactAmounts(evidence.policyDecisions[0]?.heldWorstCaseLoss, exactAud('0')) !== 0
    || compareExactAmounts(evidence.policyDecisions[1]?.heldWorstCaseLoss, exactAud('0')) !== 0
    || compareExactAmounts(evidence.policyDecisions[2]?.heldWorstCaseLoss, exactAud('5000')) !== 0
    || evidence.objectiveDecisionRecords.map(({ ordinal }) => ordinal).join(',') !== '0,1,2'
    || evidence.objectiveDecisionRecords[1]?.kind !== 'fallback_after_terms_refusal'
    || evidence.invocations.length !== 3
    || canonicalDigest(operation.result) !== operation.resultDigest
    || canonicalDigest(cancellation.result as never) !== cancellation.resultDigest
    || canonicalDigest(evidence.invocations[1]?.durable.source.result as never) !== operation.resultDigest
    || evidence.invocations[1]?.durable.source.resultIdentity?.sourceResultRef
      !== (operation.result.kind === 'effect_confirmed' ? operation.result.effectRef : '')
    || evidence.invocations[1]?.durable.source.resultIdentity?.resultDigest !== operation.resultDigest
    || canonicalDigest(evidence.invocations[2]?.durable.source.result as never) !== cancellation.resultDigest
    || evidence.invocations[2]?.durable.source.resultIdentity?.sourceResultRef
      !== (cancellation.result.kind === 'effect_cancellation_confirmed'
        ? cancellation.result.cancellationRef
        : '')
    || evidence.invocations[2]?.durable.source.resultIdentity?.resultDigest !== cancellation.resultDigest
    || !evidence.coldContinuation.noDuplicateEffect
    || evidence.coldContinuation.effectsBeforeReplay.operation
      !== evidence.coldContinuation.effectsAfterReplay.operation
    || evidence.coldContinuation.effectsBeforeReplay.cancellation
      !== evidence.coldContinuation.effectsAfterReplay.cancellation
    || evidence.coldContinuation.reconstructed.length !== 3
    || !developmentProviderToolObjectiveStateValid(evidence.coldContinuation.initialObjectiveState)
    || !developmentProviderToolObjectiveStateValid(evidence.coldContinuation.midRun.objectiveState)
    || !developmentProviderToolObjectiveStateValid(evidence.coldContinuation.finalObjectiveState)
    || !developmentProviderToolObjectiveStateValid(evidence.coldContinuation.replayedObjectiveState)
    || evidence.coldContinuation.initialObjectiveState.stage !== 'attempt_primary'
    || evidence.coldContinuation.initialObjectiveState.currentActionRef
      !== executeDevelopmentProviderToolAction.id
    || evidence.coldContinuation.midRun.objectiveState.stage !== 'operation_confirmed'
    || evidence.coldContinuation.midRun.objectiveState.currentActionRef
      !== cancelDevelopmentProviderToolAction.id
    || evidence.coldContinuation.midRun.objectiveState.operationResultRef
      !== (operation.result.kind === 'effect_confirmed' ? operation.result.effectRef : '')
    || evidence.coldContinuation.finalObjectiveState.stage !== 'completed'
    || evidence.coldContinuation.finalObjectiveState.currentActionRef !== 'none'
    || evidence.coldContinuation.finalObjectiveState.cancellationResultRef
      !== (cancellation.result.kind === 'effect_cancellation_confirmed'
        ? cancellation.result.cancellationRef
        : '')
    || evidence.coldContinuation.finalObjectiveState.digest
      !== evidence.coldContinuation.replayedObjectiveState.digest
    || evidence.coldContinuation.finalObjectiveState.completedInvocationRefs.join(',')
      !== evidence.invocations.map(({ executionRef }) => executionRef).join(',')
    || evidence.coldContinuation.finalObjectiveState.policyDecisionRefs.join(',')
      !== evidence.policyDecisions.map(({ policyDecisionRef }) => policyDecisionRef).join(',')
    || evidence.coldContinuation.midRun.objectiveState.fallbackProgress.attemptedProviderRefs.join(',')
      !== evidence.objectiveDecisionRecords.slice(0, 2).map(({ providerRef }) => providerRef).join(',')
    || new Set(evidence.coldContinuation.freshObjectGraphRefs).size !== 2
    || evidence.coldContinuation.resumeReconstructedInvocationRefs.join(',')
      !== evidence.invocations.slice(0, 2).map(({ executionRef }) => executionRef).join(',')
    || evidence.coldContinuation.replayReconstructedInvocationRefs.join(',')
      !== evidence.invocations.map(({ executionRef }) => executionRef).join(',')
    || evidence.coldContinuation.continuationKind !== 'source_owned_objective_resume'
    || 'replayedOperation' in evidence.coldContinuation
    || 'replayedCancellation' in evidence.coldContinuation
    || evidence.coldContinuation.midRun.spendingPolicySnapshot.uses.length !== 2
    || evidence.coldContinuation.midRun.spendingPolicySnapshot.policyDecisions?.length !== 2
    || evidence.coldContinuation.midRun.providerSnapshot.effects !== 1
    || evidence.coldContinuation.midRun.providerSnapshot.cancellationEffects !== 0
    || evidence.coldContinuation.midRun.durableInvocations.length !== 2
    || evidence.providerEffects.providerA !== 1
    || evidence.providerEffects.providerB !== 1
    || evidence.providerEffects.cancellation !== 1
    || evidence.comparison.unrestrictedTestOnlyPrincipalGrantDecisions !== 1
    || evidence.comparison.repeatedPrincipalDecisions !== 0
    || evidence.comparison.retainedExactAuthorityUses !== 3
    || compareExactAmounts(evidence.capacityAfterCancellation.worstCaseLoss, exactAud('0')) !== 0
    || evidence.spendingPolicySnapshot.exposureOffsets?.[0]?.evidenceRuleRef
      !== developmentCancellationConfirmationRule.evidenceRuleRef
    || evidence.spendingPolicySnapshot.exposureOffsets?.[0]?.evidenceRuleSource
      !== developmentCancellationConfirmationRule.source
    || evidence.spendingPolicySnapshot.exposureOffsets?.[0]?.evidenceRuleVersion
      !== developmentCancellationConfirmationRule.version
    || cancellation.result.kind !== 'effect_cancellation_confirmed'
    || cancellation.result.exposureReleaseAttestation === undefined
    || canonicalDigest(cancellation.result.exposureReleaseAttestation as never)
      !== canonicalDigest(evidence.spendingPolicySnapshot.exposureOffsets?.[0]?.releaseAttestation as never)
    || spendingPolicy.scope.exposureOffsetVerificationKeys?.length !== 1
    || providerFacts === undefined
    || 'mandateRef' in providerFacts
    || 'principalRef' in providerFacts
    || 'originalAuthorityUseRef' in providerFacts
    || 'cancellationAuthorityUseRef' in providerFacts
    || evidence.spendingPolicySnapshot.exposureOffsets?.[0]?.offsetAction.id
      !== cancelDevelopmentProviderToolAction.id
    || evidence.safetyEvals.revokeRace !== 'spending_policy_revoked'
    || evidence.safetyEvals.concurrencyExhaustion !== 'spending_policy_concurrency_exhausted'
    || evidence.safetyEvals.countExhaustion !== 'spending_policy_count_exhausted'
    || evidence.safetyEvals.spendExhaustion !== 'spending_policy_spend_exceeded'
    || evidence.safetyEvals.lossExhaustion !== 'spending_policy_risk_exceeded'
    || compareExactAmounts(evidence.safetyEvals.unknownHeldLoss, exactAud('5000')) !== 0
    || new Set(processPids).size !== processPids.length
    || evidence.processColdProof.privateKeySerializedInState
    || evidence.processColdProof.operationEffectCounts.providerA !== 1
    || evidence.processColdProof.operationEffectCounts.providerB !== 1
    || evidence.processColdProof.operationEffectCounts.cancellation !== 0
    || evidence.processColdProof.cancellationEffectCounts.operation !== 1
    || evidence.processColdProof.cancellationEffectCounts.cancellation !== 1
    || evidence.processColdProof.replayEffectCounts.operation !== 1
    || evidence.processColdProof.replayEffectCounts.cancellation !== 1
    || evidence.processColdProof.finalObjectiveDigest
      !== evidence.processColdProof.replayObjectiveDigest
    || evidence.processColdProof.midObjectiveDigest
      === evidence.processColdProof.finalObjectiveDigest
    || evidence.processColdProof.cancellationReconstructedInvocationRefs.length !== 2
    || evidence.processColdProof.replayReconstructedInvocationRefs.length !== 3
  ) throw new Error('full_yolo_semantic_verification_refused')
  const useRefs = new Set<string>()
  for (const [index, invocation] of evidence.invocations.entries()) {
    const basis = invocation.acceptedAuthority
    const use = basis?.kind === 'spending_policy_use'
      ? store.inspectUse(basis.authorityUseRef)
      : undefined
    const spendingPolicyIndex = invocation.events.findIndex((event: { kind: string }) =>
      event.kind === 'spending_policy_authorization')
    const releaseIndex = invocation.events.findIndex((event: { kind: string }) =>
      event.kind === 'provider_release')
    if (
      use === undefined
      || useRefs.has(use.authorityUseRef)
      || use.executionRef !== invocation.executionRef
      || use.action.id !== invocation.action.id
      || use.action.version !== invocation.action.contractVersion
      || spendingPolicyIndex < 0
      || releaseIndex <= spendingPolicyIndex
      || evidence.policyDecisions[index]?.proposal.action.id !== invocation.action.id
      || evidence.policyDecisions[index]?.proposal.authorityUseRef !== use.authorityUseRef
      || evidence.policyDecisions[index]?.proposal.executionRef !== invocation.executionRef
      || evidence.policyDecisions[index]?.proposal.materialDigest !== use.preparedMaterialDigest
      || use.policyDecisionRef !== evidence.policyDecisions[index]?.policyDecisionRef
      || evidence.coldContinuation.reconstructed[index]?.executionRef !== invocation.executionRef
      || evidence.coldContinuation.reconstructed[index]?.authorityUseRef !== use.authorityUseRef
    ) throw new Error('full_yolo_action_use_linkage_refused')
    useRefs.add(use.authorityUseRef)
  }
  const prefixUses: Array<(typeof evidence.spendingPolicySnapshot.uses)[number]> = []
  for (const [index, decision] of evidence.policyDecisions.entries()) {
    const sourceInput = evidence.invocations[index]?.durable.source.input as any
    const expectedAction = index < 2
      ? executeDevelopmentProviderToolAction
      : cancelDevelopmentProviderToolAction
    const expectedSourceOptionRef = index < 2
      ? sourceInput?.slot?.provenance?.observationRef
      : operation.result.kind === 'effect_confirmed'
        ? operation.result.evidenceRef
        : undefined
    if (
      decision.proposal.sourceOptionRef !== expectedSourceOptionRef
      || decision.proposal.materialDigest !== materialDigest(
        sourceInput,
        expectedAction.invocationContract!.materialInputPaths,
      )
      || decision.proposal.providerRef !== (
        index < 2 ? sourceInput?.slot?.providerRef : sourceInput?.providerRef
      )
      || decision.proposal.recipientRef !== (
        index < 2 ? sourceInput?.disclosure?.recipient : sourceInput?.providerRef
      )
      || decision.proposal.purpose !== (
        index < 2 ? sourceInput?.disclosure?.purpose : 'cancel_development_effect'
      )
    ) throw new Error('full_yolo_policy_source_linkage_refused')
    const recomputed = evaluateSpendingPolicy({
      spendingPolicy: spendingPolicy!,
      proposal: decision.proposal,
      uses: prefixUses,
      policyDecisionRef: decision.policyDecisionRef,
    })
    if (recomputed.kind === 'refused' || recomputed.value.digest !== decision.digest) {
      throw new Error('full_yolo_policy_reconstruction_refused')
    }
    const use = evidence.spendingPolicySnapshot.uses.find(({ authorityUseRef }) =>
      authorityUseRef === decision.proposal.authorityUseRef)
    if (use === undefined) throw new Error('full_yolo_policy_use_missing')
    prefixUses.push(use)
  }
  const offset = evidence.spendingPolicySnapshot.exposureOffsets?.[0]
  if (
    offset === undefined
    || !verifyOffset(offset)
    || offset.authorityUseRef !== evidence.policyDecisions[1]?.proposal.authorityUseRef
    || offset.offsetAuthorityUseRef !== evidence.policyDecisions[2]?.proposal.authorityUseRef
  ) throw new Error('full_yolo_causal_offset_refused')
  new SpendingPolicyStore(structuredClone(evidence.coldContinuation.midRun.spendingPolicySnapshot))
  return {
    verdict: 'PASS_FOR_DECLARED_CLASS' as const,
    gitRevision: evidence.gitRevision,
    checksum: checksum(evidence),
    authorityUseCount: useRefs.size,
  }
}

function refusal(result: Readonly<{ kind: string; code?: string }>) {
  return result.kind === 'refused' ? result.code ?? 'unknown_refusal' : 'not_refused'
}

function developmentNow() {
  return '2026-07-19T04:00:00.000Z'
}

function checksum(evidence: UnrestrictedTestOnlyEvidence) {
  return `sha256:${createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`
}

type Packet = Readonly<{
  schema: 'ae.full-yolo-development-evidence:v2'
  checksum: string
  provenance: EvidenceProvenanceV1
  evidence: UnrestrictedTestOnlyEvidence
}>

function commandIdentity(command: 'run' | 'verify', path: string, revision: string) {
  return `full-yolo-evidence-packet ${command} ${path} ${revision}`
}

export async function runCli(command: string, path: string, expectedRevision: string) {
  if (command === 'run') {
    const provenance = captureOfficialEvidenceProvenance({
      expectedRevision,
      command: commandIdentity('run', path, expectedRevision),
      claimCeiling: officialClaimCeiling,
    })
    const evidence = {
      ...(await runUnrestrictedTestOnlyEvidence()),
      gitRevision: provenance.sourceRevision,
    }
    verifyUnrestrictedTestOnlyEvidence(evidence)
    const packet: Packet = {
      schema: 'ae.full-yolo-development-evidence:v2',
      checksum: checksum(evidence),
      provenance,
      evidence,
    }
    await writeFile(path, `${JSON.stringify(packet, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    return packet
  }
  if (command === 'verify') {
    const packet = JSON.parse(await readFile(path, 'utf8')) as Packet
    if (
      packet.schema !== 'ae.full-yolo-development-evidence:v2'
      || packet.checksum !== checksum(packet.evidence)
    ) throw new Error('full_yolo_packet_checksum_refused')
    verifyOfficialEvidenceProvenance(packet.provenance, {
      expectedRevision,
      command: commandIdentity('run', path, expectedRevision),
    })
    if (packet.evidence.gitRevision !== packet.provenance.sourceRevision) {
      throw new Error('full_yolo_packet_revision_refused')
    }
    if (
      packet.provenance.claimCeiling !== officialClaimCeiling
      || packet.evidence.claimCeiling !==
        'Labelled local deterministic development behavior only; no reachable host, live provider, durable multi-worker CAS, deployment, production safety, or customer value.'
    ) throw new Error('full_yolo_packet_claim_ceiling_refused')
    verifyUnrestrictedTestOnlyEvidence(packet.evidence)
    return packet
  }
  throw new Error('usage: evidence:unrestricted-test-only:development -- <run|verify> <path>')
}

if (process.argv[1]?.endsWith('unrestricted-test-only-evidence-packet.ts')) {
  const { command, positionals } = parseArgs(process.argv.slice(2))
  const [path, expectedRevision] = positionals
  if (command === undefined || path === undefined || expectedRevision === undefined) {
    throw new Error('command_path_and_revision_required')
  }
  const packet = await runCli(command, path, expectedRevision)
  process.stdout.write(`${packet.checksum}\n${packet.evidence.gitRevision}\n`)
}
