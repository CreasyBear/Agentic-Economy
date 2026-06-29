import type { UserIdentity } from 'convex/server'
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { resolveAdminAuthority, resolveBusinessActor } from './authz'
import {
  loadAdminContactFollowUpSlice,
  loadContactFollowUpProposalSlice,
  loadContactFollowUpProposalSliceByIdempotencyKey,
  loadOwnerContactFollowUpQueueSlice,
  persistContactFollowUpSlice,
} from './protectedActionStore'
import { runtimeDb } from './source_state'
import type { RuntimeDb, RuntimeDocument } from './source_state'
import { literalUnion } from '../src/modules/common/convex-literals'
import { brandNonEmpty } from '../src/modules/common/ids'
import type { BusinessId, OwnerId, SourceHash } from '../src/modules/common/ids'
import { stableHash } from '../src/modules/common/stable-hash'
import type { AuditEventContract, RedactedPayload } from '../src/modules/observability/public'
import { assertCsrf } from '../src/modules/security/public'
import {
  ContactFollowUpActionSlug,
  ContactFollowUpAttemptOutcomeValues,
  ContactFollowUpDecisionValues,
  ContactFollowUpMaxAttemptCount,
  ContactFollowUpPolicyKindValues,
  ContactFollowUpReadbackStatusValues,
  createContactFollowUpGatewayAdmission,
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
  ContactFollowUpGatewayAdmission,
  ContactFollowUpNoRepairRecord,
  ContactFollowUpOwnerAuthority,
  ContactFollowUpOwnerDecisionRecord,
  ContactFollowUpPolicyDecision,
  ContactFollowUpPrivateEvidenceRef,
  ContactFollowUpProposal,
  ContactFollowUpProposalId,
  ContactFollowUpReceipt,
  ContactFollowUpReconstruction,
  ContactFollowUpSourceState,
} from '../src/modules/protected-action/public'

const selectedActionSlug = v.literal(ContactFollowUpActionSlug)
const policyKind = literalUnion(ContactFollowUpPolicyKindValues)
const ownerDecision = literalUnion(ContactFollowUpDecisionValues)
const attemptOutcome = literalUnion(ContactFollowUpAttemptOutcomeValues)
const readbackStatus = literalUnion(ContactFollowUpReadbackStatusValues)
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
  readbackStatus,
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

    const owner = await readCurrentOwnerAuthorityForBusiness(ctx, args.businessId)
    if (owner.kind === 'denied') {
      return protectedActionError(owner.reason, owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadContactFollowUpProposalSliceByIdempotencyKey(db, args.operationKey)
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

    await persistContactFollowUpSlice(db, policy.state)
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
    const owner = await readCurrentOwnerIdentity(ctx)
    if (owner.kind === 'denied') {
      return owner
    }

    const state = await loadOwnerContactFollowUpQueueSlice(runtimeDb(ctx.db), owner.identity.ownerId)
    const queue = listOwnerContactFollowUpQueue(state, owner.identity.ownerId)
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

    const owner = await readCurrentOwnerIdentity(ctx)
    if (owner.kind === 'denied') {
      return protectedActionError(owner.reason, owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadContactFollowUpProposalSlice(db, args.proposalId)
    const reconstruction = readContactFollowUpReconstruction(state, args.proposalId as ContactFollowUpProposalId)
    const authority = await ownerAuthorityForProposal(db, owner.identity, reconstruction.proposal)
    if (authority === undefined) {
      return protectedActionError('contact_follow_up_not_found', 'request_not_found')
    }

    const now = Date.now()
    const gateway = createContactFollowUpGatewayAdmission(state, {
      authority,
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
      authority,
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
        const retryExhaustedAudit = retryExhaustedEvent(reconstruction, authority, args.operationKey, args.correlationId, now)
        const exhaustedState = { ...gateway.state, auditEvents: [...gateway.state.auditEvents, retryExhaustedAudit] }
        await persistContactFollowUpSlice(db, exhaustedState)
      }
      return moduleError(attempted)
    }

    await persistContactFollowUpSlice(db, attempted.state)
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

    const owner = await readCurrentOwnerIdentity(ctx)
    if (owner.kind === 'denied') {
      return protectedActionError(owner.reason, owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadContactFollowUpProposalSlice(db, args.proposalId)
    const proposal = state.proposals.find((candidate) => candidate.id === args.proposalId)
    const authority = proposal === undefined ? undefined : await ownerAuthorityForProposal(db, owner.identity, proposal)
    if (authority === undefined) {
      return protectedActionError('contact_follow_up_not_found', 'request_not_found')
    }

    const result = markContactFollowUpNoRepair(state, {
      authority,
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

    await persistContactFollowUpSlice(db, result.state)
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

    const state = await loadAdminContactFollowUpSlice(db, args)
    const rows = state.proposals.map((proposal) => readContactFollowUpReconstruction(state, proposal.id))

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
  const owner = await readCurrentOwnerIdentity(ctx)
  if (owner.kind === 'denied') {
    return protectedActionError(owner.reason, owner.reason)
  }

  const db = runtimeDb(ctx.db)
  const state = await loadContactFollowUpProposalSlice(db, proposalId)
  const proposal = state.proposals.find((candidate) => candidate.id === proposalId)
  if (proposal !== undefined && (await ownerAuthorityForProposal(db, owner.identity, proposal)) === undefined) {
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
  const owner = await readCurrentOwnerIdentity(ctx)
  if (owner.kind === 'denied') {
    return protectedActionError(owner.reason, owner.reason)
  }

  const db = runtimeDb(ctx.db)
  const state = await loadContactFollowUpProposalSlice(db, input.proposalId)
  const proposal = state.proposals.find((candidate) => candidate.id === input.proposalId)
  const authority = proposal === undefined ? undefined : await ownerAuthorityForProposal(db, owner.identity, proposal)
  if (proposal === undefined || authority === undefined) {
    return protectedActionError('contact_follow_up_not_found', 'request_not_found')
  }

  const policyState = state.policyDecisions.some((policy) => policy.proposalId === proposal.id)
    ? state
    : evaluateOrReturnState(state, proposal.id, Date.now())
  const decided = decideContactFollowUpProposal(policyState, {
    authority,
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
    await persistContactFollowUpSlice(db, decided.state)
    return {
      kind: 'ok' as const,
      code: decided.code,
      reconstruction: serializeReconstruction(readContactFollowUpReconstruction(decided.state, proposal.id)),
    }
  }

  const now = Date.now()
  const gateway = createContactFollowUpGatewayAdmission(decided.state, {
    authority,
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
    authority,
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

  await persistContactFollowUpSlice(db, attempted.state)
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

type CurrentOwnerIdentity = {
  ownerId: OwnerId
  actorRef: string
}

async function readCurrentOwnerIdentity(ctx: RuntimeCtx): Promise<
  | { kind: 'allowed'; identity: CurrentOwnerIdentity }
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

  return {
    kind: 'allowed',
    identity: {
      ownerId: brandNonEmpty(owner._id, 'OwnerId'),
      actorRef: actor.clerkUserId,
    },
  }
}

async function readCurrentOwnerAuthorityForBusiness(ctx: RuntimeCtx, businessId: string): Promise<
  | { kind: 'allowed'; authority: ContactFollowUpOwnerAuthority }
  | { kind: 'denied'; reason: 'missing_auth' | 'owner_not_found' }
> {
  const owner = await readCurrentOwnerIdentity(ctx)
  if (owner.kind === 'denied') {
    return owner
  }

  const ownedBusinessId = await readOwnedBusinessId(runtimeDb(ctx.db), owner.identity, businessId)
  return {
    kind: 'allowed',
    authority: {
      ...owner.identity,
      businessIds: ownedBusinessId === undefined ? [] : [ownedBusinessId],
    },
  }
}

async function ownerAuthorityForProposal(
  db: RuntimeDb,
  owner: CurrentOwnerIdentity,
  proposal: ContactFollowUpProposal
): Promise<ContactFollowUpOwnerAuthority | undefined> {
  if (proposal.ownerId !== owner.ownerId) {
    return undefined
  }

  const ownedBusinessId = await readOwnedBusinessId(db, owner, proposal.businessId)
  return ownedBusinessId === undefined ? undefined : { ...owner, businessIds: [ownedBusinessId] }
}

async function readOwnedBusinessId(
  db: RuntimeDb,
  owner: CurrentOwnerIdentity,
  businessId: string
): Promise<BusinessId | undefined> {
  const business = await getRuntimeDocument(db, businessId)
  if (business === null || stringField(business, 'ownerId') !== owner.ownerId) {
    return undefined
  }

  return brandNonEmpty(business._id, 'BusinessId')
}

async function getRuntimeDocument(db: RuntimeDb, id: string): Promise<RuntimeDocument | null> {
  try {
    return await db.get(id)
  } catch {
    return null
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

function stringField(row: RuntimeDocument, field: string): string {
  const value = row[field]
  return typeof value === 'string' ? value : ''
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
