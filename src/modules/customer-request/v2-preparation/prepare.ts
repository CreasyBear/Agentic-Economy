import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  authorizeActionPreparation,
  projectActionPreparation,
  type DurableActionPreparation,
} from '@/modules/customer-request/action-preparation'

import { samePreparationProjectionIdentity } from './integrity'
import type { CustomerRequestV2PreparationPorts } from './ports'
import type {
  PrepareActionPreparationArgs,
  PrepareActionPreparationResult,
} from './types'

export async function prepareActionPreparation(
  args: PrepareActionPreparationArgs,
  ports: CustomerRequestV2PreparationPorts,
): Promise<PrepareActionPreparationResult> {
  const priorCommand = await ports.loadPreparationCommand(args.commandKey)
  if (priorCommand !== null) {
    if (priorCommand.commandDigest !== args.commandDigest
      || priorCommand.principalId !== args.principalId
      || priorCommand.lineage.requestId !== args.requestId
      || priorCommand.lineage.actionId !== args.actionId) {
      return { kind: 'conflict', reason: 'idempotency_key_reused' }
    }
    const preparation = await ports.verifyPreparationCommandReplay(priorCommand)
    return { kind: 'replayed', preparation }
  }

  const current = await ports.loadCurrentAggregate(args.requestId)
  if (current.kind === 'historical') {
    return { kind: 'needs_attention', reason: 'historical_request_resubmit_required' }
  }
  if (current.kind === 'not_found' || current.aggregate.snapshot.principalId !== args.principalId) {
    return { kind: 'refused', reason: 'request_not_found' }
  }
  if (current.aggregate.snapshot.revision !== args.expectedRevision) {
    return { kind: 'conflict', reason: 'revision_changed' }
  }
  const action = current.aggregate.plan.actions.find((candidate) => candidate.actionId === args.actionId)
  if (action === undefined) return { kind: 'refused', reason: 'action_not_found' }
  if (current.aggregate.outcome !== 'plan_ready') {
    return { kind: 'refused', reason: 'request_not_ready' }
  }
  const model = await ports.loadActionCapabilityModel(current.aggregate, action)
  if (model === undefined) {
    return { kind: 'needs_attention', reason: 'capability_graph_changed' }
  }
  const existing = await ports.loadActionPreparation({
    requestId: args.requestId,
    requestRevision: args.expectedRevision,
    actionId: args.actionId,
  })
  const projected = projectActionPreparation({
    aggregate: current.aggregate,
    actionId: args.actionId,
    model,
    now: existing?.recordedAt ?? args.now,
  })
  if (projected.kind === 'stale' || (projected.kind === 'refused' && projected.reason === 'preparation_incompatible')) {
    return { kind: 'needs_attention', reason: 'capability_graph_changed' }
  }
  if (projected.kind === 'refused' && projected.reason === 'preparation_recipient_unsupported') {
    return { kind: 'needs_attention', reason: 'preparation_recipient_unsupported' }
  }
  if (projected.kind === 'refused') return { kind: 'refused', reason: 'action_not_found' }
  if (existing !== null && !samePreparationProjectionIdentity(existing.preparation, projected)) {
    return { kind: 'needs_attention', reason: 'capability_graph_changed' }
  }

  let preparation: DurableActionPreparation = existing === null
    ? projected
    : structuredClone(existing.preparation)
  let approval: ReturnType<typeof authorizeActionPreparation>['approval'] | undefined
  if (args.preparationRef !== undefined) {
    if (existing === null || existing.preparation.kind !== 'needs_authority'
      || args.preparationRef !== existing.preparation.preparationRef) {
      return { kind: 'refused', reason: 'authority_reference_invalid' }
    }
    if (args.approvalActor === undefined) return { kind: 'refused', reason: 'authority_invalid' }
    try {
      const authorized = authorizeActionPreparation({
        preparation: structuredClone(existing.preparation) as Extract<
          DurableActionPreparation,
          { kind: 'needs_authority' }
        >,
        preparationRef: args.preparationRef,
        commandDigest: args.commandDigest,
        actor: args.approvalActor,
      })
      preparation = authorized.preparation
      approval = authorized.approval
    } catch {
      return { kind: 'refused', reason: 'authority_invalid' }
    }
  } else if (args.approvalActor !== undefined) {
    return { kind: 'refused', reason: 'authority_reference_invalid' }
  }

  const review = await ports.loadDisclosureReview(preparation.disclosureReview.reviewRef)
  if (review !== null && (review.reviewDigest !== preparation.disclosureReview.reviewDigest
    || canonicalDigest(review.lineage as StableHashValue)
      !== canonicalDigest(preparation.lineage as StableHashValue))) {
    throw new Error('customer_request_v2_preparation_review_integrity_failure')
  }
  if (review === null) {
    await ports.insertDisclosureReview({
      reviewRef: preparation.disclosureReview.reviewRef,
      reviewDigest: preparation.disclosureReview.reviewDigest,
      lineage: preparation.lineage,
      review: preparation.disclosureReview,
      recordedAt: args.now,
    })
  }

  if (approval !== undefined) {
    const priorApproval = await ports.loadApprovalEvidence(approval.approvalRef)
    if (priorApproval !== null && (priorApproval.approvalDigest !== approval.approvalDigest
      || priorApproval.reviewDigest !== approval.reviewDigest
      || priorApproval.authorityScopeDigest !== approval.authorityScopeDigest
      || priorApproval.commandDigest !== approval.commandDigest)) {
      throw new Error('customer_request_v2_preparation_approval_integrity_failure')
    }
    if (priorApproval === null) {
      await ports.insertApprovalEvidence({
        approval,
        recordedAt: args.now,
      })
    }
  }

  const reservation = preparation.kind === 'ready_for_routing' ? preparation.authorityReservation : undefined
  if (reservation !== undefined) {
    const priorReservation = await ports.loadAuthorityReservation(reservation.reservationRef)
    if (priorReservation !== null && priorReservation.reservationDigest !== reservation.reservationDigest) {
      throw new Error('customer_request_v2_preparation_authority_integrity_failure')
    }
    if (priorReservation === null) {
      await ports.insertAuthorityReservation({
        reservation,
        recordedAt: args.now,
      })
    }
  }

  if (existing === null) {
    await ports.insertActionPreparation({
      preparation,
      recordedAt: preparation.preparedAt,
      updatedAt: args.now,
    })
  } else if (existing.preparationDigest !== preparation.preparationDigest) {
    await ports.patchActionPreparation({
      preparationId: existing.preparationId,
      preparation,
      updatedAt: args.now,
    })
  }

  await ports.insertPreparationCommand({
    commandKey: args.commandKey,
    commandDigest: args.commandDigest,
    principalId: args.principalId,
    ...(approval === undefined ? {} : { authorityReference: approval.approvalRef }),
    preparation,
    committedAt: args.now,
  })
  return { kind: 'stored', preparation: structuredClone(preparation) }
}
