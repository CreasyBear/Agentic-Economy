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
import { encodeGovernedAction, type GovernedActionEncoding } from '@/modules/governed-action/public'
import * as inquiries from '@/modules/inquiries/public'
import {
  buildGovernedSendIntent,
  resolveGovernedSendIntegrityKeyring,
  verifyGovernedSendIntegrityCommitment,
} from '@/modules/inquiries/internal/governed-send'
import type {
  CapabilityLaunchSupportRecord,
  InquirySourceState,
  ResolvableOwnerRecipient,
  SubmitInquiryCommand,
} from '@/modules/inquiries/public'

const ownerId = brandNonEmpty('owner:evidence-integrity', 'OwnerId')
const claimId = brandNonEmpty('claim:evidence-integrity', 'ClaimId')
const businessId = brandNonEmpty('business:evidence-integrity', 'BusinessId')
const offeringRef = brandNonEmpty('offering:evidence-integrity', 'OfferingRef')
const otherOwnerId = brandNonEmpty('owner:evidence-integrity-other', 'OwnerId')
const otherClaimId = brandNonEmpty('claim:evidence-integrity-other', 'ClaimId')
const otherBusinessId = brandNonEmpty('business:evidence-integrity-other', 'BusinessId')
const now = 1_900_000_000_000
const customerAccessKeyring = {
  keyId: 'test-inquiry-access-key',
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

type GovernedSendReceipt = InquirySourceState['governedSendReceipts'][number]
type RecoverableGovernedSendReceipt = Extract<GovernedSendReceipt, { retention: 'recoverable' }>
type GovernedEnvelope = {
  wireFormat: 'governed-action:canonical-json:v1'
  schemaVersion: 1
  actionClass: 'inquiry.send:v1'
  payload: Record<string, string | null>
}

describe('governed-send evidence integrity', () => {
  it('rejects a receipt whose recipient differs from its admitted proof recipient', () => {
    const { submit, receipt } = submitAdmittedInquiry('recipient-proof-mismatch')
    const tamperedState = replaceReceipt(submit.state, {
      ...receipt,
      recipientRef: 'email:attacker@example.test',
    })

    const record = readRecord(tamperedState, submit)

    expect(record.governedSend).toBeUndefined()
    expect(record.business).toEqual({ name: 'Business unavailable', slug: '' })
  })

  it('rejects a receipt whose admitted claim belongs to another business', () => {
    const source = admittedSourceState({
      businesses: [business(), otherBusiness()],
      owners: [owner(), otherOwner()],
      claims: [claim(), otherClaim()],
      resolvableOwnerRecipients: [recipient(), otherRecipient()],
    })
    const { submit, receipt } = submitAdmittedInquiry('claim-business-mismatch', {}, source)
    const tamperedState = replaceReceipt(submit.state, {
      ...receipt,
      admissionProof: {
        ...receipt.admissionProof,
        proof: {
          ...receipt.admissionProof.proof,
          claimRef: String(otherClaimId),
        },
      },
    })

    const record = readRecord(tamperedState, submit)

    expect(record.governedSend).toBeUndefined()
    expect(record.business).toEqual({ name: 'Business unavailable', slug: '' })
  })

  it('rejects a receipt whose admitted recipient belongs to another thread owner', () => {
    const source = admittedSourceState({
      businesses: [business(), otherBusiness()],
      owners: [owner(), otherOwner()],
      claims: [claim(), otherClaim()],
      resolvableOwnerRecipients: [recipient(), otherRecipient()],
    })
    const { submit, receipt } = submitAdmittedInquiry('thread-recipient-mismatch', {}, source)
    const tamperedState = replaceReceipt(submit.state, {
      ...receipt,
      recipientRef: otherRecipient().recipientRef,
      admissionProof: {
        ...receipt.admissionProof,
        proof: {
          ...receipt.admissionProof.proof,
          recipientRef: otherRecipient().recipientRef,
        },
      },
    })

    const record = readRecord(tamperedState, submit)

    expect(record.governedSend).toBeUndefined()
    expect(record.business).toEqual({ name: 'Business unavailable', slug: '' })
  })

  it('refuses replay when non-digest receipt evidence was tampered', () => {
    const submitted = submitAdmittedInquiry('tampered-replay')
    const tamperedState = replaceReceipt(submitted.submit.state, {
      ...submitted.receipt,
      admissionProof: {
        ...submitted.receipt.admissionProof,
        proof: {
          ...submitted.receipt.admissionProof.proof,
          recipientRef: 'email:attacker@example.test',
        },
      },
    })

    const replay = inquiries.submitInquiry(tamperedState, submitted.command)

    expect(replay).toMatchObject({
      kind: 'error',
      code: 'inquiry_integrity_conflict',
      retryable: false,
    })
  })

  it.each([
    ['body', 'Altered request body'],
    ['contactEmail', 'attacker@example.test'],
  ] as const)(
    'rejects digest-valid coordinated %s bytes and digest replacement without the independent authorization commitment',
    (field, value) => {
      const { submit, receipt } = submitAdmittedInquiry(`coordinated-${field}`)
      const envelope = decodeReceipt(receipt)
      const tamperedReceipt = receiptWithEnvelope(receipt, {
        ...envelope,
        payload: { ...envelope.payload, [field]: value },
      })
      const tamperedState = replaceReceipt(submit.state, tamperedReceipt)

      const record = readRecord(tamperedState, submit)

      expect(record.governedSend).toBeUndefined()
      expect(record.business).toEqual({ name: 'Business unavailable', slug: '' })
    },
  )

  it('verifies A-created evidence after B becomes active when A is retained', () => {
    const submitted = submitAdmittedInquiry('evidence-key-rotation')
    const rotatedEvidenceKeyring = resolveGovernedSendIntegrityKeyring({
      AE_GOVERNED_SEND_INTEGRITY_SECRET: 'evidence-secret-b-0123456789abcdef0123456789',
      AE_GOVERNED_SEND_INTEGRITY_KEY_ID: 'evidence-key-b',
      AE_GOVERNED_SEND_INTEGRITY_VERIFICATION_KEYS: JSON.stringify({
        [governedSendIntegrityKeyring.activeKeyId]: governedSendIntegrityKeyring.signingSecret,
      }),
    })
    const result = inquiries.readCustomerRecord(submitted.submit.state, {
      threadId: submitted.submit.thread.threadId,
      accessKey: submitted.submit.customerAccessKey,
      keyring: customerAccessKeyring,
      governedSendIntegrityKeyring: rotatedEvidenceKeyring,
      now,
    })
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') throw new Error(result.code)
    expect(result.record.governedSend?.posture).toBe('verified')
  })

  it('fails closed when the persisted evidence key is no longer retained', () => {
    const submitted = submitAdmittedInquiry('evidence-key-missing')
    const rotatedWithoutA = resolveGovernedSendIntegrityKeyring({
      AE_GOVERNED_SEND_INTEGRITY_SECRET: 'evidence-secret-b-0123456789abcdef0123456789',
      AE_GOVERNED_SEND_INTEGRITY_KEY_ID: 'evidence-key-b',
    })
    const result = inquiries.readCustomerRecord(submitted.submit.state, {
      threadId: submitted.submit.thread.threadId,
      accessKey: submitted.submit.customerAccessKey,
      keyring: customerAccessKeyring,
      governedSendIntegrityKeyring: rotatedWithoutA,
      now,
    })
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') throw new Error(result.code)
    expect(result.record.governedSend).toBeUndefined()
    expect(result.record.business).toEqual({ name: 'Business unavailable', slug: '' })
  })

  it('keeps evidence verification independent from bearer-key rotation', () => {
    const submitted = submitAdmittedInquiry('bearer-key-independent')
    const commitment = submitted.submit.state.governedSendIntegrityCommitments[0]
    if (commitment === undefined) throw new Error('missing governed-send integrity commitment')
    const rotatedBearer = {
      keyId: 'test-inquiry-access-key-b',
      secret: 'test-inquiry-access-secret-b-0123456789abcdef',
    }
    expect(rotatedBearer.secret).not.toBe(customerAccessKeyring.secret)
    expect(verifyGovernedSendIntegrityCommitment({
      receipt: submitted.receipt,
      commitment,
      keyring: governedSendIntegrityKeyring,
    })).toBe(true)
  })

  it('rejects one explicit key ID mapped to different active and retained secrets', () => {
    expect(() => resolveGovernedSendIntegrityKeyring({
      AE_GOVERNED_SEND_INTEGRITY_SECRET: 'evidence-secret-active-0123456789abcdef012345',
      AE_GOVERNED_SEND_INTEGRITY_KEY_ID: 'same-id',
      AE_GOVERNED_SEND_INTEGRITY_VERIFICATION_KEYS: JSON.stringify({
        'same-id': 'evidence-secret-historical-0123456789abcdef01',
      }),
    })).toThrow('key ID identifies different secret material')
  })

  it('rejects whitespace-ambiguous historical key IDs', () => {
    expect(() => resolveGovernedSendIntegrityKeyring({
      AE_GOVERNED_SEND_INTEGRITY_SECRET: 'evidence-secret-b-0123456789abcdef0123456789',
      AE_GOVERNED_SEND_INTEGRITY_KEY_ID: 'evidence-key-b',
      AE_GOVERNED_SEND_INTEGRITY_VERIFICATION_KEYS: JSON.stringify({
        ' evidence-key-a ': governedSendIntegrityKeyring.signingSecret,
      }),
    })).toThrow('canonical non-empty IDs')
  })

  it('supports key IDs without object-prototype collisions', () => {
    const keyring = resolveGovernedSendIntegrityKeyring({
      AE_GOVERNED_SEND_INTEGRITY_SECRET: 'evidence-secret-constructor-0123456789abcdef0123',
      AE_GOVERNED_SEND_INTEGRITY_KEY_ID: 'constructor',
    })
    expect(keyring.activeKeyId).toBe('constructor')
    expect(keyring.verificationSecrets.constructor).toBe(keyring.signingSecret)
  })
})

function submitAdmittedInquiry(
  key: string,
  overrides: Partial<SubmitInquiryCommand> = {},
  state: InquirySourceState = admittedSourceState(),
) {
  const { expectedDigest, ...commandOverrides } = overrides
  const baseCommand = {
    target,
    body: 'Can a human owner contact me about this offering?',
    contact: { name: 'Casey Customer', email: 'casey@example.test' },
    operationKey: brandNonEmpty(`inquiry:${key}`, 'OperationKey'),
    correlationId: brandNonEmpty(`correlation:inquiry:${key}`, 'CorrelationId'),
    pseudonymousSessionId: `session:${key}`,
    customerAccessKeyring,
    governedSendIntegrityKeyring,
    now,
    ...commandOverrides,
  }
  const command = {
    ...baseCommand,
    expectedDigest: expectedDigest ?? encodeCommand(baseCommand).digest,
  }
  const submit = inquiries.submitInquiry(state, command)
  if (submit.kind !== 'ok') throw new Error(submit.code)
  const receipt = submit.state.governedSendReceipts.find(
    (candidate): candidate is RecoverableGovernedSendReceipt =>
      candidate.operationKey === command.operationKey && candidate.retention === 'recoverable',
  )
  if (receipt === undefined) throw new Error('missing recoverable governed-send receipt')
  return { command, receipt, submit }
}

function readRecord(
  state: InquirySourceState,
  submit: Extract<inquiries.SubmitInquiryResult, { kind: 'ok' }>,
) {
  const result = inquiries.readCustomerRecord(state, { threadId: submit.thread.threadId,
  accessKey: submit.customerAccessKey, keyring: customerAccessKeyring, governedSendIntegrityKeyring, now, })
  if (result.kind !== 'ok') throw new Error(result.code)
  return result.record
}

function replaceReceipt(state: InquirySourceState, receipt: GovernedSendReceipt): InquirySourceState {
  return {
    ...state,
    governedSendReceipts: state.governedSendReceipts.map((candidate) =>
      candidate.operationKey === receipt.operationKey ? receipt : candidate),
  }
}

function decodeReceipt(receipt: RecoverableGovernedSendReceipt): GovernedEnvelope {
  return JSON.parse(Buffer.from(receipt.canonicalBytesBase64, 'base64').toString('utf8')) as GovernedEnvelope
}

function receiptWithEnvelope(
  receipt: RecoverableGovernedSendReceipt,
  envelope: GovernedEnvelope,
): RecoverableGovernedSendReceipt {
  const bytes = new TextEncoder().encode(JSON.stringify(envelope))
  return {
    ...receipt,
    canonicalBytesBase64: Buffer.from(bytes).toString('base64'),
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
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
  if (encoded.kind !== 'encoded') throw new Error(`governed encoding failed: ${encoded.code}`)
  return encoded
}

function admittedSourceState(overrides: Partial<InquirySourceState> = {}): InquirySourceState {
  return inquiries.createEmptyInquirySourceState({
    businesses: [business()],
    businessOfferings: [offering()],
    businessOfferingRevisions: [offeringRevision()],
    offeringAccessPaths: [inquiryAccessPath()],
    capabilityLaunchSupportRecords: [supportRecord()],
    owners: [owner()],
    claims: [claim()],
    resolvableOwnerRecipients: [recipient()],
    ...overrides,
  })
}

function business(): BusinessRecord {
  return {
    businessId,
    ownerId,
    slug: brandNonEmpty('evidence-integrity', 'Slug'),
    name: 'Evidence Integrity Plumbing',
    normalizedName: 'evidence integrity plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicStatus: 'published',
    trustTier: 'contact_confirmed',
    claimStatus: 'published',
    sourceHash: canonicalDigest({ businessId: String(businessId) }),
    createdAt: now,
    updatedAt: now,
  }
}

function otherBusiness(): BusinessRecord {
  return {
    ...business(),
    businessId: otherBusinessId,
    ownerId: otherOwnerId,
    slug: brandNonEmpty('evidence-integrity-other', 'Slug'),
    name: 'Other Evidence Business',
    normalizedName: 'other evidence business',
    sourceHash: canonicalDigest({ businessId: String(otherBusinessId) }),
  }
}

function owner(): BusinessOwnerRecord {
  return {
    ownerId,
    clerkUserId: 'clerk:evidence-integrity-owner',
    createdAt: now,
    updatedAt: now,
  }
}

function otherOwner(): BusinessOwnerRecord {
  return {
    ownerId: otherOwnerId,
    clerkUserId: 'clerk:evidence-integrity-other-owner',
    createdAt: now,
    updatedAt: now,
  }
}

function claim(): ClaimRecord {
  return {
    claimId,
    ownerId,
    businessId,
    slug: brandNonEmpty('evidence-integrity', 'Slug'),
    status: 'published',
    submittedFactsHash: canonicalDigest({ claimId: String(claimId) }),
    createdAt: now,
    updatedAt: now,
  }
}

function otherClaim(): ClaimRecord {
  return {
    claimId: otherClaimId,
    ownerId: otherOwnerId,
    businessId: otherBusinessId,
    slug: brandNonEmpty('evidence-integrity-other', 'Slug'),
    status: 'published',
    submittedFactsHash: canonicalDigest({ claimId: String(otherClaimId) }),
    createdAt: now,
    updatedAt: now,
  }
}

function recipient(): ResolvableOwnerRecipient {
  return {
    ownerId,
    recipientRef: 'email:owner@evidence-integrity.example.test',
    resolvedAt: now,
  }
}

function otherRecipient(): ResolvableOwnerRecipient {
  return {
    ownerId: otherOwnerId,
    recipientRef: 'email:owner@other-evidence.example.test',
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
    accessPathRef: brandNonEmpty('access:evidence-integrity:inquiry', 'AccessPathRef'),
    businessId,
    offeringRef,
    offeringRevision: 1,
    offeringSourceHash: canonicalDigest({ offeringRef: String(offeringRef), revision: 1 }),
    status: 'published',
    descriptor: {
      kind: 'human_request',
      channel: 'ae_inquiry',
      disclosure: 'Use the inquiry form for a first contact.',
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
    primaryAdminOperatorRef: 'admin:evidence-integrity-primary',
    backupOwnerRef: 'owner:evidence-integrity-backup',
    backupAdminOperatorRef: 'admin:evidence-integrity-backup',
    supportedStage: 'manual_support',
    supportedChannels: ['public_inquiry', 'owner_inbox', 'email_notification', 'provider_readback', 'operator_readback'],
    capacityThreshold: { maxOpenThreads: 10, maxFailedNotifications: 2 },
    backlogAgeThresholdMs: 7 * 24 * 60 * 60 * 1_000,
    phaseIncidentCounts: {
      retryExhausted: 0,
      noRepair: 0,
      unresolvedDeliveryFailures: 0,
      abuseBlocked: 0,
      privacyDeletes: 0,
    },
    supportEscalationPath: 'Evidence integrity owner inbox support queue.',
    claimDisablePath: 'Disable inquiries or remove inquiry availability.',
    perChannelKillRules: [{
      channel: 'public_claim',
      trigger: 'Evidence integrity support capacity is exceeded.',
      action: 'Hide positive inquiry availability until an operator review.',
    }],
    evidenceRefs: ['tests/unit/inquiries/governed-send-evidence-integrity.test.ts'],
    sourceHash: canonicalDigest({ supportRecord: 'evidence-integrity' }),
    correlationId: brandNonEmpty('correlation:inquiry:evidence-integrity-support', 'CorrelationId'),
    lastReviewedAt: now + 1_000,
  }
}
