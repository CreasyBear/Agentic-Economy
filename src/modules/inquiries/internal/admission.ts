import type { InquirySourceState, InquiryTargetRef } from './schema'

export const R1TargetAdmissionVersion = 'r1-target-admitted:v1' as const

export type AdmissionProofClass = Readonly<{
  kind: 'claimed_owner'
  claimRef: string
  recipientRef: string
  /** Reserved until source owns a real destination-verification event. */
  destinationVerifiedAt?: number
}>

export type AdmissionBlocker =
  | Readonly<{ kind: 'not_published'; ownerLabel: 'Publish this business page' }>
  | Readonly<{ kind: 'not_claimed'; ownerLabel: 'Complete the business claim' }>
  | Readonly<{ kind: 'destination_unverified'; ownerLabel: 'Verify the inquiry destination' }>
  | Readonly<{ kind: 'recipient_unresolvable'; ownerLabel: 'Add a usable owner notification email' }>
  | Readonly<{ kind: 'suppressed'; ownerLabel: 'Turn inquiry receiving back on' }>
  | Readonly<{ kind: 'not_ready'; ownerLabel: 'Finish inquiry setup' }>

export type R1TargetAdmission = Readonly<{
  version: typeof R1TargetAdmissionVersion
}> & (
  | Readonly<{ admitted: true; proof: AdmissionProofClass }>
  | Readonly<{ admitted: false; blockers: readonly AdmissionBlocker[] }>
)

/** Current v1 evaluates authoritative inquiry source facts directly. */
export type R1TargetAdmissionState = InquirySourceState

const blocker = {
  notPublished: Object.freeze({ kind: 'not_published', ownerLabel: 'Publish this business page' }),
  notClaimed: Object.freeze({ kind: 'not_claimed', ownerLabel: 'Complete the business claim' }),
  recipientUnresolvable: Object.freeze({ kind: 'recipient_unresolvable', ownerLabel: 'Add a usable owner notification email' }),
  suppressed: Object.freeze({ kind: 'suppressed', ownerLabel: 'Turn inquiry receiving back on' }),
  notReady: Object.freeze({ kind: 'not_ready', ownerLabel: 'Finish inquiry setup' }),
} satisfies Record<string, AdmissionBlocker>
export function unconfiguredR1TargetAdmission(): R1TargetAdmission {
  return Object.freeze({
    version: R1TargetAdmissionVersion,
    admitted: false,
    blockers: Object.freeze([
      blocker.notPublished,
      blocker.notClaimed,
      blocker.recipientUnresolvable,
    ]),
  })
}

export function evaluateR1TargetAdmission(
  state: R1TargetAdmissionState,
  targetRef: InquiryTargetRef,
): R1TargetAdmission {
  const blockers: AdmissionBlocker[] = []
  const business = state.businesses.find((candidate) => candidate.businessId === targetRef.businessId)
  const offering = state.businessOfferings.find((candidate) =>
    candidate.businessId === targetRef.businessId && candidate.offeringRef === targetRef.offeringRef)
  const revision = offering === undefined
    ? undefined
    : state.businessOfferingRevisions.find((candidate) =>
      candidate.businessId === targetRef.businessId
      && candidate.offeringRef === targetRef.offeringRef
      && candidate.revision === offering.currentRevision)
  const inquiryAccessPath = offering === undefined
    ? undefined
    : state.offeringAccessPaths.find((candidate) =>
      candidate.businessId === targetRef.businessId
      && candidate.offeringRef === targetRef.offeringRef
      && revision !== undefined
      && candidate.offeringRevision === offering.currentRevision
      && candidate.offeringSourceHash === revision.sourceHash
      && candidate.status === 'published'
      && candidate.descriptor.kind === 'human_request'
      && candidate.descriptor.channel === 'ae_inquiry')
  const owner = business === undefined
    ? undefined
    : state.owners.find((candidate) => candidate.ownerId === business.ownerId)
  const claim = business === undefined
    ? undefined
    : state.claims.find((candidate) =>
      candidate.businessId === business.businessId
      && candidate.ownerId === business.ownerId
      && candidate.status === 'published')
  const recipient = owner === undefined
    ? undefined
    : state.resolvableOwnerRecipients.find((candidate) =>
      candidate.ownerId === owner.ownerId && candidate.recipientRef.trim().length > 0)

  if (
    business?.publicStatus !== 'published'
    || offering?.status !== 'published'
    || revision === undefined
    || inquiryAccessPath === undefined
  ) blockers.push(blocker.notPublished)
  if (business?.claimStatus !== 'published' || owner === undefined || claim === undefined) blockers.push(blocker.notClaimed)
  if (recipient === undefined) blockers.push(blocker.recipientUnresolvable)
  if (isTargetSuppressed(state, targetRef, business?.publicStatus)) blockers.push(blocker.suppressed)
  if (!isTargetReady(state)) blockers.push(blocker.notReady)

  if (blockers.length > 0 || claim === undefined || recipient === undefined) {
    return Object.freeze({ version: R1TargetAdmissionVersion, admitted: false, blockers: Object.freeze(blockers) })
  }

  return Object.freeze({
    version: R1TargetAdmissionVersion,
    admitted: true,
    proof: Object.freeze({
      kind: 'claimed_owner',
      claimRef: String(claim.claimId),
      recipientRef: recipient.recipientRef,
      ...(recipient.destinationVerifiedAt === undefined ? {} : {
        destinationVerifiedAt: recipient.destinationVerifiedAt,
      }),
    }),
  })
}

function isTargetSuppressed(
  state: R1TargetAdmissionState,
  targetRef: InquiryTargetRef,
  businessStatus: string | undefined,
): boolean {
  if (businessStatus === 'suppressed') return true
  return state.suppressionRules.some((rule) =>
    rule.status === 'active'
    && rule.targetType === 'business'
    && rule.targetRef === targetRef.businessId
  )
}

function isTargetReady(state: R1TargetAdmissionState): boolean {
  if (!state.operatorControls.inquiriesEnabled
    || !state.operatorControls.ownerHandlingReady
    || !state.operatorControls.notificationReadbackReady) return false

  const support = state.capabilityLaunchSupportRecords.find((candidate) =>
    candidate.capability === 'human_inquiry_owner_inbox')
  if (support === undefined) return false
  const openThreads = state.threads.filter((thread) => thread.status !== 'closed')
  const oldestOpenThreadAgeMs = openThreads.length === 0
    ? 0
    : Math.max(0, support.lastReviewedAt - Math.min(...openThreads.map((thread) => thread.updatedAt)))
  return support.primaryOwnerRef.trim().length > 0
    && support.primaryAdminOperatorRef.trim().length > 0
    && support.backupOwnerRef.trim().length > 0
    && support.backupAdminOperatorRef.trim().length > 0
    && support.supportEscalationPath.trim().length > 0
    && support.claimDisablePath.trim().length > 0
    && support.sourceHash.length > 0
    && support.correlationId.length > 0
    && support.supportedChannels.length > 0
    && support.perChannelKillRules.length > 0
    && support.evidenceRefs.length > 0
    && support.capacityThreshold.maxOpenThreads > 0
    && support.capacityThreshold.maxFailedNotifications >= 0
    && support.backlogAgeThresholdMs > 0
    && support.lastReviewedAt > 0
    && openThreads.length < support.capacityThreshold.maxOpenThreads
    && state.notifications.filter((notification) => notification.status === 'failed').length <= support.capacityThreshold.maxFailedNotifications
    && oldestOpenThreadAgeMs <= support.backlogAgeThresholdMs
    && support.phaseIncidentCounts.retryExhausted === 0
    && support.phaseIncidentCounts.noRepair === 0
}
