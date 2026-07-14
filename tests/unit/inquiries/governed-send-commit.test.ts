import { describe, expect, it } from 'vitest'

import type { BusinessOwnerRecord, BusinessRecord, ClaimRecord } from '@/modules/business/public'
import type { BusinessServiceRecord, ServiceCapabilityRecord } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'
import {
  encodeGovernedAction,
  verifyGovernedActionBytes,
  type GovernedActionEncoding,
} from '@/modules/governed-action/public'
import { buildGovernedSendIntent } from '@/modules/inquiries/internal/governed-send'
import * as inquiries from '@/modules/inquiries/public'
import type {
  CapabilityLaunchSupportRecord,
  InquirySourceState,
  ResolvableOwnerRecipient,
  SubmitInquiryCommand,
} from '@/modules/inquiries/public'
import type { SuppressionRuleRecord } from '@/modules/security/public'

const ownerId = brandNonEmpty('owner:governed-send', 'OwnerId')
const claimId = brandNonEmpty('claim:governed-send', 'ClaimId')
const businessId = brandNonEmpty('business:governed-send', 'BusinessId')
const serviceId = brandNonEmpty('service:governed-send', 'ServiceId')
const serviceSlug = brandNonEmpty('governed-send', 'Slug')
const now = 1_900_000_000_000
const customerAccessKeyring = {
  keyId: 'test-inquiry-access-v1',
  secret: 'test-inquiry-access-secret-0123456789abcdef',
} as const
const governedSendIntegrityKeyring = {
  activeKeyId: 'test-governed-send-integrity-v1',
  signingSecret: 'test-governed-send-integrity-secret-0123456789abcdef',
  verificationSecrets: { 'test-governed-send-integrity-v1': 'test-governed-send-integrity-secret-0123456789abcdef' },
} as const

const target = {
  businessId,
  serviceId,
  capabilityKind: 'phone_inquiry',
} as const

describe('submitInquiry governed send commit', () => {
  it('stores the exact reviewed canonical bytes and replays the same operation key and digest without another commit', () => {
    const baseCommand = submitCommand('same-digest', {
      body: 'Can the owner contact me about a leaking kitchen tap?',
      contact: {
        name: 'Sam Customer',
        email: 'sam.customer@example.test',
        phone: '0400 000 000',
      },
    })
    const reviewedEncoding = encodeCommand(baseCommand)
    const command = { ...baseCommand, expectedDigest: reviewedEncoding.digest }

    const first = inquiries.submitInquiry(sourceState(), command)
    expect(first.kind).toBe('ok')
    if (first.kind !== 'ok') throw new Error(first.code)

    expect(first.code).toBe('inquiry_submitted')
    expect(commitCollectionCounts(first.state)).toEqual({
      governedSendReceipts: 1,
      threads: 1,
      messages: 1,
      notifications: 1,
      operations: 1,
    })
    const receipt = first.state.governedSendReceipts?.[0]
    expect(receipt).toMatchObject({
      operationKey: command.operationKey,
      threadId: first.thread.threadId,
      digest: reviewedEncoding.digest,
      algorithm: 'sha256',
      schemaVersion: 1,
      createdAt: now,
      recipientRef: 'email:owner@governed-send.example.test',
      admissionProof: {
        version: 'r1-target-admitted:v1',
        admitted: true,
        proof: {
          kind: 'claimed_owner',
          claimRef: String(claimId),
          recipientRef: 'email:owner@governed-send.example.test',
        },
      },
    })
    if (receipt?.retention !== 'recoverable') throw new Error('missing recoverable governed send receipt')

    const storedBytes = Uint8Array.from(Buffer.from(receipt.canonicalBytesBase64, 'base64'))
    expect(storedBytes).toEqual(reviewedEncoding.canonicalBytes)
    expect(verifyGovernedActionBytes(storedBytes, receipt.digest)).toBe(true)

    const replay = inquiries.submitInquiry(first.state, command)
    expect(replay.kind).toBe('ok')
    if (replay.kind !== 'ok') throw new Error(replay.code)

    expect(replay.code).toBe('inquiry_replayed')
    expect(replay.thread.threadId).toBe(first.thread.threadId)
    expect(commitCollectionCounts(replay.state)).toEqual({
      governedSendReceipts: 1,
      threads: 1,
      messages: 1,
      notifications: 1,
      operations: 1,
    })
  })

  it('refuses the same operation key with a different reviewed digest without appending partial state', () => {
    const originalBase = submitCommand('changed-digest', {
      body: 'Can the owner contact me about the leaking kitchen tap?',
    })
    const original = {
      ...originalBase,
      expectedDigest: encodeCommand(originalBase).digest,
    }
    const first = inquiries.submitInquiry(sourceState(), original)
    expect(first.kind).toBe('ok')
    if (first.kind !== 'ok') throw new Error(first.code)
    const committedCounts = commitCollectionCounts(first.state)

    const changedBase = submitCommand('changed-digest', {
      body: 'Can the owner contact me about a leaking bathroom tap?',
    })
    const changed = {
      ...changedBase,
      expectedDigest: encodeCommand(changedBase).digest,
    }
    const refusal = inquiries.submitInquiry(first.state, changed)

    expect(refusal).toEqual({
      kind: 'error',
      code: 'inquiry_digest_mismatch',
      retryable: false,
      reason: 'The operation key was already used for a different reviewed request.',
    })
    expect(commitCollectionCounts(first.state)).toEqual(committedCounts)
  })

  it('refuses a command whose expected digest no longer matches without appending partial state', () => {
    const state = sourceState()
    const command = submitCommand('stale-review', {
      body: 'Can the owner contact me about a leaking kitchen tap?',
    })
    const staleReview = submitCommand('stale-review', {
      body: 'Can the owner contact me about a leaking bathroom tap?',
    })
    const before = commitCollectionCounts(state)

    const refusal = inquiries.submitInquiry(state, {
      ...command,
      expectedDigest: encodeCommand(staleReview).digest,
    })

    expect(refusal).toEqual({
      kind: 'error',
      code: 'inquiry_digest_mismatch',
      retryable: false,
      reason: 'The reviewed request no longer matches the request being sent.',
    })
    expect(commitCollectionCounts(state)).toEqual(before)
  })

  it('maps a lone surrogate in a canonical field to an invalid-input refusal without appending partial state', () => {
    const state = sourceState()
    const before = commitCollectionCounts(state)

    const refusal = inquiries.submitInquiry(state, submitCommand('invalid-unicode', {
      body: '\uD800',
      expectedDigest: `sha256:${'0'.repeat(64)}`,
    }))

    expect(refusal).toEqual({
      kind: 'error',
      code: 'inquiry_invalid_input',
      retryable: false,
      reason: 'Canonical governed send refused: invalid_unicode at $["payload"]["body"].',
    })
    expect(commitCollectionCounts(state)).toEqual(before)
  })

  it('refuses commit-admission drift without appending a receipt or inquiry records', () => {
    const admittedState = sourceState()
    const commitAdmissionState = sourceState({ suppressionRules: [businessSuppression()] })
    const baseCommand = submitCommand('admission-drift')
    const command = { ...baseCommand, expectedDigest: encodeCommand(baseCommand).digest }
    const admittedBefore = commitCollectionCounts(admittedState)
    const commitBefore = commitCollectionCounts(commitAdmissionState)

    const refusal = inquiries.submitInquiry(admittedState, command, commitAdmissionState)

    expect(refusal).toEqual({
      kind: 'error',
      code: 'inquiry_target_admission_conflict',
      retryable: false,
      reason: 'This business can no longer receive this inquiry.',
      blockers: [{ kind: 'suppressed', ownerLabel: 'Turn inquiry receiving back on' }],
    })
    expect(commitCollectionCounts(admittedState)).toEqual(admittedBefore)
    expect(commitCollectionCounts(commitAdmissionState)).toEqual(commitBefore)
  })
})

function encodeCommand(command: Pick<SubmitInquiryCommand, 'target' | 'body' | 'contact' | 'origin'>): GovernedActionEncoding {
  const encoded = encodeGovernedAction(buildGovernedSendIntent({
    target: command.target,
    body: command.body,
    contact: command.contact,
    ...(command.origin === undefined ? {} : { origin: command.origin }),
  }))
  if (encoded.kind !== 'encoded') {
    throw new Error(`expected governed action encoding, received ${encoded.code} at ${encoded.path}`)
  }
  return encoded
}

function commitCollectionCounts(state: InquirySourceState) {
  return {
    governedSendReceipts: state.governedSendReceipts?.length ?? 0,
    threads: state.threads.length,
    messages: state.messages.length,
    notifications: state.notifications.length,
    operations: state.operations.length,
  }
}

function submitCommand(key: string, overrides: Partial<SubmitInquiryCommand> = {}): SubmitInquiryCommand {
  const { expectedDigest, ...commandOverrides } = overrides
  const command = {
    target,
    body: 'Can a human owner contact me about this service?',
    contact: { email: 'customer@example.test' },
    operationKey: operationKey(key),
    correlationId: correlationId(key),
    pseudonymousSessionId: `session:${key}`,
    abuseBucketKey: `ip:${key}`,
    now,
    ...commandOverrides,
    customerAccessKeyring: commandOverrides.customerAccessKeyring ?? customerAccessKeyring,
    governedSendIntegrityKeyring: commandOverrides.governedSendIntegrityKeyring ?? governedSendIntegrityKeyring,
  }

  return {
    ...command,
    expectedDigest: expectedDigest ?? encodeCommand(command).digest,
  }
}

function sourceState(overrides: Partial<InquirySourceState> = {}): InquirySourceState {
  return inquiries.createEmptyInquirySourceState({
    businesses: [business()],
    businessServices: [service()],
    serviceCapabilities: [capability()],
    capabilityLaunchSupportRecords: [supportRecord()],
    suppressionRules: [],
    owners: [owner()],
    claims: [claim()],
    resolvableOwnerRecipients: [resolvableOwnerRecipient()],
    ...overrides,
  })
}

function business(): BusinessRecord {
  return {
    businessId,
    ownerId,
    slug: brandNonEmpty('governed-send', 'Slug'),
    name: 'Governed Send Plumbing',
    normalizedName: 'governed send plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicStatus: 'published',
    trustTier: 'contact_confirmed',
    claimStatus: 'published',
    sourceHash: stableHash({ businessId: 'business:governed-send' }),
    createdAt: now,
    updatedAt: now,
  }
}

function owner(): BusinessOwnerRecord {
  return {
    ownerId,
    clerkUserId: 'clerk:owner-governed-send',
    displayName: 'Governed Send Plumbing Owner',
    createdAt: now,
    updatedAt: now,
  }
}

function claim(): ClaimRecord {
  return {
    claimId,
    ownerId,
    businessId,
    slug: brandNonEmpty('governed-send', 'Slug'),
    status: 'published',
    submittedFactsHash: stableHash({ claimId: 'claim:governed-send' }),
    createdAt: now,
    updatedAt: now,
  }
}

function resolvableOwnerRecipient(): ResolvableOwnerRecipient {
  return {
    ownerId,
    recipientRef: 'email:owner@governed-send.example.test',
    resolvedAt: now,
  }
}

function service(): BusinessServiceRecord {
  return {
    serviceId,
    serviceSlug,
    businessId,
    name: 'Emergency plumbing',
    category: 'Emergency plumbing',
    summary: 'Human triage for urgent plumbing issues.',
    serviceArea: 'Parramatta',
    hoursOrUnknown: 'Hours supplied by owner',
    status: 'published',
    sortOrder: 1,
    sourceHash: stableHash({ serviceId: 'service:governed-send' }),
    createdAt: now,
    updatedAt: now,
  }
}

function capability(): ServiceCapabilityRecord {
  return {
    businessId,
    serviceId,
    kind: 'phone_inquiry',
    status: 'available',
    firstRequest: {
      mode: 'inquiry_available',
      publicChannel: 'public_business_contact',
      publicDisclosure: 'Use the source-owned inquiry form for a first contact.',
      rawContactExcluded: true,
    },
    callable: false,
    paymentRequired: false,
    sourceHash: stableHash({ capability: 'phone_inquiry' }),
    createdAt: now,
    updatedAt: now,
  }
}

function supportRecord(): CapabilityLaunchSupportRecord {
  return {
    capability: 'human_inquiry_owner_inbox',
    primaryOwnerRef: 'owner:governed-send',
    primaryAdminOperatorRef: 'admin:governed-send-primary',
    backupOwnerRef: 'owner:governed-send-backup',
    backupAdminOperatorRef: 'admin:governed-send-backup',
    supportedStage: 'manual_support',
    supportedChannels: ['public_inquiry', 'owner_inbox', 'email_notification', 'provider_readback', 'operator_readback'],
    capacityThreshold: {
      maxOpenThreads: 10,
      maxFailedNotifications: 2,
    },
    backlogAgeThresholdMs: 7 * 24 * 60 * 60 * 1_000,
    phaseIncidentCounts: {
      retryExhausted: 0,
      noRepair: 0,
      unresolvedDeliveryFailures: 0,
      abuseBlocked: 0,
      privacyDeletes: 0,
    },
    supportEscalationPath: 'Governed send owner inbox support queue.',
    claimDisablePath: 'Disable inquiries or remove inquiry availability from the service capability.',
    perChannelKillRules: [
      {
        channel: 'public_claim',
        trigger: 'Capacity or delivery thresholds are exceeded.',
        action: 'Hide positive inquiry availability while preserving owner readback.',
      },
      {
        channel: 'email_notification',
        trigger: 'Provider dispatch or readback fails.',
        action: 'Hold delivery status separately from the saved message.',
      },
    ],
    evidenceRefs: ['tests/unit/inquiries/governed-send-commit.test.ts'],
    sourceHash: stableHash({ supportRecord: 'governed-send' }),
    correlationId: correlationId('support-record'),
    lastReviewedAt: now + 1_000,
  }
}

function businessSuppression(): SuppressionRuleRecord {
  return {
    targetType: 'business',
    targetRef: businessId,
    status: 'active',
    reasonCode: 'privacy_review',
    evidenceRefs: ['evidence:governed-send-suppression'],
    createdByAdminRef: 'admin:governed-send',
    createdAt: now,
    beforePublicStatus: 'published',
    beforeClaimStatus: 'published',
  }
}

function operationKey(value: string) {
  return brandNonEmpty(`inquiry:${value}`, 'OperationKey')
}

function correlationId(value: string) {
  return brandNonEmpty(`correlation:inquiry:${value}`, 'CorrelationId')
}
