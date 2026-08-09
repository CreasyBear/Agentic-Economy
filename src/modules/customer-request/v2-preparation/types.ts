import type { CapabilityDecisionModel } from '@/modules/capability-contract/public'
import type { CustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import type {
  ActionPreparationApprovalEvidence,
  ActionPreparationAuthorityReservation,
  ActionPreparationDisclosureReview,
  ActionPreparationLineage,
  DurableActionPreparation,
  VerifiedActionPreparationApprovalActor,
} from '@/modules/customer-request/action-preparation'

export type PrepareActionPreparationArgs = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  requestId: string
  expectedRevision: number
  actionId: string
  preparationRef?: string
  approvalActor?: VerifiedActionPreparationApprovalActor
  now: number
}>

export type PrepareActionPreparationResult =
  | Readonly<{ kind: 'stored'; preparation: DurableActionPreparation }>
  | Readonly<{ kind: 'replayed'; preparation: DurableActionPreparation }>
  | Readonly<{
    kind: 'conflict'
    reason: 'revision_changed' | 'idempotency_key_reused'
  }>
  | Readonly<{
    kind: 'needs_attention'
    reason:
      | 'capability_graph_changed'
      | 'preparation_recipient_unsupported'
  }>
  | Readonly<{
    kind: 'refused'
    reason:
      | 'request_not_found'
      | 'action_not_found'
      | 'request_not_ready'
      | 'authority_reference_invalid'
      | 'authority_invalid'
  }>

export type ResumeActionPreparationArgs = Readonly<{
  requestId: string
  requestRevision: number
  actionId: string
  principalId: string
  now: number
}>

export type ResumeActionPreparationResult =
  | Readonly<{ kind: 'current'; preparation: DurableActionPreparation }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'stale' }>

export type PreparationCommandRow = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  lineage: ActionPreparationLineage
  preparationRef: string
  preparationDigest: string
  result: DurableActionPreparation
  authorityReference?: string
  committedAt: number
}>

export type ActionPreparationRow = Readonly<{
  preparationId: string
  preparationRef: string
  preparationDigest: string
  requestId: string
  requestRevision: number
  actionId: string
  lineage: ActionPreparationLineage
  preparation: DurableActionPreparation
  recordedAt: number
  updatedAt: number
}>

export type DisclosureReviewRow = Readonly<{
  reviewRef: string
  reviewDigest: string
  lineage: ActionPreparationLineage
  review: ActionPreparationDisclosureReview
  recordedAt: number
}>

export type ApprovalEvidenceRow = Readonly<{
  approvalRef: string
  approvalDigest: string
  preparationRef: string
  reviewRef: string
  reviewDigest: string
  authorityScopeDigest: string
  principalId: string
  ownerId: string
  credentialId: string
  lineage: ActionPreparationLineage
  commandDigest: string
  approval: ActionPreparationApprovalEvidence
  recordedAt: number
}>

export type AuthorityReservationRow = Readonly<{
  reservationRef: string
  reservationDigest: string
  authorityReference: string
  lineage: ActionPreparationLineage
  reservation: ActionPreparationAuthorityReservation
  recordedAt: number
}>

export type CurrentAggregateLoad =
  | Readonly<{ kind: 'current'; aggregate: CustomerRequestV2Aggregate }>
  | Readonly<{ kind: 'not_found' }>

export type RequestHeadSnapshot = Readonly<{
  requestId: string
  principalId: string
  currentRevision: number
  currentAggregateDigest: string
}>

export type RevisionLoad =
  | Readonly<{ kind: 'current'; aggregate: CustomerRequestV2Aggregate }>

export type PlanAction = CustomerRequestV2Aggregate['plan']['actions'][number]

export type { CapabilityDecisionModel }
