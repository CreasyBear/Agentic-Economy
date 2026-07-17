import { defaultInquiryOperatorControls, type InquirySourceState } from '../schema'

export function createEmptyInquirySourceState(input: Partial<InquirySourceState> = {}): InquirySourceState {
  return {
    businesses: [],
    businessServices: [],
    serviceCapabilities: [],
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
