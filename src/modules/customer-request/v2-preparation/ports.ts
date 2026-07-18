import type { CapabilityDecisionModel } from '@/modules/capability-contract/public'
import type { CustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import type {
  ActionPreparationApprovalEvidence,
  ActionPreparationAuthorityReservation,
  DurableActionPreparation,
} from '@/modules/customer-request/action-preparation'

import type {
  ActionPreparationRow,
  ApprovalEvidenceRow,
  AuthorityReservationRow,
  CurrentAggregateLoad,
  DisclosureReviewRow,
  PlanAction,
  PreparationCommandRow,
  RequestHeadSnapshot,
  RevisionLoad,
} from './types'

export type CustomerRequestV2PreparationPorts = Readonly<{
  loadPreparationCommand: (commandKey: string) => Promise<PreparationCommandRow | null>

  verifyPreparationCommandReplay: (
    command: PreparationCommandRow,
  ) => Promise<DurableActionPreparation>

  loadCurrentAggregate: (requestId: string) => Promise<CurrentAggregateLoad>

  loadActionCapabilityModel: (
    aggregate: CustomerRequestV2Aggregate,
    action: PlanAction,
  ) => Promise<CapabilityDecisionModel | undefined>

  loadActionPreparation: (input: Readonly<{
    requestId: string
    requestRevision: number
    actionId: string
  }>) => Promise<ActionPreparationRow | null>

  loadDisclosureReview: (reviewRef: string) => Promise<DisclosureReviewRow | null>

  insertDisclosureReview: (input: Readonly<{
    reviewRef: string
    reviewDigest: string
    lineage: DurableActionPreparation['lineage']
    review: DurableActionPreparation['disclosureReview']
    recordedAt: number
  }>) => Promise<void>

  loadApprovalEvidence: (approvalRef: string) => Promise<ApprovalEvidenceRow | null>

  insertApprovalEvidence: (input: Readonly<{
    approval: ActionPreparationApprovalEvidence
    recordedAt: number
  }>) => Promise<void>

  loadAuthorityReservation: (
    reservationRef: string,
  ) => Promise<AuthorityReservationRow | null>

  insertAuthorityReservation: (input: Readonly<{
    reservation: ActionPreparationAuthorityReservation
    recordedAt: number
  }>) => Promise<void>

  insertActionPreparation: (input: Readonly<{
    preparation: DurableActionPreparation
    recordedAt: number
    updatedAt: number
  }>) => Promise<void>

  patchActionPreparation: (input: Readonly<{
    preparationId: string
    preparation: DurableActionPreparation
    updatedAt: number
  }>) => Promise<void>

  insertPreparationCommand: (input: Readonly<{
    commandKey: string
    commandDigest: string
    principalId: string
    authorityReference?: string
    preparation: DurableActionPreparation
    committedAt: number
  }>) => Promise<void>

  loadRequestHead: (requestId: string) => Promise<RequestHeadSnapshot | null>

  loadVerifiedRevision: (input: Readonly<{
    requestId: string
    requestRevision: number
    expectedAggregateDigest: string
  }>) => Promise<RevisionLoad>
}>
