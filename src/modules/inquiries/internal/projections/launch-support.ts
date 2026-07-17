import { isBlank } from '../ledger/facts'
import type { CapabilityLaunchSupportRecord, InquirySourceState } from '../schema'

export type InquiryLaunchSupportReadiness =
  | {
      kind: 'ready'
      record: CapabilityLaunchSupportRecord
      openThreads: number
      failedNotifications: number
      oldestOpenThreadAgeMs: number
    }
  | {
      kind: 'blocked'
      reason: string
    }

export function evaluateInquiryLaunchSupportReadiness(state: InquirySourceState): InquiryLaunchSupportReadiness {
  const record = state.capabilityLaunchSupportRecords.find((candidate) => candidate.capability === 'human_inquiry_owner_inbox')
  if (record === undefined) {
    return { kind: 'blocked', reason: 'Support launch record is not ready for human inquiry.' }
  }

  if (
    isBlank(record.primaryOwnerRef) ||
    isBlank(record.primaryAdminOperatorRef) ||
    isBlank(record.backupOwnerRef) ||
    isBlank(record.backupAdminOperatorRef) ||
    isBlank(record.supportEscalationPath) ||
    isBlank(record.claimDisablePath) ||
    isBlank(record.sourceHash) ||
    isBlank(record.correlationId) ||
    record.supportedChannels.length === 0 ||
    record.perChannelKillRules.length === 0 ||
    record.evidenceRefs.length === 0 ||
    record.capacityThreshold.maxOpenThreads < 1 ||
    record.capacityThreshold.maxFailedNotifications < 0 ||
    record.backlogAgeThresholdMs < 1 ||
    record.lastReviewedAt < 1
  ) {
    return { kind: 'blocked', reason: 'Support launch record is incomplete for human inquiry.' }
  }

  const openThreads = state.threads.filter((thread) => thread.status !== 'closed')
  const failedNotifications = state.notifications.filter((notification) => notification.status === 'failed').length
  const oldestOpenThreadAgeMs =
    openThreads.length === 0 ? 0 : Math.max(0, record.lastReviewedAt - Math.min(...openThreads.map((thread) => thread.updatedAt)))

  if (openThreads.length >= record.capacityThreshold.maxOpenThreads) {
    return { kind: 'blocked', reason: 'Inquiry support capacity threshold is exceeded.' }
  }

  if (failedNotifications > record.capacityThreshold.maxFailedNotifications) {
    return { kind: 'blocked', reason: 'Inquiry delivery support threshold is exceeded.' }
  }

  if (oldestOpenThreadAgeMs > record.backlogAgeThresholdMs) {
    return { kind: 'blocked', reason: 'Inquiry support backlog age threshold is exceeded.' }
  }

  if (record.phaseIncidentCounts.retryExhausted > 0 || record.phaseIncidentCounts.noRepair > 0) {
    return { kind: 'blocked', reason: 'Inquiry support incidents must be reviewed before public claims continue.' }
  }

  return {
    kind: 'ready',
    record,
    openThreads: openThreads.length,
    failedNotifications,
    oldestOpenThreadAgeMs,
  }
}
