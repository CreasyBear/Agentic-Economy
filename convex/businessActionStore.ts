import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import type { RuntimeDb, RuntimeDocument } from './source_state'
import { literalUnion } from '../src/modules/common/convex-literals'
import { brandNonEmpty } from '../src/modules/common/ids'
import type {
  ActionReceiptId,
  AuthorizationCheckpointId,
  BusinessActionCardId,
  BusinessActionNoRepairId,
  BusinessActionPrivateEvidenceRefId,
  BusinessActionResultArtifactId,
  BusinessActionSupportRecordId,
  BusinessId,
  BuyerMandateId,
  CapabilityRequestId,
  CorrelationId,
  ExternalEvidenceEventId,
  GuardrailDecisionEvidenceId,
  OperationKey,
  OwnerId,
  ServiceId,
  SourceHash,
} from '../src/modules/common/ids'
import { stableHash } from '../src/modules/common/stable-hash'
import {
  ActionReceiptOutcomeValues,
  AuthorizationCheckpointDecisionValues,
  BusinessActionCardDefaults,
  BusinessActionCardStatusValues,
  BusinessActionExternalEvidenceProviderValues,
  BusinessActionExternalEvidenceStatusValues,
  BusinessActionGuardrailDecisionValues,
  BusinessActionGuardrailProviderValues,
  BusinessActionOperatorControlKeyValues,
  BusinessActionResultArtifactStatusValues,
  BusinessActionSlug,
  BusinessActionSupportStatusValues,
  BuyerMandateStatusValues,
  CapabilityRequestStatusValues,
  HermesEvidenceKindValues,
  ReceiptReconstructionStatusValues,
  createEmptyBusinessActionSourceState,
} from '../src/modules/business-action/public'
import type {
  ActionReceipt,
  AuthorizationCheckpoint,
  BusinessActionCard,
  BusinessActionCurrency,
  BusinessActionNoRepairRecord,
  BusinessActionPrivateEvidenceRef,
  BusinessActionResultArtifact,
  BusinessActionSourceState,
  BusinessActionSupportRecord,
  BuyerMandate,
  CapabilityRequest,
  ExternalEvidenceEvent,
  GuardrailDecisionEvidence,
  HermesEvidenceEvent,
} from '../src/modules/business-action/public'

type EqFilter = { field: string; value: unknown }

type RedactedPrivateEvidenceExport = {
  id: BusinessActionPrivateEvidenceRefId
  requestId: CapabilityRequestId
  retentionClass: 'business_action_private_evidence'
  accessPolicy: 'owner_admin_operator_only'
  payloadHash: SourceHash
  ttlExpiresAt: number
  redactedAt?: number
  exportBehavior: 'redacted_hash_only'
  deleteBehavior: 'raw_private_payload_ref_tombstoned'
  tombstoneBehavior: 'lawful_audit_hashes_retained'
}

const actionSlug = v.literal(BusinessActionSlug)
const currency = v.union(v.literal('aud'), v.literal('usd'))
const cardStatus = literalUnion(BusinessActionCardStatusValues)
const mandateStatus = literalUnion(BuyerMandateStatusValues)
const requestStatus = literalUnion(CapabilityRequestStatusValues)
const checkpointDecision = literalUnion(AuthorizationCheckpointDecisionValues)
const guardrailProvider = literalUnion(BusinessActionGuardrailProviderValues)
const guardrailDecision = literalUnion(BusinessActionGuardrailDecisionValues)
const evidenceProvider = literalUnion(BusinessActionExternalEvidenceProviderValues)
const evidenceStatus = literalUnion(BusinessActionExternalEvidenceStatusValues)
const hermesEvidenceKind = literalUnion(HermesEvidenceKindValues)
const resultArtifactStatus = literalUnion(BusinessActionResultArtifactStatusValues)
const receiptOutcome = literalUnion(ActionReceiptOutcomeValues)
const receiptReconstructionStatus = literalUnion(ReceiptReconstructionStatusValues)
const supportStatus = literalUnion(BusinessActionSupportStatusValues)
const operatorControl = literalUnion(BusinessActionOperatorControlKeyValues)

export const businessActionTables = {
  businessActionCards: defineTable({
    cardId: v.string(),
    actionSlug,
    version: v.number(),
    ownerId: v.optional(v.id('owners')),
    sourceHash: v.string(),
    status: cardStatus,
    publicLabel: v.string(),
    serviceId: v.optional(v.id('businessServices')),
    posture: v.literal(BusinessActionCardDefaults.posture),
    callable: v.literal(false),
    paymentRequired: v.literal(false),
    ownerApprovalRequired: v.literal(true),
    receiptRequired: v.literal(true),
    updatedAt: v.number(),
  })
    .index('by_cardId', ['cardId'])
    .index('by_owner_status', ['ownerId', 'status'])
    .index('by_service_status', ['serviceId', 'status']),

  businessActionBuyerMandates: defineTable({
    mandateId: v.string(),
    buyerRef: v.string(),
    allowedBusinessId: v.id('businesses'),
    allowedActionSlug: actionSlug,
    maxAmountCents: v.optional(v.number()),
    currency: v.optional(currency),
    status: mandateStatus,
    mandateHash: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index('by_mandateId', ['mandateId'])
    .index('by_business_status', ['allowedBusinessId', 'status'])
    .index('by_idempotencyKey', ['idempotencyKey']),

  businessActionCapabilityRequests: defineTable({
    requestId: v.string(),
    cardId: v.string(),
    cardVersion: v.number(),
    cardHash: v.string(),
    mandateId: v.string(),
    mandateHash: v.string(),
    actionSlug,
    businessId: v.id('businesses'),
    ownerId: v.optional(v.id('owners')),
    serviceId: v.optional(v.id('businessServices')),
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
    .index('by_requestId', ['requestId'])
    .index('by_card', ['cardId'])
    .index('by_business_status', ['businessId', 'status'])
    .index('by_owner_status', ['ownerId', 'status'])
    .index('by_idempotencyKey', ['idempotencyKey']),

  businessActionAuthorizationCheckpoints: defineTable({
    checkpointId: v.string(),
    requestId: v.string(),
    actionSlug,
    businessId: v.id('businesses'),
    decision: checkpointDecision,
    reasonCode: v.string(),
    requestHash: v.string(),
    checkpointHash: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    ownerId: v.optional(v.id('owners')),
    ownerDecisionRef: v.optional(v.string()),
    decidedAt: v.number(),
    expiresAt: v.number(),
  })
    .index('by_checkpointId', ['checkpointId'])
    .index('by_request', ['requestId'])
    .index('by_request_decision', ['requestId', 'decision'])
    .index('by_idempotencyKey', ['idempotencyKey']),

  businessActionGuardrailDecisionEvidence: defineTable({
    evidenceId: v.string(),
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
    .index('by_evidenceId', ['evidenceId'])
    .index('by_request', ['requestId'])
    .index('by_decisionHash', ['decisionHash'])
    .index('by_idempotencyKey', ['idempotencyKey']),

  businessActionExternalEvidenceEvents: defineTable({
    evidenceId: v.string(),
    requestId: v.string(),
    checkpointId: v.string(),
    actionSlug,
    provider: evidenceProvider,
    status: evidenceStatus,
    providerRefHash: v.string(),
    payloadHash: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    amountCents: v.optional(v.number()),
    currency: v.optional(currency),
    reason: v.optional(v.string()),
    evidenceKind: v.optional(hermesEvidenceKind),
    receivedAt: v.number(),
  })
    .index('by_evidenceId', ['evidenceId'])
    .index('by_request', ['requestId'])
    .index('by_checkpoint', ['checkpointId'])
    .index('by_provider_ref', ['provider', 'providerRefHash'])
    .index('by_idempotencyKey', ['idempotencyKey']),

  businessActionResultArtifacts: defineTable({
    artifactId: v.string(),
    requestId: v.string(),
    checkpointId: v.string(),
    actionSlug,
    status: resultArtifactStatus,
    endpointDescriptorHash: v.optional(v.string()),
    jsonSchemaHash: v.optional(v.string()),
    privateEndpointProvisioningPaymentGateRefHash: v.optional(v.string()),
    supportingEvidenceLabels: v.optional(v.array(v.string())),
    artifactHash: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    recordedAt: v.number(),
    proofGapReason: v.optional(v.string()),
  })
    .index('by_artifactId', ['artifactId'])
    .index('by_request', ['requestId'])
    .index('by_checkpoint', ['checkpointId'])
    .index('by_idempotencyKey', ['idempotencyKey']),

  businessActionReceipts: defineTable({
    receiptId: v.string(),
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
    .index('by_receiptId', ['receiptId'])
    .index('by_request', ['requestId'])
    .index('by_idempotencyKey', ['idempotencyKey']),

  businessActionPrivateEvidenceRefs: defineTable({
    privateEvidenceRefId: v.string(),
    requestId: v.string(),
    retentionClass: v.literal('business_action_private_evidence'),
    accessPolicy: v.literal('owner_admin_operator_only'),
    payloadHash: v.string(),
    privatePayloadRef: v.optional(v.string()),
    ttlExpiresAt: v.number(),
    redactedAt: v.optional(v.number()),
  })
    .index('by_privateEvidenceRefId', ['privateEvidenceRefId'])
    .index('by_request', ['requestId'])
    .index('by_ttlExpiresAt', ['ttlExpiresAt']),

  businessActionSupportRecords: defineTable({
    supportRecordId: v.string(),
    actionSlug,
    businessId: v.id('businesses'),
    status: supportStatus,
    reason: v.string(),
    evidenceRefs: v.array(v.string()),
    claimDisablePath: operatorControl,
    operatorNextAction: v.string(),
    sourceHash: v.string(),
    correlationId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_supportRecordId', ['supportRecordId'])
    .index('by_business_status', ['businessId', 'status'])
    .index('by_action_status', ['actionSlug', 'status']),

  businessActionNoRepairRecords: defineTable({
    noRepairId: v.string(),
    requestId: v.string(),
    reason: v.string(),
    evidenceRefs: v.array(v.string()),
    noRepairHash: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    markedBy: v.string(),
    markedAt: v.number(),
  })
    .index('by_noRepairId', ['noRepairId'])
    .index('by_request', ['requestId'])
    .index('by_idempotencyKey', ['idempotencyKey']),
} as const

export async function loadBusinessActionRequestSlice(
  db: RuntimeDb,
  requestId: CapabilityRequestId | string
): Promise<BusinessActionSourceState> {
  const request = await firstByIndex(db, 'businessActionCapabilityRequests', 'by_requestId', [
    { field: 'requestId', value: requestId },
  ])
  return loadBusinessActionStateForRequestRows(db, request === null ? [] : [request])
}

export async function loadBusinessActionRequestSliceByIdempotencyKey(
  db: RuntimeDb,
  operationKey: string
): Promise<BusinessActionSourceState> {
  const request = await firstByIndex(db, 'businessActionCapabilityRequests', 'by_idempotencyKey', [
    { field: 'idempotencyKey', value: operationKey },
  ])
  return loadBusinessActionStateForRequestRows(db, request === null ? [] : [request])
}

export async function loadBusinessActionRequestCreationSlice(
  db: RuntimeDb,
  input: { cardId: string; mandateId: string; operationKey?: string | undefined }
): Promise<BusinessActionSourceState> {
  const [card, mandate, existingRequest] = await Promise.all([
    firstByIndex(db, 'businessActionCards', 'by_cardId', [{ field: 'cardId', value: input.cardId }]),
    firstByIndex(db, 'businessActionBuyerMandates', 'by_mandateId', [{ field: 'mandateId', value: input.mandateId }]),
    input.operationKey === undefined
      ? Promise.resolve(null)
      : firstByIndex(db, 'businessActionCapabilityRequests', 'by_idempotencyKey', [
          { field: 'idempotencyKey', value: input.operationKey },
        ]),
  ])
  const existingState = await loadBusinessActionStateForRequestRows(db, existingRequest === null ? [] : [existingRequest])

  return createEmptyBusinessActionSourceState({
    ...existingState,
    cards: uniqueBy([...existingState.cards, ...(card === null ? [] : [toCard(card)])], (entry) => String(entry.id)),
    mandates: uniqueBy([...existingState.mandates, ...(mandate === null ? [] : [toMandate(mandate)])], (entry) => String(entry.id)),
  })
}

export async function loadOwnerBusinessActionSlice(db: RuntimeDb, ownerId: string): Promise<BusinessActionSourceState> {
  const statuses: readonly CapabilityRequest['status'][] = [
    'proposed',
    'checkpoint_pending',
    'accepted',
    'refused',
    'clarification_required',
    'proof_gap',
    'expired',
  ]
  const requests = (
    await Promise.all(
      statuses.map((status) =>
        collectByIndex(db, 'businessActionCapabilityRequests', 'by_owner_status', [
          { field: 'ownerId', value: ownerId },
          { field: 'status', value: status },
        ])
      )
    )
  ).flat()

  return loadBusinessActionStateForRequestRows(db, requests)
}

export async function loadAdminBusinessActionSlice(
  db: RuntimeDb,
  filter: { requestId?: string | undefined }
): Promise<BusinessActionSourceState> {
  if (filter.requestId !== undefined && filter.requestId.trim().length > 0) {
    return loadBusinessActionRequestSlice(db, filter.requestId)
  }

  const statuses: readonly CapabilityRequest['status'][] = [
    'proposed',
    'checkpoint_pending',
    'accepted',
    'refused',
    'clarification_required',
    'proof_gap',
    'expired',
  ]
  const requests = (
    await Promise.all(
      statuses.map((status) =>
        collectByIndex(db, 'businessActionCapabilityRequests', 'by_business_status', [
          { field: 'businessId', value: '' },
          { field: 'status', value: status },
        ])
      )
    )
  ).flat()

  return loadBusinessActionStateForRequestRows(db, requests)
}

export async function persistBusinessActionSlice(db: RuntimeDb, state: BusinessActionSourceState): Promise<void> {
  for (const card of state.cards) {
    await upsertByIndexedLookup(
      db,
      'businessActionCards',
      'by_cardId',
      [{ field: 'cardId', value: card.id }],
      (row) => stringField(row, 'cardId') === card.id,
      {
        cardId: card.id,
        actionSlug: BusinessActionSlug,
        version: card.version,
        ...(card.ownerId === undefined ? {} : { ownerId: card.ownerId }),
        sourceHash: card.sourceHash,
        status: card.status,
        publicLabel: card.publicLabel,
        ...(card.serviceId === undefined ? {} : { serviceId: card.serviceId }),
        posture: 'proposal_only',
        callable: false,
        paymentRequired: false,
        ownerApprovalRequired: true,
        receiptRequired: true,
        updatedAt: card.updatedAt,
      }
    )
  }

  for (const mandate of state.mandates) {
    await upsertByIndexedLookup(
      db,
      'businessActionBuyerMandates',
      'by_mandateId',
      [{ field: 'mandateId', value: mandate.id }],
      (row) => stringField(row, 'mandateId') === mandate.id,
      {
        mandateId: mandate.id,
        buyerRef: mandate.buyerRef,
        allowedBusinessId: mandate.allowedBusinessId,
        allowedActionSlug: BusinessActionSlug,
        ...(mandate.maxAmountCents === undefined ? {} : { maxAmountCents: mandate.maxAmountCents }),
        ...(mandate.currency === undefined ? {} : { currency: mandate.currency }),
        status: mandate.status,
        mandateHash: mandate.mandateHash,
        idempotencyKey: mandate.idempotencyKey,
        correlationId: mandate.correlationId,
        createdAt: mandate.createdAt,
        expiresAt: mandate.expiresAt,
        ...(mandate.revokedAt === undefined ? {} : { revokedAt: mandate.revokedAt }),
      }
    )
    await upsertBusinessActionOperation(db, {
      operationName: 'recordBusinessActionMandate',
      key: mandate.idempotencyKey,
      requestHash: mandate.mandateHash,
      sourceHash: mandate.id,
      effectRefs: [`mandate:${mandate.id}`],
      createdAt: mandate.createdAt,
      updatedAt: mandate.createdAt,
    })
  }

  for (const request of state.requests) {
    await upsertByIndexedLookup(
      db,
      'businessActionCapabilityRequests',
      'by_requestId',
      [{ field: 'requestId', value: request.id }],
      (row) => stringField(row, 'requestId') === request.id,
      {
        requestId: request.id,
        cardId: request.cardId,
        cardVersion: request.cardVersion,
        cardHash: request.cardHash,
        mandateId: request.mandateId,
        mandateHash: request.mandateHash,
        actionSlug: BusinessActionSlug,
        businessId: request.businessId,
        ...(request.ownerId === undefined ? {} : { ownerId: request.ownerId }),
        ...(request.serviceId === undefined ? {} : { serviceId: request.serviceId }),
        ...(request.amountCents === undefined ? {} : { amountCents: request.amountCents }),
        ...(request.currency === undefined ? {} : { currency: request.currency }),
        requestHash: request.requestHash,
        status: request.status,
        requestedBy: request.requestedBy,
        idempotencyKey: request.idempotencyKey,
        correlationId: request.correlationId,
        requestedAt: request.requestedAt,
        expiresAt: request.expiresAt,
      }
    )
    await upsertBusinessActionOperation(db, {
      operationName: 'createCapabilityRequest',
      key: request.idempotencyKey,
      requestHash: request.requestHash,
      sourceHash: request.id,
      effectRefs: [`request:${request.id}`],
      createdAt: request.requestedAt,
      updatedAt: request.requestedAt,
    })
  }

  for (const checkpoint of state.checkpoints) {
    await upsertByIndexedLookup(
      db,
      'businessActionAuthorizationCheckpoints',
      'by_checkpointId',
      [{ field: 'checkpointId', value: checkpoint.id }],
      (row) => stringField(row, 'checkpointId') === checkpoint.id,
      {
        checkpointId: checkpoint.id,
        requestId: checkpoint.requestId,
        actionSlug: BusinessActionSlug,
        businessId: checkpoint.businessId,
        decision: checkpoint.decision,
        reasonCode: checkpoint.reasonCode,
        requestHash: checkpoint.requestHash,
        checkpointHash: checkpoint.checkpointHash,
        idempotencyKey: checkpoint.idempotencyKey,
        correlationId: checkpoint.correlationId,
        ...(checkpoint.ownerId === undefined ? {} : { ownerId: checkpoint.ownerId }),
        ...(checkpoint.ownerDecisionRef === undefined ? {} : { ownerDecisionRef: checkpoint.ownerDecisionRef }),
        decidedAt: checkpoint.decidedAt,
        expiresAt: checkpoint.expiresAt,
      }
    )
    await upsertBusinessActionOperation(db, {
      operationName: 'recordAuthorizationCheckpoint',
      key: checkpoint.idempotencyKey,
      requestHash: checkpoint.requestHash,
      sourceHash: checkpoint.checkpointHash,
      effectRefs: [`checkpoint:${checkpoint.id}`, `decision:${checkpoint.decision}`],
      createdAt: checkpoint.decidedAt,
      updatedAt: checkpoint.decidedAt,
    })
  }

  for (const evidence of state.guardrailDecisions) {
    await upsertByIndexedLookup(
      db,
      'businessActionGuardrailDecisionEvidence',
      'by_evidenceId',
      [{ field: 'evidenceId', value: evidence.id }],
      (row) => stringField(row, 'evidenceId') === evidence.id,
      {
        evidenceId: evidence.id,
        requestId: evidence.requestId,
        actionSlug: BusinessActionSlug,
        policyHash: evidence.policyHash,
        requestHash: evidence.requestHash,
        provider: evidence.provider,
        modelName: evidence.modelName,
        modelVersion: evidence.modelVersion,
        decision: evidence.decision,
        privateTraceRefHash: evidence.privateTraceRefHash,
        decisionHash: evidence.decisionHash,
        payloadHash: evidence.payloadHash,
        idempotencyKey: evidence.idempotencyKey,
        correlationId: evidence.correlationId,
        recordedAt: evidence.recordedAt,
      }
    )
    await upsertBusinessActionOperation(db, {
      operationName: 'recordGuardrailDecisionEvidence',
      key: evidence.idempotencyKey,
      requestHash: evidence.requestHash,
      sourceHash: evidence.decisionHash,
      effectRefs: [`guardrail:${evidence.id}`, `decision:${evidence.decision}`],
      createdAt: evidence.recordedAt,
      updatedAt: evidence.recordedAt,
    })
  }

  for (const event of state.externalEvidenceEvents) {
    await upsertByIndexedLookup(
      db,
      'businessActionExternalEvidenceEvents',
      'by_evidenceId',
      [{ field: 'evidenceId', value: event.id }],
      (row) => stringField(row, 'evidenceId') === event.id,
      {
        evidenceId: event.id,
        requestId: event.requestId,
        checkpointId: event.checkpointId,
        actionSlug: BusinessActionSlug,
        provider: event.provider,
        status: event.status,
        providerRefHash: event.providerRefHash,
        payloadHash: event.payloadHash,
        idempotencyKey: event.idempotencyKey,
        correlationId: event.correlationId,
        ...(event.amountCents === undefined ? {} : { amountCents: event.amountCents }),
        ...(event.currency === undefined ? {} : { currency: event.currency }),
        ...(event.reason === undefined ? {} : { reason: event.reason }),
        ...(isHermesEvidenceEvent(event) ? { evidenceKind: event.evidenceKind } : {}),
        receivedAt: event.receivedAt,
      }
    )
    await upsertBusinessActionOperation(db, {
      operationName: 'recordBusinessActionExternalEvidence',
      key: event.idempotencyKey,
      requestHash: event.payloadHash,
      sourceHash: event.providerRefHash,
      effectRefs: [`externalEvidence:${event.id}`, `provider:${event.provider}`, `status:${event.status}`],
      createdAt: event.receivedAt,
      updatedAt: event.receivedAt,
    })
  }

  for (const artifact of state.resultArtifacts) {
    await upsertByIndexedLookup(
      db,
      'businessActionResultArtifacts',
      'by_artifactId',
      [{ field: 'artifactId', value: artifact.id }],
      (row) => stringField(row, 'artifactId') === artifact.id,
      {
        artifactId: artifact.id,
        requestId: artifact.requestId,
        checkpointId: artifact.checkpointId,
        actionSlug: BusinessActionSlug,
        status: artifact.status,
        ...(artifact.endpointDescriptorHash === undefined ? {} : { endpointDescriptorHash: artifact.endpointDescriptorHash }),
        ...(artifact.jsonSchemaHash === undefined ? {} : { jsonSchemaHash: artifact.jsonSchemaHash }),
        ...(artifact.privateEndpointProvisioningPaymentGateRefHash === undefined
          ? {}
          : { privateEndpointProvisioningPaymentGateRefHash: artifact.privateEndpointProvisioningPaymentGateRefHash }),
        ...((artifact.supportingEvidenceLabels ?? []).length === 0
          ? {}
          : { supportingEvidenceLabels: [...(artifact.supportingEvidenceLabels ?? [])] }),
        artifactHash: artifact.artifactHash,
        idempotencyKey: artifact.idempotencyKey,
        correlationId: artifact.correlationId,
        recordedAt: artifact.recordedAt,
        ...(artifact.proofGapReason === undefined ? {} : { proofGapReason: artifact.proofGapReason }),
      }
    )
    await upsertBusinessActionOperation(db, {
      operationName: 'recordBusinessActionResultArtifact',
      key: artifact.idempotencyKey,
      requestHash: artifact.artifactHash,
      sourceHash: artifact.id,
      effectRefs: [`artifact:${artifact.id}`, `status:${artifact.status}`],
      createdAt: artifact.recordedAt,
      updatedAt: artifact.recordedAt,
    })
  }

  for (const receipt of state.receipts) {
    await upsertByIndexedLookup(
      db,
      'businessActionReceipts',
      'by_receiptId',
      [{ field: 'receiptId', value: receipt.id }],
      (row) => stringField(row, 'receiptId') === receipt.id,
      {
        receiptId: receipt.id,
        requestId: receipt.requestId,
        actionSlug: BusinessActionSlug,
        outcome: receipt.outcome,
        cardHash: receipt.cardHash,
        cardVersion: receipt.cardVersion,
        mandateHash: receipt.mandateHash,
        requestHash: receipt.requestHash,
        ...(receipt.checkpointHash === undefined ? {} : { checkpointHash: receipt.checkpointHash }),
        ...(receipt.policyHash === undefined ? {} : { policyHash: receipt.policyHash }),
        externalEvidenceRefHashes: [...receipt.externalEvidenceRefHashes],
        guardrailEvidenceRefHashes: [...receipt.guardrailEvidenceRefHashes],
        ...(receipt.resultArtifactHash === undefined ? {} : { resultArtifactHash: receipt.resultArtifactHash }),
        ...(receipt.previousReceiptHash === undefined ? {} : { previousReceiptHash: receipt.previousReceiptHash }),
        signatureRefHash: receipt.signatureRefHash,
        reconstructionStatus: receipt.reconstructionStatus,
        payloadHash: receipt.payloadHash,
        idempotencyKey: receipt.idempotencyKey,
        correlationId: receipt.correlationId,
        recordedAt: receipt.recordedAt,
      }
    )
    await upsertBusinessActionOperation(db, {
      operationName: 'recordActionReceipt',
      key: receipt.idempotencyKey,
      requestHash: receipt.requestHash,
      sourceHash: receipt.payloadHash,
      effectRefs: [`receipt:${receipt.id}`, `outcome:${receipt.outcome}`],
      createdAt: receipt.recordedAt,
      updatedAt: receipt.recordedAt,
    })
  }

  for (const ref of state.privateEvidenceRefs) {
    await upsertByIndexedLookup(
      db,
      'businessActionPrivateEvidenceRefs',
      'by_privateEvidenceRefId',
      [{ field: 'privateEvidenceRefId', value: ref.id }],
      (row) => stringField(row, 'privateEvidenceRefId') === ref.id,
      {
        privateEvidenceRefId: ref.id,
        requestId: ref.requestId,
        retentionClass: 'business_action_private_evidence',
        accessPolicy: 'owner_admin_operator_only',
        payloadHash: ref.payloadHash,
        ...(ref.privatePayloadRef === undefined ? {} : { privatePayloadRef: ref.privatePayloadRef }),
        ttlExpiresAt: ref.ttlExpiresAt,
        ...(ref.redactedAt === undefined ? {} : { redactedAt: ref.redactedAt }),
      }
    )
  }

  for (const support of state.supportRecords) {
    await upsertByIndexedLookup(
      db,
      'businessActionSupportRecords',
      'by_supportRecordId',
      [{ field: 'supportRecordId', value: support.id }],
      (row) => stringField(row, 'supportRecordId') === support.id,
      {
        supportRecordId: support.id,
        actionSlug: BusinessActionSlug,
        businessId: support.businessId,
        status: support.status,
        reason: support.reason,
        evidenceRefs: [...support.evidenceRefs],
        claimDisablePath: support.claimDisablePath,
        operatorNextAction: support.operatorNextAction,
        sourceHash: support.sourceHash,
        correlationId: support.correlationId,
        createdAt: support.createdAt,
        updatedAt: support.updatedAt,
      }
    )
  }

  for (const noRepair of state.noRepairRecords) {
    await upsertByIndexedLookup(
      db,
      'businessActionNoRepairRecords',
      'by_noRepairId',
      [{ field: 'noRepairId', value: noRepair.id }],
      (row) => stringField(row, 'noRepairId') === noRepair.id,
      {
        noRepairId: noRepair.id,
        requestId: noRepair.requestId,
        reason: noRepair.reason,
        evidenceRefs: [...noRepair.evidenceRefs],
        noRepairHash: noRepair.noRepairHash,
        idempotencyKey: noRepair.idempotencyKey,
        correlationId: noRepair.correlationId,
        markedBy: noRepair.markedBy,
        markedAt: noRepair.markedAt,
      }
    )
    await upsertBusinessActionOperation(db, {
      operationName: 'markBusinessActionNoRepair',
      key: noRepair.idempotencyKey,
      requestHash: noRepair.noRepairHash,
      sourceHash: noRepair.id,
      effectRefs: [`noRepair:${noRepair.id}`],
      createdAt: noRepair.markedAt,
      updatedAt: noRepair.markedAt,
    })
  }
}

export async function exportBusinessActionPrivateEvidenceRefs(
  db: RuntimeDb,
  requestId: CapabilityRequestId | string
): Promise<RedactedPrivateEvidenceExport[]> {
  const rows = await collectByIndex(db, 'businessActionPrivateEvidenceRefs', 'by_request', [
    { field: 'requestId', value: requestId },
  ])

  return rows.map((row) => {
    const redactedAt = optionalNumberField(row, 'redactedAt')
    return {
      id: stringField(row, 'privateEvidenceRefId') as BusinessActionPrivateEvidenceRefId,
      requestId: stringField(row, 'requestId') as CapabilityRequestId,
      retentionClass: 'business_action_private_evidence' as const,
      accessPolicy: 'owner_admin_operator_only' as const,
      payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
      ttlExpiresAt: numberField(row, 'ttlExpiresAt'),
      ...(redactedAt === undefined ? {} : { redactedAt }),
      exportBehavior: 'redacted_hash_only' as const,
      deleteBehavior: 'raw_private_payload_ref_tombstoned' as const,
      tombstoneBehavior: 'lawful_audit_hashes_retained' as const,
    }
  })
}

export async function tombstoneBusinessActionPrivateEvidenceRef(
  db: RuntimeDb,
  privateEvidenceRefId: BusinessActionPrivateEvidenceRefId | string,
  redactedAt: number
): Promise<void> {
  const row = await firstByIndex(db, 'businessActionPrivateEvidenceRefs', 'by_privateEvidenceRefId', [
    { field: 'privateEvidenceRefId', value: privateEvidenceRefId },
  ])
  if (row === null) {
    return
  }

  await db.patch(row._id, {
    privatePayloadRef: undefined,
    redactedAt,
  })
}

async function loadBusinessActionStateForRequestRows(
  db: RuntimeDb,
  requestRows: readonly RuntimeDocument[]
): Promise<BusinessActionSourceState> {
  const requests = requestRows.map(toRequest)
  if (requests.length === 0) {
    return createEmptyBusinessActionSourceState()
  }

  const [cards, mandates, checkpoints, guardrails, evidence, artifacts, receipts, privateRefs, supportRecords, noRepairRecords] =
    await Promise.all([
      collectForIds(db, 'businessActionCards', 'by_cardId', 'cardId', uniqueStrings(requests.map((request) => request.cardId))),
      collectForIds(db, 'businessActionBuyerMandates', 'by_mandateId', 'mandateId', uniqueStrings(requests.map((request) => request.mandateId))),
      collectForRequests(db, 'businessActionAuthorizationCheckpoints', requests),
      collectForRequests(db, 'businessActionGuardrailDecisionEvidence', requests),
      collectForRequests(db, 'businessActionExternalEvidenceEvents', requests),
      collectForRequests(db, 'businessActionResultArtifacts', requests),
      collectForRequests(db, 'businessActionReceipts', requests),
      collectForRequests(db, 'businessActionPrivateEvidenceRefs', requests),
      collectSupportForBusinesses(db, uniqueStrings(requests.map((request) => request.businessId))),
      collectForRequests(db, 'businessActionNoRepairRecords', requests),
    ])
  const externalEvidenceEvents = evidence.map(toExternalEvidenceEvent)

  return createEmptyBusinessActionSourceState({
    cards: cards.map(toCard),
    mandates: mandates.map(toMandate),
    requests,
    checkpoints: checkpoints.map(toCheckpoint),
    guardrailDecisions: guardrails.map(toGuardrailEvidence),
    externalEvidenceEvents,
    hermesEvidenceEvents: externalEvidenceEvents.filter(isHermesEvidenceEvent),
    resultArtifacts: artifacts.map(toResultArtifact),
    receipts: receipts.map(toReceipt),
    privateEvidenceRefs: privateRefs.map(toPrivateEvidenceRef),
    supportRecords: supportRecords.map(toSupportRecord),
    noRepairRecords: noRepairRecords.map(toNoRepairRecord),
  })
}

async function collectForRequests(
  db: RuntimeDb,
  tableName: string,
  requests: readonly CapabilityRequest[]
): Promise<RuntimeDocument[]> {
  return (
    await Promise.all(
      requests.map((request) =>
        collectByIndex(db, tableName, 'by_request', [{ field: 'requestId', value: request.id }])
      )
    )
  ).flat()
}

async function collectForIds(
  db: RuntimeDb,
  tableName: string,
  indexName: string,
  field: string,
  ids: readonly string[]
): Promise<RuntimeDocument[]> {
  return (
    await Promise.all(ids.map((id) => collectByIndex(db, tableName, indexName, [{ field, value: id }])))
  ).flat()
}

async function collectSupportForBusinesses(db: RuntimeDb, businessIds: readonly string[]): Promise<RuntimeDocument[]> {
  const statuses: readonly BusinessActionSupportRecord['status'][] = ['open', 'resolved', 'no_repair']
  return (
    await Promise.all(
      businessIds.flatMap((businessId) =>
        statuses.map((status) =>
          collectByIndex(db, 'businessActionSupportRecords', 'by_business_status', [
            { field: 'businessId', value: businessId },
            { field: 'status', value: status },
          ])
        )
      )
    )
  ).flat()
}

async function upsertBusinessActionOperation(
  db: RuntimeDb,
  input: {
    operationName: string
    key: string
    requestHash: string
    sourceHash: string
    effectRefs: readonly string[]
    createdAt: number
    updatedAt: number
  }
): Promise<void> {
  await upsertByIndexedLookup(
    db,
    'operationKeys',
    'by_actor_operation_key',
    [
      { field: 'actorRef', value: 'business_action' },
      { field: 'operationName', value: input.operationName },
      { field: 'key', value: input.key },
    ],
    (row) => stringField(row, 'scope') === 'business_action',
    {
      scope: 'business_action',
      actorKind: 'system',
      actorRef: 'business_action',
      operationName: input.operationName,
      key: input.key,
      requestHash: input.requestHash,
      sourceHash: input.sourceHash,
      status: 'succeeded',
      resultHash: stableHash({
        operationName: input.operationName,
        key: input.key,
        sourceHash: input.sourceHash,
        effectRefs: input.effectRefs,
      }),
      effectRefs: [...input.effectRefs],
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    }
  )
}

async function upsertByIndexedLookup(
  db: RuntimeDb,
  tableName: string,
  indexName: string,
  filters: readonly EqFilter[],
  matches: (row: RuntimeDocument) => boolean,
  patch: Record<string, unknown>
): Promise<void> {
  const existing = (await collectByIndex(db, tableName, indexName, filters)).find(matches)
  if (existing === undefined) {
    await db.insert(tableName, patch)
    return
  }

  await db.patch(existing._id, patch)
}

async function firstByIndex(
  db: Pick<RuntimeDb, 'query'>,
  tableName: string,
  indexName: string,
  filters: readonly EqFilter[]
): Promise<RuntimeDocument | null> {
  const rows = await collectByIndex(db, tableName, indexName, filters)
  return rows[0] ?? null
}

async function collectByIndex(
  db: Pick<RuntimeDb, 'query'>,
  tableName: string,
  indexName: string,
  filters: readonly EqFilter[]
): Promise<RuntimeDocument[]> {
  return db
    .query(tableName)
    .withIndex(indexName, (query) => filters.reduce((builder, filter) => builder.eq(filter.field, filter.value), query))
    .collect()
}

function toCard(row: RuntimeDocument): BusinessActionCard {
  const ownerId = optionalStringField(row, 'ownerId')
  const serviceId = optionalStringField(row, 'serviceId')
  return {
    id: stringField(row, 'cardId') as BusinessActionCardId,
    actionSlug: BusinessActionSlug,
    version: numberField(row, 'version'),
    ...(ownerId === undefined ? {} : { ownerId: brandNonEmpty(ownerId, 'OwnerId') }),
    sourceHash: brandNonEmpty(stringField(row, 'sourceHash'), 'SourceHash'),
    status: cardStatusField(row),
    publicLabel: stringField(row, 'publicLabel'),
    ...(serviceId === undefined ? {} : { serviceId: brandNonEmpty(serviceId, 'ServiceId') }),
    posture: 'proposal_only',
    callable: false,
    paymentRequired: false,
    ownerApprovalRequired: true,
    receiptRequired: true,
    updatedAt: numberField(row, 'updatedAt'),
  }
}

function toMandate(row: RuntimeDocument): BuyerMandate {
  const maxAmountCents = optionalNumberField(row, 'maxAmountCents')
  const currencyValue = currencyField(row)
  const revokedAt = optionalNumberField(row, 'revokedAt')
  return {
    id: stringField(row, 'mandateId') as BuyerMandateId,
    buyerRef: stringField(row, 'buyerRef'),
    allowedBusinessId: brandNonEmpty(stringField(row, 'allowedBusinessId'), 'BusinessId'),
    allowedActionSlug: BusinessActionSlug,
    ...(maxAmountCents === undefined ? {} : { maxAmountCents }),
    ...(currencyValue === undefined ? {} : { currency: currencyValue }),
    status: mandateStatusField(row),
    mandateHash: brandNonEmpty(stringField(row, 'mandateHash'), 'SourceHash'),
    idempotencyKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    createdAt: numberField(row, 'createdAt'),
    expiresAt: numberField(row, 'expiresAt'),
    ...(revokedAt === undefined ? {} : { revokedAt }),
  }
}

function toRequest(row: RuntimeDocument): CapabilityRequest {
  const ownerId = optionalStringField(row, 'ownerId')
  const serviceId = optionalStringField(row, 'serviceId')
  const amountCents = optionalNumberField(row, 'amountCents')
  const currencyValue = currencyField(row)
  return {
    id: stringField(row, 'requestId') as CapabilityRequestId,
    cardId: stringField(row, 'cardId') as BusinessActionCardId,
    cardVersion: numberField(row, 'cardVersion'),
    cardHash: brandNonEmpty(stringField(row, 'cardHash'), 'SourceHash'),
    mandateId: stringField(row, 'mandateId') as BuyerMandateId,
    mandateHash: brandNonEmpty(stringField(row, 'mandateHash'), 'SourceHash'),
    actionSlug: BusinessActionSlug,
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    ...(ownerId === undefined ? {} : { ownerId: brandNonEmpty(ownerId, 'OwnerId') }),
    ...(serviceId === undefined ? {} : { serviceId: brandNonEmpty(serviceId, 'ServiceId') }),
    ...(amountCents === undefined ? {} : { amountCents }),
    ...(currencyValue === undefined ? {} : { currency: currencyValue }),
    requestHash: brandNonEmpty(stringField(row, 'requestHash'), 'SourceHash'),
    status: requestStatusField(row),
    requestedBy: requestedByField(row),
    idempotencyKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    requestedAt: numberField(row, 'requestedAt'),
    expiresAt: numberField(row, 'expiresAt'),
  }
}

function toCheckpoint(row: RuntimeDocument): AuthorizationCheckpoint {
  const ownerId = optionalStringField(row, 'ownerId')
  const ownerDecisionRef = optionalStringField(row, 'ownerDecisionRef')
  return {
    id: stringField(row, 'checkpointId') as AuthorizationCheckpointId,
    requestId: stringField(row, 'requestId') as CapabilityRequestId,
    actionSlug: BusinessActionSlug,
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    decision: checkpointDecisionField(row),
    reasonCode: stringField(row, 'reasonCode'),
    requestHash: brandNonEmpty(stringField(row, 'requestHash'), 'SourceHash'),
    checkpointHash: brandNonEmpty(stringField(row, 'checkpointHash'), 'SourceHash'),
    idempotencyKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    ...(ownerId === undefined ? {} : { ownerId: brandNonEmpty(ownerId, 'OwnerId') }),
    ...(ownerDecisionRef === undefined ? {} : { ownerDecisionRef }),
    decidedAt: numberField(row, 'decidedAt'),
    expiresAt: numberField(row, 'expiresAt'),
  }
}

function toGuardrailEvidence(row: RuntimeDocument): GuardrailDecisionEvidence {
  return {
    id: stringField(row, 'evidenceId') as GuardrailDecisionEvidenceId,
    requestId: stringField(row, 'requestId') as CapabilityRequestId,
    actionSlug: BusinessActionSlug,
    policyHash: brandNonEmpty(stringField(row, 'policyHash'), 'SourceHash'),
    requestHash: brandNonEmpty(stringField(row, 'requestHash'), 'SourceHash'),
    provider: guardrailProviderField(row),
    modelName: stringField(row, 'modelName'),
    modelVersion: stringField(row, 'modelVersion'),
    decision: guardrailDecisionField(row),
    privateTraceRefHash: brandNonEmpty(stringField(row, 'privateTraceRefHash'), 'SourceHash'),
    decisionHash: brandNonEmpty(stringField(row, 'decisionHash'), 'SourceHash'),
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    idempotencyKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    recordedAt: numberField(row, 'recordedAt'),
  }
}

function toExternalEvidenceEvent(row: RuntimeDocument): ExternalEvidenceEvent {
  const amountCents = optionalNumberField(row, 'amountCents')
  const currencyValue = currencyField(row)
  const reason = optionalStringField(row, 'reason')
  const event = {
    id: stringField(row, 'evidenceId') as ExternalEvidenceEventId,
    requestId: stringField(row, 'requestId') as CapabilityRequestId,
    checkpointId: stringField(row, 'checkpointId') as AuthorizationCheckpointId,
    actionSlug: BusinessActionSlug,
    provider: evidenceProviderField(row),
    status: evidenceStatusField(row),
    providerRefHash: brandNonEmpty(stringField(row, 'providerRefHash'), 'SourceHash'),
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    idempotencyKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    ...(amountCents === undefined ? {} : { amountCents }),
    ...(currencyValue === undefined ? {} : { currency: currencyValue }),
    ...(reason === undefined ? {} : { reason }),
    receivedAt: numberField(row, 'receivedAt'),
  }

  if (event.provider !== 'hermes') {
    return event
  }

  return {
    ...event,
    provider: 'hermes',
    evidenceKind: hermesEvidenceKindField(row),
  } as HermesEvidenceEvent
}

function toResultArtifact(row: RuntimeDocument): BusinessActionResultArtifact {
  const endpointDescriptorHash = optionalStringField(row, 'endpointDescriptorHash')
  const jsonSchemaHash = optionalStringField(row, 'jsonSchemaHash')
  const privateRefHash = optionalStringField(row, 'privateEndpointProvisioningPaymentGateRefHash')
  const labels = stringArrayField(row, 'supportingEvidenceLabels')
  const proofGapReason = optionalStringField(row, 'proofGapReason')
  return {
    id: stringField(row, 'artifactId') as BusinessActionResultArtifactId,
    requestId: stringField(row, 'requestId') as CapabilityRequestId,
    checkpointId: stringField(row, 'checkpointId') as AuthorizationCheckpointId,
    actionSlug: BusinessActionSlug,
    status: resultArtifactStatusField(row),
    ...(endpointDescriptorHash === undefined ? {} : { endpointDescriptorHash: brandNonEmpty(endpointDescriptorHash, 'SourceHash') }),
    ...(jsonSchemaHash === undefined ? {} : { jsonSchemaHash: brandNonEmpty(jsonSchemaHash, 'SourceHash') }),
    ...(privateRefHash === undefined
      ? {}
      : { privateEndpointProvisioningPaymentGateRefHash: brandNonEmpty(privateRefHash, 'SourceHash') }),
    ...(labels.length === 0 ? {} : { supportingEvidenceLabels: labels }),
    artifactHash: brandNonEmpty(stringField(row, 'artifactHash'), 'SourceHash'),
    idempotencyKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    recordedAt: numberField(row, 'recordedAt'),
    ...(proofGapReason === undefined ? {} : { proofGapReason }),
  }
}

function toReceipt(row: RuntimeDocument): ActionReceipt {
  const checkpointHash = optionalStringField(row, 'checkpointHash')
  const policyHash = optionalStringField(row, 'policyHash')
  const resultArtifactHash = optionalStringField(row, 'resultArtifactHash')
  const previousReceiptHash = optionalStringField(row, 'previousReceiptHash')
  return {
    id: stringField(row, 'receiptId') as ActionReceiptId,
    requestId: stringField(row, 'requestId') as CapabilityRequestId,
    actionSlug: BusinessActionSlug,
    outcome: receiptOutcomeField(row),
    cardHash: brandNonEmpty(stringField(row, 'cardHash'), 'SourceHash'),
    cardVersion: numberField(row, 'cardVersion'),
    mandateHash: brandNonEmpty(stringField(row, 'mandateHash'), 'SourceHash'),
    requestHash: brandNonEmpty(stringField(row, 'requestHash'), 'SourceHash'),
    ...(checkpointHash === undefined ? {} : { checkpointHash: brandNonEmpty(checkpointHash, 'SourceHash') }),
    ...(policyHash === undefined ? {} : { policyHash: brandNonEmpty(policyHash, 'SourceHash') }),
    externalEvidenceRefHashes: stringArrayField(row, 'externalEvidenceRefHashes').map((value) => brandNonEmpty(value, 'SourceHash')),
    guardrailEvidenceRefHashes: stringArrayField(row, 'guardrailEvidenceRefHashes').map((value) => brandNonEmpty(value, 'SourceHash')),
    ...(resultArtifactHash === undefined ? {} : { resultArtifactHash: brandNonEmpty(resultArtifactHash, 'SourceHash') }),
    ...(previousReceiptHash === undefined ? {} : { previousReceiptHash: brandNonEmpty(previousReceiptHash, 'SourceHash') }),
    signatureRefHash: brandNonEmpty(stringField(row, 'signatureRefHash'), 'SourceHash'),
    reconstructionStatus: receiptReconstructionStatusField(row),
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    idempotencyKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    recordedAt: numberField(row, 'recordedAt'),
  }
}

function toPrivateEvidenceRef(row: RuntimeDocument): BusinessActionPrivateEvidenceRef {
  const privatePayloadRef = optionalStringField(row, 'privatePayloadRef')
  const redactedAt = optionalNumberField(row, 'redactedAt')
  return {
    id: stringField(row, 'privateEvidenceRefId') as BusinessActionPrivateEvidenceRefId,
    requestId: stringField(row, 'requestId') as CapabilityRequestId,
    retentionClass: 'business_action_private_evidence',
    accessPolicy: 'owner_admin_operator_only',
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    ...(privatePayloadRef === undefined ? {} : { privatePayloadRef }),
    ttlExpiresAt: numberField(row, 'ttlExpiresAt'),
    ...(redactedAt === undefined ? {} : { redactedAt }),
  }
}

function toSupportRecord(row: RuntimeDocument): BusinessActionSupportRecord {
  return {
    id: stringField(row, 'supportRecordId') as BusinessActionSupportRecordId,
    actionSlug: BusinessActionSlug,
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    status: supportStatusField(row),
    reason: stringField(row, 'reason'),
    evidenceRefs: stringArrayField(row, 'evidenceRefs'),
    claimDisablePath: operatorControlField(row),
    operatorNextAction: stringField(row, 'operatorNextAction'),
    sourceHash: brandNonEmpty(stringField(row, 'sourceHash'), 'SourceHash'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

function toNoRepairRecord(row: RuntimeDocument): BusinessActionNoRepairRecord {
  return {
    id: stringField(row, 'noRepairId') as BusinessActionNoRepairId,
    requestId: stringField(row, 'requestId') as CapabilityRequestId,
    reason: stringField(row, 'reason'),
    evidenceRefs: stringArrayField(row, 'evidenceRefs'),
    noRepairHash: brandNonEmpty(stringField(row, 'noRepairHash'), 'SourceHash'),
    idempotencyKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    markedBy: stringField(row, 'markedBy'),
    markedAt: numberField(row, 'markedAt'),
  }
}

function cardStatusField(row: RuntimeDocument): BusinessActionCard['status'] {
  const value = stringField(row, 'status')
  return BusinessActionCardStatusValues.includes(value as BusinessActionCard['status'])
    ? (value as BusinessActionCard['status'])
    : 'disabled'
}

function mandateStatusField(row: RuntimeDocument): BuyerMandate['status'] {
  const value = stringField(row, 'status')
  return BuyerMandateStatusValues.includes(value as BuyerMandate['status']) ? (value as BuyerMandate['status']) : 'expired'
}

function requestStatusField(row: RuntimeDocument): CapabilityRequest['status'] {
  const value = stringField(row, 'status')
  return CapabilityRequestStatusValues.includes(value as CapabilityRequest['status'])
    ? (value as CapabilityRequest['status'])
    : 'proof_gap'
}

function checkpointDecisionField(row: RuntimeDocument): AuthorizationCheckpoint['decision'] {
  const value = stringField(row, 'decision')
  return AuthorizationCheckpointDecisionValues.includes(value as AuthorizationCheckpoint['decision'])
    ? (value as AuthorizationCheckpoint['decision'])
    : 'proof_gap'
}

function guardrailProviderField(row: RuntimeDocument): GuardrailDecisionEvidence['provider'] {
  const value = stringField(row, 'provider')
  return BusinessActionGuardrailProviderValues.includes(value as GuardrailDecisionEvidence['provider'])
    ? (value as GuardrailDecisionEvidence['provider'])
    : 'nemo_guardrails'
}

function guardrailDecisionField(row: RuntimeDocument): GuardrailDecisionEvidence['decision'] {
  const value = stringField(row, 'decision')
  return BusinessActionGuardrailDecisionValues.includes(value as GuardrailDecisionEvidence['decision'])
    ? (value as GuardrailDecisionEvidence['decision'])
    : 'refusal'
}

function evidenceProviderField(row: RuntimeDocument): ExternalEvidenceEvent['provider'] {
  const value = stringField(row, 'provider')
  return BusinessActionExternalEvidenceProviderValues.includes(value as ExternalEvidenceEvent['provider'])
    ? (value as ExternalEvidenceEvent['provider'])
    : 'endpoint_host'
}

function evidenceStatusField(row: RuntimeDocument): ExternalEvidenceEvent['status'] {
  const value = stringField(row, 'status')
  return BusinessActionExternalEvidenceStatusValues.includes(value as ExternalEvidenceEvent['status'])
    ? (value as ExternalEvidenceEvent['status'])
    : 'held_for_operator'
}

function hermesEvidenceKindField(row: RuntimeDocument): HermesEvidenceEvent['evidenceKind'] {
  const value = stringField(row, 'evidenceKind')
  return HermesEvidenceKindValues.includes(value as HermesEvidenceEvent['evidenceKind'])
    ? (value as HermesEvidenceEvent['evidenceKind'])
    : 'report'
}

function resultArtifactStatusField(row: RuntimeDocument): BusinessActionResultArtifact['status'] {
  return stringField(row, 'status') === 'complete' ? 'complete' : 'proof_gap'
}

function receiptOutcomeField(row: RuntimeDocument): ActionReceipt['outcome'] {
  const value = stringField(row, 'outcome')
  return ActionReceiptOutcomeValues.includes(value as ActionReceipt['outcome']) ? (value as ActionReceipt['outcome']) : 'proof_gap'
}

function receiptReconstructionStatusField(row: RuntimeDocument): ActionReceipt['reconstructionStatus'] {
  const value = stringField(row, 'reconstructionStatus')
  return ReceiptReconstructionStatusValues.includes(value as ActionReceipt['reconstructionStatus'])
    ? (value as ActionReceipt['reconstructionStatus'])
    : 'proof_gap'
}

function supportStatusField(row: RuntimeDocument): BusinessActionSupportRecord['status'] {
  const value = stringField(row, 'status')
  return BusinessActionSupportStatusValues.includes(value as BusinessActionSupportRecord['status'])
    ? (value as BusinessActionSupportRecord['status'])
    : 'open'
}

function operatorControlField(row: RuntimeDocument): BusinessActionSupportRecord['claimDisablePath'] {
  const value = stringField(row, 'claimDisablePath')
  return BusinessActionOperatorControlKeyValues.includes(value as BusinessActionSupportRecord['claimDisablePath'])
    ? (value as BusinessActionSupportRecord['claimDisablePath'])
    : 'business_actions_enabled'
}

function requestedByField(row: RuntimeDocument): CapabilityRequest['requestedBy'] {
  const value = stringField(row, 'requestedBy')
  return value === 'buyer' || value === 'operator' ? value : 'hermes'
}

function currencyField(row: RuntimeDocument): BusinessActionCurrency | undefined {
  const value = stringField(row, 'currency')
  return value === 'aud' || value === 'usd' ? value : undefined
}

function isHermesEvidenceEvent(event: ExternalEvidenceEvent): event is HermesEvidenceEvent {
  return event.provider === 'hermes' && 'evidenceKind' in event
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

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const id = key(value)
    if (seen.has(id)) {
      return false
    }
    seen.add(id)
    return true
  })
}
