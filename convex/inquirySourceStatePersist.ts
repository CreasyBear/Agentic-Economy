import type { GenericDatabaseWriter } from 'convex/server'
import type { DataModel, Doc } from './_generated/dataModel'
import {
  encryptGovernedSendReceipt,
  resolveInquiryReceiptKeyring,
} from '../src/modules/inquiries/public'
import type {
  GovernedSendErasureLineageRecord,
  GovernedSendIntegrityCommitmentRecord,
  GovernedSendReceiptRecord,
  InquiryAuditRecord,
  InquiryFunnelRecord,
  InquiryOperationRecord,
  InquirySourceState,
} from '../src/modules/inquiries/public'
import type { InquirySourceDocument } from './inquirySourceStateMappers'
import { brandNonEmpty, type ServiceId } from '../src/modules/common/ids'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { stableStringify } from '../src/modules/common/stable-hash'
import {
  operationNameForResult,
  redactedJson,
  requiredNumber,
  requiredString,
  requiredStringArray,
  toGovernedSendErasureLineageRecord,
  toGovernedSendIntegrityCommitmentRecord,
  toGovernedSendReceiptRecord,
  toInquiryThreadRecord,
} from './inquirySourceStateMappers'

export async function persistInquirySourceState(db: GenericDatabaseWriter<DataModel>, state: InquirySourceState): Promise<void> {
  for (const bucket of state.abuseRateLimitBuckets.filter((candidate) => candidate.scope === 'inquiry_submit')) {
    const patch = {
      key: bucket.key,
      window: bucket.window,
      count: bucket.count,
      state: bucket.state === 'blocked' ? 'limited' as const : bucket.state,
      resetAt: bucket.resetAt,
      updatedAt: bucket.updatedAt,
    }
    const existing = await db.query('inquiryAbuseBuckets')
      .withIndex('by_key_window', (query) => query.eq('key', patch.key).eq('window', patch.window))
      .unique()
    if (existing === null) await db.insert('inquiryAbuseBuckets', patch)
    else await db.patch(existing._id, patch)
  }

  for (const thread of state.threads) {
    const shared = {
      threadId: thread.threadId,
      businessId: requireBusinessId(db, thread.businessId),
      ownerId: requireOwnerId(db, thread.ownerId),
      status: thread.status,
      firstMessageId: thread.firstMessageId,
      sourceHash: thread.sourceHash,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      version: thread.version,
      ...(thread.customerReplyEmail === undefined ? {} : { customerReplyEmail: thread.customerReplyEmail }),
      ...(thread.readAt === undefined ? {} : { readAt: thread.readAt }),
      ...(thread.repliedAt === undefined ? {} : { repliedAt: thread.repliedAt }),
      ...(thread.closedAt === undefined ? {} : { closedAt: thread.closedAt }),
      ...(thread.origin === undefined ? {} : { originKind: thread.origin.kind, originThreadId: thread.origin.threadId }),
    }
    const existing = await db.query('inquiryThreads').withIndex('by_threadId', (query) => query.eq('threadId', shared.threadId)).unique()
    if (existing !== null) {
      const existingRecord = toInquiryThreadRecord(existing)
      if (('offeringRef' in existingRecord) !== ('offeringRef' in thread)) {
        throw new Error('inquiry_thread_target_shape_conflict')
      }
    }
    const patch = thread.offeringRef !== undefined
      ? { ...shared, offeringRef: thread.offeringRef }
      : {
          ...shared,
          ...requirePersistedLegacyThreadIdentity(existing, {
            serviceId: thread.serviceId,
            capabilityKind: thread.capabilityKind,
          }),
        }
    if (existing === null) await db.insert('inquiryThreads', patch)
    else await db.patch(existing._id, patch)
  }

  for (const grant of state.customerAccessGrants) {
    const patch = {
      accessId: grant.accessId,
      threadId: grant.threadId,
      scope: grant.scope,
      version: grant.version,
      verifier: grant.verifier,
      keyId: grant.keyId,
      status: grant.status,
      createdAt: grant.createdAt,
      expiresAt: grant.expiresAt,
      ...(grant.revokedAt === undefined ? {} : { revokedAt: grant.revokedAt }),
    }
    const existing = await db.query('inquiryCustomerAccessGrants').withIndex('by_accessId', (query) => query.eq('accessId', patch.accessId)).unique()
    if (existing === null) await db.insert('inquiryCustomerAccessGrants', patch)
    else await db.patch(existing._id, patch)
  }

  for (const message of state.messages) {
    const patch = {
      messageId: message.messageId,
      threadId: message.threadId,
      sender: message.sender,
      body: message.body,
      bodyHash: message.bodyHash,
      ...(message.contactHash === undefined ? {} : { contactHash: message.contactHash }),
      ...(message.redactedContact === undefined ? {} : { redactedContact: redactedJson(message.redactedContact) }),
      ...(message.privateDeletedAt === undefined ? {} : { privateDeletedAt: message.privateDeletedAt }),
      createdAt: message.createdAt,
    }
    const existing = await db.query('inquiryMessages').withIndex('by_messageId', (query) => query.eq('messageId', patch.messageId)).unique()
    if (existing === null) await db.insert('inquiryMessages', patch)
    else await db.patch(existing._id, patch)
  }

  for (const notification of state.notifications) {
    const patch = {
      notificationId: notification.notificationId,
      threadId: notification.threadId,
      messageId: notification.messageId,
      recipientRole: notification.recipientRole,
      status: notification.status,
      redactedPayload: redactedJson(notification.redactedPayload),
      ...(notification.failureCode === undefined ? {} : { failureCode: notification.failureCode }),
      dispatchBindingsJson: JSON.stringify(notification.dispatchBindings),
      dispatchIds: notification.dispatchBindings.map((binding) => binding.dispatchId),
      providerFamilies: notification.dispatchBindings.map((binding) => binding.providerFamily),
      dispatchStatuses: notification.dispatchBindings.map((binding) => binding.status),
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    }
    const existing = await db.query('inquiryNotifications').withIndex('by_notificationId', (query) => query.eq('notificationId', patch.notificationId)).unique()
    if (existing === null) await db.insert('inquiryNotifications', patch)
    else await db.patch(existing._id, patch)
  }

  for (const tombstone of state.privacyTombstones) {
    const patch = {
      threadId: tombstone.threadId,
      businessId: requireBusinessId(db, tombstone.businessId),
      reasonCode: tombstone.reasonCode,
      status: tombstone.status,
      operationKey: tombstone.operationKey,
      correlationId: tombstone.correlationId,
      createdAt: tombstone.createdAt,
      ...(tombstone.appliedAt === undefined ? {} : { appliedAt: tombstone.appliedAt }),
      receiptErasureCount: tombstone.receiptErasureCount,
      erasureEventIds: [...tombstone.erasureEventIds],
    }
    const existing = await db.query('inquiryPrivacyTombstones')
      .withIndex('by_thread_operationKey', (query) => query.eq('threadId', patch.threadId).eq('operationKey', patch.operationKey))
      .unique()
    if (existing === null) await db.insert('inquiryPrivacyTombstones', patch)
    else await db.patch(existing._id, patch)
  }

  for (const receipt of state.governedSendReceipts) {
    const lineage = state.governedSendErasureLineage.find((candidate) => candidate.receiptOperationKey === receipt.operationKey)
    await persistGovernedSendReceipt(db, receipt, lineage)
  }
  for (const commitment of state.governedSendIntegrityCommitments) await persistGovernedSendIntegrityCommitment(db, commitment)

  const auditEventsByOperationKey = new Map(state.auditEvents.map((auditEvent) => [auditEvent.operationKey, auditEvent] as const))
  for (const operation of state.operations) await upsertInquiryOperation(db, operation, auditEventsByOperationKey.get(operation.operationKey))
  for (const auditEvent of state.auditEvents) await upsertAuditEvent(db, auditEvent)
  for (const funnelEvent of state.funnelEvents) await upsertFunnelEvent(db, funnelEvent)
}

async function upsertInquiryOperation(db: GenericDatabaseWriter<DataModel>, operation: InquiryOperationRecord, auditEvent: InquiryAuditRecord | undefined): Promise<void> {
  const patch = {
    scope: 'inquiry',
    actorKind: auditEvent?.actorKind ?? 'system',
    actorRef: auditEvent?.actorRef ?? 'system:inquiry',
    operationName: operationNameForResult(operation.resultCode),
    key: operation.operationKey,
    requestHash: operation.requestHash,
    ...(operation.threadId === undefined ? {} : { sourceHash: operation.threadId }),
    status: 'succeeded' as const,
    resultHash: canonicalDigest({ resultCode: operation.resultCode }),
    effectRefs: [
      `result:${operation.resultCode}`,
      ...(operation.threadId === undefined ? [] : [`thread:${operation.threadId}`]),
      ...(operation.messageId === undefined ? [] : [`message:${operation.messageId}`]),
      ...(operation.notificationId === undefined ? [] : [`notification:${operation.notificationId}`]),
    ],
    createdAt: operation.createdAt,
    updatedAt: operation.createdAt,
  }
  const existingRows = await db.query('operationKeys').withIndex('by_scope_key', (query) => query.eq('scope', patch.scope).eq('key', patch.key)).take(1)
  const existing = existingRows[0]
  if (existing === undefined) await db.insert('operationKeys', patch)
  else await db.patch(existing._id, patch)
}

export async function repairGovernedSendErasureKeys(db: GenericDatabaseWriter<DataModel>, threadId: string): Promise<void> {
  const lineageRows = await db.query('governedSendErasureLineage').withIndex('by_thread_destroyedAt', (query) => query.eq('threadId', threadId)).take(20)
  for (const lineageRow of lineageRows) {
    const lineage = toGovernedSendErasureLineageRecord(lineageRow)
    if (lineageRows.filter((candidate) => requiredString(candidate, 'receiptOperationKey', 'inquiry_persist') === String(lineage.receiptOperationKey)).length !== 1) throw new Error('governed_send_erasure_lineage_duplicate_rows')
    const keyRows = await db.query('governedSendReceiptKeys').withIndex('by_keyRef', (query) => query.eq('keyRef', lineage.keyRef)).take(2)
    if (keyRows.length > 1) throw new Error('governed_send_receipt_key_duplicate_rows')
    const key = keyRows[0]
    if (key === undefined) continue
    const receiptRows = await db.query('governedSendReceipts').withIndex('by_operationKey', (query) => query.eq('operationKey', lineage.receiptOperationKey)).take(2)
    if (receiptRows.length !== 1 || receiptRows[0] === undefined) throw new Error('governed_send_receipt_conflict')
    if (db.delete === undefined) throw new Error('inquiry_source_delete_unavailable')
    await db.delete(key._id)
  }
}

async function assertGovernedSendLineageAuthority(db: GenericDatabaseWriter<DataModel>, receipt: InquirySourceDocument, lineage: GovernedSendErasureLineageRecord): Promise<void> {
  const tombstoneRows = await db.query('inquiryPrivacyTombstones').withIndex('by_thread_operationKey', (query) => query.eq('threadId', lineage.threadId).eq('operationKey', lineage.privacyOperationKey)).take(2)
  if (tombstoneRows.length !== 1 || tombstoneRows[0] === undefined) throw new Error('governed_send_erasure_lineage_conflict')
  const tombstone = tombstoneRows[0]
  const erasureEventIds = requiredStringArray(tombstone, 'erasureEventIds', 'inquiry_persist')
  const appliedAt = tombstone.appliedAt === undefined ? undefined : requiredNumber(tombstone, 'appliedAt', 'inquiry_persist')
  const receiptOperationKey = requiredString(receipt, 'operationKey', 'inquiry_persist')
  const receiptThreadId = requiredString(receipt, 'threadId', 'inquiry_persist')
  const receiptDigest = requiredString(receipt, 'digest', 'inquiry_persist')
  const receiptKeyRef = requiredString(receipt, 'keyRef', 'inquiry_persist')
  const receiptSchemaVersion = requiredNumber(receipt, 'schemaVersion', 'inquiry_persist')
  const receiptRecipientRef = requiredString(receipt, 'recipientRef', 'inquiry_persist')
  if (requiredString(tombstone, 'status', 'inquiry_persist') !== 'applied' || new Set(erasureEventIds).size !== erasureEventIds.length || appliedAt === undefined || requiredNumber(tombstone, 'receiptErasureCount', 'inquiry_persist') !== erasureEventIds.length || !erasureEventIds.includes(lineage.erasureEventId)) throw new Error('governed_send_erasure_lineage_conflict')
  const material = {
    erasureEventId: `governed-send-erasure:${canonicalDigest({ receiptOperationKey, privacyOperationKey: lineage.privacyOperationKey, keyRef: receiptKeyRef })}`,
    receiptOperationKey: brandNonEmpty(receiptOperationKey, 'OperationKey'),
    privacyOperationKey: brandNonEmpty(requiredString(tombstone, 'operationKey', 'inquiry_persist'), 'OperationKey'),
    threadId: brandNonEmpty(receiptThreadId, 'InquiryThreadId'),
    digest: receiptDigest,
    keyRef: receiptKeyRef,
    reasonCode: requiredString(tombstone, 'reasonCode', 'inquiry_persist'),
    destroyedAt: appliedAt,
    priorReceiptCommitment: canonicalDigest({ operationKey: receiptOperationKey, threadId: receiptThreadId, digest: receiptDigest, schemaVersion: receiptSchemaVersion, recipientRef: receiptRecipientRef, keyRef: receiptKeyRef }),
  }
  if (stableStringify({ ...material, lineageHash: canonicalDigest(material) }) !== stableStringify(lineage)) throw new Error('governed_send_erasure_lineage_conflict')
}

async function persistGovernedSendReceipt(db: GenericDatabaseWriter<DataModel>, receipt: GovernedSendReceiptRecord, lineage: GovernedSendErasureLineageRecord | undefined): Promise<void> {
  const existingRows = await db.query('governedSendReceipts').withIndex('by_operationKey', (query) => query.eq('operationKey', receipt.operationKey)).take(2)
  if (existingRows.length > 1) throw new Error('governed_send_receipt_duplicate_rows')
  const existing = existingRows[0]
  if (existing === undefined) {
    if (receipt.retention !== 'recoverable') throw new Error('Cannot persist erased governed-send metadata without its immutable receipt.')
    const encrypted = await encryptGovernedSendReceipt(receipt, resolveInquiryReceiptKeyring(process.env))
    await db.insert('governedSendReceipts', { ...encrypted.payload, digest: receipt.digest, algorithm: receipt.algorithm, schemaVersion: receipt.schemaVersion, createdAt: receipt.createdAt, operationKey: receipt.operationKey, threadId: receipt.threadId, admissionProof: receipt.admissionProof, recipientRef: receipt.recipientRef })
    await db.insert('governedSendReceiptKeys', encrypted.wrappedKey)
    return
  }
  const existingKeyRef = requiredString(existing, 'keyRef', 'inquiry_persist')
  if (receipt.retention === 'recoverable') {
    const keyRows = await db.query('governedSendReceiptKeys').withIndex('by_keyRef', (query) => query.eq('keyRef', existingKeyRef)).take(2)
    if (keyRows.length !== 1) throw new Error('governed_send_receipt_conflict')
    const recovered = await toGovernedSendReceiptRecord(existing, keyRows, [], resolveInquiryReceiptKeyring(process.env))
    if (recovered === undefined || stableStringify(recovered) !== stableStringify(receipt)) throw new Error('governed_send_receipt_conflict')
    return
  }
  if (lineage === undefined || lineage.keyRef !== existingKeyRef) throw new Error('Governed-send erasure lineage does not match the persisted receipt key.')
  const { lineageHash, ...lineageMaterial } = lineage
  if (lineageHash !== canonicalDigest(lineageMaterial)) throw new Error('governed_send_erasure_lineage_conflict')
  await assertGovernedSendLineageAuthority(db, existing, lineage)
  const existingLineageRows = await db.query('governedSendErasureLineage').withIndex('by_erasureEventId', (query) => query.eq('erasureEventId', lineage.erasureEventId)).take(2)
  if (existingLineageRows.length > 1) throw new Error('governed_send_erasure_lineage_duplicate_rows')
  const existingLineage = existingLineageRows[0]
  if (existingLineage !== undefined && stableStringify(toGovernedSendErasureLineageRecord(existingLineage)) !== stableStringify(lineage)) throw new Error('governed_send_erasure_lineage_conflict')
  const wrappedKeyRows = await db.query('governedSendReceiptKeys').withIndex('by_keyRef', (query) => query.eq('keyRef', lineage.keyRef)).take(2)
  if (wrappedKeyRows.length > 1) throw new Error('governed_send_receipt_key_duplicate_rows')
  const wrappedKey = wrappedKeyRows[0]
  if (wrappedKey !== undefined) {
    if (db.delete === undefined) throw new Error('inquiry_source_delete_unavailable')
    await db.delete(wrappedKey._id)
  }
  if (existingLineage === undefined) await db.insert('governedSendErasureLineage', { ...lineage })
}
async function persistGovernedSendIntegrityCommitment(db: GenericDatabaseWriter<DataModel>, commitment: GovernedSendIntegrityCommitmentRecord): Promise<void> {
  const rows = await db.query('governedSendIntegrityCommitments').withIndex('by_operationKey', (query) => query.eq('operationKey', commitment.operationKey)).take(2)
  if (rows.length > 1) throw new Error('governed_send_commitment_duplicate_rows')
  const existing = rows[0]
  const targetBinding = 'offeringRef' in commitment.targetBinding
    ? {
        businessId: requireBusinessId(db, commitment.targetBinding.businessId),
        ownerId: requireOwnerId(db, commitment.targetBinding.ownerId),
        offeringRef: commitment.targetBinding.offeringRef,
        claimRef: commitment.targetBinding.claimRef,
        recipientRef: commitment.targetBinding.recipientRef,
      }
    : {
        businessId: requireBusinessId(db, commitment.targetBinding.businessId),
        ownerId: requireOwnerId(db, commitment.targetBinding.ownerId),
        ...requirePersistedLegacyCommitmentIdentity(existing, commitment.targetBinding),
        claimRef: commitment.targetBinding.claimRef,
        recipientRef: commitment.targetBinding.recipientRef,
      }
  if (existing === undefined) {
    await db.insert('governedSendIntegrityCommitments', { version: commitment.version, receiptRef: commitment.receiptRef, operationKey: commitment.operationKey, threadId: commitment.threadId, digest: commitment.digest, keyId: commitment.keyId, targetBinding, signature: commitment.signature, createdAt: commitment.createdAt })
    return
  }
  if (stableStringify(toGovernedSendIntegrityCommitmentRecord(existing)) !== stableStringify(commitment)) throw new Error('governed_send_commitment_conflict')
}

async function upsertAuditEvent(db: GenericDatabaseWriter<DataModel>, auditEvent: InquiryAuditRecord): Promise<void> {
  const eventId = `audit:${canonicalDigest({ eventType: auditEvent.eventType, operationKey: auditEvent.operationKey, targetRef: auditEvent.targetRef })}`
  const patch = { eventId, eventType: auditEvent.eventType, actorKind: auditEvent.actorKind, actorRef: auditEvent.actorRef, ...(auditEvent.businessId === undefined ? {} : { businessId: requireBusinessId(db, auditEvent.businessId) }), targetType: auditEvent.targetType, targetRef: auditEvent.targetRef, ...(auditEvent.beforeState === undefined ? {} : { beforeState: auditEvent.beforeState }), ...(auditEvent.afterState === undefined ? {} : { afterState: auditEvent.afterState }), idempotencyKey: auditEvent.operationKey, correlationId: auditEvent.correlationId, evidenceRefs: [], redactedPayloadJson: JSON.stringify(auditEvent.redactedPayload), payloadHash: auditEvent.payloadHash, createdAt: auditEvent.createdAt }
  const existing = await db.query('auditEvents').withIndex('by_eventId', (query) => query.eq('eventId', eventId)).unique()
  if (existing === null) await db.insert('auditEvents', patch)
  else await db.patch(existing._id, patch)
}

async function upsertFunnelEvent(db: GenericDatabaseWriter<DataModel>, funnelEvent: InquiryFunnelRecord): Promise<void> {
  const patch = { eventType: funnelEvent.eventType, source: 'inquiry', stage: 'published' as const, pseudonymousSessionId: funnelEvent.pseudonymousSessionId, ...(funnelEvent.businessId === undefined ? {} : { businessId: requireBusinessId(db, funnelEvent.businessId) }), redactedPayloadJson: JSON.stringify(funnelEvent.redactedPayload), consentFlag: true, correlationId: funnelEvent.correlationId, createdAt: funnelEvent.createdAt }
  const existingRows = await db.query('funnelEvents').withIndex('by_eventType_business_correlation_createdAt', (query) => query.eq('eventType', patch.eventType).eq('businessId', patch.businessId).eq('correlationId', patch.correlationId).eq('createdAt', patch.createdAt)).take(1)
  const existing = existingRows[0]
  if (existing === undefined) await db.insert('funnelEvents', patch)
  else await db.patch(existing._id, patch)
}

function requirePersistedLegacyThreadIdentity(
  existing: Doc<'inquiryThreads'> | null,
  incoming: { serviceId: ServiceId; capabilityKind: string },
) {
  if (existing === null || !('serviceId' in existing)) {
    throw new Error('inquiry_legacy_service_id_unavailable')
  }
  if (String(existing.serviceId) !== String(incoming.serviceId) || existing.capabilityKind !== incoming.capabilityKind) {
    throw new Error('inquiry_legacy_target_conflict')
  }
  return {
    serviceId: existing.serviceId,
    capabilityKind: existing.capabilityKind,
  }
}

function requirePersistedLegacyCommitmentIdentity(
  existing: Doc<'governedSendIntegrityCommitments'> | undefined,
  incoming: { serviceId: ServiceId; capabilityKind: string },
) {
  const targetBinding = existing?.targetBinding
  if (targetBinding === undefined || !('serviceId' in targetBinding)) {
    throw new Error('inquiry_legacy_service_id_unavailable')
  }
  if (String(targetBinding.serviceId) !== String(incoming.serviceId) || targetBinding.capabilityKind !== incoming.capabilityKind) {
    throw new Error('inquiry_legacy_target_conflict')
  }
  return {
    serviceId: targetBinding.serviceId,
    capabilityKind: targetBinding.capabilityKind,
  }
}
function requireBusinessId(db: GenericDatabaseWriter<DataModel>, value: string): import('./_generated/dataModel').Id<'businesses'> {
  const id = db.normalizeId('businesses', value)
  if (id === null) throw new Error('invalid_inquiry_business_id')
  return id
}

function requireOwnerId(db: GenericDatabaseWriter<DataModel>, value: string): import('./_generated/dataModel').Id<'owners'> {
  const id = db.normalizeId('owners', value)
  if (id === null) throw new Error('invalid_inquiry_owner_id')
  return id
}

