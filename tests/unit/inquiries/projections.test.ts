import { describe, expect, it } from 'vitest'

import type { BusinessOwnerRecord, BusinessRecord, ClaimRecord } from '@/modules/business/public'
import type { BusinessServiceRecord, ServiceCapabilityRecord } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'
import { encodeGovernedAction, type GovernedActionEncoding } from '@/modules/governed-action/public'
import { buildGovernedSendIntent } from '@/modules/inquiries/internal/governed-send'
import { createEmptyInquirySourceState, submitInquiry } from '@/modules/inquiries/internal/ledger'
import { deleteInquiryPrivateContent } from '@/modules/inquiries/internal/privacy'
import {
  listOwnerInbox,
  readCustomerRecord,
  readInquiryOperatorReconstruction,
  requestInquiryExport,
} from '@/modules/inquiries/internal/projections'
import type {
  CapabilityLaunchSupportRecord,
  InquirySourceState,
  ResolvableOwnerRecipient,
  SubmitInquiryCommand,
} from '@/modules/inquiries/public'

const ownerId = brandNonEmpty('owner:proj-cmds', 'OwnerId')
const claimId = brandNonEmpty('claim:proj-cmds', 'ClaimId')
const businessId = brandNonEmpty('business:proj-cmds', 'BusinessId')
const serviceId = brandNonEmpty('service:proj-cmds', 'ServiceId')
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
const target = { businessId, serviceId, capabilityKind: 'phone_inquiry' } as const

describe('inquiry projections', () => {
  it('projects owner inbox buckets from fixed ledger state without mutating receipts', () => {
    const submit = submitInquiry(sourceState(), submitCommand('inbox'))
    expect(submit.kind).toBe('ok')
    if (submit.kind !== 'ok') throw new Error(submit.code)

    const receiptsBefore = structuredClone(submit.state.governedSendReceipts)
    const inbox = listOwnerInbox(submit.state, { authority: { ownerId } })
    expect(inbox.empty).toBe(false)
    expect(inbox.buckets).toEqual({ unread: 1, needs_reply: 0, resolved: 0 })
    expect(inbox.inquiries[0]).toMatchObject({
      threadId: submit.thread.threadId,
      bucket: 'unread',
      notificationStatus: 'queued',
    })
    expect(submit.state.governedSendReceipts).toEqual(receiptsBefore)
  })

  it('projects customer record verified governedSend and export redaction from the same facts', () => {
    const submit = submitInquiry(sourceState(), submitCommand('customer-export', {
      body: 'Secret customer pipe leak details.',
      contact: { email: 'secret.customer@example.test' },
    }))
    expect(submit.kind).toBe('ok')
    if (submit.kind !== 'ok') throw new Error(submit.code)

    const receiptsBefore = structuredClone(submit.state.governedSendReceipts)
    const record = readCustomerRecord(submit.state, {
      threadId: submit.thread.threadId,
      accessKey: submit.customerAccessKey,
      keyring: customerAccessKeyring,
      governedSendIntegrityKeyring,
      now,
    })
    expect(record.kind).toBe('ok')
    if (record.kind !== 'ok') throw new Error(record.code)
    expect(record.record.governedSend).toMatchObject({
      posture: 'verified',
      digest: submit.state.governedSendReceipts[0]?.digest,
    })

    const exported = requestInquiryExport(submit.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
    })
    expect(exported.kind).toBe('ok')
    if (exported.kind !== 'ok') throw new Error(exported.code)
    expect(exported.exportData.messages[0]?.body).toBe('Secret customer pipe leak details.')
    expect(submit.state.governedSendReceipts).toEqual(receiptsBefore)
  })

  it('projects erased governedSend posture after privacy erase without rewriting receipt evidence fields', () => {
    const submit = submitInquiry(sourceState(), submitCommand('erased-view'))
    expect(submit.kind).toBe('ok')
    if (submit.kind !== 'ok') throw new Error(submit.code)

    const deleted = deleteInquiryPrivateContent(submit.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      reasonCode: 'privacy_delete_requested',
      operationKey: operationKey('erase-for-view'),
      correlationId: correlationId('erase-for-view'),
      now: now + 10,
    })
    expect(deleted.kind).toBe('ok')
    if (deleted.kind !== 'ok') throw new Error(deleted.code)

    const receipt = deleted.state.governedSendReceipts[0]
    expect(receipt?.retention).toBe('erased')
    if (receipt?.retention !== 'erased') throw new Error('expected erased receipt')

    const receiptsBefore = structuredClone(deleted.state.governedSendReceipts)
    const record = readCustomerRecord(deleted.state, {
      threadId: submit.thread.threadId,
      accessKey: submit.customerAccessKey,
      keyring: customerAccessKeyring,
      governedSendIntegrityKeyring,
      now: now + 10,
    })
    expect(record.kind).toBe('ok')
    if (record.kind !== 'ok') throw new Error(record.code)
    expect(record.record.governedSend).toMatchObject({
      posture: 'erased',
      digest: receipt.digest,
      erasureEventId: receipt.erasureEventId,
    })
    expect(deleted.state.governedSendReceipts).toEqual(receiptsBefore)
  })

  it('filters operator reconstruction without mutating ledger receipts', () => {
    const submit = submitInquiry(sourceState(), submitCommand('operator-filter'))
    expect(submit.kind).toBe('ok')
    if (submit.kind !== 'ok') throw new Error(submit.code)

    const receiptsBefore = structuredClone(submit.state.governedSendReceipts)
    const all = readInquiryOperatorReconstruction(submit.state)
    expect(all.rows).toHaveLength(1)
    const filtered = readInquiryOperatorReconstruction(submit.state, {
      threadId: submit.thread.threadId,
    })
    expect(filtered.rows).toHaveLength(1)
    expect(filtered.rows[0]?.threadId).toBe(submit.thread.threadId)
    expect(submit.state.governedSendReceipts).toEqual(receiptsBefore)
  })
})

function submitCommand(
  key: string,
  overrides: Partial<SubmitInquiryCommand> = {},
): SubmitInquiryCommand {
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
    slug: brandNonEmpty('proj-cmds', 'Slug'),
    name: 'Projection Plumbing',
    normalizedName: 'projection plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicStatus: 'published',
    trustTier: 'contact_confirmed',
    claimStatus: 'published',
    sourceHash: stableHash({ businessId: 'business:proj-cmds' }),
    createdAt: now,
    updatedAt: now,
  }
}

function owner(): BusinessOwnerRecord {
  return {
    ownerId,
    clerkUserId: 'clerk:owner-proj-cmds',
    displayName: 'Projection Owner',
    createdAt: now,
    updatedAt: now,
  }
}

function claim(): ClaimRecord {
  return {
    claimId,
    ownerId,
    businessId,
    slug: brandNonEmpty('proj-cmds', 'Slug'),
    status: 'published',
    submittedFactsHash: stableHash({ claimId: 'claim:proj-cmds' }),
    createdAt: now,
    updatedAt: now,
  }
}

function resolvableOwnerRecipient(): ResolvableOwnerRecipient {
  return {
    ownerId,
    recipientRef: 'email:owner@projection.example.test',
    resolvedAt: now,
  }
}

function service(): BusinessServiceRecord {
  return {
    serviceId,
    serviceSlug: brandNonEmpty('proj-cmds', 'Slug'),
    businessId,
    name: 'Emergency plumbing',
    category: 'Emergency plumbing',
    summary: 'Human triage for urgent plumbing issues.',
    serviceArea: 'Parramatta',
    hoursOrUnknown: 'Hours supplied by owner',
    status: 'published',
    sortOrder: 1,
    sourceHash: stableHash({ serviceId: 'service:proj-cmds' }),
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
    evidenceRefs: ['tests/unit/inquiries/projections.test.ts'],
    sourceHash: stableHash({ supportRecord: 'human_inquiry_owner_inbox' }),
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
