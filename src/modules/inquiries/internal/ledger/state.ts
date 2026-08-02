import { defaultInquiryOperatorControls, type InquirySourceState } from '../schema'

export function createEmptyInquirySourceState(input: Partial<InquirySourceState> = {}): InquirySourceState {
  return {
    businesses: [],
    businessOfferings: [],
    businessOfferingRevisions: [],
    offeringAccessPaths: [],
    suppressionRules: [],
    owners: [],
    claims: [],
    resolvableOwnerRecipients: [],
    threads: [],
    messages: [],
    notifications: [],
    customerAccessGrants: [],
    abuseRateLimitBuckets: [],
    auditEvents: [],
    funnelEvents: [],
    governedSendReceipts: [],
    governedSendIntegrityCommitments: [],
    governedSendErasureLineage: [],
    operations: [],
    privacyTombstones: [],
    operatorControls: defaultInquiryOperatorControls,
    capabilityLaunchSupportRecords: [],
    ...input,
  }
}
