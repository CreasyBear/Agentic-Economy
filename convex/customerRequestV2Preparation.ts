import { v, type Infer } from 'convex/values'

import {
  openCapabilityDecisionModel,
  sameCapabilityContractRef,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  authorizeActionPreparation,
  projectActionPreparation,
  type DurableActionPreparation,
  type VerifiedActionPreparationApprovalActor,
} from '@/modules/customer-request/action-preparation'
import type { CustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import { requestRegistrySnapshotDigest } from '@/modules/customer-request/evaluation'
import {
  durableActionPreparationV2Value,
  customerRequestV2AggregateValue,
} from '@/modules/customer-request/runtime'

import { internalMutation, internalQuery } from './_generated/server'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'
import { listEligibleCapabilitySupply } from './capabilitySupply'

const approvalActorValue = v.object({
  kind: v.literal('clerk_owner'), requestPrincipalId: v.string(), ownerId: v.string(), credentialId: v.string(),
  authenticationEvidenceRef: v.string(), approvedAt: v.number(),
})
const prepareResultValue = v.union(
  v.object({ kind: v.literal('stored'), preparation: durableActionPreparationV2Value }),
  v.object({ kind: v.literal('replayed'), preparation: durableActionPreparationV2Value }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(v.literal('revision_changed'), v.literal('idempotency_key_reused')),
  }),
  v.object({
    kind: v.literal('needs_attention'),
    reason: v.union(v.literal('capability_graph_changed'), v.literal('historical_request_resubmit_required')),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('request_not_found'), v.literal('action_not_found'), v.literal('request_not_ready'),
      v.literal('authority_reference_invalid'), v.literal('authority_invalid'),
    ),
  }),
)
const resumeResultValue = v.union(
  v.object({ kind: v.literal('current'), preparation: durableActionPreparationV2Value }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('stale') }),
)

type Aggregate = Infer<typeof customerRequestV2AggregateValue>
type StoredPreparation = Infer<typeof durableActionPreparationV2Value>
type StoredLineage = StoredPreparation['lineage']
type StoredReview = StoredPreparation['disclosureReview']
type StoredReservation = NonNullable<Extract<StoredPreparation, { kind: 'ready_for_routing' }>['authorityReservation']>

export const prepare = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(),
    requestId: v.string(), expectedRevision: v.number(), actionId: v.string(),
    preparationRef: v.optional(v.string()), approvalActor: v.optional(approvalActorValue), now: v.number(),
  },
  returns: prepareResultValue,
  handler: async (ctx, args) => {
    const priorCommand = await ctx.db.query('customerRequestV2PreparationCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
    if (priorCommand !== null) {
      if (priorCommand.commandDigest !== args.commandDigest || priorCommand.principalId !== args.principalId
        || priorCommand.lineage.requestId !== args.requestId || priorCommand.lineage.actionId !== args.actionId) {
        return { kind: 'conflict' as const, reason: 'idempotency_key_reused' as const }
      }
      if (priorCommand.result.preparationDigest !== priorCommand.preparationDigest
        || priorCommand.result.preparationRef !== priorCommand.preparationRef
        || canonicalDigest(priorCommand.lineage as StableHashValue)
          !== canonicalDigest(priorCommand.result.lineage as StableHashValue)
        || !preparationIntegrityValid(priorCommand.result)) {
        throw new Error('customer_request_v2_preparation_replay_integrity_failure')
      }
      return { kind: 'replayed' as const, preparation: priorCommand.result }
    }

    const current = await loadCurrentAggregate(ctx.db, args.requestId)
    if (current.kind === 'historical') {
      return { kind: 'needs_attention' as const, reason: 'historical_request_resubmit_required' as const }
    }
    if (current.kind === 'not_found' || current.aggregate.snapshot.principalId !== args.principalId) {
      return { kind: 'refused' as const, reason: 'request_not_found' as const }
    }
    if (current.aggregate.snapshot.revision !== args.expectedRevision) {
      return { kind: 'conflict' as const, reason: 'revision_changed' as const }
    }
    const action = current.aggregate.plan.actions.find((candidate) => candidate.actionId === args.actionId)
    if (action === undefined) return { kind: 'refused' as const, reason: 'action_not_found' as const }
    if (current.aggregate.outcome !== 'plan_ready') {
      return { kind: 'refused' as const, reason: 'request_not_ready' as const }
    }
    const model = await loadCurrentActionModel(ctx.db, current.aggregate, action)
    if (model === undefined) {
      return { kind: 'needs_attention' as const, reason: 'capability_graph_changed' as const }
    }
    const existing = await ctx.db.query('customerRequestV2ActionPreparations')
      .withIndex('by_requestId_and_requestRevision_and_actionId', (query) => query
        .eq('requestId', args.requestId).eq('requestRevision', args.expectedRevision).eq('actionId', args.actionId))
      .unique()
    const projected = projectActionPreparation({
      aggregate: current.aggregate as unknown as CustomerRequestV2Aggregate,
      actionId: args.actionId,
      model,
      now: existing?.recordedAt ?? args.now,
    })
    if (projected.kind === 'stale' || (projected.kind === 'refused' && projected.reason === 'preparation_incompatible')) {
      return { kind: 'needs_attention' as const, reason: 'capability_graph_changed' as const }
    }
    if (projected.kind === 'refused') return { kind: 'refused' as const, reason: 'action_not_found' as const }
    if (existing !== null && !samePreparationProjectionIdentity(existing.preparation, projected)) {
      return { kind: 'needs_attention' as const, reason: 'capability_graph_changed' as const }
    }

    let preparation: DurableActionPreparation = existing === null
      ? projected
      : asDomainPreparation(existing.preparation)
    let approval: ReturnType<typeof authorizeActionPreparation>['approval'] | undefined
    if (args.preparationRef !== undefined) {
      if (existing === null || existing.preparation.kind !== 'needs_authority'
        || args.preparationRef !== existing.preparation.preparationRef) {
        return { kind: 'refused' as const, reason: 'authority_reference_invalid' as const }
      }
      if (args.approvalActor === undefined) return { kind: 'refused' as const, reason: 'authority_invalid' as const }
      try {
        const authorized = authorizeActionPreparation({
          preparation: asDomainPreparation(existing.preparation) as Extract<DurableActionPreparation, { kind: 'needs_authority' }>,
          preparationRef: args.preparationRef,
          commandDigest: args.commandDigest,
          actor: args.approvalActor as VerifiedActionPreparationApprovalActor,
        })
        preparation = authorized.preparation
        approval = authorized.approval
      } catch {
        return { kind: 'refused' as const, reason: 'authority_invalid' as const }
      }
    } else if (args.approvalActor !== undefined) {
      return { kind: 'refused' as const, reason: 'authority_reference_invalid' as const }
    }

    const review = await ctx.db.query('customerRequestV2PreparationDisclosureReviews')
      .withIndex('by_reviewRef', (query) => query.eq('reviewRef', preparation.disclosureReview.reviewRef)).unique()
    if (review !== null && (review.reviewDigest !== preparation.disclosureReview.reviewDigest
      || canonicalDigest(review.lineage as StableHashValue) !== canonicalDigest(preparation.lineage as StableHashValue))) {
      throw new Error('customer_request_v2_preparation_review_integrity_failure')
    }
    if (review === null) await ctx.db.insert('customerRequestV2PreparationDisclosureReviews', {
      reviewRef: preparation.disclosureReview.reviewRef,
      reviewDigest: preparation.disclosureReview.reviewDigest,
      lineage: asStoredLineage(preparation.lineage),
      review: asStoredReview(preparation.disclosureReview),
      recordedAt: args.now,
    })

    if (approval !== undefined) {
      const priorApproval = await ctx.db.query('customerRequestV2PreparationApprovalEvidence')
        .withIndex('by_approvalRef', (query) => query.eq('approvalRef', approval.approvalRef)).unique()
      if (priorApproval !== null && (priorApproval.approvalDigest !== approval.approvalDigest
        || priorApproval.reviewDigest !== approval.reviewDigest
        || priorApproval.authorityScopeDigest !== approval.authorityScopeDigest
        || priorApproval.commandDigest !== approval.commandDigest)) {
        throw new Error('customer_request_v2_preparation_approval_integrity_failure')
      }
      if (priorApproval === null) await ctx.db.insert('customerRequestV2PreparationApprovalEvidence', {
        approvalRef: approval.approvalRef,
        approvalDigest: approval.approvalDigest,
        preparationRef: approval.preparationRef,
        reviewRef: approval.reviewRef,
        reviewDigest: approval.reviewDigest,
        authorityScopeDigest: approval.authorityScopeDigest,
        principalId: approval.principalId,
        ownerId: approval.ownerId,
        credentialId: approval.credentialId,
        lineage: asStoredLineage(approval.lineage),
        commandDigest: approval.commandDigest,
        approval: structuredClone(approval),
        recordedAt: args.now,
      })
    }

    const reservation = preparation.kind === 'ready_for_routing' ? preparation.authorityReservation : undefined
    if (reservation !== undefined) {
      const priorReservation = await ctx.db.query('customerRequestV2PreparationAuthorityReservations')
        .withIndex('by_reservationRef', (query) => query.eq('reservationRef', reservation.reservationRef)).unique()
      if (priorReservation !== null && priorReservation.reservationDigest !== reservation.reservationDigest) {
        throw new Error('customer_request_v2_preparation_authority_integrity_failure')
      }
      if (priorReservation === null) await ctx.db.insert('customerRequestV2PreparationAuthorityReservations', {
        reservationRef: reservation.reservationRef,
        reservationDigest: reservation.reservationDigest,
        authorityReference: reservation.authorityReference,
        lineage: asStoredLineage(reservation.lineage),
        reservation: asStoredReservation(reservation),
        recordedAt: args.now,
      })
    }

    if (existing === null) await ctx.db.insert('customerRequestV2ActionPreparations', {
      preparationRef: preparation.preparationRef,
      preparationDigest: preparation.preparationDigest,
      requestId: preparation.lineage.requestId,
      requestRevision: preparation.lineage.requestRevision,
      actionId: preparation.lineage.actionId,
      lineage: asStoredLineage(preparation.lineage),
      preparation: asStoredPreparation(preparation),
      recordedAt: preparation.preparedAt,
      updatedAt: args.now,
    })
    else if (existing.preparationDigest !== preparation.preparationDigest) await ctx.db.patch(existing._id, {
      preparationDigest: preparation.preparationDigest,
      preparation: asStoredPreparation(preparation),
      updatedAt: args.now,
    })

    await ctx.db.insert('customerRequestV2PreparationCommands', {
      commandKey: args.commandKey,
      commandDigest: args.commandDigest,
      principalId: args.principalId,
      ...(approval === undefined ? {} : { authorityReference: approval.approvalRef }),
      lineage: asStoredLineage(preparation.lineage),
      preparationRef: preparation.preparationRef,
      preparationDigest: preparation.preparationDigest,
      result: asStoredPreparation(preparation),
      committedAt: args.now,
    })
    return { kind: 'stored' as const, preparation: asStoredPreparation(preparation) }
  },
})

export const resume = internalQuery({
  args: { requestId: v.string(), requestRevision: v.number(), actionId: v.string(), principalId: v.string() },
  returns: resumeResultValue,
  handler: async (ctx, args) => {
    const row = await ctx.db.query('customerRequestV2ActionPreparations')
      .withIndex('by_requestId_and_requestRevision_and_actionId', (query) => query
        .eq('requestId', args.requestId).eq('requestRevision', args.requestRevision).eq('actionId', args.actionId))
      .unique()
    if (row === null || row.lineage.principalId !== args.principalId) return { kind: 'not_found' as const }
    const head = await ctx.db.query('customerRequestV2Heads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (head === null || head.currentRevision !== args.requestRevision) return { kind: 'stale' as const }
    const revision = await ctx.db.query('customerRequestV2Revisions')
      .withIndex('by_requestId_and_requestRevision', (query) => query
        .eq('requestId', args.requestId).eq('requestRevision', args.requestRevision)).unique()
    if (revision === null || revision.aggregate.aggregateDigest !== head.currentAggregateDigest
      || !aggregateIntegrityValid(revision.aggregate)) {
      throw new Error('customer_request_v2_preparation_resume_aggregate_integrity_failure')
    }
    const action = revision.aggregate.plan.actions.find((candidate) => candidate.actionId === args.actionId)
    if (action === undefined) return { kind: 'stale' as const }
    const model = await loadCurrentActionModel(ctx.db, revision.aggregate, action)
    if (model === undefined) return { kind: 'stale' as const }
    const projected = projectActionPreparation({
      aggregate: revision.aggregate as unknown as CustomerRequestV2Aggregate,
      actionId: args.actionId,
      model,
      now: row.recordedAt,
    })
    if (projected.kind === 'stale' || projected.kind === 'refused'
      || !samePreparationProjectionIdentity(row.preparation, projected)) return { kind: 'stale' as const }
    if (row.preparationDigest !== row.preparation.preparationDigest
      || canonicalDigest(row.lineage as StableHashValue) !== canonicalDigest(row.preparation.lineage as StableHashValue)
      || !preparationIntegrityValid(row.preparation)) {
      throw new Error('customer_request_v2_preparation_integrity_failure')
    }
    return { kind: 'current' as const, preparation: asStoredPreparation(asDomainPreparation(row.preparation)) }
  },
})

async function loadCurrentAggregate(
  db: Parameters<typeof listEligibleCapabilitySupply>[0],
  requestId: string,
): Promise<
  | Readonly<{ kind: 'current'; aggregate: Aggregate }>
  | Readonly<{ kind: 'historical' }>
  | Readonly<{ kind: 'not_found' }>
> {
  const head = await db.query('customerRequestV2Heads')
    .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
  if (head === null) {
    const historicalHead = await db.query('customerRequestHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
    const historicalRequest = historicalHead === null
      ? await db.query('customerRequests').withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
      : null
    return historicalHead !== null || historicalRequest !== null ? { kind: 'historical' } : { kind: 'not_found' }
  }
  const revision = await db.query('customerRequestV2Revisions')
    .withIndex('by_requestId_and_requestRevision', (query) => query
      .eq('requestId', requestId).eq('requestRevision', head.currentRevision)).unique()
  if (revision === null || revision.aggregate.aggregateDigest !== head.currentAggregateDigest
    || !aggregateIntegrityValid(revision.aggregate)) {
    throw new Error('customer_request_v2_preparation_aggregate_integrity_failure')
  }
  return { kind: 'current', aggregate: revision.aggregate }
}

async function loadCurrentActionModel(
  db: Parameters<typeof listEligibleCapabilitySupply>[0],
  aggregate: Aggregate,
  action: Aggregate['plan']['actions'][number],
): Promise<CapabilityDecisionModel | undefined> {
  const supply = await listEligibleCapabilitySupply(db, { networkId: aggregate.snapshot.networkId, limit: 64 })
  if (supply.kind !== 'available') return undefined
  const bindings = supply.supplies.map(({ offering, binding }) => ({
    businessId: String(offering.businessId), offeringId: offering.offeringId, bindingId: binding.bindingId,
    contractRef: { capabilityId: binding.capabilityId, version: binding.version, contractDigest: binding.contractDigest },
    offeringRegistrationHash: offering.registrationHash, bindingRegistrationHash: binding.registrationHash,
  }))
  if (requestRegistrySnapshotDigest(bindings) !== aggregate.evaluation.registrySnapshotDigest
    || !bindings.some((binding) => sameCapabilityContractRef(binding.contractRef, action.contractRef))) return undefined
  const stored = await getActiveExactCapabilityContract(db, action.contractRef)
  if (stored.kind !== 'found') return undefined
  try {
    const model = openCapabilityDecisionModel(encodeCapabilityContractDocumentJson(stored.documentJson).contract)
    return sameCapabilityContractRef(model.contractRef, action.contractRef)
      && model.selectionKey === action.selectionKey && model.semanticDigest === action.semanticDigest ? model : undefined
  } catch {
    return undefined
  }
}

function aggregateIntegrityValid(aggregate: Aggregate): boolean {
  const { aggregateDigest: _aggregateDigest, ...material } = aggregate
  return aggregate.aggregateVersion === 2
    && aggregate.snapshot.requestId === aggregate.plan.requestId
    && aggregate.snapshot.revision === aggregate.plan.requestRevision
    && canonicalDigest(material as StableHashValue) === aggregate.aggregateDigest
}

function preparationIntegrityValid(preparation: StoredPreparation): boolean {
  const { preparationDigest, ...material } = preparation
  return canonicalDigest(material as StableHashValue) === preparationDigest
}

function samePreparationProjectionIdentity(left: StoredPreparation, right: DurableActionPreparation): boolean {
  return canonicalDigest(projectionIdentity(left) as StableHashValue)
    === canonicalDigest(projectionIdentity(right) as StableHashValue)
}

function projectionIdentity(preparation: StoredPreparation | DurableActionPreparation) {
  const projectedKind = preparation.kind === 'ready_for_routing' && preparation.authorityReservation !== undefined
    ? 'needs_authority'
    : preparation.kind
  return {
    preparationRef: preparation.preparationRef,
    lineage: preparation.lineage,
    projectedInputDigest: preparation.projectedInputDigest,
    authorityScopeDigest: preparation.authorityScope.authorityScopeDigest,
    reviewDigest: preparation.disclosureReview.reviewDigest,
    kind: projectedKind,
    ...(preparation.kind === 'needs_information' ? { missing: preparation.missing } : {}),
  }
}

function asDomainPreparation(value: StoredPreparation): DurableActionPreparation {
  return structuredClone(value) as unknown as DurableActionPreparation
}

function asStoredPreparation(value: DurableActionPreparation): StoredPreparation {
  return structuredClone(value) as unknown as StoredPreparation
}

function asStoredLineage(value: DurableActionPreparation['lineage']): StoredLineage {
  return structuredClone(value) as unknown as StoredLineage
}

function asStoredReview(value: DurableActionPreparation['disclosureReview']): StoredReview {
  return structuredClone(value) as unknown as StoredReview
}

function asStoredReservation(value: NonNullable<Extract<DurableActionPreparation, { kind: 'ready_for_routing' }>['authorityReservation']>): StoredReservation {
  return structuredClone(value) as unknown as StoredReservation
}
