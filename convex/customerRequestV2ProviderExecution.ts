import { v, type Infer } from 'convex/values'

import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  isBoundedJsonValue,
  type JsonValue,
} from '@/modules/capability-contract/public'
import {
  actionAttemptReleaseV2Digest,
  providerInvocationEnvelopeV2Digest,
  providerInvocationEnvelopeIntegrityValid,
  providerOutcomeV2Digest,
  recordProviderOutcomeV2,
  releaseProviderInvocationV2,
  type ProviderOutcomeEvidenceBundleV2,
  type ActionAttemptReleaseV2,
  type ProviderInvocationEnvelopeV2,
} from '@/modules/customer-request/public'
import {
  providerInvocationEnvelopeV2Value,
  providerOutcomeV2Value,
} from '@/modules/customer-request/runtime'

import type { Doc } from './_generated/dataModel'
import { internalMutation, type MutationCtx, type QueryCtx } from './_generated/server'
import { getExactRegisteredCapabilityContract } from './capabilityContractDocuments'
import { aggregateIsInternallyConsistent } from './customerRequestV2'
import {
  openExactActionAttemptForRelease,
  openExactAdmittedActionAttempt,
} from './customerRequestV2ActionAttempt'

const releaseResultValue = v.union(
  v.object({
    kind: v.union(v.literal('released'), v.literal('replayed')),
    envelope: providerInvocationEnvelopeV2Value,
  }),
  v.object({ kind: v.literal('conflict'), reason: v.literal('idempotency_key_reused') }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('action_attempt_not_found'), v.literal('action_attempt_expired'),
      v.literal('authority_changed'), v.literal('action_attempt_already_released'),
      v.literal('release_material_invalid'),
    ),
  }),
)
type ReleaseResult = Infer<typeof releaseResultValue>
type ReleaseCommand = Readonly<{
  commandKey: string
  commandDigest: string
  actionAttemptRef: string
  now: number
}>

const outcomeResultValue = v.union(
  v.object({ kind: v.literal('recorded'), outcome: providerOutcomeV2Value }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(v.literal('idempotency_key_reused'), v.literal('outcome_already_recorded')),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(v.literal('release_not_found'), v.literal('release_integrity_failure'), v.literal('response_invalid')),
  }),
)
type OutcomeResult = Infer<typeof outcomeResultValue>
type OutcomeCommand = Readonly<{
  commandKey: string
  commandDigest: string
  actionAttemptRef: string
  response: JsonValue
  now: number
}>

export const release = internalMutation({
  args: { commandKey: v.string(), commandDigest: v.string(), actionAttemptRef: v.string(), now: v.number() },
  returns: releaseResultValue,
  handler: async (ctx, args): Promise<ReleaseResult> => await releaseProviderTransaction(ctx.db, args),
})

export const recordOutcome = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), actionAttemptRef: v.string(),
    response: v.any(), now: v.number(), // runtime-validated JsonValue boundary
  },
  returns: outcomeResultValue,
  handler: async (ctx, args): Promise<OutcomeResult> => await recordProviderOutcomeTransaction(ctx.db, args),
})

export async function releaseProviderTransaction(
  db: MutationCtx['db'], args: ReleaseCommand,
): Promise<ReleaseResult> {
  if (!validReleaseCommand(args)) return { kind: 'refused', reason: 'release_material_invalid' }
  const replay = await db.query('customerRequestV2ActionAttemptReleases')
    .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
  if (replay !== null) {
    if (replay.commandDigest !== args.commandDigest || replay.actionAttemptRef !== args.actionAttemptRef) {
      return { kind: 'conflict', reason: 'idempotency_key_reused' }
    }
    return { kind: 'released', envelope: await replayRelease(db, replay) }
  }
  const opened = await openExactActionAttemptForRelease(db, {
    actionAttemptRef: args.actionAttemptRef, now: args.now,
  })
  if (opened.kind !== 'ready') return {
    kind: 'refused',
    reason: opened.reason === 'action_attempt_not_found' ? 'action_attempt_not_found'
      : opened.reason === 'action_attempt_expired' ? 'action_attempt_expired' : 'authority_changed',
  }
  const [byAttempt, byProviderGrant, byDisclosureGrant] = await Promise.all([
    db.query('customerRequestV2ActionAttemptReleases')
      .withIndex('by_actionAttemptRef', (query) => query.eq('actionAttemptRef', args.actionAttemptRef)).unique(),
    db.query('customerRequestV2ActionAttemptReleases')
      .withIndex('by_providerReleaseGrantRef', (query) => query
        .eq('providerReleaseGrantRef', opened.providerReleaseGrant.providerReleaseGrantRef)).unique(),
    db.query('customerRequestV2ActionAttemptReleases')
      .withIndex('by_disclosureGrantRef', (query) => query
        .eq('disclosureGrantRef', opened.disclosureGrant.disclosureGrantRef)).unique(),
  ])
  if (byAttempt !== null || byProviderGrant !== null || byDisclosureGrant !== null) {
    return { kind: 'refused', reason: 'action_attempt_already_released' }
  }
  const released = releaseProviderInvocationV2({
    attempt: opened.attempt,
    providerReleaseGrant: opened.providerReleaseGrant,
    disclosureGrant: opened.disclosureGrant,
    contract: opened.approval.contract,
    actionInputs: opened.approval.action.inputs,
    releasedAt: args.now,
  })
  if (released.kind !== 'released') return {
    kind: 'refused',
    reason: released.reason === 'authority_expired' ? 'action_attempt_expired'
      : released.reason === 'authority_invalid' ? 'authority_changed' : 'release_material_invalid',
  }
  const envelope = writableEnvelope(released.envelope)
  await db.insert('customerRequestV2ActionAttemptReleases', {
    commandKey: args.commandKey, commandDigest: args.commandDigest,
    actionAttemptRef: envelope.lineage.actionAttemptRef,
    actionAttemptDigest: envelope.lineage.actionAttemptDigest,
    providerReleaseGrantRef: envelope.providerReleaseGrantRef,
    disclosureGrantRef: envelope.disclosureGrantRef,
    envelopeRef: envelope.envelopeRef, envelopeDigest: envelope.envelopeDigest,
    authorityLineageDigest: envelope.lineage.authorityLineageDigest,
    releaseRef: released.release.releaseRef, releaseDigest: released.release.releaseDigest,
    release: structuredClone(released.release),
    envelope, committedAt: args.now,
  })
  return { kind: 'released', envelope }
}

export async function recordProviderOutcomeTransaction(
  db: MutationCtx['db'], args: OutcomeCommand,
): Promise<OutcomeResult> {
  if (!validOutcomeCommand(args)) return { kind: 'refused', reason: 'response_invalid' }
  const replay = await db.query('customerRequestV2ProviderOutcomes')
    .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
  const material = await openReleaseMaterial(db, args.actionAttemptRef)
  if (material.kind !== 'ready') return material
  if (replay !== null) {
    if (replay.commandDigest !== args.commandDigest || replay.actionAttemptRef !== args.actionAttemptRef) {
      return { kind: 'conflict', reason: 'idempotency_key_reused' }
    }
    const expected = recordProviderOutcomeV2({
      envelope: material.envelope, contract: material.contract,
      response: args.response, observedAt: replay.outcome.observedAt,
    })
    if (expected.kind !== 'recorded' || replay.responseDigest !== expected.bundle.outcome.responseDigest) {
      return { kind: 'conflict', reason: 'idempotency_key_reused' }
    }
    return { kind: 'recorded', outcome: await replayOutcome(db, replay, expected.bundle) }
  }
  if (args.commandDigest !== canonicalDigest(args.response as StableHashValue)) {
    return { kind: 'refused', reason: 'response_invalid' }
  }
  const recorded = recordProviderOutcomeV2({
    envelope: material.envelope, contract: material.contract,
    response: args.response, observedAt: args.now,
  })
  if (recorded.kind !== 'recorded') return { kind: 'refused', reason: 'response_invalid' }
  const existing = await db.query('customerRequestV2ProviderOutcomes')
    .withIndex('by_actionAttemptRef', (query) => query.eq('actionAttemptRef', args.actionAttemptRef)).unique()
  if (existing !== null) return { kind: 'conflict', reason: 'outcome_already_recorded' }
  await persistProviderOutcomeBundle(db, args, recorded.bundle)
  return { kind: 'recorded', outcome: structuredClone(recorded.bundle.outcome) }
}

export async function persistProviderOutcomeBundle(
  db: MutationCtx['db'], args: OutcomeCommand, bundle: ProviderOutcomeEvidenceBundleV2,
): Promise<void> {
  const outcome = structuredClone(bundle.outcome)
  const rootRun = structuredClone(bundle.rootRun)
  const leafRun = structuredClone(bundle.leafRun)
  const protocolEvidence = structuredClone(bundle.protocolEvidence)
  await db.insert('customerRequestV2ProviderOutcomes', {
    commandKey: args.commandKey, commandDigest: args.commandDigest,
    actionAttemptRef: outcome.lineage.actionAttemptRef,
    envelopeRef: outcome.envelopeRef, envelopeDigest: outcome.envelopeDigest,
    outcomeRef: outcome.outcomeRef, outcomeDigest: outcome.outcomeDigest,
    authorityLineageDigest: outcome.lineageDigest, responseDigest: outcome.responseDigest,
    outcome, committedAt: args.now,
  })
  await db.insert('customerRequestV2ProviderRootRuns', {
    rootRunRef: rootRun.rootRunRef, rootRunDigest: rootRun.rootRunDigest,
    outcomeRef: outcome.outcomeRef, actionAttemptRef: outcome.lineage.actionAttemptRef,
    authorityLineageDigest: rootRun.lineageDigest, rootRun, recordedAt: args.now,
  })
  await db.insert('customerRequestV2ProviderLeafRuns', {
    leafRunRef: leafRun.leafRunRef, leafRunDigest: leafRun.leafRunDigest,
    outcomeRef: outcome.outcomeRef, actionAttemptRef: outcome.lineage.actionAttemptRef,
    authorityLineageDigest: leafRun.lineageDigest, leafRun, recordedAt: args.now,
  })
  await db.insert('customerRequestV2ProviderProtocolEvidence', {
    protocolEvidenceRef: protocolEvidence.protocolEvidenceRef,
    protocolEvidenceDigest: protocolEvidence.protocolEvidenceDigest,
    outcomeRef: outcome.outcomeRef, actionAttemptRef: outcome.lineage.actionAttemptRef,
    authorityLineageDigest: protocolEvidence.lineageDigest, protocolEvidence, recordedAt: args.now,
  })
}

async function openReleaseMaterial(
  db: QueryCtx['db'], actionAttemptRef: string,
): Promise<
  | Readonly<{
      kind: 'ready'
      envelope: ProviderInvocationEnvelopeV2
      contract: Extract<Awaited<ReturnType<typeof getExactRegisteredCapabilityContract>>, { kind: 'found' }>['contract']
    }>
  | Readonly<{ kind: 'refused'; reason: 'release_not_found' | 'release_integrity_failure' }>
> {
  const row = await db.query('customerRequestV2ActionAttemptReleases')
    .withIndex('by_actionAttemptRef', (query) => query.eq('actionAttemptRef', actionAttemptRef)).unique()
  if (row === null) return { kind: 'refused', reason: 'release_not_found' }
  const opened = await openExactAdmittedActionAttempt(db, actionAttemptRef)
  if (opened.kind !== 'found') return { kind: 'refused', reason: 'release_integrity_failure' }
  const contract = await getExactRegisteredCapabilityContract(db, opened.attempt.lineage.contractRef)
  const exactRelease = contract.kind === 'found'
    ? await rederiveProviderRelease(db, opened, contract.contract, row.committedAt)
    : undefined
  if (contract.kind !== 'found' || exactRelease === undefined
    || !releaseRowIntegrityValid(row, opened, contract.contract, exactRelease)) {
    return { kind: 'refused', reason: 'release_integrity_failure' }
  }
  return { kind: 'ready', envelope: row.envelope as ProviderInvocationEnvelopeV2, contract: contract.contract }
}

export async function openExactProviderOutcomeForReconciliation(
  db: QueryCtx['db'], actionAttemptRef: string,
): Promise<
  | Readonly<{
      kind: 'ready'
      outcome: Doc<'customerRequestV2ProviderOutcomes'>['outcome']
      envelope: ProviderInvocationEnvelopeV2
      contract: Extract<Awaited<ReturnType<typeof getExactRegisteredCapabilityContract>>, { kind: 'found' }>['contract']
    }>
  | Readonly<{ kind: 'unavailable'; reason: 'outcome_not_found' | 'integrity_failure' }>
> {
  const row = await db.query('customerRequestV2ProviderOutcomes')
    .withIndex('by_actionAttemptRef', (query) => query.eq('actionAttemptRef', actionAttemptRef)).unique()
  if (row === null) return { kind: 'unavailable', reason: 'outcome_not_found' }
  const release = await openReleaseMaterial(db, actionAttemptRef)
  if (release.kind !== 'ready') return { kind: 'unavailable', reason: 'integrity_failure' }
  const [root, leaf, protocol] = await Promise.all([
    db.query('customerRequestV2ProviderRootRuns')
      .withIndex('by_outcomeRef', (query) => query.eq('outcomeRef', row.outcomeRef)).unique(),
    db.query('customerRequestV2ProviderLeafRuns')
      .withIndex('by_outcomeRef', (query) => query.eq('outcomeRef', row.outcomeRef)).unique(),
    db.query('customerRequestV2ProviderProtocolEvidence')
      .withIndex('by_outcomeRef', (query) => query.eq('outcomeRef', row.outcomeRef)).unique(),
  ])
  if (root === null || leaf === null || protocol === null
    || row.actionAttemptRef !== release.envelope.lineage.actionAttemptRef
    || row.envelopeRef !== release.envelope.envelopeRef
    || row.envelopeDigest !== release.envelope.envelopeDigest
    || row.outcomeRef !== row.outcome.outcomeRef
    || row.outcomeDigest !== row.outcome.outcomeDigest
    || row.outcomeDigest !== providerOutcomeV2Digest(row.outcome as ProviderOutcomeEvidenceBundleV2['outcome'])
    || row.commandDigest !== row.responseDigest
    || row.authorityLineageDigest !== release.envelope.lineageDigest
    || !storedProviderEvidenceIntegrityValid(row, root, leaf, protocol, release.envelope, release.contract)) {
    return { kind: 'unavailable', reason: 'integrity_failure' }
  }
  return {
    kind: 'ready', outcome: row.outcome,
    envelope: release.envelope, contract: release.contract,
  }
}

function storedProviderEvidenceIntegrityValid(
  outcome: Doc<'customerRequestV2ProviderOutcomes'>,
  root: Doc<'customerRequestV2ProviderRootRuns'>,
  leaf: Doc<'customerRequestV2ProviderLeafRuns'>,
  protocol: Doc<'customerRequestV2ProviderProtocolEvidence'>,
  envelope: ProviderInvocationEnvelopeV2,
  contract: Extract<Awaited<ReturnType<typeof getExactRegisteredCapabilityContract>>, { kind: 'found' }>['contract'],
): boolean {
  const linked = [root, leaf, protocol]
  const outcomeLink = { outcomeRef: outcome.outcomeRef, outcomeDigest: outcome.outcomeDigest }
  const linkDigest = canonicalDigest(outcomeLink as StableHashValue)
  const commonPayloadLinksValid = [root.rootRun, leaf.leafRun, protocol.protocolEvidence].every((evidence) => (
    evidence.outcomeRef === outcome.outcomeRef
      && evidence.outcomeDigest === outcome.outcomeDigest
      && evidence.envelopeRef === envelope.envelopeRef
      && evidence.envelopeDigest === envelope.envelopeDigest
      && evidence.lineageDigest === envelope.lineageDigest
      && evidence.recordedAt === outcome.outcome.observedAt
      && sameStable(evidence.lineage, envelope.lineage)
  ))
  const succeededBundle = outcome.outcome.state === 'succeeded' && protocol.protocolEvidence.providerResult !== undefined
    ? recordProviderOutcomeV2({
        envelope, contract, response: protocol.protocolEvidence.providerResult,
        observedAt: outcome.outcome.observedAt,
      })
    : undefined
  const terminalEvidenceValid = succeededBundle?.kind === 'recorded'
    ? sameStable(succeededBundle.bundle.outcome, outcome.outcome)
      && sameStable(succeededBundle.bundle.rootRun, root.rootRun)
      && sameStable(succeededBundle.bundle.leafRun, leaf.leafRun)
      && sameStable(succeededBundle.bundle.protocolEvidence, protocol.protocolEvidence)
    : outcome.outcome.state === 'unknown_external_state'
      && unknownProtocolEvidenceValid(outcome.outcome, protocol.protocolEvidence, envelope)
  return linked.every((row) => row.outcomeRef === outcome.outcomeRef
      && row.actionAttemptRef === outcome.actionAttemptRef
      && row.authorityLineageDigest === outcome.authorityLineageDigest)
    && commonPayloadLinksValid
    && terminalEvidenceValid
    && root.rootRunRef === root.rootRun.rootRunRef
    && root.rootRunRef === `provider-root-run:v2:${linkDigest}`
    && root.rootRunDigest === root.rootRun.rootRunDigest
    && root.rootRun.state === outcome.outcome.state
    && digestWithout(root.rootRun, 'rootRunDigest') === root.rootRunDigest
    && leaf.leafRunRef === leaf.leafRun.leafRunRef
    && leaf.leafRunRef === `provider-leaf-run:v2:${linkDigest}`
    && leaf.leafRunDigest === leaf.leafRun.leafRunDigest
    && leaf.leafRun.state === outcome.outcome.state
    && leaf.leafRun.businessId === envelope.lineage.businessId
    && leaf.leafRun.offeringId === envelope.lineage.offeringId
    && leaf.leafRun.bindingId === envelope.lineage.bindingId
    && digestWithout(leaf.leafRun, 'leafRunDigest') === leaf.leafRunDigest
    && protocol.protocolEvidenceRef === protocol.protocolEvidence.protocolEvidenceRef
    && protocol.protocolEvidenceRef === `provider-protocol-evidence:v2:${linkDigest}`
    && protocol.protocolEvidenceDigest === protocol.protocolEvidence.protocolEvidenceDigest
    && digestWithout(protocol.protocolEvidence, 'protocolEvidenceDigest') === protocol.protocolEvidenceDigest
}

function unknownProtocolEvidenceValid(
  outcome: Extract<ProviderOutcomeEvidenceBundleV2['outcome'], { state: 'unknown_external_state' }>,
  protocol: Doc<'customerRequestV2ProviderProtocolEvidence'>['protocolEvidence'],
  envelope: ProviderInvocationEnvelopeV2,
): boolean {
  const exactEcho = {
    envelopeRef: envelope.envelopeRef, envelopeDigest: envelope.envelopeDigest,
    actionAttemptRef: envelope.lineage.actionAttemptRef,
    actionAttemptDigest: envelope.lineage.actionAttemptDigest,
    authorityLineageDigest: envelope.lineage.authorityLineageDigest,
    providerIdempotencyKey: envelope.providerIdempotencyKey,
  }
  const echoMatches = protocol.observedEcho !== undefined && sameStable(protocol.observedEcho, exactEcho)
  return protocol.disposition === 'unknown_external_state'
    && protocol.responseDigest === outcome.responseDigest
    && protocol.providerResult === undefined
    && protocol.outputDigest === undefined
    && (outcome.reason === 'provider_response_invalid'
      ? protocol.observedEcho === undefined
      : outcome.reason === 'provider_echo_mismatch'
        ? protocol.observedEcho !== undefined && !echoMatches
        : echoMatches)
}

function digestWithout(value: Record<string, unknown>, digestKey: string): string {
  return canonicalDigest(Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== digestKey),
  ) as StableHashValue)
}

function releaseRowIntegrityValid(
  row: Doc<'customerRequestV2ActionAttemptReleases'>,
  opened: Extract<Awaited<ReturnType<typeof openExactAdmittedActionAttempt>>, { kind: 'found' }>,
  contract: Extract<Awaited<ReturnType<typeof getExactRegisteredCapabilityContract>>, { kind: 'found' }>['contract'],
  expected: Extract<ReturnType<typeof releaseProviderInvocationV2>, { kind: 'released' }>,
): boolean {
  const envelope = row.envelope as ProviderInvocationEnvelopeV2
  const release = row.release as ActionAttemptReleaseV2
  return providerInvocationEnvelopeIntegrityValid(envelope, contract)
    && canonicalDigest(envelope as StableHashValue) === canonicalDigest(expected.envelope as StableHashValue)
    && canonicalDigest(release as StableHashValue) === canonicalDigest(expected.release as StableHashValue)
    && actionAttemptReleaseV2Digest(release) === release.releaseDigest
    && row.releaseRef === release.releaseRef
    && row.releaseDigest === release.releaseDigest
    && release.state === 'released'
    && release.actionAttemptRef === envelope.lineage.actionAttemptRef
    && release.actionAttemptDigest === envelope.lineage.actionAttemptDigest
    && release.providerReleaseGrantRef === envelope.providerReleaseGrantRef
    && release.providerReleaseGrantDigest === envelope.providerReleaseGrantDigest
    && release.disclosureGrantRef === envelope.disclosureGrantRef
    && release.disclosureGrantDigest === envelope.disclosureGrantDigest
    && release.envelopeRef === envelope.envelopeRef
    && release.envelopeDigest === envelope.envelopeDigest
    && release.authorityLineageDigest === envelope.lineage.authorityLineageDigest
    && release.providerIdempotencyKey === envelope.providerIdempotencyKey
    && release.releasedAt === envelope.releasedAt
    && envelope.releasedAt === row.committedAt
    && row.envelopeRef === envelope.envelopeRef
    && row.envelopeDigest === envelope.envelopeDigest
    && row.actionAttemptRef === opened.attempt.actionAttemptRef
    && row.actionAttemptDigest === opened.attempt.actionAttemptDigest
    && row.providerReleaseGrantRef === opened.providerReleaseGrant.providerReleaseGrantRef
    && row.disclosureGrantRef === opened.disclosureGrant.disclosureGrantRef
    && envelope.lineage.actionAttemptRef === opened.attempt.actionAttemptRef
    && envelope.lineage.actionAttemptDigest === opened.attempt.actionAttemptDigest
    && envelope.lineage.authorityLineageDigest === opened.attempt.authorityLineageDigest
    && envelope.providerReleaseGrantRef === opened.providerReleaseGrant.providerReleaseGrantRef
    && envelope.providerReleaseGrantDigest === opened.providerReleaseGrant.providerReleaseGrantDigest
    && envelope.disclosureGrantRef === opened.disclosureGrant.disclosureGrantRef
    && envelope.disclosureGrantDigest === opened.disclosureGrant.disclosureGrantDigest
    && row.authorityLineageDigest === envelope.lineage.authorityLineageDigest
}

async function rederiveProviderRelease(
  db: QueryCtx['db'],
  opened: Extract<Awaited<ReturnType<typeof openExactAdmittedActionAttempt>>, { kind: 'found' }>,
  contract: Extract<Awaited<ReturnType<typeof getExactRegisteredCapabilityContract>>, { kind: 'found' }>['contract'],
  releasedAt: number,
): Promise<Extract<ReturnType<typeof releaseProviderInvocationV2>, { kind: 'released' }> | undefined> {
  const lineage = opened.attempt.lineage
  const revision = await db.query('customerRequestV2Revisions')
    .withIndex('by_requestId_and_requestRevision', (query) => query
      .eq('requestId', lineage.requestId).eq('requestRevision', lineage.requestRevision)).unique()
  if (revision === null
    || !aggregateIsInternallyConsistent(revision.aggregate, lineage.requestRevision - 1)
    || revision.aggregate.plan.planRevisionId !== lineage.planRevisionId
    || revision.aggregate.plan.planDigest !== lineage.planDigest) return undefined
  const action = revision.aggregate.plan.actions.find((candidate) => candidate.actionId === lineage.actionId)
  if (action === undefined) return undefined
  const released = releaseProviderInvocationV2({
    attempt: opened.attempt,
    providerReleaseGrant: opened.providerReleaseGrant,
    disclosureGrant: opened.disclosureGrant,
    contract, actionInputs: action.inputs, releasedAt,
  })
  return released.kind === 'released' ? released : undefined
}

async function replayOutcome(
  db: MutationCtx['db'], row: Doc<'customerRequestV2ProviderOutcomes'>,
  expected: ProviderOutcomeEvidenceBundleV2,
): Promise<Doc<'customerRequestV2ProviderOutcomes'>['outcome']> {
  const [rootRun, leafRun, protocolEvidence] = await Promise.all([
    db.query('customerRequestV2ProviderRootRuns')
      .withIndex('by_outcomeRef', (query) => query.eq('outcomeRef', row.outcomeRef)).unique(),
    db.query('customerRequestV2ProviderLeafRuns')
      .withIndex('by_outcomeRef', (query) => query.eq('outcomeRef', row.outcomeRef)).unique(),
    db.query('customerRequestV2ProviderProtocolEvidence')
      .withIndex('by_outcomeRef', (query) => query.eq('outcomeRef', row.outcomeRef)).unique(),
  ])
  if (rootRun === null || leafRun === null || protocolEvidence === null
    || row.outcomeDigest !== providerOutcomeV2Digest(row.outcome as typeof expected.outcome)
    || !sameStable(row.outcome, expected.outcome)
    || !sameStable(rootRun.rootRun, expected.rootRun)
    || !sameStable(leafRun.leafRun, expected.leafRun)
    || !sameStable(protocolEvidence.protocolEvidence, expected.protocolEvidence)
    || row.outcomeRef !== row.outcome.outcomeRef
    || row.outcomeDigest !== row.outcome.outcomeDigest
    || row.authorityLineageDigest !== row.outcome.lineageDigest
    || rootRun.rootRunRef !== expected.rootRun.rootRunRef
    || rootRun.rootRunDigest !== expected.rootRun.rootRunDigest
    || rootRun.outcomeRef !== row.outcomeRef
    || rootRun.actionAttemptRef !== row.actionAttemptRef
    || rootRun.authorityLineageDigest !== row.authorityLineageDigest
    || rootRun.rootRunDigest !== rootRun.rootRun.rootRunDigest
    || leafRun.leafRunRef !== expected.leafRun.leafRunRef
    || leafRun.leafRunDigest !== expected.leafRun.leafRunDigest
    || leafRun.outcomeRef !== row.outcomeRef
    || leafRun.actionAttemptRef !== row.actionAttemptRef
    || leafRun.authorityLineageDigest !== row.authorityLineageDigest
    || leafRun.leafRunDigest !== leafRun.leafRun.leafRunDigest
    || protocolEvidence.protocolEvidenceRef !== expected.protocolEvidence.protocolEvidenceRef
    || protocolEvidence.protocolEvidenceDigest !== expected.protocolEvidence.protocolEvidenceDigest
    || protocolEvidence.outcomeRef !== row.outcomeRef
    || protocolEvidence.actionAttemptRef !== row.actionAttemptRef
    || protocolEvidence.authorityLineageDigest !== row.authorityLineageDigest
    || protocolEvidence.protocolEvidenceDigest !== protocolEvidence.protocolEvidence.protocolEvidenceDigest) {
    throw new Error('customer_request_v2_provider_outcome_replay_integrity_failure')
  }
  return row.outcome
}

function sameStable(left: unknown, right: unknown): boolean {
  return canonicalDigest(left as StableHashValue) === canonicalDigest(right as StableHashValue)
}

async function replayRelease(
  db: MutationCtx['db'], row: Doc<'customerRequestV2ActionAttemptReleases'>,
): Promise<Doc<'customerRequestV2ActionAttemptReleases'>['envelope']> {
  const opened = await openExactAdmittedActionAttempt(db, row.actionAttemptRef)
  if (opened.kind !== 'found') throw releaseReplayIntegrityFailure()
  const contract = await getExactRegisteredCapabilityContract(db, opened.attempt.lineage.contractRef)
  const exactRelease = contract.kind === 'found'
    ? await rederiveProviderRelease(db, opened, contract.contract, row.committedAt)
    : undefined
  if (contract.kind !== 'found' || exactRelease === undefined
    || !releaseRowIntegrityValid(row, opened, contract.contract, exactRelease)
    || providerInvocationEnvelopeV2Digest(row.envelope as ProviderInvocationEnvelopeV2) !== row.envelopeDigest
    || row.envelopeDigest !== row.envelope.envelopeDigest
    || row.envelopeRef !== row.envelope.envelopeRef
    || row.actionAttemptRef !== row.envelope.lineage.actionAttemptRef
    || row.actionAttemptDigest !== row.envelope.lineage.actionAttemptDigest
    || row.providerReleaseGrantRef !== row.envelope.providerReleaseGrantRef
    || row.disclosureGrantRef !== row.envelope.disclosureGrantRef
    || row.authorityLineageDigest !== row.envelope.lineage.authorityLineageDigest) {
    throw releaseReplayIntegrityFailure()
  }
  return row.envelope
}

function releaseReplayIntegrityFailure(): Error {
  return new Error('customer_request_v2_provider_release_replay_integrity_failure')
}

function writableEnvelope(envelope: ProviderInvocationEnvelopeV2): Infer<typeof providerInvocationEnvelopeV2Value> {
  return structuredClone(envelope) as Infer<typeof providerInvocationEnvelopeV2Value>
}

function validReleaseCommand(args: ReleaseCommand): boolean {
  return args.commandKey.trim().length > 0 && args.commandKey.length <= 500
    && isCanonicalDigest(args.commandDigest)
    && args.actionAttemptRef.startsWith('action-attempt:v2:') && args.actionAttemptRef.length <= 500
    && Number.isSafeInteger(args.now) && args.now >= 0
}

function validOutcomeCommand(args: OutcomeCommand): boolean {
  return args.commandKey.trim().length > 0 && args.commandKey.length <= 500
    && isCanonicalDigest(args.commandDigest)
    && args.actionAttemptRef.startsWith('action-attempt:v2:') && args.actionAttemptRef.length <= 500
    && isBoundedJsonValue(args.response)
    && Number.isSafeInteger(args.now) && args.now >= 0
}
