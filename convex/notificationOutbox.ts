import type { GenericDatabaseReader, GenericDatabaseWriter, UserIdentity } from 'convex/server'
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { readActiveAdminMembership, resolveBusinessActor } from './authz'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import type { DataModel, Doc, Id } from './_generated/dataModel'
import { literalUnion } from '../src/modules/common/convex-literals'
import { brandNonEmpty } from '../src/modules/common/ids'
import {
  mintInquiryCustomerAccessKey,
  resolveInquiryCustomerAccessKeyring,
  type InquiryCustomerAccessGrant,
} from '../src/modules/inquiries/public'
import {
  parseRedactedPayload,
  resolveWebhookDispatchId,
  serializeAttempt,
  serializeDispatch,
  serializeReadback,
  serializeWebhookEvent,
} from '../src/modules/notification-outbox/operator'
import {
  ingestNotificationWebhook,
  markNotificationNoRepair,
  retryNotificationDispatch,
} from '../src/modules/notification-outbox/public'
import {
  dispatchNotificationOutbox as dispatchNotificationOutboxModule,
  enqueueInquiryNotification as enqueueInquiryNotificationModule,
  NotificationAttemptStatusValues,
  NotificationDispatchStatusValues,
  NotificationProviderFamilyValues,
  NotificationRecipientRoleValues,
  NotificationSignatureStatusValues,
  NotificationWebhookEventStatusValues,
  readNotificationDispatchReadback as readNotificationDispatchReadbackModule,
} from '../src/modules/notification-outbox/public'
import type {
  DispatchNotificationOutboxResult,
  EnqueueInquiryNotificationResult,
  IngestNotificationWebhookResult,
  MarkNotificationNoRepairResult,
  NotificationOperatorAuthority,
  NotificationOutboxSourceState,
  NotificationProviderAdapter,
  NotificationProviderTriggerResult,
  RetryNotificationDispatchResult,
} from '../src/modules/notification-outbox/public'
import { recordNotificationOperationReconstruction } from './notificationOutboxReconstruction'
import {
  loadNotificationOutboxSourceStateForDispatch,
  loadNotificationOutboxSourceStateForThread,
  loadNotificationOutboxSourceStateForWebhook,
  persistNotificationOutboxSourceState,
} from './notificationOutboxSourceState'

const notificationProviderFamily = literalUnion(NotificationProviderFamilyValues)
const notificationRecipientRole = literalUnion(NotificationRecipientRoleValues)
const notificationDispatchStatus = literalUnion(NotificationDispatchStatusValues)
const notificationAttemptStatus = literalUnion(NotificationAttemptStatusValues)
const notificationWebhookEventStatus = literalUnion(NotificationWebhookEventStatusValues)
const notificationSignatureStatus = literalUnion(NotificationSignatureStatusValues)


const notificationErrorCode = v.union(
  v.literal('notification_not_found'),
  v.literal('notification_duplicate_conflict'),
  v.literal('notification_dispatch_disabled'),
  v.literal('notification_webhooks_disabled'),
  v.literal('notification_operator_denied'),
  v.literal('notification_provider_mismatch'),
  v.literal('notification_terminal'),
  v.literal('notification_system_denied'),
  v.literal('notification_csrf_rejected'),
  v.literal('notification_owner_email_disabled'),
  v.literal('missing_auth'),
  v.literal('owner_not_found')
)

const notificationDispatchProjection = v.object({
  dispatchId: v.string(),
  businessId: v.string(),
  inquiryThreadId: v.string(),
  inquiryMessageId: v.string(),
  recipientRole: notificationRecipientRole,
  providerFamily: notificationProviderFamily,
  status: notificationDispatchStatus,
  providerIdempotencyKey: v.string(),
  payloadHash: v.string(),
  resendMessageId: v.optional(v.string()),
  novuTransactionId: v.optional(v.string()),
  novuWorkflowId: v.optional(v.string()),
  novuMessageId: v.optional(v.string()),
  novuSubscriberId: v.optional(v.string()),
  providerMissing: v.boolean(),
  orchestratorMissing: v.boolean(),
  retryCount: v.number(),
  retryAfter: v.optional(v.number()),
  lastRedactedError: v.optional(v.string()),
  operationKey: v.string(),
  correlationId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const notificationAttemptProjection = v.object({
  attemptId: v.string(),
  dispatchId: v.string(),
  providerFamily: notificationProviderFamily,
  status: notificationAttemptStatus,
  providerIdempotencyKey: v.string(),
  requestPayloadHash: v.string(),
  providerResponseHash: v.optional(v.string()),
  redactedError: v.optional(v.string()),
  retryAfter: v.optional(v.number()),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
})

const notificationWebhookEventProjection = v.object({
  webhookEventId: v.string(),
  providerFamily: notificationProviderFamily,
  providerEventId: v.string(),
  logicalObjectKey: v.string(),
  dispatchId: v.optional(v.string()),
  status: notificationWebhookEventStatus,
  eventType: v.string(),
  signatureStatus: notificationSignatureStatus,
  payloadHash: v.string(),
  reason: v.optional(v.string()),
  operationKey: v.string(),
  correlationId: v.string(),
  receivedAt: v.number(),
})

const enqueueNotificationResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(v.literal('notification_queued'), v.literal('notification_enqueue_replayed')),
    dispatch: notificationDispatchProjection,
  }),
  v.object({
    kind: v.literal('error'),
    code: notificationErrorCode,
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const dispatchNotificationResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(
      v.literal('notification_triggered'),
      v.literal('notification_sent'),
      v.literal('notification_provider_missing'),
      v.literal('notification_orchestrator_missing'),
      v.literal('notification_dispatch_failed'),
      v.literal('notification_dispatch_replayed')
    ),
    dispatch: notificationDispatchProjection,
    attempt: notificationAttemptProjection,
  }),
  v.object({
    kind: v.literal('error'),
    code: notificationErrorCode,
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const notificationWebhookResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(
      v.literal('notification_webhook_received'),
      v.literal('notification_webhook_duplicate'),
      v.literal('notification_webhook_rejected'),
      v.literal('notification_webhook_held')
    ),
    webhookEvent: notificationWebhookEventProjection,
    dispatch: v.optional(notificationDispatchProjection),
  }),
  v.object({
    kind: v.literal('error'),
    code: notificationErrorCode,
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const notificationRepairResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(v.literal('notification_retry_scheduled'), v.literal('notification_no_repair_marked')),
    dispatch: notificationDispatchProjection,
  }),
  v.object({
    kind: v.literal('error'),
    code: notificationErrorCode,
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const notificationProviderTriggerResult = v.union(
  v.object({
    kind: v.literal('ok'),
    status: v.union(v.literal('triggered'), v.literal('sent')),
    providerResponseHash: v.string(),
    resendMessageId: v.optional(v.string()),
    novuTransactionId: v.optional(v.string()),
    novuWorkflowId: v.optional(v.string()),
    novuMessageId: v.optional(v.string()),
    novuSubscriberId: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('error'),
    status: v.union(v.literal('failed'), v.literal('provider_missing'), v.literal('orchestrator_missing')),
    redactedError: v.string(),
    retryAfter: v.optional(v.number()),
    providerResponseHash: v.optional(v.string()),
  })
)

const notificationReadbackResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.literal('notification_dispatch_read'),
    readback: v.object({
      dispatch: notificationDispatchProjection,
      attempts: v.array(notificationAttemptProjection),
      webhookEvents: v.array(notificationWebhookEventProjection),
      ownerCanRepair: v.literal(false),
      operatorNextAction: v.union(
        v.literal('none'),
        v.literal('retry_available'),
        v.literal('operator_review_required'),
        v.literal('terminal')
      ),
    }),
  }),
  v.object({
    kind: v.literal('error'),
    code: notificationErrorCode,
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const notificationSystemSendReadResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.literal('notification_dispatch_send_read'),
    send: v.object({
      dispatch: notificationDispatchProjection,
      owner: v.object({
        ownerId: v.string(),
        clerkUserId: v.string(),
      }),
      business: v.object({
        businessId: v.string(),
        slug: v.string(),
        name: v.string(),
      }),
      inquiry: v.optional(v.object({
        offeringName: v.optional(v.string()),
        customerAccessToken: v.optional(v.string()),
        customerMessageFirstLine: v.optional(v.string()),
        isFirstInquiryForBusiness: v.boolean(),
      })),
    }),
  }),
  v.object({
    kind: v.literal('error'),
    code: notificationErrorCode,
    retryable: v.boolean(),
    reason: v.string(),
  })
)

type RuntimeCtx = {
  db: GenericDatabaseReader<DataModel>
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>
  }
}

type RuntimeNotificationProviderTriggerResult =
  | {
      kind: 'ok'
      status: 'triggered' | 'sent'
      providerResponseHash: string
      resendMessageId?: string
      novuTransactionId?: string
      novuWorkflowId?: string
      novuMessageId?: string
      novuSubscriberId?: string
    }
  | {
      kind: 'error'
      status: 'failed' | 'provider_missing' | 'orchestrator_missing'
      redactedError: string
      retryAfter?: number
      providerResponseHash?: string
    }

export const enqueueInquiryNotificationDispatch = mutationGeneric({
  args: {
    businessId: v.string(),
    inquiryThreadId: v.string(),
    inquiryMessageId: v.string(),
    recipientRole: notificationRecipientRole,
    providerFamily: notificationProviderFamily,
    redactedPayloadJson: v.string(),
    providerIdempotencyKey: v.optional(v.string()),
    systemKey: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: enqueueNotificationResult,
  handler: async () => ({
    kind: 'error' as const,
    code: 'notification_dispatch_disabled' as const,
    retryable: false,
    reason: 'Notification dispatch is retired.',
  }),
})

export const dispatchNotificationOutbox = mutationGeneric({
  args: {
    dispatchId: v.string(),
    systemKey: v.string(),
    providerResult: v.optional(notificationProviderTriggerResult),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: dispatchNotificationResult,
  handler: async () => ({
    kind: 'error' as const,
    code: 'notification_dispatch_disabled' as const,
    retryable: false,
    reason: 'Notification dispatch is retired.',
  }),
})

export const ingestNotificationWebhookEvent = mutationGeneric({
  args: {
    providerFamily: notificationProviderFamily,
    providerEventId: v.string(),
    logicalObjectKey: v.string(),
    eventType: v.string(),
    signatureStatus: notificationSignatureStatus,
    payloadHash: v.string(),
    redactedPayloadJson: v.string(),
    dispatchId: v.optional(v.string()),
    systemKey: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: notificationWebhookResult,
  handler: async () => ({
    kind: 'error' as const,
    code: 'notification_webhooks_disabled' as const,
    retryable: false,
    reason: 'Notification webhooks are retired.',
  }),
})

export const readNotificationDispatchForSystemSend = queryGeneric({
  args: {
    dispatchId: v.string(),
    systemKey: v.string(),
  },
  returns: notificationSystemSendReadResult,
  handler: async () => ({
    kind: 'error' as const,
    code: 'notification_system_denied' as const,
    retryable: false,
    reason: 'Notification send-read is retired.',
  }),
})

export const readCurrentOwnerNotificationDispatchReadback = queryGeneric({
  args: {
    dispatchId: v.string(),
  },
  returns: notificationReadbackResult,
  handler: async () => ({
    kind: 'error' as const,
    code: 'missing_auth' as const,
    retryable: false,
    reason: 'Notification readback is retired.',
  }),
})

export const retryNotificationDispatchAsOperator = mutationGeneric({
  args: {
    dispatchId: v.string(),
    retryAfter: v.number(),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: notificationRepairResult,
  handler: async () => ({
    kind: 'error' as const,
    code: 'notification_operator_denied' as const,
    retryable: false,
    reason: 'Notification repair is retired.',
  }),
})

export const markNotificationDispatchNoRepairAsOperator = mutationGeneric({
  args: {
    dispatchId: v.string(),
    reason: v.string(),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: notificationRepairResult,
  handler: async () => ({
    kind: 'error' as const,
    code: 'notification_operator_denied' as const,
    retryable: false,
    reason: 'Notification repair is retired.',
  }),
})

async function readCurrentOwner(ctx: RuntimeCtx): Promise<
  | { kind: 'allowed'; ownerId: Id<'owners'> }
  | { kind: 'denied'; reason: 'missing_auth' | 'owner_not_found' }
> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'denied', reason: 'missing_auth' }
  }

  const owner = await ctx.db
    .query('owners')
    .withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', actor.clerkUserId))
    .unique()

  return owner === null ? { kind: 'denied', reason: 'owner_not_found' } : { kind: 'allowed', ownerId: owner._id }
}

async function ownerOwnsDispatchBusiness(
  _db: GenericDatabaseReader<DataModel>,
  _ownerId: Id<'owners'>,
  _dispatch: Record<string, unknown>,
): Promise<boolean> {
  return false
}

async function readDispatchDocument(
  db: GenericDatabaseReader<DataModel>,
  dispatchId: string,
): Promise<Record<string, unknown> | null> { return null }

type NotificationRepairCommandResult = RetryNotificationDispatchResult | MarkNotificationNoRepairResult
type NotificationWriterCtx = {
  db: GenericDatabaseWriter<DataModel>
  auth: RuntimeCtx['auth']
}

async function runNotificationRepair(
  ctx: NotificationWriterCtx,
  args: Readonly<{ dispatchId: string; operationKey: string; correlationId: string }>,
  command: (
    state: NotificationOutboxSourceState,
    authority: NotificationOperatorAuthority | undefined,
    now: number,
  ) => NotificationRepairCommandResult,
) {
  const [state, authority] = await Promise.all([
    loadNotificationOutboxSourceStateForDispatch(ctx.db, args.dispatchId),
    readCurrentOperatorAuthority(ctx),
  ])
  const result = command(state, authority, Date.now())
  if (result.kind === 'error') {
    return notificationError(result)
  }
  await persistNotificationOutboxSourceState(ctx.db, state, result.state)
  await recordNotificationOperationReconstruction(ctx.db, {
    code: result.code,
    dispatch: result.dispatch,
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    actorKind: 'admin',
    actorRef: authority?.actorRef ?? 'admin:missing',
  })
  return {
    kind: 'ok' as const,
    code: result.code,
    dispatch: serializeDispatch(result.dispatch),
  }
}

async function readCurrentOperatorAuthority(
  ctx: NotificationWriterCtx,
): Promise<NotificationOperatorAuthority | undefined> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    return undefined
  }
  const membership = await readActiveAdminMembership(ctx.db, identity)
  if (membership === undefined) {
    return undefined
  }
  return {
    role: membership.role,
    actorRef: `admin:${membership.clerkUserId}`,
  }
}

function notificationError(
  result:
    | Extract<EnqueueInquiryNotificationResult, { kind: 'error' }>
    | Extract<DispatchNotificationOutboxResult, { kind: 'error' }>
    | Extract<IngestNotificationWebhookResult, { kind: 'error' }>
    | Extract<RetryNotificationDispatchResult, { kind: 'error' }>
    | Extract<MarkNotificationNoRepairResult, { kind: 'error' }>
    | { kind: 'error'; code: 'notification_not_found'; retryable: boolean; reason: string }
) {
  return {
    kind: 'error' as const,
    code: result.code,
    retryable: result.retryable,
    reason: result.reason,
  }
}

function providerAdapterForResult(
  state: NotificationOutboxSourceState,
  dispatchId: string,
  result: RuntimeNotificationProviderTriggerResult
): NotificationProviderAdapter | undefined {
  const dispatch = state.dispatches.find((candidate) => candidate.dispatchId === dispatchId)
  if (dispatch === undefined) {
    return undefined
  }

  return {
    family: dispatch.providerFamily,
    trigger: () => deserializeProviderResult(result),
  }
}

function deserializeProviderResult(result: RuntimeNotificationProviderTriggerResult): NotificationProviderTriggerResult {
  if (result.kind === 'ok') {
    return {
      kind: 'ok',
      status: result.status,
      providerResponseHash: brandNonEmpty(result.providerResponseHash, 'SourceHash'),
      ...(result.resendMessageId === undefined ? {} : { resendMessageId: result.resendMessageId }),
      ...(result.novuTransactionId === undefined ? {} : { novuTransactionId: result.novuTransactionId }),
      ...(result.novuWorkflowId === undefined ? {} : { novuWorkflowId: result.novuWorkflowId }),
      ...(result.novuMessageId === undefined ? {} : { novuMessageId: result.novuMessageId }),
      ...(result.novuSubscriberId === undefined ? {} : { novuSubscriberId: result.novuSubscriberId }),
    }
  }

  return {
    kind: 'error',
    status: result.status,
    redactedError: result.redactedError,
    ...(result.retryAfter === undefined ? {} : { retryAfter: result.retryAfter }),
    ...(result.providerResponseHash === undefined
      ? {}
      : { providerResponseHash: brandNonEmpty(result.providerResponseHash, 'SourceHash') }),
  }
}

type DispatchInquiryEmailContext = {
  offeringName?: string
  customerMessageFirstLine?: string
  customerAccessToken?: string
  isFirstInquiryForBusiness: boolean
}

async function readInquiryForDispatch(
  _db: GenericDatabaseReader<DataModel>,
  _dispatch: Record<string, unknown>,
): Promise<DispatchInquiryEmailContext | undefined> {
  return undefined
}

function firstNonEmptyLine(value: string): string | undefined {
  const line = value.split(/\r?\n/).find((candidate) => candidate.trim().length > 0)?.replace(/\s+/g, ' ').trim()
  return line === undefined || line.length === 0 ? undefined : line
}

function notificationRuntimeError(
  code:
    | 'missing_auth'
    | 'owner_not_found'
    | 'notification_not_found'
    | 'notification_system_denied'
    | 'notification_owner_email_disabled'
    | 'notification_csrf_rejected',
  reason: string = code
) {
  return {
    kind: 'error' as const,
    code,
    retryable: false,
    reason,
  }
}


async function readOwnerNewInquiryEmailEnabled(
  db: GenericDatabaseReader<DataModel>,
  ownerId: Id<'owners'>,
): Promise<boolean> { return false }

function requireNotificationSystemAccess(systemKey: string): { kind: 'allowed' } | { kind: 'denied'; reason: string } {
  const expected = process.env.AE_NOTIFICATION_OUTBOX_SECRET?.trim()
  if (expected === undefined || expected.length === 0) {
    return { kind: 'denied', reason: 'notification_outbox_secret_missing' }
  }
  if (systemKey !== expected) {
    return { kind: 'denied', reason: 'notification_outbox_secret_mismatch' }
  }

  return { kind: 'allowed' }
}

