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
import {
  bindInquiryNotificationDispatches,
  closeInquiry,
  createEmptyInquirySourceState,
  markInquiryRead,
  replyToInquiry,
  submitInquiry,
} from '@/modules/inquiries/internal/ledger'
import type {
  CapabilityLaunchSupportRecord,
  InquirySourceState,
  ResolvableOwnerRecipient,
  SubmitInquiryCommand,
} from '@/modules/inquiries/public'

const ownerId = brandNonEmpty('owner:ledger-cmds', 'OwnerId')
const claimId = brandNonEmpty('claim:ledger-cmds', 'ClaimId')
const businessId = brandNonEmpty('business:ledger-cmds', 'BusinessId')
const offeringRef = brandNonEmpty('offering:ledger-cmds', 'OfferingRef')
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

describe('inquiry ledger commands', () => {
  it('submit appends receipt, operation, message, and notification facts', () => {
    const result = submitInquiry(sourceState(), submitCommand('append-facts'))
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') throw new Error(result.code)

    expect(result.state.threads).toHaveLength(1)
    expect(result.state.messages).toHaveLength(1)
    expect(result.state.notifications).toHaveLength(1)
    expect(result.state.operations).toEqual([
      expect.objectContaining({
        operationKey: operationKey('append-facts'),
        resultCode: 'inquiry_submitted',
        threadId: result.thread.threadId,
        messageId: result.message.messageId,
        notificationId: result.notification.notificationId,
      }),
    ])
    expect(result.state.governedSendReceipts).toHaveLength(1)
    expect(result.state.governedSendReceipts[0]).toMatchObject({
      retention: 'recoverable',
      operationKey: operationKey('append-facts'),
      threadId: result.thread.threadId,
      digest: result.state.governedSendReceipts[0]?.digest,
    })
    expect(result.state.governedSendIntegrityCommitments).toHaveLength(1)
  })

  it('rejects digest mismatch and replays identical submit without extra facts', () => {
    const first = submitInquiry(sourceState(), submitCommand('digest-replay'))
    expect(first.kind).toBe('ok')
    if (first.kind !== 'ok') throw new Error(first.code)

    const mismatch = submitInquiry(first.state, {
      ...submitCommand('digest-replay'),
      expectedDigest: 'sha256:deadbeef',
    })
    expect(mismatch).toMatchObject({ kind: 'error', code: 'inquiry_digest_mismatch' })

    const replay = submitInquiry(first.state, submitCommand('digest-replay'))
    expect(replay.kind).toBe('ok')
    if (replay.kind !== 'ok') throw new Error(replay.code)
    expect(replay.code).toBe('inquiry_replayed')
    expect(replay.state.threads).toHaveLength(1)
    expect(replay.state.messages).toHaveLength(1)
    expect(replay.state.operations).toHaveLength(1)
    expect(replay.state.governedSendReceipts).toHaveLength(1)
  })


  it('markRead, reply, and close gate on expectedVersion and append facts before thread replace', () => {
    const submit = submitInquiry(sourceState(), submitCommand('version-gates'))
    expect(submit.kind).toBe('ok')
    if (submit.kind !== 'ok') throw new Error(submit.code)

    const staleRead = markInquiryRead(submit.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('stale-read'),
      correlationId: correlationId('stale-read'),
      expectedVersion: submit.thread.version + 1,
      now: now + 1,
    })
    expect(staleRead).toMatchObject({ kind: 'error', code: 'inquiry_stale_version' })

    const read = markInquiryRead(submit.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('mark-read'),
      correlationId: correlationId('mark-read'),
      expectedVersion: submit.thread.version,
      now: now + 1,
    })
    expect(read.kind).toBe('ok')
    if (read.kind !== 'ok') throw new Error(read.code)
    expect(read.thread.version).toBe(submit.thread.version + 1)
    expect(read.state.operations.at(-1)).toMatchObject({
      operationKey: operationKey('mark-read'),
      resultCode: 'inquiry_read_marked',
    })
    expect(read.state.auditEvents.at(-1)).toMatchObject({ eventType: 'inquiry.read_marked' })

    const staleReply = replyToInquiry(read.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('stale-reply'),
      correlationId: correlationId('stale-reply'),
      expectedVersion: read.thread.version - 1,
      now: now + 2,
      body: 'Owner follow-up.',
    })
    expect(staleReply).toMatchObject({ kind: 'error', code: 'inquiry_stale_version' })

    const reply = replyToInquiry(read.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('reply'),
      correlationId: correlationId('reply'),
      expectedVersion: read.thread.version,
      now: now + 2,
      body: 'Owner follow-up.',
    })
    expect(reply.kind).toBe('ok')
    if (reply.kind !== 'ok') throw new Error(reply.code)
    expect(reply.state.messages).toHaveLength(2)
    expect(reply.state.notifications).toHaveLength(2)
    expect(reply.state.operations.at(-1)).toMatchObject({ resultCode: 'inquiry_replied' })
    expect(reply.thread.version).toBe(read.thread.version + 1)

    const close = closeInquiry(reply.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('close'),
      correlationId: correlationId('close'),
      expectedVersion: reply.thread.version,
      now: now + 3,
    })
    expect(close.kind).toBe('ok')
    if (close.kind !== 'ok') throw new Error(close.code)
    expect(close.thread.status).toBe('closed')
    expect(close.state.operations.at(-1)).toMatchObject({ resultCode: 'inquiry_closed' })
    expect(close.state.auditEvents.at(-1)).toMatchObject({ eventType: 'inquiry.closed' })
  })

  it('bindInquiryNotificationDispatches appends dispatch bindings onto the notification fact', () => {
    const submit = submitInquiry(sourceState(), submitCommand('bind-dispatch'))
    expect(submit.kind).toBe('ok')
    if (submit.kind !== 'ok') throw new Error(submit.code)

    const bound = bindInquiryNotificationDispatches(submit.state, {
      notificationId: submit.notification.notificationId,
      now: now + 1,
      dispatchBindings: [
        {
          dispatchId: brandNonEmpty('dispatch:ledger-1', 'NotificationDispatchId'),
          providerFamily: 'resend',
          status: 'sent',
          providerIdempotencyKey: 'ae:notification_dispatch:ledger-1',
          payloadHash: canonicalDigest({ dispatchId: 'dispatch:ledger-1', redacted: true }),
          operatorNextAction: 'terminal',
          updatedAt: now + 1,
        },
      ],
    })
    expect(bound.kind).toBe('ok')
    if (bound.kind !== 'ok') throw new Error(bound.code)
    expect(bound.notification.dispatchBindings).toHaveLength(1)
    expect(bound.notification.status).toBe('sent')
    expect(bound.state.threads).toEqual(submit.state.threads)
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
    slug: brandNonEmpty('ledger-cmds', 'Slug'),
    name: 'Ledger Plumbing',
    normalizedName: 'ledger plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicStatus: 'published',
    trustTier: 'contact_confirmed',
    claimStatus: 'published',
    sourceHash: canonicalDigest({ businessId: 'business:ledger-cmds' }),
    createdAt: now,
    updatedAt: now,
  }
}

function owner(): BusinessOwnerRecord {
  return {
    ownerId,
    clerkUserId: 'clerk:owner-ledger-cmds',
    displayName: 'Ledger Owner',
    createdAt: now,
    updatedAt: now,
  }
}

function claim(): ClaimRecord {
  return {
    claimId,
    ownerId,
    businessId,
    slug: brandNonEmpty('ledger-cmds', 'Slug'),
    status: 'published',
    submittedFactsHash: canonicalDigest({ claimId: 'claim:ledger-cmds' }),
    createdAt: now,
    updatedAt: now,
  }
}

function resolvableOwnerRecipient(): ResolvableOwnerRecipient {
  return {
    ownerId,
    recipientRef: 'email:owner@ledger.example.test',
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
    accessPathRef: brandNonEmpty('access:ledger-cmds:inquiry', 'AccessPathRef'),
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
    evidenceRefs: ['tests/unit/inquiries/ledger-commands.test.ts'],
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
