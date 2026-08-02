import { describe, expect, it } from 'vitest'

import type { BusinessOwnerRecord, BusinessRecord, ClaimRecord } from '@/modules/business/public'
import type {
  BusinessOfferingRecord,
  BusinessOfferingRevisionRecord,
  OfferingAccessPathRecord,
} from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { encodeGovernedAction, type GovernedActionEncoding } from '@/modules/governed-action/public'
import { buildGovernedSendIntent } from '@/modules/inquiries/internal/governed-send'
import { createEmptyInquirySourceState, submitInquiry } from '@/modules/inquiries/internal/ledger'
import {
  deleteInquiryPrivateContent,
  readInquiryPrivacyTombstone,
} from '@/modules/inquiries/internal/privacy'
import type {
  CapabilityLaunchSupportRecord,
  InquirySourceState,
  ResolvableOwnerRecipient,
  SubmitInquiryCommand,
} from '@/modules/inquiries/public'

const ownerId = brandNonEmpty('owner:privacy-erase', 'OwnerId')
const claimId = brandNonEmpty('claim:privacy-erase', 'ClaimId')
const businessId = brandNonEmpty('business:privacy-erase', 'BusinessId')
const offeringRef = brandNonEmpty('offering:privacy-erase', 'OfferingRef')
const now = 1_900_000_000_000
const customerAccessKeyring = {
  keyId: 'test-inquiry-access-v1',
  secret: 'test-inquiry-access-secret-0123456789abcdef',
} as const
const governedSendIntegrityKeyring = {
  activeKeyId: 'test-governed-send-integrity-v1',
  signingSecret: 'test-governed-send-integrity-secret-0123456789abcdef',
  verificationSecrets: {
    'test-governed-send-integrity-v1': 'test-governed-send-integrity-secret-0123456789abcdef',
  },
} as const
const target = { businessId, offeringRef } as const

describe('inquiry privacy erasure', () => {
  it('redacts message bodies, appends tombstone + erasure lineage, and preserves receipt evidence fields', () => {
    const submit = submitInquiry(sourceState(), submitCommand('privacy-erase', {
      body: 'Private pipe leak details that must leave the message body.',
      contact: { name: 'Private Customer', email: 'private.customer@example.test' },
    }))
    expect(submit.kind).toBe('ok')
    if (submit.kind !== 'ok') throw new Error(submit.code)

    const beforeReceipt = submit.state.governedSendReceipts[0]
    expect(beforeReceipt?.retention).toBe('recoverable')
    if (beforeReceipt?.retention !== 'recoverable') throw new Error('expected recoverable receipt')

    const evidenceBefore = {
      digest: beforeReceipt.digest,
      algorithm: beforeReceipt.algorithm,
      schemaVersion: beforeReceipt.schemaVersion,
      createdAt: beforeReceipt.createdAt,
      operationKey: beforeReceipt.operationKey,
      threadId: beforeReceipt.threadId,
      admissionProof: beforeReceipt.admissionProof,
      recipientRef: beforeReceipt.recipientRef,
      canonicalBytesBase64: beforeReceipt.canonicalBytesBase64,
    }

    const deleted = deleteInquiryPrivateContent(submit.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      reasonCode: 'privacy_delete_requested',
      operationKey: operationKey('privacy-erase-op'),
      correlationId: correlationId('privacy-erase-op'),
      now: now + 11,
    })
    expect(deleted.kind).toBe('ok')
    if (deleted.kind !== 'ok') throw new Error(deleted.code)

    expect(deleted.tombstone).toMatchObject({
      status: 'applied',
      reasonCode: 'privacy_delete_requested',
      threadId: submit.thread.threadId,
      receiptErasureCount: 1,
    })
    expect(deleted.state.messages.every((message) => message.body === '[private content deleted]')).toBe(true)
    expect(deleted.state.messages.every((message) => message.privateDeletedAt === now + 11)).toBe(true)
    expect(deleted.state.governedSendErasureLineage).toHaveLength(1)

    const afterReceipt = deleted.state.governedSendReceipts[0]
    expect(afterReceipt?.retention).toBe('erased')
    if (afterReceipt?.retention !== 'erased') throw new Error('expected erased receipt')

    expect(afterReceipt.digest).toBe(evidenceBefore.digest)
    expect(afterReceipt.algorithm).toBe(evidenceBefore.algorithm)
    expect(afterReceipt.schemaVersion).toBe(evidenceBefore.schemaVersion)
    expect(afterReceipt.createdAt).toBe(evidenceBefore.createdAt)
    expect(afterReceipt.operationKey).toBe(evidenceBefore.operationKey)
    expect(afterReceipt.threadId).toBe(evidenceBefore.threadId)
    expect(afterReceipt.admissionProof).toEqual(evidenceBefore.admissionProof)
    expect(afterReceipt.recipientRef).toBe(evidenceBefore.recipientRef)
    expect('canonicalBytesBase64' in afterReceipt).toBe(false)
  })

  it('replays duplicate privacy delete and rejects same-key reason changes', () => {
    const submit = submitInquiry(sourceState(), submitCommand('privacy-replay'))
    expect(submit.kind).toBe('ok')
    if (submit.kind !== 'ok') throw new Error(submit.code)

    const command = {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      reasonCode: 'privacy_delete_requested',
      operationKey: operationKey('privacy-replay-op'),
      correlationId: correlationId('privacy-replay-op'),
      now: now + 11,
    } as const

    const deleted = deleteInquiryPrivateContent(submit.state, command)
    expect(deleted.kind).toBe('ok')
    if (deleted.kind !== 'ok') throw new Error(deleted.code)

    const replay = deleteInquiryPrivateContent(deleted.state, { ...command, now: now + 12 })
    expect(replay).toMatchObject({ kind: 'ok', code: 'inquiry_private_content_delete_replayed' })

    const conflict = deleteInquiryPrivateContent(deleted.state, {
      ...command,
      reasonCode: 'changed_reason',
      now: now + 12,
    })
    expect(conflict).toMatchObject({ kind: 'error', code: 'inquiry_duplicate_conflict' })
  })

  it('reads privacy tombstones for the owning thread', () => {
    const submit = submitInquiry(sourceState(), submitCommand('privacy-read'))
    expect(submit.kind).toBe('ok')
    if (submit.kind !== 'ok') throw new Error(submit.code)

    const deleted = deleteInquiryPrivateContent(submit.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      reasonCode: 'privacy_delete_requested',
      operationKey: operationKey('privacy-read-op'),
      correlationId: correlationId('privacy-read-op'),
      now: now + 11,
    })
    expect(deleted.kind).toBe('ok')
    if (deleted.kind !== 'ok') throw new Error(deleted.code)

    const tombstones = readInquiryPrivacyTombstone(deleted.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
    })
    expect(tombstones.kind).toBe('ok')
    if (tombstones.kind !== 'ok') throw new Error(tombstones.code)
    expect(tombstones.tombstones).toHaveLength(1)
    expect(tombstones.tombstones[0]?.operationKey).toBe(operationKey('privacy-read-op'))
  })
})

function submitCommand(
  key: string,
  overrides: Partial<SubmitInquiryCommand> = {},
): SubmitInquiryCommand {
  const { expectedDigest, ...commandOverrides } = overrides
  const command = {
    target,
    body: 'Can a human owner contact me about this offering?',
    contact: { email: 'customer@example.test' },
    operationKey: operationKey(key),
    correlationId: correlationId(key),
    pseudonymousSessionId: `session:${key}`,
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

function encodeCommand(
  command: Pick<SubmitInquiryCommand, 'target' | 'body' | 'contact' | 'origin'>,
): GovernedActionEncoding {
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

function sourceState(overrides: Partial<InquirySourceState> = {}): InquirySourceState {
  return createEmptyInquirySourceState({
    businesses: [business()],
    businessOfferings: [offering()],
    businessOfferingRevisions: [offeringRevision()],
    offeringAccessPaths: [inquiryAccessPath()],
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
    slug: brandNonEmpty('privacy-erase', 'Slug'),
    name: 'Privacy Plumbing',
    normalizedName: 'privacy plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicStatus: 'published',
    trustTier: 'contact_confirmed',
    claimStatus: 'published',
    sourceHash: canonicalDigest({ businessId: 'business:privacy-erase' }),
    createdAt: now,
    updatedAt: now,
  }
}

function owner(): BusinessOwnerRecord {
  return {
    ownerId,
    clerkUserId: 'clerk:owner-privacy-erase',
    displayName: 'Privacy Owner',
    createdAt: now,
    updatedAt: now,
  }
}

function claim(): ClaimRecord {
  return {
    claimId,
    ownerId,
    businessId,
    slug: brandNonEmpty('privacy-erase', 'Slug'),
    status: 'published',
    submittedFactsHash: canonicalDigest({ claimId: 'claim:privacy-erase' }),
    createdAt: now,
    updatedAt: now,
  }
}

function resolvableOwnerRecipient(): ResolvableOwnerRecipient {
  return {
    ownerId,
    recipientRef: 'email:owner@privacy.example.test',
    resolvedAt: now,
  }
}

function offering(): BusinessOfferingRecord {
  return {
    offeringRef,
    businessId,
    currentRevision: 1,
    status: 'published',
    createdAt: now,
    updatedAt: now,
  }
}

function offeringRevision(): BusinessOfferingRevisionRecord {
  return {
    offeringRef,
    businessId,
    revision: 1,
    name: 'Emergency plumbing',
    category: 'Emergency plumbing',
    summary: 'Human triage for urgent plumbing issues.',
    sourceHash: canonicalDigest({ offeringRef: String(offeringRef), revision: 1 }),
    createdAt: now,
  }
}

function inquiryAccessPath(): OfferingAccessPathRecord {
  const sourceHash = canonicalDigest({ offeringRef: String(offeringRef), path: 'ae_inquiry' })
  return {
    accessPathRef: brandNonEmpty('access:privacy-erase:inquiry', 'AccessPathRef'),
    businessId,
    offeringRef,
    offeringRevision: 1,
    offeringSourceHash: canonicalDigest({ offeringRef: String(offeringRef), revision: 1 }),
    status: 'published',
    descriptor: {
      kind: 'human_request',
      channel: 'ae_inquiry',
      disclosure: 'Use the source-owned inquiry form for a first contact.',
    },
    sourceHash,
    createdAt: now,
    updatedAt: now,
  }
}

function supportRecord(): CapabilityLaunchSupportRecord {
  return {
    capability: 'human_inquiry_owner_inbox',
    primaryOwnerRef: String(ownerId),
    primaryAdminOperatorRef: 'admin:phase2-primary',
    backupOwnerRef: 'owner:phase2-backup',
    backupAdminOperatorRef: 'admin:phase2-backup',
    supportedStage: 'manual_support',
    supportedChannels: ['public_inquiry', 'owner_inbox', 'email_notification', 'provider_readback', 'operator_readback'],
    capacityThreshold: { maxOpenThreads: 10, maxFailedNotifications: 2 },
    backlogAgeThresholdMs: 7 * 24 * 60 * 60 * 1_000,
    phaseIncidentCounts: { retryExhausted: 0, noRepair: 0, unresolvedDeliveryFailures: 0, abuseBlocked: 0, privacyDeletes: 0 },
    supportEscalationPath: 'Phase 2 owner inbox support queue.',
    claimDisablePath: 'Set inquiries_enabled false or remove inquiry_available from the service capability.',
    perChannelKillRules: [
      {
        channel: 'public_claim',
        trigger: 'Capacity, backlog, retry-exhausted, or no-repair thresholds are exceeded.',
        action: 'Hide positive inquiry availability while preserving owner readback.',
      },
    ],
    evidenceRefs: ['tests/unit/inquiries/privacy-erasure.test.ts'],
    sourceHash: canonicalDigest({ supportRecord: 'human_inquiry_owner_inbox' }),
    correlationId: correlationId('support-record'),
    lastReviewedAt: now + 1_000,
  }
}

function operationKey(value: string) {
  return brandNonEmpty(`inquiry:${value}`, 'OperationKey')
}

function correlationId(value: string) {
  return brandNonEmpty(`correlation:inquiry:${value}`, 'CorrelationId')
}
