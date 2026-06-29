import type { UserIdentity } from 'convex/server'
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { readActiveAdminMembership, resolveBusinessActor } from './authz'
import { runtimeDb } from './source_state'
import type { RuntimeDb, RuntimeDocument } from './source_state'
import { literalUnion } from '../src/modules/common/convex-literals'
import { brandNonEmpty } from '../src/modules/common/ids'
import { stableHash } from '../src/modules/common/stable-hash'
import type { RedactedPayload } from '../src/modules/observability/public'
import { assertCsrf } from '../src/modules/security/public'
import {
  createEmptyNotificationOutboxSourceState,
  dispatchNotificationOutbox as dispatchNotificationOutboxModule,
  enqueueInquiryNotification as enqueueInquiryNotificationModule,
  ingestNotificationWebhook as ingestNotificationWebhookModule,
  markNotificationNoRepair as markNotificationNoRepairModule,
  NotificationAttemptStatusValues,
  NotificationDispatchStatusValues,
  NotificationProviderFamilyValues,
  NotificationRecipientRoleValues,
  NotificationSignatureStatusValues,
  NotificationWebhookEventStatusValues,
  readNotificationDispatchReadback as readNotificationDispatchReadbackModule,
  retryNotificationDispatch as retryNotificationDispatchModule,
} from '../src/modules/notification-outbox/public'
import type {
  DispatchNotificationOutboxResult,
  EnqueueInquiryNotificationResult,
  IngestNotificationWebhookResult,
  MarkNotificationNoRepairResult,
  NotificationDispatchAttemptRecord,
  NotificationDispatchReadback,
  NotificationDispatchRecord,
  NotificationOperatorAuthority,
  NotificationOutboxSourceState,
  NotificationProviderAdapter,
  NotificationProviderTriggerResult,
  NotificationWebhookEventRecord,
  RetryNotificationDispatchResult,
} from '../src/modules/notification-outbox/public'

const notificationProviderFamily = literalUnion(NotificationProviderFamilyValues)
const notificationRecipientRole = literalUnion(NotificationRecipientRoleValues)
const notificationDispatchStatus = literalUnion(NotificationDispatchStatusValues)
const notificationAttemptStatus = literalUnion(NotificationAttemptStatusValues)
const notificationWebhookEventStatus = literalUnion(NotificationWebhookEventStatusValues)
const notificationSignatureStatus = literalUnion(NotificationSignatureStatusValues)

const csrfArgs = {
  csrfToken: v.optional(v.string()),
  csrfCookie: v.optional(v.string()),
  origin: v.optional(v.string()),
} as const

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
  db: object
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
  handler: async (ctx, args) => {
    const access = requireNotificationSystemAccess(args.systemKey)
    if (access.kind === 'denied') {
      return notificationRuntimeError('notification_system_denied', access.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadNotificationOutboxSourceState(db)
    const result = enqueueInquiryNotificationModule(state, {
      businessId: brandNonEmpty(args.businessId, 'BusinessId'),
      inquiryThreadId: args.inquiryThreadId,
      inquiryMessageId: args.inquiryMessageId,
      recipientRole: args.recipientRole,
      providerFamily: args.providerFamily,
      redactedPayload: parseRedactedPayload(args.redactedPayloadJson),
      ...(args.providerIdempotencyKey === undefined ? {} : { providerIdempotencyKey: args.providerIdempotencyKey }),
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      now: Date.now(),
    })

    if (result.kind === 'error') {
      return notificationError(result)
    }

    await persistNotificationOutboxSourceState(db, result.state)
    await recordNotificationOperationReconstruction(db, {
      code: result.code,
      dispatch: result.dispatch,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      actorKind: 'system',
      actorRef: 'system:notification-outbox',
    })
    return {
      kind: 'ok' as const,
      code: result.code,
      dispatch: serializeDispatch(result.dispatch),
    }
  },
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
  handler: async (ctx, args) => {
    const access = requireNotificationSystemAccess(args.systemKey)
    if (access.kind === 'denied') {
      return notificationRuntimeError('notification_system_denied', access.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadNotificationOutboxSourceState(db)
    const provider = args.providerResult === undefined ? undefined : providerAdapterForResult(state, args.dispatchId, args.providerResult)
    const result = dispatchNotificationOutboxModule(state, {
      dispatchId: brandNonEmpty(args.dispatchId, 'NotificationDispatchId'),
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      now: Date.now(),
    }, provider)

    if (result.kind === 'error') {
      return notificationError(result)
    }

    await persistNotificationOutboxSourceState(db, result.state)
    await recordNotificationOperationReconstruction(db, {
      code: result.code,
      dispatch: result.dispatch,
      attempt: result.attempt,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      actorKind: 'system',
      actorRef: 'system:notification-outbox',
    })
    return {
      kind: 'ok' as const,
      code: result.code,
      dispatch: serializeDispatch(result.dispatch),
      attempt: serializeAttempt(result.attempt),
    }
  },
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
  handler: async (ctx, args) => {
    const access = requireNotificationSystemAccess(args.systemKey)
    if (access.kind === 'denied') {
      return notificationRuntimeError('notification_system_denied', access.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadNotificationOutboxSourceState(db)
    const resolvedDispatchId = args.dispatchId ?? resolveWebhookDispatchId(state, args)
    const result = ingestNotificationWebhookModule(state, {
      providerFamily: args.providerFamily,
      providerEventId: args.providerEventId,
      logicalObjectKey: args.logicalObjectKey,
      eventType: args.eventType,
      signatureStatus: args.signatureStatus,
      payloadHash: brandNonEmpty(args.payloadHash, 'SourceHash'),
      redactedPayload: parseRedactedPayload(args.redactedPayloadJson),
      ...(resolvedDispatchId === undefined ? {} : { dispatchId: brandNonEmpty(resolvedDispatchId, 'NotificationDispatchId') }),
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      receivedAt: Date.now(),
    })

    if (result.kind === 'error') {
      return notificationError(result)
    }

    await persistNotificationOutboxSourceState(db, result.state)
    await recordNotificationOperationReconstruction(db, {
      code: result.code,
      webhookEvent: result.webhookEvent,
      ...(result.dispatch === undefined ? {} : { dispatch: result.dispatch }),
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      actorKind: 'system',
      actorRef: 'system:notification-webhook',
    })
    return {
      kind: 'ok' as const,
      code: result.code,
      webhookEvent: serializeWebhookEvent(result.webhookEvent),
      ...(result.dispatch === undefined ? {} : { dispatch: serializeDispatch(result.dispatch) }),
    }
  },
})

export const readNotificationDispatchForSystemSend = queryGeneric({
  args: {
    dispatchId: v.string(),
    systemKey: v.string(),
  },
  returns: notificationSystemSendReadResult,
  handler: async (ctx, args) => {
    const access = requireNotificationSystemAccess(args.systemKey)
    if (access.kind === 'denied') {
      return notificationRuntimeError('notification_system_denied', access.reason)
    }

    const db = runtimeDb(ctx.db)
    const dispatch = await readDispatchDocument(db, args.dispatchId)
    if (dispatch === null) {
      return notificationRuntimeError('notification_not_found')
    }

    const business = await db.get(stringField(dispatch, 'businessId'))
    if (business === null) {
      return notificationRuntimeError('notification_not_found')
    }

    const owner = await db.get(stringField(business, 'ownerId'))
    if (owner === null) {
      return notificationRuntimeError('owner_not_found')
    }

    return {
      kind: 'ok' as const,
      code: 'notification_dispatch_send_read' as const,
      send: {
        dispatch: serializeDispatch(toDispatchRecord(dispatch)),
        owner: {
          ownerId: owner._id,
          clerkUserId: stringField(owner, 'clerkUserId'),
        },
        business: {
          businessId: business._id,
          slug: stringField(business, 'slug'),
          name: stringField(business, 'name'),
        },
      },
    }
  },
})

export const readCurrentOwnerNotificationDispatchReadback = queryGeneric({
  args: {
    dispatchId: v.string(),
  },
  returns: notificationReadbackResult,
  handler: async (ctx, args) => {
    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return notificationRuntimeError(owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const dispatch = await readDispatchDocument(db, args.dispatchId)
    if (dispatch === null || !(await ownerOwnsDispatchBusiness(db, owner.ownerId, dispatch))) {
      return notificationRuntimeError('notification_not_found')
    }

    const state = await loadNotificationOutboxSourceState(db)
    const result = readNotificationDispatchReadbackModule(state, brandNonEmpty(args.dispatchId, 'NotificationDispatchId'))
    if (result.kind === 'error') {
      return notificationError(result)
    }

    return {
      kind: 'ok' as const,
      code: result.code,
      readback: serializeReadback(result.readback),
    }
  },
})

export const retryNotificationDispatchAsOperator = mutationGeneric({
  args: {
    dispatchId: v.string(),
    retryAfter: v.number(),
    ...csrfArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: notificationRepairResult,
  handler: async (ctx, args) => {
    const csrfDecision = assertNotificationCsrf(args)
    if (csrfDecision.kind === 'rejected') {
      return notificationRuntimeError('notification_csrf_rejected', csrfDecision.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadNotificationOutboxSourceState(db)
    const authority = await readCurrentOperatorAuthority(ctx)
    const result = retryNotificationDispatchModule(state, {
      ...(authority === undefined ? {} : { authority }),
      dispatchId: brandNonEmpty(args.dispatchId, 'NotificationDispatchId'),
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      retryAfter: args.retryAfter,
      now: Date.now(),
    })

    if (result.kind === 'error') {
      return notificationError(result)
    }

    await persistNotificationOutboxSourceState(db, result.state)
    await recordNotificationOperationReconstruction(db, {
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
  },
})

export const markNotificationDispatchNoRepairAsOperator = mutationGeneric({
  args: {
    dispatchId: v.string(),
    reason: v.string(),
    ...csrfArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: notificationRepairResult,
  handler: async (ctx, args) => {
    const csrfDecision = assertNotificationCsrf(args)
    if (csrfDecision.kind === 'rejected') {
      return notificationRuntimeError('notification_csrf_rejected', csrfDecision.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadNotificationOutboxSourceState(db)
    const authority = await readCurrentOperatorAuthority(ctx)
    const result = markNotificationNoRepairModule(state, {
      ...(authority === undefined ? {} : { authority }),
      dispatchId: brandNonEmpty(args.dispatchId, 'NotificationDispatchId'),
      reason: args.reason,
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      now: Date.now(),
    })

    if (result.kind === 'error') {
      return notificationError(result)
    }

    await persistNotificationOutboxSourceState(db, result.state)
    await recordNotificationOperationReconstruction(db, {
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
  },
})

async function readCurrentOwner(ctx: RuntimeCtx): Promise<
  | { kind: 'allowed'; ownerId: string }
  | { kind: 'denied'; reason: 'missing_auth' | 'owner_not_found' }
> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'denied', reason: 'missing_auth' }
  }

  const owner = await runtimeDb(ctx.db)
    .query('owners')
    .withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', actor.clerkUserId))
    .unique()

  return owner === null ? { kind: 'denied', reason: 'owner_not_found' } : { kind: 'allowed', ownerId: owner._id }
}

async function readCurrentOperatorAuthority(ctx: RuntimeCtx): Promise<NotificationOperatorAuthority | undefined> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    return undefined
  }

  const membership = await readActiveAdminMembership(runtimeDb(ctx.db), identity.subject)
  if (membership === undefined) {
    return undefined
  }

  return {
    role: membership.role,
    actorRef: `admin:${membership.clerkUserId}`,
  }
}

async function ownerOwnsDispatchBusiness(db: RuntimeDb, ownerId: string, dispatch: RuntimeDocument): Promise<boolean> {
  const business = await db.get(stringField(dispatch, 'businessId'))
  return business !== null && stringField(business, 'ownerId') === ownerId
}

async function readDispatchDocument(db: RuntimeDb, dispatchId: string): Promise<RuntimeDocument | null> {
  return await db
    .query('notificationDispatches')
    .withIndex('by_dispatchId', (query) => query.eq('dispatchId', dispatchId))
    .unique()
}

async function loadNotificationOutboxSourceState(db: RuntimeDb): Promise<NotificationOutboxSourceState> {
  const [dispatches, attempts, webhookEvents, operatorControls] = await Promise.all([
    collect(db, 'notificationDispatches'),
    collect(db, 'notificationDispatchAttempts'),
    collect(db, 'notificationWebhookEvents'),
    collect(db, 'operatorControls'),
  ])

  return createEmptyNotificationOutboxSourceState({
    dispatches: dispatches.map(toDispatchRecord),
    attempts: attempts.map(toAttemptRecord),
    webhookEvents: webhookEvents.map(toWebhookEventRecord),
    controls: {
      notificationDispatchEnabled: operatorControlEnabled(operatorControls, 'notification_dispatch_enabled'),
      notificationWebhooksEnabled: operatorControlEnabled(operatorControls, 'notification_webhooks_enabled'),
    },
  })
}

async function persistNotificationOutboxSourceState(db: RuntimeDb, state: NotificationOutboxSourceState): Promise<void> {
  for (const dispatch of state.dispatches) {
    await upsertByFields(db, 'notificationDispatches', ['dispatchId'], {
      dispatchId: dispatch.dispatchId,
      businessId: dispatch.businessId,
      inquiryThreadId: dispatch.inquiryThreadId,
      inquiryMessageId: dispatch.inquiryMessageId,
      recipientRole: dispatch.recipientRole,
      providerFamily: dispatch.providerFamily,
      status: dispatch.status,
      providerIdempotencyKey: dispatch.providerIdempotencyKey,
      redactedPayloadJson: JSON.stringify(dispatch.redactedPayload),
      payloadHash: dispatch.payloadHash,
      ...(dispatch.resendMessageId === undefined ? {} : { resendMessageId: dispatch.resendMessageId }),
      ...(dispatch.novuTransactionId === undefined ? {} : { novuTransactionId: dispatch.novuTransactionId }),
      ...(dispatch.novuWorkflowId === undefined ? {} : { novuWorkflowId: dispatch.novuWorkflowId }),
      ...(dispatch.novuMessageId === undefined ? {} : { novuMessageId: dispatch.novuMessageId }),
      ...(dispatch.novuSubscriberId === undefined ? {} : { novuSubscriberId: dispatch.novuSubscriberId }),
      providerMissing: dispatch.providerMissing,
      orchestratorMissing: dispatch.orchestratorMissing,
      retryCount: dispatch.retryCount,
      ...(dispatch.retryAfter === undefined ? {} : { retryAfter: dispatch.retryAfter }),
      ...(dispatch.lastRedactedError === undefined ? {} : { lastRedactedError: dispatch.lastRedactedError }),
      operationKey: dispatch.operationKey,
      correlationId: dispatch.correlationId,
      createdAt: dispatch.createdAt,
      updatedAt: dispatch.updatedAt,
    })
  }

  for (const attempt of state.attempts) {
    await upsertByFields(db, 'notificationDispatchAttempts', ['attemptId'], {
      attemptId: attempt.attemptId,
      dispatchId: attempt.dispatchId,
      providerFamily: attempt.providerFamily,
      status: attempt.status,
      providerIdempotencyKey: attempt.providerIdempotencyKey,
      requestPayloadHash: attempt.requestPayloadHash,
      redactedRequestPayloadJson: JSON.stringify(attempt.redactedRequestPayload),
      ...(attempt.providerResponseHash === undefined ? {} : { providerResponseHash: attempt.providerResponseHash }),
      ...(attempt.redactedError === undefined ? {} : { redactedError: attempt.redactedError }),
      ...(attempt.retryAfter === undefined ? {} : { retryAfter: attempt.retryAfter }),
      startedAt: attempt.startedAt,
      ...(attempt.completedAt === undefined ? {} : { completedAt: attempt.completedAt }),
    })
  }

  for (const webhookEvent of state.webhookEvents) {
    await upsertByFields(db, 'notificationWebhookEvents', ['webhookEventId'], {
      webhookEventId: webhookEvent.webhookEventId,
      providerFamily: webhookEvent.providerFamily,
      providerEventId: webhookEvent.providerEventId,
      logicalObjectKey: webhookEvent.logicalObjectKey,
      ...(webhookEvent.dispatchId === undefined ? {} : { dispatchId: webhookEvent.dispatchId }),
      status: webhookEvent.status,
      eventType: webhookEvent.eventType,
      signatureStatus: webhookEvent.signatureStatus,
      payloadHash: webhookEvent.payloadHash,
      redactedPayloadJson: JSON.stringify(webhookEvent.redactedPayload),
      ...(webhookEvent.reason === undefined ? {} : { reason: webhookEvent.reason }),
      operationKey: webhookEvent.operationKey,
      correlationId: webhookEvent.correlationId,
      receivedAt: webhookEvent.receivedAt,
    })
  }
}

type NotificationReconstructionInput = {
  code: string
  dispatch?: NotificationDispatchRecord
  attempt?: NotificationDispatchAttemptRecord
  webhookEvent?: NotificationWebhookEventRecord
  operationKey: string
  correlationId: string
  actorKind: 'admin' | 'system'
  actorRef: string
}

async function recordNotificationOperationReconstruction(db: RuntimeDb, input: NotificationReconstructionInput): Promise<void> {
  const targetRef = input.webhookEvent?.webhookEventId ?? input.dispatch?.dispatchId ?? 'notification:unknown'
  const businessId = input.dispatch?.businessId
  const requestHash = stableHash({
    code: input.code,
    ...(input.dispatch === undefined ? {} : { dispatchId: input.dispatch.dispatchId }),
    ...(input.attempt === undefined ? {} : { attemptId: input.attempt.attemptId }),
    ...(input.webhookEvent === undefined ? {} : { webhookEventId: input.webhookEvent.webhookEventId }),
  })
  const effectRefs = [
    `result:${input.code}`,
    input.dispatch === undefined ? undefined : `dispatch:${input.dispatch.dispatchId}`,
    input.dispatch === undefined ? undefined : `inquiryThread:${input.dispatch.inquiryThreadId}`,
    input.dispatch === undefined ? undefined : `inquiryMessage:${input.dispatch.inquiryMessageId}`,
    input.attempt === undefined ? undefined : `attempt:${input.attempt.attemptId}`,
    input.webhookEvent === undefined ? undefined : `webhook:${input.webhookEvent.webhookEventId}`,
  ].filter(isString)

  await upsertByFields(db, 'operationKeys', ['scope', 'key'], {
    scope: 'notification',
    actorKind: input.actorKind,
    actorRef: input.actorRef,
    operationName: notificationOperationName(input.code),
    key: input.operationKey,
    requestHash,
    sourceHash: targetRef,
    status: 'succeeded',
    resultHash: stableHash({ code: input.code, targetRef }),
    effectRefs,
    createdAt: notificationReconstructionTime(input),
    updatedAt: notificationReconstructionTime(input),
  })

  const reasonCode = notificationReasonCode(input)
  await upsertNotificationAuditEvent(db, {
    eventType: notificationAuditEventType(input),
    targetType: input.webhookEvent === undefined ? 'notification' : 'notification_provider_event',
    actorKind: input.actorKind,
    actorRef: input.actorRef,
    targetRef,
    ...(businessId === undefined ? {} : { businessId }),
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    beforeState: notificationBeforeState(input),
    afterState: notificationAfterState(input),
    ...(reasonCode === undefined ? {} : { reasonCode }),
    redactedPayload: notificationReconstructionPayload(input),
    createdAt: notificationReconstructionTime(input),
  })

  await upsertNotificationFunnelEvent(db, input)
}

async function upsertNotificationAuditEvent(
  db: RuntimeDb,
  input: {
    eventType: string
    targetType: 'notification' | 'notification_provider_event'
    actorKind: 'admin' | 'system'
    actorRef: string
    targetRef: string
    businessId?: string
    operationKey: string
    correlationId: string
    beforeState: string
    afterState: string
    reasonCode?: string
    redactedPayload: RedactedPayload
    createdAt: number
  }
): Promise<void> {
  await upsertByFields(db, 'auditEvents', ['eventId'], {
    eventId: `audit:${stableHash({
      eventType: input.eventType,
      operationKey: input.operationKey,
      targetRef: input.targetRef,
    })}`,
    eventType: input.eventType,
    actorKind: input.actorKind,
    actorRef: input.actorRef,
    ...(input.businessId === undefined ? {} : { businessId: input.businessId }),
    targetType: input.targetType,
    targetRef: input.targetRef,
    beforeState: input.beforeState,
    afterState: input.afterState,
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
    idempotencyKey: input.operationKey,
    correlationId: input.correlationId,
    evidenceRefs: [],
    redactedPayloadJson: JSON.stringify(input.redactedPayload),
    payloadHash: stableHash(input.redactedPayload),
    createdAt: input.createdAt,
  })
}

async function upsertNotificationFunnelEvent(db: RuntimeDb, input: NotificationReconstructionInput): Promise<void> {
  const eventType = notificationFunnelEventType(input)
  if (eventType === undefined || input.dispatch === undefined) {
    return
  }

  await upsertByFields(db, 'funnelEvents', ['eventType', 'businessId', 'correlationId', 'createdAt'], {
    eventType,
    source: 'notification-outbox',
    stage: 'published',
    pseudonymousSessionId: `notification:${input.dispatch.recipientRole}`,
    businessId: input.dispatch.businessId,
    redactedPayloadJson: JSON.stringify({
      dispatchId: input.dispatch.dispatchId,
      providerFamily: input.dispatch.providerFamily,
      status: input.dispatch.status,
    }),
    consentFlag: true,
    correlationId: input.correlationId,
    createdAt: notificationReconstructionTime(input),
  })
}

function resolveWebhookDispatchId(state: NotificationOutboxSourceState, args: { logicalObjectKey: string; providerEventId: string }): string | undefined {
  return state.dispatches.find((dispatch) =>
    dispatch.dispatchId === args.logicalObjectKey ||
    dispatch.providerIdempotencyKey === args.logicalObjectKey ||
    dispatch.resendMessageId === args.logicalObjectKey ||
    dispatch.novuTransactionId === args.logicalObjectKey ||
    dispatch.novuWorkflowId === args.logicalObjectKey ||
    dispatch.novuMessageId === args.logicalObjectKey ||
    dispatch.novuSubscriberId === args.logicalObjectKey ||
    dispatch.dispatchId === args.providerEventId ||
    dispatch.providerIdempotencyKey === args.providerEventId
  )?.dispatchId
}

function notificationOperationName(code: string): string {
  if (code === 'notification_queued' || code === 'notification_enqueue_replayed') {
    return 'enqueueInquiryNotification'
  }
  if (code.startsWith('notification_webhook_')) {
    return 'ingestNotificationWebhook'
  }
  if (code === 'notification_retry_scheduled') {
    return 'retryNotificationDispatch'
  }
  if (code === 'notification_no_repair_marked') {
    return 'markNotificationNoRepair'
  }
  return 'dispatchNotificationOutbox'
}

function notificationAuditEventType(input: NotificationReconstructionInput): string {
  if (input.code === 'notification_queued' || input.code === 'notification_enqueue_replayed') return 'notification.queued'
  if (input.code === 'notification_sent') return 'notification.sent'
  if (input.code === 'notification_provider_missing' || input.code === 'notification_orchestrator_missing') return 'notification.failed'
  if (input.code === 'notification_dispatch_failed') return 'notification.failed'
  if (input.code === 'notification_retry_scheduled') return 'notification.retry_scheduled'
  if (input.code === 'notification_no_repair_marked') return 'notification.no_repair_marked'
  if (input.code === 'notification_webhook_duplicate') return 'notification.webhook_duplicate'
  if (input.code === 'notification_webhook_rejected') return 'notification.webhook_rejected'
  if (input.code === 'notification_webhook_held') return 'notification.webhook_held'
  if (input.code === 'notification_webhook_received') return 'notification.webhook_received'
  return 'notification.triggered'
}

function notificationBeforeState(input: NotificationReconstructionInput): string {
  if (input.code === 'notification_queued' || input.code === 'notification_enqueue_replayed') return 'none'
  if (input.webhookEvent !== undefined) return 'provider_event_received'
  return 'queued'
}

function notificationAfterState(input: NotificationReconstructionInput): string {
  if (input.webhookEvent !== undefined) return input.webhookEvent.status
  return input.dispatch?.status ?? input.code
}

function notificationReasonCode(input: NotificationReconstructionInput): string | undefined {
  return input.webhookEvent?.reason ?? input.dispatch?.lastRedactedError ?? input.attempt?.redactedError
}

function notificationReconstructionPayload(input: NotificationReconstructionInput): RedactedPayload {
  return {
    code: input.code,
    ...(input.dispatch === undefined
      ? {}
      : {
          dispatchId: input.dispatch.dispatchId,
          providerFamily: input.dispatch.providerFamily,
          status: input.dispatch.status,
          payloadHash: input.dispatch.payloadHash,
          inquiryThreadId: input.dispatch.inquiryThreadId,
          inquiryMessageId: input.dispatch.inquiryMessageId,
        }),
    ...(input.attempt === undefined
      ? {}
      : {
          attemptId: input.attempt.attemptId,
          attemptStatus: input.attempt.status,
          requestPayloadHash: input.attempt.requestPayloadHash,
        }),
    ...(input.webhookEvent === undefined
      ? {}
      : {
          webhookEventId: input.webhookEvent.webhookEventId,
          providerEventId: input.webhookEvent.providerEventId,
          logicalObjectKey: input.webhookEvent.logicalObjectKey,
          status: input.webhookEvent.status,
          signatureStatus: input.webhookEvent.signatureStatus,
          payloadHash: input.webhookEvent.payloadHash,
        }),
  }
}

function notificationReconstructionTime(input: NotificationReconstructionInput): number {
  return input.webhookEvent?.receivedAt ?? input.attempt?.completedAt ?? input.attempt?.startedAt ?? input.dispatch?.updatedAt ?? Date.now()
}

function notificationFunnelEventType(input: NotificationReconstructionInput): 'notification_queued' | 'notification_delivered' | 'notification_failed' | undefined {
  if (input.code === 'notification_queued') {
    return 'notification_queued'
  }
  const status = input.dispatch?.status
  if (status === 'delivered' || status === 'sent') {
    return 'notification_delivered'
  }
  if (
    status === 'failed' ||
    status === 'provider_missing' ||
    status === 'orchestrator_missing' ||
    status === 'bounced' ||
    status === 'complained' ||
    status === 'suppressed'
  ) {
    return 'notification_failed'
  }
  return undefined
}

async function upsertByFields(
  db: RuntimeDb,
  tableName: string,
  fields: readonly string[],
  patch: Record<string, unknown>
): Promise<void> {
  const existing = (await collect(db, tableName)).find((row) => fields.every((field) => row[field] === patch[field]))
  if (existing === undefined) {
    await db.insert(tableName, patch)
    return
  }

  await db.patch(existing._id, patch)
}

async function collect(db: Pick<RuntimeDb, 'query'>, tableName: string): Promise<RuntimeDocument[]> {
  return db.query(tableName).collect()
}

function toDispatchRecord(row: RuntimeDocument): NotificationDispatchRecord {
  return {
    dispatchId: brandNonEmpty(stringField(row, 'dispatchId'), 'NotificationDispatchId'),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    inquiryThreadId: stringField(row, 'inquiryThreadId'),
    inquiryMessageId: stringField(row, 'inquiryMessageId'),
    recipientRole: recipientRole(row),
    providerFamily: providerFamily(row),
    status: dispatchStatus(row),
    providerIdempotencyKey: stringField(row, 'providerIdempotencyKey'),
    redactedPayload: parseRedactedPayload(stringField(row, 'redactedPayloadJson')),
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    ...(optionalStringField(row, 'resendMessageId') === undefined ? {} : { resendMessageId: stringField(row, 'resendMessageId') }),
    ...(optionalStringField(row, 'novuTransactionId') === undefined ? {} : { novuTransactionId: stringField(row, 'novuTransactionId') }),
    ...(optionalStringField(row, 'novuWorkflowId') === undefined ? {} : { novuWorkflowId: stringField(row, 'novuWorkflowId') }),
    ...(optionalStringField(row, 'novuMessageId') === undefined ? {} : { novuMessageId: stringField(row, 'novuMessageId') }),
    ...(optionalStringField(row, 'novuSubscriberId') === undefined ? {} : { novuSubscriberId: stringField(row, 'novuSubscriberId') }),
    providerMissing: booleanField(row, 'providerMissing'),
    orchestratorMissing: booleanField(row, 'orchestratorMissing'),
    retryCount: numberField(row, 'retryCount'),
    ...(optionalNumberField(row, 'retryAfter') === undefined ? {} : { retryAfter: numberField(row, 'retryAfter') }),
    ...(optionalStringField(row, 'lastRedactedError') === undefined ? {} : { lastRedactedError: stringField(row, 'lastRedactedError') }),
    operationKey: brandNonEmpty(stringField(row, 'operationKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

function toAttemptRecord(row: RuntimeDocument): NotificationDispatchAttemptRecord {
  return {
    attemptId: brandNonEmpty(stringField(row, 'attemptId'), 'NotificationDispatchAttemptId'),
    dispatchId: brandNonEmpty(stringField(row, 'dispatchId'), 'NotificationDispatchId'),
    providerFamily: providerFamily(row),
    status: attemptStatus(row),
    providerIdempotencyKey: stringField(row, 'providerIdempotencyKey'),
    requestPayloadHash: brandNonEmpty(stringField(row, 'requestPayloadHash'), 'SourceHash'),
    redactedRequestPayload: parseRedactedPayload(stringField(row, 'redactedRequestPayloadJson')),
    ...(optionalStringField(row, 'providerResponseHash') === undefined ? {} : { providerResponseHash: brandNonEmpty(stringField(row, 'providerResponseHash'), 'SourceHash') }),
    ...(optionalStringField(row, 'redactedError') === undefined ? {} : { redactedError: stringField(row, 'redactedError') }),
    ...(optionalNumberField(row, 'retryAfter') === undefined ? {} : { retryAfter: numberField(row, 'retryAfter') }),
    startedAt: numberField(row, 'startedAt'),
    ...(optionalNumberField(row, 'completedAt') === undefined ? {} : { completedAt: numberField(row, 'completedAt') }),
  }
}

function toWebhookEventRecord(row: RuntimeDocument): NotificationWebhookEventRecord {
  return {
    webhookEventId: brandNonEmpty(stringField(row, 'webhookEventId'), 'NotificationWebhookEventId'),
    providerFamily: providerFamily(row),
    providerEventId: stringField(row, 'providerEventId'),
    logicalObjectKey: stringField(row, 'logicalObjectKey'),
    ...(optionalStringField(row, 'dispatchId') === undefined ? {} : { dispatchId: brandNonEmpty(stringField(row, 'dispatchId'), 'NotificationDispatchId') }),
    status: webhookEventStatus(row),
    eventType: stringField(row, 'eventType'),
    signatureStatus: signatureStatus(row),
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    redactedPayload: parseRedactedPayload(stringField(row, 'redactedPayloadJson')),
    ...(optionalStringField(row, 'reason') === undefined ? {} : { reason: stringField(row, 'reason') }),
    operationKey: brandNonEmpty(stringField(row, 'operationKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    receivedAt: numberField(row, 'receivedAt'),
  }
}

function serializeReadback(readback: NotificationDispatchReadback) {
  return {
    dispatch: serializeDispatch(readback.dispatch),
    attempts: readback.attempts.map(serializeAttempt),
    webhookEvents: readback.webhookEvents.map(serializeWebhookEvent),
    ownerCanRepair: false as const,
    operatorNextAction: readback.operatorNextAction,
  }
}

function serializeDispatch(dispatch: NotificationDispatchRecord) {
  return {
    dispatchId: dispatch.dispatchId,
    businessId: dispatch.businessId,
    inquiryThreadId: dispatch.inquiryThreadId,
    inquiryMessageId: dispatch.inquiryMessageId,
    recipientRole: dispatch.recipientRole,
    providerFamily: dispatch.providerFamily,
    status: dispatch.status,
    providerIdempotencyKey: dispatch.providerIdempotencyKey,
    payloadHash: dispatch.payloadHash,
    ...(dispatch.resendMessageId === undefined ? {} : { resendMessageId: dispatch.resendMessageId }),
    ...(dispatch.novuTransactionId === undefined ? {} : { novuTransactionId: dispatch.novuTransactionId }),
    ...(dispatch.novuWorkflowId === undefined ? {} : { novuWorkflowId: dispatch.novuWorkflowId }),
    ...(dispatch.novuMessageId === undefined ? {} : { novuMessageId: dispatch.novuMessageId }),
    ...(dispatch.novuSubscriberId === undefined ? {} : { novuSubscriberId: dispatch.novuSubscriberId }),
    providerMissing: dispatch.providerMissing,
    orchestratorMissing: dispatch.orchestratorMissing,
    retryCount: dispatch.retryCount,
    ...(dispatch.retryAfter === undefined ? {} : { retryAfter: dispatch.retryAfter }),
    ...(dispatch.lastRedactedError === undefined ? {} : { lastRedactedError: dispatch.lastRedactedError }),
    operationKey: dispatch.operationKey,
    correlationId: dispatch.correlationId,
    createdAt: dispatch.createdAt,
    updatedAt: dispatch.updatedAt,
  }
}

function serializeAttempt(attempt: NotificationDispatchAttemptRecord) {
  return {
    attemptId: attempt.attemptId,
    dispatchId: attempt.dispatchId,
    providerFamily: attempt.providerFamily,
    status: attempt.status,
    providerIdempotencyKey: attempt.providerIdempotencyKey,
    requestPayloadHash: attempt.requestPayloadHash,
    ...(attempt.providerResponseHash === undefined ? {} : { providerResponseHash: attempt.providerResponseHash }),
    ...(attempt.redactedError === undefined ? {} : { redactedError: attempt.redactedError }),
    ...(attempt.retryAfter === undefined ? {} : { retryAfter: attempt.retryAfter }),
    startedAt: attempt.startedAt,
    ...(attempt.completedAt === undefined ? {} : { completedAt: attempt.completedAt }),
  }
}

function serializeWebhookEvent(event: NotificationWebhookEventRecord) {
  return {
    webhookEventId: event.webhookEventId,
    providerFamily: event.providerFamily,
    providerEventId: event.providerEventId,
    logicalObjectKey: event.logicalObjectKey,
    ...(event.dispatchId === undefined ? {} : { dispatchId: event.dispatchId }),
    status: event.status,
    eventType: event.eventType,
    signatureStatus: event.signatureStatus,
    payloadHash: event.payloadHash,
    ...(event.reason === undefined ? {} : { reason: event.reason }),
    operationKey: event.operationKey,
    correlationId: event.correlationId,
    receivedAt: event.receivedAt,
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

function notificationRuntimeError(
  code:
    | 'missing_auth'
    | 'owner_not_found'
    | 'notification_not_found'
    | 'notification_system_denied'
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

function assertNotificationCsrf(args: { csrfToken?: string; csrfCookie?: string; origin?: string }) {
  return assertCsrf({
    ...(args.csrfToken === undefined ? {} : { csrfToken: args.csrfToken }),
    ...(args.csrfCookie === undefined ? {} : { csrfCookie: args.csrfCookie }),
    ...(args.origin === undefined ? {} : { origin: args.origin }),
    allowedOrigins: sourceAllowedOrigins(),
  })
}

function sourceAllowedOrigins(): readonly string[] {
  const configured = readEnv('AE_ALLOWED_ORIGINS') ?? readEnv('VITE_AE_ALLOWED_ORIGINS') ?? readEnv('SITE_URL') ?? readEnv('VITE_SITE_URL')
  const origins = configured === undefined ? [] : configured.split(',').map((origin) => origin.trim()).filter(Boolean)
  return ['https://ae.example', ...origins.filter((origin) => origin !== 'https://ae.example')]
}

function readEnv(name: string): string | undefined {
  return typeof process === 'undefined' ? undefined : process.env[name]
}

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

function parseRedactedPayload(value: string): RedactedPayload {
  try {
    const parsed = JSON.parse(value) as unknown
    return isRedactedPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isRedactedPayload(value: unknown): value is RedactedPayload {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isRedactedPayload)
  }
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return Object.values(value).every(isRedactedPayload)
}

function operatorControlEnabled(rows: RuntimeDocument[], key: string): boolean {
  const active = rows.find((row) => stringField(row, 'key') === key && optionalExpiredAt(row) === undefined)
  return active === undefined ? true : booleanField(active, 'enabled')
}

function optionalExpiredAt(row: RuntimeDocument): number | undefined {
  const expiresAt = optionalNumberField(row, 'expiresAt')
  return expiresAt !== undefined && expiresAt <= Date.now() ? expiresAt : undefined
}

function providerFamily(row: RuntimeDocument) {
  const value = stringField(row, 'providerFamily')
  return value === 'novu' ? 'novu' : 'resend'
}

function recipientRole(row: RuntimeDocument) {
  return stringField(row, 'recipientRole') === 'customer' ? 'customer' : 'owner'
}

function dispatchStatus(row: RuntimeDocument) {
  const value = stringField(row, 'status')
  return NotificationDispatchStatusValues.find((candidate) => candidate === value) ?? 'queued'
}

function attemptStatus(row: RuntimeDocument) {
  const value = stringField(row, 'status')
  return NotificationAttemptStatusValues.find((candidate) => candidate === value) ?? 'pending'
}

function webhookEventStatus(row: RuntimeDocument) {
  const value = stringField(row, 'status')
  return NotificationWebhookEventStatusValues.find((candidate) => candidate === value) ?? 'held_for_operator'
}

function signatureStatus(row: RuntimeDocument) {
  return stringField(row, 'signatureStatus') === 'verified' ? 'verified' : 'rejected'
}

function stringField(row: RuntimeDocument, field: string): string {
  const value = row[field]
  return typeof value === 'string' ? value : ''
}

function optionalStringField(row: RuntimeDocument, field: string): string | undefined {
  const value = row[field]
  return typeof value === 'string' ? value : undefined
}

function numberField(row: RuntimeDocument, field: string): number {
  const value = row[field]
  return typeof value === 'number' ? value : 0
}

function optionalNumberField(row: RuntimeDocument, field: string): number | undefined {
  const value = row[field]
  return typeof value === 'number' ? value : undefined
}

function booleanField(row: RuntimeDocument, field: string): boolean {
  return row[field] === true
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
