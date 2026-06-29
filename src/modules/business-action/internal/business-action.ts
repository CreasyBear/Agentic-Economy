import { brandNonEmpty } from '@/modules/common/ids'
import type {
  AuthorizationCheckpointId,
  BusinessActionCardId,
  BusinessId,
  BuyerMandateId,
  CapabilityRequestId,
  CorrelationId,
  GuardrailDecisionEvidenceId,
  OperationKey,
  OwnerId,
  SourceHash,
} from '@/modules/common/ids'
import { error, ok, type ModuleResult } from '@/modules/common/result'
import { stableHash } from '@/modules/common/stable-hash'

import {
  BusinessActionSlug,
  type AuthorizationCheckpoint,
  type AuthorizationCheckpointDecision,
  type BusinessActionCard,
  type BusinessActionCurrency,
  type BusinessActionExternalEvidenceProvider,
  type BusinessActionGuardrailDecision,
  type BusinessActionGuardrailProvider,
  type BusinessActionNoRepairRecord,
  type BusinessActionPrivateEvidenceRef,
  type BusinessActionResultArtifact,
  type BusinessActionSupportRecord,
  type BuyerMandate,
  type CapabilityRequest,
  type ExternalEvidenceEvent,
  type GuardrailDecisionEvidence,
  type HermesEvidenceEvent,
} from './schema'

export type BusinessActionOwnerAuthority = {
  ownerId: OwnerId
  actorRef: string
  businessIds: readonly BusinessId[]
  status: 'active' | 'stale' | 'revoked'
}

export type BusinessActionSourceState = {
  cards: readonly BusinessActionCard[]
  mandates: readonly BuyerMandate[]
  requests: readonly CapabilityRequest[]
  checkpoints: readonly AuthorizationCheckpoint[]
  guardrailDecisions: readonly GuardrailDecisionEvidence[]
  externalEvidenceEvents: readonly ExternalEvidenceEvent[]
  hermesEvidenceEvents: readonly HermesEvidenceEvent[]
  resultArtifacts: readonly BusinessActionResultArtifact[]
  receipts: readonly unknown[]
  privateEvidenceRefs: readonly BusinessActionPrivateEvidenceRef[]
  supportRecords: readonly BusinessActionSupportRecord[]
  noRepairRecords: readonly BusinessActionNoRepairRecord[]
}

export type CreateCapabilityRequestCommand = {
  actionSlug: string
  cardId: BusinessActionCardId
  mandateId: BuyerMandateId
  businessId: BusinessId
  amountCents?: number
  currency?: BusinessActionCurrency
  requestedBy: 'buyer' | 'hermes' | 'operator'
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  now: number
  expiresAt: number
}

export type RecordAuthorizationCheckpointCommand = {
  requestId: CapabilityRequestId
  decision: AuthorizationCheckpointDecision
  authority: BusinessActionOwnerAuthority | undefined
  ownerDecisionRef: string
  reasonCode: string
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  now: number
  expiresAt: number
}

export type RecordGuardrailDecisionEvidenceCommand = {
  requestId: CapabilityRequestId
  provider: BusinessActionGuardrailProvider
  modelName: string
  modelVersion: string
  decision: BusinessActionGuardrailDecision
  policyHash: SourceHash
  privateTraceRefHash: SourceHash
  payloadHash: SourceHash
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  recordedAt: number
}

export type BusinessActionErrorCode =
  | 'business_action_unknown_slug'
  | 'business_action_card_unavailable'
  | 'business_action_mandate_invalid'
  | 'business_action_request_invalid'
  | 'business_action_not_found'
  | 'business_action_owner_denied'
  | 'business_action_owner_decision_required'
  | 'business_action_checkpoint_expired'
  | 'business_action_idempotency_conflict'
  | 'business_action_guardrail_invalid'
  | 'business_action_external_consequence_blocked'

export type BusinessActionErrorPayload = {
  reason: string
  requestId?: CapabilityRequestId
  field?: string
}

export type CreateCapabilityRequestResult = ModuleResult<
  'business_action_request_created' | 'business_action_request_replayed',
  BusinessActionErrorCode,
  {
    state: BusinessActionSourceState
    request: CapabilityRequest
  },
  BusinessActionErrorPayload
>

export type RecordAuthorizationCheckpointResult = ModuleResult<
  'business_action_checkpoint_recorded' | 'business_action_checkpoint_replayed',
  BusinessActionErrorCode,
  {
    state: BusinessActionSourceState
    checkpoint: AuthorizationCheckpoint
    request: CapabilityRequest
  },
  BusinessActionErrorPayload
>

export type RecordGuardrailDecisionEvidenceResult = ModuleResult<
  'business_action_guardrail_recorded' | 'business_action_guardrail_replayed',
  BusinessActionErrorCode,
  {
    state: BusinessActionSourceState
    evidence: GuardrailDecisionEvidence
  },
  BusinessActionErrorPayload
>

export function createEmptyBusinessActionSourceState(
  initial: Partial<BusinessActionSourceState> = {}
): BusinessActionSourceState {
  return {
    cards: initial.cards ?? [],
    mandates: initial.mandates ?? [],
    requests: initial.requests ?? [],
    checkpoints: initial.checkpoints ?? [],
    guardrailDecisions: initial.guardrailDecisions ?? [],
    externalEvidenceEvents: initial.externalEvidenceEvents ?? [],
    hermesEvidenceEvents: initial.hermesEvidenceEvents ?? [],
    resultArtifacts: initial.resultArtifacts ?? [],
    receipts: initial.receipts ?? [],
    privateEvidenceRefs: initial.privateEvidenceRefs ?? [],
    supportRecords: initial.supportRecords ?? [],
    noRepairRecords: initial.noRepairRecords ?? [],
  }
}

export function createCapabilityRequest(
  state: BusinessActionSourceState,
  command: CreateCapabilityRequestCommand
): CreateCapabilityRequestResult {
  if (command.actionSlug !== BusinessActionSlug) {
    return error('business_action_unknown_slug', false, { reason: 'single_phase6_slug_required' })
  }

  if (command.expiresAt <= command.now) {
    return error('business_action_request_invalid', false, { reason: 'request_ttl_elapsed' })
  }

  const card = state.cards.find((candidate) => candidate.id === command.cardId)
  if (card === undefined || card.actionSlug !== BusinessActionSlug || card.status !== 'active') {
    return error('business_action_card_unavailable', false, {
      reason: card?.status ?? 'card_not_found',
    })
  }

  const mandate = state.mandates.find((candidate) => candidate.id === command.mandateId)
  const mandateError = validateMandate(mandate, command)
  if (mandateError !== undefined) {
    return error('business_action_mandate_invalid', false, { reason: mandateError })
  }

  const requestHash = stableHash({
    actionSlug: BusinessActionSlug,
    cardId: card.id,
    cardVersion: card.version,
    cardHash: card.sourceHash,
    mandateId: mandate.id,
    mandateHash: mandate.mandateHash,
    businessId: command.businessId,
    amountCents: command.amountCents ?? null,
    currency: command.currency ?? null,
    requestedBy: command.requestedBy,
    expiresAt: command.expiresAt,
  })
  const existing = state.requests.find((request) => request.idempotencyKey === command.idempotencyKey)
  if (existing !== undefined) {
    if (existing.requestHash === requestHash) {
      return ok('business_action_request_replayed', { state, request: existing })
    }

    return error('business_action_idempotency_conflict', false, {
      reason: 'same_key_different_request',
      requestId: existing.id,
    })
  }

  const request: CapabilityRequest = {
    id: capabilityRequestId(command.idempotencyKey),
    cardId: card.id as BusinessActionCardId,
    cardVersion: card.version,
    cardHash: card.sourceHash as SourceHash,
    mandateId: mandate.id,
    mandateHash: mandate.mandateHash,
    actionSlug: BusinessActionSlug,
    businessId: command.businessId,
    requestHash,
    status: 'proposed',
    requestedBy: command.requestedBy,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    requestedAt: command.now,
    expiresAt: command.expiresAt,
    ...(card.ownerId === undefined ? {} : { ownerId: card.ownerId }),
    ...(command.amountCents === undefined ? {} : { amountCents: command.amountCents }),
    ...(command.currency === undefined ? {} : { currency: command.currency }),
  }

  return ok('business_action_request_created', {
    state: { ...state, requests: [...state.requests, request] },
    request,
  })
}

export function recordAuthorizationCheckpoint(
  state: BusinessActionSourceState,
  command: RecordAuthorizationCheckpointCommand
): RecordAuthorizationCheckpointResult {
  const request = state.requests.find((candidate) => candidate.id === command.requestId)
  if (request === undefined) {
    return error('business_action_not_found', false, { reason: 'request_not_found', requestId: command.requestId })
  }

  if (!canApproveBusiness(command.authority, request.businessId, request.ownerId)) {
    return error('business_action_owner_denied', false, { reason: 'source_owned_owner_required', requestId: request.id })
  }

  if (command.decision === 'accepted' && command.ownerDecisionRef.trim().length === 0) {
    return error('business_action_owner_decision_required', false, {
      reason: 'accepted_checkpoint_requires_owner_decision_ref',
      requestId: request.id,
    })
  }

  if (command.decision === 'accepted' && command.expiresAt <= command.now) {
    return error('business_action_checkpoint_expired', false, {
      reason: 'accepted_checkpoint_expired',
      requestId: request.id,
    })
  }

  const checkpointHash = stableHash({
    requestId: request.id,
    requestHash: request.requestHash,
    actionSlug: BusinessActionSlug,
    businessId: request.businessId,
    decision: command.decision,
    ownerId: command.authority.ownerId,
    ownerDecisionRef: command.ownerDecisionRef.trim(),
    reasonCode: command.reasonCode,
    expiresAt: command.expiresAt,
  })
  const existing = state.checkpoints.find((checkpoint) => checkpoint.idempotencyKey === command.idempotencyKey)
  if (existing !== undefined) {
    if (existing.checkpointHash === checkpointHash) {
      const existingRequest = requestWithStatus(state, request, existing.decision)
      return ok('business_action_checkpoint_replayed', { state, checkpoint: existing, request: existingRequest })
    }

    return error('business_action_idempotency_conflict', false, {
      reason: 'same_key_different_checkpoint',
      requestId: request.id,
    })
  }

  const checkpoint: AuthorizationCheckpoint = {
    id: authorizationCheckpointId(request.id, command.idempotencyKey),
    requestId: request.id,
    actionSlug: BusinessActionSlug,
    businessId: request.businessId,
    ownerId: command.authority.ownerId,
    ownerDecisionRef: command.ownerDecisionRef.trim(),
    decision: command.decision,
    reasonCode: command.reasonCode,
    requestHash: request.requestHash,
    checkpointHash,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    decidedAt: command.now,
    expiresAt: command.expiresAt,
  }
  const nextRequest = requestWithStatus(state, request, command.decision)

  return ok('business_action_checkpoint_recorded', {
    state: {
      ...state,
      requests: replaceRequest(state.requests, nextRequest),
      checkpoints: [...state.checkpoints, checkpoint],
    },
    checkpoint,
    request: nextRequest,
  })
}

export function recordGuardrailDecisionEvidence(
  state: BusinessActionSourceState,
  command: RecordGuardrailDecisionEvidenceCommand
): RecordGuardrailDecisionEvidenceResult {
  const request = state.requests.find((candidate) => candidate.id === command.requestId)
  if (request === undefined) {
    return error('business_action_not_found', false, { reason: 'request_not_found', requestId: command.requestId })
  }

  if (command.provider !== 'nemo_guardrails' && command.provider !== 'nemotron') {
    return error('business_action_guardrail_invalid', false, {
      reason: 'guardrail_provider_required',
      requestId: request.id,
    })
  }

  const decisionHash = stableHash({
    requestId: request.id,
    requestHash: request.requestHash,
    actionSlug: BusinessActionSlug,
    policyHash: command.policyHash,
    provider: command.provider,
    modelName: command.modelName,
    modelVersion: command.modelVersion,
    decision: command.decision,
    privateTraceRefHash: command.privateTraceRefHash,
    payloadHash: command.payloadHash,
  })
  const existing = state.guardrailDecisions.find((evidence) => evidence.idempotencyKey === command.idempotencyKey)
  if (existing !== undefined) {
    if (existing.decisionHash === decisionHash) {
      return ok('business_action_guardrail_replayed', { state, evidence: existing })
    }

    return error('business_action_idempotency_conflict', false, {
      reason: 'same_key_different_guardrail_decision',
      requestId: request.id,
    })
  }

  const evidence: GuardrailDecisionEvidence = {
    id: guardrailDecisionEvidenceId(request.id, command.idempotencyKey),
    requestId: request.id,
    actionSlug: BusinessActionSlug,
    policyHash: command.policyHash,
    requestHash: request.requestHash,
    provider: command.provider,
    modelName: command.modelName,
    modelVersion: command.modelVersion,
    decision: command.decision,
    privateTraceRefHash: command.privateTraceRefHash,
    decisionHash,
    payloadHash: command.payloadHash,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    recordedAt: command.recordedAt,
  }

  return ok('business_action_guardrail_recorded', {
    state: { ...state, guardrailDecisions: [...state.guardrailDecisions, evidence] },
    evidence,
  })
}

function validateMandate(
  mandate: BuyerMandate | undefined,
  command: CreateCapabilityRequestCommand
): string | undefined {
  if (mandate === undefined) {
    return 'mandate_not_found'
  }

  if (mandate.status !== 'active' || mandate.revokedAt !== undefined) {
    return mandate.status === 'revoked' || mandate.revokedAt !== undefined ? 'mandate_revoked' : 'mandate_not_active'
  }

  if (mandate.expiresAt <= command.now) {
    return 'mandate_expired'
  }

  if (mandate.allowedActionSlug !== BusinessActionSlug || command.actionSlug !== BusinessActionSlug) {
    return 'wrong_action'
  }

  if (mandate.allowedBusinessId !== command.businessId) {
    return 'wrong_business'
  }

  if (command.amountCents !== undefined && mandate.maxAmountCents !== undefined && command.amountCents > mandate.maxAmountCents) {
    return 'amount_over_max'
  }

  if (command.currency !== undefined && mandate.currency !== undefined && command.currency !== mandate.currency) {
    return 'wrong_currency'
  }

  return undefined
}

function canApproveBusiness(
  authority: BusinessActionOwnerAuthority | undefined,
  businessId: BusinessId,
  ownerId: OwnerId | undefined
): authority is BusinessActionOwnerAuthority {
  return authority?.status === 'active' && authority.businessIds.includes(businessId) && (ownerId === undefined || authority.ownerId === ownerId)
}

function requestWithStatus(
  state: BusinessActionSourceState,
  request: CapabilityRequest,
  decision: AuthorizationCheckpointDecision
): CapabilityRequest {
  const current = state.requests.find((candidate) => candidate.id === request.id) ?? request

  return { ...current, status: decision }
}

function replaceRequest(
  requests: readonly CapabilityRequest[],
  replacement: CapabilityRequest
): readonly CapabilityRequest[] {
  return requests.map((request) => (request.id === replacement.id ? replacement : request))
}

function capabilityRequestId(idempotencyKey: OperationKey): CapabilityRequestId {
  return brandNonEmpty(`capability_request:${idempotencyKey}`, 'CapabilityRequestId')
}

function authorizationCheckpointId(requestId: CapabilityRequestId, idempotencyKey: OperationKey): AuthorizationCheckpointId {
  return brandNonEmpty(`authorization_checkpoint:${requestId}:${idempotencyKey}`, 'AuthorizationCheckpointId')
}

function guardrailDecisionEvidenceId(requestId: CapabilityRequestId, idempotencyKey: OperationKey): GuardrailDecisionEvidenceId {
  return brandNonEmpty(`guardrail_decision:${requestId}:${idempotencyKey}`, 'GuardrailDecisionEvidenceId')
}

export function isPostCheckpointExternalProvider(provider: BusinessActionExternalEvidenceProvider): boolean {
  return provider === 'hermes' || provider === 'stripe_test_mode' || provider === 'link_cli_test_mode' || provider === 'endpoint_host'
}
