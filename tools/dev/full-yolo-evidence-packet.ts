import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  evaluateStandingMandatePolicy,
  materialDigest,
  StandingMandateStore,
  verifiedGrantMatchesMandate,
} from '../../src/modules/action-invocation'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import {
  developmentBookingObjectiveStateValid,
  runFullYoloDevelopmentObjective,
} from '../../src/modules/booking/development-booking-objective'
import {
  developmentCancellationConfirmationRule,
} from '../../src/modules/booking/development-booking-offset-rule'
import {
  cancelDevelopmentReservationAction,
  createDevelopmentReservationAction,
} from '../../src/modules/booking/development-booking.actions'
import { createDevelopmentBookingSigningCustody } from '../../src/modules/booking/development-booking-signing-custody'

export const developmentEvidenceCustodyFixture = {
  keyId: 'mock:development-booking-provider:release:v1',
  privateKey: '1111111111111111111111111111111111111111111111111111111111111111',
} as const
let processColdProofCache: Promise<Awaited<ReturnType<typeof runProcessColdProof>>> | undefined

export type FullYoloEvidence = Awaited<ReturnType<typeof runFullYoloDevelopmentObjective>> & {
  gitRevision: string
  safetyEvals: Readonly<{
    revokeRace: string
    concurrencyExhaustion: string
    countExhaustion: string
    spendExhaustion: string
    lossExhaustion: string
    unknownHeldLossMinor: number
  }>
  processColdProof: Awaited<ReturnType<typeof runProcessColdProof>>
}

export async function runFullYoloEvidence(): Promise<FullYoloEvidence> {
  const objective = await runFullYoloDevelopmentObjective(
    createDevelopmentBookingSigningCustody(developmentEvidenceCustodyFixture),
  )
  const freshSnapshot = {
    ...structuredClone(objective.mandateSnapshot),
    uses: [],
    exposureOffsets: [],
  }
  const fresh = () => new StandingMandateStore(structuredClone(freshSnapshot))
  const mandate = freshSnapshot.mandates[0]!
  const material = (authorityUseRef: string, overrides: Record<string, unknown> = {}) => ({
    authorityUseRef,
    mandateRef: mandate.mandateRef,
    mandateVersion: mandate.version,
    mandateGeneration: mandate.generation,
    callerRef: mandate.callerRef,
    principalRef: mandate.principalRef,
    delegateRef: mandate.delegateRef,
    invocationRef: `mock:invocation:${authorityUseRef}`,
    action: mandate.scope.actions![0]!,
    preparedMaterialDigest: `sha256:${authorityUseRef}`,
    providerRef: mandate.scope.providerRefs[0]!,
    recipientRef: mandate.scope.recipientRefs[0]!,
    purpose: 'create_development_reservation',
    dataFields: ['customer.name'],
    reservedSpend: { amountMinor: 0, currency: 'AUD' },
    reservedLoss: { amountMinor: 0, currency: 'AUD' },
    fallbackRef: 'provider_a_primary',
    risk: mandate.scope.riskCeiling,
    effectGeneration: 1,
    policyDecisionRef: `mock:policy:${authorityUseRef}`,
    ...overrides,
  })
  const reserve = (store: StandingMandateStore, use: ReturnType<typeof material>) => {
    const decision = evaluateStandingMandatePolicy({
      mandate,
      policyDecisionRef: use.policyDecisionRef,
      uses: store.exportSnapshot().uses,
      proposal: {
        objectiveRef: 'mock:objective:safety-eval',
        objective: mandate.scope.objective,
        sourceOptionRef: `mock:option:${use.authorityUseRef}`,
        materialDigest: use.preparedMaterialDigest,
        authorityUseRef: use.authorityUseRef,
        invocationRef: use.invocationRef,
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
  const revokePolicy = evaluateStandingMandatePolicy({
    mandate,
    policyDecisionRef: revokeMaterial.policyDecisionRef,
    uses: [],
    proposal: {
      objectiveRef: 'mock:objective:safety-eval',
      objective: mandate.scope.objective,
      sourceOptionRef: 'mock:option:revoke',
      materialDigest: revokeMaterial.preparedMaterialDigest,
      authorityUseRef: revokeMaterial.authorityUseRef,
      invocationRef: revokeMaterial.invocationRef,
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
    mandateRef: mandate.mandateRef,
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
    reservedSpend: { amountMinor: 10_000, currency: 'AUD' },
  }))
  const spendExhaustion = reserve(spend, material('spend:2', {
    reservedSpend: { amountMinor: 1, currency: 'AUD' },
  }))
  const loss = fresh()
  reserve(loss, material('loss:1', {
    reservedLoss: { amountMinor: 5_000, currency: 'AUD' },
  }))
  const lossExhaustion = reserve(loss, material('loss:2', {
    reservedLoss: { amountMinor: 1, currency: 'AUD' },
  }))
  loss.settle('loss:1', 'uncertain', developmentNow())
  return {
    ...objective,
    gitRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    safetyEvals: {
      revokeRace: refusal(revokeRace),
      concurrencyExhaustion: refusal(concurrency),
      countExhaustion: refusal(countExhaustion),
      spendExhaustion: refusal(spendExhaustion),
      lossExhaustion: refusal(lossExhaustion),
      unknownHeldLossMinor: loss.capacity(mandate.mandateRef).worstCaseLossMinor,
    },
    processColdProof: await (processColdProofCache ??= runProcessColdProof()),
  }
}

async function runProcessColdProof() {
  const directory = await mkdtemp(join(tmpdir(), 'ae-full-yolo-process-proof-'))
  const custodyPath = join(directory, 'development-custody.json')
  const bookingPath = join(directory, 'booking.json')
  const resumePath = join(directory, 'resume.json')
  const replayPath = join(directory, 'replay.json')
  await writeFile(custodyPath, JSON.stringify(developmentEvidenceCustodyFixture), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
  const worker = resolve('tools/dev/full-yolo-process-worker.ts')
  const tsx = resolve('node_modules/.bin/tsx')
  execFileSync(tsx, [worker, 'booking', '-', bookingPath, custodyPath], { stdio: 'pipe' })
  execFileSync(tsx, [worker, 'resume', bookingPath, resumePath, custodyPath], { stdio: 'pipe' })
  execFileSync(tsx, [worker, 'replay', resumePath, replayPath, custodyPath], { stdio: 'pipe' })
  const bookingRaw = await readFile(bookingPath, 'utf8')
  const resumeRaw = await readFile(resumePath, 'utf8')
  const replayRaw = await readFile(replayPath, 'utf8')
  const booking = JSON.parse(bookingRaw) as any
  const resume = JSON.parse(resumeRaw) as any
  const replay = JSON.parse(replayRaw) as any
  const serializedState = `${bookingRaw}${resumeRaw}${replayRaw}`
  return {
    parentProcessId: process.pid,
    bookingProcessId: booking.processId as number,
    cancellationProcessId: resume.processId as number,
    replayProcessId: replay.processId as number,
    phaseArtifactDigests: {
      booking: canonicalDigest(booking as never),
      cancellation: canonicalDigest(resume as never),
      replay: canonicalDigest(replay as never),
    },
    custodyRef: 'development-custody.json',
    privateKeySerializedInState: serializedState.includes(
      developmentEvidenceCustodyFixture.privateKey,
    ),
    bookingEffectCounts: {
      providerA: booking.providerAEffects as number,
      providerB: booking.midRun.providerSnapshot.effects as number,
      cancellation: booking.midRun.providerSnapshot.cancellationEffects as number,
    },
    cancellationEffectCounts: resume.effectCounts as Readonly<{ booking: number; cancellation: number }>,
    replayEffectCounts: replay.effectCounts as Readonly<{ booking: number; cancellation: number }>,
    midObjectiveDigest: booking.midRun.objectiveState.digest as string,
    finalObjectiveDigest: resume.objectiveState.digest as string,
    replayObjectiveDigest: replay.objectiveState.digest as string,
    cancellationReconstructedInvocationRefs:
      resume.reconstructedInvocationRefs as readonly string[],
    replayReconstructedInvocationRefs: replay.reconstructedInvocationRefs as readonly string[],
  }
}

export function verifyFullYoloEvidence(evidence: FullYoloEvidence) {
  const booking = evidence.authoritativeResults.booking
  const cancellation = evidence.authoritativeResults.cancellation
  const cancellationInput = cancellation.input as Readonly<{
    providerRef: string
    principalRef: string
  }>
  const processPids = [
    evidence.processColdProof.parentProcessId,
    evidence.processColdProof.bookingProcessId,
    evidence.processColdProof.cancellationProcessId,
    evidence.processColdProof.replayProcessId,
  ]
  const providerFacts = evidence.mandateSnapshot.exposureOffsets?.[0]
    ?.releaseAttestation.material
  const verifyOffset = (offset: NonNullable<typeof evidence.mandateSnapshot.exposureOffsets>[number]) =>
    booking.result.kind === 'reservation_confirmed'
    && cancellation.result.kind === 'reservation_cancellation_confirmed'
    && booking.principalRef === cancellation.principalRef
    && booking.principalRef === offset.principalRef
    && booking.result.reservationRef === offset.exposureSubjectRef
    && booking.result.reservationRef === offset.exposureResultRef
    && booking.result.evidenceRef === offset.exposureEvidenceRef
    && booking.result.providerRef === offset.providerRef
    && cancellation.result.reservationRef === booking.result.reservationRef
    && cancellation.result.reservationRef === offset.offsetSubjectRef
    && cancellation.result.cancellationRef === offset.offsetResultRef
    && cancellation.result.evidenceRef === offset.offsetEvidenceRef
    && cancellationInput.providerRef === booking.result.providerRef
    && cancellationInput.principalRef === booking.principalRef
  const store = new StandingMandateStore(structuredClone(evidence.mandateSnapshot))
  const mandate = evidence.mandateSnapshot.mandates[0]
  if (
    evidence.environment !== 'MOCK/DEVELOPMENT ONLY'
    || mandate?.mode !== 'full_yolo'
    || mandate.scope.actions?.length !== 2
    || mandate.scope.actions[0]?.id !== createDevelopmentReservationAction.id
    || mandate.scope.actions[1]?.id !== cancelDevelopmentReservationAction.id
    || !verifiedGrantMatchesMandate(evidence.grant, mandate, evidence.grant.verifiedAt)
    || evidence.policyDecisions.length !== 3
    || evidence.policyDecisions.map(({ fallbackOrdinal }) => fallbackOrdinal).join(',') !== '0,1,2'
    || evidence.policyDecisions.map(({ proposedWorstCaseLossMinor }) =>
      proposedWorstCaseLossMinor).join(',') !== '0,5000,0'
    || evidence.policyDecisions.map(({ heldWorstCaseLossMinor }) =>
      heldWorstCaseLossMinor).join(',') !== '0,0,5000'
    || evidence.objectiveDecisionRecords.map(({ ordinal }) => ordinal).join(',') !== '0,1,2'
    || evidence.objectiveDecisionRecords[1]?.kind !== 'fallback_after_terms_refusal'
    || evidence.invocations.length !== 3
    || canonicalDigest(booking.result) !== booking.resultDigest
    || canonicalDigest(cancellation.result as never) !== cancellation.resultDigest
    || canonicalDigest(evidence.invocations[1]?.durable.source.result as never) !== booking.resultDigest
    || evidence.invocations[1]?.durable.source.resultIdentity?.sourceResultRef
      !== (booking.result.kind === 'reservation_confirmed' ? booking.result.reservationRef : '')
    || evidence.invocations[1]?.durable.source.resultIdentity?.resultDigest !== booking.resultDigest
    || canonicalDigest(evidence.invocations[2]?.durable.source.result as never) !== cancellation.resultDigest
    || evidence.invocations[2]?.durable.source.resultIdentity?.sourceResultRef
      !== (cancellation.result.kind === 'reservation_cancellation_confirmed'
        ? cancellation.result.cancellationRef
        : '')
    || evidence.invocations[2]?.durable.source.resultIdentity?.resultDigest !== cancellation.resultDigest
    || !evidence.coldContinuation.noDuplicateEffect
    || evidence.coldContinuation.effectsBeforeReplay.booking
      !== evidence.coldContinuation.effectsAfterReplay.booking
    || evidence.coldContinuation.effectsBeforeReplay.cancellation
      !== evidence.coldContinuation.effectsAfterReplay.cancellation
    || evidence.coldContinuation.reconstructed.length !== 3
    || !developmentBookingObjectiveStateValid(evidence.coldContinuation.initialObjectiveState)
    || !developmentBookingObjectiveStateValid(evidence.coldContinuation.midRun.objectiveState)
    || !developmentBookingObjectiveStateValid(evidence.coldContinuation.finalObjectiveState)
    || !developmentBookingObjectiveStateValid(evidence.coldContinuation.replayedObjectiveState)
    || evidence.coldContinuation.initialObjectiveState.stage !== 'attempt_primary'
    || evidence.coldContinuation.initialObjectiveState.currentActionRef
      !== createDevelopmentReservationAction.id
    || evidence.coldContinuation.midRun.objectiveState.stage !== 'booking_confirmed'
    || evidence.coldContinuation.midRun.objectiveState.currentActionRef
      !== cancelDevelopmentReservationAction.id
    || evidence.coldContinuation.midRun.objectiveState.bookingResultRef
      !== (booking.result.kind === 'reservation_confirmed' ? booking.result.reservationRef : '')
    || evidence.coldContinuation.finalObjectiveState.stage !== 'completed'
    || evidence.coldContinuation.finalObjectiveState.currentActionRef !== 'none'
    || evidence.coldContinuation.finalObjectiveState.cancellationResultRef
      !== (cancellation.result.kind === 'reservation_cancellation_confirmed'
        ? cancellation.result.cancellationRef
        : '')
    || evidence.coldContinuation.finalObjectiveState.digest
      !== evidence.coldContinuation.replayedObjectiveState.digest
    || evidence.coldContinuation.finalObjectiveState.completedInvocationRefs.join(',')
      !== evidence.invocations.map(({ invocationRef }) => invocationRef).join(',')
    || evidence.coldContinuation.finalObjectiveState.policyDecisionRefs.join(',')
      !== evidence.policyDecisions.map(({ policyDecisionRef }) => policyDecisionRef).join(',')
    || evidence.coldContinuation.midRun.objectiveState.fallbackProgress.attemptedProviderRefs.join(',')
      !== evidence.objectiveDecisionRecords.slice(0, 2).map(({ providerRef }) => providerRef).join(',')
    || new Set(evidence.coldContinuation.freshObjectGraphRefs).size !== 2
    || evidence.coldContinuation.resumeReconstructedInvocationRefs.join(',')
      !== evidence.invocations.slice(0, 2).map(({ invocationRef }) => invocationRef).join(',')
    || evidence.coldContinuation.replayReconstructedInvocationRefs.join(',')
      !== evidence.invocations.map(({ invocationRef }) => invocationRef).join(',')
    || evidence.coldContinuation.continuationKind !== 'source_owned_objective_resume'
    || 'replayedBooking' in evidence.coldContinuation
    || 'replayedCancellation' in evidence.coldContinuation
    || evidence.coldContinuation.midRun.mandateSnapshot.uses.length !== 2
    || evidence.coldContinuation.midRun.mandateSnapshot.policyDecisions?.length !== 2
    || evidence.coldContinuation.midRun.providerSnapshot.effects !== 1
    || evidence.coldContinuation.midRun.providerSnapshot.cancellationEffects !== 0
    || evidence.coldContinuation.midRun.durableInvocations.length !== 2
    || evidence.providerEffects.providerA !== 1
    || evidence.providerEffects.providerB !== 1
    || evidence.providerEffects.cancellation !== 1
    || evidence.comparison.fullYoloPrincipalGrantDecisions !== 1
    || evidence.comparison.repeatedPrincipalDecisions !== 0
    || evidence.comparison.retainedExactAuthorityUses !== 3
    || evidence.capacityAfterCancellation.worstCaseLossMinor !== 0
    || evidence.mandateSnapshot.exposureOffsets?.[0]?.evidenceRuleRef
      !== developmentCancellationConfirmationRule.evidenceRuleRef
    || evidence.mandateSnapshot.exposureOffsets?.[0]?.evidenceRuleSource
      !== developmentCancellationConfirmationRule.source
    || evidence.mandateSnapshot.exposureOffsets?.[0]?.evidenceRuleVersion
      !== developmentCancellationConfirmationRule.version
    || cancellation.result.kind !== 'reservation_cancellation_confirmed'
    || cancellation.result.exposureReleaseAttestation === undefined
    || canonicalDigest(cancellation.result.exposureReleaseAttestation as never)
      !== canonicalDigest(evidence.mandateSnapshot.exposureOffsets?.[0]?.releaseAttestation as never)
    || mandate.scope.exposureOffsetVerificationKeys?.length !== 1
    || providerFacts === undefined
    || 'mandateRef' in providerFacts
    || 'principalRef' in providerFacts
    || 'originalAuthorityUseRef' in providerFacts
    || 'cancellationAuthorityUseRef' in providerFacts
    || evidence.mandateSnapshot.exposureOffsets?.[0]?.offsetAction.id
      !== cancelDevelopmentReservationAction.id
    || evidence.safetyEvals.revokeRace !== 'mandate_revoked'
    || evidence.safetyEvals.concurrencyExhaustion !== 'mandate_concurrency_exhausted'
    || evidence.safetyEvals.countExhaustion !== 'mandate_count_exhausted'
    || evidence.safetyEvals.spendExhaustion !== 'mandate_spend_exceeded'
    || evidence.safetyEvals.lossExhaustion !== 'mandate_risk_exceeded'
    || evidence.safetyEvals.unknownHeldLossMinor !== 5_000
    || new Set(processPids).size !== processPids.length
    || evidence.processColdProof.privateKeySerializedInState
    || evidence.processColdProof.bookingEffectCounts.providerA !== 1
    || evidence.processColdProof.bookingEffectCounts.providerB !== 1
    || evidence.processColdProof.bookingEffectCounts.cancellation !== 0
    || evidence.processColdProof.cancellationEffectCounts.booking !== 1
    || evidence.processColdProof.cancellationEffectCounts.cancellation !== 1
    || evidence.processColdProof.replayEffectCounts.booking !== 1
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
    const use = basis?.kind === 'standing_mandate_use'
      ? store.inspectUse(basis.authorityUseRef)
      : undefined
    const standingIndex = invocation.events.findIndex((event: { kind: string }) =>
      event.kind === 'standing_mandate_authorization')
    const releaseIndex = invocation.events.findIndex((event: { kind: string }) =>
      event.kind === 'provider_release')
    if (
      use === undefined
      || useRefs.has(use.authorityUseRef)
      || use.invocationRef !== invocation.invocationRef
      || use.action.id !== invocation.action.id
      || use.action.version !== invocation.action.contractVersion
      || standingIndex < 0
      || releaseIndex <= standingIndex
      || evidence.policyDecisions[index]?.proposal.action.id !== invocation.action.id
      || evidence.policyDecisions[index]?.proposal.authorityUseRef !== use.authorityUseRef
      || evidence.policyDecisions[index]?.proposal.invocationRef !== invocation.invocationRef
      || evidence.policyDecisions[index]?.proposal.materialDigest !== use.preparedMaterialDigest
      || use.policyDecisionRef !== evidence.policyDecisions[index]?.policyDecisionRef
      || evidence.coldContinuation.reconstructed[index]?.invocationRef !== invocation.invocationRef
      || evidence.coldContinuation.reconstructed[index]?.authorityUseRef !== use.authorityUseRef
    ) throw new Error('full_yolo_action_use_linkage_refused')
    useRefs.add(use.authorityUseRef)
  }
  const prefixUses: Array<(typeof evidence.mandateSnapshot.uses)[number]> = []
  for (const [index, decision] of evidence.policyDecisions.entries()) {
    const sourceInput = evidence.invocations[index]?.durable.source.input as any
    const expectedAction = index < 2
      ? createDevelopmentReservationAction
      : cancelDevelopmentReservationAction
    const expectedSourceOptionRef = index < 2
      ? sourceInput?.slot?.provenance?.observationRef
      : booking.result.kind === 'reservation_confirmed'
        ? booking.result.evidenceRef
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
        index < 2 ? sourceInput?.disclosure?.purpose : 'cancel_development_reservation'
      )
    ) throw new Error('full_yolo_policy_source_linkage_refused')
    const recomputed = evaluateStandingMandatePolicy({
      mandate: mandate!,
      proposal: decision.proposal,
      uses: prefixUses,
      policyDecisionRef: decision.policyDecisionRef,
    })
    if (recomputed.kind === 'refused' || recomputed.value.digest !== decision.digest) {
      throw new Error('full_yolo_policy_reconstruction_refused')
    }
    const use = evidence.mandateSnapshot.uses.find(({ authorityUseRef }) =>
      authorityUseRef === decision.proposal.authorityUseRef)
    if (use === undefined) throw new Error('full_yolo_policy_use_missing')
    prefixUses.push(use)
  }
  const offset = evidence.mandateSnapshot.exposureOffsets?.[0]
  if (
    offset === undefined
    || !verifyOffset(offset)
    || offset.authorityUseRef !== evidence.policyDecisions[1]?.proposal.authorityUseRef
    || offset.offsetAuthorityUseRef !== evidence.policyDecisions[2]?.proposal.authorityUseRef
  ) throw new Error('full_yolo_causal_offset_refused')
  new StandingMandateStore(structuredClone(evidence.coldContinuation.midRun.mandateSnapshot))
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

function checksum(evidence: FullYoloEvidence) {
  return `sha256:${createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`
}

type Packet = Readonly<{
  schema: 'ae.full-yolo-development-evidence:v1'
  checksum: string
  evidence: FullYoloEvidence
}>

export async function runCli(command: string, path: string) {
  if (command === 'run') {
    const evidence = await runFullYoloEvidence()
    verifyFullYoloEvidence(evidence)
    const packet: Packet = {
      schema: 'ae.full-yolo-development-evidence:v1',
      checksum: checksum(evidence),
      evidence,
    }
    await writeFile(path, `${JSON.stringify(packet, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    return packet
  }
  if (command === 'verify') {
    const packet = JSON.parse(await readFile(path, 'utf8')) as Packet
    if (
      packet.schema !== 'ae.full-yolo-development-evidence:v1'
      || packet.checksum !== checksum(packet.evidence)
    ) throw new Error('full_yolo_packet_checksum_refused')
    verifyFullYoloEvidence(packet.evidence)
    return packet
  }
  throw new Error('usage: evidence:full-yolo:development -- <run|verify> <path>')
}

if (process.argv[1]?.endsWith('full-yolo-evidence-packet.ts')) {
  const command = process.argv[2]
  const path = process.argv[3]
  if (command === undefined || path === undefined) throw new Error('command_and_path_required')
  const packet = await runCli(command, path)
  process.stdout.write(`${packet.checksum}\n${packet.evidence.gitRevision}\n`)
}
