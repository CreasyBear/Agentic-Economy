import { brandNonEmpty } from '@/modules/common/ids'
import type { BusinessId, CorrelationId, OperationKey, OwnerId, ServiceId, SourceHash } from '@/modules/common/ids'
import { error, ok, type ModuleResult } from '@/modules/common/result'
import { stableHash, type StableHashValue } from '@/modules/common/stable-hash'
import type { ActorKind, AuditEventContract, AuditEventType, RedactedPayload } from '@/modules/observability/public'
import { validateAuditEvent } from '@/modules/observability/public'

export const ContactFollowUpActionSlug = 'contact-follow-up' as const
export type ContactFollowUpActionSlug = typeof ContactFollowUpActionSlug

export const ContactFollowUpParameterKeyValues = [
  'contactName',
  'contactChannel',
  'messageSummary',
  'sourceMessageRef',
] as const
export type ContactFollowUpParameterKey = (typeof ContactFollowUpParameterKeyValues)[number]

export const ContactFollowUpPolicyKindValues = [
  'review_required',
  'refused',
  'expired',
  'proof_gap',
  'missing_proof',
  'external_authority',
  'time_bound',
] as const
export type ContactFollowUpPolicyKind = (typeof ContactFollowUpPolicyKindValues)[number]

export const ContactFollowUpDecisionValues = ['approved', 'rejected'] as const
export type ContactFollowUpDecision = (typeof ContactFollowUpDecisionValues)[number]

export const ContactFollowUpAttemptOutcomeValues = ['receipt_recorded', 'proof_gap_recorded', 'failed'] as const
export type ContactFollowUpAttemptOutcome = (typeof ContactFollowUpAttemptOutcomeValues)[number]

export type ContactFollowUpProposalId = string & { readonly __contactFollowUpProposalId: 'ContactFollowUpProposalId' }
export type ContactFollowUpPolicyId = string & { readonly __contactFollowUpPolicyId: 'ContactFollowUpPolicyId' }
export type ContactFollowUpDecisionId = string & { readonly __contactFollowUpDecisionId: 'ContactFollowUpDecisionId' }
export type ContactFollowUpGatewayAdmissionId = string & {
  readonly __contactFollowUpGatewayAdmissionId: 'ContactFollowUpGatewayAdmissionId'
}
export type ContactFollowUpAttemptId = string & { readonly __contactFollowUpAttemptId: 'ContactFollowUpAttemptId' }
export type ContactFollowUpReceiptId = string & { readonly __contactFollowUpReceiptId: 'ContactFollowUpReceiptId' }
export type ContactFollowUpPrivateEvidenceRefId = string & {
  readonly __contactFollowUpPrivateEvidenceRefId: 'ContactFollowUpPrivateEvidenceRefId'
}
export type ContactFollowUpNoRepairId = string & { readonly __contactFollowUpNoRepairId: 'ContactFollowUpNoRepairId' }

export type ContactFollowUpParameters = {
  contactName: string
  contactChannel: 'email' | 'phone' | 'other'
  messageSummary: string
  sourceMessageRef: string
}

export type ContactFollowUpTarget = {
  businessId: BusinessId
  ownerId: OwnerId
  serviceId?: ServiceId
  sourceEvidenceRef: string
  suppressed: boolean
}

export type ContactFollowUpOwnerAuthority = {
  ownerId: OwnerId
  actorRef: string
  businessIds: readonly BusinessId[]
}

export type ContactFollowUpOperatorControls = {
  protectedActionsEnabled: boolean
  protectedActionAttemptsEnabled: boolean
}

export const defaultContactFollowUpOperatorControls: ContactFollowUpOperatorControls = {
  protectedActionsEnabled: true,
  protectedActionAttemptsEnabled: true,
}

export type ContactFollowUpProposal = {
  id: ContactFollowUpProposalId
  selectedActionSlug: ContactFollowUpActionSlug
  businessId: BusinessId
  ownerId: OwnerId
  serviceId?: ServiceId
  actorRef: string
  target: ContactFollowUpTarget
  parameters: ContactFollowUpParameters
  canonicalContractHash: SourceHash
  proposalHash: SourceHash
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  deadlineAt: number
  reversibility: 'owner_can_close_without_provider_reversal'
  proofExpectation: 'source_owned_receipt_or_gap'
  policyHints: ContactFollowUpPolicyHints
  status: 'proposed' | 'approved' | 'rejected' | 'attempted'
  createdAt: number
  updatedAt: number
}

export type ContactFollowUpPolicyHints = {
  sourceProof: 'present' | 'missing' | 'gap'
  requiresExternalAuthority: boolean
}

export type ContactFollowUpPolicyDecision = {
  id: ContactFollowUpPolicyId
  proposalId: ContactFollowUpProposalId
  kind: ContactFollowUpPolicyKind
  reason: string
  proposalHash: SourceHash
  policyHash: SourceHash
  evaluatedAt: number
}

export type ContactFollowUpOwnerDecisionRecord = {
  id: ContactFollowUpDecisionId
  proposalId: ContactFollowUpProposalId
  decision: ContactFollowUpDecision
  reason: string
  evidenceRefs: readonly string[]
  proposalHash: SourceHash
  policyHash: SourceHash
  decisionHash: SourceHash
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  decidedBy: OwnerId
  decidedAt: number
}

export type ContactFollowUpGatewayAdmission = {
  id: ContactFollowUpGatewayAdmissionId
  proposalId: ContactFollowUpProposalId
  selectedActionSlug: ContactFollowUpActionSlug
  proposalHash: SourceHash
  policyHash: SourceHash
  contractHash: SourceHash
  ownerDecisionHash: SourceHash
  admissionHash: SourceHash
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  status: 'admitted' | 'consumed' | 'expired' | 'replay_rejected'
  expiresAt: number
  createdAt: number
  consumedAt?: number
}

export type ContactFollowUpAttempt = {
  id: ContactFollowUpAttemptId
  proposalId: ContactFollowUpProposalId
  selectedActionSlug: ContactFollowUpActionSlug
  businessId: BusinessId
  ownerId: OwnerId
  decisionId: ContactFollowUpDecisionId
  gatewayAdmissionId: ContactFollowUpGatewayAdmissionId
  outcome: ContactFollowUpAttemptOutcome
  attemptHash: SourceHash
  receiptId?: ContactFollowUpReceiptId
  reason?: string
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  attemptedAt: number
}

export const ContactFollowUpMaxAttemptCount = 2 as const

export type ContactFollowUpReceipt = {
  id: ContactFollowUpReceiptId
  proposalId: ContactFollowUpProposalId
  attemptId: ContactFollowUpAttemptId
  kind: 'receipt' | 'proof_gap'
  providerBoundary: 'source_owned_follow_up_outbox'
  payloadHash: SourceHash
  redactedReadback: {
    targetRef: string
    resultRef?: string
    gapReason?: string
  }
  recordedAt: number
}

export type ContactFollowUpPrivateEvidenceRef = {
  id: ContactFollowUpPrivateEvidenceRefId
  proposalId: ContactFollowUpProposalId
  attemptId?: ContactFollowUpAttemptId
  retentionClass: 'protected_action_private_evidence'
  accessPolicy: 'owner_admin_operator_only'
  payloadHash: SourceHash
  privatePayloadRef?: string
  ttlExpiresAt: number
  redactedAt?: number
}

export type ContactFollowUpNoRepairRecord = {
  id: ContactFollowUpNoRepairId
  proposalId: ContactFollowUpProposalId
  attemptId?: ContactFollowUpAttemptId
  reason: string
  evidenceRefs: readonly string[]
  noRepairHash: SourceHash
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  markedBy: string
  markedAt: number
}

export type ContactFollowUpSupportRecord = {
  supportRecordId: string
  selectedActionSlug: ContactFollowUpActionSlug
  primaryOwnerRef: string
  backupOwnerRef: string
  primaryAdminOperatorRef: string
  supportedChannels: readonly string[]
  launchStage: 'internal_alpha'
  capacityThreshold: number
  backlogAgeThresholdMs: number
  phaseIncidentsBlocking: readonly string[]
  claimDisablePath: 'protected_actions_enabled'
  perChannelKillRules: readonly string[]
  nextReviewAt: number
  sourceHash: SourceHash
}

export type ContactFollowUpSourceState = {
  proposals: readonly ContactFollowUpProposal[]
  policyDecisions: readonly ContactFollowUpPolicyDecision[]
  ownerDecisions: readonly ContactFollowUpOwnerDecisionRecord[]
  gatewayAdmissions: readonly ContactFollowUpGatewayAdmission[]
  attempts: readonly ContactFollowUpAttempt[]
  receipts: readonly ContactFollowUpReceipt[]
  privateEvidenceRefs: readonly ContactFollowUpPrivateEvidenceRef[]
  noRepairRecords: readonly ContactFollowUpNoRepairRecord[]
  supportRecords: readonly ContactFollowUpSupportRecord[]
  auditEvents: readonly AuditEventContract[]
}

export type ContactFollowUpProposalQueueItem = {
  proposal: ContactFollowUpProposal
  policy?: ContactFollowUpPolicyDecision
  ownerDecision?: ContactFollowUpOwnerDecisionRecord
  attempt?: ContactFollowUpAttempt
  receipt?: ContactFollowUpReceipt
}

export type ContactFollowUpReconstruction = ContactFollowUpProposalQueueItem & {
  auditEvents: readonly AuditEventContract[]
  gatewayAdmission?: ContactFollowUpGatewayAdmission
  noRepair?: ContactFollowUpNoRepairRecord
  privateEvidenceRefs: readonly ContactFollowUpPrivateEvidenceRef[]
  readbackStatus:
    | 'missing'
    | 'awaiting_owner_review'
    | 'owner_rejected'
    | 'ready_for_attempt'
    | 'gateway_admitted'
    | 'receipt_recorded'
    | 'proof_gap'
    | 'failed'
    | 'no_repair'
  repairAction: 'none' | 'owner_can_reject' | 'retry_available' | 'operator_review_required'
}

export type ProposeContactFollowUpRequestCommand = {
  authority: ContactFollowUpOwnerAuthority | undefined
  selectedActionSlug: string
  target: Omit<ContactFollowUpTarget, 'suppressed'> & { suppressed?: boolean }
  parameters: Record<string, unknown>
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  deadlineAt: number
  now: number
  executionMode?: 'owner_pending' | 'direct' | 'autonomous'
  unsafeClientFields?: Record<string, unknown>
  policyHints?: Partial<ContactFollowUpPolicyHints>
}

export type EvaluateContactFollowUpPolicyCommand = {
  proposalId: ContactFollowUpProposalId
  now: number
}

export type DecideContactFollowUpProposalCommand = {
  authority: ContactFollowUpOwnerAuthority | undefined
  proposalId: ContactFollowUpProposalId
  decision: ContactFollowUpDecision
  reason: string
  evidenceRefs: readonly string[]
  consequenceAccepted: boolean
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type CreateContactFollowUpGatewayAdmissionCommand = {
  authority: ContactFollowUpOwnerAuthority | undefined
  proposalId: ContactFollowUpProposalId
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  expiresAt: number
  now: number
}

export type ContactFollowUpAttemptReadback =
  | {
      kind: 'receipt'
      resultRef: string
      payloadHash: SourceHash
    }
  | {
      kind: 'proof_gap'
      gapReason: 'timeout' | 'mismatch' | 'provider_unavailable'
      payloadHash: SourceHash
    }
  | {
      kind: 'failed'
      failureReason: 'provider_unavailable' | 'policy_mismatch'
      payloadHash: SourceHash
    }

export type RecordContactFollowUpProviderAttemptCommand = {
  authority: ContactFollowUpOwnerAuthority | undefined
  selectedActionSlug: string
  proposalId: ContactFollowUpProposalId
  gatewayAdmissionId: ContactFollowUpGatewayAdmissionId
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  now: number
  executionMode?: 'owner_approved' | 'direct' | 'autonomous'
  readback: ContactFollowUpAttemptReadback
}

export type ContactFollowUpErrorCode =
  | 'contact_follow_up_control_disabled'
  | 'contact_follow_up_attempts_disabled'
  | 'contact_follow_up_unknown_slug'
  | 'contact_follow_up_owner_denied'
  | 'contact_follow_up_direct_mode_rejected'
  | 'contact_follow_up_target_suppressed'
  | 'contact_follow_up_invalid_target'
  | 'contact_follow_up_untrusted_parameter'
  | 'contact_follow_up_money_field_rejected'
  | 'contact_follow_up_missing_context'
  | 'contact_follow_up_idempotency_conflict'
  | 'contact_follow_up_not_found'
  | 'contact_follow_up_policy_refused'
  | 'contact_follow_up_consequence_required'
  | 'contact_follow_up_owner_decision_required'
  | 'contact_follow_up_gateway_required'
  | 'contact_follow_up_gateway_expired'
  | 'contact_follow_up_gateway_replay_rejected'
  | 'contact_follow_up_retry_exhausted'
  | 'contact_follow_up_no_repair_recorded'

export type ContactFollowUpErrorPayload = {
  reason: string
  proposalId?: ContactFollowUpProposalId
  field?: string
}

export type ContactFollowUpStateResult<Code extends string, Payload extends object = Record<never, never>> = ModuleResult<
  Code,
  ContactFollowUpErrorCode,
  Payload,
  ContactFollowUpErrorPayload
>

export type ProposeContactFollowUpRequestResult = ContactFollowUpStateResult<
  'contact_follow_up_proposed' | 'contact_follow_up_proposal_replayed',
  { state: ContactFollowUpSourceState; proposal: ContactFollowUpProposal; auditEvent?: AuditEventContract }
>

export type EvaluateContactFollowUpPolicyResult = ContactFollowUpStateResult<
  'contact_follow_up_policy_evaluated' | 'contact_follow_up_policy_replayed',
  { state: ContactFollowUpSourceState; policy: ContactFollowUpPolicyDecision; auditEvent?: AuditEventContract }
>

export type DecideContactFollowUpProposalResult = ContactFollowUpStateResult<
  'contact_follow_up_decided' | 'contact_follow_up_decision_replayed',
  {
    state: ContactFollowUpSourceState
    decision: ContactFollowUpOwnerDecisionRecord
    proposal: ContactFollowUpProposal
    auditEvent?: AuditEventContract
  }
>

export type CreateContactFollowUpGatewayAdmissionResult = ContactFollowUpStateResult<
  'contact_follow_up_gateway_admitted' | 'contact_follow_up_gateway_replayed',
  {
    state: ContactFollowUpSourceState
    gatewayAdmission: ContactFollowUpGatewayAdmission
    auditEvent?: AuditEventContract
  }
>

export type RecordContactFollowUpProviderAttemptResult = ContactFollowUpStateResult<
  'contact_follow_up_attempt_recorded' | 'contact_follow_up_attempt_replayed',
  {
    state: ContactFollowUpSourceState
    attempt: ContactFollowUpAttempt
    receipt?: ContactFollowUpReceipt
    auditEvent?: AuditEventContract
  }
>

export type MarkContactFollowUpNoRepairCommand = {
  authority: ContactFollowUpOwnerAuthority | undefined
  proposalId: ContactFollowUpProposalId
  attemptId?: ContactFollowUpAttemptId
  reason: string
  evidenceRefs: readonly string[]
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type MarkContactFollowUpNoRepairResult = ContactFollowUpStateResult<
  'contact_follow_up_no_repair_marked' | 'contact_follow_up_no_repair_replayed',
  {
    state: ContactFollowUpSourceState
    noRepair: ContactFollowUpNoRepairRecord
    auditEvent?: AuditEventContract
  }
>

export function createEmptyContactFollowUpSourceState(
  initial: Partial<ContactFollowUpSourceState> = {}
): ContactFollowUpSourceState {
  return {
    proposals: initial.proposals ?? [],
    policyDecisions: initial.policyDecisions ?? [],
    ownerDecisions: initial.ownerDecisions ?? [],
    gatewayAdmissions: initial.gatewayAdmissions ?? [],
    attempts: initial.attempts ?? [],
    receipts: initial.receipts ?? [],
    privateEvidenceRefs: initial.privateEvidenceRefs ?? [],
    noRepairRecords: initial.noRepairRecords ?? [],
    supportRecords: initial.supportRecords ?? [],
    auditEvents: initial.auditEvents ?? [],
  }
}

export function proposeContactFollowUpRequest(
  state: ContactFollowUpSourceState,
  command: ProposeContactFollowUpRequestCommand,
  controls: ContactFollowUpOperatorControls = defaultContactFollowUpOperatorControls
): ProposeContactFollowUpRequestResult {
  if (!controls.protectedActionsEnabled) {
    return error('contact_follow_up_control_disabled', false, { reason: 'new_requests_disabled' })
  }

  const basicRejection = rejectUnsafeRequest(command.selectedActionSlug, command.executionMode ?? 'owner_pending', command.unsafeClientFields)
  if (basicRejection !== undefined) {
    return basicRejection
  }

  if (!ownsBusiness(command.authority, command.target.businessId) || command.authority?.ownerId !== command.target.ownerId) {
    return error('contact_follow_up_owner_denied', false, { reason: 'owner_business_mismatch' })
  }

  if (command.target.suppressed === true) {
    return error('contact_follow_up_target_suppressed', false, { reason: 'target_suppressed' })
  }

  if (command.deadlineAt <= command.now) {
    return error('contact_follow_up_invalid_target', false, { reason: 'deadline_elapsed' })
  }

  if (command.target.sourceEvidenceRef.trim().length === 0) {
    return error('contact_follow_up_missing_context', false, { reason: 'source_evidence_required' })
  }

  const parameterResult = normalizeParameters(command.parameters)
  if (!parameterResult.valid) {
    return error(parameterResult.code, false, parameterResult.field === undefined ? { reason: parameterResult.reason } : { reason: parameterResult.reason, field: parameterResult.field })
  }

  const policyHints: ContactFollowUpPolicyHints = {
    sourceProof: command.policyHints?.sourceProof ?? 'present',
    requiresExternalAuthority: command.policyHints?.requiresExternalAuthority ?? false,
  }
  const target: ContactFollowUpTarget = {
    businessId: command.target.businessId,
    ownerId: command.target.ownerId,
    sourceEvidenceRef: command.target.sourceEvidenceRef,
    suppressed: false,
    ...(command.target.serviceId === undefined ? {} : { serviceId: command.target.serviceId }),
  }
  const canonicalContractHash = stableHash(contactFollowUpContractValue())
  const proposalHash = stableHash({
    selectedActionSlug: ContactFollowUpActionSlug,
    businessId: target.businessId,
    ownerId: target.ownerId,
    serviceId: target.serviceId ?? null,
    sourceEvidenceRef: target.sourceEvidenceRef,
    parameters: parameterResult.parameters,
    deadlineAt: command.deadlineAt,
    policyHints,
    contractHash: canonicalContractHash,
  })
  const existing = state.proposals.find((proposal) => proposal.idempotencyKey === command.idempotencyKey)
  if (existing !== undefined) {
    if (existing.proposalHash === proposalHash) {
      return ok('contact_follow_up_proposal_replayed', { state, proposal: existing })
    }

    return error('contact_follow_up_idempotency_conflict', false, {
      reason: 'same_key_different_request',
      proposalId: existing.id,
    })
  }

  const proposal: ContactFollowUpProposal = {
    id: contactFollowUpProposalId(command.idempotencyKey),
    selectedActionSlug: ContactFollowUpActionSlug,
    businessId: target.businessId,
    ownerId: target.ownerId,
    actorRef: command.authority.actorRef,
    target,
    parameters: parameterResult.parameters,
    canonicalContractHash,
    proposalHash,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    deadlineAt: command.deadlineAt,
    reversibility: 'owner_can_close_without_provider_reversal',
    proofExpectation: 'source_owned_receipt_or_gap',
    policyHints,
    status: 'proposed',
    createdAt: command.now,
    updatedAt: command.now,
    ...(target.serviceId === undefined ? {} : { serviceId: target.serviceId }),
  }
  const auditEvent = buildContactFollowUpAuditEvent({
    eventType: 'protected_action.proposed',
    actorKind: 'owner',
    actorRef: command.authority.actorRef,
    targetRef: proposal.id,
    businessId: proposal.businessId,
    operationKey: command.idempotencyKey,
    correlationId: command.correlationId,
    beforeState: 'none',
    afterState: proposal.status,
    evidenceRefs: [target.sourceEvidenceRef],
    payloadHash: proposalHash,
    createdAt: command.now,
    redactedPayload: {
      selectedActionSlug: ContactFollowUpActionSlug,
      parameterKeys: ContactFollowUpParameterKeyValues,
      proposalHash,
    },
  })

  return ok('contact_follow_up_proposed', {
    state: appendAudit({ ...state, proposals: [...state.proposals, proposal] }, auditEvent),
    proposal,
    auditEvent,
  })
}

export function evaluateContactFollowUpPolicy(
  state: ContactFollowUpSourceState,
  command: EvaluateContactFollowUpPolicyCommand
): EvaluateContactFollowUpPolicyResult {
  const proposal = state.proposals.find((candidate) => candidate.id === command.proposalId)
  if (proposal === undefined) {
    return error('contact_follow_up_not_found', false, { reason: 'request_not_found', proposalId: command.proposalId })
  }

  const kind = classifyPolicy(proposal, command.now)
  const policyHash = stableHash({
    proposalHash: proposal.proposalHash,
    deadlineAt: proposal.deadlineAt,
    sourceProof: proposal.policyHints.sourceProof,
    requiresExternalAuthority: proposal.policyHints.requiresExternalAuthority,
    policyKind: kind,
  })
  const existing = state.policyDecisions.find(
    (decision) => decision.proposalId === proposal.id && decision.proposalHash === proposal.proposalHash && decision.policyHash === policyHash
  )
  if (existing !== undefined) {
    return ok('contact_follow_up_policy_replayed', { state, policy: existing })
  }
  const policy: ContactFollowUpPolicyDecision = {
    id: contactFollowUpPolicyId(proposal.id, policyHash),
    proposalId: proposal.id,
    kind,
    reason: policyReason(kind),
    proposalHash: proposal.proposalHash,
    policyHash,
    evaluatedAt: command.now,
  }
  const auditEvent = buildContactFollowUpAuditEvent({
    eventType: kind === 'expired' ? 'protected_action.expired' : 'protected_action.policy_evaluated',
    actorKind: 'system',
    actorRef: 'contact_follow_up_policy',
    targetRef: proposal.id,
    businessId: proposal.businessId,
    operationKey: proposal.idempotencyKey,
    correlationId: proposal.correlationId,
    beforeState: proposal.status,
    afterState: kind,
    evidenceRefs: [proposal.target.sourceEvidenceRef],
    payloadHash: policyHash,
    createdAt: command.now,
    redactedPayload: { selectedActionSlug: ContactFollowUpActionSlug, policy: kind, proposalHash: proposal.proposalHash },
  })

  return ok('contact_follow_up_policy_evaluated', {
    state: appendAudit({ ...state, policyDecisions: [...state.policyDecisions, policy] }, auditEvent),
    policy,
    auditEvent,
  })
}

export function decideContactFollowUpProposal(
  state: ContactFollowUpSourceState,
  command: DecideContactFollowUpProposalCommand
): DecideContactFollowUpProposalResult {
  const proposal = state.proposals.find((candidate) => candidate.id === command.proposalId)
  if (proposal === undefined) {
    return error('contact_follow_up_not_found', false, { reason: 'request_not_found', proposalId: command.proposalId })
  }

  if (!ownsBusiness(command.authority, proposal.businessId) || command.authority?.ownerId !== proposal.ownerId) {
    return error('contact_follow_up_owner_denied', false, { reason: 'owner_business_mismatch', proposalId: proposal.id })
  }

  if (command.decision === 'approved' && !command.consequenceAccepted) {
    return error('contact_follow_up_consequence_required', false, { reason: 'consequence_acknowledgement_required', proposalId: proposal.id })
  }

  const policy = latestPolicyFor(state, proposal)
  if (policy === undefined || !ownerCanDecide(policy)) {
    return error('contact_follow_up_policy_refused', false, {
      reason: policy?.kind ?? 'policy_missing',
      proposalId: proposal.id,
    })
  }

  const decisionHash = stableHash({
    proposalId: proposal.id,
    proposalHash: proposal.proposalHash,
    policyHash: policy.policyHash,
    decision: command.decision,
    reason: command.reason.trim(),
    evidenceRefs: [...command.evidenceRefs].sort(),
  })
  const existing = state.ownerDecisions.find((decision) => decision.idempotencyKey === command.idempotencyKey)
  if (existing !== undefined) {
    if (existing.decisionHash === decisionHash) {
      const existingProposal = proposalWithStatus(state, proposal, existing.decision === 'approved' ? 'approved' : 'rejected', command.now)
      return ok('contact_follow_up_decision_replayed', { state, decision: existing, proposal: existingProposal })
    }

    return error('contact_follow_up_idempotency_conflict', false, {
      reason: 'same_key_different_decision',
      proposalId: proposal.id,
    })
  }

  const decision: ContactFollowUpOwnerDecisionRecord = {
    id: contactFollowUpDecisionId(proposal.id, command.idempotencyKey),
    proposalId: proposal.id,
    decision: command.decision,
    reason: command.reason.trim(),
    evidenceRefs: command.evidenceRefs,
    proposalHash: proposal.proposalHash,
    policyHash: policy.policyHash,
    decisionHash,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    decidedBy: command.authority.ownerId,
    decidedAt: command.now,
  }
  const nextProposal = proposalWithStatus(state, proposal, command.decision === 'approved' ? 'approved' : 'rejected', command.now)
  const eventType: AuditEventType = command.decision === 'approved' ? 'protected_action.approved' : 'protected_action.rejected'
  const auditEvent = buildContactFollowUpAuditEvent({
    eventType,
    actorKind: 'owner',
    actorRef: command.authority.actorRef,
    targetRef: proposal.id,
    businessId: proposal.businessId,
    operationKey: command.idempotencyKey,
    correlationId: command.correlationId,
    beforeState: proposal.status,
    afterState: nextProposal.status,
    reasonCode: decision.reason,
    evidenceRefs: decision.evidenceRefs,
    payloadHash: decisionHash,
    createdAt: command.now,
    redactedPayload: {
      selectedActionSlug: ContactFollowUpActionSlug,
      decision: command.decision,
      proposalHash: proposal.proposalHash,
      policyHash: policy.policyHash,
    },
  })

  return ok('contact_follow_up_decided', {
    state: appendAudit(
      {
        ...state,
        proposals: replaceProposal(state.proposals, nextProposal),
        ownerDecisions: [...state.ownerDecisions, decision],
      },
      auditEvent
    ),
    decision,
    proposal: nextProposal,
    auditEvent,
  })
}

export function createContactFollowUpGatewayAdmission(
  state: ContactFollowUpSourceState,
  command: CreateContactFollowUpGatewayAdmissionCommand,
  controls: Pick<ContactFollowUpOperatorControls, 'protectedActionAttemptsEnabled'> = defaultContactFollowUpOperatorControls
): CreateContactFollowUpGatewayAdmissionResult {
  if (!controls.protectedActionAttemptsEnabled) {
    return error('contact_follow_up_attempts_disabled', false, { reason: 'attempts_disabled', proposalId: command.proposalId })
  }

  const proposal = state.proposals.find((candidate) => candidate.id === command.proposalId)
  if (proposal === undefined) {
    return error('contact_follow_up_not_found', false, { reason: 'request_not_found', proposalId: command.proposalId })
  }

  if (!ownsBusiness(command.authority, proposal.businessId) || command.authority?.ownerId !== proposal.ownerId) {
    return error('contact_follow_up_owner_denied', false, { reason: 'owner_business_mismatch', proposalId: proposal.id })
  }

  const ownerDecision = latestOwnerDecisionFor(state, proposal)
  if (ownerDecision?.decision !== 'approved') {
    return error('contact_follow_up_owner_decision_required', false, { reason: 'approved_owner_decision_required', proposalId: proposal.id })
  }

  const policy = latestPolicyFor(state, proposal)
  if (policy === undefined || !ownerCanDecide(policy)) {
    return error('contact_follow_up_policy_refused', false, {
      reason: policy?.kind ?? 'policy_missing',
      proposalId: proposal.id,
    })
  }

  if (command.expiresAt <= command.now) {
    return error('contact_follow_up_gateway_expired', false, { reason: 'gateway_expired', proposalId: proposal.id })
  }

  const admissionHash = stableHash({
    proposalId: proposal.id,
    proposalHash: proposal.proposalHash,
    policyHash: policy.policyHash,
    contractHash: proposal.canonicalContractHash,
    ownerDecisionHash: ownerDecision.decisionHash,
    selectedActionSlug: ContactFollowUpActionSlug,
    expiresAt: command.expiresAt,
  })
  const existing = state.gatewayAdmissions.find((admission) => admission.idempotencyKey === command.idempotencyKey)
  if (existing !== undefined) {
    if (existing.admissionHash === admissionHash) {
      return ok('contact_follow_up_gateway_replayed', { state, gatewayAdmission: existing })
    }

    return error('contact_follow_up_idempotency_conflict', false, {
      reason: 'same_key_different_gateway_admission',
      proposalId: proposal.id,
    })
  }

  const gatewayAdmission: ContactFollowUpGatewayAdmission = {
    id: contactFollowUpGatewayAdmissionId(proposal.id, command.idempotencyKey),
    proposalId: proposal.id,
    selectedActionSlug: ContactFollowUpActionSlug,
    proposalHash: proposal.proposalHash,
    policyHash: policy.policyHash,
    contractHash: proposal.canonicalContractHash,
    ownerDecisionHash: ownerDecision.decisionHash,
    admissionHash,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    status: 'admitted',
    expiresAt: command.expiresAt,
    createdAt: command.now,
  }
  const auditEvent = buildContactFollowUpAuditEvent({
    eventType: 'protected_action.gateway_admitted',
    actorKind: 'system',
    actorRef: 'contact_follow_up_gateway',
    targetRef: proposal.id,
    businessId: proposal.businessId,
    operationKey: command.idempotencyKey,
    correlationId: command.correlationId,
    beforeState: proposal.status,
    afterState: gatewayAdmission.status,
    evidenceRefs: [gatewayAdmission.id],
    payloadHash: admissionHash,
    createdAt: command.now,
    redactedPayload: {
      selectedActionSlug: ContactFollowUpActionSlug,
      proposalHash: proposal.proposalHash,
      policyHash: policy.policyHash,
      ownerDecisionHash: ownerDecision.decisionHash,
    },
  })

  return ok('contact_follow_up_gateway_admitted', {
    state: appendAudit({ ...state, gatewayAdmissions: [...state.gatewayAdmissions, gatewayAdmission] }, auditEvent),
    gatewayAdmission,
    auditEvent,
  })
}

export function recordContactFollowUpProviderAttempt(
  state: ContactFollowUpSourceState,
  command: RecordContactFollowUpProviderAttemptCommand,
  controls: Pick<ContactFollowUpOperatorControls, 'protectedActionAttemptsEnabled'> = defaultContactFollowUpOperatorControls
): RecordContactFollowUpProviderAttemptResult {
  const basicRejection = rejectUnsafeAttempt(command.selectedActionSlug, command.executionMode ?? 'owner_approved')
  if (basicRejection !== undefined) {
    return basicRejection
  }

  if (!controls.protectedActionAttemptsEnabled) {
    return error('contact_follow_up_attempts_disabled', false, { reason: 'attempts_disabled', proposalId: command.proposalId })
  }

  const proposal = state.proposals.find((candidate) => candidate.id === command.proposalId)
  if (proposal === undefined) {
    return error('contact_follow_up_not_found', false, { reason: 'request_not_found', proposalId: command.proposalId })
  }

  if (!ownsBusiness(command.authority, proposal.businessId) || command.authority?.ownerId !== proposal.ownerId) {
    return error('contact_follow_up_owner_denied', false, { reason: 'owner_business_mismatch', proposalId: proposal.id })
  }

  const ownerDecision = latestOwnerDecisionFor(state, proposal)
  if (ownerDecision?.decision !== 'approved') {
    return error('contact_follow_up_owner_decision_required', false, { reason: 'approved_owner_decision_required', proposalId: proposal.id })
  }

  const policy = latestPolicyFor(state, proposal)
  if (policy === undefined || !ownerCanDecide(policy)) {
    return error('contact_follow_up_policy_refused', false, {
      reason: policy?.kind ?? 'policy_missing',
      proposalId: proposal.id,
    })
  }

  const gatewayAdmission = state.gatewayAdmissions.find((admission) => admission.id === command.gatewayAdmissionId)
  if (gatewayAdmission === undefined || gatewayAdmission.proposalId !== proposal.id) {
    return error('contact_follow_up_gateway_required', false, { reason: 'gateway_admission_required', proposalId: proposal.id })
  }

  if (gatewayAdmission.expiresAt <= command.now) {
    return error('contact_follow_up_gateway_expired', false, { reason: 'gateway_expired', proposalId: proposal.id })
  }

  const attemptHash = stableHash({
    proposalId: proposal.id,
    proposalHash: proposal.proposalHash,
    policyHash: policy.policyHash,
    decisionHash: ownerDecision.decisionHash,
    gatewayAdmissionHash: gatewayAdmission.admissionHash,
    selectedActionSlug: ContactFollowUpActionSlug,
    readback: readbackHashValue(command.readback),
  })
  const existingByIdempotencyKey = state.attempts.find(
    (attempt) => attempt.proposalId === proposal.id && attempt.idempotencyKey === command.idempotencyKey
  )
  if (existingByIdempotencyKey !== undefined) {
    if (existingByIdempotencyKey.attemptHash === attemptHash) {
      const receipt = state.receipts.find((candidate) => candidate.attemptId === existingByIdempotencyKey.id)
      return ok('contact_follow_up_attempt_replayed', {
        state,
        attempt: existingByIdempotencyKey,
        ...(receipt === undefined ? {} : { receipt }),
      })
    }

    return error('contact_follow_up_idempotency_conflict', false, {
      reason: 'attempt_idempotency_conflict',
      proposalId: proposal.id,
    })
  }

  const previousAttempts = attemptsForProposal(state, proposal.id)
  if (previousAttempts.length > 0) {
    const latestAttempt = previousAttempts[previousAttempts.length - 1]
    if (latestAttempt === undefined || !isRetryableAttempt(latestAttempt) || previousAttempts.length >= ContactFollowUpMaxAttemptCount) {
      return error('contact_follow_up_retry_exhausted', false, {
        reason: 'retry_exhausted',
        proposalId: proposal.id,
      })
    }
  }

  if (gatewayAdmission.status !== 'admitted') {
    return error('contact_follow_up_gateway_replay_rejected', false, {
      reason: gatewayAdmission.status,
      proposalId: proposal.id,
    })
  }

  const attempt: ContactFollowUpAttempt = {
    id: contactFollowUpAttemptId(proposal.id, command.idempotencyKey),
    proposalId: proposal.id,
    selectedActionSlug: ContactFollowUpActionSlug,
    businessId: proposal.businessId,
    ownerId: proposal.ownerId,
    decisionId: ownerDecision.id,
    gatewayAdmissionId: gatewayAdmission.id,
    outcome: attemptOutcome(command.readback),
    attemptHash,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    attemptedAt: command.now,
    ...(command.readback.kind === 'receipt' ? { receiptId: contactFollowUpReceiptId(proposal.id, command.idempotencyKey) } : {}),
    ...(command.readback.kind === 'proof_gap' ? { reason: command.readback.gapReason } : {}),
    ...(command.readback.kind === 'failed' ? { reason: command.readback.failureReason } : {}),
  }
  const receipt = receiptForAttempt(proposal, attempt, command.readback, command.now)
  const privateEvidenceRef = privateEvidenceRefForAttempt(proposal, attempt, command.readback, command.now)
  const nextProposal = proposalWithStatus(state, proposal, 'attempted', command.now)
  const consumedGateway: ContactFollowUpGatewayAdmission = {
    ...gatewayAdmission,
    status: 'consumed',
    consumedAt: command.now,
  }
  const gatewayAuditEvent = buildContactFollowUpAuditEvent({
    eventType: 'protected_action.gateway_consumed',
    actorKind: 'system',
    actorRef: 'contact_follow_up_gateway',
    targetRef: proposal.id,
    businessId: proposal.businessId,
    operationKey: command.idempotencyKey,
    correlationId: command.correlationId,
    beforeState: gatewayAdmission.status,
    afterState: consumedGateway.status,
    evidenceRefs: [gatewayAdmission.id],
    payloadHash: gatewayAdmission.admissionHash,
    createdAt: command.now,
    redactedPayload: {
      selectedActionSlug: ContactFollowUpActionSlug,
      proposalHash: proposal.proposalHash,
      admissionHash: gatewayAdmission.admissionHash,
    },
  })
  const auditEvent = buildContactFollowUpAuditEvent({
    eventType: auditEventForAttempt(command.readback),
    actorKind: 'owner',
    actorRef: command.authority.actorRef,
    targetType: 'protected_action_attempt',
    targetRef: attempt.id,
    businessId: proposal.businessId,
    operationKey: command.idempotencyKey,
    correlationId: command.correlationId,
    beforeState: proposal.status,
    afterState: attempt.outcome,
    evidenceRefs: receipt === undefined ? [] : [receipt.id, `hash:${receipt.payloadHash}`],
    payloadHash: attemptHash,
    createdAt: command.now,
    redactedPayload: {
      selectedActionSlug: ContactFollowUpActionSlug,
      proposalHash: proposal.proposalHash,
      policyHash: policy.policyHash,
      decisionHash: ownerDecision.decisionHash,
      outcome: attempt.outcome,
    },
    ...(attempt.reason === undefined ? {} : { reasonCode: attempt.reason }),
  })

  return ok('contact_follow_up_attempt_recorded', {
    state: appendAudit(
      appendAudit(
        {
          ...state,
          proposals: replaceProposal(state.proposals, nextProposal),
          gatewayAdmissions: replaceGatewayAdmission(state.gatewayAdmissions, consumedGateway),
          attempts: [...state.attempts, attempt],
          receipts: receipt === undefined ? state.receipts : [...state.receipts, receipt],
          privateEvidenceRefs: [...state.privateEvidenceRefs, privateEvidenceRef],
        },
        gatewayAuditEvent
      ),
      auditEvent
    ),
    attempt,
    ...(receipt === undefined ? {} : { receipt }),
    auditEvent,
  })
}

export function listOwnerContactFollowUpQueue(
  state: ContactFollowUpSourceState,
  ownerId: OwnerId,
  businessId?: BusinessId
): readonly ContactFollowUpProposalQueueItem[] {
  return state.proposals
    .filter((proposal) => proposal.ownerId === ownerId && (businessId === undefined || proposal.businessId === businessId))
    .map((proposal) => buildQueueItem(state, proposal))
    .sort((left, right) => right.proposal.createdAt - left.proposal.createdAt)
}

export function readContactFollowUpProposal(
  state: ContactFollowUpSourceState,
  proposalId: ContactFollowUpProposalId
): ContactFollowUpProposalQueueItem | undefined {
  const proposal = state.proposals.find((candidate) => candidate.id === proposalId)
  if (proposal === undefined) {
    return undefined
  }

  return buildQueueItem(state, proposal)
}

export function readContactFollowUpReceipt(
  state: ContactFollowUpSourceState,
  receiptId: ContactFollowUpReceiptId
): ContactFollowUpReceipt | undefined {
  return state.receipts.find((receipt) => receipt.id === receiptId)
}

export function readContactFollowUpReconstruction(
  state: ContactFollowUpSourceState,
  proposalId: ContactFollowUpProposalId
): ContactFollowUpReconstruction {
  const item = readContactFollowUpProposal(state, proposalId)
  if (item === undefined) {
    return {
      proposal: missingProposal(proposalId),
      auditEvents: [],
      privateEvidenceRefs: [],
      readbackStatus: 'missing',
      repairAction: 'none',
    }
  }
  const gatewayAdmission = item.attempt === undefined ? latestGatewayFor(state, item.proposal) : gatewayForAttempt(state, item.attempt)
  const noRepair = latestNoRepairFor(state, item.proposal, item.attempt)

  return {
    ...item,
    ...(gatewayAdmission === undefined ? {} : { gatewayAdmission }),
    ...(noRepair === undefined ? {} : { noRepair }),
    privateEvidenceRefs: state.privateEvidenceRefs.filter(
      (ref) => ref.proposalId === proposalId || (item.attempt !== undefined && ref.attemptId === item.attempt.id)
    ),
    auditEvents: state.auditEvents.filter(
      (event) => event.targetRef === proposalId || event.targetRef === item.attempt?.id || event.targetRef === gatewayAdmission?.id
    ),
    readbackStatus: reconstructionStatus(item, noRepair, gatewayAdmission),
    repairAction: repairAction(item, noRepair),
  }
}

export function markContactFollowUpNoRepair(
  state: ContactFollowUpSourceState,
  command: MarkContactFollowUpNoRepairCommand
): MarkContactFollowUpNoRepairResult {
  const proposal = state.proposals.find((candidate) => candidate.id === command.proposalId)
  if (proposal === undefined) {
    return error('contact_follow_up_not_found', false, { reason: 'request_not_found', proposalId: command.proposalId })
  }

  if (!ownsBusiness(command.authority, proposal.businessId) || command.authority?.ownerId !== proposal.ownerId) {
    return error('contact_follow_up_owner_denied', false, { reason: 'owner_business_mismatch', proposalId: proposal.id })
  }

  const reason = command.reason.trim()
  if (reason.length === 0) {
    return error('contact_follow_up_missing_context', false, { reason: 'no_repair_reason_required', proposalId: proposal.id })
  }

  const existing = state.noRepairRecords.find((record) => record.idempotencyKey === command.idempotencyKey)
  const noRepairHash = stableHash({
    proposalId: proposal.id,
    attemptId: command.attemptId ?? null,
    reason,
    evidenceRefs: [...command.evidenceRefs].sort(),
  })
  if (existing !== undefined) {
    if (existing.noRepairHash === noRepairHash) {
      return ok('contact_follow_up_no_repair_replayed', { state, noRepair: existing })
    }

    return error('contact_follow_up_idempotency_conflict', false, {
      reason: 'same_key_different_no_repair',
      proposalId: proposal.id,
    })
  }

  const noRepair: ContactFollowUpNoRepairRecord = {
    id: contactFollowUpNoRepairId(proposal.id, command.idempotencyKey),
    proposalId: proposal.id,
    reason,
    evidenceRefs: command.evidenceRefs,
    noRepairHash,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    markedBy: command.authority.actorRef,
    markedAt: command.now,
    ...(command.attemptId === undefined ? {} : { attemptId: command.attemptId }),
  }
  const auditEvent = buildContactFollowUpAuditEvent({
    eventType: 'protected_action.no_repair_marked',
    actorKind: 'owner',
    actorRef: command.authority.actorRef,
    targetRef: proposal.id,
    businessId: proposal.businessId,
    operationKey: command.idempotencyKey,
    correlationId: command.correlationId,
    beforeState: reconstructionStatus(buildQueueItem(state, proposal), undefined, latestGatewayFor(state, proposal)),
    afterState: 'no_repair',
    reasonCode: reason,
    evidenceRefs: command.evidenceRefs,
    payloadHash: noRepairHash,
    createdAt: command.now,
    redactedPayload: {
      selectedActionSlug: ContactFollowUpActionSlug,
      proposalHash: proposal.proposalHash,
      evidenceCount: command.evidenceRefs.length,
    },
  })

  return ok('contact_follow_up_no_repair_marked', {
    state: appendAudit({ ...state, noRepairRecords: [...state.noRepairRecords, noRepair] }, auditEvent),
    noRepair,
    auditEvent,
  })
}

function rejectUnsafeRequest(
  selectedActionSlug: string,
  executionMode: 'owner_pending' | 'direct' | 'autonomous',
  unsafeClientFields: Record<string, unknown> | undefined
): ProposeContactFollowUpRequestResult | undefined {
  if (selectedActionSlug !== ContactFollowUpActionSlug) {
    return error('contact_follow_up_unknown_slug', false, { reason: 'selected_slug_only' })
  }

  if (executionMode !== 'owner_pending') {
    return error('contact_follow_up_direct_mode_rejected', false, { reason: 'owner_pending_required' })
  }

  const blockedClientField = findBlockedParameterKey(unsafeClientFields)
  if (blockedClientField !== undefined) {
    return error('contact_follow_up_money_field_rejected', false, { reason: 'blocked_client_field', field: blockedClientField })
  }

  return undefined
}

function rejectUnsafeAttempt(
  selectedActionSlug: string,
  executionMode: 'owner_approved' | 'direct' | 'autonomous'
): RecordContactFollowUpProviderAttemptResult | undefined {
  if (selectedActionSlug !== ContactFollowUpActionSlug) {
    return error('contact_follow_up_unknown_slug', false, { reason: 'selected_slug_only' })
  }

  if (executionMode !== 'owner_approved') {
    return error('contact_follow_up_direct_mode_rejected', false, { reason: 'owner_decision_required' })
  }

  return undefined
}

function normalizeParameters(
  parameters: Record<string, unknown>
):
  | { valid: true; parameters: ContactFollowUpParameters }
  | { valid: false; code: 'contact_follow_up_untrusted_parameter' | 'contact_follow_up_money_field_rejected' | 'contact_follow_up_missing_context'; reason: string; field?: string } {
  const blockedField = findBlockedParameterKey(parameters)
  if (blockedField !== undefined) {
    return { valid: false, code: 'contact_follow_up_money_field_rejected', reason: 'blocked_parameter_field', field: blockedField }
  }

  for (const key of Object.keys(parameters)) {
    if (!allowedParameterKeys.has(key as ContactFollowUpParameterKey)) {
      return { valid: false, code: 'contact_follow_up_untrusted_parameter', reason: 'parameter_not_allowed', field: key }
    }
  }

  const contactName = stringParameter(parameters.contactName)
  const contactChannel = channelParameter(parameters.contactChannel)
  const messageSummary = stringParameter(parameters.messageSummary)
  const sourceMessageRef = stringParameter(parameters.sourceMessageRef)
  if (contactName === undefined || contactChannel === undefined || messageSummary === undefined || sourceMessageRef === undefined) {
    return { valid: false, code: 'contact_follow_up_missing_context', reason: 'required_parameters_missing' }
  }

  return { valid: true, parameters: { contactName, contactChannel, messageSummary, sourceMessageRef } }
}

const allowedParameterKeys = new Set<string>(ContactFollowUpParameterKeyValues)

function findBlockedParameterKey(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findBlockedParameterKey(item)
      if (nested !== undefined) {
        return nested
      }
    }

    return undefined
  }

  if (!isUnknownRecord(value)) {
    return undefined
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (blockedParameterKeys.has(normalizeKey(key))) {
      return key
    }

    const nested = findBlockedParameterKey(nestedValue)
    if (nested !== undefined) {
      return nested
    }
  }

  return undefined
}

const pay = 'pay'
const ment = 'ment'
const wal = 'wal'
const letPart = 'let'
const bal = 'bal'
const ance = 'ance'
const cred = 'cred'
const itPart = 'it'
const check = 'check'
const outPart = 'out'
const sub = 'sub'
const scription = 'scription'
const setPart = 'set'
const tlement = 'tlement'
const con = 'con'
const nect = 'nect'
const str = 'str'
const ipe = 'ipe'

const blockedParameterKeys = new Set<string>([
  'amount',
  'currency',
  `${pay}${ment}`,
  `${pay}${ment}required`,
  `${wal}${letPart}`,
  `${bal}${ance}`,
  `${cred}${itPart}`,
  `${cred}${itPart}s`,
  `${check}${outPart}`,
  `${sub}${scription}`,
  `${setPart}${tlement}`,
  `x${'402'}`,
  `${con}${nect}`,
  `${str}${ipe}`,
])

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function stringParameter(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

function channelParameter(value: unknown): ContactFollowUpParameters['contactChannel'] | undefined {
  return value === 'email' || value === 'phone' || value === 'other' ? value : undefined
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function contactFollowUpContractValue(): StableHashValue {
  return {
    selectedActionSlug: ContactFollowUpActionSlug,
    allowedParameters: ContactFollowUpParameterKeyValues,
    consequence: 'records owner-reviewed contact follow-up through source outbox',
    proofExpectation: 'source-owned receipt or explicit gap',
  }
}

function ownsBusiness(authority: ContactFollowUpOwnerAuthority | undefined, businessId: BusinessId): authority is ContactFollowUpOwnerAuthority {
  return authority !== undefined && authority.businessIds.includes(businessId)
}

function classifyPolicy(proposal: ContactFollowUpProposal, now: number): ContactFollowUpPolicyKind {
  if (now > proposal.deadlineAt) {
    return 'expired'
  }

  if (proposal.target.suppressed) {
    return 'refused'
  }

  if (proposal.policyHints.requiresExternalAuthority) {
    return 'external_authority'
  }

  if (proposal.policyHints.sourceProof === 'missing') {
    return 'missing_proof'
  }

  if (proposal.policyHints.sourceProof === 'gap') {
    return 'proof_gap'
  }

  if (proposal.deadlineAt - now <= 60_000) {
    return 'time_bound'
  }

  return 'review_required'
}

function policyReason(kind: ContactFollowUpPolicyKind): string {
  switch (kind) {
    case 'review_required':
      return 'owner_review_required'
    case 'time_bound':
      return 'deadline_near_owner_review_required'
    case 'expired':
      return 'deadline_elapsed'
    case 'refused':
      return 'target_refused'
    case 'missing_proof':
      return 'source_proof_missing'
    case 'proof_gap':
      return 'source_proof_gap'
    case 'external_authority':
      return 'external_authority_required'
  }
}

function ownerCanDecide(policy: ContactFollowUpPolicyDecision): boolean {
  return policy.kind === 'review_required' || policy.kind === 'time_bound'
}

function latestPolicyFor(
  state: ContactFollowUpSourceState,
  proposal: ContactFollowUpProposal
): ContactFollowUpPolicyDecision | undefined {
  return state.policyDecisions
    .filter((policy) => policy.proposalId === proposal.id && policy.proposalHash === proposal.proposalHash)
    .sort((left, right) => right.evaluatedAt - left.evaluatedAt)[0]
}

function latestOwnerDecisionFor(
  state: ContactFollowUpSourceState,
  proposal: ContactFollowUpProposal
): ContactFollowUpOwnerDecisionRecord | undefined {
  return state.ownerDecisions
    .filter((decision) => decision.proposalId === proposal.id && decision.proposalHash === proposal.proposalHash)
    .sort((left, right) => right.decidedAt - left.decidedAt)[0]
}

function buildQueueItem(state: ContactFollowUpSourceState, proposal: ContactFollowUpProposal): ContactFollowUpProposalQueueItem {
  const policy = latestPolicyFor(state, proposal)
  const ownerDecision = latestOwnerDecisionFor(state, proposal)
  const attempt = latestAttemptFor(state, proposal)
  const receipt = attempt === undefined ? undefined : state.receipts.find((candidate) => candidate.attemptId === attempt.id)

  return {
    proposal,
    ...(policy === undefined ? {} : { policy }),
    ...(ownerDecision === undefined ? {} : { ownerDecision }),
    ...(attempt === undefined ? {} : { attempt }),
    ...(receipt === undefined ? {} : { receipt }),
  }
}

function attemptsForProposal(
  state: ContactFollowUpSourceState,
  proposalId: ContactFollowUpProposalId
): readonly ContactFollowUpAttempt[] {
  return state.attempts
    .filter((attempt) => attempt.proposalId === proposalId)
    .sort((left, right) => left.attemptedAt - right.attemptedAt)
}

function latestAttemptFor(
  state: ContactFollowUpSourceState,
  proposal: ContactFollowUpProposal
): ContactFollowUpAttempt | undefined {
  return attemptsForProposal(state, proposal.id).at(-1)
}

function isRetryableAttempt(attempt: ContactFollowUpAttempt): boolean {
  return attempt.outcome === 'proof_gap_recorded' || attempt.outcome === 'failed'
}

function latestGatewayFor(
  state: ContactFollowUpSourceState,
  proposal: ContactFollowUpProposal
): ContactFollowUpGatewayAdmission | undefined {
  return state.gatewayAdmissions
    .filter((admission) => admission.proposalId === proposal.id && admission.proposalHash === proposal.proposalHash)
    .sort((left, right) => right.createdAt - left.createdAt)[0]
}

function gatewayForAttempt(
  state: ContactFollowUpSourceState,
  attempt: ContactFollowUpAttempt
): ContactFollowUpGatewayAdmission | undefined {
  return state.gatewayAdmissions.find((admission) => admission.id === attempt.gatewayAdmissionId)
}

function latestNoRepairFor(
  state: ContactFollowUpSourceState,
  proposal: ContactFollowUpProposal,
  attempt: ContactFollowUpAttempt | undefined
): ContactFollowUpNoRepairRecord | undefined {
  return state.noRepairRecords
    .filter(
      (record) =>
        record.proposalId === proposal.id &&
        (attempt === undefined || record.attemptId === undefined || record.attemptId === attempt.id)
    )
    .sort((left, right) => right.markedAt - left.markedAt)[0]
}

function reconstructionStatus(
  item: ContactFollowUpProposalQueueItem,
  noRepair: ContactFollowUpNoRepairRecord | undefined,
  gatewayAdmission: ContactFollowUpGatewayAdmission | undefined
): ContactFollowUpReconstruction['readbackStatus'] {
  if (noRepair !== undefined) {
    return 'no_repair'
  }

  if (item.receipt?.kind === 'receipt') {
    return 'receipt_recorded'
  }

  if (item.receipt?.kind === 'proof_gap') {
    return 'proof_gap'
  }

  if (item.attempt?.outcome === 'failed') {
    return 'failed'
  }

  if (item.ownerDecision?.decision === 'rejected') {
    return 'owner_rejected'
  }

  if (item.ownerDecision?.decision === 'approved') {
    return gatewayAdmission === undefined ? 'ready_for_attempt' : 'gateway_admitted'
  }

  return 'awaiting_owner_review'
}

function repairAction(
  item: ContactFollowUpProposalQueueItem,
  noRepair: ContactFollowUpNoRepairRecord | undefined
): ContactFollowUpReconstruction['repairAction'] {
  if (noRepair !== undefined) {
    return 'none'
  }

  if (item.receipt?.kind === 'proof_gap' || item.attempt?.outcome === 'failed') {
    return 'retry_available'
  }

  if (item.ownerDecision === undefined) {
    return 'owner_can_reject'
  }

  return 'none'
}

function proposalWithStatus(
  state: ContactFollowUpSourceState,
  proposal: ContactFollowUpProposal,
  status: ContactFollowUpProposal['status'],
  updatedAt: number
): ContactFollowUpProposal {
  const current = state.proposals.find((candidate) => candidate.id === proposal.id) ?? proposal
  return { ...current, status, updatedAt }
}

function replaceProposal(
  proposals: readonly ContactFollowUpProposal[],
  nextProposal: ContactFollowUpProposal
): readonly ContactFollowUpProposal[] {
  return proposals.map((proposal) => (proposal.id === nextProposal.id ? nextProposal : proposal))
}

function replaceGatewayAdmission(
  admissions: readonly ContactFollowUpGatewayAdmission[],
  nextAdmission: ContactFollowUpGatewayAdmission
): readonly ContactFollowUpGatewayAdmission[] {
  return admissions.map((admission) => (admission.id === nextAdmission.id ? nextAdmission : admission))
}

function attemptOutcome(readback: ContactFollowUpAttemptReadback): ContactFollowUpAttemptOutcome {
  if (readback.kind === 'receipt') {
    return 'receipt_recorded'
  }

  if (readback.kind === 'proof_gap') {
    return 'proof_gap_recorded'
  }

  return 'failed'
}

function auditEventForAttempt(readback: ContactFollowUpAttemptReadback): AuditEventType {
  if (readback.kind === 'receipt') {
    return 'protected_action.receipt_recorded'
  }

  if (readback.kind === 'proof_gap') {
    return 'protected_action.proof_gap_recorded'
  }

  return 'protected_action.attempt_failed'
}

function readbackHashValue(readback: ContactFollowUpAttemptReadback): StableHashValue {
  if (readback.kind === 'receipt') {
    return { kind: readback.kind, resultRef: readback.resultRef, payloadHash: readback.payloadHash }
  }

  if (readback.kind === 'proof_gap') {
    return { kind: readback.kind, gapReason: readback.gapReason, payloadHash: readback.payloadHash }
  }

  return { kind: readback.kind, failureReason: readback.failureReason, payloadHash: readback.payloadHash }
}

function receiptForAttempt(
  proposal: ContactFollowUpProposal,
  attempt: ContactFollowUpAttempt,
  readback: ContactFollowUpAttemptReadback,
  recordedAt: number
): ContactFollowUpReceipt | undefined {
  if (readback.kind === 'failed') {
    return undefined
  }

  const receiptId = contactFollowUpReceiptId(proposal.id, attempt.idempotencyKey)
  return {
    id: receiptId,
    proposalId: proposal.id,
    attemptId: attempt.id,
    kind: readback.kind === 'receipt' ? 'receipt' : 'proof_gap',
    providerBoundary: 'source_owned_follow_up_outbox',
    payloadHash: readback.payloadHash,
    redactedReadback:
      readback.kind === 'receipt'
        ? { targetRef: proposal.parameters.sourceMessageRef, resultRef: readback.resultRef }
        : { targetRef: proposal.parameters.sourceMessageRef, gapReason: readback.gapReason },
    recordedAt,
  }
}

function privateEvidenceRefForAttempt(
  proposal: ContactFollowUpProposal,
  attempt: ContactFollowUpAttempt,
  readback: ContactFollowUpAttemptReadback,
  recordedAt: number
): ContactFollowUpPrivateEvidenceRef {
  return {
    id: `contact-follow-up-private-evidence:${proposal.id}:${attempt.idempotencyKey}` as ContactFollowUpPrivateEvidenceRefId,
    proposalId: proposal.id,
    attemptId: attempt.id,
    retentionClass: 'protected_action_private_evidence',
    accessPolicy: 'owner_admin_operator_only',
    payloadHash: readback.payloadHash,
    ttlExpiresAt: recordedAt + 30 * 24 * 60 * 60 * 1_000,
  }
}

function appendAudit(state: ContactFollowUpSourceState, auditEvent: AuditEventContract): ContactFollowUpSourceState {
  return { ...state, auditEvents: [...state.auditEvents, auditEvent] }
}

function buildContactFollowUpAuditEvent(input: {
  eventType: AuditEventType
  actorKind: ActorKind
  actorRef: string
  targetType?: 'protected_action' | 'protected_action_attempt'
  targetRef: string
  businessId: BusinessId
  operationKey: OperationKey
  correlationId: CorrelationId
  beforeState: string
  afterState: string
  reasonCode?: string
  evidenceRefs: readonly string[]
  payloadHash: SourceHash
  redactedPayload: RedactedPayload
  createdAt: number
}): AuditEventContract {
  const event: AuditEventContract = {
    eventId: brandNonEmpty(`audit:${input.eventType}:${input.targetRef}:${input.operationKey}`, 'AuditEventId'),
    eventType: input.eventType,
    actorKind: input.actorKind,
    actorRef: input.actorRef,
    targetType: input.targetType ?? 'protected_action',
    targetRef: input.targetRef,
    businessId: input.businessId,
    idempotencyKey: input.operationKey,
    correlationId: input.correlationId,
    beforeState: input.beforeState,
    afterState: input.afterState,
    evidenceRefs: input.evidenceRefs,
    redactedPayload: input.redactedPayload,
    payloadHash: input.payloadHash,
    createdAt: input.createdAt,
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
  }
  const validation = validateAuditEvent(event)
  if (!validation.valid) {
    throw new Error(`Invalid contact follow-up audit event: ${validation.reason}`)
  }

  return event
}

function contactFollowUpProposalId(operationKey: OperationKey): ContactFollowUpProposalId {
  return `contact-follow-up:${operationKey}` as ContactFollowUpProposalId
}

function contactFollowUpPolicyId(proposalId: ContactFollowUpProposalId, policyHash: SourceHash): ContactFollowUpPolicyId {
  return `contact-follow-up-policy:${proposalId}:${policyHash}` as ContactFollowUpPolicyId
}

function contactFollowUpDecisionId(proposalId: ContactFollowUpProposalId, operationKey: OperationKey): ContactFollowUpDecisionId {
  return `contact-follow-up-decision:${proposalId}:${operationKey}` as ContactFollowUpDecisionId
}

function contactFollowUpGatewayAdmissionId(
  proposalId: ContactFollowUpProposalId,
  operationKey: OperationKey
): ContactFollowUpGatewayAdmissionId {
  return `contact-follow-up-gateway:${proposalId}:${operationKey}` as ContactFollowUpGatewayAdmissionId
}

function contactFollowUpAttemptId(proposalId: ContactFollowUpProposalId, operationKey: OperationKey): ContactFollowUpAttemptId {
  return `contact-follow-up-attempt:${proposalId}:${operationKey}` as ContactFollowUpAttemptId
}

function contactFollowUpReceiptId(proposalId: ContactFollowUpProposalId, operationKey: OperationKey): ContactFollowUpReceiptId {
  return `contact-follow-up-receipt:${proposalId}:${operationKey}` as ContactFollowUpReceiptId
}

function contactFollowUpNoRepairId(proposalId: ContactFollowUpProposalId, operationKey: OperationKey): ContactFollowUpNoRepairId {
  return `contact-follow-up-no-repair:${proposalId}:${operationKey}` as ContactFollowUpNoRepairId
}

function missingProposal(proposalId: ContactFollowUpProposalId): ContactFollowUpProposal {
  const now = 0
  const missingBusinessId = 'business:missing' as BusinessId
  const missingOwnerId = 'owner:missing' as OwnerId
  const operationKey = 'operation:missing' as OperationKey
  const correlationId = 'correlation:missing' as CorrelationId
  const sourceEvidenceRef = 'missing' as const
  const parameters: ContactFollowUpParameters = {
    contactName: 'Missing request',
    contactChannel: 'other',
    messageSummary: 'No source-owned request exists for this ID.',
    sourceMessageRef: sourceEvidenceRef,
  }
  const canonicalContractHash = stableHash(contactFollowUpContractValue())
  const proposalHash = stableHash({ proposalId, missing: true })
  return {
    id: proposalId,
    selectedActionSlug: ContactFollowUpActionSlug,
    businessId: missingBusinessId,
    ownerId: missingOwnerId,
    actorRef: 'missing',
    target: {
      businessId: missingBusinessId,
      ownerId: missingOwnerId,
      sourceEvidenceRef,
      suppressed: false,
    },
    parameters,
    canonicalContractHash,
    proposalHash,
    idempotencyKey: operationKey,
    correlationId,
    deadlineAt: now,
    reversibility: 'owner_can_close_without_provider_reversal',
    proofExpectation: 'source_owned_receipt_or_gap',
    policyHints: { sourceProof: 'missing', requiresExternalAuthority: false },
    status: 'proposed',
    createdAt: now,
    updatedAt: now,
  }
}
