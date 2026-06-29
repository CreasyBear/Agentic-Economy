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
  type ActionReceipt,
  type ActionReceiptOutcome,
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
  type HermesEvidenceKind,
  type PublicActionReceiptReadback,
  type ReceiptReconstructionStatus,
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
  receipts: readonly ActionReceipt[]
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

export type RecordHermesEvidenceEventCommand = {
  requestId: CapabilityRequestId
  checkpointId: AuthorizationCheckpointId
  evidenceKind: HermesEvidenceKind
  providerRefHash: SourceHash
  payloadHash: SourceHash
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  receivedAt: number
}

export type RecordBusinessActionResultArtifactCommand = {
  requestId: CapabilityRequestId
  checkpointId: AuthorizationCheckpointId
  endpointDescriptorHash?: SourceHash
  jsonSchemaHash?: SourceHash
  privateEndpointProvisioningPaymentGateRefHash?: SourceHash
  supportingEvidenceLabels?: readonly string[]
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  recordedAt: number
}

export type RecordActionReceiptCommand = {
  requestId: CapabilityRequestId
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  recordedAt: number
}

export type ActionReceiptVerificationOptions = {
  includePrivate?: boolean
}

export type ActionReceiptVerification = {
  reconstructionStatus: ReceiptReconstructionStatus
  publicReadback: PublicActionReceiptReadback
  privateReadback?: {
    resultArtifact?: BusinessActionResultArtifact
    externalEvidenceEvents: readonly ExternalEvidenceEvent[]
    guardrailDecisions: readonly GuardrailDecisionEvidence[]
  }
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
  | 'business_action_checkpoint_not_accepted'
  | 'business_action_evidence_unbound'
  | 'business_action_idempotency_conflict'
  | 'business_action_guardrail_invalid'
  | 'business_action_result_artifact_invalid'
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

export type RecordHermesEvidenceEventResult = ModuleResult<
  'business_action_hermes_evidence_recorded' | 'business_action_hermes_evidence_replayed',
  BusinessActionErrorCode,
  {
    state: BusinessActionSourceState
    evidence: HermesEvidenceEvent
  },
  BusinessActionErrorPayload
>

export type RecordBusinessActionResultArtifactResult = ModuleResult<
  'business_action_result_artifact_recorded' | 'business_action_result_artifact_replayed',
  BusinessActionErrorCode,
  {
    state: BusinessActionSourceState
    artifact: BusinessActionResultArtifact
  },
  BusinessActionErrorPayload
>

export type RecordActionReceiptResult = ModuleResult<
  'business_action_receipt_recorded' | 'business_action_receipt_replayed',
  BusinessActionErrorCode,
  {
    state: BusinessActionSourceState
    receipt: ActionReceipt
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
  if (mandateError !== undefined || mandate === undefined) {
    return error('business_action_mandate_invalid', false, { reason: mandateError ?? 'mandate_not_found' })
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

export function recordHermesEvidenceEvent(
  state: BusinessActionSourceState,
  command: RecordHermesEvidenceEventCommand
): RecordHermesEvidenceEventResult {
  const request = state.requests.find((candidate) => candidate.id === command.requestId)
  if (request === undefined) {
    return error('business_action_not_found', false, { reason: 'request_not_found', requestId: command.requestId })
  }

  const checkpoint = state.checkpoints.find((candidate) => candidate.id === command.checkpointId)
  if (checkpoint === undefined) {
    const anyCheckpointForRequest = state.checkpoints.some((candidate) => candidate.requestId === request.id)
    return error(anyCheckpointForRequest ? 'business_action_evidence_unbound' : 'business_action_checkpoint_not_accepted', false, {
      reason: anyCheckpointForRequest ? 'checkpoint_request_mismatch' : 'accepted_checkpoint_required',
      requestId: request.id,
    })
  }

  if (checkpoint.requestId !== request.id) {
    return error('business_action_evidence_unbound', false, { reason: 'checkpoint_request_mismatch', requestId: request.id })
  }

  if (checkpoint.decision !== 'accepted') {
    return error('business_action_checkpoint_not_accepted', false, { reason: checkpoint.decision, requestId: request.id })
  }

  const evidenceHash = stableHash({
    requestId: request.id,
    requestHash: request.requestHash,
    checkpointId: checkpoint.id,
    checkpointHash: checkpoint.checkpointHash,
    provider: 'hermes',
    evidenceKind: command.evidenceKind,
    providerRefHash: command.providerRefHash,
    payloadHash: command.payloadHash,
  })
  const existing = state.hermesEvidenceEvents.find((event) => event.idempotencyKey === command.idempotencyKey)
  if (existing !== undefined) {
    if (stableHash(hermesEventHashValue(existing, request.requestHash, checkpoint.checkpointHash)) === evidenceHash) {
      return ok('business_action_hermes_evidence_replayed', { state, evidence: existing })
    }

    return error('business_action_idempotency_conflict', false, {
      reason: 'same_key_different_hermes_evidence',
      requestId: request.id,
    })
  }

  const evidence: HermesEvidenceEvent = {
    id: externalEvidenceEventId(request.id, command.idempotencyKey),
    requestId: request.id,
    checkpointId: checkpoint.id,
    actionSlug: BusinessActionSlug,
    provider: 'hermes',
    status: 'accepted',
    evidenceKind: command.evidenceKind,
    providerRefHash: command.providerRefHash,
    payloadHash: command.payloadHash,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    receivedAt: command.receivedAt,
  }

  return ok('business_action_hermes_evidence_recorded', {
    state: {
      ...state,
      hermesEvidenceEvents: [...state.hermesEvidenceEvents, evidence],
      externalEvidenceEvents: [...state.externalEvidenceEvents, evidence],
    },
    evidence,
  })
}

export function recordBusinessActionResultArtifact(
  state: BusinessActionSourceState,
  command: RecordBusinessActionResultArtifactCommand
): RecordBusinessActionResultArtifactResult {
  const request = state.requests.find((candidate) => candidate.id === command.requestId)
  if (request === undefined) {
    return error('business_action_not_found', false, { reason: 'request_not_found', requestId: command.requestId })
  }

  const checkpoint = acceptedCheckpointFor(state, request, command.checkpointId)
  if (checkpoint === undefined) {
    return error('business_action_checkpoint_not_accepted', false, { reason: 'accepted_checkpoint_required', requestId: request.id })
  }

  const status = hasCompleteResultArtifact(command) ? 'complete' : 'proof_gap'
  const missingRequirements = missingArtifactRequirements(command)
  const artifactHash = stableHash({
    requestId: request.id,
    requestHash: request.requestHash,
    checkpointId: checkpoint.id,
    checkpointHash: checkpoint.checkpointHash,
    endpointDescriptorHash: command.endpointDescriptorHash ?? null,
    jsonSchemaHash: command.jsonSchemaHash ?? null,
    privateEndpointProvisioningPaymentGateRefHash: command.privateEndpointProvisioningPaymentGateRefHash ?? null,
    supportingEvidenceLabels: command.supportingEvidenceLabels ?? [],
    status,
  })
  const existing = state.resultArtifacts.find((artifact) => artifact.idempotencyKey === command.idempotencyKey)
  if (existing !== undefined) {
    if (existing.artifactHash === artifactHash) {
      return ok('business_action_result_artifact_replayed', { state, artifact: existing })
    }

    return error('business_action_idempotency_conflict', false, {
      reason: 'same_key_different_result_artifact',
      requestId: request.id,
    })
  }

  const artifact: BusinessActionResultArtifact = {
    id: resultArtifactId(request.id, command.idempotencyKey),
    requestId: request.id,
    checkpointId: checkpoint.id,
    actionSlug: BusinessActionSlug,
    status,
    artifactHash,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    recordedAt: command.recordedAt,
    ...(command.endpointDescriptorHash === undefined ? {} : { endpointDescriptorHash: command.endpointDescriptorHash }),
    ...(command.jsonSchemaHash === undefined ? {} : { jsonSchemaHash: command.jsonSchemaHash }),
    ...(command.privateEndpointProvisioningPaymentGateRefHash === undefined
      ? {}
      : { privateEndpointProvisioningPaymentGateRefHash: command.privateEndpointProvisioningPaymentGateRefHash }),
    ...((command.supportingEvidenceLabels ?? []).length === 0 ? {} : { supportingEvidenceLabels: command.supportingEvidenceLabels }),
    ...(missingRequirements.length === 0 ? {} : { proofGapReason: `missing:${missingRequirements.join(',')}` }),
  }

  return ok('business_action_result_artifact_recorded', {
    state: { ...state, resultArtifacts: [...state.resultArtifacts, artifact] },
    artifact,
  })
}

export function recordActionReceipt(
  state: BusinessActionSourceState,
  command: RecordActionReceiptCommand
): RecordActionReceiptResult {
  const request = state.requests.find((candidate) => candidate.id === command.requestId)
  if (request === undefined) {
    return error('business_action_not_found', false, { reason: 'request_not_found', requestId: command.requestId })
  }

  const existing = state.receipts.find((receipt) => receipt.requestId === request.id && receipt.idempotencyKey === command.idempotencyKey)
  const checkpoint = latestCheckpointFor(state, request)
  const resultArtifact = latestResultArtifactFor(state, request, checkpoint)
  const receiptDraft = buildReceipt(state, request, checkpoint, resultArtifact, command)
  if (existing !== undefined) {
    if (existing.payloadHash === receiptDraft.payloadHash) {
      return ok('business_action_receipt_replayed', { state, receipt: existing })
    }

    return error('business_action_idempotency_conflict', false, {
      reason: 'same_key_different_receipt',
      requestId: request.id,
    })
  }

  return ok('business_action_receipt_recorded', {
    state: { ...state, receipts: [...state.receipts, receiptDraft] },
    receipt: receiptDraft,
  })
}

export function verifyActionReceipt(
  state: BusinessActionSourceState,
  receipt: ActionReceipt,
  options: ActionReceiptVerificationOptions = {}
): ActionReceiptVerification {
  const request = state.requests.find((candidate) => candidate.id === receipt.requestId)
  const checkpoint = request === undefined ? undefined : latestCheckpointFor(state, request)
  const card = request === undefined ? undefined : state.cards.find((candidate) => candidate.id === request.cardId)
  const mandate = request === undefined ? undefined : state.mandates.find((candidate) => candidate.id === request.mandateId)
  const resultArtifact = request === undefined ? undefined : latestResultArtifactFor(state, request, checkpoint)
  const externalEvidence = state.externalEvidenceEvents.filter((event) => receipt.externalEvidenceRefHashes.includes(event.payloadHash))
  const guardrailDecisions = state.guardrailDecisions.filter((event) => receipt.guardrailEvidenceRefHashes.includes(event.decisionHash))
  const sourceExternalEvidence = checkpoint === undefined || checkpoint.decision !== 'accepted'
    ? []
    : state.externalEvidenceEvents.filter(
        (event) => event.requestId === receipt.requestId && event.checkpointId === checkpoint.id && event.status === 'accepted'
      )
  const sourceGuardrailDecisions = state.guardrailDecisions.filter((event) => event.requestId === receipt.requestId)
  const reconstructionStatus = verifyReceiptStatus(state, receipt, {
    request,
    checkpoint,
    card,
    mandate,
    resultArtifact,
    externalEvidence,
    sourceExternalEvidence,
    sourceGuardrailDecisions,
  })
  const publicReadback: PublicActionReceiptReadback = {
    receiptId: receipt.id,
    actionSlug: BusinessActionSlug,
    outcome: receipt.outcome,
    reconstructionStatus,
    cardVersion: receipt.cardVersion,
    hashes: {
      cardHash: receipt.cardHash,
      mandateHash: receipt.mandateHash,
      requestHash: receipt.requestHash,
      ...(receipt.checkpointHash === undefined ? {} : { checkpointHash: receipt.checkpointHash }),
      ...(receipt.resultArtifactHash === undefined ? {} : { resultArtifactHash: receipt.resultArtifactHash }),
    },
    labels: ['source/local proof only', 'production proof not claimed'],
    recordedAt: receipt.recordedAt,
  }

  return {
    reconstructionStatus,
    publicReadback,
    ...(options.includePrivate
      ? {
          privateReadback: {
            ...(resultArtifact === undefined ? {} : { resultArtifact }),
            externalEvidenceEvents: externalEvidence,
            guardrailDecisions,
          },
        }
      : {}),
  }
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

function acceptedCheckpointFor(
  state: BusinessActionSourceState,
  request: CapabilityRequest,
  checkpointId: AuthorizationCheckpointId
): AuthorizationCheckpoint | undefined {
  const checkpoint = state.checkpoints.find((candidate) => candidate.id === checkpointId)
  if (checkpoint?.requestId !== request.id || checkpoint.decision !== 'accepted') {
    return undefined
  }

  return checkpoint
}

function latestCheckpointFor(
  state: BusinessActionSourceState,
  request: CapabilityRequest
): AuthorizationCheckpoint | undefined {
  return state.checkpoints.filter((checkpoint) => checkpoint.requestId === request.id).at(-1)
}

function latestResultArtifactFor(
  state: BusinessActionSourceState,
  request: CapabilityRequest,
  checkpoint: AuthorizationCheckpoint | undefined
): BusinessActionResultArtifact | undefined {
  if (checkpoint === undefined) {
    return undefined
  }

  return state.resultArtifacts
    .filter((artifact) => artifact.requestId === request.id && artifact.checkpointId === checkpoint.id)
    .at(-1)
}

function hasCompleteResultArtifact(command: RecordBusinessActionResultArtifactCommand): boolean {
  return (
    command.endpointDescriptorHash !== undefined &&
    command.jsonSchemaHash !== undefined &&
    command.privateEndpointProvisioningPaymentGateRefHash !== undefined
  )
}

function missingArtifactRequirements(command: RecordBusinessActionResultArtifactCommand): readonly string[] {
  return [
    command.endpointDescriptorHash === undefined ? 'endpoint_descriptor' : undefined,
    command.jsonSchemaHash === undefined ? 'json_schema' : undefined,
    command.privateEndpointProvisioningPaymentGateRefHash === undefined ? 'private_endpoint_provisioning_payment_gate_ref' : undefined,
  ].filter((value): value is string => value !== undefined)
}

function buildReceipt(
  state: BusinessActionSourceState,
  request: CapabilityRequest,
  checkpoint: AuthorizationCheckpoint | undefined,
  resultArtifact: BusinessActionResultArtifact | undefined,
  command: RecordActionReceiptCommand
): ActionReceipt {
  const outcome = receiptOutcome(checkpoint, resultArtifact)
  const reconstructionStatus = receiptReconstructionStatus(outcome, checkpoint, resultArtifact)
  const externalEvidenceRefHashes = checkpoint === undefined || checkpoint.decision !== 'accepted'
    ? []
    : state.externalEvidenceEvents
        .filter((event) => event.requestId === request.id && event.checkpointId === checkpoint.id && event.status === 'accepted')
        .map((event) => event.payloadHash)
  const guardrailEvidenceRefHashes = state.guardrailDecisions
    .filter((decision) => decision.requestId === request.id)
    .map((decision) => decision.decisionHash)
  const signatureRefHash = stableHash({
    requestId: request.id,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    recordedAt: command.recordedAt,
    outcome,
  })
  const payloadHash = stableHash(
    receiptPayloadHashValue({
      request,
      checkpoint,
      resultArtifact,
      outcome,
      reconstructionStatus,
      externalEvidenceRefHashes,
      guardrailEvidenceRefHashes,
      signatureRefHash,
      recordedAt: command.recordedAt,
    })
  )

  return {
    id: actionReceiptId(request.id, command.idempotencyKey),
    requestId: request.id,
    actionSlug: BusinessActionSlug,
    outcome,
    cardHash: request.cardHash,
    cardVersion: request.cardVersion,
    mandateHash: request.mandateHash,
    requestHash: request.requestHash,
    externalEvidenceRefHashes,
    guardrailEvidenceRefHashes,
    signatureRefHash,
    reconstructionStatus,
    payloadHash,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    recordedAt: command.recordedAt,
    ...(checkpoint === undefined ? {} : { checkpointHash: checkpoint.checkpointHash }),
    ...(resultArtifact === undefined ? {} : { resultArtifactHash: resultArtifact.artifactHash }),
  }
}

function receiptOutcome(
  checkpoint: AuthorizationCheckpoint | undefined,
  resultArtifact: BusinessActionResultArtifact | undefined
): ActionReceiptOutcome {
  if (checkpoint?.decision === 'refused') {
    return 'refused'
  }

  if (checkpoint?.decision === 'clarification_required') {
    return 'clarification_required'
  }

  if (checkpoint?.decision === 'expired') {
    return 'expired'
  }

  if (checkpoint?.decision === 'proof_gap' || resultArtifact?.status === 'proof_gap' || resultArtifact === undefined) {
    return 'proof_gap'
  }

  return 'success'
}

function receiptReconstructionStatus(
  outcome: ActionReceiptOutcome,
  checkpoint: AuthorizationCheckpoint | undefined,
  resultArtifact: BusinessActionResultArtifact | undefined
): ReceiptReconstructionStatus {
  if (outcome === 'refused' && checkpoint?.decision === 'refused') {
    return 'refused_no_consequence'
  }

  if (outcome === 'success' && resultArtifact?.status === 'complete') {
    return 'complete'
  }

  if (outcome === 'proof_gap') {
    return 'proof_gap'
  }

  return 'incomplete'
}

function verifyReceiptStatus(
  state: BusinessActionSourceState,
  receipt: ActionReceipt,
  context: {
    request: CapabilityRequest | undefined
    checkpoint: AuthorizationCheckpoint | undefined
    card: BusinessActionCard | undefined
    mandate: BuyerMandate | undefined
    resultArtifact: BusinessActionResultArtifact | undefined
    externalEvidence: readonly ExternalEvidenceEvent[]
    sourceExternalEvidence: readonly ExternalEvidenceEvent[]
    sourceGuardrailDecisions: readonly GuardrailDecisionEvidence[]
  }
): ReceiptReconstructionStatus {
  if (context.request === undefined) {
    return 'evidence_mismatch'
  }

  if (context.card === undefined || context.card.id !== context.request.cardId) {
    return 'evidence_mismatch'
  }

  if (context.card.status === 'stale' || context.card.status === 'disabled') {
    return 'stale_source'
  }

  if (context.mandate === undefined || context.mandate.status !== 'active' || context.mandate.expiresAt <= receipt.recordedAt) {
    return 'expired_mandate'
  }

  if (receipt.externalEvidenceRefHashes.length !== context.externalEvidence.length) {
    return 'evidence_mismatch'
  }

  if (context.checkpoint !== undefined) {
    const hasUnboundEvent = context.externalEvidence.some(
      (event) => event.requestId !== receipt.requestId || event.checkpointId !== context.checkpoint?.id
    )
    if (hasUnboundEvent) {
      return 'unbound_provider_event'
    }
  }

  if (receipt.resultArtifactHash !== undefined && context.resultArtifact === undefined) {
    return 'evidence_mismatch'
  }

  const expectedOutcome = receiptOutcome(context.checkpoint, context.resultArtifact)
  const expectedReconstructionStatus = receiptReconstructionStatus(expectedOutcome, context.checkpoint, context.resultArtifact)
  const expectedExternalEvidenceRefHashes = context.sourceExternalEvidence.map((event) => event.payloadHash)
  const expectedGuardrailEvidenceRefHashes = context.sourceGuardrailDecisions.map((decision) => decision.decisionHash)
  const expectedSignatureRefHash = stableHash({
    requestId: context.request.id,
    idempotencyKey: receipt.idempotencyKey,
    correlationId: receipt.correlationId,
    recordedAt: receipt.recordedAt,
    outcome: expectedOutcome,
  })
  const expectedPayloadHash = stableHash(
    receiptPayloadHashValue({
      request: context.request,
      checkpoint: context.checkpoint,
      resultArtifact: context.resultArtifact,
      outcome: expectedOutcome,
      reconstructionStatus: expectedReconstructionStatus,
      externalEvidenceRefHashes: expectedExternalEvidenceRefHashes,
      guardrailEvidenceRefHashes: expectedGuardrailEvidenceRefHashes,
      signatureRefHash: expectedSignatureRefHash,
      recordedAt: receipt.recordedAt,
    })
  )

  if (
    receipt.actionSlug !== BusinessActionSlug ||
    receipt.outcome !== expectedOutcome ||
    receipt.cardHash !== context.request.cardHash ||
    receipt.cardVersion !== context.request.cardVersion ||
    receipt.mandateHash !== context.request.mandateHash ||
    receipt.requestHash !== context.request.requestHash ||
    receipt.checkpointHash !== context.checkpoint?.checkpointHash ||
    receipt.resultArtifactHash !== context.resultArtifact?.artifactHash ||
    receipt.reconstructionStatus !== expectedReconstructionStatus ||
    receipt.signatureRefHash !== expectedSignatureRefHash ||
    receipt.payloadHash !== expectedPayloadHash ||
    !sameStringSet(receipt.externalEvidenceRefHashes, expectedExternalEvidenceRefHashes) ||
    !sameStringSet(receipt.guardrailEvidenceRefHashes, expectedGuardrailEvidenceRefHashes)
  ) {
    return 'tampered'
  }

  return receipt.reconstructionStatus
}

function receiptPayloadHashValue(input: {
  request: CapabilityRequest
  checkpoint: AuthorizationCheckpoint | undefined
  resultArtifact: BusinessActionResultArtifact | undefined
  outcome: ActionReceiptOutcome
  reconstructionStatus: ReceiptReconstructionStatus
  externalEvidenceRefHashes: readonly SourceHash[]
  guardrailEvidenceRefHashes: readonly SourceHash[]
  signatureRefHash: SourceHash
  recordedAt: number
}) {
  return {
    requestId: input.request.id,
    actionSlug: BusinessActionSlug,
    outcome: input.outcome,
    cardHash: input.request.cardHash,
    cardVersion: input.request.cardVersion,
    mandateHash: input.request.mandateHash,
    requestHash: input.request.requestHash,
    checkpointHash: input.checkpoint?.checkpointHash ?? null,
    resultArtifactHash: input.resultArtifact?.artifactHash ?? null,
    externalEvidenceRefHashes: [...input.externalEvidenceRefHashes].sort(),
    guardrailEvidenceRefHashes: [...input.guardrailEvidenceRefHashes].sort(),
    signatureRefHash: input.signatureRefHash,
    reconstructionStatus: input.reconstructionStatus,
    recordedAt: input.recordedAt,
  }
}

function hermesEventHashValue(
  event: HermesEvidenceEvent,
  requestHash: SourceHash | null = null,
  checkpointHash: SourceHash | null = null
) {
  return {
    requestId: event.requestId,
    requestHash,
    checkpointId: event.checkpointId,
    checkpointHash,
    provider: event.provider,
    evidenceKind: event.evidenceKind,
    providerRefHash: event.providerRefHash,
    payloadHash: event.payloadHash,
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((value, index) => value === sortedRight[index])
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

function externalEvidenceEventId(requestId: CapabilityRequestId, idempotencyKey: OperationKey) {
  return brandNonEmpty(`external_evidence:${requestId}:${idempotencyKey}`, 'ExternalEvidenceEventId')
}

function resultArtifactId(requestId: CapabilityRequestId, idempotencyKey: OperationKey) {
  return brandNonEmpty(`business_action_result:${requestId}:${idempotencyKey}`, 'BusinessActionResultArtifactId')
}

function actionReceiptId(requestId: CapabilityRequestId, idempotencyKey: OperationKey) {
  return brandNonEmpty(`action_receipt:${requestId}:${idempotencyKey}`, 'ActionReceiptId')
}

export function isPostCheckpointExternalProvider(provider: BusinessActionExternalEvidenceProvider): boolean {
  return provider === 'hermes' || provider === 'stripe_test_mode' || provider === 'link_cli_test_mode' || provider === 'endpoint_host'
}
