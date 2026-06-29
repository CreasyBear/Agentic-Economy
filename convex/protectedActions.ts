import type { UserIdentity } from 'convex/server'
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { resolveAdminAuthority, resolveBusinessActor } from './authz'
import { runtimeDb } from './source_state'
import type { RuntimeDb, RuntimeDocument } from './source_state'
import { literalUnion } from '../src/modules/common/convex-literals'
import { brandNonEmpty } from '../src/modules/common/ids'
import type { BusinessId, CorrelationId, OperationKey, OwnerId, ServiceId, SourceHash } from '../src/modules/common/ids'
import { stableHash } from '../src/modules/common/stable-hash'
import type { AuditEventContract, RedactedPayload } from '../src/modules/observability/public'
import { assertCsrf } from '../src/modules/security/public'
import {
  ContactFollowUpActionSlug,
  ContactFollowUpAttemptOutcomeValues,
  ContactFollowUpDecisionValues,
  ContactFollowUpMaxAttemptCount,
  ContactFollowUpPolicyKindValues,
  createContactFollowUpGatewayAdmission,
  createEmptyContactFollowUpSourceState,
  decideContactFollowUpProposal,
  evaluateContactFollowUpPolicy,
  listOwnerContactFollowUpQueue,
  markContactFollowUpNoRepair,
  proposeContactFollowUpRequest,
  readContactFollowUpReconstruction,
  recordContactFollowUpProviderAttempt,
} from '../src/modules/protected-action/public'
import type {
  ContactFollowUpAttempt,
  ContactFollowUpAttemptReadback,
  ContactFollowUpAttemptId,
  ContactFollowUpGatewayAdmission,
  ContactFollowUpGatewayAdmissionId,
  ContactFollowUpNoRepairRecord,
  ContactFollowUpNoRepairId,
  ContactFollowUpOwnerAuthority,
  ContactFollowUpOwnerDecisionRecord,
  ContactFollowUpDecisionId,
  ContactFollowUpPolicyDecision,
  ContactFollowUpPolicyHints,
  ContactFollowUpPolicyId,
  ContactFollowUpPrivateEvidenceRef,
  ContactFollowUpPrivateEvidenceRefId,
  ContactFollowUpProposal,
  ContactFollowUpProposalId,
  ContactFollowUpReceipt,
  ContactFollowUpReceiptId,
  ContactFollowUpReconstruction,
  ContactFollowUpSourceState,
  ContactFollowUpSupportRecord,
} from '../src/modules/protected-action/public'

const selectedActionSlug = v.literal(ContactFollowUpActionSlug)
const policyKind = literalUnion(ContactFollowUpPolicyKindValues)
const ownerDecision = literalUnion(ContactFollowUpDecisionValues)
const attemptOutcome = literalUnion(ContactFollowUpAttemptOutcomeValues)
const contactFollowUpRedactedPayload = v.object({
  selectedActionSlug,
  parameterKeys: v.optional(v.array(v.string())),
  proposalHash: v.optional(v.string()),
  policy: v.optional(policyKind),
  decision: v.optional(ownerDecision),
  policyHash: v.optional(v.string()),
  ownerDecisionHash: v.optional(v.string()),
  admissionHash: v.optional(v.string()),
  decisionHash: v.optional(v.string()),
  outcome: v.optional(attemptOutcome),
  evidenceCount: v.optional(v.number()),
})

const selectedActionDescriptor = v.object({
  selectedActionName: v.literal('Owner-approved customer contact follow-up request'),
  selectedActionSlug,
  ownerApprovalRequired: v.literal(true),
  providerOrInternalBoundary: v.literal('source_owned_follow_up_outbox'),
  noMoneyMovement: v.literal(true),
  proposalOnly: v.literal(true),
})

const contactFollowUpDescriptor = {
  selectedActionName: 'Owner-approved customer contact follow-up request',
  selectedActionSlug: ContactFollowUpActionSlug,
  ownerApprovalRequired: true,
  providerOrInternalBoundary: 'source_owned_follow_up_outbox',
  noMoneyMovement: true,
  proposalOnly: true,
} as const

const contactFollowUpParameters = v.object({
  contactName: v.string(),
  contactChannel: v.union(v.literal('email'), v.literal('phone'), v.literal('other')),
  messageSummary: v.string(),
  sourceMessageRef: v.string(),
})

const policyHints = v.object({
  sourceProof: v.union(v.literal('present'), v.literal('missing'), v.literal('gap')),
  requiresExternalAuthority: v.boolean(),
})

const contactFollowUpProposal = v.object({
  id: v.string(),
  selectedActionSlug,
  businessId: v.string(),
  ownerId: v.string(),
  serviceId: v.optional(v.string()),
  actorRef: v.string(),
  target: v.object({
    businessId: v.string(),
    ownerId: v.string(),
    serviceId: v.optional(v.string()),
    sourceEvidenceRef: v.string(),
    suppressed: v.boolean(),
  }),
  parameters: contactFollowUpParameters,
  canonicalContractHash: v.string(),
  proposalHash: v.string(),
  idempotencyKey: v.string(),
  correlationId: v.string(),
  deadlineAt: v.number(),
  reversibility: v.literal('owner_can_close_without_provider_reversal'),
  proofExpectation: v.literal('source_owned_receipt_or_gap'),
  policyHints,
  status: v.union(v.literal('proposed'), v.literal('approved'), v.literal('rejected'), v.literal('attempted')),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const contactFollowUpPolicy = v.object({
  id: v.string(),
  proposalId: v.string(),
  kind: policyKind,
  reason: v.string(),
  proposalHash: v.string(),
  policyHash: v.string(),
  evaluatedAt: v.number(),
})

const contactFollowUpOwnerDecision = v.object({
  id: v.string(),
  proposalId: v.string(),
  decision: ownerDecision,
  reason: v.string(),
  evidenceRefs: v.array(v.string()),
  proposalHash: v.string(),
  policyHash: v.string(),
  decisionHash: v.string(),
  idempotencyKey: v.string(),
  correlationId: v.string(),
  decidedBy: v.string(),
  decidedAt: v.number(),
})

const contactFollowUpGatewayAdmission = v.object({
  id: v.string(),
  proposalId: v.string(),
  selectedActionSlug,
  proposalHash: v.string(),
  policyHash: v.string(),
  contractHash: v.string(),
  ownerDecisionHash: v.string(),
  admissionHash: v.string(),
  idempotencyKey: v.string(),
  correlationId: v.string(),
  status: v.union(v.literal('admitted'), v.literal('consumed'), v.literal('expired'), v.literal('replay_rejected')),
  expiresAt: v.number(),
  createdAt: v.number(),
  consumedAt: v.optional(v.number()),
})

const contactFollowUpAttempt = v.object({
  id: v.string(),
  proposalId: v.string(),
  selectedActionSlug,
  businessId: v.string(),
  ownerId: v.string(),
  decisionId: v.string(),
  gatewayAdmissionId: v.string(),
  outcome: attemptOutcome,
  attemptHash: v.string(),
  receiptId: v.optional(v.string()),
  reason: v.optional(v.string()),
  idempotencyKey: v.string(),
  correlationId: v.string(),
  attemptedAt: v.number(),
})

const contactFollowUpReceipt = v.object({
  id: v.string(),
  proposalId: v.string(),
  attemptId: v.string(),
  kind: v.union(v.literal('receipt'), v.literal('proof_gap')),
  providerBoundary: v.literal('source_owned_follow_up_outbox'),
  payloadHash: v.string(),
  redactedReadback: v.object({
    targetRef: v.string(),
    resultRef: v.optional(v.string()),
    gapReason: v.optional(v.string()),
  }),
  recordedAt: v.number(),
})

const contactFollowUpPrivateEvidenceRef = v.object({
  id: v.string(),
  proposalId: v.string(),
  attemptId: v.optional(v.string()),
  retentionClass: v.literal('protected_action_private_evidence'),
  accessPolicy: v.literal('owner_admin_operator_only'),
  payloadHash: v.string(),
  privatePayloadRef: v.optional(v.string()),
  ttlExpiresAt: v.number(),
  redactedAt: v.optional(v.number()),
})

const contactFollowUpNoRepair = v.object({
  id: v.string(),
  proposalId: v.string(),
  attemptId: v.optional(v.string()),
  reason: v.string(),
  evidenceRefs: v.array(v.string()),
  noRepairHash: v.string(),
  idempotencyKey: v.string(),
  correlationId: v.string(),
  markedBy: v.string(),
  markedAt: v.number(),
})

const contactFollowUpAuditEvent = v.object({
  eventId: v.string(),
  eventType: v.string(),
  actorKind: v.union(v.literal('owner'), v.literal('admin'), v.literal('system'), v.literal('anonymous')),
  actorRef: v.string(),
  targetType: v.string(),
  targetRef: v.string(),
  businessId: v.optional(v.string()),
  beforeState: v.optional(v.string()),
  afterState: v.optional(v.string()),
  idempotencyKey: v.string(),
  correlationId: v.string(),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
  redactedPayload: contactFollowUpRedactedPayload,
  payloadHash: v.string(),
  createdAt: v.number(),
})

const contactFollowUpQueueItem = v.object({
  proposal: contactFollowUpProposal,
  policy: v.optional(contactFollowUpPolicy),
  ownerDecision: v.optional(contactFollowUpOwnerDecision),
  attempt: v.optional(contactFollowUpAttempt),
  receipt: v.optional(contactFollowUpReceipt),
})

const contactFollowUpReconstruction = v.object({
  proposal: contactFollowUpProposal,
  policy: v.optional(contactFollowUpPolicy),
  ownerDecision: v.optional(contactFollowUpOwnerDecision),
  attempt: v.optional(contactFollowUpAttempt),
  receipt: v.optional(contactFollowUpReceipt),
  auditEvents: v.array(contactFollowUpAuditEvent),
  gatewayAdmission: v.optional(contactFollowUpGatewayAdmission),
  noRepair: v.optional(contactFollowUpNoRepair),
  privateEvidenceRefs: v.array(contactFollowUpPrivateEvidenceRef),
  readbackStatus: v.union(
    v.literal('missing'),
    v.literal('awaiting_owner_review'),
    v.literal('owner_rejected'),
    v.literal('ready_for_attempt'),
    v.literal('gateway_admitted'),
    v.literal('receipt_recorded'),
    v.literal('proof_gap'),
    v.literal('failed'),
    v.literal('no_repair')
  ),
  repairAction: v.union(v.literal('none'), v.literal('owner_can_reject'), v.literal('retry_available'), v.literal('operator_review_required')),
})

const protectedActionErrorCode = v.union(
  v.literal('contact_follow_up_control_disabled'),
  v.literal('contact_follow_up_attempts_disabled'),
  v.literal('contact_follow_up_unknown_slug'),
  v.literal('contact_follow_up_owner_denied'),
  v.literal('contact_follow_up_direct_mode_rejected'),
  v.literal('contact_follow_up_target_suppressed'),
  v.literal('contact_follow_up_invalid_target'),
  v.literal('contact_follow_up_untrusted_parameter'),
  v.literal('contact_follow_up_money_field_rejected'),
  v.literal('contact_follow_up_missing_context'),
  v.literal('contact_follow_up_idempotency_conflict'),
  v.literal('contact_follow_up_not_found'),
  v.literal('contact_follow_up_policy_refused'),
  v.literal('contact_follow_up_consequence_required'),
  v.literal('contact_follow_up_owner_decision_required'),
  v.literal('contact_follow_up_gateway_required'),
  v.literal('contact_follow_up_gateway_expired'),
  v.literal('contact_follow_up_gateway_replay_rejected'),
  v.literal('contact_follow_up_retry_exhausted'),
  v.literal('contact_follow_up_no_repair_recorded'),
  v.literal('contact_follow_up_csrf_rejected'),
  v.literal('missing_auth'),
  v.literal('owner_not_found')
)

const serverError = v.object({
  kind: v.literal('error'),
  code: protectedActionErrorCode,
  retryable: v.boolean(),
  reason: v.string(),
  field: v.optional(v.string()),
})

const ownerQueueResult = v.union(
  v.object({
    kind: v.literal('allowed'),
    queue: v.array(contactFollowUpQueueItem),
    reconstructions: v.array(contactFollowUpReconstruction),
  }),
  v.object({
    kind: v.literal('denied'),
    reason: v.union(v.literal('missing_auth'), v.literal('owner_not_found')),
  })
)

const ownerDetailResult = v.union(
  v.object({
    kind: v.literal('ok'),
    reconstruction: contactFollowUpReconstruction,
  }),
  serverError
)

const ownerMutationResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(
      v.literal('contact_follow_up_decided'),
      v.literal('contact_follow_up_decision_replayed'),
      v.literal('contact_follow_up_attempt_recorded'),
      v.literal('contact_follow_up_attempt_replayed'),
      v.literal('contact_follow_up_no_repair_marked'),
      v.literal('contact_follow_up_no_repair_replayed')
    ),
    reconstruction: contactFollowUpReconstruction,
  }),
  serverError
)

const adminReconstructionResult = v.union(
  v.object({
    kind: v.literal('allowed'),
    httpStatus: v.literal(200),
    generatedAt: v.number(),
    actorRef: v.string(),
    rows: v.array(contactFollowUpReconstruction),
  }),
  v.object({
    kind: v.literal('denied'),
    httpStatus: v.union(v.literal(401), v.literal(403)),
    reason: v.union(v.literal('missing_membership'), v.literal('inactive_membership'), v.literal('action_not_allowed')),
    generatedAt: v.number(),
    publicMessage: v.string(),
    rows: v.array(contactFollowUpReconstruction),
  })
)

const csrfArgs = {
  csrfToken: v.optional(v.string()),
  csrfCookie: v.optional(v.string()),
  origin: v.optional(v.string()),
} as const

type RuntimeCtx = {
  db: object
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>
  }
}

type ContactFollowUpRedactedPayloadDto = {
  selectedActionSlug: typeof ContactFollowUpActionSlug
  parameterKeys?: string[]
  proposalHash?: string
  policy?: (typeof ContactFollowUpPolicyKindValues)[number]
  decision?: (typeof ContactFollowUpDecisionValues)[number]
  policyHash?: string
  ownerDecisionHash?: string
  admissionHash?: string
  decisionHash?: string
  outcome?: (typeof ContactFollowUpAttemptOutcomeValues)[number]
  evidenceCount?: number
}

export const readSelectedProtectedActionDescriptor = queryGeneric({
  args: {},
  returns: selectedActionDescriptor,
  handler: () => contactFollowUpDescriptor,
})

export const proposeCurrentOwnerContactFollowUp = mutationGeneric({
  args: {
    businessId: v.string(),
    serviceId: v.optional(v.string()),
    sourceEvidenceRef: v.string(),
    parameters: contactFollowUpParameters,
    policyHints: v.optional(policyHints),
    deadlineAt: v.number(),
    ...csrfArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: ownerDetailResult,
  handler: async (ctx, args) => {
    const csrf = assertProtectedActionCsrf(args)
    if (csrf.kind === 'rejected') {
      return protectedActionError('contact_follow_up_csrf_rejected', csrf.reason)
    }

    const owner = await readCurrentOwnerAuthority(ctx)
    if (owner.kind === 'denied') {
      return protectedActionError(owner.reason, owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadContactFollowUpSourceState(db)
    const now = Date.now()
    const proposed = proposeContactFollowUpRequest(state, {
      authority: owner.authority,
      selectedActionSlug: ContactFollowUpActionSlug,
      target: {
        businessId: brandNonEmpty(args.businessId, 'BusinessId'),
        ownerId: owner.authority.ownerId,
        ...(args.serviceId === undefined ? {} : { serviceId: brandNonEmpty(args.serviceId, 'ServiceId') }),
        sourceEvidenceRef: args.sourceEvidenceRef,
      },
      parameters: args.parameters,
      ...(args.policyHints === undefined ? {} : { policyHints: args.policyHints }),
      idempotencyKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      deadlineAt: args.deadlineAt,
      now,
    })
    if (proposed.kind === 'error') {
      return moduleError(proposed)
    }

    const policy = evaluateContactFollowUpPolicy(proposed.state, { proposalId: proposed.proposal.id, now })
    if (policy.kind === 'error') {
      return moduleError(policy)
    }

    await persistContactFollowUpSourceState(db, policy.state)
    return {
      kind: 'ok' as const,
      reconstruction: serializeReconstruction(readContactFollowUpReconstruction(policy.state, proposed.proposal.id)),
    }
  },
})

export const listCurrentOwnerContactFollowUpQueue = queryGeneric({
  args: {},
  returns: ownerQueueResult,
  handler: async (ctx) => {
    const owner = await readCurrentOwnerAuthority(ctx)
    if (owner.kind === 'denied') {
      return owner
    }

    const state = await loadContactFollowUpSourceState(runtimeDb(ctx.db))
    const queue = listOwnerContactFollowUpQueue(state, owner.authority.ownerId)
    return {
      kind: 'allowed' as const,
      queue: queue.map(serializeQueueItem),
      reconstructions: queue.map((item) => serializeReconstruction(readContactFollowUpReconstruction(state, item.proposal.id))),
    }
  },
})

export const readCurrentOwnerContactFollowUpDetail = queryGeneric({
  args: { proposalId: v.string() },
  returns: ownerDetailResult,
  handler: async (ctx, args) => readOwnerReconstruction(ctx, args.proposalId),
})

export const readCurrentOwnerContactFollowUpReceipt = queryGeneric({
  args: { proposalId: v.string() },
  returns: ownerDetailResult,
  handler: async (ctx, args) => readOwnerReconstruction(ctx, args.proposalId),
})

export const approveCurrentOwnerContactFollowUp = mutationGeneric({
  args: {
    proposalId: v.string(),
    reason: v.string(),
    evidenceRefs: v.array(v.string()),
    consequenceAccepted: v.boolean(),
    ...csrfArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: ownerMutationResult,
  handler: async (ctx, args) => {
    const csrf = assertProtectedActionCsrf(args)
    if (csrf.kind === 'rejected') {
      return protectedActionError('contact_follow_up_csrf_rejected', csrf.reason)
    }

    return decideAndAttempt(ctx, {
      proposalId: args.proposalId,
      decision: 'approved',
      reason: args.reason,
      evidenceRefs: args.evidenceRefs,
      consequenceAccepted: args.consequenceAccepted,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      readback: { kind: 'receipt', resultRef: `source-receipt:${args.proposalId}`, payloadHash: stableHash({ proposalId: args.proposalId, receipt: true }) as SourceHash },
    })
  },
})

export const rejectCurrentOwnerContactFollowUp = mutationGeneric({
  args: {
    proposalId: v.string(),
    reason: v.string(),
    evidenceRefs: v.array(v.string()),
    consequenceAccepted: v.boolean(),
    ...csrfArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: ownerMutationResult,
  handler: async (ctx, args) => {
    const csrf = assertProtectedActionCsrf(args)
    if (csrf.kind === 'rejected') {
      return protectedActionError('contact_follow_up_csrf_rejected', csrf.reason)
    }

    return decideAndAttempt(ctx, {
      proposalId: args.proposalId,
      decision: 'rejected',
      reason: args.reason,
      evidenceRefs: args.evidenceRefs,
      consequenceAccepted: false,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
    })
  },
})

export const retryCurrentOwnerContactFollowUp = mutationGeneric({
  args: {
    proposalId: v.string(),
    readbackKind: v.union(v.literal('receipt'), v.literal('proof_gap'), v.literal('failed')),
    reason: v.string(),
    ...csrfArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: ownerMutationResult,
  handler: async (ctx, args) => {
    const csrf = assertProtectedActionCsrf(args)
    if (csrf.kind === 'rejected') {
      return protectedActionError('contact_follow_up_csrf_rejected', csrf.reason)
    }

    const owner = await readCurrentOwnerAuthority(ctx)
    if (owner.kind === 'denied') {
      return protectedActionError(owner.reason, owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadContactFollowUpSourceState(db)
    const reconstruction = readContactFollowUpReconstruction(state, args.proposalId as ContactFollowUpProposalId)
    if (reconstruction.proposal.ownerId !== owner.authority.ownerId || !owner.authority.businessIds.includes(reconstruction.proposal.businessId)) {
      return protectedActionError('contact_follow_up_not_found', 'request_not_found')
    }

    const now = Date.now()
    const gateway = createContactFollowUpGatewayAdmission(state, {
      authority: owner.authority,
      proposalId: reconstruction.proposal.id,
      idempotencyKey: brandNonEmpty(`${args.operationKey}:gateway`, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      expiresAt: now + 5 * 60_000,
      now,
    })
    if (gateway.kind === 'error') {
      return moduleError(gateway)
    }

    const attempted = recordContactFollowUpProviderAttempt(gateway.state, {
      authority: owner.authority,
      selectedActionSlug: ContactFollowUpActionSlug,
      proposalId: reconstruction.proposal.id,
      gatewayAdmissionId: gateway.gatewayAdmission.id,
      idempotencyKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      now,
      readback: readbackForKind(args.readbackKind, args.proposalId),
    })
    if (attempted.kind === 'error') {
      if (attempted.code === 'contact_follow_up_retry_exhausted') {
        const retryExhaustedAudit = retryExhaustedEvent(reconstruction, owner.authority, args.operationKey, args.correlationId, now)
        const exhaustedState = { ...gateway.state, auditEvents: [...gateway.state.auditEvents, retryExhaustedAudit] }
        await persistContactFollowUpSourceState(db, exhaustedState)
      }
      return moduleError(attempted)
    }

    await persistContactFollowUpSourceState(db, attempted.state)
    return {
      kind: 'ok' as const,
      code: attempted.code,
      reconstruction: serializeReconstruction(readContactFollowUpReconstruction(attempted.state, reconstruction.proposal.id)),
    }
  },
})

export const markCurrentOwnerContactFollowUpNoRepair = mutationGeneric({
  args: {
    proposalId: v.string(),
    attemptId: v.optional(v.string()),
    reason: v.string(),
    evidenceRefs: v.array(v.string()),
    ...csrfArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: ownerMutationResult,
  handler: async (ctx, args) => {
    const csrf = assertProtectedActionCsrf(args)
    if (csrf.kind === 'rejected') {
      return protectedActionError('contact_follow_up_csrf_rejected', csrf.reason)
    }

    const owner = await readCurrentOwnerAuthority(ctx)
    if (owner.kind === 'denied') {
      return protectedActionError(owner.reason, owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadContactFollowUpSourceState(db)
    const result = markContactFollowUpNoRepair(state, {
      authority: owner.authority,
      proposalId: args.proposalId as ContactFollowUpProposalId,
      ...(args.attemptId === undefined ? {} : { attemptId: args.attemptId as never }),
      reason: args.reason,
      evidenceRefs: args.evidenceRefs,
      idempotencyKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      now: Date.now(),
    })
    if (result.kind === 'error') {
      return moduleError(result)
    }

    await persistContactFollowUpSourceState(db, result.state)
    return {
      kind: 'ok' as const,
      code: result.code,
      reconstruction: serializeReconstruction(readContactFollowUpReconstruction(result.state, args.proposalId as ContactFollowUpProposalId)),
    }
  },
})

export const readAdminContactFollowUpReconstruction = queryGeneric({
  args: { proposalId: v.optional(v.string()) },
  returns: adminReconstructionResult,
  handler: async (ctx, args) => {
    const db = runtimeDb(ctx.db)
    const authority = await resolveAdminAuthority({ db, auth: ctx.auth }, 'read_admin_readbacks')
    if (authority.kind === 'denied') {
      return {
        kind: 'denied' as const,
        httpStatus: authority.reason === 'missing_membership' ? 401 as const : 403 as const,
        reason: authority.reason,
        generatedAt: Date.now(),
        publicMessage: 'Admin protected-action reconstruction requires active source-owned membership.',
        rows: [],
      }
    }

    const state = await loadContactFollowUpSourceState(db)
    const rows =
      args.proposalId === undefined
        ? state.proposals.map((proposal) => readContactFollowUpReconstruction(state, proposal.id))
        : [readContactFollowUpReconstruction(state, args.proposalId as ContactFollowUpProposalId)]

    return {
      kind: 'allowed' as const,
      httpStatus: 200 as const,
      generatedAt: Date.now(),
      actorRef: authority.membership.clerkUserId,
      rows: rows.map(serializeReconstruction),
    }
  },
})

async function readOwnerReconstruction(ctx: RuntimeCtx, proposalId: string) {
  const owner = await readCurrentOwnerAuthority(ctx)
  if (owner.kind === 'denied') {
    return protectedActionError(owner.reason, owner.reason)
  }

  const state = await loadContactFollowUpSourceState(runtimeDb(ctx.db))
  const proposal = state.proposals.find((candidate) => candidate.id === proposalId)
  if (proposal !== undefined && (proposal.ownerId !== owner.authority.ownerId || !owner.authority.businessIds.includes(proposal.businessId))) {
    return protectedActionError('contact_follow_up_not_found', 'request_not_found')
  }

  return {
    kind: 'ok' as const,
    reconstruction: serializeReconstruction(readContactFollowUpReconstruction(state, proposalId as ContactFollowUpProposalId)),
  }
}

async function decideAndAttempt(
  ctx: RuntimeCtx,
  input: {
    proposalId: string
    decision: 'approved' | 'rejected'
    reason: string
    evidenceRefs: readonly string[]
    consequenceAccepted: boolean
    operationKey: string
    correlationId: string
    readback?: ContactFollowUpAttemptReadback
  }
) {
  const owner = await readCurrentOwnerAuthority(ctx)
  if (owner.kind === 'denied') {
    return protectedActionError(owner.reason, owner.reason)
  }

  const db = runtimeDb(ctx.db)
  const state = await loadContactFollowUpSourceState(db)
  const proposal = state.proposals.find((candidate) => candidate.id === input.proposalId)
  if (proposal === undefined || proposal.ownerId !== owner.authority.ownerId || !owner.authority.businessIds.includes(proposal.businessId)) {
    return protectedActionError('contact_follow_up_not_found', 'request_not_found')
  }

  const policyState = state.policyDecisions.some((policy) => policy.proposalId === proposal.id)
    ? state
    : evaluateOrReturnState(state, proposal.id, Date.now())
  const decided = decideContactFollowUpProposal(policyState, {
    authority: owner.authority,
    proposalId: proposal.id,
    decision: input.decision,
    reason: input.reason,
    evidenceRefs: input.evidenceRefs,
    consequenceAccepted: input.consequenceAccepted,
    idempotencyKey: brandNonEmpty(input.operationKey, 'OperationKey'),
    correlationId: brandNonEmpty(input.correlationId, 'CorrelationId'),
    now: Date.now(),
  })
  if (decided.kind === 'error') {
    return moduleError(decided)
  }

  if (input.decision === 'rejected') {
    await persistContactFollowUpSourceState(db, decided.state)
    return {
      kind: 'ok' as const,
      code: decided.code,
      reconstruction: serializeReconstruction(readContactFollowUpReconstruction(decided.state, proposal.id)),
    }
  }

  const now = Date.now()
  const gateway = createContactFollowUpGatewayAdmission(decided.state, {
    authority: owner.authority,
    proposalId: proposal.id,
    idempotencyKey: brandNonEmpty(`${input.operationKey}:gateway`, 'OperationKey'),
    correlationId: brandNonEmpty(input.correlationId, 'CorrelationId'),
    expiresAt: now + 5 * 60_000,
    now,
  })
  if (gateway.kind === 'error') {
    return moduleError(gateway)
  }

  const attempted = recordContactFollowUpProviderAttempt(gateway.state, {
    authority: owner.authority,
    selectedActionSlug: ContactFollowUpActionSlug,
    proposalId: proposal.id,
    gatewayAdmissionId: gateway.gatewayAdmission.id,
    idempotencyKey: brandNonEmpty(`${input.operationKey}:attempt`, 'OperationKey'),
    correlationId: brandNonEmpty(input.correlationId, 'CorrelationId'),
    now,
    readback: input.readback ?? { kind: 'receipt', resultRef: `source-receipt:${proposal.id}`, payloadHash: stableHash({ proposalId: proposal.id, receipt: true }) as SourceHash },
  })
  if (attempted.kind === 'error') {
    return moduleError(attempted)
  }

  await persistContactFollowUpSourceState(db, attempted.state)
  return {
    kind: 'ok' as const,
    code: attempted.code,
    reconstruction: serializeReconstruction(readContactFollowUpReconstruction(attempted.state, proposal.id)),
  }
}

function evaluateOrReturnState(
  state: ContactFollowUpSourceState,
  proposalId: ContactFollowUpProposalId,
  now: number
): ContactFollowUpSourceState {
  const policy = evaluateContactFollowUpPolicy(state, { proposalId, now })
  return policy.kind === 'ok' ? policy.state : state
}

async function readCurrentOwnerAuthority(ctx: RuntimeCtx): Promise<
  | { kind: 'allowed'; authority: ContactFollowUpOwnerAuthority }
  | { kind: 'denied'; reason: 'missing_auth' | 'owner_not_found' }
> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'denied', reason: 'missing_auth' }
  }

  const db = runtimeDb(ctx.db)
  const owner = await db
    .query('owners')
    .withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', actor.clerkUserId))
    .unique()
  if (owner === null) {
    return { kind: 'denied', reason: 'owner_not_found' }
  }

  const businesses = await collect(db, 'businesses')
  const businessIds = businesses.filter((row) => stringField(row, 'ownerId') === owner._id).map((row) => brandNonEmpty(row._id, 'BusinessId'))

  return {
    kind: 'allowed',
    authority: {
      ownerId: brandNonEmpty(owner._id, 'OwnerId'),
      actorRef: actor.clerkUserId,
      businessIds,
    },
  }
}

async function loadContactFollowUpSourceState(db: RuntimeDb): Promise<ContactFollowUpSourceState> {
  const [proposals, policies, decisions, gateways, attempts, receipts, privateEvidenceRefs, noRepairRecords, supportRecords, auditEvents] =
    await Promise.all([
      collect(db, 'protectedActionProposals'),
      collect(db, 'protectedActionPolicyDecisions'),
      collect(db, 'protectedActionOwnerDecisions'),
      collect(db, 'protectedActionGatewayAdmissions'),
      collect(db, 'protectedActionAttempts'),
      collect(db, 'protectedActionReceipts'),
      collect(db, 'protectedActionPrivateEvidenceRefs'),
      collect(db, 'protectedActionNoRepairRecords'),
      collect(db, 'protectedActionSupportRecords'),
      collect(db, 'auditEvents'),
    ])

  return createEmptyContactFollowUpSourceState({
    proposals: proposals.map(toProposal),
    policyDecisions: policies.map(toPolicyDecision),
    ownerDecisions: decisions.map(toOwnerDecision),
    gatewayAdmissions: gateways.map(toGatewayAdmission),
    attempts: attempts.map(toAttempt),
    receipts: receipts.map(toReceipt),
    privateEvidenceRefs: privateEvidenceRefs.map(toPrivateEvidenceRef),
    noRepairRecords: noRepairRecords.map(toNoRepairRecord),
    supportRecords: supportRecords.map(toSupportRecord),
    auditEvents: auditEvents.map(toAuditEvent).filter(isDefined),
  })
}

async function persistContactFollowUpSourceState(db: RuntimeDb, state: ContactFollowUpSourceState): Promise<void> {
  for (const proposal of state.proposals) {
    await upsertByFields(db, 'protectedActionProposals', ['proposalId'], {
      proposalId: proposal.id,
      selectedActionSlug: ContactFollowUpActionSlug,
      businessId: proposal.businessId,
      ownerId: proposal.ownerId,
      ...(proposal.serviceId === undefined ? {} : { serviceId: proposal.serviceId }),
      actorRef: proposal.actorRef,
      sourceEvidenceRef: proposal.target.sourceEvidenceRef,
      allowedParametersJson: JSON.stringify(proposal.parameters),
      policyHintsJson: JSON.stringify(proposal.policyHints),
      canonicalContractHash: proposal.canonicalContractHash,
      proposalHash: proposal.proposalHash,
      idempotencyKey: proposal.idempotencyKey,
      correlationId: proposal.correlationId,
      deadlineAt: proposal.deadlineAt,
      reversibility: proposal.reversibility,
      proofExpectation: proposal.proofExpectation,
      status: proposal.status,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    })
  }

  for (const policy of state.policyDecisions) {
    await upsertByFields(db, 'protectedActionPolicyDecisions', ['policyId'], {
      policyId: policy.id,
      proposalId: policy.proposalId,
      selectedActionSlug: ContactFollowUpActionSlug,
      kind: policy.kind,
      reason: policy.reason,
      proposalHash: policy.proposalHash,
      policyHash: policy.policyHash,
      correlationId: proposalCorrelationId(state, policy.proposalId),
      evaluatedAt: policy.evaluatedAt,
    })
  }

  for (const decision of state.ownerDecisions) {
    await upsertByFields(db, 'protectedActionOwnerDecisions', ['decisionId'], {
      decisionId: decision.id,
      proposalId: decision.proposalId,
      selectedActionSlug: ContactFollowUpActionSlug,
      ownerId: decision.decidedBy,
      decision: decision.decision,
      reason: decision.reason,
      evidenceRefs: decision.evidenceRefs,
      proposalHash: decision.proposalHash,
      policyHash: decision.policyHash,
      decisionHash: decision.decisionHash,
      idempotencyKey: decision.idempotencyKey,
      correlationId: decision.correlationId,
      decidedAt: decision.decidedAt,
    })
  }

  for (const gateway of state.gatewayAdmissions) {
    await upsertByFields(db, 'protectedActionGatewayAdmissions', ['gatewayAdmissionId'], {
      gatewayAdmissionId: gateway.id,
      proposalId: gateway.proposalId,
      selectedActionSlug: ContactFollowUpActionSlug,
      proposalHash: gateway.proposalHash,
      policyHash: gateway.policyHash,
      contractHash: gateway.contractHash,
      ownerDecisionHash: gateway.ownerDecisionHash,
      admissionHash: gateway.admissionHash,
      idempotencyKey: gateway.idempotencyKey,
      correlationId: gateway.correlationId,
      status: gateway.status,
      expiresAt: gateway.expiresAt,
      createdAt: gateway.createdAt,
      ...(gateway.consumedAt === undefined ? {} : { consumedAt: gateway.consumedAt }),
    })
  }

  for (const attempt of state.attempts) {
    await upsertByFields(db, 'protectedActionAttempts', ['attemptId'], {
      attemptId: attempt.id,
      proposalId: attempt.proposalId,
      selectedActionSlug: ContactFollowUpActionSlug,
      businessId: attempt.businessId,
      ownerId: attempt.ownerId,
      decisionId: attempt.decisionId,
      gatewayAdmissionId: attempt.gatewayAdmissionId,
      outcome: attempt.outcome,
      attemptHash: attempt.attemptHash,
      ...(attempt.receiptId === undefined ? {} : { receiptId: attempt.receiptId }),
      ...(attempt.reason === undefined ? {} : { reason: attempt.reason }),
      idempotencyKey: attempt.idempotencyKey,
      correlationId: attempt.correlationId,
      attemptedAt: attempt.attemptedAt,
    })
  }

  for (const receipt of state.receipts) {
    await upsertByFields(db, 'protectedActionReceipts', ['receiptId'], {
      receiptId: receipt.id,
      proposalId: receipt.proposalId,
      attemptId: receipt.attemptId,
      selectedActionSlug: ContactFollowUpActionSlug,
      kind: receipt.kind,
      providerBoundary: receipt.providerBoundary,
      payloadHash: receipt.payloadHash,
      redactedReadbackJson: JSON.stringify(receipt.redactedReadback),
      recordedAt: receipt.recordedAt,
    })
  }

  for (const privateEvidenceRef of state.privateEvidenceRefs) {
    await upsertByFields(db, 'protectedActionPrivateEvidenceRefs', ['privateEvidenceRefId'], {
      privateEvidenceRefId: privateEvidenceRef.id,
      proposalId: privateEvidenceRef.proposalId,
      ...(privateEvidenceRef.attemptId === undefined ? {} : { attemptId: privateEvidenceRef.attemptId }),
      selectedActionSlug: ContactFollowUpActionSlug,
      retentionClass: privateEvidenceRef.retentionClass,
      accessPolicy: privateEvidenceRef.accessPolicy,
      payloadHash: privateEvidenceRef.payloadHash,
      ...(privateEvidenceRef.privatePayloadRef === undefined ? {} : { privatePayloadRef: privateEvidenceRef.privatePayloadRef }),
      ttlExpiresAt: privateEvidenceRef.ttlExpiresAt,
      ...(privateEvidenceRef.redactedAt === undefined ? {} : { redactedAt: privateEvidenceRef.redactedAt }),
    })
  }

  for (const noRepair of state.noRepairRecords) {
    await upsertByFields(db, 'protectedActionNoRepairRecords', ['noRepairId'], {
      noRepairId: noRepair.id,
      proposalId: noRepair.proposalId,
      ...(noRepair.attemptId === undefined ? {} : { attemptId: noRepair.attemptId }),
      selectedActionSlug: ContactFollowUpActionSlug,
      reason: noRepair.reason,
      evidenceRefs: noRepair.evidenceRefs,
      noRepairHash: noRepair.noRepairHash,
      idempotencyKey: noRepair.idempotencyKey,
      correlationId: noRepair.correlationId,
      markedBy: noRepair.markedBy,
      markedAt: noRepair.markedAt,
    })
  }

  for (const auditEvent of state.auditEvents) {
    await upsertAuditEvent(db, auditEvent)
    await upsertProtectedActionOperation(db, auditEvent)
  }
}

async function upsertAuditEvent(db: RuntimeDb, auditEvent: AuditEventContract): Promise<void> {
  await upsertByFields(db, 'auditEvents', ['eventId'], {
    eventId: auditEvent.eventId,
    eventType: auditEvent.eventType,
    actorKind: auditEvent.actorKind,
    actorRef: auditEvent.actorRef,
    ...(auditEvent.businessId === undefined ? {} : { businessId: auditEvent.businessId }),
    targetType: auditEvent.targetType,
    targetRef: auditEvent.targetRef,
    ...(auditEvent.beforeState === undefined ? {} : { beforeState: auditEvent.beforeState }),
    ...(auditEvent.afterState === undefined ? {} : { afterState: auditEvent.afterState }),
    idempotencyKey: auditEvent.idempotencyKey,
    correlationId: auditEvent.correlationId,
    ...(auditEvent.reasonCode === undefined ? {} : { reasonCode: auditEvent.reasonCode }),
    evidenceRefs: auditEvent.evidenceRefs,
    redactedPayloadJson: JSON.stringify(auditEvent.redactedPayload),
    payloadHash: auditEvent.payloadHash,
    createdAt: auditEvent.createdAt,
  })
}

async function upsertProtectedActionOperation(db: RuntimeDb, auditEvent: AuditEventContract): Promise<void> {
  await upsertByFields(db, 'operationKeys', ['scope', 'operationName', 'key'], {
    scope: 'protected_action',
    actorKind: auditEvent.actorKind,
    actorRef: auditEvent.actorRef,
    operationName: operationNameForAudit(auditEvent.eventType),
    key: auditEvent.idempotencyKey,
    requestHash: auditEvent.payloadHash,
    sourceHash: auditEvent.targetRef,
    status: 'succeeded',
    resultHash: stableHash({ eventType: auditEvent.eventType, targetRef: auditEvent.targetRef }),
    effectRefs: [`event:${auditEvent.eventType}`, `target:${auditEvent.targetRef}`],
    createdAt: auditEvent.createdAt,
    updatedAt: auditEvent.createdAt,
  })
}

async function upsertByFields(
  db: RuntimeDb,
  tableName: string,
  fields: readonly string[],
  patch: Record<string, unknown>
): Promise<void> {
  const existing = (await collect(db, tableName)).find((row) => fields.every((field) => row[field] === patch[field]))
  if (existing === undefined) {
    await db.insert(tableName, patch)
    return
  }

  await db.patch(existing._id, patch)
}

async function collect(db: Pick<RuntimeDb, 'query'>, tableName: string): Promise<RuntimeDocument[]> {
  return db.query(tableName).collect()
}

function toProposal(row: RuntimeDocument): ContactFollowUpProposal {
  const parameters = contactParametersFromJson(stringField(row, 'allowedParametersJson'))
  const ownerId = brandNonEmpty(stringField(row, 'ownerId'), 'OwnerId')
  const businessId = brandNonEmpty(stringField(row, 'businessId'), 'BusinessId')
  const serviceId = optionalStringField(row, 'serviceId')
  return {
    id: stringField(row, 'proposalId') as ContactFollowUpProposalId,
    selectedActionSlug: ContactFollowUpActionSlug,
    businessId,
    ownerId,
    ...(serviceId === undefined ? {} : { serviceId: brandNonEmpty(serviceId, 'ServiceId') }),
    actorRef: stringField(row, 'actorRef'),
    target: {
      businessId,
      ownerId,
      ...(serviceId === undefined ? {} : { serviceId: brandNonEmpty(serviceId, 'ServiceId') }),
      sourceEvidenceRef: stringField(row, 'sourceEvidenceRef'),
      suppressed: false,
    },
    parameters,
    canonicalContractHash: brandNonEmpty(stringField(row, 'canonicalContractHash'), 'SourceHash'),
    proposalHash: brandNonEmpty(stringField(row, 'proposalHash'), 'SourceHash'),
    idempotencyKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    deadlineAt: numberField(row, 'deadlineAt'),
    reversibility: 'owner_can_close_without_provider_reversal',
    proofExpectation: 'source_owned_receipt_or_gap',
    policyHints: policyHintsFromJson(optionalStringField(row, 'policyHintsJson')),
    status: proposalStatus(row),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

function toPolicyDecision(row: RuntimeDocument): ContactFollowUpPolicyDecision {
  return {
    id: stringField(row, 'policyId') as ContactFollowUpPolicyId,
    proposalId: stringField(row, 'proposalId') as ContactFollowUpProposalId,
    kind: policyKindField(row),
    reason: stringField(row, 'reason'),
    proposalHash: brandNonEmpty(stringField(row, 'proposalHash'), 'SourceHash'),
    policyHash: brandNonEmpty(stringField(row, 'policyHash'), 'SourceHash'),
    evaluatedAt: numberField(row, 'evaluatedAt'),
  }
}

function toOwnerDecision(row: RuntimeDocument): ContactFollowUpOwnerDecisionRecord {
  return {
    id: stringField(row, 'decisionId') as ContactFollowUpDecisionId,
    proposalId: stringField(row, 'proposalId') as ContactFollowUpProposalId,
    decision: decisionField(row),
    reason: stringField(row, 'reason'),
    evidenceRefs: stringArrayField(row, 'evidenceRefs'),
    proposalHash: brandNonEmpty(stringField(row, 'proposalHash'), 'SourceHash'),
    policyHash: brandNonEmpty(stringField(row, 'policyHash'), 'SourceHash'),
    decisionHash: brandNonEmpty(stringField(row, 'decisionHash'), 'SourceHash'),
    idempotencyKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    decidedBy: brandNonEmpty(stringField(row, 'ownerId'), 'OwnerId'),
    decidedAt: numberField(row, 'decidedAt'),
  }
}

function toGatewayAdmission(row: RuntimeDocument): ContactFollowUpGatewayAdmission {
  return {
    id: stringField(row, 'gatewayAdmissionId') as ContactFollowUpGatewayAdmissionId,
    proposalId: stringField(row, 'proposalId') as ContactFollowUpProposalId,
    selectedActionSlug: ContactFollowUpActionSlug,
    proposalHash: brandNonEmpty(stringField(row, 'proposalHash'), 'SourceHash'),
    policyHash: brandNonEmpty(stringField(row, 'policyHash'), 'SourceHash'),
    contractHash: brandNonEmpty(stringField(row, 'contractHash'), 'SourceHash'),
    ownerDecisionHash: brandNonEmpty(stringField(row, 'ownerDecisionHash'), 'SourceHash'),
    admissionHash: brandNonEmpty(stringField(row, 'admissionHash'), 'SourceHash'),
    idempotencyKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    status: gatewayStatus(row),
    expiresAt: numberField(row, 'expiresAt'),
    createdAt: numberField(row, 'createdAt'),
    ...(optionalNumberField(row, 'consumedAt') === undefined ? {} : { consumedAt: numberField(row, 'consumedAt') }),
  }
}

function toAttempt(row: RuntimeDocument): ContactFollowUpAttempt {
  return {
    id: stringField(row, 'attemptId') as ContactFollowUpAttemptId,
    proposalId: stringField(row, 'proposalId') as ContactFollowUpProposalId,
    selectedActionSlug: ContactFollowUpActionSlug,
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    ownerId: brandNonEmpty(stringField(row, 'ownerId'), 'OwnerId'),
    decisionId: stringField(row, 'decisionId') as ContactFollowUpDecisionId,
    gatewayAdmissionId: stringField(row, 'gatewayAdmissionId') as ContactFollowUpGatewayAdmissionId,
    outcome: attemptOutcomeField(row),
    attemptHash: brandNonEmpty(stringField(row, 'attemptHash'), 'SourceHash'),
    ...(optionalStringField(row, 'receiptId') === undefined ? {} : { receiptId: stringField(row, 'receiptId') as ContactFollowUpReceiptId }),
    ...(optionalStringField(row, 'reason') === undefined ? {} : { reason: stringField(row, 'reason') }),
    idempotencyKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    attemptedAt: numberField(row, 'attemptedAt'),
  }
}

function toReceipt(row: RuntimeDocument): ContactFollowUpReceipt {
  return {
    id: stringField(row, 'receiptId') as ContactFollowUpReceiptId,
    proposalId: stringField(row, 'proposalId') as ContactFollowUpProposalId,
    attemptId: stringField(row, 'attemptId') as ContactFollowUpAttemptId,
    kind: receiptKind(row),
    providerBoundary: 'source_owned_follow_up_outbox',
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    redactedReadback: redactedReadbackFromJson(stringField(row, 'redactedReadbackJson')),
    recordedAt: numberField(row, 'recordedAt'),
  }
}

function toPrivateEvidenceRef(row: RuntimeDocument): ContactFollowUpPrivateEvidenceRef {
  return {
    id: stringField(row, 'privateEvidenceRefId') as ContactFollowUpPrivateEvidenceRefId,
    proposalId: stringField(row, 'proposalId') as ContactFollowUpProposalId,
    ...(optionalStringField(row, 'attemptId') === undefined ? {} : { attemptId: stringField(row, 'attemptId') as ContactFollowUpAttemptId }),
    retentionClass: 'protected_action_private_evidence',
    accessPolicy: 'owner_admin_operator_only',
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    ...(optionalStringField(row, 'privatePayloadRef') === undefined ? {} : { privatePayloadRef: stringField(row, 'privatePayloadRef') }),
    ttlExpiresAt: numberField(row, 'ttlExpiresAt'),
    ...(optionalNumberField(row, 'redactedAt') === undefined ? {} : { redactedAt: numberField(row, 'redactedAt') }),
  }
}

function toNoRepairRecord(row: RuntimeDocument): ContactFollowUpNoRepairRecord {
  return {
    id: stringField(row, 'noRepairId') as ContactFollowUpNoRepairId,
    proposalId: stringField(row, 'proposalId') as ContactFollowUpProposalId,
    ...(optionalStringField(row, 'attemptId') === undefined ? {} : { attemptId: stringField(row, 'attemptId') as ContactFollowUpAttemptId }),
    reason: stringField(row, 'reason'),
    evidenceRefs: stringArrayField(row, 'evidenceRefs'),
    noRepairHash: brandNonEmpty(stringField(row, 'noRepairHash'), 'SourceHash'),
    idempotencyKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    markedBy: stringField(row, 'markedBy'),
    markedAt: numberField(row, 'markedAt'),
  }
}

function toSupportRecord(row: RuntimeDocument): ContactFollowUpSupportRecord {
  return {
    supportRecordId: stringField(row, 'supportRecordId'),
    selectedActionSlug: ContactFollowUpActionSlug,
    primaryOwnerRef: stringField(row, 'primaryOwnerRef'),
    backupOwnerRef: stringField(row, 'backupOwnerRef'),
    primaryAdminOperatorRef: stringField(row, 'primaryAdminOperatorRef'),
    supportedChannels: stringArrayField(row, 'supportedChannels'),
    launchStage: 'internal_alpha',
    capacityThreshold: numberField(row, 'capacityThreshold'),
    backlogAgeThresholdMs: numberField(row, 'backlogAgeThresholdMs'),
    phaseIncidentsBlocking: stringArrayField(row, 'phaseIncidentsBlocking'),
    claimDisablePath: 'protected_actions_enabled',
    perChannelKillRules: stringArrayField(row, 'perChannelKillRules'),
    nextReviewAt: numberField(row, 'nextReviewAt'),
    sourceHash: brandNonEmpty(stringField(row, 'sourceHash'), 'SourceHash'),
  }
}

function toAuditEvent(row: RuntimeDocument): AuditEventContract | undefined {
  if (!stringField(row, 'eventType').startsWith('protected_action.')) {
    return undefined
  }

  const businessId = optionalStringField(row, 'businessId')
  return {
    eventId: brandNonEmpty(stringField(row, 'eventId'), 'AuditEventId'),
    eventType: stringField(row, 'eventType') as AuditEventContract['eventType'],
    actorKind: actorKind(row),
    actorRef: stringField(row, 'actorRef'),
    targetType: targetType(row),
    targetRef: stringField(row, 'targetRef'),
    ...(businessId === undefined ? {} : { businessId: brandNonEmpty(businessId, 'BusinessId') }),
    ...(optionalStringField(row, 'beforeState') === undefined ? {} : { beforeState: stringField(row, 'beforeState') }),
    ...(optionalStringField(row, 'afterState') === undefined ? {} : { afterState: stringField(row, 'afterState') }),
    idempotencyKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    ...(optionalStringField(row, 'reasonCode') === undefined ? {} : { reasonCode: stringField(row, 'reasonCode') }),
    evidenceRefs: stringArrayField(row, 'evidenceRefs'),
    redactedPayload: parseJson(stringField(row, 'redactedPayloadJson')) as RedactedPayload,
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
  }
}

function serializeQueueItem(item: ReturnType<typeof listOwnerContactFollowUpQueue>[number]) {
  return {
    proposal: serializeProposal(item.proposal),
    ...(item.policy === undefined ? {} : { policy: serializePolicy(item.policy) }),
    ...(item.ownerDecision === undefined ? {} : { ownerDecision: serializeOwnerDecision(item.ownerDecision) }),
    ...(item.attempt === undefined ? {} : { attempt: serializeAttempt(item.attempt) }),
    ...(item.receipt === undefined ? {} : { receipt: serializeReceipt(item.receipt) }),
  }
}

function serializeReconstruction(readback: ContactFollowUpReconstruction) {
  return {
    proposal: serializeProposal(readback.proposal),
    ...(readback.policy === undefined ? {} : { policy: serializePolicy(readback.policy) }),
    ...(readback.ownerDecision === undefined ? {} : { ownerDecision: serializeOwnerDecision(readback.ownerDecision) }),
    ...(readback.attempt === undefined ? {} : { attempt: serializeAttempt(readback.attempt) }),
    ...(readback.receipt === undefined ? {} : { receipt: serializeReceipt(readback.receipt) }),
    auditEvents: readback.auditEvents.map(serializeAuditEvent),
    ...(readback.gatewayAdmission === undefined ? {} : { gatewayAdmission: serializeGateway(readback.gatewayAdmission) }),
    ...(readback.noRepair === undefined ? {} : { noRepair: serializeNoRepair(readback.noRepair) }),
    privateEvidenceRefs: readback.privateEvidenceRefs.map(serializePrivateEvidenceRef),
    readbackStatus: readback.readbackStatus,
    repairAction: readback.repairAction,
  }
}

function serializeProposal(proposal: ContactFollowUpProposal) {
  return {
    ...proposal,
    target: { ...proposal.target },
    parameters: { ...proposal.parameters },
    policyHints: { ...proposal.policyHints },
  }
}

function serializePolicy(policy: ContactFollowUpPolicyDecision) {
  return { ...policy }
}

function serializeOwnerDecision(decision: ContactFollowUpOwnerDecisionRecord) {
  return { ...decision, evidenceRefs: [...decision.evidenceRefs] }
}

function serializeGateway(gateway: ContactFollowUpGatewayAdmission) {
  return { ...gateway }
}

function serializeAttempt(attempt: ContactFollowUpAttempt) {
  return { ...attempt }
}

function serializeReceipt(receipt: ContactFollowUpReceipt) {
  return { ...receipt, redactedReadback: { ...receipt.redactedReadback } }
}

function serializePrivateEvidenceRef(ref: ContactFollowUpPrivateEvidenceRef) {
  return { ...ref }
}

function serializeNoRepair(noRepair: ContactFollowUpNoRepairRecord) {
  return { ...noRepair, evidenceRefs: [...noRepair.evidenceRefs] }
}

function serializeAuditEvent(event: AuditEventContract) {
  return {
    ...event,
    evidenceRefs: [...event.evidenceRefs],
    redactedPayload: serializeContactFollowUpRedactedPayload(event.redactedPayload),
  }
}

function serializeContactFollowUpRedactedPayload(payload: RedactedPayload): ContactFollowUpRedactedPayloadDto {
  if (!isRecord(payload)) {
    return { selectedActionSlug: ContactFollowUpActionSlug }
  }
  const parameterKeys = stringArrayValue(payload, 'parameterKeys')
  const proposalHash = stringValue(payload, 'proposalHash')
  const policyHash = stringValue(payload, 'policyHash')
  const ownerDecisionHash = stringValue(payload, 'ownerDecisionHash')
  const admissionHash = stringValue(payload, 'admissionHash')
  const decisionHash = stringValue(payload, 'decisionHash')
  const evidenceCount = numberValue(payload, 'evidenceCount')

  return {
    selectedActionSlug: ContactFollowUpActionSlug,
    ...(parameterKeys === undefined ? {} : { parameterKeys }),
    ...(proposalHash === undefined ? {} : { proposalHash }),
    ...(isOneOf(ContactFollowUpPolicyKindValues, payload.policy) ? { policy: payload.policy } : {}),
    ...(isOneOf(ContactFollowUpDecisionValues, payload.decision) ? { decision: payload.decision } : {}),
    ...(policyHash === undefined ? {} : { policyHash }),
    ...(ownerDecisionHash === undefined ? {} : { ownerDecisionHash }),
    ...(admissionHash === undefined ? {} : { admissionHash }),
    ...(decisionHash === undefined ? {} : { decisionHash }),
    ...(isOneOf(ContactFollowUpAttemptOutcomeValues, payload.outcome) ? { outcome: payload.outcome } : {}),
    ...(evidenceCount === undefined ? {} : { evidenceCount }),
  }
}

function readbackForKind(kind: 'receipt' | 'proof_gap' | 'failed', proposalId: string): ContactFollowUpAttemptReadback {
  if (kind === 'proof_gap') {
    return { kind, gapReason: 'mismatch', payloadHash: stableHash({ proposalId, kind }) as SourceHash }
  }

  if (kind === 'failed') {
    return { kind, failureReason: 'provider_unavailable', payloadHash: stableHash({ proposalId, kind }) as SourceHash }
  }

  return { kind, resultRef: `source-receipt:${proposalId}:retry`, payloadHash: stableHash({ proposalId, kind }) as SourceHash }
}

function retryExhaustedEvent(
  reconstruction: ContactFollowUpReconstruction,
  authority: ContactFollowUpOwnerAuthority,
  operationKey: string,
  correlationId: string,
  now: number
): AuditEventContract {
  const redactedPayload = {
    selectedActionSlug: ContactFollowUpActionSlug,
    proposalHash: reconstruction.proposal.proposalHash,
    maxAttempts: ContactFollowUpMaxAttemptCount,
  }
  const payloadHash = stableHash(redactedPayload) as SourceHash
  return {
    eventId: brandNonEmpty(`audit:protected_action.retry_exhausted:${reconstruction.proposal.id}:${operationKey}`, 'AuditEventId'),
    eventType: 'protected_action.retry_exhausted',
    actorKind: 'owner',
    actorRef: authority.actorRef,
    targetType: 'protected_action',
    targetRef: reconstruction.proposal.id,
    businessId: reconstruction.proposal.businessId,
    beforeState: reconstruction.readbackStatus,
    afterState: 'retry_exhausted',
    idempotencyKey: brandNonEmpty(operationKey, 'OperationKey'),
    correlationId: brandNonEmpty(correlationId, 'CorrelationId'),
    reasonCode: 'bounded_retry_exhausted',
    evidenceRefs: reconstruction.attempt === undefined ? [] : [reconstruction.attempt.id],
    redactedPayload,
    payloadHash,
    createdAt: now,
  }
}

function moduleError(result: { kind: 'error'; code: string; retryable: boolean; reason: string; field?: string }) {
  return {
    kind: 'error' as const,
    code: result.code as never,
    retryable: result.retryable,
    reason: result.reason,
    ...(result.field === undefined ? {} : { field: result.field }),
  }
}

function protectedActionError(code: string, reason: string) {
  return {
    kind: 'error' as const,
    code: code as never,
    retryable: false,
    reason,
  }
}

function assertProtectedActionCsrf(args: { csrfToken?: string; csrfCookie?: string; origin?: string }) {
  return assertCsrf({
    ...(args.csrfToken === undefined ? {} : { csrfToken: args.csrfToken }),
    ...(args.csrfCookie === undefined ? {} : { csrfCookie: args.csrfCookie }),
    ...(args.origin === undefined ? {} : { origin: args.origin }),
    allowedOrigins: sourceAllowedOrigins(),
  })
}

function sourceAllowedOrigins(): readonly string[] {
  const configured = readEnv('AE_ALLOWED_ORIGINS') ?? readEnv('VITE_AE_ALLOWED_ORIGINS') ?? readEnv('SITE_URL') ?? readEnv('VITE_SITE_URL')
  const origins = configured === undefined ? [] : configured.split(',').map((origin) => origin.trim()).filter(Boolean)
  return ['https://ae.example', ...origins.filter((origin) => origin !== 'https://ae.example')]
}

function readEnv(name: string): string | undefined {
  return typeof process === 'undefined' ? undefined : process.env[name]
}

function proposalCorrelationId(state: ContactFollowUpSourceState, proposalId: ContactFollowUpProposalId): CorrelationId {
  return state.proposals.find((proposal) => proposal.id === proposalId)?.correlationId ?? brandNonEmpty('correlation:protected-action:missing', 'CorrelationId')
}

function operationNameForAudit(eventType: string): string {
  if (eventType === 'protected_action.proposed') return 'proposeContactFollowUpRequest'
  if (eventType === 'protected_action.policy_evaluated') return 'evaluateContactFollowUpPolicy'
  if (eventType === 'protected_action.approved' || eventType === 'protected_action.rejected') return 'decideContactFollowUpProposal'
  if (eventType === 'protected_action.gateway_admitted' || eventType === 'protected_action.gateway_consumed') return 'contactFollowUpGateway'
  if (eventType === 'protected_action.no_repair_marked') return 'markContactFollowUpNoRepair'
  if (eventType === 'protected_action.retry_exhausted') return 'retryContactFollowUpAttempt'
  return 'recordContactFollowUpProviderAttempt'
}

function contactParametersFromJson(value: string): ContactFollowUpProposal['parameters'] {
  const parsed = parseJson(value)
  if (
    isRecord(parsed) &&
    typeof parsed.contactName === 'string' &&
    (parsed.contactChannel === 'email' || parsed.contactChannel === 'phone' || parsed.contactChannel === 'other') &&
    typeof parsed.messageSummary === 'string' &&
    typeof parsed.sourceMessageRef === 'string'
  ) {
    return {
      contactName: parsed.contactName,
      contactChannel: parsed.contactChannel,
      messageSummary: parsed.messageSummary,
      sourceMessageRef: parsed.sourceMessageRef,
    }
  }

  return {
    contactName: 'Unknown contact',
    contactChannel: 'other',
    messageSummary: 'Stored contact follow-up parameters were unavailable.',
    sourceMessageRef: 'source-message:unavailable',
  }
}

function policyHintsFromJson(value: string | undefined): ContactFollowUpPolicyHints {
  const parsed = value === undefined ? undefined : parseJson(value)
  if (
    isRecord(parsed) &&
    (parsed.sourceProof === 'present' || parsed.sourceProof === 'missing' || parsed.sourceProof === 'gap') &&
    typeof parsed.requiresExternalAuthority === 'boolean'
  ) {
    return {
      sourceProof: parsed.sourceProof,
      requiresExternalAuthority: parsed.requiresExternalAuthority,
    }
  }

  return { sourceProof: 'present', requiresExternalAuthority: false }
}

function redactedReadbackFromJson(value: string): ContactFollowUpReceipt['redactedReadback'] {
  const parsed = parseJson(value)
  if (isRecord(parsed) && typeof parsed.targetRef === 'string') {
    return {
      targetRef: parsed.targetRef,
      ...(typeof parsed.resultRef === 'string' ? { resultRef: parsed.resultRef } : {}),
      ...(typeof parsed.gapReason === 'string' ? { gapReason: parsed.gapReason } : {}),
    }
  }

  return { targetRef: 'source-message:unavailable' }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function proposalStatus(row: RuntimeDocument): ContactFollowUpProposal['status'] {
  const value = stringField(row, 'status')
  return value === 'approved' || value === 'rejected' || value === 'attempted' ? value : 'proposed'
}

function policyKindField(row: RuntimeDocument): ContactFollowUpPolicyDecision['kind'] {
  const value = stringField(row, 'kind')
  return ContactFollowUpPolicyKindValues.includes(value as ContactFollowUpPolicyDecision['kind'])
    ? (value as ContactFollowUpPolicyDecision['kind'])
    : 'review_required'
}

function decisionField(row: RuntimeDocument): ContactFollowUpOwnerDecisionRecord['decision'] {
  return stringField(row, 'decision') === 'rejected' ? 'rejected' : 'approved'
}

function gatewayStatus(row: RuntimeDocument): ContactFollowUpGatewayAdmission['status'] {
  const value = stringField(row, 'status')
  return value === 'consumed' || value === 'expired' || value === 'replay_rejected' ? value : 'admitted'
}

function attemptOutcomeField(row: RuntimeDocument): ContactFollowUpAttempt['outcome'] {
  const value = stringField(row, 'outcome')
  return value === 'proof_gap_recorded' || value === 'failed' ? value : 'receipt_recorded'
}

function receiptKind(row: RuntimeDocument): ContactFollowUpReceipt['kind'] {
  return stringField(row, 'kind') === 'proof_gap' ? 'proof_gap' : 'receipt'
}

function actorKind(row: RuntimeDocument): AuditEventContract['actorKind'] {
  const value = stringField(row, 'actorKind')
  return value === 'admin' || value === 'system' || value === 'anonymous' ? value : 'owner'
}

function targetType(row: RuntimeDocument): AuditEventContract['targetType'] {
  return stringField(row, 'targetType') === 'protected_action_attempt' ? 'protected_action_attempt' : 'protected_action'
}

function stringField(row: RuntimeDocument, field: string): string {
  const value = row[field]
  return typeof value === 'string' ? value : ''
}

function optionalStringField(row: RuntimeDocument, field: string): string | undefined {
  const value = row[field]
  return typeof value === 'string' ? value : undefined
}

function numberField(row: RuntimeDocument, field: string): number {
  const value = row[field]
  return typeof value === 'number' ? value : 0
}

function optionalNumberField(row: RuntimeDocument, field: string): number | undefined {
  const value = row[field]
  return typeof value === 'number' ? value : undefined
}

function stringArrayField(row: RuntimeDocument, field: string): string[] {
  const value = row[field]
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function stringValue(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  return typeof value === 'string' ? value : undefined
}

function numberValue(record: Record<string, unknown>, field: string): number | undefined {
  const value = record[field]
  return typeof value === 'number' ? value : undefined
}

function stringArrayValue(record: Record<string, unknown>, field: string): string[] | undefined {
  const value = record[field]
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined
}

function isOneOf<const Values extends readonly string[]>(values: Values, value: unknown): value is Values[number] {
  return typeof value === 'string' && values.includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
