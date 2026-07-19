import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

import { StandingMandateStore, verifiedGrantMatchesMandate } from '../../src/modules/action-invocation'
import { runFullYoloDevelopmentObjective } from '../../src/modules/booking/development-booking-objective'
import {
  cancelDevelopmentReservationAction,
  createDevelopmentReservationAction,
} from '../../src/modules/booking/development-booking.actions'

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
}

export async function runFullYoloEvidence(): Promise<FullYoloEvidence> {
  const objective = await runFullYoloDevelopmentObjective()
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
    ...overrides,
  })
  const revoked = fresh()
  revoked.revoke({
    mandateRef: mandate.mandateRef,
    expectedGeneration: 1,
    reason: 'Development revoke race.',
    revokedAt: '2026-07-19T04:00:01.000Z',
  })
  const revokeRace = revoked.reserve(material('revoke'), '2026-07-19T04:00:02.000Z')
  const concurrent = fresh()
  concurrent.reserve(material('concurrent:1'), developmentNow())
  concurrent.reserve(material('concurrent:2'), developmentNow())
  const concurrency = concurrent.reserve(material('concurrent:3'), developmentNow())
  const count = fresh()
  for (const id of ['1', '2', '3', '4']) {
    count.reserve(material(`count:${id}`), developmentNow())
    count.settle(`count:${id}`, 'released', developmentNow())
  }
  const countExhaustion = count.reserve(material('count:5'), developmentNow())
  const spend = fresh()
  spend.reserve(material('spend:1', {
    reservedSpend: { amountMinor: 10_000, currency: 'AUD' },
  }), developmentNow())
  const spendExhaustion = spend.reserve(material('spend:2', {
    reservedSpend: { amountMinor: 1, currency: 'AUD' },
  }), developmentNow())
  const loss = fresh()
  loss.reserve(material('loss:1', {
    reservedLoss: { amountMinor: 5_000, currency: 'AUD' },
  }), developmentNow())
  const lossExhaustion = loss.reserve(material('loss:2', {
    reservedLoss: { amountMinor: 1, currency: 'AUD' },
  }), developmentNow())
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
  }
}

export function verifyFullYoloEvidence(evidence: FullYoloEvidence) {
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
    || evidence.providerEffects.providerA !== 1
    || evidence.providerEffects.providerB !== 1
    || evidence.providerEffects.cancellation !== 1
    || evidence.comparison.fullYoloPrincipalGrantDecisions !== 1
    || evidence.comparison.repeatedPrincipalDecisions !== 0
    || evidence.comparison.retainedExactAuthorityUses !== 3
    || evidence.capacityAfterCancellation.worstCaseLossMinor !== 0
    || evidence.mandateSnapshot.exposureOffsets?.[0]?.evidenceRuleRef
      !== 'provider_confirmed_cancellation:v1'
    || evidence.mandateSnapshot.exposureOffsets?.[0]?.offsetAction.id
      !== cancelDevelopmentReservationAction.id
    || evidence.safetyEvals.revokeRace !== 'mandate_revoked'
    || evidence.safetyEvals.concurrencyExhaustion !== 'mandate_concurrency_exhausted'
    || evidence.safetyEvals.countExhaustion !== 'mandate_count_exhausted'
    || evidence.safetyEvals.spendExhaustion !== 'mandate_spend_exceeded'
    || evidence.safetyEvals.lossExhaustion !== 'mandate_risk_exceeded'
    || evidence.safetyEvals.unknownHeldLossMinor !== 5_000
  ) throw new Error('full_yolo_semantic_verification_refused')
  const useRefs = new Set<string>()
  for (const [index, invocation] of evidence.invocations.entries()) {
    const basis = invocation.acceptedAuthority
    const use = basis?.kind === 'standing_mandate_use'
      ? store.inspectUse(basis.authorityUseRef)
      : undefined
    const standingIndex = invocation.events.findIndex(({ kind }) => kind === 'standing_mandate_authorization')
    const releaseIndex = invocation.events.findIndex(({ kind }) => kind === 'provider_release')
    if (
      use === undefined
      || useRefs.has(use.authorityUseRef)
      || use.invocationRef !== invocation.invocationRef
      || use.action.id !== invocation.action.id
      || use.action.version !== invocation.action.contractVersion
      || standingIndex < 0
      || releaseIndex <= standingIndex
      || evidence.policyDecisions[index]?.actionId !== invocation.action.id
    ) throw new Error('full_yolo_action_use_linkage_refused')
    useRefs.add(use.authorityUseRef)
  }
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
