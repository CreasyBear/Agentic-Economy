import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  callPublicSourceMutation,
  callSourceMutation,
  callSourceQuery,
  ConvexSourceError,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import type { BusinessRecord } from '@/modules/business/public'
import type { BusinessServiceRecord, CapabilityKind, ServiceCapabilityRecord } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'
import {
  bindInquiryNotificationDispatches as bindInquiryNotificationDispatchesLocal,
  closeInquiry as closeInquiryLocal,
  createEmptyInquirySourceState,
  listOwnerInbox as listOwnerInboxLocal,
  markInquiryRead as markInquiryReadLocal,
  readInquiryDeliveryReadback as readInquiryDeliveryReadbackLocal,
  readInquiryOperatorReconstruction as readInquiryOperatorReconstructionLocal,
  readInquiryPrivacyTombstone as readInquiryPrivacyTombstoneLocal,
  readOwnerInquiry as readOwnerInquiryLocal,
  replyToInquiry as replyToInquiryLocal,
  submitInquiry as submitInquiryLocal,
  type CapabilityLaunchSupportRecord,
  type InquiryDeliveryReadback,
  type InquiryNotificationStatus,
  type InquiryOperatorReconstructionFilter,
  type InquiryOperatorReconstructionReadback,
  type InquiryPrivacyTombstoneRecord,
  type InquirySourceState,
  type InquiryThreadStatus,
  type OwnerInboxReadback,
  type OwnerInquiryDetailReadback,
  type PublicInquiryContactInput,
} from '@/modules/inquiries/public'

const publicInquirySubmitSchema = z.object({
  target: z.object({
    businessId: z.string(),
    serviceId: z.string(),
    capabilityKind: z.enum(['phone_inquiry', 'quote_request', 'emergency_callout_interest', 'ae_hosted_discovery']),
  }),
  body: z.string(),
  contact: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }),
})

const ownerThreadSchema = z.object({
  threadId: z.string(),
})

const operatorReconstructionSchema = z
  .object({
    threadId: z.string().optional(),
    correlationId: z.string().optional(),
    dispatchId: z.string().optional(),
  })
  .optional()
  .transform((value): InquiryOperatorReconstructionFilter => compactOperatorFilter(value ?? {}))

const ownerReplySchema = ownerThreadSchema.extend({
  expectedVersion: z.number(),
  body: z.string(),
})

const ownerVersionedSchema = ownerThreadSchema.extend({
  expectedVersion: z.number(),
})

type PublicInquirySubmitArgs = {
  target: {
    businessId: string
    serviceId: string
    capabilityKind: CapabilityKind
  }
  body: string
  contact: PublicInquiryContactInput
  pseudonymousSessionId: string
  abuseBucketKey: string
  operationKey: string
  correlationId: string
  csrfToken?: string
  csrfCookie?: string
  origin?: string
}

type ConvexPublicInquirySubmitResult =
  | {
      kind: 'ok'
      code: 'inquiry_submitted' | 'inquiry_replayed'
      thread: {
        threadId: string
        businessId: string
        serviceId: string
        status: InquiryThreadStatus
        version: number
      }
      notification: {
        notificationId: string
        status: InquiryNotificationStatus
      }
    }
  | ServerErrorResult

export type PublicInquirySubmitServerResult =
  | {
      kind: 'ok'
      code: 'inquiry_submitted' | 'inquiry_replayed'
      receipt: {
        threadId: string
        businessId: string
        serviceId: string
        status: InquiryThreadStatus
        version: number
        notificationId: string
        notificationStatus: InquiryNotificationStatus
      }
    }
  | ServerErrorResult

type OwnerInquiryDetailResult =
  | {
      kind: 'ok'
      code: 'inquiry_read'
      readback: OwnerInquiryDetailReadback
    }
  | ServerErrorResult

type OwnerInquiryDeliveryResult =
  | {
      kind: 'ok'
      code: 'inquiry_delivery_read'
      readback: InquiryDeliveryReadback
    }
  | ServerErrorResult

type OwnerInquiryPrivacyTombstoneResult =
  | {
      kind: 'ok'
      code: 'inquiry_privacy_tombstone_read'
      tombstones: readonly InquiryPrivacyTombstoneRecord[]
    }
  | ServerErrorResult

type OwnerInboxSourceResult =
  | {
      kind: 'allowed'
      inbox: OwnerInboxReadback
    }
  | {
      kind: 'denied'
      reason: 'missing_auth' | 'owner_not_found'
    }

export type OwnerInboxServerResult =
  | {
      kind: 'ok'
      inbox: OwnerInboxReadback
    }
  | ServerErrorResult

type OwnerMutationArgs = {
  threadId: string
  expectedVersion: number
  operationKey: string
  correlationId: string
  csrfToken?: string
  csrfCookie?: string
  origin?: string
}

type OwnerReplyArgs = OwnerMutationArgs & {
  body: string
}

export type OwnerInquiryMutationServerResult =
  | {
      kind: 'ok'
      code:
        | 'inquiry_read_marked'
        | 'inquiry_read_replayed'
        | 'inquiry_replied'
        | 'inquiry_reply_replayed'
        | 'inquiry_closed'
        | 'inquiry_close_replayed'
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

export type OwnerInquiryThreadServerResult =
  | {
      kind: 'ok'
      detail: OwnerInquiryDetailReadback
      delivery: InquiryDeliveryReadback
      tombstones: readonly InquiryPrivacyTombstoneRecord[]
    }
  | ServerErrorResult

export type InquiryOperatorReconstructionServerResult = InquiryOperatorReconstructionReadback

type ServerErrorResult = {
  kind: 'error'
  code: string
  retryable: boolean
  reason: string
  field?: string
  retryAfter?: number
}

const submitPublicInquiryMutation = sourceMutation<PublicInquirySubmitArgs, ConvexPublicInquirySubmitResult>('inquiries:submitPublicInquiry')
const listOwnerInboxQuery = sourceQuery<Record<string, never>, OwnerInboxSourceResult>('inquiries:listCurrentOwnerInbox')
const readOperatorInquiryReconstructionQuery = sourceQuery<
  InquiryOperatorReconstructionFilter,
  InquiryOperatorReconstructionReadback
>('inquiries:readOperatorInquiryReconstruction')
const readOwnerInquiryQuery = sourceQuery<{ threadId: string }, OwnerInquiryDetailResult>('inquiries:readCurrentOwnerInquiry')
const readOwnerInquiryDeliveryQuery = sourceQuery<{ threadId: string }, OwnerInquiryDeliveryResult>(
  'inquiries:readCurrentOwnerInquiryDeliveryReadback'
)
const readOwnerInquiryPrivacyTombstoneQuery = sourceQuery<{ threadId: string }, OwnerInquiryPrivacyTombstoneResult>(
  'inquiries:readCurrentOwnerInquiryPrivacyTombstone'
)
const replyOwnerInquiryMutation = sourceMutation<OwnerReplyArgs, OwnerInquiryMutationServerResult>('inquiries:replyToCurrentOwnerInquiry')
const closeOwnerInquiryMutation = sourceMutation<OwnerMutationArgs, OwnerInquiryMutationServerResult>('inquiries:closeCurrentOwnerInquiry')
const markReadOwnerInquiryMutation = sourceMutation<OwnerMutationArgs, OwnerInquiryMutationServerResult>('inquiries:markCurrentOwnerInquiryRead')

export const submitPublicInquiryServer = createServerFn({ method: 'POST' })
  .validator((data) => publicInquirySubmitSchema.parse(data))
  .handler(async ({ data }) => submitPublicInquiryThroughSource(data))

export const readCurrentOwnerInboxServer = createServerFn().handler(() => readCurrentOwnerInboxThroughSource())

export const readInquiryOperatorReconstructionServer = createServerFn()
  .validator((data) => operatorReconstructionSchema.parse(data))
  .handler(async ({ data }) => readInquiryOperatorReconstructionThroughSource(data))

export const readCurrentOwnerInquiryThreadServer = createServerFn()
  .validator((data) => ownerThreadSchema.parse(data))
  .handler(async ({ data }) => readCurrentOwnerInquiryThreadThroughSource(data.threadId))

export const replyCurrentOwnerInquiryServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerReplySchema.parse(data))
  .handler(async ({ data }) => replyCurrentOwnerInquiryThroughSource(data))

export const markCurrentOwnerInquiryReadServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerVersionedSchema.parse(data))
  .handler(async ({ data }) => markCurrentOwnerInquiryReadThroughSource(data))

export const closeCurrentOwnerInquiryServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerVersionedSchema.parse(data))
  .handler(async ({ data }) => closeCurrentOwnerInquiryThroughSource(data))

export async function submitPublicInquiryThroughSource(
  data: z.infer<typeof publicInquirySubmitSchema>
): Promise<PublicInquirySubmitServerResult> {
  if (usesLocalE2eBypass()) {
    return submitLocalE2ePublicInquiry(data)
  }

  try {
    const operationSuffix = `${normalizeOperationPart(data.target.businessId)}:${crypto.randomUUID()}`
    const result = await callPublicSourceMutation(submitPublicInquiryMutation, {
      target: data.target,
      body: data.body,
      contact: compactContact(data.contact),
      pseudonymousSessionId: `public-inquiry:${operationSuffix}`,
      abuseBucketKey: `public-inquiry:${normalizeOperationPart(data.target.businessId)}:${normalizeOperationPart(data.target.serviceId)}`,
      ...browserMutationAdmission(),
      operationKey: `inquiry:${operationSuffix}`,
      correlationId: `correlation:${operationSuffix}`,
    })

    if (result.kind === 'error') {
      return result
    }

    return {
      kind: 'ok',
      code: result.code,
      receipt: {
        threadId: result.thread.threadId,
        businessId: result.thread.businessId,
        serviceId: result.thread.serviceId,
        status: result.thread.status,
        version: result.thread.version,
        notificationId: result.notification.notificationId,
        notificationStatus: result.notification.status,
      },
    }
  } catch (error) {
    return inquirySourceError(error)
  }
}

export async function readCurrentOwnerInboxThroughSource(): Promise<OwnerInboxServerResult> {
  if (usesLocalE2eBypass()) {
    return {
      kind: 'ok',
      inbox: listOwnerInboxLocal(createLocalE2eInquirySourceState(), { authority: { ownerId: localE2eOwnerId } }),
    }
  }

  try {
    const result = await callSourceQuery(listOwnerInboxQuery, {})
    if (result.kind === 'denied') {
      return ownerDeniedResult(result.reason)
    }

    return {
      kind: 'ok',
      inbox: result.inbox,
    }
  } catch (error) {
    return ownerSourceError(error)
  }
}

export async function readInquiryOperatorReconstructionThroughSource(
  filter: InquiryOperatorReconstructionFilter = {}
): Promise<InquiryOperatorReconstructionServerResult> {
  if (usesLocalE2eBypass()) {
    const readback = readInquiryOperatorReconstructionLocal(createLocalE2eInquirySourceState(), filter)
    return {
      ...readback,
      actorRef: 'admin:local-e2e',
    }
  }

  try {
    return await callSourceQuery(readOperatorInquiryReconstructionQuery, compactOperatorFilter(filter))
  } catch {
    return deniedInquiryOperatorReconstruction(filter, 401, 'missing_membership')
  }
}

export async function readCurrentOwnerInquiryThreadThroughSource(threadId: string): Promise<OwnerInquiryThreadServerResult> {
  if (usesLocalE2eBypass()) {
    return readLocalE2eOwnerInquiryThread(threadId)
  }

  try {
    const detail = await callSourceQuery(readOwnerInquiryQuery, { threadId })
    if (detail.kind === 'error') {
      return detail
    }

    const delivery = await callSourceQuery(readOwnerInquiryDeliveryQuery, { threadId })
    if (delivery.kind === 'error') {
      return delivery
    }

    const tombstones = await callSourceQuery(readOwnerInquiryPrivacyTombstoneQuery, { threadId })
    if (tombstones.kind === 'error') {
      return tombstones
    }

    return {
      kind: 'ok',
      detail: detail.readback,
      delivery: delivery.readback,
      tombstones: tombstones.tombstones,
    }
  } catch (error) {
    return ownerSourceError(error)
  }
}

function compactOperatorFilter(filter: {
  threadId?: string | undefined
  correlationId?: string | undefined
  dispatchId?: string | undefined
}): InquiryOperatorReconstructionFilter {
  return {
    ...(filter.threadId === undefined || String(filter.threadId).trim().length === 0 ? {} : { threadId: String(filter.threadId).trim() }),
    ...(filter.correlationId === undefined || String(filter.correlationId).trim().length === 0
      ? {}
      : { correlationId: String(filter.correlationId).trim() }),
    ...(filter.dispatchId === undefined || String(filter.dispatchId).trim().length === 0 ? {} : { dispatchId: String(filter.dispatchId).trim() }),
  }
}

function deniedInquiryOperatorReconstruction(
  filter: InquiryOperatorReconstructionFilter,
  httpStatus: 401 | 403,
  reason: 'missing_membership' | 'inactive_membership' | 'action_not_allowed'
): InquiryOperatorReconstructionServerResult {
  return {
    kind: 'denied',
    httpStatus,
    reason,
    generatedAt: Date.now(),
    publicMessage: 'Admin inquiry reconstruction requires active source-owned membership.',
    filter: compactOperatorFilter(filter),
    rows: [],
  }
}

export async function markCurrentOwnerInquiryReadThroughSource(data: z.infer<typeof ownerVersionedSchema>): Promise<OwnerInquiryMutationServerResult> {
  if (usesLocalE2eBypass()) {
    return localOwnerMarkRead(data)
  }

  try {
    const operationSuffix = `${normalizeOperationPart(data.threadId)}:${crypto.randomUUID()}`
    return await callSourceMutation(markReadOwnerInquiryMutation, {
      threadId: data.threadId,
      expectedVersion: data.expectedVersion,
      ...browserMutationAdmission(),
      operationKey: `inquiry:${operationSuffix}:read`,
      correlationId: `correlation:${operationSuffix}:read`,
    })
  } catch (error) {
    return ownerSourceError(error)
  }
}

export async function replyCurrentOwnerInquiryThroughSource(data: z.infer<typeof ownerReplySchema>): Promise<OwnerInquiryMutationServerResult> {
  if (usesLocalE2eBypass()) {
    return localOwnerReply(data)
  }

  try {
    const operationSuffix = `${normalizeOperationPart(data.threadId)}:${crypto.randomUUID()}`
    return await callSourceMutation(replyOwnerInquiryMutation, {
      threadId: data.threadId,
      expectedVersion: data.expectedVersion,
      body: data.body,
      ...browserMutationAdmission(),
      operationKey: `inquiry:${operationSuffix}:reply`,
      correlationId: `correlation:${operationSuffix}:reply`,
    })
  } catch (error) {
    return ownerSourceError(error)
  }
}

export async function closeCurrentOwnerInquiryThroughSource(data: z.infer<typeof ownerVersionedSchema>): Promise<OwnerInquiryMutationServerResult> {
  if (usesLocalE2eBypass()) {
    return localOwnerClose(data)
  }

  try {
    const operationSuffix = `${normalizeOperationPart(data.threadId)}:${crypto.randomUUID()}`
    return await callSourceMutation(closeOwnerInquiryMutation, {
      threadId: data.threadId,
      expectedVersion: data.expectedVersion,
      ...browserMutationAdmission(),
      operationKey: `inquiry:${operationSuffix}:close`,
      correlationId: `correlation:${operationSuffix}:close`,
    })
  } catch (error) {
    return ownerSourceError(error)
  }
}

function submitLocalE2ePublicInquiry(data: z.infer<typeof publicInquirySubmitSchema>): PublicInquirySubmitServerResult {
  const now = Date.now()
  const operationSuffix = `${normalizeOperationPart(data.target.businessId)}:local-e2e:${now}`
  const result = submitInquiryLocal(createLocalE2eInquiryBaseState(), {
    target: {
      businessId: brandNonEmpty(data.target.businessId, 'BusinessId'),
      serviceId: brandNonEmpty(data.target.serviceId, 'ServiceId'),
      capabilityKind: data.target.capabilityKind,
    },
    body: data.body,
    contact: compactContact(data.contact),
    pseudonymousSessionId: `public-inquiry:${operationSuffix}`,
    abuseBucketKey: `public-inquiry:${normalizeOperationPart(data.target.businessId)}:${normalizeOperationPart(data.target.serviceId)}`,
    operationKey: brandNonEmpty(`inquiry:${operationSuffix}`, 'OperationKey'),
    correlationId: brandNonEmpty(`correlation:${operationSuffix}`, 'CorrelationId'),
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

  return {
    kind: 'ok',
    code: result.code,
    receipt: {
      threadId: result.thread.threadId,
      businessId: result.thread.businessId,
      serviceId: result.thread.serviceId,
      status: result.thread.status,
      version: result.thread.version,
      notificationId: result.notification.notificationId,
      notificationStatus: result.notification.status,
    },
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

function localOwnerMarkRead(data: z.infer<typeof ownerVersionedSchema>): OwnerInquiryMutationServerResult {
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

function localOwnerReply(data: z.infer<typeof ownerReplySchema>): OwnerInquiryMutationServerResult {
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

function localOwnerClose(data: z.infer<typeof ownerVersionedSchema>): OwnerInquiryMutationServerResult {
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

function ownerDeniedResult(reason: Extract<OwnerInboxSourceResult, { kind: 'denied' }>['reason']): ServerErrorResult {
  return {
    kind: 'error',
    code: reason,
    retryable: false,
    reason: reason === 'missing_auth' ? 'Owner sign-in is required for this inquiry readback.' : 'Owner membership was not found.',
  }
}

function inquirySourceError(error: unknown): ServerErrorResult {
  if (error instanceof ConvexSourceError) {
    return {
      kind: 'error',
      code: error.code,
      retryable: true,
      reason: 'Inquiry source state is not reachable right now. Please try again.',
    }
  }

  return {
    kind: 'error',
    code: 'inquiry_source_unavailable',
    retryable: true,
    reason: 'Inquiry could not be recorded. Please try again.',
  }
}

function ownerSourceError(error: unknown): ServerErrorResult {
  if (error instanceof ConvexSourceError) {
    return {
      kind: 'error',
      code: error.code,
      retryable: false,
      reason: error.code === 'missing_auth' ? 'Owner sign-in is required for this inquiry readback.' : error.message,
    }
  }

  return {
    kind: 'error',
    code: 'inquiry_source_unavailable',
    retryable: true,
    reason: 'Owner inquiry readback is not reachable right now.',
  }
}

function normalizeOperationPart(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72)
  return normalized.length === 0 ? 'inquiry' : normalized
}

function compactContact(input: z.infer<typeof publicInquirySubmitSchema>['contact']): PublicInquiryContactInput {
  return {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.email === undefined ? {} : { email: input.email }),
    ...(input.phone === undefined ? {} : { phone: input.phone }),
  }
}

function browserMutationAdmission() {
  return {
    csrfToken: 'csrf-inquiry',
    csrfCookie: 'csrf-inquiry',
    origin: requestOrigin(),
  }
}

function requestOrigin(): string {
  return readEnv('SITE_URL') ?? readEnv('VITE_SITE_URL') ?? 'https://ae.example'
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}

function usesLocalE2eBypass(): boolean {
  return process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'
}

const localE2eNow = 1_777_000_000_000
const localE2eOwnerId = brandNonEmpty('owner:inquiries-route', 'OwnerId')
const localE2eBusinessId = brandNonEmpty('business:plumbing-demo', 'BusinessId')
const localE2eServiceId = brandNonEmpty('service:business:plumbing-demo:emergency-plumbing', 'ServiceId')
const localE2eTarget = {
  businessId: localE2eBusinessId,
  serviceId: localE2eServiceId,
  capabilityKind: 'phone_inquiry' as const,
}

function createLocalE2eInquirySourceState(): InquirySourceState {
  const submitted = submitInquiryLocal(createLocalE2eInquiryBaseState(), {
    target: localE2eTarget,
    body: 'Water is leaking under the kitchen sink and I need a human owner to confirm next steps.',
    contact: { email: 'customer@example.test' },
    operationKey: brandNonEmpty('inquiry:local-e2e-submit', 'OperationKey'),
    correlationId: brandNonEmpty('correlation:local-e2e-submit', 'CorrelationId'),
    pseudonymousSessionId: 'public-inquiry:local-e2e',
    abuseBucketKey: 'public-inquiry:local-e2e',
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
          payloadHash: stableHash({ dispatchId, notificationId: notification.notificationId, redacted: true }),
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
    businessServices: [localE2eService()],
    serviceCapabilities: [localE2eCapability()],
    capabilityLaunchSupportRecords: [localE2eSupportRecord()],
    suppressionRules: [],
  })
}

function localE2eBusiness(): BusinessRecord {
  return {
    businessId: localE2eBusinessId,
    ownerId: localE2eOwnerId,
    slug: brandNonEmpty('plumbing-demo', 'Slug'),
    name: 'Demo Plumbing',
    normalizedName: 'demo plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicStatus: 'published',
    trustTier: 'contact_confirmed',
    claimStatus: 'published',
    sourceHash: stableHash({ businessId: localE2eBusinessId }),
    createdAt: localE2eNow,
    updatedAt: localE2eNow,
  }
}

function localE2eService(): BusinessServiceRecord {
  return {
    serviceId: localE2eServiceId,
    serviceSlug: brandNonEmpty('emergency-plumbing', 'Slug'),
    businessId: localE2eBusinessId,
    name: 'Emergency plumbing',
    category: 'Emergency plumbing',
    summary: 'Human triage for urgent plumbing issues.',
    serviceArea: 'Parramatta',
    hoursOrUnknown: 'Hours supplied by owner',
    status: 'published',
    sortOrder: 1,
    sourceHash: stableHash({ serviceId: localE2eServiceId }),
    createdAt: localE2eNow,
    updatedAt: localE2eNow,
  }
}

function localE2eCapability(): ServiceCapabilityRecord {
  return {
    businessId: localE2eBusinessId,
    serviceId: localE2eServiceId,
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
    claimDisablePath: 'Set inquiries_enabled false or remove inquiry_available from the published service capability.',
    perChannelKillRules: [
      {
        channel: 'public_claim',
        trigger: 'Support capacity, backlog age, retry-exhausted, or no-repair threshold is exceeded.',
        action: 'Suppress public inquiry availability and keep existing owner readbacks available.',
      },
      {
        channel: 'email_notification',
        trigger: 'Provider smoke or dispatch credentials fail.',
        action: 'Hold delivery in source state and do not claim provider delivery.',
      },
    ],
    evidenceRefs: ['output/playwright/phase2-ui', '.planning/phases/02-human-inquiry-owner-inbox/02-EXECUTION-EVIDENCE.md'],
    sourceHash: stableHash({ supportRecord: 'human_inquiry_owner_inbox', stage: 'manual_support' }),
    correlationId: brandNonEmpty('correlation:phase2-support-record:local-e2e', 'CorrelationId'),
    lastReviewedAt: localE2eNow + 60_000,
  }
}
