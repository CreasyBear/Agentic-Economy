import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import type { BusinessOwnerRecord, BusinessRecord, ClaimRecord } from '@/modules/business/public'
import type {
  BusinessOfferingRecord,
  BusinessOfferingRevisionRecord,
  OfferingAccessPathRecord,
} from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  encodeGovernedAction,
  verifyGovernedActionBytes,
  type GovernedActionEncoding,
} from '@/modules/governed-action/public'
import {
  buildGovernedSendIntent,
  GOVERNED_SEND_CANONICAL_FIELDS,
} from '@/modules/inquiries/internal/governed-send'
import * as inquiries from '@/modules/inquiries/public'
import type {
  CapabilityLaunchSupportRecord,
  InquirySourceState,
  ResolvableOwnerRecipient,
  SubmitInquiryCommand,
} from '@/modules/inquiries/public'

const ownerId = brandNonEmpty('owner:governed-record', 'OwnerId')
const claimId = brandNonEmpty('claim:governed-record', 'ClaimId')
const businessId = brandNonEmpty('business:governed-record', 'BusinessId')
const offeringRef = brandNonEmpty('offering:governed-record', 'OfferingRef')
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
  offeringRef,
} as const

type GovernedSendReceipt = Extract<InquirySourceState['governedSendReceipts'][number], { retention: 'recoverable' }>

const evidenceTamperCases: readonly {
  name: string
  tamper: (receipt: GovernedSendReceipt) => GovernedSendReceipt
}[] = [
  {
    name: 'stored digest',
    tamper: (receipt) => ({
      ...receipt,
      digest: `sha256:${'0'.repeat(64)}`,
    }),
  },
  {
    name: 'stored canonical bytes',
    tamper: (receipt) => ({
      ...receipt,
      canonicalBytesBase64: Buffer.from('tampered canonical bytes', 'utf8').toString('base64'),
    }),
  },
]

type GovernedEnvelopeFixture = {
  wireFormat: string
  schemaVersion: number
  actionClass: string
  payload: Record<string, unknown>
}

const targetMismatchCases = [
  { name: 'business', key: 'businessId', value: 'business:other' },
  { name: 'offering', key: 'offeringRef', value: 'offering:other' },
] as const

const invalidEnvelopeCases: readonly {
  name: string
  mutate: (envelope: GovernedEnvelopeFixture) => GovernedEnvelopeFixture
}[] = [
  {
    name: 'wire-format discriminator',
    mutate: (envelope) => ({ ...envelope, wireFormat: 'ae-governed-action:v2' }),
  },
  {
    name: 'action discriminator',
    mutate: (envelope) => ({ ...envelope, actionClass: 'inquiry.send:v2' }),
  },
  {
    name: 'schema discriminator',
    mutate: (envelope) => ({ ...envelope, schemaVersion: 2 }),
  },
  {
    name: 'unexpected payload key',
    mutate: (envelope) => ({
      ...envelope,
      payload: { ...envelope.payload, unreviewedInstruction: 'dispatch autonomously' },
    }),
  },
  {
    name: 'unexpected top-level field',
    mutate: (envelope) => Object.assign({}, envelope, { unreviewedMetadata: 'not-reviewed' }),
  },
]

describe('readCustomerRecord governed send projection', () => {
  it('projects the receipt canonical bytes in the declared field order with their exact digest', () => {
    const body = 'Please ask the owner to call about the leaking isolation valve.'
    const contact = {
      name: 'Casey Customer',
      email: 'casey.customer@example.test',
    }
    const origin = {
      kind: 'answer_thread',
      threadId: 'answer-thread:governed-record',
    } as const
    const { submit, receipt } = submitAdmittedInquiry('exact-projection', {
      body,
      contact,
      origin,
    })

    const record = readSubmittedCustomerRecord(submit)
    const expectedValues = {
      businessId: String(businessId),
      offeringRef: String(offeringRef),
      body,
      contactName: 'Casey Customer',
      contactEmail: 'casey.customer@example.test',
      contactPhone: null,
      originThreadId: 'answer-thread:governed-record',
    } as const

    const governedSend = record.governedSend
    if (governedSend?.posture !== 'verified') throw new Error('missing verified governed send projection')
    expect(governedSend.fields.map(({ key }) => key)).toEqual(
      GOVERNED_SEND_CANONICAL_FIELDS.map(({ key }) => key),
    )
    expect(governedSend.fields).toEqual(
      GOVERNED_SEND_CANONICAL_FIELDS.map(({ key, label }) => ({
        key,
        label,
        value: expectedValues[key],
      })),
    )
    expect(governedSend.digest).toBe(receipt.digest)
  })

  it.each(evidenceTamperCases)(
    'omits governed evidence when the $name is tampered while preserving the legacy record',
    ({ tamper }) => {
      const body = 'Can the owner contact me about a leaking kitchen tap?'
      const { submit, receipt } = submitAdmittedInquiry('tampered-evidence', {
        body,
        notificationStatus: 'queued',
      })
      const tamperedState: InquirySourceState = {
        ...submit.state,
        governedSendReceipts: [tamper(receipt)],
      }

      const result = inquiries.readCustomerRecord(tamperedState, { threadId: submit.thread.threadId, accessKey: customerAccessKey(submit), keyring: customerAccessKeyring, governedSendIntegrityKeyring, now })

      expect(result.kind).toBe('ok')
      if (result.kind !== 'ok') throw new Error(result.code)
      expect(result.record.governedSend).toBeUndefined()
      expect(result.record).toMatchObject({
        schemaVersion: 'inquiry-customer-record:v1',
        threadId: submit.thread.threadId,
        business: {
          name: 'Business unavailable',
          slug: '',
        },
        submitted: {
          messageSummary: body,
          submittedAt: now,
        },
        delivery: {
          state: 'queued',
        },
      })
    },
  )

  it('does not expose a valid receipt reassigned to a different thread', () => {
    const source = submitAdmittedInquiry('binding-source')
    const destinationBody = 'Please ask a human owner to contact me about the destination inquiry.'
    const destination = submitAdmittedInquiry(
      'binding-destination',
      { body: destinationBody },
      source.submit.state,
    )
    const reassignedState: InquirySourceState = {
      ...destination.submit.state,
      governedSendReceipts: [{
        ...source.receipt,
        threadId: destination.submit.thread.threadId,
      }],
    }

    const result = inquiries.readCustomerRecord(reassignedState, { threadId: destination.submit.thread.threadId, accessKey: customerAccessKey(destination.submit), keyring: customerAccessKeyring, governedSendIntegrityKeyring, now })

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') throw new Error(result.code)
    expect(result.record.governedSend).toBeUndefined()
    expect(result.record).toMatchObject({
      threadId: destination.submit.thread.threadId,
      submitted: { messageSummary: destinationBody },
    })
  })

  it.each(targetMismatchCases)(
    'omits digest-valid governed evidence when its decoded $name target does not match the thread',
    ({ key, value }) => {
      const { submit, receipt } = submitAdmittedInquiry(`target-mismatch-${key}`)
      const envelope = decodeReceiptEnvelope(receipt)
      const mismatchedReceipt = receiptWithJson(receipt, {
        ...envelope,
        payload: { ...envelope.payload, [key]: value },
      })
      requireDigestValidFixture(mismatchedReceipt)
      const state: InquirySourceState = {
        ...submit.state,
        governedSendReceipts: [mismatchedReceipt],
      }

      const result = inquiries.readCustomerRecord(state, { threadId: submit.thread.threadId, accessKey: customerAccessKey(submit), keyring: customerAccessKeyring, governedSendIntegrityKeyring, now })

      expect(result.kind).toBe('ok')
      if (result.kind !== 'ok') throw new Error(result.code)
      expect(result.record.governedSend).toBeUndefined()
      expect(result.record.threadId).toBe(submit.thread.threadId)
    },
  )

  it.each(invalidEnvelopeCases)(
    'omits governed evidence with a digest-valid $name mismatch',
    ({ mutate }) => {
      const { submit, receipt } = submitAdmittedInquiry('invalid-envelope')
      const invalidReceipt = receiptWithJson(receipt, mutate(decodeReceiptEnvelope(receipt)))
      requireDigestValidFixture(invalidReceipt)
      const state: InquirySourceState = {
        ...submit.state,
        governedSendReceipts: [invalidReceipt],
      }

      const result = inquiries.readCustomerRecord(state, { threadId: submit.thread.threadId, accessKey: customerAccessKey(submit), keyring: customerAccessKeyring, governedSendIntegrityKeyring, now })

      expect(result.kind).toBe('ok')
      if (result.kind !== 'ok') throw new Error(result.code)
      expect(result.record.governedSend).toBeUndefined()
      expect(result.record).toMatchObject({
        threadId: submit.thread.threadId,
        business: { name: 'Business unavailable', slug: '' },
        submitted: { messageSummary: 'Can a human owner contact me about this offering?' },
      })
    },
  )

  it('omits governed evidence when digest-valid stored bytes are not valid UTF-8', () => {
    const { submit, receipt } = submitAdmittedInquiry('invalid-utf8')
    const validBytes = Buffer.from(receipt.canonicalBytesBase64, 'base64')
    const bodyByteOffset = validBytes.indexOf('human')
    if (bodyByteOffset < 0) throw new Error('missing expected body bytes')
    const invalidUtf8Bytes = Uint8Array.from(validBytes)
    invalidUtf8Bytes[bodyByteOffset] = 0xff
    const invalidReceipt = receiptWithBytes(receipt, invalidUtf8Bytes)
    requireDigestValidFixture(invalidReceipt)
    const state: InquirySourceState = {
      ...submit.state,
      governedSendReceipts: [invalidReceipt],
    }

    const result = inquiries.readCustomerRecord(state, { threadId: submit.thread.threadId, accessKey: customerAccessKey(submit), keyring: customerAccessKeyring, governedSendIntegrityKeyring, now })

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') throw new Error(result.code)
    expect(result.record.governedSend).toBeUndefined()
    expect(result.record.threadId).toBe(submit.thread.threadId)
  })

  it('projects immutable erasure lineage without retaining recoverable receipt bytes', () => {
    const body = 'Please ask the owner to contact me about private plumbing details.'
    const { submit, receipt } = submitAdmittedInquiry('privacy-tombstone', { body })
    const before = readSubmittedCustomerRecord(submit)
    if (before.governedSend?.posture !== 'verified') {
      throw new Error('missing verified governed send projection before privacy deletion')
    }

    const deleted = inquiries.deleteInquiryPrivateContent(submit.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      reasonCode: 'privacy_delete_requested',
      operationKey: operationKey('privacy-tombstone-delete'),
      correlationId: correlationId('privacy-tombstone-delete'),
      now: now + 1,
    })
    expect(deleted.kind).toBe('ok')
    if (deleted.kind !== 'ok') throw new Error(deleted.code)

    const result = inquiries.readCustomerRecord(deleted.state, { threadId: submit.thread.threadId,
    accessKey: customerAccessKey(submit), keyring: customerAccessKeyring, governedSendIntegrityKeyring, now: now + 1, })

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') throw new Error(result.code)
    expect(result.record.governedSend).toMatchObject({
      posture: 'erased',
      digest: receipt.digest,
      erasedAt: now + 1,
      erasureEventId: expect.any(String),
    })
    expect(result.record.governedSend).not.toHaveProperty('fields')
    expect(deleted.state.governedSendReceipts[0]).not.toHaveProperty('canonicalBytesBase64')
    expect(deleted.state.governedSendErasureLineage).toEqual([
      expect.objectContaining({
        receiptOperationKey: receipt.operationKey,
        digest: receipt.digest,
        destroyedAt: now + 1,
      }),
    ])
    const mismatchedCountState = {
      ...deleted.state,
      privacyTombstones: deleted.state.privacyTombstones.map((tombstone) =>
        tombstone.threadId === submit.thread.threadId
          ? { ...tombstone, receiptErasureCount: tombstone.receiptErasureCount + 1 }
          : tombstone),
    }
    const mismatchedCountRead = inquiries.readCustomerRecord(mismatchedCountState, {
      threadId: submit.thread.threadId,
      accessKey: customerAccessKey(submit),
      keyring: customerAccessKeyring,
      governedSendIntegrityKeyring,
      now: now + 1,
    })
    expect(mismatchedCountRead.kind).toBe('ok')
    if (mismatchedCountRead.kind !== 'ok') throw new Error(mismatchedCountRead.code)
    expect(mismatchedCountRead.record.governedSend).toBeUndefined()
    const originalLineage = deleted.state.governedSendErasureLineage[0]
    if (originalLineage === undefined) throw new Error('missing erased lineage')
    const duplicateLineageState = {
      ...deleted.state,
      governedSendErasureLineage: [
        ...deleted.state.governedSendErasureLineage,
        { ...originalLineage, erasureEventId: `${originalLineage.erasureEventId}:conflict` },
      ],
    }
    const duplicateLineageRead = inquiries.readCustomerRecord(duplicateLineageState, {
      threadId: submit.thread.threadId,
      accessKey: customerAccessKey(submit),
      keyring: customerAccessKeyring,
      governedSendIntegrityKeyring,
      now: now + 1,
    })
    expect(duplicateLineageRead.kind).toBe('ok')
    if (duplicateLineageRead.kind !== 'ok') throw new Error(duplicateLineageRead.code)
    expect(duplicateLineageRead.record.governedSend).toBeUndefined()
    expect(result.record).toMatchObject({
      schemaVersion: 'inquiry-customer-record:v1',
      threadId: submit.thread.threadId,
      business: { name: 'Governed Record Plumbing', slug: 'governed-record' },
      submitted: { messageSummary: '[private content deleted]', submittedAt: now },
    })
  })

  it('keeps receipt input facts immutable and distinct from later delivery and reply outcomes', () => {
    const body =
      'Please ask the owner about the isolation valve beside the hot-water unit, including whether a plumber can inspect the corrosion this week.'
    const replyBody = 'The owner has received the inquiry and will call tomorrow morning.'
    const { submit } = submitAdmittedInquiry('immutable-outcomes', {
      body,
      contact: { name: 'Morgan Customer', phone: '+61 400 123 456' },
      notificationStatus: 'queued',
    })
    const before = readSubmittedCustomerRecord(submit)
    if (before.governedSend?.posture !== 'verified') throw new Error('missing verified governed send projection')

    const dispatchId = brandNonEmpty('notification_dispatch:governed-record', 'NotificationDispatchId')
    const delivered = inquiries.bindInquiryNotificationDispatches(submit.state, {
      notificationId: submit.notification.notificationId,
      dispatchBindings: [
        {
          dispatchId,
          providerFamily: 'resend',
          status: 'sent',
          providerIdempotencyKey: 'ae:notification_dispatch:governed-record',
          payloadHash: canonicalDigest({ dispatchId, status: 'sent' }),
          operatorNextAction: 'none',
          updatedAt: now + 1,
        },
      ],
      now: now + 1,
    })
    expect(delivered.kind).toBe('ok')
    if (delivered.kind !== 'ok') throw new Error(delivered.code)

    const replied = inquiries.replyToInquiry(delivered.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('immutable-reply'),
      correlationId: correlationId('immutable-reply'),
      expectedVersion: submit.thread.version,
      now: now + 2,
      body: replyBody,
      notificationStatus: 'sent',
    })
    expect(replied.kind).toBe('ok')
    if (replied.kind !== 'ok') throw new Error(replied.code)

    const afterResult = inquiries.readCustomerRecord(replied.state, { threadId: submit.thread.threadId, accessKey: customerAccessKey(submit), keyring: customerAccessKeyring, governedSendIntegrityKeyring, now })
    expect(afterResult.kind).toBe('ok')
    if (afterResult.kind !== 'ok') throw new Error(afterResult.code)
    const governedSend = afterResult.record.governedSend
    if (governedSend?.posture !== 'verified') throw new Error('missing verified governed send projection')

    expect(governedSend).toEqual(before.governedSend)
    expect(afterResult.record.delivery).toEqual({
      state: 'sent',
      label: 'Delivery recorded',
      updatedAt: now + 1,
    })
    expect(afterResult.record.reply).toEqual({
      body: replyBody,
      createdAt: now + 2,
    })
    if (afterResult.record.reply === undefined) throw new Error('missing customer reply')
    expect(afterResult.record.submitted.messageSummary).toBe(`${body.slice(0, 93)}...`)
    expect(governedSend.fields.find(({ key }) => key === 'body')?.value).toBe(body)
    expect(governedSend.fields.find(({ key }) => key === 'contactName')?.value).toBe(
      'Morgan Customer',
    )
    expect(governedSend.fields.find(({ key }) => key === 'contactEmail')?.value).toBeNull()
    expect(governedSend.fields.find(({ key }) => key === 'contactPhone')?.value).toBe(
      '+61 400 123 456',
    )
    expect(governedSend.fields.find(({ key }) => key === 'originThreadId')?.value).toBeNull()
    expect(afterResult.record.submitted.messageSummary).not.toBe(body)
    expect(afterResult.record.reply.body).not.toBe(body)
  })
})

function submitAdmittedInquiry(
  key: string,
  overrides: Partial<SubmitInquiryCommand> = {},
  state: InquirySourceState = admittedSourceState(),
) {
  const { expectedDigest, ...commandOverrides } = overrides
  const command = {
    target,
    body: 'Can a human owner contact me about this offering?',
    contact: { email: 'customer@example.test' },
    operationKey: operationKey(key),
    correlationId: correlationId(key),
    pseudonymousSessionId: `session:${key}`,
    customerAccessKeyring,
    governedSendIntegrityKeyring,
    now,
    ...commandOverrides,
  }
  const submit = inquiries.submitInquiry(state, {
    ...command,
    expectedDigest: expectedDigest ?? encodeCommand(command).digest,
  })
  if (submit.kind !== 'ok') throw new Error(submit.code)
  const receipt = submit.state.governedSendReceipts.find(
    (candidate) => candidate.operationKey === command.operationKey,
  )
  if (receipt?.retention !== 'recoverable') throw new Error('missing recoverable governed send receipt')

  return { receipt, submit }
}

function readSubmittedCustomerRecord(
  submit: Extract<inquiries.SubmitInquiryResult, { kind: 'ok' }>,
) {
  const result = inquiries.readCustomerRecord(submit.state, { threadId: submit.thread.threadId, accessKey: customerAccessKey(submit), keyring: customerAccessKeyring, governedSendIntegrityKeyring, now })
  if (result.kind !== 'ok') throw new Error(result.code)
  return result.record
}

function customerAccessKey(submit: Extract<inquiries.SubmitInquiryResult, { kind: 'ok' }>): string {
  return submit.customerAccessKey
}

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

function decodeReceiptEnvelope(receipt: GovernedSendReceipt): GovernedEnvelopeFixture {
  const decoded = Buffer.from(receipt.canonicalBytesBase64, 'base64').toString('utf8')
  return JSON.parse(decoded) as GovernedEnvelopeFixture
}

function receiptWithJson(receipt: GovernedSendReceipt, value: GovernedEnvelopeFixture): GovernedSendReceipt {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  return receiptWithBytes(receipt, bytes)
}

function receiptWithBytes(receipt: GovernedSendReceipt, bytes: Uint8Array): GovernedSendReceipt {
  return {
    ...receipt,
    canonicalBytesBase64: Buffer.from(bytes).toString('base64'),
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  }
}

function requireDigestValidFixture(receipt: GovernedSendReceipt): void {
  const bytes = Uint8Array.from(Buffer.from(receipt.canonicalBytesBase64, 'base64'))
  if (!verifyGovernedActionBytes(bytes, receipt.digest)) {
    throw new Error('expected a digest-valid governed receipt fixture')
  }
}

function admittedSourceState(): InquirySourceState {
  return inquiries.createEmptyInquirySourceState({
    businesses: [business()],
    businessOfferings: [offering()],
    businessOfferingRevisions: [offeringRevision()],
    offeringAccessPaths: [inquiryAccessPath()],
    capabilityLaunchSupportRecords: [supportRecord()],
    suppressionRules: [],
    owners: [owner()],
    claims: [claim()],
    resolvableOwnerRecipients: [resolvableOwnerRecipient()],
  })
}

function business(): BusinessRecord {
  return {
    businessId,
    ownerId,
    slug: brandNonEmpty('governed-record', 'Slug'),
    name: 'Governed Record Plumbing',
    normalizedName: 'governed record plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicStatus: 'published',
    trustTier: 'contact_confirmed',
    claimStatus: 'published',
    sourceHash: canonicalDigest({ businessId: 'business:governed-record' }),
    createdAt: now,
    updatedAt: now,
  }
}

function owner(): BusinessOwnerRecord {
  return {
    ownerId,
    clerkUserId: 'clerk:owner-governed-record',
    displayName: 'Governed Record Plumbing Owner',
    createdAt: now,
    updatedAt: now,
  }
}

function claim(): ClaimRecord {
  return {
    claimId,
    ownerId,
    businessId,
    slug: brandNonEmpty('governed-record', 'Slug'),
    status: 'published',
    submittedFactsHash: canonicalDigest({ claimId: 'claim:governed-record' }),
    createdAt: now,
    updatedAt: now,
  }
}

function resolvableOwnerRecipient(): ResolvableOwnerRecipient {
  return {
    ownerId,
    recipientRef: 'email:owner@governed-record.example.test',
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
    accessPathRef: brandNonEmpty('access:governed-record:inquiry', 'AccessPathRef'),
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
    primaryOwnerRef: 'owner:governed-record',
    primaryAdminOperatorRef: 'admin:governed-record-primary',
    backupOwnerRef: 'owner:governed-record-backup',
    backupAdminOperatorRef: 'admin:governed-record-backup',
    supportedStage: 'manual_support',
    supportedChannels: [
      'public_inquiry',
      'owner_inbox',
      'email_notification',
      'provider_readback',
      'operator_readback',
    ],
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
    supportEscalationPath: 'Governed record owner inbox support queue.',
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
    evidenceRefs: ['tests/unit/inquiries/governed-send-record.test.ts'],
    sourceHash: canonicalDigest({ supportRecord: 'governed-record' }),
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
