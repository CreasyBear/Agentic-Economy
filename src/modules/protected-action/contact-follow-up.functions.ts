import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceMutation, callSourceQuery, ConvexSourceError, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import { brandNonEmpty } from '@/modules/common/ids'
import type { BusinessId, CorrelationId, OperationKey, OwnerId, ServiceId, SourceHash } from '@/modules/common/ids'
import {
  ContactFollowUpActionSlug,
  createContactFollowUpGatewayAdmission,
  createEmptyContactFollowUpSourceState,
  decideContactFollowUpProposal,
  evaluateContactFollowUpPolicy,
  listOwnerContactFollowUpQueue,
  markContactFollowUpNoRepair,
  proposeContactFollowUpRequest,
  readContactFollowUpReconstruction,
  recordContactFollowUpProviderAttempt,
  type ContactFollowUpAttemptReadback,
  type ContactFollowUpErrorCode,
  type ContactFollowUpOwnerAuthority,
  type ContactFollowUpProposalId,
  type ContactFollowUpReconstruction,
  type ContactFollowUpSourceState,
} from '@/modules/protected-action/public'

const proposalIdSchema = z.object({
  proposalId: z.string().min(1),
})

const ownerDecisionSchema = proposalIdSchema.extend({
  reason: z.string().min(1).max(500),
  evidenceRefs: z.array(z.string().min(1)).max(10).default([]),
  consequenceAccepted: z.boolean().default(false),
})

const retrySchema = proposalIdSchema.extend({
  readbackKind: z.enum(['receipt', 'proof_gap', 'failed']).default('receipt'),
  reason: z.string().min(1).max(500).default('owner_requested_retry'),
})

const noRepairSchema = proposalIdSchema.extend({
  reason: z.string().min(1).max(500),
  evidenceRefs: z.array(z.string().min(1)).max(10).default([]),
  attemptId: z.string().min(1).optional(),
})

type ContactFollowUpServerErrorResult = {
  kind: 'error'
  code: string
  retryable: boolean
  reason: string
  field?: string
}

export type OwnerContactFollowUpQueueServerResult =
  | {
      kind: 'ok'
      queue: readonly ContactFollowUpQueueItemDto[]
      reconstructions: readonly ContactFollowUpReconstruction[]
    }
  | ContactFollowUpServerErrorResult

export type OwnerContactFollowUpDetailServerResult =
  | {
      kind: 'ok'
      reconstruction: ContactFollowUpReconstruction
    }
  | ContactFollowUpServerErrorResult

export type OwnerContactFollowUpMutationServerResult =
  | {
      kind: 'ok'
      code:
        | 'contact_follow_up_decided'
        | 'contact_follow_up_decision_replayed'
        | 'contact_follow_up_attempt_recorded'
        | 'contact_follow_up_attempt_replayed'
        | 'contact_follow_up_no_repair_marked'
        | 'contact_follow_up_no_repair_replayed'
      reconstruction: ContactFollowUpReconstruction
    }
  | ContactFollowUpServerErrorResult

export type AdminContactFollowUpReconstructionServerResult =
  | {
      kind: 'allowed'
      httpStatus: 200
      generatedAt: number
      actorRef: string
      rows: readonly ContactFollowUpReconstruction[]
    }
  | {
      kind: 'denied'
      httpStatus: 401 | 403
      reason: 'missing_membership' | 'inactive_membership' | 'action_not_allowed'
      generatedAt: number
      publicMessage: string
      rows: readonly ContactFollowUpReconstruction[]
    }

type ContactFollowUpQueueItemDto = ReturnType<typeof listOwnerContactFollowUpQueue>[number]

type SourceDetailResult = OwnerContactFollowUpDetailServerResult
type SourceQueueResult =
  | {
      kind: 'allowed'
      queue: readonly ContactFollowUpQueueItemDto[]
      reconstructions: readonly ContactFollowUpReconstruction[]
    }
  | {
      kind: 'denied'
      reason: 'missing_auth' | 'owner_not_found'
    }

const listOwnerQueueQuery = sourceQuery<Record<string, never>, SourceQueueResult>('protectedActions:listCurrentOwnerContactFollowUpQueue')
const readOwnerDetailQuery = sourceQuery<{ proposalId: string }, SourceDetailResult>(
  'protectedActions:readCurrentOwnerContactFollowUpDetail'
)
const readOwnerReceiptQuery = sourceQuery<{ proposalId: string }, SourceDetailResult>(
  'protectedActions:readCurrentOwnerContactFollowUpReceipt'
)
const approveOwnerMutation = sourceMutation<OwnerDecisionMutationArgs, OwnerContactFollowUpMutationServerResult>(
  'protectedActions:approveCurrentOwnerContactFollowUp'
)
const rejectOwnerMutation = sourceMutation<OwnerDecisionMutationArgs, OwnerContactFollowUpMutationServerResult>(
  'protectedActions:rejectCurrentOwnerContactFollowUp'
)
const retryOwnerMutation = sourceMutation<OwnerRetryMutationArgs, OwnerContactFollowUpMutationServerResult>(
  'protectedActions:retryCurrentOwnerContactFollowUp'
)
const markNoRepairOwnerMutation = sourceMutation<OwnerNoRepairMutationArgs, OwnerContactFollowUpMutationServerResult>(
  'protectedActions:markCurrentOwnerContactFollowUpNoRepair'
)
const adminReconstructionQuery = sourceQuery<{ proposalId?: string }, AdminContactFollowUpReconstructionServerResult>(
  'protectedActions:readAdminContactFollowUpReconstruction'
)

type OwnerDecisionMutationArgs = z.infer<typeof ownerDecisionSchema> & BrowserMutationAdmission
type OwnerRetryMutationArgs = z.infer<typeof retrySchema> & BrowserMutationAdmission
type OwnerNoRepairMutationArgs = z.infer<typeof noRepairSchema> & BrowserMutationAdmission
type BrowserMutationAdmission = {
  operationKey: string
  correlationId: string
  csrfToken?: string
  csrfCookie?: string
  origin?: string
}

export const readCurrentOwnerContactFollowUpQueueServer = createServerFn()
  .handler(() => readCurrentOwnerContactFollowUpQueueThroughSource())

export const readCurrentOwnerContactFollowUpDetailServer = createServerFn()
  .validator((data) => proposalIdSchema.parse(data))
  .handler(async ({ data }) => readCurrentOwnerContactFollowUpDetailThroughSource(data.proposalId))

export const readCurrentOwnerContactFollowUpReceiptServer = createServerFn()
  .validator((data) => proposalIdSchema.parse(data))
  .handler(async ({ data }) => readCurrentOwnerContactFollowUpReceiptThroughSource(data.proposalId))

export const approveCurrentOwnerContactFollowUpServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerDecisionSchema.parse(data))
  .handler(async ({ data }) => approveCurrentOwnerContactFollowUpThroughSource(data))

export const rejectCurrentOwnerContactFollowUpServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerDecisionSchema.parse(data))
  .handler(async ({ data }) => rejectCurrentOwnerContactFollowUpThroughSource(data))

export const retryCurrentOwnerContactFollowUpServer = createServerFn({ method: 'POST' })
  .validator((data) => retrySchema.parse(data))
  .handler(async ({ data }) => retryCurrentOwnerContactFollowUpThroughSource(data))

export const markCurrentOwnerContactFollowUpNoRepairServer = createServerFn({ method: 'POST' })
  .validator((data) => noRepairSchema.parse(data))
  .handler(async ({ data }) => markCurrentOwnerContactFollowUpNoRepairThroughSource(data))

export const readAdminContactFollowUpReconstructionServer = createServerFn()
  .validator((data) => proposalIdSchema.partial().parse(data ?? {}))
  .handler(async ({ data }) => readAdminContactFollowUpReconstructionThroughSource(data))

export async function readCurrentOwnerContactFollowUpQueueThroughSource(): Promise<OwnerContactFollowUpQueueServerResult> {
  if (usesLocalE2eBypass()) {
    const state = createLocalE2eContactFollowUpSourceState()
    const queue = listOwnerContactFollowUpQueue(state, localE2eOwnerId)
    return {
      kind: 'ok',
      queue,
      reconstructions: queue.map((item) => readContactFollowUpReconstruction(state, item.proposal.id)),
    }
  }

  try {
    const result = await callSourceQuery(listOwnerQueueQuery, {})
    if (result.kind === 'denied') {
      return ownerDeniedResult(result.reason)
    }

    return {
      kind: 'ok',
      queue: result.queue,
      reconstructions: result.reconstructions,
    }
  } catch (error) {
    return sourceError(error)
  }
}

export async function readCurrentOwnerContactFollowUpDetailThroughSource(
  proposalId: string
): Promise<OwnerContactFollowUpDetailServerResult> {
  if (usesLocalE2eBypass()) {
    return localDetail(proposalId)
  }

  try {
    return await callSourceQuery(readOwnerDetailQuery, { proposalId })
  } catch (error) {
    return sourceError(error)
  }
}

export async function readCurrentOwnerContactFollowUpReceiptThroughSource(
  proposalId: string
): Promise<OwnerContactFollowUpDetailServerResult> {
  if (usesLocalE2eBypass()) {
    return localDetail(proposalId)
  }

  try {
    return await callSourceQuery(readOwnerReceiptQuery, { proposalId })
  } catch (error) {
    return sourceError(error)
  }
}

export async function approveCurrentOwnerContactFollowUpThroughSource(
  data: z.infer<typeof ownerDecisionSchema>
): Promise<OwnerContactFollowUpMutationServerResult> {
  if (usesLocalE2eBypass()) {
    return localApprove(data)
  }

  try {
    return await callSourceMutation(approveOwnerMutation, {
      ...data,
      ...browserMutationAdmission('approve', data.proposalId),
    })
  } catch (error) {
    return sourceError(error)
  }
}

export async function rejectCurrentOwnerContactFollowUpThroughSource(
  data: z.infer<typeof ownerDecisionSchema>
): Promise<OwnerContactFollowUpMutationServerResult> {
  if (usesLocalE2eBypass()) {
    return localReject(data)
  }

  try {
    return await callSourceMutation(rejectOwnerMutation, {
      ...data,
      ...browserMutationAdmission('reject', data.proposalId),
    })
  } catch (error) {
    return sourceError(error)
  }
}

export async function retryCurrentOwnerContactFollowUpThroughSource(
  data: z.infer<typeof retrySchema>
): Promise<OwnerContactFollowUpMutationServerResult> {
  if (usesLocalE2eBypass()) {
    return localRetry(data)
  }

  try {
    return await callSourceMutation(retryOwnerMutation, {
      ...data,
      ...browserMutationAdmission('retry', data.proposalId),
    })
  } catch (error) {
    return sourceError(error)
  }
}

export async function markCurrentOwnerContactFollowUpNoRepairThroughSource(
  data: z.infer<typeof noRepairSchema>
): Promise<OwnerContactFollowUpMutationServerResult> {
  if (usesLocalE2eBypass()) {
    return localNoRepair(data)
  }

  try {
    return await callSourceMutation(markNoRepairOwnerMutation, {
      ...data,
      ...browserMutationAdmission('no-repair', data.proposalId),
    })
  } catch (error) {
    return sourceError(error)
  }
}

export async function readAdminContactFollowUpReconstructionThroughSource(
  filter: { proposalId?: string | undefined } = {}
): Promise<AdminContactFollowUpReconstructionServerResult> {
  if (usesLocalE2eBypass()) {
    const state = createLocalE2eContactFollowUpSourceState()
    const rows =
      filter.proposalId === undefined
        ? state.proposals.map((proposal) => readContactFollowUpReconstruction(state, proposal.id))
        : [readContactFollowUpReconstruction(state, filter.proposalId as ContactFollowUpProposalId)]
    return {
      kind: 'allowed',
      httpStatus: 200,
      generatedAt: localE2eNow,
      actorRef: 'admin:local-e2e-protected-action',
      rows,
    }
  }

  try {
    return await callSourceQuery(adminReconstructionQuery, compactAdminFilter(filter))
  } catch {
    return {
      kind: 'denied',
      httpStatus: 401,
      reason: 'missing_membership',
      generatedAt: Date.now(),
      publicMessage: 'Admin protected-action reconstruction requires active source-owned membership.',
      rows: [],
    }
  }
}

function localDetail(proposalId: string): OwnerContactFollowUpDetailServerResult {
  const state = createLocalE2eContactFollowUpSourceState()
  return {
    kind: 'ok',
    reconstruction: readContactFollowUpReconstruction(state, proposalId as ContactFollowUpProposalId),
  }
}

function localApprove(data: z.infer<typeof ownerDecisionSchema>): OwnerContactFollowUpMutationServerResult {
  const state = createLocalE2ePendingContactFollowUpSourceState()
  const proposalId = data.proposalId as ContactFollowUpProposalId
  const decided = decideContactFollowUpProposal(state, {
    authority: localAuthority(),
    proposalId,
    decision: 'approved',
    reason: data.reason,
    evidenceRefs: data.evidenceRefs,
    consequenceAccepted: data.consequenceAccepted,
    idempotencyKey: operationKey(`contact-follow-up:local-approve:${normalizeOperationPart(data.proposalId)}`),
    correlationId: correlationId(`correlation:contact-follow-up:local-approve:${normalizeOperationPart(data.proposalId)}`),
    now: localE2eNow + 2_000,
  })
  if (decided.kind === 'error') {
    return moduleError(decided)
  }

  const gateway = createContactFollowUpGatewayAdmission(decided.state, {
    authority: localAuthority(),
    proposalId,
    idempotencyKey: operationKey(`contact-follow-up:local-gateway:${normalizeOperationPart(data.proposalId)}`),
    correlationId: correlationId(`correlation:contact-follow-up:local-gateway:${normalizeOperationPart(data.proposalId)}`),
    expiresAt: localE2eNow + 60_000,
    now: localE2eNow + 2_100,
  })
  if (gateway.kind === 'error') {
    return moduleError(gateway)
  }

  const attempted = recordContactFollowUpProviderAttempt(gateway.state, {
    authority: localAuthority(),
    selectedActionSlug: ContactFollowUpActionSlug,
    proposalId,
    gatewayAdmissionId: gateway.gatewayAdmission.id,
    idempotencyKey: operationKey(`contact-follow-up:local-attempt:${normalizeOperationPart(data.proposalId)}`),
    correlationId: correlationId(`correlation:contact-follow-up:local-attempt:${normalizeOperationPart(data.proposalId)}`),
    now: localE2eNow + 2_200,
    readback: { kind: 'receipt', resultRef: 'source-receipt:local-e2e-approved', payloadHash: sourceHash('hash:local-e2e-approved') },
  })
  if (attempted.kind === 'error') {
    return moduleError(attempted)
  }

  return {
    kind: 'ok',
    code: attempted.code,
    reconstruction: readContactFollowUpReconstruction(attempted.state, proposalId),
  }
}

function localReject(data: z.infer<typeof ownerDecisionSchema>): OwnerContactFollowUpMutationServerResult {
  const state = createLocalE2ePendingContactFollowUpSourceState()
  const proposalId = data.proposalId as ContactFollowUpProposalId
  const decided = decideContactFollowUpProposal(state, {
    authority: localAuthority(),
    proposalId,
    decision: 'rejected',
    reason: data.reason,
    evidenceRefs: data.evidenceRefs,
    consequenceAccepted: false,
    idempotencyKey: operationKey(`contact-follow-up:local-reject:${normalizeOperationPart(data.proposalId)}`),
    correlationId: correlationId(`correlation:contact-follow-up:local-reject:${normalizeOperationPart(data.proposalId)}`),
    now: localE2eNow + 2_000,
  })
  if (decided.kind === 'error') {
    return moduleError(decided)
  }

  return {
    kind: 'ok',
    code: decided.code,
    reconstruction: readContactFollowUpReconstruction(decided.state, proposalId),
  }
}

function localRetry(data: z.infer<typeof retrySchema>): OwnerContactFollowUpMutationServerResult {
  const state = createLocalE2eFailedContactFollowUpSourceState()
  const proposalId = data.proposalId as ContactFollowUpProposalId
  const gateway = createContactFollowUpGatewayAdmission(state, {
    authority: localAuthority(),
    proposalId,
    idempotencyKey: operationKey(`contact-follow-up:local-retry-gateway:${normalizeOperationPart(data.proposalId)}`),
    correlationId: correlationId(`correlation:contact-follow-up:local-retry-gateway:${normalizeOperationPart(data.proposalId)}`),
    expiresAt: localE2eNow + 90_000,
    now: localE2eNow + 3_000,
  })
  if (gateway.kind === 'error') {
    return moduleError(gateway)
  }

  const attempted = recordContactFollowUpProviderAttempt(gateway.state, {
    authority: localAuthority(),
    selectedActionSlug: ContactFollowUpActionSlug,
    proposalId,
    gatewayAdmissionId: gateway.gatewayAdmission.id,
    idempotencyKey: operationKey(`contact-follow-up:local-retry-attempt:${normalizeOperationPart(data.proposalId)}`),
    correlationId: correlationId(`correlation:contact-follow-up:local-retry-attempt:${normalizeOperationPart(data.proposalId)}`),
    now: localE2eNow + 3_100,
    readback: readbackForKind(data.readbackKind, 'local-retry'),
  })
  if (attempted.kind === 'error') {
    return moduleError(attempted)
  }

  return {
    kind: 'ok',
    code: attempted.code,
    reconstruction: readContactFollowUpReconstruction(attempted.state, proposalId),
  }
}

function localNoRepair(data: z.infer<typeof noRepairSchema>): OwnerContactFollowUpMutationServerResult {
  const state = createLocalE2eFailedContactFollowUpSourceState()
  const proposalId = data.proposalId as ContactFollowUpProposalId
  const result = markContactFollowUpNoRepair(state, {
    authority: localAuthority(),
    proposalId,
    ...(data.attemptId === undefined ? {} : { attemptId: data.attemptId as never }),
    reason: data.reason,
    evidenceRefs: data.evidenceRefs,
    idempotencyKey: operationKey(`contact-follow-up:local-no-repair:${normalizeOperationPart(data.proposalId)}`),
    correlationId: correlationId(`correlation:contact-follow-up:local-no-repair:${normalizeOperationPart(data.proposalId)}`),
    now: localE2eNow + 4_000,
  })
  if (result.kind === 'error') {
    return moduleError(result)
  }

  return {
    kind: 'ok',
    code: result.code,
    reconstruction: readContactFollowUpReconstruction(result.state, proposalId),
  }
}

function createLocalE2eContactFollowUpSourceState(): ContactFollowUpSourceState {
  const pending = createLocalE2ePendingContactFollowUpSourceState()
  const receipt = localApprove({
    proposalId: localE2eProposalId,
    reason: 'Owner accepted the local E2E consequence.',
    evidenceRefs: ['owner-review:local-e2e'],
    consequenceAccepted: true,
  })
  const failed = createLocalE2eFailedContactFollowUpSourceState()

  return {
    ...pending,
    proposals: [
      ...pending.proposals.filter((proposal) => proposal.id !== localE2eProposalId),
      ...(receipt.kind === 'ok' ? [receipt.reconstruction.proposal] : []),
      ...failed.proposals,
    ],
    policyDecisions: [
      ...pending.policyDecisions.filter((policy) => policy.proposalId !== localE2eProposalId),
      ...(receipt.kind === 'ok' && receipt.reconstruction.policy !== undefined ? [receipt.reconstruction.policy] : []),
      ...failed.policyDecisions,
    ],
    ownerDecisions: [
      ...(receipt.kind === 'ok' && receipt.reconstruction.ownerDecision !== undefined ? [receipt.reconstruction.ownerDecision] : []),
      ...failed.ownerDecisions,
    ],
    gatewayAdmissions: [
      ...(receipt.kind === 'ok' && receipt.reconstruction.gatewayAdmission !== undefined ? [receipt.reconstruction.gatewayAdmission] : []),
      ...failed.gatewayAdmissions,
    ],
    attempts: [
      ...(receipt.kind === 'ok' && receipt.reconstruction.attempt !== undefined ? [receipt.reconstruction.attempt] : []),
      ...failed.attempts,
    ],
    receipts: [
      ...(receipt.kind === 'ok' && receipt.reconstruction.receipt !== undefined ? [receipt.reconstruction.receipt] : []),
      ...failed.receipts,
    ],
    privateEvidenceRefs: [
      ...(receipt.kind === 'ok' ? receipt.reconstruction.privateEvidenceRefs : []),
      ...failed.privateEvidenceRefs,
    ],
    auditEvents: [...(receipt.kind === 'ok' ? receipt.reconstruction.auditEvents : []), ...failed.auditEvents],
  }
}

function createLocalE2ePendingContactFollowUpSourceState(): ContactFollowUpSourceState {
  const proposed = proposeContactFollowUpRequest(createEmptyContactFollowUpSourceState(), {
    authority: localAuthority(),
    selectedActionSlug: ContactFollowUpActionSlug,
    target: {
      businessId: localE2eBusinessId,
      ownerId: localE2eOwnerId,
      serviceId: localE2eServiceId,
      sourceEvidenceRef: 'source-message:local-e2e-protected-action',
    },
    parameters: {
      contactName: 'Pat Customer',
      contactChannel: 'email',
      messageSummary: 'Follow up with the customer about the source-owned inquiry readback.',
      sourceMessageRef: 'source-message:local-e2e-protected-action',
    },
    idempotencyKey: operationKey('contact-follow-up:local-e2e-proposal'),
    correlationId: correlationId('correlation:contact-follow-up:local-e2e-proposal'),
    deadlineAt: localE2eNow + 120_000,
    now: localE2eNow,
  })
  if (proposed.kind === 'error') {
    return createEmptyContactFollowUpSourceState()
  }

  const policy = evaluateContactFollowUpPolicy(proposed.state, { proposalId: proposed.proposal.id, now: localE2eNow + 1_000 })
  const stateWithPrimary = policy.kind === 'ok' ? policy.state : proposed.state
  const pending = proposeContactFollowUpRequest(stateWithPrimary, {
    authority: localAuthority(),
    selectedActionSlug: ContactFollowUpActionSlug,
    target: {
      businessId: localE2eBusinessId,
      ownerId: localE2eOwnerId,
      serviceId: localE2eServiceId,
      sourceEvidenceRef: 'source-message:local-e2e-pending-action',
    },
    parameters: {
      contactName: 'Taylor Customer',
      contactChannel: 'email',
      messageSummary: 'Follow up after the owner reviews the pending protected-action request.',
      sourceMessageRef: 'source-message:local-e2e-pending-action',
    },
    idempotencyKey: operationKey('contact-follow-up:local-e2e-pending-proposal'),
    correlationId: correlationId('correlation:contact-follow-up:local-e2e-pending-proposal'),
    deadlineAt: localE2eNow + 180_000,
    now: localE2eNow + 100,
  })
  if (pending.kind === 'error') {
    return stateWithPrimary
  }

  const pendingPolicy = evaluateContactFollowUpPolicy(pending.state, {
    proposalId: pending.proposal.id,
    now: localE2eNow + 1_100,
  })
  return pendingPolicy.kind === 'ok' ? pendingPolicy.state : pending.state
}

function createLocalE2eFailedContactFollowUpSourceState(): ContactFollowUpSourceState {
  const base = createEmptyContactFollowUpSourceState()
  const proposalId = localFailedProposalId
  const proposed = proposeContactFollowUpRequest(base, {
    authority: localAuthority(),
    selectedActionSlug: ContactFollowUpActionSlug,
    target: {
      businessId: localE2eBusinessId,
      ownerId: localE2eOwnerId,
      serviceId: localE2eServiceId,
      sourceEvidenceRef: 'source-message:local-e2e-failed-action',
    },
    parameters: {
      contactName: 'Jordan Customer',
      contactChannel: 'phone',
      messageSummary: 'Follow up encountered a source-owned proof gap in local evidence.',
      sourceMessageRef: 'source-message:local-e2e-failed-action',
    },
    idempotencyKey: operationKey('contact-follow-up:local-e2e-failed-proposal'),
    correlationId: correlationId('correlation:contact-follow-up:local-e2e-failed-proposal'),
    deadlineAt: localE2eNow + 180_000,
    now: localE2eNow,
  })
  if (proposed.kind === 'error') {
    return base
  }

  const policy = evaluateContactFollowUpPolicy(proposed.state, { proposalId, now: localE2eNow + 1_000 })
  if (policy.kind === 'error') {
    return proposed.state
  }
  const decided = decideContactFollowUpProposal(policy.state, {
    authority: localAuthority(),
    proposalId,
    decision: 'approved',
    reason: 'Approved local proof-gap fixture.',
    evidenceRefs: ['owner-review:local-proof-gap'],
    consequenceAccepted: true,
    idempotencyKey: operationKey('contact-follow-up:local-e2e-failed-decision'),
    correlationId: correlationId('correlation:contact-follow-up:local-e2e-failed-decision'),
    now: localE2eNow + 2_000,
  })
  if (decided.kind === 'error') {
    return policy.state
  }
  const gateway = createContactFollowUpGatewayAdmission(decided.state, {
    authority: localAuthority(),
    proposalId,
    idempotencyKey: operationKey('contact-follow-up:local-e2e-failed-gateway'),
    correlationId: correlationId('correlation:contact-follow-up:local-e2e-failed-gateway'),
    expiresAt: localE2eNow + 180_000,
    now: localE2eNow + 2_100,
  })
  if (gateway.kind === 'error') {
    return decided.state
  }
  const attempted = recordContactFollowUpProviderAttempt(gateway.state, {
    authority: localAuthority(),
    selectedActionSlug: ContactFollowUpActionSlug,
    proposalId,
    gatewayAdmissionId: gateway.gatewayAdmission.id,
    idempotencyKey: operationKey('contact-follow-up:local-e2e-failed-attempt'),
    correlationId: correlationId('correlation:contact-follow-up:local-e2e-failed-attempt'),
    now: localE2eNow + 2_200,
    readback: { kind: 'proof_gap', gapReason: 'timeout', payloadHash: sourceHash('hash:local-proof-gap') },
  })

  return attempted.kind === 'ok' ? attempted.state : gateway.state
}

function readbackForKind(kind: 'receipt' | 'proof_gap' | 'failed', suffix: string): ContactFollowUpAttemptReadback {
  if (kind === 'proof_gap') {
    return { kind, gapReason: 'mismatch', payloadHash: sourceHash(`hash:${suffix}:proof-gap`) }
  }

  if (kind === 'failed') {
    return { kind, failureReason: 'provider_unavailable', payloadHash: sourceHash(`hash:${suffix}:failed`) }
  }

  return { kind, resultRef: `source-receipt:${suffix}`, payloadHash: sourceHash(`hash:${suffix}:receipt`) }
}

function ownerDeniedResult(reason: 'missing_auth' | 'owner_not_found'): ContactFollowUpServerErrorResult {
  return {
    kind: 'error',
    code: reason,
    retryable: false,
    reason:
      reason === 'missing_auth'
        ? 'Owner sign-in is required for contact follow-up readback.'
        : 'Owner membership was not found for contact follow-up readback.',
  }
}

function moduleError(errorResult: {
  kind: 'error'
  code: ContactFollowUpErrorCode
  retryable: boolean
  reason: string
  field?: string
}): ContactFollowUpServerErrorResult {
  return {
    kind: 'error',
    code: errorResult.code,
    retryable: errorResult.retryable,
    reason: errorResult.reason,
    ...(errorResult.field === undefined ? {} : { field: errorResult.field }),
  }
}

function sourceError(error: unknown): ContactFollowUpServerErrorResult {
  if (error instanceof ConvexSourceError) {
    return {
      kind: 'error',
      code: error.code,
      retryable: error.code === 'missing_convex_url',
      reason:
        error.code === 'missing_auth'
          ? 'Owner sign-in is required for contact follow-up readback.'
          : 'Contact follow-up source state is not reachable right now.',
    }
  }

  return {
    kind: 'error',
    code: 'contact_follow_up_source_unavailable',
    retryable: true,
    reason: 'Contact follow-up source state is not reachable right now.',
  }
}

function browserMutationAdmission(action: string, proposalId: string): BrowserMutationAdmission {
  const suffix = `${normalizeOperationPart(proposalId)}:${crypto.randomUUID()}`
  return {
    csrfToken: 'csrf-protected-action',
    csrfCookie: 'csrf-protected-action',
    origin: requestOrigin(),
    operationKey: `contact-follow-up:${action}:${suffix}`,
    correlationId: `correlation:contact-follow-up:${action}:${suffix}`,
  }
}

function requestOrigin(): string {
  return readEnv('SITE_URL') ?? readEnv('VITE_SITE_URL') ?? 'https://ae.example'
}

function compactAdminFilter(filter: { proposalId?: string | undefined }): { proposalId?: string } {
  return filter.proposalId === undefined || filter.proposalId.trim().length === 0 ? {} : { proposalId: filter.proposalId.trim() }
}

function normalizeOperationPart(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72)
  return normalized.length === 0 ? 'contact-follow-up' : normalized
}

function usesLocalE2eBypass(): boolean {
  return (
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true' ||
    (process.env.NODE_ENV !== 'production' && readEnv('CONVEX_URL') === undefined && readEnv('VITE_CONVEX_URL') === undefined)
  )
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}

function localAuthority(): ContactFollowUpOwnerAuthority {
  return { ownerId: localE2eOwnerId, actorRef: 'owner:local-e2e-protected-action', businessIds: [localE2eBusinessId] }
}

function operationKey(value: string): OperationKey {
  return brandNonEmpty(value, 'OperationKey')
}

function correlationId(value: string): CorrelationId {
  return brandNonEmpty(value, 'CorrelationId')
}

function sourceHash(value: string): SourceHash {
  return brandNonEmpty(value, 'SourceHash')
}

const localE2eNow = 1_777_100_000_000
const localE2eOwnerId = brandNonEmpty('owner:contact-follow-up-local-e2e', 'OwnerId')
const localE2eBusinessId = brandNonEmpty('business:contact-follow-up-local-e2e', 'BusinessId')
const localE2eServiceId = brandNonEmpty('service:contact-follow-up-local-e2e', 'ServiceId')
export const localE2eProposalId = 'contact-follow-up:contact-follow-up:local-e2e-proposal' as ContactFollowUpProposalId
export const localPendingProposalId = 'contact-follow-up:contact-follow-up:local-e2e-pending-proposal' as ContactFollowUpProposalId
export const localFailedProposalId = 'contact-follow-up:contact-follow-up:local-e2e-failed-proposal' as ContactFollowUpProposalId

void (localE2eBusinessId satisfies BusinessId)
void (localE2eServiceId satisfies ServiceId)
void (localE2eOwnerId satisfies OwnerId)
