import type { RuntimeDb, RuntimeDocument } from './source_state'
import { brandNonEmpty } from '../src/modules/common/ids'
import type { CorrelationId, SourceHash } from '../src/modules/common/ids'
import { stableHash } from '../src/modules/common/stable-hash'
import type { AuditEventContract, RedactedPayload } from '../src/modules/observability/public'
import {
  ContactFollowUpActionSlug,
  ContactFollowUpAttemptOutcomeValues,
  ContactFollowUpDecisionValues,
  ContactFollowUpPolicyKindValues,
  createEmptyContactFollowUpSourceState,
} from '../src/modules/protected-action/public'
import type {
  ContactFollowUpAttempt,
  ContactFollowUpAttemptId,
  ContactFollowUpDecisionId,
  ContactFollowUpGatewayAdmission,
  ContactFollowUpGatewayAdmissionId,
  ContactFollowUpNoRepairId,
  ContactFollowUpNoRepairRecord,
  ContactFollowUpOwnerDecisionRecord,
  ContactFollowUpPolicyDecision,
  ContactFollowUpPolicyHints,
  ContactFollowUpPolicyId,
  ContactFollowUpPrivateEvidenceRef,
  ContactFollowUpPrivateEvidenceRefId,
  ContactFollowUpProposal,
  ContactFollowUpProposalId,
  ContactFollowUpReceipt,
  ContactFollowUpReceiptId,
  ContactFollowUpSourceState,
  ContactFollowUpSupportRecord,
} from '../src/modules/protected-action/public'

type EqFilter = { field: string; value: unknown }

const proposalStatuses: readonly ContactFollowUpProposal['status'][] = ['proposed', 'approved', 'rejected', 'attempted']

export async function loadContactFollowUpProposalSlice(
  db: RuntimeDb,
  proposalId: string
): Promise<ContactFollowUpSourceState> {
  const proposal = await firstByIndex(db, 'protectedActionProposals', 'by_proposalId', [
    { field: 'proposalId', value: proposalId },
  ])
  return loadContactFollowUpStateForProposalRows(db, proposal === null ? [] : [proposal])
}

export async function loadContactFollowUpProposalSliceByIdempotencyKey(
  db: RuntimeDb,
  operationKey: string
): Promise<ContactFollowUpSourceState> {
  const proposal = await firstByIndex(db, 'protectedActionProposals', 'by_idempotencyKey', [
    { field: 'idempotencyKey', value: operationKey },
  ])
  return loadContactFollowUpStateForProposalRows(db, proposal === null ? [] : [proposal])
}

export async function loadOwnerContactFollowUpQueueSlice(
  db: RuntimeDb,
  ownerId: string
): Promise<ContactFollowUpSourceState> {
  const proposals = (
    await Promise.all(
      proposalStatuses.map((status) =>
        collectByIndex(db, 'protectedActionProposals', 'by_owner_status', [
          { field: 'ownerId', value: ownerId },
          { field: 'status', value: status },
        ])
      )
    )
  ).flat()

  return loadContactFollowUpStateForProposalRows(db, proposals)
}

export async function loadAdminContactFollowUpSlice(
  db: RuntimeDb,
  filter: { proposalId?: string | undefined }
): Promise<ContactFollowUpSourceState> {
  if (filter.proposalId !== undefined && filter.proposalId.trim().length > 0) {
    return loadContactFollowUpProposalSlice(db, filter.proposalId.trim())
  }

  return loadContactFollowUpStateForProposalRows(db, await collect(db, 'protectedActionProposals'))
}

export async function persistContactFollowUpSlice(db: RuntimeDb, state: ContactFollowUpSourceState): Promise<void> {
  for (const proposal of state.proposals) {
    await upsertByIndexedLookup(
      db,
      'protectedActionProposals',
      'by_proposalId',
      [{ field: 'proposalId', value: proposal.id }],
      (row) => stringField(row, 'proposalId') === proposal.id,
      {
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
      }
    )
  }

  for (const policy of state.policyDecisions) {
    await upsertByIndexedLookup(
      db,
      'protectedActionPolicyDecisions',
      'by_policyHash',
      [{ field: 'policyHash', value: policy.policyHash }],
      (row) => stringField(row, 'policyId') === policy.id,
      {
        policyId: policy.id,
        proposalId: policy.proposalId,
        selectedActionSlug: ContactFollowUpActionSlug,
        kind: policy.kind,
        reason: policy.reason,
        proposalHash: policy.proposalHash,
        policyHash: policy.policyHash,
        correlationId: proposalCorrelationId(state, policy.proposalId),
        evaluatedAt: policy.evaluatedAt,
      }
    )
  }

  for (const decision of state.ownerDecisions) {
    await upsertByIndexedLookup(
      db,
      'protectedActionOwnerDecisions',
      'by_idempotencyKey',
      [{ field: 'idempotencyKey', value: decision.idempotencyKey }],
      (row) => stringField(row, 'decisionId') === decision.id,
      {
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
      }
    )
  }

  for (const gateway of state.gatewayAdmissions) {
    await upsertByIndexedLookup(
      db,
      'protectedActionGatewayAdmissions',
      'by_gatewayAdmissionId',
      [{ field: 'gatewayAdmissionId', value: gateway.id }],
      (row) => stringField(row, 'gatewayAdmissionId') === gateway.id,
      {
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
      }
    )
  }

  for (const attempt of state.attempts) {
    await upsertByIndexedLookup(
      db,
      'protectedActionAttempts',
      'by_attemptId',
      [{ field: 'attemptId', value: attempt.id }],
      (row) => stringField(row, 'attemptId') === attempt.id,
      {
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
      }
    )
  }

  for (const receipt of state.receipts) {
    await upsertByIndexedLookup(
      db,
      'protectedActionReceipts',
      'by_receiptId',
      [{ field: 'receiptId', value: receipt.id }],
      (row) => stringField(row, 'receiptId') === receipt.id,
      {
        receiptId: receipt.id,
        proposalId: receipt.proposalId,
        attemptId: receipt.attemptId,
        selectedActionSlug: ContactFollowUpActionSlug,
        kind: receipt.kind,
        providerBoundary: receipt.providerBoundary,
        payloadHash: receipt.payloadHash,
        redactedReadbackJson: JSON.stringify(receipt.redactedReadback),
        recordedAt: receipt.recordedAt,
      }
    )
  }

  for (const privateEvidenceRef of state.privateEvidenceRefs) {
    await upsertByIndexedLookup(
      db,
      'protectedActionPrivateEvidenceRefs',
      'by_privateEvidenceRefId',
      [{ field: 'privateEvidenceRefId', value: privateEvidenceRef.id }],
      (row) => stringField(row, 'privateEvidenceRefId') === privateEvidenceRef.id,
      {
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
      }
    )
  }

  for (const noRepair of state.noRepairRecords) {
    await upsertByIndexedLookup(
      db,
      'protectedActionNoRepairRecords',
      'by_noRepairId',
      [{ field: 'noRepairId', value: noRepair.id }],
      (row) => stringField(row, 'noRepairId') === noRepair.id,
      {
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
      }
    )
  }

  for (const auditEvent of state.auditEvents) {
    await upsertAuditEvent(db, auditEvent)
    await upsertProtectedActionOperation(db, auditEvent)
  }
}

async function loadContactFollowUpStateForProposalRows(
  db: RuntimeDb,
  proposalRows: readonly RuntimeDocument[]
): Promise<ContactFollowUpSourceState> {
  const proposals = proposalRows.map(toProposal)
  if (proposals.length === 0) {
    return createEmptyContactFollowUpSourceState()
  }

  const [policies, decisions, gateways, attempts, receipts, privateEvidenceRefs, noRepairRecords, supportRecords] =
    await Promise.all([
      collectForProposalIds(db, 'protectedActionPolicyDecisions', 'by_proposal', proposals),
      collectForProposalIds(db, 'protectedActionOwnerDecisions', 'by_proposal', proposals),
      collectForProposalIds(db, 'protectedActionGatewayAdmissions', 'by_proposal_status', proposals),
      collectForProposalIds(db, 'protectedActionAttempts', 'by_proposal', proposals),
      collectForProposalIds(db, 'protectedActionReceipts', 'by_proposal', proposals),
      collectForProposalIds(db, 'protectedActionPrivateEvidenceRefs', 'by_proposal', proposals),
      collectForProposalIds(db, 'protectedActionNoRepairRecords', 'by_proposal', proposals),
      collectByIndex(db, 'protectedActionSupportRecords', 'by_selectedActionSlug', [
        { field: 'selectedActionSlug', value: ContactFollowUpActionSlug },
      ]),
    ])

  const stateWithoutAudit = createEmptyContactFollowUpSourceState({
    proposals,
    policyDecisions: policies.map(toPolicyDecision),
    ownerDecisions: decisions.map(toOwnerDecision),
    gatewayAdmissions: gateways.map(toGatewayAdmission),
    attempts: attempts.map(toAttempt),
    receipts: receipts.map(toReceipt),
    privateEvidenceRefs: privateEvidenceRefs.map(toPrivateEvidenceRef),
    noRepairRecords: noRepairRecords.map(toNoRepairRecord),
    supportRecords: supportRecords.map(toSupportRecord),
  })

  return {
    ...stateWithoutAudit,
    auditEvents: await loadAuditEventsForState(db, stateWithoutAudit),
  }
}

async function collectForProposalIds(
  db: RuntimeDb,
  tableName: string,
  indexName: string,
  proposals: readonly ContactFollowUpProposal[]
): Promise<RuntimeDocument[]> {
  return (
    await Promise.all(
      proposals.map((proposal) =>
        collectByIndex(db, tableName, indexName, [{ field: 'proposalId', value: proposal.id }])
      )
    )
  ).flat()
}

async function loadAuditEventsForState(db: RuntimeDb, state: ContactFollowUpSourceState): Promise<AuditEventContract[]> {
  const correlationIds = uniqueStrings([
    ...state.proposals.map((proposal) => proposal.correlationId),
    ...state.ownerDecisions.map((decision) => decision.correlationId),
    ...state.gatewayAdmissions.map((gateway) => gateway.correlationId),
    ...state.attempts.map((attempt) => attempt.correlationId),
    ...state.noRepairRecords.map((record) => record.correlationId),
  ])
  const targetRefs = new Set<string>([
    ...state.proposals.map((proposal) => proposal.id),
    ...state.gatewayAdmissions.map((gateway) => gateway.id),
    ...state.attempts.map((attempt) => attempt.id),
  ])
  const rows = (
    await Promise.all(
      correlationIds.map((correlationId) =>
        collectByIndex(db, 'auditEvents', 'by_correlationId', [{ field: 'correlationId', value: correlationId }])
      )
    )
  ).flat()

  return uniqueBy(
    rows
      .map(toAuditEvent)
      .filter(isDefined)
      .filter((event) => targetRefs.has(event.targetRef)),
    (event) => event.eventId
  )
}

async function upsertAuditEvent(db: RuntimeDb, auditEvent: AuditEventContract): Promise<void> {
  await upsertByIndexedLookup(
    db,
    'auditEvents',
    'by_correlationId',
    [{ field: 'correlationId', value: auditEvent.correlationId }],
    (row) => stringField(row, 'eventId') === auditEvent.eventId,
    {
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
    }
  )
}

async function upsertProtectedActionOperation(db: RuntimeDb, auditEvent: AuditEventContract): Promise<void> {
  const operationName = operationNameForAudit(auditEvent.eventType)
  await upsertByIndexedLookup(
    db,
    'operationKeys',
    'by_actor_operation_key',
    [
      { field: 'actorRef', value: auditEvent.actorRef },
      { field: 'operationName', value: operationName },
      { field: 'key', value: auditEvent.idempotencyKey },
    ],
    (row) => stringField(row, 'scope') === 'protected_action',
    {
      scope: 'protected_action',
      actorKind: auditEvent.actorKind,
      actorRef: auditEvent.actorRef,
      operationName,
      key: auditEvent.idempotencyKey,
      requestHash: auditEvent.payloadHash,
      sourceHash: auditEvent.targetRef,
      status: 'succeeded',
      resultHash: stableHash({ eventType: auditEvent.eventType, targetRef: auditEvent.targetRef }),
      effectRefs: [`event:${auditEvent.eventType}`, `target:${auditEvent.targetRef}`],
      createdAt: auditEvent.createdAt,
      updatedAt: auditEvent.createdAt,
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
  if (eventType === 'protected_action.disputed') return 'recordContactFollowUpDispute'
  if (eventType === 'protected_action.reversed') return 'recordContactFollowUpReversal'
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
