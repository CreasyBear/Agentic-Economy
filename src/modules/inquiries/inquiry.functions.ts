import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  callSourceMutation,
  callSourceQuery,
  ConvexSourceError,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import type { CapabilityKind } from '@/modules/catalog/public'
import type { ActionAgentIdentity, ActionSourceWriteRequest } from '@/modules/common/action'
import { isRecord } from '@/modules/common/is-record'
import { SourceWriteAdmissionError, type SourceWriteAdmission } from '@/modules/security/source-write-admission'
import { resolvePublicRegistryInquiryTarget } from '@/modules/registry/registry.functions'
import {
  type InquiryCustomerRecordReadback,
  type InquiryDeliveryReadback,
  type InquiryNotificationStatus,
  type InquiryOperatorReconstructionFilter,
  type InquiryOperatorReconstructionReadback,
  type InquiryPrivacyTombstoneRecord,
  type InquiryThreadStatus,
  type OwnerInboxReadback,
  type OwnerInquiryDetailReadback,
  type PublicInquiryContactInput,
  type R1TargetAdmission,
} from '@/modules/inquiries/public'
import {
  createLocalE2eInquiryServerBackend,
  type LocalE2eInquiryServerBackend,
} from './internal/local-e2e-adapter'

const inquiryCapabilityKindSchema = z.enum([
  'phone_inquiry',
  'quote_request',
  'emergency_callout_interest',
  'ae_hosted_discovery',
])

export const publicInquirySubmitSchema = z.object({
  target: z.union([
    z.object({
      businessId: z.string(),
      serviceId: z.string(),
      capabilityKind: inquiryCapabilityKindSchema,
    }).strict(),
    z.object({
      businessSlug: z.string(),
      serviceSlug: z.string(),
      capabilityKind: inquiryCapabilityKindSchema,
    }).strict(),
  ]),
  body: z.string(),
  contact: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }).strict(),
  expectedDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  operationKey: z.string().trim().min(16).max(240).optional(),
  inquiryOrigin: z.object({
    kind: z.literal('answer_thread'),
    threadId: z.string().trim().min(1).max(200),
  }).strict().optional(),
}).strict()

const ownerThreadSchema = z.object({
  threadId: z.string(),
})

const customerRecordSchema = z.object({
  threadId: z.string(),
  accessKey: z.string(),
})

export const ownerTargetAdmissionSchema = z.object({
  businessId: z.string().trim().min(1),
  serviceId: z.string().trim().min(1),
  capabilityKind: inquiryCapabilityKindSchema,
}).strict()

export const publicTargetAdmissionSchema = ownerTargetAdmissionSchema

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
  expectedDigest: string
  pseudonymousSessionId: string
  abuseBucketKey: string
  operationKey: string
  correlationId: string
  inquiryOrigin?: {
    kind: 'answer_thread'
    threadId: string
  }
  origin?: string
  sourceWrite?: SourceWriteAdmission
}

export type PublicTargetAdmissionReadResult =
  | Readonly<{ kind: 'ok'; admission: R1TargetAdmission }>
  | Readonly<{
      kind: 'error'
      code: 'source_unavailable'
      reason: string
      retryable: true
    }>

export type OwnerTargetAdmissionReadResult =
  | Readonly<{ kind: 'ok'; admission: R1TargetAdmission }>
  | Readonly<{
      kind: 'error'
      code: 'owner_not_found' | 'inquiry_target_not_found' | 'inquiry_target_wrong_owner' | 'source_unavailable'
      reason: string
      retryable: boolean
    }>

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
        customerAccessKey: string
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
        accessKey: string
      }
    }
  | ServerErrorResult


export type CustomerInquiryRecordServerResult =
  | {
      kind: 'ok'
      code: 'inquiry_customer_record_read'
      record: InquiryCustomerRecordReadback
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
  origin?: string
  sourceWrite?: SourceWriteAdmission
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
const readCustomerRecordSourceQuery = sourceQuery<{ threadId: string; accessKey: string }, CustomerInquiryRecordServerResult>('inquiries:readCustomerRecord')
const listOwnerInboxQuery = sourceQuery<Record<string, never>, OwnerInboxSourceResult>('inquiries:listCurrentOwnerInbox')
const readPublicTargetAdmissionQuery = sourceQuery<
  z.infer<typeof publicTargetAdmissionSchema>,
  R1TargetAdmission
>('inquiries:readPublicTargetAdmission')

const readCurrentOwnerTargetAdmissionQuery = sourceQuery<
  z.infer<typeof ownerTargetAdmissionSchema>,
  OwnerTargetAdmissionReadResult
>('inquiries:readCurrentOwnerTargetAdmission')
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
  .handler(async ({ data, context }) => submitPublicInquiryThroughSource(data, context))

export const readPublicTargetAdmissionServer = createServerFn()
  .validator((data) => publicTargetAdmissionSchema.parse(data))
  .handler(async ({ data }) => readPublicTargetAdmissionThroughSource(data))

export const readCurrentOwnerInboxServer = createServerFn().handler(() => readCurrentOwnerInboxThroughSource())

export const readCurrentOwnerTargetAdmissionServer = createServerFn()
  .validator((data) => ownerTargetAdmissionSchema.parse(data))
  .handler(async ({ data }) => readCurrentOwnerTargetAdmissionThroughSource(data))

export const readCustomerRecordServer = createServerFn()
  .validator((data) => customerRecordSchema.parse(data))
  .handler(async ({ data }) => readCustomerRecordThroughSource(data))

export const readInquiryOperatorReconstructionServer = createServerFn()
  .validator((data) => operatorReconstructionSchema.parse(data))
  .handler(async ({ data }) => readInquiryOperatorReconstructionThroughSource(data))

export const readCurrentOwnerInquiryThreadServer = createServerFn()
  .validator((data) => ownerThreadSchema.parse(data))
  .handler(async ({ data }) => readCurrentOwnerInquiryThreadThroughSource(data.threadId))

export const replyCurrentOwnerInquiryServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerReplySchema.parse(data))
  .handler(async ({ data, context }) => replyCurrentOwnerInquiryThroughSource(data, context))

export const markCurrentOwnerInquiryReadServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerVersionedSchema.parse(data))
  .handler(async ({ data, context }) => markCurrentOwnerInquiryReadThroughSource(data, context))

export const closeCurrentOwnerInquiryServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerVersionedSchema.parse(data))
  .handler(async ({ data, context }) => closeCurrentOwnerInquiryThroughSource(data, context))

export type InquiryServerBackendKind = 'source' | 'local-e2e'

export type InquiryServerBackend = Readonly<{
  submitPublicInquiry: (
    data: z.infer<typeof publicInquirySubmitSchema>,
    context?: unknown,
  ) => Promise<PublicInquirySubmitServerResult>
  readCustomerRecord: (
    data: z.infer<typeof customerRecordSchema>,
  ) => Promise<CustomerInquiryRecordServerResult>
  readCurrentOwnerInbox: () => Promise<OwnerInboxServerResult>
  readInquiryOperatorReconstruction: (
    filter?: InquiryOperatorReconstructionFilter,
  ) => Promise<InquiryOperatorReconstructionServerResult>
  readCurrentOwnerInquiryThread: (threadId: string) => Promise<OwnerInquiryThreadServerResult>
  readPublicTargetAdmission: (
    target: z.infer<typeof publicTargetAdmissionSchema>,
  ) => Promise<PublicTargetAdmissionReadResult>
  readCurrentOwnerTargetAdmission: (
    target: z.infer<typeof ownerTargetAdmissionSchema>,
  ) => Promise<OwnerTargetAdmissionReadResult>
  markCurrentOwnerInquiryRead: (
    data: z.infer<typeof ownerVersionedSchema>,
    context?: unknown,
  ) => Promise<OwnerInquiryMutationServerResult>
  replyCurrentOwnerInquiry: (
    data: z.infer<typeof ownerReplySchema>,
    context?: unknown,
  ) => Promise<OwnerInquiryMutationServerResult>
  closeCurrentOwnerInquiry: (
    data: z.infer<typeof ownerVersionedSchema>,
    context?: unknown,
  ) => Promise<OwnerInquiryMutationServerResult>
}>

export function resolveInquiryServerBackend(): InquiryServerBackend {
  return createInquiryServerBackend(isLocalE2EAuthBypassEnabled() ? 'local-e2e' : 'source')
}

export function createInquiryServerBackend(kind: InquiryServerBackendKind): InquiryServerBackend {
  if (kind === 'local-e2e') {
    return wrapLocalE2eInquiryServerBackend(createLocalE2eInquiryServerBackend())
  }
  return createSourceInquiryServerBackend()
}

function wrapLocalE2eInquiryServerBackend(local: LocalE2eInquiryServerBackend): InquiryServerBackend {
  return {
    submitPublicInquiry: async (data, _context) => {
      try {
        const resolved = await resolvePublicInquiryTarget(data.target)
        if (resolved.kind === 'error') {
          return resolved
        }
        return local.submitPublicInquiry({
          target: data.target,
          body: data.body,
          contact: compactContact(data.contact),
          expectedDigest: data.expectedDigest,
          ...(data.operationKey === undefined ? {} : { operationKey: data.operationKey }),
          ...(data.inquiryOrigin === undefined ? {} : { inquiryOrigin: data.inquiryOrigin }),
        }, resolved.target) as PublicInquirySubmitServerResult
      } catch (error) {
        return inquirySourceError(error)
      }
    },
    readCustomerRecord: async (data) => local.readCustomerRecord(data) as CustomerInquiryRecordServerResult,
    readCurrentOwnerInbox: async () => local.readCurrentOwnerInbox() as OwnerInboxServerResult,
    readInquiryOperatorReconstruction: async (filter = {}) =>
      local.readInquiryOperatorReconstruction(filter) as InquiryOperatorReconstructionServerResult,
    readCurrentOwnerInquiryThread: async (threadId) =>
      local.readCurrentOwnerInquiryThread(threadId) as OwnerInquiryThreadServerResult,
    readPublicTargetAdmission: async (target) =>
      local.readPublicTargetAdmission(target) as PublicTargetAdmissionReadResult,
    readCurrentOwnerTargetAdmission: async (target) =>
      local.readCurrentOwnerTargetAdmission(target) as OwnerTargetAdmissionReadResult,
    markCurrentOwnerInquiryRead: async (data) =>
      local.markCurrentOwnerInquiryRead(data) as OwnerInquiryMutationServerResult,
    replyCurrentOwnerInquiry: async (data) =>
      local.replyCurrentOwnerInquiry(data) as OwnerInquiryMutationServerResult,
    closeCurrentOwnerInquiry: async (data) =>
      local.closeCurrentOwnerInquiry(data) as OwnerInquiryMutationServerResult,
  }
}

function createSourceInquiryServerBackend(): InquiryServerBackend {
  return {
    submitPublicInquiry: async (data, context) => {
      try {
        const resolved = await resolvePublicInquiryTarget(data.target)
        if (resolved.kind === 'error') {
          return resolved
        }
        const target = resolved.target
        const operationSuffix = data.operationKey ?? resolvePublicInquiryOperationSuffix(target, context)
        const operationKey = data.operationKey ?? `inquiry:${operationSuffix}`
        const correlationId = `correlation:${normalizeOperationPart(operationSuffix)}`
        const result = await callPublicSourceMutation(submitPublicInquiryMutation, {
          target,
          body: data.body,
          contact: compactContact(data.contact),
          expectedDigest: data.expectedDigest,
          ...(data.inquiryOrigin === undefined ? {} : { inquiryOrigin: data.inquiryOrigin }),
          pseudonymousSessionId: `public-inquiry:${operationSuffix}`,
          abuseBucketKey: `public-inquiry:${normalizeOperationPart(target.businessId)}:${normalizeOperationPart(target.serviceId)}`,
          ...(await browserMutationAdmission(context, 'public_inquiry', operationKey, correlationId)),
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
            accessKey: result.thread.customerAccessKey,
          },
        }
      } catch (error) {
        return inquirySourceError(error)
      }
    },
    readCustomerRecord: async (data) => {
      try {
        return await callPublicSourceQuery(readCustomerRecordSourceQuery, data)
      } catch (error) {
        return inquirySourceError(error)
      }
    },
    readCurrentOwnerInbox: async () => {
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
    },
    readInquiryOperatorReconstruction: async (filter = {}) => {
      try {
        return await callSourceQuery(readOperatorInquiryReconstructionQuery, compactOperatorFilter(filter))
      } catch {
        return deniedInquiryOperatorReconstruction(filter, 401, 'missing_membership')
      }
    },
    readCurrentOwnerInquiryThread: async (threadId) => {
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
    },
    readPublicTargetAdmission: async (target) => {
      try {
        return {
          kind: 'ok',
          admission: await callPublicSourceQuery(readPublicTargetAdmissionQuery, target),
        }
      } catch {
        return {
          kind: 'error',
          code: 'source_unavailable',
          reason: 'Request admission could not be checked from the source.',
          retryable: true,
        }
      }
    },
    readCurrentOwnerTargetAdmission: async (target) => {
      try {
        return await callSourceQuery(readCurrentOwnerTargetAdmissionQuery, target)
      } catch {
        return {
          kind: 'error',
          code: 'source_unavailable',
          reason: 'Request admission could not be checked from the source.',
          retryable: true,
        }
      }
    },
    markCurrentOwnerInquiryRead: async (data, context) => {
      try {
        const operationSuffix = `${normalizeOperationPart(data.threadId)}:${crypto.randomUUID()}`
        const operationKey = `inquiry:${operationSuffix}:read`
        const correlationId = `correlation:${operationSuffix}:read`
        return await callSourceMutation(markReadOwnerInquiryMutation, {
          threadId: data.threadId,
          expectedVersion: data.expectedVersion,
          ...(await browserMutationAdmission(context, 'owner_inquiry', operationKey, correlationId)),
        })
      } catch (error) {
        return ownerSourceError(error)
      }
    },
    replyCurrentOwnerInquiry: async (data, context) => {
      try {
        const operationSuffix = `${normalizeOperationPart(data.threadId)}:${crypto.randomUUID()}`
        const operationKey = `inquiry:${operationSuffix}:reply`
        const correlationId = `correlation:${operationSuffix}:reply`
        return await callSourceMutation(replyOwnerInquiryMutation, {
          threadId: data.threadId,
          expectedVersion: data.expectedVersion,
          body: data.body,
          ...(await browserMutationAdmission(context, 'owner_inquiry', operationKey, correlationId)),
        })
      } catch (error) {
        return ownerSourceError(error)
      }
    },
    closeCurrentOwnerInquiry: async (data, context) => {
      try {
        const operationSuffix = `${normalizeOperationPart(data.threadId)}:${crypto.randomUUID()}`
        const operationKey = `inquiry:${operationSuffix}:close`
        const correlationId = `correlation:${operationSuffix}:close`
        return await callSourceMutation(closeOwnerInquiryMutation, {
          threadId: data.threadId,
          expectedVersion: data.expectedVersion,
          ...(await browserMutationAdmission(context, 'owner_inquiry', operationKey, correlationId)),
        })
      } catch (error) {
        return ownerSourceError(error)
      }
    },
  }
}

export async function submitPublicInquiryThroughSource(
  data: z.infer<typeof publicInquirySubmitSchema>,
  context?: unknown,
): Promise<PublicInquirySubmitServerResult> {
  const developmentAdapter = readDevelopmentInquirySubmitAdapter(context)
  if (developmentAdapter !== undefined) {
    return developmentAdapter(data) as Promise<PublicInquirySubmitServerResult>
  }
  return resolveInquiryServerBackend().submitPublicInquiry(data, context)
}

function readDevelopmentInquirySubmitAdapter(
  context: unknown,
): ((data: z.infer<typeof publicInquirySubmitSchema>) => Promise<PublicInquirySubmitServerResult>) | undefined {
  if (typeof context !== 'object' || context === null) return undefined
  const adapter = (context as { developmentOnlyInquirySubmitAdapter?: unknown })
    .developmentOnlyInquirySubmitAdapter
  return typeof adapter === 'function'
    ? adapter as (data: z.infer<typeof publicInquirySubmitSchema>) => Promise<PublicInquirySubmitServerResult>
    : undefined
}

export async function readCustomerRecordThroughSource(
  data: z.infer<typeof customerRecordSchema>,
): Promise<CustomerInquiryRecordServerResult> {
  return resolveInquiryServerBackend().readCustomerRecord(data)
}

export async function readCurrentOwnerInboxThroughSource(): Promise<OwnerInboxServerResult> {
  return resolveInquiryServerBackend().readCurrentOwnerInbox()
}

export async function readInquiryOperatorReconstructionThroughSource(
  filter: InquiryOperatorReconstructionFilter = {},
): Promise<InquiryOperatorReconstructionServerResult> {
  return resolveInquiryServerBackend().readInquiryOperatorReconstruction(filter)
}

export async function readCurrentOwnerInquiryThreadThroughSource(
  threadId: string,
): Promise<OwnerInquiryThreadServerResult> {
  return resolveInquiryServerBackend().readCurrentOwnerInquiryThread(threadId)
}

export async function readPublicTargetAdmissionThroughSource(
  target: z.infer<typeof publicTargetAdmissionSchema>,
): Promise<PublicTargetAdmissionReadResult> {
  return resolveInquiryServerBackend().readPublicTargetAdmission(target)
}

export async function readCurrentOwnerTargetAdmissionThroughSource(
  target: z.infer<typeof ownerTargetAdmissionSchema>,
): Promise<OwnerTargetAdmissionReadResult> {
  return resolveInquiryServerBackend().readCurrentOwnerTargetAdmission(target)
}

export async function markCurrentOwnerInquiryReadThroughSource(
  data: z.infer<typeof ownerVersionedSchema>,
  context?: unknown,
): Promise<OwnerInquiryMutationServerResult> {
  return resolveInquiryServerBackend().markCurrentOwnerInquiryRead(data, context)
}

export async function replyCurrentOwnerInquiryThroughSource(
  data: z.infer<typeof ownerReplySchema>,
  context?: unknown,
): Promise<OwnerInquiryMutationServerResult> {
  return resolveInquiryServerBackend().replyCurrentOwnerInquiry(data, context)
}

async function closeCurrentOwnerInquiryThroughSource(
  data: z.infer<typeof ownerVersionedSchema>,
  context?: unknown,
): Promise<OwnerInquiryMutationServerResult> {
  return resolveInquiryServerBackend().closeCurrentOwnerInquiry(data, context)
}

async function resolvePublicInquiryTarget(
  target: z.infer<typeof publicInquirySubmitSchema>['target'],
): Promise<{ kind: 'ok'; target: PublicInquirySubmitArgs['target'] } | ServerErrorResult> {
  if ('businessId' in target) {
    return {
      kind: 'ok',
      target: {
        businessId: target.businessId,
        serviceId: target.serviceId,
        capabilityKind: target.capabilityKind,
      },
    }
  }

  const resolution = await resolvePublicRegistryInquiryTarget({
    businessSlug: target.businessSlug,
    serviceSlug: target.serviceSlug,
  })
  if (resolution.kind === 'not_found') {
    return {
      kind: 'error',
      code: 'inquiry_target_not_found',
      retryable: false,
      reason: resolution.reason,
    }
  }

  return {
    kind: 'ok',
    target: {
      businessId: resolution.businessId,
      serviceId: resolution.serviceId,
      capabilityKind: target.capabilityKind,
    },
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
  reason: 'missing_membership' | 'inactive_membership' | 'action_not_allowed',
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

function ownerDeniedResult(reason: Extract<OwnerInboxSourceResult, { kind: 'denied' }>['reason']): ServerErrorResult {
  return {
    kind: 'error',
    code: reason,
    retryable: false,
    reason: reason === 'missing_auth' ? 'Owner sign-in is required for this inquiry readback.' : 'Owner membership was not found.',
  }
}

function inquirySourceError(error: unknown): ServerErrorResult {
  if (error instanceof SourceWriteAdmissionError) {
    return {
      kind: 'error',
      code: error.code,
      retryable: false,
      reason: 'Inquiry source write admission was rejected.',
    }
  }

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
  if (error instanceof SourceWriteAdmissionError) {
    return {
      kind: 'error',
      code: error.code,
      retryable: false,
      reason: 'Owner inquiry source write admission was rejected.',
    }
  }

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
function resolvePublicInquiryOperationSuffix(
  target: PublicInquirySubmitArgs['target'],
  context: unknown,
): string {
  const agentIdentity = actionAgentIdentityFromContext(context)
  const sourceWriteRequest = actionSourceWriteRequestFromContext(context)
  if (agentIdentity === undefined || sourceWriteRequest === undefined) {
    return `${normalizeOperationPart(target.businessId)}:${crypto.randomUUID()}`
  }

  return [
    normalizeOperationPart(target.businessId),
    normalizeOperationPart(target.serviceId),
    'agent',
    normalizeOperationPart(agentIdentity.signatureAgent),
    normalizeOperationPart(agentIdentity.keyid),
    normalizeOperationPart(sourceWriteRequest.bodyDigest),
  ].join(':')
}

function actionAgentIdentityFromContext(context: unknown): ActionAgentIdentity | undefined {
  if (!isRecord(context) || !isRecord(context.agentIdentity)) {
    return undefined
  }
  const identity = context.agentIdentity
  return identity.kind === 'identity' &&
    typeof identity.signatureAgent === 'string' &&
    typeof identity.keyid === 'string' &&
    typeof identity.verifiedAt === 'string'
    ? {
        kind: 'identity',
        signatureAgent: identity.signatureAgent,
        keyid: identity.keyid,
        verifiedAt: identity.verifiedAt,
      }
    : undefined
}

function actionSourceWriteRequestFromContext(context: unknown): ActionSourceWriteRequest | undefined {
  if (!isRecord(context) || !isRecord(context.sourceWriteRequest)) {
    return undefined
  }
  const request = context.sourceWriteRequest
  return typeof request.method === 'string' &&
    typeof request.origin === 'string' &&
    typeof request.pathname === 'string' &&
    typeof request.bodyDigest === 'string'
    ? {
        method: request.method,
        origin: request.origin,
        pathname: request.pathname,
        bodyDigest: request.bodyDigest,
      }
    : undefined
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

async function browserMutationAdmission(
  context: unknown,
  scope: 'public_inquiry' | 'owner_inquiry',
  operationKey: string,
  correlationId: string
) {
  return {
    origin: requestOrigin(),
    sourceWrite: await sourceWriteAdmissionFromContext({
      context,
      scope,
      operationKey,
      correlationId,
    }),
    operationKey,
    correlationId,
  }
}

function requestOrigin(): string {
  return readEnv('SITE_URL') ?? readEnv('VITE_SITE_URL') ?? 'https://ae.example'
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}
