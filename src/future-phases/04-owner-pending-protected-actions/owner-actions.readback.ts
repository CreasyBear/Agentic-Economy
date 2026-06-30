import type { BusinessId, OwnerId } from '@/modules/common/ids'
import {
  createEmptyContactFollowUpSourceState,
  listOwnerContactFollowUpQueue,
  readContactFollowUpReconstruction,
  type ContactFollowUpProposalQueueItem,
  type ContactFollowUpReconstruction,
  type ContactFollowUpSourceState,
} from '@/modules/protected-action/public'

export type OwnerContactFollowUpRouteInput = {
  state?: ContactFollowUpSourceState
  ownerId?: OwnerId
  businessId?: BusinessId
}

export type OwnerContactFollowUpRouteReadback = {
  queue: readonly ContactFollowUpProposalQueueItem[]
  reconstructions: readonly ContactFollowUpReconstruction[]
}

export type OwnerContactFollowUpSummary = {
  title: string
  description: string
  badge: string
  facts: readonly OwnerContactFollowUpFact[]
}

export type OwnerContactFollowUpFact = {
  label: string
  value: string
}

const defaultOwnerId = 'owner:contact-follow-up' as OwnerId

export function readOwnerContactFollowUpRouteReadback(
  input: OwnerContactFollowUpRouteInput = {}
): OwnerContactFollowUpRouteReadback {
  const state = input.state ?? createEmptyContactFollowUpSourceState()
  const ownerId = input.ownerId ?? defaultOwnerId
  const queue = listOwnerContactFollowUpQueue(state, ownerId, input.businessId)
  return {
    queue,
    reconstructions: queue.map((item) => readContactFollowUpReconstruction(state, item.proposal.id)),
  }
}

export function summarizeOwnerContactFollowUpItem(item: ContactFollowUpProposalQueueItem): OwnerContactFollowUpSummary {
  const policy = item.policy?.kind ?? 'not_checked'
  const decision = item.ownerDecision?.decision ?? 'waiting'
  const receiptKind = item.receipt?.kind ?? 'none'
  return {
    title: item.proposal.parameters.contactName,
    description: item.proposal.parameters.messageSummary,
    badge: item.proposal.status.replaceAll('_', ' '),
    facts: [
      { label: 'Request', value: item.proposal.selectedActionSlug },
      { label: 'Channel', value: item.proposal.parameters.contactChannel },
      { label: 'Policy', value: policy.replaceAll('_', ' ') },
      { label: 'Owner decision', value: decision.replaceAll('_', ' ') },
      { label: 'Receipt or gap', value: receiptKind.replaceAll('_', ' ') },
      { label: 'Correlation', value: item.proposal.correlationId },
    ],
  }
}
