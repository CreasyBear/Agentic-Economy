import type { UserIdentity } from 'convex/server'
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { resolveBusinessActor } from './authz'
import {
  loadBusinessActionRequestCreationSlice,
  loadBusinessActionRequestSlice,
  persistBusinessActionSlice,
} from './businessActionStore'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { runtimeDb } from './source_state'
import type { RuntimeDb, RuntimeDocument } from './source_state'
import { literalUnion } from '../src/modules/common/convex-literals'
import { brandNonEmpty } from '../src/modules/common/ids'
import type { BusinessId, CapabilityRequestId, OperationKey, OwnerId } from '../src/modules/common/ids'
import {
  ActionReceiptOutcomeValues,
  AuthorizationCheckpointDecisionValues,
  BusinessActionExternalEvidenceStatusValues,
  BusinessActionGuardrailDecisionValues,
  BusinessActionGuardrailProviderValues,
  BusinessActionSlug,
  CapabilityRequestStatusValues,
  HermesEvidenceKindValues,
  ReceiptReconstructionStatusValues,
  createCapabilityRequest,
  recordActionReceipt,
  recordAuthorizationCheckpoint,
  recordGuardrailDecisionEvidence,
  recordHermesEvidenceEvent,
  verifyActionReceipt,
} from '../src/modules/business-action/public'
import type {
  ActionReceipt,
  AuthorizationCheckpoint,
  BusinessActionOwnerAuthority,
  BusinessActionSourceState,
  CapabilityRequest,
  GuardrailDecisionEvidence,
  HermesEvidenceEvent,
} from '../src/modules/business-action/public'

const businessActionErrorCode = v.union(
  v.literal('business_action_source_write_rejected'),
  v.literal('business_action_untrusted_client_field'),
  v.literal('business_action_unknown_slug'),
  v.literal('business_action_card_unavailable'),
  v.literal('business_action_mandate_invalid'),
  v.literal('business_action_request_invalid'),
  v.literal('business_action_not_found'),
  v.literal('business_action_owner_denied'),
  v.literal('business_action_owner_decision_required'),
  v.literal('business_action_checkpoint_expired'),
  v.literal('business_action_checkpoint_not_accepted'),
  v.literal('business_action_evidence_unbound'),
  v.literal('business_action_idempotency_conflict'),
  v.literal('business_action_guardrail_invalid'),
  v.literal('business_action_result_artifact_invalid'),
  v.literal('business_action_external_consequence_blocked'),
  v.literal('missing_auth'),
  v.literal('owner_not_found')
)

const sourceWriteProtectedActionArgs = {
  ...sourceWriteArgs,
} as const

const currency = v.union(v.literal('aud'), v.literal('usd'))
const actionSlug = v.literal(BusinessActionSlug)
const requestStatus = literalUnion(CapabilityRequestStatusValues)
const checkpointDecision = literalUnion(AuthorizationCheckpointDecisionValues)
const guardrailProvider = literalUnion(BusinessActionGuardrailProviderValues)
const guardrailDecision = literalUnion(BusinessActionGuardrailDecisionValues)
const evidenceStatus = literalUnion(BusinessActionExternalEvidenceStatusValues)
const hermesEvidenceKind = literalUnion(HermesEvidenceKindValues)
const receiptOutcome = literalUnion(ActionReceiptOutcomeValues)
const receiptReconstructionStatus = literalUnion(ReceiptReconstructionStatusValues)

const businessActionRequest = v.object({
  id: v.string(),
  cardId: v.string(),
  cardVersion: v.number(),
  cardHash: v.string(),
  mandateId: v.string(),
  mandateHash: v.string(),
  actionSlug,
  businessId: v.string(),
  ownerId: v.optional(v.string()),
  serviceId: v.optional(v.string()),
  amountCents: v.optional(v.number()),
  currency: v.optional(currency),
  requestHash: v.string(),
  status: requestStatus,
  requestedBy: v.union(v.literal('buyer'), v.literal('hermes'), v.literal('operator')),
  idempotencyKey: v.string(),
  correlationId: v.string(),
  requestedAt: v.number(),
  expiresAt: v.number(),
})

const businessActionCheckpoint = v.object({
  id: v.string(),
  requestId: v.string(),
  actionSlug,
  businessId: v.string(),
  decision: checkpointDecision,
  reasonCode: v.string(),
  requestHash: v.string(),
  checkpointHash: v.string(),
  idempotencyKey: v.string(),
  correlationId: v.string(),
  ownerId: v.optional(v.string()),
  ownerDecisionRef: v.optional(v.string()),
  decidedAt: v.number(),
  expiresAt: v.number(),
})

const businessActionReceipt = v.object({
  id: v.string(),
  requestId: v.string(),
  actionSlug,
  outcome: receiptOutcome,
  cardHash: v.string(),
  cardVersion: v.number(),
  mandateHash: v.string(),
  requestHash: v.string(),
  checkpointHash: v.optional(v.string()),
  policyHash: v.optional(v.string()),
  externalEvidenceRefHashes: v.array(v.string()),
  guardrailEvidenceRefHashes: v.array(v.string()),
  resultArtifactHash: v.optional(v.string()),
  previousReceiptHash: v.optional(v.string()),
  signatureRefHash: v.string(),
  reconstructionStatus: receiptReconstructionStatus,
  payloadHash: v.string(),
  idempotencyKey: v.string(),
  correlationId: v.string(),
  recordedAt: v.number(),
})

const guardrailEvidence = v.object({
  id: v.string(),
  requestId: v.string(),
  actionSlug,
  policyHash: v.string(),
  requestHash: v.string(),
  provider: guardrailProvider,
  modelName: v.string(),
  modelVersion: v.string(),
  decision: guardrailDecision,
  privateTraceRefHash: v.string(),
  decisionHash: v.string(),
  payloadHash: v.string(),
  idempotencyKey: v.string(),
  correlationId: v.string(),
  recordedAt: v.number(),
})

const hermesEvidence = v.object({
  id: v.string(),
  requestId: v.string(),
  checkpointId: v.string(),
  actionSlug,
  provider: v.literal('hermes'),
  status: evidenceStatus,
  providerRefHash: v.string(),
  payloadHash: v.string(),
  idempotencyKey: v.string(),
  correlationId: v.string(),
  evidenceKind: hermesEvidenceKind,
  receivedAt: v.number(),
})

const publicReadback = v.object({
  receiptId: v.string(),
  actionSlug,
  outcome: receiptOutcome,
  reconstructionStatus: receiptReconstructionStatus,
  cardVersion: v.number(),
  hashes: v.object({
    cardHash: v.string(),
    mandateHash: v.string(),
    requestHash: v.string(),
    checkpointHash: v.optional(v.string()),
    resultArtifactHash: v.optional(v.string()),
  }),
  labels: v.array(v.string()),
  recordedAt: v.number(),
})

const serverError = v.object({
  kind: v.literal('error'),
  code: businessActionErrorCode,
  retryable: v.boolean(),
  reason: v.string(),
  field: v.optional(v.string()),
})

const mutationResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(
      v.literal('business_action_request_created'),
      v.literal('business_action_request_replayed'),
      v.literal('business_action_checkpoint_recorded'),
      v.literal('business_action_checkpoint_replayed'),
      v.literal('business_action_guardrail_recorded'),
      v.literal('business_action_guardrail_replayed'),
      v.literal('business_action_hermes_evidence_recorded'),
      v.literal('business_action_hermes_evidence_replayed'),
      v.literal('business_action_receipt_recorded'),
      v.literal('business_action_receipt_replayed')
    ),
    request: v.optional(businessActionRequest),
    checkpoint: v.optional(businessActionCheckpoint),
    evidence: v.optional(v.union(guardrailEvidence, hermesEvidence)),
    receipt: v.optional(businessActionReceipt),
    publicReadback: v.optional(publicReadback),
  }),
  serverError
)

type RuntimeCtx = {
  db: object
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>
  }
}

type CurrentOwnerIdentity = {
  ownerId: OwnerId
  actorRef: string
}

type BusinessActionRuntimeErrorCode =
  | 'business_action_source_write_rejected'
  | 'business_action_untrusted_client_field'
  | 'business_action_unknown_slug'
  | 'business_action_card_unavailable'
  | 'business_action_mandate_invalid'
  | 'business_action_request_invalid'
  | 'business_action_not_found'
  | 'business_action_owner_denied'
  | 'business_action_owner_decision_required'
  | 'business_action_checkpoint_expired'
  | 'business_action_checkpoint_not_accepted'
  | 'business_action_evidence_unbound'
  | 'business_action_idempotency_conflict'
  | 'business_action_guardrail_invalid'
  | 'business_action_result_artifact_invalid'
  | 'business_action_external_consequence_blocked'
  | 'missing_auth'
  | 'owner_not_found'

type BusinessActionRuntimeError = {
  kind: 'error'
  code: BusinessActionRuntimeErrorCode
  retryable: boolean
  reason: string
  field?: string
}

const forbiddenCreateRequestFields = [
  'ownerId',
  'adminId',
  'actorRef',
  'ownerAuthority',
  'adminAuthority',
  'businessAuthority',
  'amountCents',
  'currency',
  'provider',
  'providerId',
  'providerObjectId',
  'providerRef',
  'receiptStatus',
  'receiptOutcome',
  'checkpointResult',
] as const

const forbiddenCheckpointFields = [
  'ownerId',
  'adminId',
  'actorRef',
  'ownerAuthority',
  'adminAuthority',
  'businessAuthority',
  'provider',
  'providerId',
  'providerObjectId',
  'providerRef',
  'requestHash',
  'checkpointHash',
  'receiptStatus',
  'receiptOutcome',
  'checkpointResult',
  'status',
] as const

const forbiddenReceiptFields = [
  'ownerId',
  'adminId',
  'actorRef',
  'ownerAuthority',
  'adminAuthority',
  'businessAuthority',
  'provider',
  'providerId',
  'providerObjectId',
  'providerRef',
  'amountCents',
  'currency',
  'receiptStatus',
  'receiptOutcome',
  'checkpointResult',
  'status',
] as const

const forbiddenEvidenceFields = [
  'ownerId',
  'adminId',
  'actorRef',
  'ownerAuthority',
  'adminAuthority',
  'businessAuthority',
  'providerId',
  'providerObjectId',
  'providerRef',
  'amountCents',
  'currency',
  'receiptStatus',
  'receiptOutcome',
  'checkpointResult',
  'status',
  'rawPrompt',
  'rawTrace',
  'rawProviderPayload',
] as const

export const createBusinessActionCapabilityRequest = mutationGeneric({
  args: {
    cardId: v.string(),
    mandateId: v.string(),
    businessId: v.string(),
    requestedBy: v.union(v.literal('buyer'), v.literal('hermes'), v.literal('operator')),
    expiresAt: v.number(),
    ...sourceWriteProtectedActionArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: mutationResult,
  handler: async (ctx, args) => {
    const forbidden = firstForbiddenField(args, forbiddenCreateRequestFields)
    if (forbidden !== undefined) {
      return adapterError('business_action_untrusted_client_field', `client_supplied_${forbidden}`, forbidden)
    }

    const sourceWrite = await requireSourceWrite(args, 'protected_action')
    if (sourceWrite.kind === 'rejected') {
      return adapterError('business_action_source_write_rejected', sourceWrite.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadBusinessActionRequestCreationSlice(db, {
      cardId: args.cardId,
      mandateId: args.mandateId,
      operationKey: args.operationKey,
    })
    const mandate = state.mandates.find((candidate) => candidate.id === args.mandateId)
    const now = Date.now()
    const result = createCapabilityRequest(state, {
      actionSlug: BusinessActionSlug,
      cardId: args.cardId as never,
      mandateId: args.mandateId as never,
      businessId: brandNonEmpty(args.businessId, 'BusinessId'),
      ...(mandate?.maxAmountCents === undefined ? {} : { amountCents: mandate.maxAmountCents }),
      ...(mandate?.currency === undefined ? {} : { currency: mandate.currency }),
      requestedBy: args.requestedBy,
      idempotencyKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      now,
      expiresAt: args.expiresAt,
    })
    if (result.kind === 'error') {
      return moduleError(result)
    }

    await persistBusinessActionSlice(db, result.state)
    return {
      kind: 'ok' as const,
      code: result.code,
      request: serializeRequest(result.request),
    }
  },
})

export const recordBusinessActionOwnerCheckpoint = mutationGeneric({
  args: {
    requestId: v.string(),
    decision: checkpointDecision,
    ownerDecisionRef: v.string(),
    reasonCode: v.string(),
    expiresAt: v.number(),
    ...sourceWriteProtectedActionArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: mutationResult,
  handler: async (ctx, args) => {
    const forbidden = firstForbiddenField(args, forbiddenCheckpointFields)
    if (forbidden !== undefined) {
      return adapterError('business_action_untrusted_client_field', `client_supplied_${forbidden}`, forbidden)
    }

    const sourceWrite = await requireSourceWrite(args, 'protected_action')
    if (sourceWrite.kind === 'rejected') {
      return adapterError('business_action_source_write_rejected', sourceWrite.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadBusinessActionRequestSlice(db, args.requestId)
    const request = requestForState(state, args.requestId)
    if (request === undefined) {
      return adapterError('business_action_not_found', 'request_not_found')
    }

    const owner = await readCurrentOwnerIdentity(ctx)
    const authority = owner.kind === 'denied' ? undefined : await ownerAuthorityForRequest(db, owner.identity, request)
    const result = recordAuthorizationCheckpoint(state, {
      requestId: request.id,
      decision: args.decision,
      authority,
      ownerDecisionRef: args.ownerDecisionRef,
      reasonCode: args.reasonCode,
      idempotencyKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      now: Date.now(),
      expiresAt: args.expiresAt,
    })
    if (result.kind === 'error') {
      return moduleError(result)
    }

    await persistBusinessActionSlice(db, result.state)
    return {
      kind: 'ok' as const,
      code: result.code,
      request: serializeRequest(result.request),
      checkpoint: serializeCheckpoint(result.checkpoint),
    }
  },
})

export const recordBusinessActionReceipt = mutationGeneric({
  args: {
    requestId: v.string(),
    ...sourceWriteProtectedActionArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: mutationResult,
  handler: async (ctx, args) => {
    const forbidden = firstForbiddenField(args, forbiddenReceiptFields)
    if (forbidden !== undefined) {
      return adapterError('business_action_untrusted_client_field', `client_supplied_${forbidden}`, forbidden)
    }

    const sourceWrite = await requireSourceWrite(args, 'protected_action')
    if (sourceWrite.kind === 'rejected') {
      return adapterError('business_action_source_write_rejected', sourceWrite.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadBusinessActionRequestSlice(db, args.requestId)
    const result = recordActionReceipt(state, {
      requestId: args.requestId as CapabilityRequestId,
      idempotencyKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      recordedAt: Date.now(),
    })
    if (result.kind === 'error') {
      return moduleError(result)
    }

    await persistBusinessActionSlice(db, result.state)
    const verification = verifyActionReceipt(result.state, result.receipt)
    return {
      kind: 'ok' as const,
      code: result.code,
      receipt: serializeReceipt(result.receipt),
      publicReadback: serializePublicReadback(verification.publicReadback),
    }
  },
})

export const recordBusinessActionGuardrailDecision = mutationGeneric({
  args: {
    requestId: v.string(),
    provider: guardrailProvider,
    modelName: v.string(),
    modelVersion: v.string(),
    decision: guardrailDecision,
    policyHash: v.string(),
    privateTraceRefHash: v.string(),
    payloadHash: v.string(),
    ...sourceWriteProtectedActionArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: mutationResult,
  handler: async (ctx, args) => {
    const forbidden = firstForbiddenField(args, forbiddenEvidenceFields)
    if (forbidden !== undefined) {
      return adapterError('business_action_untrusted_client_field', `client_supplied_${forbidden}`, forbidden)
    }

    const sourceWrite = await requireSourceWrite(args, 'protected_action')
    if (sourceWrite.kind === 'rejected') {
      return adapterError('business_action_source_write_rejected', sourceWrite.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadBusinessActionRequestSlice(db, args.requestId)
    const result = recordGuardrailDecisionEvidence(state, {
      requestId: args.requestId as CapabilityRequestId,
      provider: args.provider,
      modelName: args.modelName,
      modelVersion: args.modelVersion,
      decision: args.decision,
      policyHash: brandNonEmpty(args.policyHash, 'SourceHash'),
      privateTraceRefHash: brandNonEmpty(args.privateTraceRefHash, 'SourceHash'),
      payloadHash: brandNonEmpty(args.payloadHash, 'SourceHash'),
      idempotencyKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      recordedAt: Date.now(),
    })
    if (result.kind === 'error') {
      return moduleError(result)
    }

    await persistBusinessActionSlice(db, result.state)
    return {
      kind: 'ok' as const,
      code: result.code,
      evidence: serializeGuardrailEvidence(result.evidence),
    }
  },
})

export const recordBusinessActionHermesEvidence = mutationGeneric({
  args: {
    requestId: v.string(),
    checkpointId: v.string(),
    evidenceKind: hermesEvidenceKind,
    providerRefHash: v.string(),
    payloadHash: v.string(),
    ...sourceWriteProtectedActionArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: mutationResult,
  handler: async (ctx, args) => {
    const forbidden = firstForbiddenField(args, forbiddenEvidenceFields)
    if (forbidden !== undefined) {
      return adapterError('business_action_untrusted_client_field', `client_supplied_${forbidden}`, forbidden)
    }

    const sourceWrite = await requireSourceWrite(args, 'protected_action')
    if (sourceWrite.kind === 'rejected') {
      return adapterError('business_action_source_write_rejected', sourceWrite.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadBusinessActionRequestSlice(db, args.requestId)
    const result = recordHermesEvidenceEvent(state, {
      requestId: args.requestId as CapabilityRequestId,
      checkpointId: args.checkpointId as never,
      evidenceKind: args.evidenceKind,
      providerRefHash: brandNonEmpty(args.providerRefHash, 'SourceHash'),
      payloadHash: brandNonEmpty(args.payloadHash, 'SourceHash'),
      idempotencyKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      receivedAt: Date.now(),
    })
    if (result.kind === 'error') {
      return moduleError(result)
    }

    await persistBusinessActionSlice(db, result.state)
    return {
      kind: 'ok' as const,
      code: result.code,
      evidence: serializeHermesEvidence(result.evidence),
    }
  },
})

export const readCurrentOwnerBusinessActionReceipt = queryGeneric({
  args: { requestId: v.string() },
  returns: v.union(
    v.object({
      kind: v.literal('ok'),
      receipt: businessActionReceipt,
      publicReadback,
    }),
    serverError
  ),
  handler: async (ctx, args) => {
    const db = runtimeDb(ctx.db)
    const state = await loadBusinessActionRequestSlice(db, args.requestId)
    const request = requestForState(state, args.requestId)
    if (request === undefined) {
      return adapterError('business_action_not_found', 'request_not_found')
    }

    const owner = await readCurrentOwnerIdentity(ctx)
    if (owner.kind === 'denied' || (await ownerAuthorityForRequest(db, owner.identity, request)) === undefined) {
      return adapterError('business_action_owner_denied', 'source_owned_owner_required')
    }

    const receipt = state.receipts.find((candidate) => candidate.requestId === request.id)
    if (receipt === undefined) {
      return adapterError('business_action_not_found', 'receipt_not_found')
    }

    const verification = verifyActionReceipt(state, receipt)
    return {
      kind: 'ok' as const,
      receipt: serializeReceipt(receipt),
      publicReadback: serializePublicReadback(verification.publicReadback),
    }
  },
})

async function readCurrentOwnerIdentity(ctx: RuntimeCtx): Promise<
  | { kind: 'allowed'; identity: CurrentOwnerIdentity }
  | { kind: 'denied'; reason: 'missing_auth' | 'owner_not_found' }
> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'denied', reason: 'missing_auth' }
  }

  const owner = await runtimeDb(ctx.db)
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

async function ownerAuthorityForRequest(
  db: RuntimeDb,
  owner: CurrentOwnerIdentity,
  request: CapabilityRequest
): Promise<BusinessActionOwnerAuthority | undefined> {
  if (request.ownerId !== undefined && request.ownerId !== owner.ownerId) {
    return undefined
  }

  const business = await getRuntimeDocument(db, request.businessId)
  if (business === null || stringField(business, 'ownerId') !== owner.ownerId) {
    return undefined
  }

  return {
    ...owner,
    businessIds: [brandNonEmpty(business._id, 'BusinessId')],
    status: 'active',
  }
}

async function getRuntimeDocument(db: RuntimeDb, id: string): Promise<RuntimeDocument | null> {
  try {
    return await db.get(id)
  } catch {
    return null
  }
}

function requestForState(state: BusinessActionSourceState, requestId: string): CapabilityRequest | undefined {
  return state.requests.find((candidate) => candidate.id === requestId)
}

function firstForbiddenField(args: Record<string, unknown>, fields: readonly string[]): string | undefined {
  return fields.find((field) => Object.prototype.hasOwnProperty.call(args, field))
}

function serializeRequest(request: CapabilityRequest) {
  return { ...request }
}

function serializeCheckpoint(checkpoint: AuthorizationCheckpoint) {
  return { ...checkpoint }
}

function serializeReceipt(receipt: ActionReceipt) {
  return {
    ...receipt,
    externalEvidenceRefHashes: [...receipt.externalEvidenceRefHashes],
    guardrailEvidenceRefHashes: [...receipt.guardrailEvidenceRefHashes],
  }
}

function serializeGuardrailEvidence(evidence: GuardrailDecisionEvidence) {
  return { ...evidence }
}

function serializeHermesEvidence(evidence: HermesEvidenceEvent) {
  return { ...evidence }
}

function serializePublicReadback(readback: ReturnType<typeof verifyActionReceipt>['publicReadback']) {
  return {
    ...readback,
    hashes: { ...readback.hashes },
    labels: [...readback.labels],
  }
}

function moduleError(result: {
  kind: 'error'
  code: string
  retryable: boolean
  reason: string
  field?: string
}): BusinessActionRuntimeError {
  return {
    kind: 'error',
    code: result.code as BusinessActionRuntimeErrorCode,
    retryable: result.retryable,
    reason: result.reason,
    ...(result.field === undefined ? {} : { field: result.field }),
  }
}

function adapterError(code: BusinessActionRuntimeErrorCode, reason: string, field?: string): BusinessActionRuntimeError {
  return {
    kind: 'error',
    code,
    retryable: false,
    reason,
    ...(field === undefined ? {} : { field }),
  }
}

function stringField(row: RuntimeDocument, field: string): string {
  const value = row[field]
  return typeof value === 'string' ? value : ''
}
