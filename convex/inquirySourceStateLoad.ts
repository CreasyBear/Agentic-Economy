import type { GenericDatabaseReader } from 'convex/server'
import type { DataModel } from './_generated/dataModel'
import {
  createEmptyInquirySourceState,
  resolveInquiryReceiptKeyring,
} from '../src/modules/inquiries/public'
import type {
  CapabilityLaunchSupportRecord,
  InquiryAuditRecord,
  InquiryCustomerAccessGrant,
  InquiryFunnelRecord,
  InquirySourceState,
  InquiryThreadRecord,
} from '../src/modules/inquiries/public'
import type { InquirySourceStateLoadScope } from '../src/modules/inquiries/public'
import {
  requiredNumber,
  requiredString,
  toAbuseRateLimitBucketRecord,
  toBusinessOfferingRecord,
  toBusinessOfferingRevisionRecord,
  toBusinessOwnerRecord,
  toBusinessRecord,
  toCapabilityLaunchSupportRecord,
  toClaimRecord,
  toGovernedSendErasureLineageRecord,
  toGovernedSendIntegrityCommitmentRecord,
  toGovernedSendReceiptRecord,
  toInquiryAuditRecord,
  toInquiryCustomerAccessGrant,
  toInquiryFunnelRecord,
  toInquiryMessageRecord,
  toInquiryNotificationRecord,
  toInquiryOperationRecord,
  toInquiryPrivacyTombstoneRecord,
  toInquiryThreadRecord,
  toOfferingAccessPathRecord,
  toResolvableOwnerRecipient,
  toSuppressionRuleRecord,
} from './inquirySourceStateMappers'

export async function loadInquirySourceState(db: GenericDatabaseReader<DataModel>, scope: InquirySourceStateLoadScope): Promise<InquirySourceState> {
  const rowLimit = scope.kind === 'operator' ? 200 : 100
  const [businesses, businessOfferings, businessOfferingRevisions, offeringAccessPaths, suppressionRules, owners, claims, threads, messages, notifications, abuseBuckets, privacyTombstones, customerAccessGrants, governedSendReceipts, governedSendIntegrityCommitments, governedSendReceiptKeys, governedSendErasureLineage, auditEvents, funnelEvents, operationKeys, supportRecords] = await Promise.all([
    db.query('businesses').take(rowLimit),
    db.query('businessOfferings').take(rowLimit),
    db.query('businessOfferingRevisions').take(rowLimit),
    db.query('offeringAccessPaths').take(rowLimit),
    db.query('suppressionRules').take(rowLimit),
    db.query('owners').take(rowLimit),
    db.query('claims').take(rowLimit),
    db.query('inquiryThreads').take(rowLimit),
    db.query('inquiryMessages').take(rowLimit),
    db.query('inquiryNotifications').take(rowLimit),
    db.query('inquiryAbuseBuckets').take(rowLimit),
    db.query('inquiryPrivacyTombstones').take(rowLimit),
    db.query('inquiryCustomerAccessGrants').take(rowLimit),
    db.query('governedSendReceipts').take(rowLimit),
    db.query('governedSendIntegrityCommitments').take(rowLimit),
    db.query('governedSendReceiptKeys').take(rowLimit),
    db.query('governedSendErasureLineage').take(rowLimit),
    db.query('auditEvents').take(rowLimit),
    db.query('funnelEvents').take(rowLimit),
    db.query('operationKeys').withIndex('by_scope_key', (query) => query.eq('scope', 'inquiry')).take(rowLimit),
    db.query('capabilityLaunchSupportRecords')
      .withIndex('by_supportRecordId', (query) => query.eq('supportRecordId', 'human_inquiry_owner_inbox')).take(rowLimit),
  ])
  const inquiryAuditEvents: InquiryAuditRecord[] = []
  for (const row of auditEvents) {
    const record = toInquiryAuditRecord(row)
    if (record !== undefined) inquiryAuditEvents.push(record)
  }
  const inquiryFunnelEvents: InquiryFunnelRecord[] = []
  for (const row of funnelEvents) {
    const record = toInquiryFunnelRecord(row)
    if (record !== undefined) inquiryFunnelEvents.push(record)
  }
  const capabilityLaunchSupportRecords: CapabilityLaunchSupportRecord[] = []
  for (const row of supportRecords) {
    const record = toCapabilityLaunchSupportRecord(row)
    if (record !== undefined) capabilityLaunchSupportRecords.push(record)
  }
  const inquiryOperations = operationKeys.map(toInquiryOperationRecord)
  const receiptKeyring = governedSendReceipts.length === 0 ? undefined : resolveInquiryReceiptKeyring(process.env)
  const recoveredReceipts = receiptKeyring === undefined
    ? []
    : (await Promise.all(governedSendReceipts.map((row) => toGovernedSendReceiptRecord(row, governedSendReceiptKeys, governedSendErasureLineage, receiptKeyring)))).filter((row): row is NonNullable<typeof row> => row !== undefined)
  return createEmptyInquirySourceState({
    businesses: businesses.map(toBusinessRecord),
    businessOfferings: businessOfferings.map(toBusinessOfferingRecord),
    businessOfferingRevisions: businessOfferingRevisions.map(toBusinessOfferingRevisionRecord),
    offeringAccessPaths: offeringAccessPaths.map(toOfferingAccessPathRecord),
    suppressionRules: suppressionRules.map(toSuppressionRuleRecord),
    owners: owners.map(toBusinessOwnerRecord),
    claims: claims.map(toClaimRecord),
    resolvableOwnerRecipients: owners.flatMap(toResolvableOwnerRecipient),
    threads: threads.map(toInquiryThreadRecord),
    messages: messages.map(toInquiryMessageRecord),
    notifications: notifications.map(toInquiryNotificationRecord),
    abuseRateLimitBuckets: abuseBuckets.map(toAbuseRateLimitBucketRecord),
    customerAccessGrants: customerAccessGrants.map(toInquiryCustomerAccessGrant),
    privacyTombstones: privacyTombstones.map(toInquiryPrivacyTombstoneRecord),
    governedSendReceipts: recoveredReceipts,
    governedSendIntegrityCommitments: governedSendIntegrityCommitments.map(toGovernedSendIntegrityCommitmentRecord),
    governedSendErasureLineage: governedSendErasureLineage.map(toGovernedSendErasureLineageRecord),
    auditEvents: inquiryAuditEvents,
    funnelEvents: inquiryFunnelEvents,
    operations: inquiryOperations,
    capabilityLaunchSupportRecords,
  })
}

export async function loadInquiryCustomerRecordState(db: GenericDatabaseReader<DataModel>, threadId: InquiryThreadRecord['threadId'], grant: InquiryCustomerAccessGrant): Promise<InquirySourceState> {
  const threadRow = await db.query('inquiryThreads').withIndex('by_threadId', (query) => query.eq('threadId', threadId)).unique()
  if (threadRow === null) return createEmptyInquirySourceState({ customerAccessGrants: [grant] })
  const [businessRow, messageRows, notificationRows, tombstoneRows, receiptRows, commitmentRows, lineageRows] = await Promise.all([
    db.get(threadRow.businessId),
    db.query('inquiryMessages').withIndex('by_thread_createdAt', (query) => query.eq('threadId', threadId)).take(200),
    db.query('inquiryNotifications').withIndex('by_thread_status', (query) => query.eq('threadId', threadId)).take(200),
    db.query('inquiryPrivacyTombstones').withIndex('by_thread_status', (query) => query.eq('threadId', threadId)).take(20),
    db.query('governedSendReceipts').withIndex('by_threadId_and_createdAt', (query) => query.eq('threadId', threadId)).take(20),
    db.query('governedSendIntegrityCommitments').withIndex('by_threadId', (query) => query.eq('threadId', threadId)).take(20),
    db.query('governedSendErasureLineage').withIndex('by_thread_destroyedAt', (query) => query.eq('threadId', threadId)).take(20),
  ])
  const keyRows = (await Promise.all(receiptRows.map((row) => db.query('governedSendReceiptKeys').withIndex('by_keyRef', (query) => query.eq('keyRef', requiredString(row, 'keyRef', 'inquiry_source'))).unique()))).filter((row) => row !== null)
  const operationRows = (await Promise.all(receiptRows.map((row) => db.query('operationKeys').withIndex('by_scope_key', (query) => query.eq('scope', 'inquiry').eq('key', requiredString(row, 'operationKey', 'inquiry_source'))).unique()))).filter((row) => row !== null)
  const commitments = commitmentRows.map(toGovernedSendIntegrityCommitmentRecord)
  const claimIds = commitments.flatMap((commitment) => {
    const claimId = db.normalizeId('claims', commitment.targetBinding.claimRef)
    return claimId === null ? [] : [claimId]
  })
  const claims = (await Promise.all(claimIds.map((claimId) => db.get(claimId)))).filter((row) => row !== null)
  const offeringRows = (await Promise.all(commitments.map((commitment) => db.query('businessOfferings').withIndex('by_offeringRef', (query) => query.eq('offeringRef', commitment.targetBinding.offeringRef)).unique()))).filter((row) => row !== null)
  const revisionRows = (await Promise.all(offeringRows.map((offering) => db.query('businessOfferingRevisions').withIndex('by_offeringRef_and_revision', (query) => query.eq('offeringRef', requiredString(offering, 'offeringRef', 'inquiry_source')).eq('revision', requiredNumber(offering, 'currentRevision', 'inquiry_source'))).unique()))).filter((row) => row !== null)
  const accessPathRows = (await Promise.all(offeringRows.map((offering) => db.query('offeringAccessPaths').withIndex('by_offeringRef_and_offeringRevision', (query) => query.eq('offeringRef', requiredString(offering, 'offeringRef', 'inquiry_source')).eq('offeringRevision', requiredNumber(offering, 'currentRevision', 'inquiry_source'))).take(20)))).flat()
  const receiptKeyring = receiptRows.length === 0 ? undefined : resolveInquiryReceiptKeyring(process.env)
  const receipts = receiptKeyring === undefined ? [] : (await Promise.all(receiptRows.map((row) => toGovernedSendReceiptRecord(row, keyRows, lineageRows, receiptKeyring)))).filter((row): row is NonNullable<typeof row> => row !== undefined)
  return createEmptyInquirySourceState({
    businesses: businessRow === null ? [] : [toBusinessRecord(businessRow)],
    businessOfferings: offeringRows.map(toBusinessOfferingRecord),
    businessOfferingRevisions: revisionRows.map(toBusinessOfferingRevisionRecord),
    offeringAccessPaths: accessPathRows.map(toOfferingAccessPathRecord),
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

export async function loadInquiryCustomerAccessGrant(db: GenericDatabaseReader<DataModel>, accessId: string): Promise<InquiryCustomerAccessGrant | undefined> {
  const row = await db.query('inquiryCustomerAccessGrants').withIndex('by_accessId', (query) => query.eq('accessId', accessId)).unique()
  return row === null ? undefined : toInquiryCustomerAccessGrant(row)
}
