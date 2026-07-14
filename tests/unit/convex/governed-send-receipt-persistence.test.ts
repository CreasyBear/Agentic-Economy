import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import schema from '../../../convex/schema'
import { brandNonEmpty } from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'
import { encodeGovernedAction } from '@/modules/governed-action/public'
import { buildGovernedSendIntent } from '@/modules/inquiries/internal/governed-send'
import { withSourceWrite } from '../../helpers/source-write-admission'

const discoveredModules = import.meta.glob('../../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(
  Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

const now = 1_900_000_000_000
const receiptKek = 'test-inquiry-receipt-kek-0123456789abcdef'
const customerAccessSecret = 'test-inquiry-access-secret-0123456789abcdef'

const governedSendIntegritySecret = 'test-governed-send-integrity-secret-0123456789abcdef'
type Backend = TestConvex<typeof schema>
type SeededTarget = Readonly<{
  businessId: string
  serviceId: string
  capabilityKind: 'phone_inquiry'
}>
type StoredEvidence = Readonly<{
  receipt: Doc<'governedSendReceipts'>
  key: Doc<'governedSendReceiptKeys'>
}>

describe('Convex governed-send receipt persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    process.env.AE_INQUIRY_ACCESS_SECRET = customerAccessSecret
    process.env.AE_INQUIRY_RECEIPT_KEK = receiptKek
    process.env.AE_GOVERNED_SEND_INTEGRITY_SECRET = governedSendIntegritySecret
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.AE_INQUIRY_ACCESS_SECRET
    delete process.env.AE_INQUIRY_RECEIPT_KEK
    delete process.env.AE_GOVERNED_SEND_INTEGRITY_SECRET
  })

  it('accepts an exact pre-existing immutable receipt without inserting another receipt or key', async () => {
    const source = convexTest(schema, modules)
    const target = await seedAdmittedTarget(source)
    const args = submissionArgs(target, 'exact-preexisting')
    await expect(source.mutation(api.inquiries.submitPublicInquiry, args)).resolves.toMatchObject({
      kind: 'ok',
      code: 'inquiry_submitted',
    })
    const evidence = await storedEvidence(source)

    const destination = convexTest(schema, modules)
    await seedAdmittedTarget(destination)
    await copyStoredEvidence(destination, evidence, 1)

    await expect(destination.mutation(
      api.inquiries.submitPublicInquiry,
      submissionArgs(target, 'exact-preexisting'),
    )).resolves.toMatchObject({ kind: 'ok', code: 'inquiry_submitted' })

    const rows = await inquiryPersistenceRows(destination)
    expect(rows.receipts).toHaveLength(1)
    expect(rows.keys).toHaveLength(1)
    expect(rows.threads).toHaveLength(1)
    expect(rows.operations).toHaveLength(1)
  })

  it('rejects a conflicting immutable receipt with a typed integrity error and rolls back inquiry effects', async () => {
    const source = convexTest(schema, modules)
    const target = await seedAdmittedTarget(source)
    const args = submissionArgs(target, 'conflicting-preexisting')
    await source.mutation(api.inquiries.submitPublicInquiry, args)
    const evidence = await storedEvidence(source)
    const conflictingReceipt = {
      ...evidence.receipt,
      admissionProof: {
        ...evidence.receipt.admissionProof,
        proof: {
          ...evidence.receipt.admissionProof.proof,
          claimRef: 'claims:tampered',
        },
      },
    }

    const destination = convexTest(schema, modules)
    await seedAdmittedTarget(destination)
    await copyStoredEvidence(destination, { receipt: conflictingReceipt, key: evidence.key }, 1)

    await expect(destination.mutation(
      api.inquiries.submitPublicInquiry,
      submissionArgs(target, 'conflicting-preexisting'),
    )).rejects.toThrow('governed_send_receipt_conflict')

    const rows = await inquiryPersistenceRows(destination)
    expect(rows.receipts).toHaveLength(1)
    expect(rows.keys).toHaveLength(1)
    expect(rows.threads).toHaveLength(0)
    expect(rows.operations).toHaveLength(0)
  })

  it('rejects duplicate physical receipt rows with a typed integrity error and rolls back inquiry effects', async () => {
    const source = convexTest(schema, modules)
    const target = await seedAdmittedTarget(source)
    const args = submissionArgs(target, 'duplicate-preexisting')
    await source.mutation(api.inquiries.submitPublicInquiry, args)
    const evidence = await storedEvidence(source)

    const destination = convexTest(schema, modules)
    await seedAdmittedTarget(destination)
    await copyStoredEvidence(destination, evidence, 2)

    await expect(destination.mutation(
      api.inquiries.submitPublicInquiry,
      submissionArgs(target, 'duplicate-preexisting'),
    )).rejects.toThrow('governed_send_receipt_duplicate_rows')

    const rows = await inquiryPersistenceRows(destination)
    expect(rows.receipts).toHaveLength(2)
    expect(rows.keys).toHaveLength(1)
    expect(rows.threads).toHaveLength(0)
    expect(rows.operations).toHaveLength(0)
  })
  it('deletes a surviving wrapped key when exact erasure lineage already exists', async () => {
    const backend = convexTest(schema, modules)
    const target = await seedAdmittedTarget(backend)
    const submitted = await backend.mutation(api.inquiries.submitPublicInquiry, submissionArgs(target, 'erasure-repair'))
    if (submitted.kind !== 'ok') throw new Error(submitted.code)
    const evidence = await storedEvidence(backend)
    const owner = backend.withIdentity({
      subject: 'clerk:evidence-integrity-owner',
      issuer: 'https://identity.test',
      tokenIdentifier: 'clerk:evidence-integrity-owner',
    })
    const deletionArgs = withSourceWrite('owner_inquiry', {
      threadId: submitted.thread.threadId,
      reasonCode: 'privacy_delete_requested',
      operationKey: 'privacy:erasure-repair',
      correlationId: 'correlation:privacy:erasure-repair',
    })
    await expect(owner.mutation(api.inquiries.deleteCurrentOwnerInquiryPrivateContent, deletionArgs))
      .resolves.toMatchObject({ kind: 'ok', code: 'inquiry_private_content_deleted' })
    await reinsertWrappedKey(backend, evidence.key)
    const replayArgs = withSourceWrite('owner_inquiry', {
      threadId: submitted.thread.threadId,
      reasonCode: 'privacy_delete_requested',
      operationKey: 'privacy:erasure-repair',
      correlationId: 'correlation:privacy:erasure-repair',
    })

    await expect(owner.mutation(api.inquiries.deleteCurrentOwnerInquiryPrivateContent, replayArgs))
      .resolves.toMatchObject({ kind: 'ok', code: 'inquiry_private_content_delete_replayed' })
    const rows = await inquiryPersistenceRows(backend)
    expect(rows.keys).toHaveLength(0)
    expect(rows.lineage).toHaveLength(1)
    await backend.run(async (ctx) => {
      const tombstone = await ctx.db.query('inquiryPrivacyTombstones').unique()
      if (tombstone === null || tombstone.erasureEventIds[0] === undefined) throw new Error('missing erasure tombstone')
      await ctx.db.patch(tombstone._id, {
        receiptErasureCount: 2,
        erasureEventIds: [tombstone.erasureEventIds[0], tombstone.erasureEventIds[0]],
      })
    })
    await reinsertWrappedKey(backend, evidence.key)
    await expect(owner.mutation(api.inquiries.deleteCurrentOwnerInquiryPrivateContent, withSourceWrite('owner_inquiry', {
      threadId: submitted.thread.threadId,
      reasonCode: 'privacy_delete_requested',
      operationKey: 'privacy:erasure-repair',
      correlationId: 'correlation:privacy:erasure-repair',
    }))).rejects.toThrow('governed_send_erasure_lineage_conflict')
    expect((await inquiryPersistenceRows(backend)).keys).toHaveLength(1)
  })

  it('rejects conflicting same-event erasure lineage and preserves the transaction', async () => {
    const backend = convexTest(schema, modules)
    const target = await seedAdmittedTarget(backend)
    const submitted = await backend.mutation(api.inquiries.submitPublicInquiry, submissionArgs(target, 'erasure-conflict'))
    if (submitted.kind !== 'ok') throw new Error(submitted.code)
    const evidence = await storedEvidence(backend)
    const owner = backend.withIdentity({
      subject: 'clerk:evidence-integrity-owner',
      issuer: 'https://identity.test',
      tokenIdentifier: 'clerk:evidence-integrity-owner',
    })
    const deletionArgs = withSourceWrite('owner_inquiry', {
      threadId: submitted.thread.threadId,
      reasonCode: 'privacy_delete_requested',
      operationKey: 'privacy:erasure-conflict',
      correlationId: 'correlation:privacy:erasure-conflict',
    })
    await owner.mutation(api.inquiries.deleteCurrentOwnerInquiryPrivateContent, deletionArgs)
    await backend.run(async (ctx) => {
      const lineage = await ctx.db.query('governedSendErasureLineage').unique()
      if (lineage === null) throw new Error('missing erasure lineage')
      const { _id: _lineageId, _creationTime: _lineageCreation, lineageHash: _lineageHash, ...lineageMaterial } = lineage
      const conflictingMaterial = { ...lineageMaterial, reasonCode: 'tampered_reason' }
      await ctx.db.patch(lineage._id, {
        reasonCode: conflictingMaterial.reasonCode,
        lineageHash: stableHash(conflictingMaterial),
      })
    })
    await reinsertWrappedKey(backend, evidence.key)
    const replayArgs = withSourceWrite('owner_inquiry', {
      threadId: submitted.thread.threadId,
      reasonCode: 'privacy_delete_requested',
      operationKey: 'privacy:erasure-conflict',
      correlationId: 'correlation:privacy:erasure-conflict',
    })

    await expect(owner.mutation(api.inquiries.deleteCurrentOwnerInquiryPrivateContent, replayArgs))
      .rejects.toThrow('governed_send_erasure_lineage_conflict')
    const rows = await inquiryPersistenceRows(backend)
    expect(rows.keys).toHaveLength(1)
    expect(rows.lineage).toHaveLength(1)
  })

  it.each([false, true])(
    'rejects valid plus conflicting duplicate lineage transactionally when wrapped key present=%s',
    async (restoreKey) => {
      const backend = convexTest(schema, modules)
      const target = await seedAdmittedTarget(backend)
      const submitted = await backend.mutation(api.inquiries.submitPublicInquiry, submissionArgs(target, `duplicate-lineage-${restoreKey}`))
      if (submitted.kind !== 'ok') throw new Error(submitted.code)
      const evidence = await storedEvidence(backend)
      const owner = backend.withIdentity({
        subject: 'clerk:evidence-integrity-owner', issuer: 'https://identity.test', tokenIdentifier: 'clerk:evidence-integrity-owner',
      })
      const operationKey = `privacy:duplicate-lineage-${restoreKey}`
      const correlationId = `correlation:${operationKey}`
      await owner.mutation(api.inquiries.deleteCurrentOwnerInquiryPrivateContent, withSourceWrite('owner_inquiry', {
        threadId: submitted.thread.threadId,
        reasonCode: 'privacy_delete_requested',
        operationKey,
        correlationId,
      }))
      await backend.run(async (ctx) => {
        const lineage = await ctx.db.query('governedSendErasureLineage').unique()
        if (lineage === null) throw new Error('missing erasure lineage')
        const { _id: _lineageId, _creationTime: _lineageCreation, lineageHash: _lineageHash, ...lineageMaterial } = lineage
        const conflictingMaterial = { ...lineageMaterial, erasureEventId: `${lineage.erasureEventId}:conflict` }
        await ctx.db.insert('governedSendErasureLineage', {
          ...conflictingMaterial,
          lineageHash: stableHash(conflictingMaterial),
        })
      })
      if (restoreKey) await reinsertWrappedKey(backend, evidence.key)

      await expect(owner.mutation(api.inquiries.deleteCurrentOwnerInquiryPrivateContent, withSourceWrite('owner_inquiry', {
        threadId: submitted.thread.threadId,
        reasonCode: 'privacy_delete_requested',
        operationKey,
        correlationId,
      }))).rejects.toThrow('governed_send_erasure_lineage_duplicate_rows')
      const rows = await inquiryPersistenceRows(backend)
      expect(rows.lineage).toHaveLength(2)
      expect(rows.keys).toHaveLength(restoreKey ? 1 : 0)
    },
  )

})

async function seedAdmittedTarget(backend: Backend): Promise<SeededTarget> {
  return backend.run(async (ctx) => {
    const ownerId = await ctx.db.insert('owners', {
      clerkUserId: 'clerk:evidence-integrity-owner',
      displayName: 'Evidence Integrity Owner',
      emailHash: 'sha256:evidence-integrity-owner',
      createdAt: now,
      updatedAt: now,
    })
    const businessId = await ctx.db.insert('businesses', {
      ownerId,
      slug: 'evidence-integrity',
      name: 'Evidence Integrity Plumbing',
      normalizedName: 'evidence integrity plumbing',
      category: 'Emergency plumbing',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      publicStatus: 'published',
      trustTier: 'contact_confirmed',
      claimStatus: 'published',
      sourceHash: 'sha256:evidence-integrity-business',
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('claims', {
      ownerId,
      businessId,
      slug: 'evidence-integrity',
      status: 'published',
      submittedFactsHash: 'sha256:evidence-integrity-claim',
      createdAt: now,
      updatedAt: now,
    })
    const serviceId = await ctx.db.insert('businessServices', {
      businessId,
      serviceSlug: 'emergency-plumbing',
      name: 'Emergency plumbing',
      category: 'Emergency plumbing',
      summary: 'Human triage for urgent plumbing issues.',
      serviceArea: 'Parramatta',
      hoursOrUnknown: 'Hours supplied by owner',
      status: 'published',
      sortOrder: 1,
      sourceHash: 'sha256:evidence-integrity-service',
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('serviceCapabilities', {
      businessId,
      serviceId,
      kind: 'phone_inquiry',
      status: 'available',
      firstRequestMode: 'inquiry_available',
      publicDisclosure: 'Use the inquiry form for a first contact.',
      publicChannel: 'public_business_contact',
      callable: false,
      paymentRequired: false,
      sourceHash: 'sha256:evidence-integrity-capability',
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('capabilityLaunchSupportRecords', {
      supportRecordId: 'support:evidence-integrity',
      businessId,
      capability: 'human_inquiry_owner_inbox',
      status: 'open',
      reason: 'evidence_integrity_test',
      evidenceRefs: ['tests/unit/convex/governed-send-receipt-persistence.test.ts'],
      primaryOwnerRef: String(ownerId),
      primaryAdminOperatorRef: 'admin:evidence-integrity-primary',
      backupOwnerRef: 'owner:evidence-integrity-backup',
      backupAdminOperatorRef: 'admin:evidence-integrity-backup',
      supportedStage: 'manual_support',
      supportedChannels: ['public_inquiry', 'owner_inbox', 'email_notification', 'provider_readback', 'operator_readback'],
      capacityThresholdJson: JSON.stringify({ maxOpenThreads: 10, maxFailedNotifications: 2 }),
      backlogAgeThresholdMs: 7 * 24 * 60 * 60 * 1_000,
      phaseIncidentCountsJson: JSON.stringify({
        retryExhausted: 0,
        noRepair: 0,
        unresolvedDeliveryFailures: 0,
        abuseBlocked: 0,
        privacyDeletes: 0,
      }),
      supportEscalationPath: 'Evidence integrity owner inbox support queue.',
      claimDisablePath: 'Disable inquiries or remove inquiry availability.',
      perChannelKillRulesJson: JSON.stringify([{
        channel: 'public_claim',
        trigger: 'Evidence integrity support capacity is exceeded.',
        action: 'Hide positive inquiry availability until operator review.',
      }]),
      sourceHash: 'sha256:evidence-integrity-support',
      correlationId: 'correlation:evidence-integrity-support',
      lastReviewedAt: now,
      operatorNextAction: 'Watch the evidence integrity test inbox.',
      createdAt: now,
      updatedAt: now,
    })
    return {
      businessId: String(businessId),
      serviceId: String(serviceId),
      capabilityKind: 'phone_inquiry',
    }
  })
}

function submissionArgs(target: SeededTarget, key: string) {
  const operationKey = `inquiry:${key}`
  const correlationId = `correlation:${key}`
  const body = 'Can a human owner contact me about this service?'
  const contact = { name: 'Casey Customer', email: 'casey@example.test' }
  const targetRef = {
    businessId: brandNonEmpty(target.businessId, 'BusinessId'),
    serviceId: brandNonEmpty(target.serviceId, 'ServiceId'),
    capabilityKind: target.capabilityKind,
  }
  const encoded = encodeGovernedAction(buildGovernedSendIntent({ target: targetRef, body, contact }))
  if (encoded.kind !== 'encoded') throw new Error(`governed encoding failed: ${encoded.code}`)

  return withSourceWrite('public_inquiry', {
    target,
    body,
    contact,
    pseudonymousSessionId: `session:${key}`,
    abuseBucketKey: `ip:${key}`,
    operationKey,
    expectedDigest: encoded.digest,
    correlationId,
  })
}

async function storedEvidence(backend: Backend): Promise<StoredEvidence> {
  return backend.run(async (ctx) => {
    const receipt = await ctx.db.query('governedSendReceipts').unique()
    const key = await ctx.db.query('governedSendReceiptKeys').unique()
    if (receipt === null || key === null) throw new Error('missing stored governed-send evidence')
    return { receipt, key }
  })
}

async function copyStoredEvidence(backend: Backend, evidence: StoredEvidence, receiptCopies: number): Promise<void> {
  await backend.run(async (ctx) => {
    const { _id: _receiptId, _creationTime: _receiptCreation, ...receipt } = evidence.receipt
    const { _id: _keyId, _creationTime: _keyCreation, ...key } = evidence.key
    for (let index = 0; index < receiptCopies; index += 1) {
      await ctx.db.insert('governedSendReceipts', receipt)
    }
    await ctx.db.insert('governedSendReceiptKeys', key)
  })
}

async function reinsertWrappedKey(backend: Backend, keyRow: Doc<'governedSendReceiptKeys'>): Promise<void> {
  await backend.run(async (ctx) => {
    const { _id: _keyId, _creationTime: _keyCreation, ...key } = keyRow
    await ctx.db.insert('governedSendReceiptKeys', key)
  })
}

async function inquiryPersistenceRows(backend: Backend) {
  return backend.run(async (ctx) => ({
    receipts: await ctx.db.query('governedSendReceipts').collect(),
    keys: await ctx.db.query('governedSendReceiptKeys').collect(),
    threads: await ctx.db.query('inquiryThreads').collect(),
    operations: (await ctx.db.query('operationKeys').collect()).filter((operation) => operation.scope === 'inquiry'),
    lineage: await ctx.db.query('governedSendErasureLineage').collect(),
  }))
}
