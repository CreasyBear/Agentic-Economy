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
import { brandNonEmpty } from '../src/modules/common/ids'
import { stableHash, stableStringify } from '../src/modules/common/stable-hash'
import type { RuntimeDb, RuntimeDocument } from './source_state'
import {
  numberField,
  optionalNumberFromUnknown,
  stringArrayField,
  stringField,
  takeRuntimeRows,
  upsertByFields,
} from './inquiryRuntimeDbHelpers'
import {
  operationNameForResult,
  redactedJson,
  toGovernedSendErasureLineageRecord,
  toGovernedSendIntegrityCommitmentRecord,
  toGovernedSendReceiptRecord,
} from './inquirySourceStateMappers'

export async function persistInquirySourceState(db: RuntimeDb, state: InquirySourceState): Promise<void> {
  for (const bucket of state.abuseRateLimitBuckets.filter((candidate) => candidate.scope === 'inquiry_submit')) {
    await upsertByFields(db, 'inquiryAbuseBuckets', ['key', 'window'], {
      key: bucket.key,
      window: bucket.window,
      count: bucket.count,
      state: bucket.state,
      resetAt: bucket.resetAt,
      updatedAt: bucket.updatedAt,
    })
  }

  for (const thread of state.threads) {
    await upsertByFields(db, 'inquiryThreads', ['threadId'], {
      threadId: thread.threadId,
      businessId: thread.businessId,
      ownerId: thread.ownerId,
      serviceId: thread.serviceId,
      capabilityKind: thread.capabilityKind,
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
      ...(thread.origin === undefined ? {} : {
        originKind: thread.origin.kind,
        originThreadId: thread.origin.threadId,
      }),
    })
  }

  for (const grant of state.customerAccessGrants) {
    await upsertByFields(db, 'inquiryCustomerAccessGrants', ['accessId'], {
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
    })
  }

  for (const message of state.messages) {
    await upsertByFields(db, 'inquiryMessages', ['messageId'], {
      messageId: message.messageId,
      threadId: message.threadId,
      sender: message.sender,
      body: message.body,
      bodyHash: message.bodyHash,
      ...(message.contactHash === undefined ? {} : { contactHash: message.contactHash }),
      ...(message.redactedContact === undefined ? {} : { redactedContact: redactedJson(message.redactedContact) }),
      ...(message.privateDeletedAt === undefined ? {} : { privateDeletedAt: message.privateDeletedAt }),
      createdAt: message.createdAt,
    })
  }

  for (const notification of state.notifications) {
    await upsertByFields(db, 'inquiryNotifications', ['notificationId'], {
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
    })
  }

  for (const tombstone of state.privacyTombstones) {
    await upsertByFields(db, 'inquiryPrivacyTombstones', ['threadId', 'operationKey'], {
      threadId: tombstone.threadId,
      businessId: tombstone.businessId,
      reasonCode: tombstone.reasonCode,
      status: tombstone.status,
      operationKey: tombstone.operationKey,
      correlationId: tombstone.correlationId,
      createdAt: tombstone.createdAt,
      ...(tombstone.appliedAt === undefined ? {} : { appliedAt: tombstone.appliedAt }),
      receiptErasureCount: tombstone.receiptErasureCount,
      erasureEventIds: [...tombstone.erasureEventIds],
    })
  }

  for (const receipt of state.governedSendReceipts) {
    const lineage = state.governedSendErasureLineage.find(
      (candidate) => candidate.receiptOperationKey === receipt.operationKey,
    )
    await persistGovernedSendReceipt(db, receipt, lineage)
  }

  for (const commitment of state.governedSendIntegrityCommitments) {
    await persistGovernedSendIntegrityCommitment(db, commitment)
  }

  const auditEventsByOperationKey = new Map(
    state.auditEvents.map((auditEvent) => [auditEvent.operationKey, auditEvent] as const)
  )

  for (const operation of state.operations) {
    await upsertInquiryOperation(
      db,
      operation,
      auditEventsByOperationKey.get(operation.operationKey)
    )
  }

  for (const auditEvent of state.auditEvents) {
    await upsertAuditEvent(db, auditEvent)
  }

  for (const funnelEvent of state.funnelEvents) {
    await upsertFunnelEvent(db, funnelEvent)
  }
}

async function upsertInquiryOperation(
  db: RuntimeDb,
  operation: InquiryOperationRecord,
  auditEvent: InquiryAuditRecord | undefined
): Promise<void> {
  await upsertByFields(db, 'operationKeys', ['scope', 'key'], {
    scope: 'inquiry',
    actorKind: auditEvent?.actorKind ?? 'system',
    actorRef: auditEvent?.actorRef ?? 'system:inquiry',
    operationName: operationNameForResult(operation.resultCode),
    key: operation.operationKey,
    requestHash: operation.requestHash,
    sourceHash: operation.threadId,
    status: 'succeeded',
    resultHash: stableHash({ resultCode: operation.resultCode }),
    effectRefs: [
      `result:${operation.resultCode}`,
      ...(operation.threadId === undefined ? [] : [`thread:${operation.threadId}`]),
      ...(operation.messageId === undefined ? [] : [`message:${operation.messageId}`]),
      ...(operation.notificationId === undefined ? [] : [`notification:${operation.notificationId}`]),
    ],
    createdAt: operation.createdAt,
    updatedAt: operation.createdAt,
  })
}
export async function repairGovernedSendErasureKeys(db: RuntimeDb, threadId: string): Promise<void> {
  const lineageRows = await takeRuntimeRows(
    db.query('governedSendErasureLineage').withIndex('by_thread_destroyedAt', (query) => query.eq('threadId', threadId)),
    20,
  )
  for (const lineageRow of lineageRows) {
    const lineage = toGovernedSendErasureLineageRecord(lineageRow)
    const receiptLineageRows = lineageRows.filter(
      (candidate) => stringField(candidate, 'receiptOperationKey') === String(lineage.receiptOperationKey),
    )
    if (receiptLineageRows.length !== 1) throw new Error('governed_send_erasure_lineage_duplicate_rows')
    const keyRows = await takeRuntimeRows(
      db.query('governedSendReceiptKeys').withIndex('by_keyRef', (query) => query.eq('keyRef', lineage.keyRef)), 2,
    )
    if (keyRows.length > 1) throw new Error('governed_send_receipt_key_duplicate_rows')
    const key = keyRows[0]
    if (key === undefined) continue
    const receiptRows = await takeRuntimeRows(
      db.query('governedSendReceipts').withIndex('by_operationKey', (query) => query.eq('operationKey', lineage.receiptOperationKey)), 2,
    )
    if (receiptRows.length !== 1) throw new Error('governed_send_receipt_conflict')
    const receipt = receiptRows[0]
    if (receipt === undefined) throw new Error('governed_send_receipt_conflict')
    await assertGovernedSendLineageAuthority(db, receipt, lineage)
    if (db.delete === undefined) throw new Error('Runtime database cannot destroy governed-send receipt keys.')
    await db.delete(key._id)
  }
}

async function assertGovernedSendLineageAuthority(
  db: RuntimeDb,
  receipt: RuntimeDocument,
  lineage: GovernedSendErasureLineageRecord,
): Promise<void> {
  const tombstoneRows = await takeRuntimeRows(
    db.query('inquiryPrivacyTombstones').withIndex('by_thread_operationKey', (query) =>
      query.eq('threadId', lineage.threadId).eq('operationKey', lineage.privacyOperationKey)), 2,
  )
  if (tombstoneRows.length !== 1) throw new Error('governed_send_erasure_lineage_conflict')
  const tombstone = tombstoneRows[0]
  if (tombstone === undefined) throw new Error('governed_send_erasure_lineage_conflict')
  const destroyedAt = optionalNumberFromUnknown(tombstone.appliedAt)
  const erasureEventIds = stringArrayField(tombstone, 'erasureEventIds')
  if (
    stringField(tombstone, 'status') !== 'applied' ||
    new Set(erasureEventIds).size !== erasureEventIds.length ||
    destroyedAt === undefined ||
    numberField(tombstone, 'receiptErasureCount') !== erasureEventIds.length ||
    !erasureEventIds.includes(lineage.erasureEventId)
  ) {
    throw new Error('governed_send_erasure_lineage_conflict')
  }
  const expectedMaterial = {
    erasureEventId: `governed-send-erasure:${stableHash({ receiptOperationKey: stringField(receipt, 'operationKey'), privacyOperationKey: lineage.privacyOperationKey, keyRef: stringField(receipt, 'keyRef') })}`,
    receiptOperationKey: brandNonEmpty(stringField(receipt, 'operationKey'), 'OperationKey'),
    privacyOperationKey: brandNonEmpty(stringField(tombstone, 'operationKey'), 'OperationKey'),
    threadId: brandNonEmpty(stringField(receipt, 'threadId'), 'InquiryThreadId'),
    digest: stringField(receipt, 'digest') as `sha256:${string}`,
    keyRef: stringField(receipt, 'keyRef'),
    reasonCode: stringField(tombstone, 'reasonCode'),
    destroyedAt,
    priorReceiptCommitment: stableHash({ operationKey: stringField(receipt, 'operationKey'), threadId: stringField(receipt, 'threadId'), digest: stringField(receipt, 'digest'), schemaVersion: numberField(receipt, 'schemaVersion'), recipientRef: stringField(receipt, 'recipientRef'), keyRef: stringField(receipt, 'keyRef') }),
  }
  const expected = { ...expectedMaterial, lineageHash: stableHash(expectedMaterial) }
  if (stableStringify(expected) !== stableStringify(lineage)) throw new Error('governed_send_erasure_lineage_conflict')
}

async function persistGovernedSendReceipt(
  db: RuntimeDb,
  receipt: GovernedSendReceiptRecord,
  lineage: GovernedSendErasureLineageRecord | undefined,
): Promise<void> {
  const existingRows = await takeRuntimeRows(
    db.query('governedSendReceipts').withIndex('by_operationKey', (query) => query.eq('operationKey', receipt.operationKey)),
    2,
  )
  if (existingRows.length > 1) throw new Error('governed_send_receipt_duplicate_rows')
  const existing = existingRows[0]

  if (existing === undefined) {
    if (receipt.retention !== 'recoverable') {
      throw new Error('Cannot persist erased governed-send metadata without its immutable receipt.')
    }
    const encrypted = await encryptGovernedSendReceipt(receipt, resolveInquiryReceiptKeyring(process.env))
    await db.insert('governedSendReceipts', {
      ...encrypted.payload,
      digest: receipt.digest,
      algorithm: receipt.algorithm,
      schemaVersion: receipt.schemaVersion,
      createdAt: receipt.createdAt,
      operationKey: receipt.operationKey,
      threadId: receipt.threadId,
      admissionProof: receipt.admissionProof,
      recipientRef: receipt.recipientRef,
    })
    await db.insert('governedSendReceiptKeys', encrypted.wrappedKey)
    return
  }

  if (receipt.retention === 'recoverable') {
    const keyRows = await takeRuntimeRows(
      db.query('governedSendReceiptKeys').withIndex('by_keyRef', (query) => query.eq('keyRef', stringField(existing, 'keyRef'))),
      2,
    )
    if (keyRows.length !== 1) throw new Error('governed_send_receipt_conflict')
    const recovered = await toGovernedSendReceiptRecord(
      existing,
      keyRows,
      [],
      resolveInquiryReceiptKeyring(process.env),
    )
    if (recovered === undefined || stableStringify(recovered) !== stableStringify(receipt)) {
      throw new Error('governed_send_receipt_conflict')
    }
    return
  }
  if (lineage === undefined || lineage.keyRef !== stringField(existing, 'keyRef')) {
    throw new Error('Governed-send erasure lineage does not match the persisted receipt key.')
  }
  const { lineageHash, ...lineageMaterial } = lineage
  if (lineageHash !== stableHash(lineageMaterial)) {
    throw new Error('governed_send_erasure_lineage_conflict')
  }
  await assertGovernedSendLineageAuthority(db, existing, lineage)

  const existingLineageRows = await takeRuntimeRows(
    db.query('governedSendErasureLineage')
      .withIndex('by_erasureEventId', (query) => query.eq('erasureEventId', lineage.erasureEventId)),
    2,
  )
  if (existingLineageRows.length > 1) throw new Error('governed_send_erasure_lineage_duplicate_rows')
  const existingLineage = existingLineageRows[0]
  if (
    existingLineage !== undefined &&
    stableStringify(toGovernedSendErasureLineageRecord(existingLineage)) !== stableStringify(lineage)
  ) throw new Error('governed_send_erasure_lineage_conflict')

  const wrappedKeyRows = await takeRuntimeRows(
    db.query('governedSendReceiptKeys').withIndex('by_keyRef', (query) => query.eq('keyRef', lineage.keyRef)),
    2,
  )
  if (wrappedKeyRows.length > 1) throw new Error('governed_send_receipt_key_duplicate_rows')
  const wrappedKey = wrappedKeyRows[0]
  if (wrappedKey !== undefined) {
    if (db.delete === undefined) throw new Error('Runtime database cannot destroy governed-send receipt keys.')
    await db.delete(wrappedKey._id)
  }
  if (existingLineage === undefined) await db.insert('governedSendErasureLineage', { ...lineage })
}

async function persistGovernedSendIntegrityCommitment(
  db: RuntimeDb,
  commitment: GovernedSendIntegrityCommitmentRecord,
): Promise<void> {
  const rows = await takeRuntimeRows(
    db.query('governedSendIntegrityCommitments').withIndex('by_operationKey', (query) => query.eq('operationKey', commitment.operationKey)),
    2,
  )
  if (rows.length > 1) throw new Error('governed_send_commitment_duplicate_rows')
  const existing = rows[0]
  if (existing === undefined) {
    await db.insert('governedSendIntegrityCommitments', { ...commitment })
    return
  }
  if (stableStringify(toGovernedSendIntegrityCommitmentRecord(existing)) !== stableStringify(commitment)) {
    throw new Error('governed_send_commitment_conflict')
  }
}


async function upsertAuditEvent(db: RuntimeDb, auditEvent: InquiryAuditRecord): Promise<void> {
  const eventId = `audit:${stableHash({
    eventType: auditEvent.eventType,
    operationKey: auditEvent.operationKey,
    targetRef: auditEvent.targetRef,
  })}`
  await upsertByFields(db, 'auditEvents', ['eventId'], {
    eventId,
    eventType: auditEvent.eventType,
    actorKind: auditEvent.actorKind,
    actorRef: auditEvent.actorRef,
    businessId: auditEvent.businessId,
    targetType: auditEvent.targetType,
    targetRef: auditEvent.targetRef,
    beforeState: auditEvent.beforeState,
    afterState: auditEvent.afterState,
    idempotencyKey: auditEvent.operationKey,
    correlationId: auditEvent.correlationId,
    evidenceRefs: [],
    redactedPayloadJson: JSON.stringify(auditEvent.redactedPayload),
    payloadHash: auditEvent.payloadHash,
    createdAt: auditEvent.createdAt,
  })
}

async function upsertFunnelEvent(db: RuntimeDb, funnelEvent: InquiryFunnelRecord): Promise<void> {
  await upsertByFields(db, 'funnelEvents', ['eventType', 'businessId', 'correlationId', 'createdAt'], {
    eventType: funnelEvent.eventType,
    source: 'inquiry',
    stage: 'published',
    pseudonymousSessionId: funnelEvent.pseudonymousSessionId,
    businessId: funnelEvent.businessId,
    redactedPayloadJson: JSON.stringify(funnelEvent.redactedPayload),
    consentFlag: true,
    correlationId: funnelEvent.correlationId,
    createdAt: funnelEvent.createdAt,
  })
}
