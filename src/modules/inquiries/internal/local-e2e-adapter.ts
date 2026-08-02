import { z } from 'zod'

import { LOCAL_E2E_BUSINESS_FIXTURES, type LocalE2eBusinessFixture, type LocalE2eOfferingFixture } from '@/lib/dev/local-e2e-business-fixtures'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import type { BusinessOwnerRecord, BusinessRecord, ClaimRecord } from '@/modules/business/public'
import type { BusinessOfferingRecord, BusinessOfferingRevisionRecord, OfferingAccessPathRecord } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { normalizeSlug } from '@/modules/common/normalize-slug'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { encodeGovernedAction } from '@/modules/governed-action/public'
import {
  bindInquiryNotificationDispatches as bindInquiryNotificationDispatchesLocal,
  closeInquiry as closeInquiryLocal,
  createEmptyInquirySourceState,
  listOwnerInbox as listOwnerInboxLocal,
  evaluateR1TargetAdmission,
  markInquiryRead as markInquiryReadLocal,
  readCustomerRecord as readCustomerRecordLocal,
  readInquiryDeliveryReadback as readInquiryDeliveryReadbackLocal,
  readInquiryOperatorReconstruction as readInquiryOperatorReconstructionLocal,
  readInquiryPrivacyTombstone as readInquiryPrivacyTombstoneLocal,
  readOwnerInquiry as readOwnerInquiryLocal,
  replyToInquiry as replyToInquiryLocal,
  submitInquiry as submitInquiryLocal,
  type CapabilityLaunchSupportRecord,
  type InquiryNotificationStatus,
  type InquiryOperatorReconstructionFilter,
  type InquirySourceState,
  type InquiryTargetRef,
  type InquiryThreadStatus,
  type PublicInquiryContactInput,
  type R1TargetAdmission,
} from '@/modules/inquiries/public'
import { buildGovernedSendIntent } from './governed-send'
import {
  buildSubmittedInquiryReceipt,
  type SubmittedInquiryReceipt,
} from './submitted-receipt'

export type LocalE2eInquiryBackendKind = 'local-e2e'

type PublicInquirySubmitInput = {
  target: z.infer<typeof publicInquirySubmitTargetSchema>
  body: string
  contact: PublicInquiryContactInput
  expectedDigest: string
  operationKey?: string
  inquiryOrigin?: { kind: 'answer_thread'; threadId: string }
}

const publicInquirySubmitTargetSchema = z.union([
  z.object({
    businessId: z.string(),
    offeringRef: z.string(),
  }).strict(),
  z.object({
    businessSlug: z.string(),
    offeringRef: z.string(),
  }).strict(),
])

type ResolvedTarget = {
  businessId: string
  offeringRef: string
}


type ServerErrorResult = {
  kind: 'error'
  code: string
  retryable: boolean
  reason: string
  field?: string
  retryAfter?: number
}

type PublicInquirySubmitServerResult =
  | {
      kind: 'ok'
      code: 'inquiry_submitted' | 'inquiry_replayed'
      receipt: SubmittedInquiryReceipt
    }
  | ServerErrorResult

type CustomerInquiryRecordServerResult =
  | {
      kind: 'ok'
      code: string
      record: unknown
    }
  | ServerErrorResult

type OwnerInboxServerResult =
  | { kind: 'ok'; inbox: unknown }
  | ServerErrorResult

type OwnerInquiryThreadServerResult =
  | {
      kind: 'ok'
      detail: unknown
      delivery: unknown
      tombstones: unknown
    }
  | ServerErrorResult

type OwnerInquiryMutationServerResult =
  | {
      kind: 'ok'
      code: string
      thread: {
        threadId: string
        status: InquiryThreadStatus
        version: number
        updatedAt: number
      }
      message?: {
        messageId: string
        sender: 'customer' | 'owner'
        createdAt: number
      }
      notification?: {
        notificationId: string
        status: InquiryNotificationStatus
        recipientRole: 'owner' | 'customer'
      }
    }
  | ServerErrorResult

type OwnerTargetAdmissionReadResult =
  | Readonly<{ kind: 'ok'; admission: R1TargetAdmission }>
  | Readonly<{
      kind: 'error'
      code: string
      reason: string
      retryable: boolean
    }>

type PublicTargetAdmissionReadResult =
  | Readonly<{ kind: 'ok'; admission: R1TargetAdmission }>
  | Readonly<{
      kind: 'error'
      code: 'source_unavailable'
      reason: string
      retryable: true
    }>

export type LocalE2eInquiryServerBackend = Readonly<{
  submitPublicInquiry: (
    data: PublicInquirySubmitInput,
    target: ResolvedTarget,
  ) => PublicInquirySubmitServerResult
  readCustomerRecord: (data: { threadId: string; accessKey: string }) => CustomerInquiryRecordServerResult
  readCurrentOwnerInbox: () => OwnerInboxServerResult
  readInquiryOperatorReconstruction: (
    filter?: InquiryOperatorReconstructionFilter,
  ) => unknown
  readCurrentOwnerInquiryThread: (threadId: string) => OwnerInquiryThreadServerResult
  readPublicTargetAdmission: (target: {
    businessId: string
    offeringRef: string
  }) => PublicTargetAdmissionReadResult
  readCurrentOwnerTargetAdmission: (target: {
    businessId: string
    offeringRef: string
  }) => OwnerTargetAdmissionReadResult
  markCurrentOwnerInquiryRead: (data: {
    threadId: string
    expectedVersion: number
  }) => OwnerInquiryMutationServerResult
  replyCurrentOwnerInquiry: (data: {
    threadId: string
    expectedVersion: number
    body: string
  }) => OwnerInquiryMutationServerResult
  closeCurrentOwnerInquiry: (data: {
    threadId: string
    expectedVersion: number
  }) => OwnerInquiryMutationServerResult
}>

/** Fail-closed: local-e2e backend must never be constructed outside the bypass flag. */
export function assertLocalE2eInquiryBypassEnabled(): void {
  if (!isLocalE2EAuthBypassEnabled()) {
    throw new Error('local-e2e inquiry backend is fail-closed outside local E2E auth bypass.')
  }
}

export function createLocalE2eInquiryServerBackend(): LocalE2eInquiryServerBackend {
  assertLocalE2eInquiryBypassEnabled()
  return {
    submitPublicInquiry: (data, target) => submitLocalE2ePublicInquiry(data, target),
    readCustomerRecord: (data) => {
      const state = localE2eSubmittedStateByThreadId.get(data.threadId) ?? createLocalE2eInquirySourceState()
      const result = readCustomerRecordLocal(state, {
        threadId: brandNonEmpty(data.threadId, 'InquiryThreadId'),
        accessKey: data.accessKey,
        keyring: localE2eCustomerAccessKeyring,
        governedSendIntegrityKeyring: localE2eGovernedSendIntegrityKeyring,
        now: Date.now(),
      })
      return result.kind === 'ok' ? { kind: 'ok', code: result.code, record: result.record } : result
    },
    readCurrentOwnerInbox: () => ({
      kind: 'ok',
      inbox: listOwnerInboxLocal(createLocalE2eInquirySourceState(), { authority: { ownerId: localE2eOwnerId } }),
    }),
    readInquiryOperatorReconstruction: (filter = {}) => {
      const readback = readInquiryOperatorReconstructionLocal(createLocalE2eInquirySourceState(), filter)
      return {
        ...readback,
        actorRef: 'admin:local-e2e',
      }
    },
    readCurrentOwnerInquiryThread: (threadId) => readLocalE2eOwnerInquiryThread(threadId),
    readPublicTargetAdmission: (target) => {
      const brandedTarget = {
        businessId: brandNonEmpty(target.businessId, 'BusinessId'),
        offeringRef: brandNonEmpty(target.offeringRef, 'OfferingRef'),
      }
      return {
        kind: 'ok',
        admission: evaluateR1TargetAdmission(createLocalPublicAdmissionState(brandedTarget), brandedTarget),
      }
    },
    readCurrentOwnerTargetAdmission: (target) => {
      const brandedTarget = {
        businessId: brandNonEmpty(target.businessId, 'BusinessId'),
        offeringRef: brandNonEmpty(target.offeringRef, 'OfferingRef'),
      }
      return {
        kind: 'ok',
        admission: evaluateR1TargetAdmission(createLocalE2eInquiryBaseState(), brandedTarget),
      }
    },
    markCurrentOwnerInquiryRead: (data) => localOwnerMarkRead(data),
    replyCurrentOwnerInquiry: (data) => localOwnerReply(data),
    closeCurrentOwnerInquiry: (data) => localOwnerClose(data),
  }
}

function normalizeOperationPart(value: string): string {
  return normalizeSlug(value) || 'inquiry'
}

function compactContact(input: PublicInquiryContactInput): PublicInquiryContactInput {
  return {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.email === undefined ? {} : { email: input.email }),
    ...(input.phone === undefined ? {} : { phone: input.phone }),
  }
}

function submitLocalE2ePublicInquiry(
  data: PublicInquirySubmitInput,
  target: ResolvedTarget,
): PublicInquirySubmitServerResult {
  const now = Date.now()
  const operationSuffix = data.operationKey ?? `${normalizeOperationPart(target.businessId)}:local-e2e:${now}`
  const localTarget: InquiryTargetRef = {
    businessId: brandNonEmpty(target.businessId, 'BusinessId'),
    offeringRef: brandNonEmpty(target.offeringRef, 'OfferingRef'),
  }
  const result = submitInquiryLocal(createLocalPublicAdmissionState(localTarget), {
    target: localTarget,
    body: data.body,
    contact: compactContact(data.contact),
    expectedDigest: data.expectedDigest,
    customerAccessKeyring: localE2eCustomerAccessKeyring,
    governedSendIntegrityKeyring: localE2eGovernedSendIntegrityKeyring,
    ...(data.inquiryOrigin === undefined ? {} : { origin: data.inquiryOrigin }),
    pseudonymousSessionId: `public-inquiry:${operationSuffix}`,
    operationKey: brandNonEmpty(data.operationKey ?? `inquiry:${operationSuffix}`, 'OperationKey'),
    correlationId: brandNonEmpty(`correlation:${normalizeOperationPart(operationSuffix)}`, 'CorrelationId'),
    now,
    notificationStatus: 'held',
    notificationFailureCode: 'local_e2e_no_provider',
  })

  if (result.kind === 'error') {
    return {
      kind: 'error',
      code: result.code,
      retryable: result.retryable,
      reason: result.reason,
      ...(result.field === undefined ? {} : { field: result.field }),
      ...(result.retryAfter === undefined ? {} : { retryAfter: result.retryAfter }),
    }
  }

  localE2eSubmittedStateByThreadId.set(String(result.thread.threadId), result.state)

  return {
    kind: 'ok',
    code: result.code,
    receipt: buildSubmittedInquiryReceipt({
      thread: result.thread,
      notification: result.notification,
      accessKey: result.customerAccessKey,
    }),
  }
}

function readLocalE2eOwnerInquiryThread(threadId: string): OwnerInquiryThreadServerResult {
  const state = createLocalE2eInquirySourceState()
  const authority = { ownerId: localE2eOwnerId }
  const brandedThreadId = brandNonEmpty(threadId, 'InquiryThreadId')
  const detail = readOwnerInquiryLocal(state, {
    authority,
    threadId: brandedThreadId,
  })
  if (detail.kind === 'error') {
    return {
      kind: 'error',
      code: detail.code,
      retryable: detail.retryable,
      reason: detail.reason,
    }
  }

  const delivery = readInquiryDeliveryReadbackLocal(state, {
    authority,
    threadId: brandedThreadId,
  })
  const tombstones = readInquiryPrivacyTombstoneLocal(state, {
    authority,
    threadId: brandedThreadId,
  })

  return {
    kind: 'ok',
    detail: detail.readback,
    delivery: delivery.kind === 'ok' ? delivery.readback : { threadId: brandedThreadId, notifications: detail.readback.notifications },
    tombstones: tombstones.kind === 'ok' ? tombstones.tombstones : [],
  }
}

function localOwnerMarkRead(data: { threadId: string; expectedVersion: number }): OwnerInquiryMutationServerResult {
  const result = markInquiryReadLocal(createLocalE2eInquirySourceState(), {
    authority: { ownerId: localE2eOwnerId },
    threadId: brandNonEmpty(data.threadId, 'InquiryThreadId'),
    expectedVersion: data.expectedVersion,
    operationKey: brandNonEmpty(`inquiry:${normalizeOperationPart(data.threadId)}:local-read`, 'OperationKey'),
    correlationId: brandNonEmpty(`correlation:${normalizeOperationPart(data.threadId)}:local-read`, 'CorrelationId'),
    now: Date.now(),
  })

  return localOwnerMutationResult(result)
}

function localOwnerReply(data: { threadId: string; expectedVersion: number; body: string }): OwnerInquiryMutationServerResult {
  const result = replyToInquiryLocal(createLocalE2eInquirySourceState(), {
    authority: { ownerId: localE2eOwnerId },
    threadId: brandNonEmpty(data.threadId, 'InquiryThreadId'),
    expectedVersion: data.expectedVersion,
    body: data.body,
    operationKey: brandNonEmpty(`inquiry:${normalizeOperationPart(data.threadId)}:local-reply`, 'OperationKey'),
    correlationId: brandNonEmpty(`correlation:${normalizeOperationPart(data.threadId)}:local-reply`, 'CorrelationId'),
    now: Date.now(),
    notificationStatus: 'queued',
  })

  return localOwnerMutationResult(result)
}

function localOwnerClose(data: { threadId: string; expectedVersion: number }): OwnerInquiryMutationServerResult {
  const result = closeInquiryLocal(createLocalE2eInquirySourceState(), {
    authority: { ownerId: localE2eOwnerId },
    threadId: brandNonEmpty(data.threadId, 'InquiryThreadId'),
    expectedVersion: data.expectedVersion,
    operationKey: brandNonEmpty(`inquiry:${normalizeOperationPart(data.threadId)}:local-close`, 'OperationKey'),
    correlationId: brandNonEmpty(`correlation:${normalizeOperationPart(data.threadId)}:local-close`, 'CorrelationId'),
    now: Date.now(),
  })

  return localOwnerMutationResult(result)
}

function localOwnerMutationResult(
  result: ReturnType<typeof markInquiryReadLocal> | ReturnType<typeof replyToInquiryLocal> | ReturnType<typeof closeInquiryLocal>
): OwnerInquiryMutationServerResult {
  if (result.kind === 'error') {
    return {
      kind: 'error',
      code: result.code,
      retryable: result.retryable,
      reason: result.reason,
    }
  }

  return {
    kind: 'ok',
    code: result.code,
    thread: {
      threadId: result.thread.threadId,
      status: result.thread.status,
      version: result.thread.version,
      updatedAt: result.thread.updatedAt,
    },
    ...('message' in result
      ? {
          message: {
            messageId: result.message.messageId,
            sender: result.message.sender,
            createdAt: result.message.createdAt,
          },
        }
      : {}),
    ...('notification' in result
      ? {
          notification: {
            notificationId: result.notification.notificationId,
            status: result.notification.status,
            recipientRole: result.notification.recipientRole,
          },
        }
      : {}),
  }
}


const localE2eCustomerAccessKeyring = {
  keyId: 'local-e2e-inquiry-access-v1',
  secret: 'local-e2e-inquiry-access-secret-00000000000000000000',
} as const
const localE2eGovernedSendIntegrityKeyring = {
  activeKeyId: 'local-e2e-governed-send-integrity-v1',
  signingSecret: 'local-e2e-governed-send-integrity-secret-000000000000',
  verificationSecrets: {
    'local-e2e-governed-send-integrity-v1': 'local-e2e-governed-send-integrity-secret-000000000000',
  },
} as const
const localE2eNow = 1_777_000_000_000
const localE2eOwnerId = brandNonEmpty('owner:inquiries-route', 'OwnerId')
const localPublicAdmittedFixture = (() => {
  const fixture = LOCAL_E2E_BUSINESS_FIXTURES.find((candidate) => candidate.inquiryAdmission === 'admitted')
  if (fixture === undefined) throw new Error('One admitted local public inquiry fixture is required.')
  return fixture
})()
const localPublicAdmittedOffering = requireLocalE2eOffering(localPublicAdmittedFixture)

const localPublicAdmittedSlug = localPublicAdmittedFixture.requestedSlug
const localPublicAdmittedBusinessId = brandNonEmpty(`business:${localPublicAdmittedSlug}`, 'BusinessId')
const localPublicAdmittedOfferingRef = brandNonEmpty(
  `offering:${localPublicAdmittedSlug}:${normalizeSlug(localPublicAdmittedOffering.name)}`,
  'OfferingRef',
)
const localPublicAdmittedOwnerId = brandNonEmpty(`owner:local-e2e:${localPublicAdmittedSlug}`, 'OwnerId')

function requireLocalE2eOffering(fixture: LocalE2eBusinessFixture): LocalE2eOfferingFixture {
  const offering = fixture.offerings[0]
  if (offering === undefined) {
    throw new Error(`The local E2E fixture must publish an offering: ${fixture.requestedSlug}`)
  }
  return offering
}


function createLocalPublicAdmissionState(target: InquiryTargetRef): InquirySourceState {
  if (target.businessId !== localPublicAdmittedBusinessId
    || target.offeringRef !== localPublicAdmittedOfferingRef) {
    return createEmptyInquirySourceState()
  }

  const fixture = localPublicAdmittedFixture
  const fixtureOffering = localPublicAdmittedOffering

  const business = {
    businessId: localPublicAdmittedBusinessId,
    ownerId: localPublicAdmittedOwnerId,
    slug: brandNonEmpty(fixture.requestedSlug, 'Slug'),
    name: fixture.businessName,
    normalizedName: fixture.businessName.toLowerCase(),
    category: fixture.category,
    suburb: fixture.suburb,
    stateTerritory: fixture.stateTerritory,
    publicStatus: 'published' as const,
    trustTier: 'contact_confirmed' as const,
    claimStatus: 'published' as const,
    sourceHash: canonicalDigest({ businessId: localPublicAdmittedBusinessId }),
    createdAt: localE2eNow,
    updatedAt: localE2eNow,
  } satisfies BusinessRecord
  const revision = {
    offeringRef: localPublicAdmittedOfferingRef,
    businessId: localPublicAdmittedBusinessId,
    revision: 1,
    name: fixtureOffering.name,
    category: fixtureOffering.category,
    summary: fixtureOffering.summary,
    serviceAreaSummary: fixtureOffering.serviceAreaSummary,
    availabilitySummary: fixtureOffering.availabilitySummary,
    ...(fixtureOffering.pricingSummary === undefined ? {} : { pricingSummary: fixtureOffering.pricingSummary }),
    ...(fixtureOffering.price === undefined ? {} : { price: fixtureOffering.price }),
    sourceHash: canonicalDigest({ offeringRef: localPublicAdmittedOfferingRef, revision: 1, name: fixtureOffering.name }),
    createdAt: localE2eNow,
  } satisfies BusinessOfferingRevisionRecord
  const offering = {
    offeringRef: localPublicAdmittedOfferingRef,
    businessId: localPublicAdmittedBusinessId,
    currentRevision: 1,
    status: 'published' as const,
    createdAt: localE2eNow,
    updatedAt: localE2eNow,
  } satisfies BusinessOfferingRecord
  const accessPath = {
    accessPathRef: brandNonEmpty(`${localPublicAdmittedOfferingRef}:inquiry`, 'AccessPathRef'),
    businessId: localPublicAdmittedBusinessId,
    offeringRef: localPublicAdmittedOfferingRef,
    offeringRevision: 1,
    offeringSourceHash: revision.sourceHash,
    status: 'published' as const,
    descriptor: {
      kind: 'human_request' as const,
      channel: 'ae_inquiry' as const,
      disclosure: 'Use the inquiry form for a first contact.',
    },
    sourceHash: canonicalDigest({ offeringRef: localPublicAdmittedOfferingRef, channel: 'ae_inquiry' }),
    createdAt: localE2eNow,
    updatedAt: localE2eNow,
  } satisfies OfferingAccessPathRecord

  return createEmptyInquirySourceState({
    businesses: [business],
    businessOfferings: [offering],
    businessOfferingRevisions: [revision],
    offeringAccessPaths: [accessPath],
    owners: [{
      ownerId: localPublicAdmittedOwnerId,
      clerkUserId: `local-e2e:${localPublicAdmittedSlug}`,
      createdAt: localE2eNow,
      updatedAt: localE2eNow,
    }],
    claims: [{
      claimId: brandNonEmpty(`claim:${localPublicAdmittedSlug}`, 'ClaimId'),
      ownerId: localPublicAdmittedOwnerId,
      businessId: localPublicAdmittedBusinessId,
      slug: brandNonEmpty(localPublicAdmittedSlug, 'Slug'),
      status: 'published',
      submittedFactsHash: canonicalDigest({ businessId: localPublicAdmittedBusinessId, ownerId: localPublicAdmittedOwnerId }),
      createdAt: localE2eNow,
      updatedAt: localE2eNow,
    }],
    resolvableOwnerRecipients: [{
      ownerId: localPublicAdmittedOwnerId,
      recipientRef: `clerk-owner-email:${canonicalDigest(`local-e2e:${localPublicAdmittedSlug}`)}`,
      resolvedAt: localE2eNow,
    }],
    capabilityLaunchSupportRecords: [localE2eSupportRecord()],
  })
}

const localE2eSubmittedStateByThreadId = new Map<string, InquirySourceState>()

const localE2eBusinessId = brandNonEmpty('business:plumbing-demo', 'BusinessId')
const localE2eBusinessFixture = (() => {
  const fixture = LOCAL_E2E_BUSINESS_FIXTURES.find((candidate) => candidate.requestedSlug === 'plumbing-demo')
  if (fixture === undefined) throw new Error('The plumbing-demo local E2E fixture is required.')
  return fixture
})()
const localE2eFixtureOffering = requireLocalE2eOffering(localE2eBusinessFixture)

const localE2eOfferingRef = brandNonEmpty(
  `offering:${localE2eBusinessFixture.requestedSlug}:${normalizeSlug(localE2eFixtureOffering.name)}`,
  'OfferingRef',
)
const localE2eTarget = {
  businessId: localE2eBusinessId,
  offeringRef: localE2eOfferingRef,
}

const localE2eRecordBody = 'Water is leaking under the kitchen sink and I need a human owner to confirm next steps.'
const localE2eRecordContact = { email: 'customer@example.test' } as const
const localE2eRecordEncoding = encodeGovernedAction(buildGovernedSendIntent({
  target: localE2eTarget,
  body: localE2eRecordBody,
  contact: localE2eRecordContact,
}))
if (localE2eRecordEncoding.kind !== 'encoded') {
  throw new Error('The local E2E governed inquiry fixture must be canonically encodable.')
}
const localE2eRecordDigest = localE2eRecordEncoding.digest

function createLocalE2eInquirySourceState(): InquirySourceState {
  const submitted = submitInquiryLocal(createLocalE2eInquiryBaseState(), {
    target: localE2eTarget,
    body: localE2eRecordBody,
    contact: localE2eRecordContact,
    customerAccessKeyring: localE2eCustomerAccessKeyring,
    governedSendIntegrityKeyring: localE2eGovernedSendIntegrityKeyring,
    operationKey: brandNonEmpty('inquiry:local-e2e-submit', 'OperationKey'),
    correlationId: brandNonEmpty('correlation:local-e2e-submit', 'CorrelationId'),
    pseudonymousSessionId: 'public-inquiry:local-e2e',
    expectedDigest: localE2eRecordDigest,
    now: localE2eNow,
    notificationStatus: 'failed',
    notificationFailureCode: 'provider_missing',
  })

  if (submitted.kind === 'error') {
    return createLocalE2eInquiryBaseState()
  }

  const replied = replyToInquiryLocal(submitted.state, {
    authority: { ownerId: localE2eOwnerId },
    threadId: submitted.thread.threadId,
    expectedVersion: submitted.thread.version,
    body: 'Thanks, I have the message and will reply through the saved owner contact path.',
    operationKey: brandNonEmpty('inquiry:local-e2e-reply', 'OperationKey'),
    correlationId: brandNonEmpty('correlation:local-e2e-reply', 'CorrelationId'),
    now: localE2eNow + 1_000,
    notificationStatus: 'queued',
  })

  return bindLocalE2eInquiryDispatches(replied.kind === 'ok' ? replied.state : submitted.state)
}

function bindLocalE2eInquiryDispatches(state: InquirySourceState): InquirySourceState {
  return state.notifications.reduce((nextState, notification, index) => {
    const providerFamily = index % 2 === 0 ? 'resend' : 'novu'
    const status = notification.status === 'failed' ? 'provider_missing' : 'queued'
    const dispatchId = brandNonEmpty(`notification_dispatch:local-e2e:${index + 1}`, 'NotificationDispatchId')
    const bound = bindInquiryNotificationDispatchesLocal(nextState, {
      notificationId: notification.notificationId,
      dispatchBindings: [
        {
          dispatchId,
          providerFamily,
          status,
          providerIdempotencyKey: `ae:${dispatchId}`,
          payloadHash: canonicalDigest({ dispatchId, notificationId: notification.notificationId, redacted: true }),
          operatorNextAction: status === 'provider_missing' ? 'retry_available' : 'none',
          updatedAt: notification.updatedAt + 1,
        },
      ],
      now: notification.updatedAt + 1,
    })
    return bound.kind === 'ok' ? bound.state : nextState
  }, state)
}

function createLocalE2eInquiryBaseState(): InquirySourceState {
  return createEmptyInquirySourceState({
    businesses: [localE2eBusiness()],
    owners: [{
      ownerId: localE2eOwnerId,
      clerkUserId: 'clerk:local-e2e-owner',
      emailHash: canonicalDigest('local-e2e-owner@example.test'),
      createdAt: localE2eNow,
      updatedAt: localE2eNow,
    } satisfies BusinessOwnerRecord],
    claims: [{
      claimId: brandNonEmpty('claim:local-e2e-owner', 'ClaimId'),
      ownerId: localE2eOwnerId,
      businessId: localE2eBusinessId,
      slug: brandNonEmpty(localE2eBusinessFixture.requestedSlug, 'Slug'),
      status: 'published',
      submittedFactsHash: canonicalDigest({ businessId: localE2eBusinessId, ownerId: localE2eOwnerId }),
      createdAt: localE2eNow,
      updatedAt: localE2eNow,
    } satisfies ClaimRecord],
    resolvableOwnerRecipients: [{
      ownerId: localE2eOwnerId,
      recipientRef: `clerk-owner-email:${canonicalDigest('local-e2e-owner@example.test')}`,
      resolvedAt: localE2eNow,
    }],
    businessOfferings: [createLocalE2eOfferingRecord()],
    businessOfferingRevisions: [localE2eOfferingRevision()],
    offeringAccessPaths: [localE2eInquiryAccessPath()],
    capabilityLaunchSupportRecords: [localE2eSupportRecord()],
    suppressionRules: [],
  })
}
function localE2eBusiness(): BusinessRecord {
  return {
    businessId: localE2eBusinessId,
    ownerId: localE2eOwnerId,
    slug: brandNonEmpty(localE2eBusinessFixture.requestedSlug, 'Slug'),
    name: localE2eBusinessFixture.businessName,
    normalizedName: localE2eBusinessFixture.businessName.toLowerCase(),
    category: localE2eBusinessFixture.category,
    suburb: localE2eBusinessFixture.suburb,
    stateTerritory: localE2eBusinessFixture.stateTerritory,
    publicStatus: 'published',
    trustTier: 'contact_confirmed',
    claimStatus: 'published',
    sourceHash: canonicalDigest({ businessId: localE2eBusinessId }),
    createdAt: localE2eNow,
    updatedAt: localE2eNow,
  }
}

function createLocalE2eOfferingRecord(): BusinessOfferingRecord {
  return {
    offeringRef: localE2eOfferingRef,
    businessId: localE2eBusinessId,
    currentRevision: 1,
    status: 'published',
    createdAt: localE2eNow,
    updatedAt: localE2eNow,
  }
}

function localE2eOfferingRevision(): BusinessOfferingRevisionRecord {
  return {
    offeringRef: localE2eOfferingRef,
    businessId: localE2eBusinessId,
    revision: 1,
    name: localE2eFixtureOffering.name,
    category: localE2eFixtureOffering.category,
    summary: localE2eFixtureOffering.summary,
    serviceAreaSummary: localE2eFixtureOffering.serviceAreaSummary,
    availabilitySummary: localE2eFixtureOffering.availabilitySummary,
    ...(localE2eFixtureOffering.pricingSummary === undefined ? {} : { pricingSummary: localE2eFixtureOffering.pricingSummary }),
    ...(localE2eFixtureOffering.price === undefined ? {} : { price: localE2eFixtureOffering.price }),
    sourceHash: canonicalDigest({ offeringRef: localE2eOfferingRef, revision: 1, name: localE2eFixtureOffering.name }),
    createdAt: localE2eNow,
  }
}

function localE2eInquiryAccessPath(): OfferingAccessPathRecord {
  const offeringSourceHash = localE2eOfferingRevision().sourceHash
  return {
    accessPathRef: brandNonEmpty(`${localE2eOfferingRef}:inquiry`, 'AccessPathRef'),
    businessId: localE2eBusinessId,
    offeringRef: localE2eOfferingRef,
    offeringRevision: 1,
    offeringSourceHash,
    status: 'published',
    descriptor: {
      kind: 'human_request',
      channel: 'ae_inquiry',
      disclosure: 'Use the inquiry form for a first contact.',
    },
    sourceHash: canonicalDigest({ offeringRef: localE2eOfferingRef, channel: 'ae_inquiry' }),
    createdAt: localE2eNow,
    updatedAt: localE2eNow,
  }
}

function localE2eSupportRecord(): CapabilityLaunchSupportRecord {
  return {
    capability: 'human_inquiry_owner_inbox',
    primaryOwnerRef: 'owner:inquiries-route',
    primaryAdminOperatorRef: 'admin:phase2-support-primary',
    backupOwnerRef: 'owner:phase2-support-backup',
    backupAdminOperatorRef: 'admin:phase2-support-backup',
    supportedStage: 'manual_support',
    supportedChannels: ['public_inquiry', 'owner_inbox', 'email_notification', 'provider_readback', 'operator_readback'],
    capacityThreshold: {
      maxOpenThreads: 25,
      maxFailedNotifications: 10,
    },
    backlogAgeThresholdMs: 7 * 24 * 60 * 60 * 1_000,
    phaseIncidentCounts: {
      retryExhausted: 0,
      noRepair: 0,
      unresolvedDeliveryFailures: 0,
      abuseBlocked: 0,
      privacyDeletes: 0,
    },
    supportEscalationPath: 'Phase 2 operator readback queue, then founder support.',
    claimDisablePath: 'Set inquiries_enabled false or withdraw the published ae_inquiry access path from the Offering.',
    perChannelKillRules: [
      {
        channel: 'public_claim',
        trigger: 'Support capacity, backlog age, retry-exhausted, or no-repair threshold is exceeded.',
        action: 'Suppress public inquiry availability and keep existing owner readbacks available.',
      },
      {
        channel: 'email_notification',
        trigger: 'Provider verification or dispatch credentials fail.',
        action: 'Hold delivery in source state and do not claim provider delivery.',
      },
    ],
    evidenceRefs: ['output/playwright/phase2-ui', '.planning/phases/02-human-inquiry-owner-inbox/02-EXECUTION-EVIDENCE.md'],
    sourceHash: canonicalDigest({ supportRecord: 'human_inquiry_owner_inbox', stage: 'manual_support' }),
    correlationId: brandNonEmpty('correlation:phase2-support-record:local-e2e', 'CorrelationId'),
    lastReviewedAt: localE2eNow + 60_000,
  }
}
