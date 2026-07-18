import {
  createEmptyInquirySourceState,
  resolveInquiryReceiptKeyring,
} from '../src/modules/inquiries/public'
import type {
  CapabilityLaunchSupportRecord,
  InquiryAuditRecord,
  InquiryCustomerAccessGrant,
  InquiryOperationRecord,
  InquirySourceState,
  InquiryThreadRecord,
} from '../src/modules/inquiries/public'
import type { RuntimeDb, RuntimeDocument } from './source_state'
import { collect, isDefined, stringField, takeRuntimeRows } from './inquiryRuntimeDbHelpers'
import {
  toAbuseRateLimitBucketRecord,
  toBusinessOwnerRecord,
  toBusinessRecord,
  toBusinessServiceRecord,
  toCapabilityLaunchSupportRecord,
  toClaimRecord,
  toGovernedSendErasureLineageRecord,
  toGovernedSendIntegrityCommitmentRecord,
  toGovernedSendReceiptRecord,
  toInquiryAuditRecord,
  toInquiryCustomerAccessGrant,
  toInquiryMessageRecord,
  toInquiryNotificationRecord,
  toInquiryOperationRecord,
  toInquiryPrivacyTombstoneRecord,
  toInquiryThreadRecord,
  toResolvableOwnerRecipient,
  toServiceCapabilityRecord,
  toSuppressionRuleRecord,
} from './inquirySourceStateMappers'

export async function loadInquirySourceState(db: RuntimeDb): Promise<InquirySourceState> {
  const [
    businesses,
    businessServices,
    serviceCapabilities,
    suppressionRules,
    owners,
    claims,
    threads,
    messages,
    notifications,
    privacyTombstones,
    customerAccessGrants,
    governedSendReceipts,
    governedSendIntegrityCommitments,
    governedSendReceiptKeys,
    governedSendErasureLineage,
    auditEvents,
    abuseBuckets,
    operationKeys,
    supportRecords,
  ] = await Promise.all([
    collect(db, 'businesses'),
    collect(db, 'businessServices'),
    collect(db, 'serviceCapabilities'),
    collect(db, 'suppressionRules'),
    collect(db, 'owners'),
    collect(db, 'claims'),
    collect(db, 'inquiryThreads'),
    collect(db, 'inquiryMessages'),
    collect(db, 'inquiryNotifications'),
    collect(db, 'inquiryPrivacyTombstones'),
    collect(db, 'inquiryCustomerAccessGrants'),
    collect(db, 'governedSendReceipts'),
    collect(db, 'governedSendIntegrityCommitments'),
    collect(db, 'governedSendReceiptKeys'),
    collect(db, 'governedSendErasureLineage'),
    collect(db, 'auditEvents'),
    collect(db, 'inquiryAbuseBuckets'),
    collect(db, 'operationKeys'),
    collect(db, 'capabilityLaunchSupportRecords'),
  ])

  const inquiryAuditEvents: InquiryAuditRecord[] = []
  for (const auditEvent of auditEvents) {
    const record = toInquiryAuditRecord(auditEvent)
    if (record !== undefined) {
      inquiryAuditEvents.push(record)
    }
  }

  const inquiryOperations: InquiryOperationRecord[] = []
  for (const operationKey of operationKeys) {
    if (stringField(operationKey, 'scope') === 'inquiry') {
      inquiryOperations.push(toInquiryOperationRecord(operationKey))
    }
  }

  const capabilityLaunchSupportRecords: CapabilityLaunchSupportRecord[] = []
  for (const supportRecord of supportRecords) {
    const record = toCapabilityLaunchSupportRecord(supportRecord)
    if (record !== undefined) {
      capabilityLaunchSupportRecords.push(record)
    }
  }

  const receiptKeyring = governedSendReceipts.length === 0
    ? undefined
    : resolveInquiryReceiptKeyring(process.env)
  const recoveredReceipts = receiptKeyring === undefined
    ? []
    : (await Promise.all(governedSendReceipts.map((receipt) =>
        toGovernedSendReceiptRecord(
          receipt,
          governedSendReceiptKeys,
          governedSendErasureLineage,
          receiptKeyring,
        )
      ))).filter(isDefined)

  return createEmptyInquirySourceState({
    businesses: businesses.map(toBusinessRecord),
    businessServices: businessServices.map(toBusinessServiceRecord),
    serviceCapabilities: serviceCapabilities.map(toServiceCapabilityRecord),
    suppressionRules: suppressionRules.map(toSuppressionRuleRecord),
    owners: owners.map(toBusinessOwnerRecord),
    claims: claims.map(toClaimRecord),
    resolvableOwnerRecipients: owners.flatMap(toResolvableOwnerRecipient),
    threads: threads.map(toInquiryThreadRecord),
    messages: messages.map(toInquiryMessageRecord),
    notifications: notifications.map(toInquiryNotificationRecord),
    customerAccessGrants: customerAccessGrants.map(toInquiryCustomerAccessGrant),
    privacyTombstones: privacyTombstones.map(toInquiryPrivacyTombstoneRecord),
    governedSendReceipts: recoveredReceipts,
    governedSendIntegrityCommitments: governedSendIntegrityCommitments.map(toGovernedSendIntegrityCommitmentRecord),
    governedSendErasureLineage: governedSendErasureLineage.map(toGovernedSendErasureLineageRecord),
    auditEvents: inquiryAuditEvents,
    abuseRateLimitBuckets: abuseBuckets.map(toAbuseRateLimitBucketRecord),
    operations: inquiryOperations,
    capabilityLaunchSupportRecords,
  })
}

export async function loadInquiryCustomerRecordState(
  db: RuntimeDb,
  threadId: InquiryThreadRecord['threadId'],
  grant: InquiryCustomerAccessGrant,
): Promise<InquirySourceState> {
  const threadRow = await db.query('inquiryThreads')
    .withIndex('by_threadId', (query) => query.eq('threadId', threadId))
    .unique()
  if (threadRow === null) return createEmptyInquirySourceState({ customerAccessGrants: [grant] })

  const [businessRow, messageRows, notificationRows, tombstoneRows, receiptRows, commitmentRows, lineageRows] = await Promise.all([
    db.get(stringField(threadRow, 'businessId')),
    takeRuntimeRows(db.query('inquiryMessages').withIndex('by_thread_createdAt', (query) => query.eq('threadId', threadId)), 200),
    takeRuntimeRows(db.query('inquiryNotifications').withIndex('by_thread_status', (query) => query.eq('threadId', threadId)), 200),
    takeRuntimeRows(db.query('inquiryPrivacyTombstones').withIndex('by_thread_status', (query) => query.eq('threadId', threadId)), 20),
    takeRuntimeRows(db.query('governedSendReceipts').withIndex('by_threadId_and_createdAt', (query) => query.eq('threadId', threadId)), 20),
    takeRuntimeRows(db.query('governedSendIntegrityCommitments').withIndex('by_threadId', (query) => query.eq('threadId', threadId)), 20),
    takeRuntimeRows(db.query('governedSendErasureLineage').withIndex('by_thread_destroyedAt', (query) => query.eq('threadId', threadId)), 20),
  ])
  const keyRows = (await Promise.all(receiptRows.map((receipt) =>
    db.query('governedSendReceiptKeys')
      .withIndex('by_keyRef', (query) => query.eq('keyRef', stringField(receipt, 'keyRef')))
      .unique()
  ))).filter((row): row is RuntimeDocument => row !== null)
  const operationRows = (await Promise.all(receiptRows.map((receipt) =>
    db.query('operationKeys')
      .withIndex('by_scope_key', (query) => query.eq('scope', 'inquiry').eq('key', stringField(receipt, 'operationKey')))
      .unique()
  ))).filter((row): row is RuntimeDocument => row !== null)
  const commitments = commitmentRows.map(toGovernedSendIntegrityCommitmentRecord)
  const [claimRows, serviceRows] = await Promise.all([
    Promise.all(commitments.map((commitment) => db.get(commitment.targetBinding.claimRef))),
    Promise.all(commitments.map((commitment) => db.get(String(commitment.targetBinding.serviceId)))),
  ])
  const claims = claimRows.filter((row): row is RuntimeDocument => row !== null)
  const services = serviceRows.filter((row): row is RuntimeDocument => row !== null)
  const receiptKeyring = receiptRows.length === 0 ? undefined : resolveInquiryReceiptKeyring(process.env)
  const receipts = receiptKeyring === undefined
    ? []
    : (await Promise.all(receiptRows.map((receipt) =>
        toGovernedSendReceiptRecord(receipt, keyRows, lineageRows, receiptKeyring)
      ))).filter(isDefined)

  return createEmptyInquirySourceState({
    businesses: businessRow === null ? [] : [toBusinessRecord(businessRow)],
    businessServices: services.map(toBusinessServiceRecord),
    claims: claims.map(toClaimRecord),
    threads: [toInquiryThreadRecord(threadRow)],
    messages: messageRows.map(toInquiryMessageRecord),
    notifications: notificationRows.map(toInquiryNotificationRecord),
    customerAccessGrants: [grant],
    privacyTombstones: tombstoneRows.map(toInquiryPrivacyTombstoneRecord),
    governedSendReceipts: receipts,
    governedSendIntegrityCommitments: commitments,
    governedSendErasureLineage: lineageRows.map(toGovernedSendErasureLineageRecord),
    operations: operationRows.map(toInquiryOperationRecord),
  })
}

export async function loadInquiryCustomerAccessGrant(
  db: RuntimeDb,
  accessId: string,
): Promise<InquiryCustomerAccessGrant | undefined> {
  const grantRow = await db.query('inquiryCustomerAccessGrants')
    .withIndex('by_accessId', (query) => query.eq('accessId', accessId))
    .unique()
  return grantRow === null ? undefined : toInquiryCustomerAccessGrant(grantRow)
}
