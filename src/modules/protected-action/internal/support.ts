import { stableHash } from '@/modules/common/stable-hash'

import {
  ContactFollowUpActionSlug,
  type ContactFollowUpOperatorControls,
  type ContactFollowUpSourceState,
  type ContactFollowUpSupportRecord,
} from './contact-follow-up'

export type ContactFollowUpSupportLoad = {
  proofGaps: number
  failedAttempts: number
  retryExhausted: number
  noRepair: number
  unauthorizedComplaints: number
  reversalOrDisputePosture: number
  backlogAgeMs: number
}

export type ContactFollowUpClaimGateInput = {
  state: ContactFollowUpSourceState
  controls: ContactFollowUpOperatorControls
  supportRecord: ContactFollowUpSupportRecord
  copyScanPassed: boolean
  now: number
}

export type ContactFollowUpClaimGateResult =
  | {
      allowed: true
      claimId: 'p4_contact_follow_up_owner_approved'
    }
  | {
      allowed: false
      reason:
        | 'protected_actions_disabled'
        | 'protected_action_attempts_disabled'
        | 'support_capacity_exceeded'
        | 'backlog_age_exceeded'
        | 'unresolved_proof_gaps_exceeded'
        | 'copy_scan_failed'
    }

export function defaultContactFollowUpSupportRecord(now: number): ContactFollowUpSupportRecord {
  const sourceHash = stableHash({
    selectedActionSlug: ContactFollowUpActionSlug,
    primaryOwnerRef: 'founder-owner',
    primaryAdminOperatorRef: 'founder-operator',
    supportedChannels: ['owner_inbox', 'admin_reconstruction'],
    capacityThreshold: 25,
  })

  return {
    supportRecordId: 'support:contact-follow-up:v1',
    selectedActionSlug: ContactFollowUpActionSlug,
    primaryOwnerRef: 'founder-owner',
    backupOwnerRef: 'founder-backup-owner',
    primaryAdminOperatorRef: 'founder-operator',
    supportedChannels: ['owner_inbox', 'admin_reconstruction'],
    launchStage: 'internal_alpha',
    capacityThreshold: 25,
    backlogAgeThresholdMs: 24 * 60 * 60 * 1000,
    phaseIncidentsBlocking: ['unauthorized_action_complaint', 'provider_attempt_failed', 'proof_gap_unresolved'],
    claimDisablePath: 'protected_actions_enabled',
    perChannelKillRules: [
      'disable protected_actions_enabled when unauthorized complaints are unresolved',
      'disable protected_action_attempts_enabled when proof gaps exceed threshold',
    ],
    nextReviewAt: now + 7 * 24 * 60 * 60 * 1000,
    sourceHash,
  }
}

export function readContactFollowUpSupportLoad(state: ContactFollowUpSourceState, now: number): ContactFollowUpSupportLoad {
  const unresolvedAttemptCreatedAt = state.attempts
    .filter((attempt) => attempt.outcome === 'proof_gap_recorded' || attempt.outcome === 'failed')
    .sort((left, right) => left.attemptedAt - right.attemptedAt)[0]?.attemptedAt

  return {
    proofGaps: state.receipts.filter((receipt) => receipt.kind === 'proof_gap').length,
    failedAttempts: state.attempts.filter((attempt) => attempt.outcome === 'failed').length,
    retryExhausted: state.auditEvents.filter((event) => event.eventType === 'protected_action.retry_exhausted').length,
    noRepair: state.noRepairRecords.length,
    unauthorizedComplaints: state.auditEvents.filter((event) => event.reasonCode === 'unauthorized_action_complaint').length,
    reversalOrDisputePosture: state.auditEvents.filter((event) => event.reasonCode === 'disputed' || event.reasonCode === 'reversed').length,
    backlogAgeMs: unresolvedAttemptCreatedAt === undefined ? 0 : Math.max(0, now - unresolvedAttemptCreatedAt),
  }
}

export function evaluateContactFollowUpClaimGate(input: ContactFollowUpClaimGateInput): ContactFollowUpClaimGateResult {
  if (!input.controls.protectedActionsEnabled) {
    return { allowed: false, reason: 'protected_actions_disabled' }
  }

  if (!input.controls.protectedActionAttemptsEnabled) {
    return { allowed: false, reason: 'protected_action_attempts_disabled' }
  }

  if (!input.copyScanPassed) {
    return { allowed: false, reason: 'copy_scan_failed' }
  }

  const load = readContactFollowUpSupportLoad(input.state, input.now)
  if (load.failedAttempts + load.proofGaps + load.noRepair > input.supportRecord.capacityThreshold) {
    return { allowed: false, reason: 'support_capacity_exceeded' }
  }

  if (load.backlogAgeMs > input.supportRecord.backlogAgeThresholdMs) {
    return { allowed: false, reason: 'backlog_age_exceeded' }
  }

  if (load.proofGaps > 0) {
    return { allowed: false, reason: 'unresolved_proof_gaps_exceeded' }
  }

  return { allowed: true, claimId: 'p4_contact_follow_up_owner_approved' }
}
