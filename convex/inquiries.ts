import type { UserIdentity } from 'convex/server'
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { runtimeDb } from './source_state'
import type { RuntimeDb, RuntimeDocument } from './source_state'
import { resolveAdminAuthority, resolveBusinessActor } from './authz'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { literalUnion } from '../src/modules/common/convex-literals'
import { brandNonEmpty } from '../src/modules/common/ids'
import { stableHash } from '../src/modules/common/stable-hash'
import { CapabilityKindValues } from '../src/modules/catalog/public'
import type { BusinessServiceRecord, CapabilityKind, ServiceCapabilityRecord } from '../src/modules/catalog/public'
import type { BusinessRecord } from '../src/modules/business/public'
import {
  bindInquiryNotificationDispatches as bindInquiryNotificationDispatchesModule,
  createEmptyInquirySourceState,
  closeInquiry as closeInquiryModule,
  deleteInquiryPrivateContent as deleteInquiryPrivateContentModule,
  InquiryNotificationDispatchProviderValues,
  InquiryNotificationStatusValues,
  InquiryNotificationDispatchStatusValues,
  InquiryPrivacyTombstoneStatusValues,
  InquiryThreadStatusValues,
  listOwnerInbox as listOwnerInboxModule,
  markInquiryRead as markInquiryReadModule,
  readInquiryDeliveryReadback as readInquiryDeliveryReadbackModule,
  readInquiryOperatorReconstruction as readInquiryOperatorReconstructionModule,
  readInquiryPrivacyTombstone as readInquiryPrivacyTombstoneModule,
  OwnerInboxBucketValues,
  readOwnerInquiry as readOwnerInquiryModule,
  replyToInquiry as replyToInquiryModule,
  requestInquiryExport as requestInquiryExportModule,
  submitInquiry as submitInquiryModule,
} from '../src/modules/inquiries/public'
import type {
  CapabilityLaunchSupportRecord,
  InquiryDeliveryReadback,
  InquiryAuditRecord,
  InquiryExportReadback,
  InquiryFunnelRecord,
  InquiryOperatorDispatchAttemptRef,
  InquiryMessageRecord,
  InquiryNotificationDispatchBinding,
  InquiryNotificationDispatchProvider,
  InquiryNotificationDispatchStatus,
  InquiryNotificationRecord,
  InquiryOperatorReconstructionAllowedReadback,
  InquiryOperatorReconstructionFilter,
  InquiryOperatorReconstructionRow,
  InquiryOperatorWebhookRef,
  InquiryOperatorOperationRef,
  InquiryOperationRecord,
  InquiryPrivacyTombstoneRecord,
  InquirySourceState,
  InquiryThreadRecord,
  OwnerInboxReadback,
  OwnerInquiryDetailReadback,
} from '../src/modules/inquiries/public'
import {
  createEmptyNotificationOutboxSourceState,
  enqueueInquiryNotification as enqueueInquiryNotificationModule,
  NotificationAttemptStatusValues,
  NotificationDispatchStatusValues,
  NotificationProviderFamilyValues,
  NotificationSignatureStatusValues,
  NotificationWebhookEventStatusValues,
} from '../src/modules/notification-outbox/public'
import type {
  NotificationAttemptStatus,
  NotificationDispatchRecord,
  NotificationOutboxSourceState,
  NotificationProviderFamily,
  NotificationSignatureStatus,
  NotificationWebhookEventStatus,
} from '../src/modules/notification-outbox/public'
import type { RedactedPayload } from '../src/modules/observability/public'
import type { AbuseRateLimitBucketRecord, SuppressionRuleRecord } from '../src/modules/security/public'

const publicInquiryContact = v.object({
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
})

const inquiryTarget = v.object({
  businessId: v.string(),
  serviceId: v.string(),
  capabilityKind: literalUnion(CapabilityKindValues),
})

const csrfArgs = {
  csrfToken: v.optional(v.string()),
  csrfCookie: v.optional(v.string()),
  origin: v.optional(v.string()),
  ...sourceWriteArgs,
} as const

const submitInquiryErrorCode = v.union(
  v.literal('inquiry_target_unavailable'),
  v.literal('inquiry_target_suppressed'),
  v.literal('inquiry_target_not_ready'),
  v.literal('inquiry_invalid_input'),
  v.literal('inquiry_duplicate_conflict'),
  v.literal('inquiry_rate_limited'),
  v.literal('inquiry_unsafe_future_surface_field'),
  v.literal('inquiry_csrf_rejected')
)

const submitInquiryResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(v.literal('inquiry_submitted'), v.literal('inquiry_replayed')),
    thread: v.object({
      threadId: v.string(),
      businessId: v.string(),
      serviceId: v.string(),
      status: literalUnion(InquiryThreadStatusValues),
      version: v.number(),
    }),
    notification: v.object({
      notificationId: v.string(),
      status: literalUnion(InquiryNotificationStatusValues),
    }),
  }),
  v.object({
    kind: v.literal('error'),
    code: submitInquiryErrorCode,
    retryable: v.boolean(),
    reason: v.string(),
    field: v.optional(v.string()),
    retryAfter: v.optional(v.number()),
  })
)

const inboxInquiryProjection = v.object({
  threadId: v.string(),
  businessId: v.string(),
  serviceId: v.string(),
  capabilityKind: literalUnion(CapabilityKindValues),
  businessName: v.string(),
  serviceName: v.string(),
  status: literalUnion(InquiryThreadStatusValues),
  bucket: literalUnion(OwnerInboxBucketValues),
  preview: v.string(),
  notificationStatus: literalUnion(InquiryNotificationStatusValues),
  notificationLabel: v.string(),
  messageCount: v.number(),
  version: v.number(),
  submittedAt: v.number(),
  updatedAt: v.number(),
})

const inboxReadback = v.object({
  ownerId: v.string(),
  empty: v.boolean(),
  buckets: v.object({
    unread: v.number(),
    needs_reply: v.number(),
    resolved: v.number(),
  }),
  delivery: v.object({
    queued: v.number(),
    sent: v.number(),
    failed: v.number(),
    held: v.number(),
  }),
  inquiries: v.array(inboxInquiryProjection),
})

const ownerInboxResult = v.union(
  v.object({
    kind: v.literal('allowed'),
    inbox: inboxReadback,
  }),
  v.object({
    kind: v.literal('denied'),
    reason: v.union(v.literal('missing_auth'), v.literal('owner_not_found')),
  })
)

const ownerInquiryMessageProjection = v.object({
  messageId: v.string(),
  sender: v.union(v.literal('customer'), v.literal('owner')),
  body: v.string(),
  createdAt: v.number(),
})

const ownerInquiryNotificationProjection = v.object({
    notificationId: v.string(),
    messageId: v.string(),
    recipientRole: v.union(v.literal('owner'), v.literal('customer')),
    status: literalUnion(InquiryNotificationStatusValues),
    label: v.string(),
    updatedAt: v.number(),
    failureCode: v.optional(v.string()),
    dispatchIds: v.array(v.string()),
    providerFamilies: v.array(v.union(v.literal('resend'), v.literal('novu'))),
    dispatchStatuses: v.array(v.string()),
    dispatchBindings: v.array(v.object({
      dispatchId: v.string(),
      providerFamily: v.union(v.literal('resend'), v.literal('novu')),
      status: v.string(),
      providerIdempotencyKey: v.string(),
      payloadHash: v.string(),
      operatorNextAction: v.union(
        v.literal('none'),
        v.literal('retry_available'),
        v.literal('operator_review_required'),
        v.literal('terminal')
      ),
      updatedAt: v.number(),
    })),
})

const ownerInquiryDetailResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.literal('inquiry_read'),
    readback: v.object({
      inquiry: inboxInquiryProjection,
      messages: v.array(ownerInquiryMessageProjection),
      notifications: v.array(ownerInquiryNotificationProjection),
    }),
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(v.literal('inquiry_not_found'), v.literal('missing_auth'), v.literal('owner_not_found')),
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const ownerInquiryDeliveryReadbackResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.literal('inquiry_delivery_read'),
    readback: v.object({
      threadId: v.string(),
      notifications: v.array(ownerInquiryNotificationProjection),
    }),
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(v.literal('inquiry_not_found'), v.literal('missing_auth'), v.literal('owner_not_found')),
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const inquiryPrivacyTombstoneProjection = v.object({
  threadId: v.string(),
  businessId: v.string(),
  reasonCode: v.string(),
  status: literalUnion(InquiryPrivacyTombstoneStatusValues),
  operationKey: v.string(),
  correlationId: v.string(),
  createdAt: v.number(),
  appliedAt: v.optional(v.number()),
})

const inquiryExportMessageProjection = v.object({
  messageId: v.string(),
  sender: v.union(v.literal('customer'), v.literal('owner')),
  body: v.string(),
  bodyHash: v.string(),
  createdAt: v.number(),
  contactHash: v.optional(v.string()),
  privateDeletedAt: v.optional(v.number()),
})

const ownerInquiryExportResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.literal('inquiry_export_read'),
    exportData: v.object({
      thread: inboxInquiryProjection,
      messages: v.array(inquiryExportMessageProjection),
      notifications: v.array(ownerInquiryNotificationProjection),
      auditRefs: v.array(v.object({
        eventType: v.string(),
        targetRef: v.string(),
        payloadHash: v.string(),
        createdAt: v.number(),
      })),
      tombstones: v.array(inquiryPrivacyTombstoneProjection),
    }),
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(v.literal('inquiry_not_found'), v.literal('missing_auth'), v.literal('owner_not_found')),
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const ownerInquiryErrorCode = v.union(
  v.literal('inquiry_not_found'),
  v.literal('inquiry_terminal'),
  v.literal('inquiry_stale_version'),
  v.literal('inquiry_invalid_input'),
  v.literal('inquiry_duplicate_conflict'),
  v.literal('inquiry_owner_replies_disabled'),
  v.literal('inquiry_csrf_rejected'),
  v.literal('missing_auth'),
  v.literal('owner_not_found')
)

const ownerInquiryMutationResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(
      v.literal('inquiry_read_marked'),
      v.literal('inquiry_read_replayed'),
      v.literal('inquiry_replied'),
      v.literal('inquiry_reply_replayed'),
      v.literal('inquiry_closed'),
      v.literal('inquiry_close_replayed')
    ),
    thread: v.object({
      threadId: v.string(),
      status: literalUnion(InquiryThreadStatusValues),
      version: v.number(),
      updatedAt: v.number(),
    }),
    message: v.optional(v.object({
      messageId: v.string(),
      sender: v.union(v.literal('customer'), v.literal('owner')),
      createdAt: v.number(),
    })),
    notification: v.optional(v.object({
      notificationId: v.string(),
      status: literalUnion(InquiryNotificationStatusValues),
      recipientRole: v.union(v.literal('owner'), v.literal('customer')),
    })),
  }),
  v.object({
    kind: v.literal('error'),
    code: ownerInquiryErrorCode,
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const deleteInquiryPrivateContentResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(v.literal('inquiry_private_content_deleted'), v.literal('inquiry_private_content_delete_replayed')),
    tombstone: inquiryPrivacyTombstoneProjection,
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(
      v.literal('inquiry_not_found'),
      v.literal('inquiry_duplicate_conflict'),
      v.literal('inquiry_csrf_rejected'),
      v.literal('missing_auth'),
      v.literal('owner_not_found')
    ),
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const inquiryPrivacyTombstoneReadResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.literal('inquiry_privacy_tombstone_read'),
    tombstones: v.array(inquiryPrivacyTombstoneProjection),
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(v.literal('inquiry_not_found'), v.literal('missing_auth'), v.literal('owner_not_found')),
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const inquiryNotificationDispatchProviderValidator = literalUnion(InquiryNotificationDispatchProviderValues)
const inquiryNotificationDispatchStatusValidator = literalUnion(InquiryNotificationDispatchStatusValues)
const notificationProviderFamilyValidator = literalUnion(NotificationProviderFamilyValues)
const notificationAttemptStatusValidator = literalUnion(NotificationAttemptStatusValues)
const notificationWebhookEventStatusValidator = literalUnion(NotificationWebhookEventStatusValues)
const notificationSignatureStatusValidator = literalUnion(NotificationSignatureStatusValues)

const operatorReconstructionFilter = v.object({
  threadId: v.optional(v.string()),
  correlationId: v.optional(v.string()),
  dispatchId: v.optional(v.string()),
})

const operatorNextAction = v.union(
  v.literal('none'),
  v.literal('retry_available'),
  v.literal('operator_review_required'),
  v.literal('terminal')
)

const operatorMessageRef = v.object({
  messageId: v.string(),
  sender: v.union(v.literal('customer'), v.literal('owner')),
  bodyHash: v.string(),
  createdAt: v.number(),
  contactHash: v.optional(v.string()),
  privateDeletedAt: v.optional(v.number()),
})

const operatorNotificationRef = v.object({
  notificationId: v.string(),
  messageId: v.string(),
  recipientRole: v.union(v.literal('owner'), v.literal('customer')),
  status: literalUnion(InquiryNotificationStatusValues),
  payloadHash: v.string(),
  updatedAt: v.number(),
  failureCode: v.optional(v.string()),
  dispatchIds: v.array(v.string()),
})

const operatorDispatchAttemptRef = v.object({
  attemptId: v.string(),
  providerFamily: notificationProviderFamilyValidator,
  status: notificationAttemptStatusValidator,
  requestPayloadHash: v.string(),
  providerResponseHash: v.optional(v.string()),
  retryAfter: v.optional(v.number()),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
})

const operatorWebhookRef = v.object({
  webhookEventId: v.string(),
  providerFamily: notificationProviderFamilyValidator,
  providerEventId: v.string(),
  logicalObjectKey: v.string(),
  status: notificationWebhookEventStatusValidator,
  eventType: v.string(),
  signatureStatus: notificationSignatureStatusValidator,
  payloadHash: v.string(),
  reason: v.optional(v.string()),
  operationKey: v.string(),
  correlationId: v.string(),
  receivedAt: v.number(),
})

const operatorDispatchRef = v.object({
  dispatchId: v.string(),
  providerFamily: inquiryNotificationDispatchProviderValidator,
  status: inquiryNotificationDispatchStatusValidator,
  providerIdempotencyKey: v.string(),
  payloadHash: v.string(),
  operatorNextAction,
  updatedAt: v.number(),
  attemptRefs: v.array(operatorDispatchAttemptRef),
  webhookRefs: v.array(operatorWebhookRef),
})

const operatorAuditRef = v.object({
  eventType: v.string(),
  targetRef: v.string(),
  payloadHash: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  createdAt: v.number(),
})

const operatorFunnelRef = v.object({
  eventType: v.string(),
  businessId: v.string(),
  payloadHash: v.string(),
  correlationId: v.string(),
  createdAt: v.number(),
})

const operatorOperationRef = v.object({
  operationKey: v.string(),
  requestHash: v.string(),
  resultCode: v.string(),
  createdAt: v.number(),
  threadId: v.optional(v.string()),
  messageId: v.optional(v.string()),
  notificationId: v.optional(v.string()),
  dispatchId: v.optional(v.string()),
  webhookEventId: v.optional(v.string()),
})

const operatorReconstructionRow = v.object({
  rowId: v.string(),
  threadId: v.string(),
  businessId: v.string(),
  serviceId: v.string(),
  status: literalUnion(InquiryThreadStatusValues),
  sourceHash: v.string(),
  correlationIds: v.array(v.string()),
  operatorNextAction,
  messageRefs: v.array(operatorMessageRef),
  notificationRefs: v.array(operatorNotificationRef),
  dispatchRefs: v.array(operatorDispatchRef),
  auditRefs: v.array(operatorAuditRef),
  funnelRefs: v.array(operatorFunnelRef),
  operationRefs: v.array(operatorOperationRef),
  updatedAt: v.number(),
})

const operatorReconstructionSummary = v.object({
  threads: v.number(),
  messages: v.number(),
  notifications: v.number(),
  dispatches: v.number(),
  needsRepair: v.number(),
  terminal: v.number(),
})

const operatorInquiryReconstructionReadbackResult = v.union(
  v.object({
    kind: v.literal('allowed'),
    httpStatus: v.literal(200),
    generatedAt: v.number(),
    actorRef: v.string(),
    filter: operatorReconstructionFilter,
    summary: operatorReconstructionSummary,
    rows: v.array(operatorReconstructionRow),
  }),
  v.object({
    kind: v.literal('denied'),
    httpStatus: v.union(v.literal(401), v.literal(403)),
    reason: v.union(v.literal('missing_membership'), v.literal('inactive_membership'), v.literal('action_not_allowed')),
    generatedAt: v.number(),
    publicMessage: v.string(),
    filter: operatorReconstructionFilter,
    rows: v.array(operatorReconstructionRow),
  })
)

type RuntimeCtx = {
  db: object
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>
  }
}

type RuntimeQueryCtx = {
  db: object
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>
  }
}

export const submitPublicInquiry = mutationGeneric({
  args: {
    target: inquiryTarget,
    body: v.string(),
    contact: publicInquiryContact,
    pseudonymousSessionId: v.string(),
    abuseBucketKey: v.string(),
    ...csrfArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: submitInquiryResult,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(args, 'public_inquiry')
    if (sourceWrite.kind === 'rejected') {
      return inquiryCsrfError(sourceWrite.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadInquirySourceState(db)
    const result = submitInquiryModule(state, {
      target: {
        businessId: brandNonEmpty(args.target.businessId, 'BusinessId'),
        serviceId: brandNonEmpty(args.target.serviceId, 'ServiceId'),
        capabilityKind: args.target.capabilityKind,
      },
      body: args.body,
      contact: args.contact,
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      pseudonymousSessionId: args.pseudonymousSessionId,
      abuseBucketKey: args.abuseBucketKey,
      now: Date.now(),
    })

    if (result.kind === 'error') {
      if (result.state !== undefined) {
        await persistInquirySourceState(db, result.state)
      }
      return summarizeSubmitError(result)
    }

    const bridged = await enqueueInquiryNotificationDispatches(db, result.state, result.notification, result.thread.businessId, args.correlationId)
    await persistInquirySourceState(db, bridged.state)
    return {
      kind: 'ok' as const,
      code: result.code,
      thread: {
        threadId: result.thread.threadId,
        businessId: result.thread.businessId,
        serviceId: result.thread.serviceId,
        status: result.thread.status,
        version: result.thread.version,
      },
      notification: {
        notificationId: bridged.notification.notificationId,
        status: bridged.notification.status,
      },
    }
  },
})

export const listCurrentOwnerInbox = queryGeneric({
  args: {},
  returns: ownerInboxResult,
  handler: async (ctx) => {
    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return owner
    }

    const state = await loadInquirySourceState(runtimeDb(ctx.db))
    return {
      kind: 'allowed' as const,
      inbox: serializeOwnerInbox(listOwnerInboxModule(state, { authority: { ownerId: brandNonEmpty(owner.ownerId, 'OwnerId') } })),
    }
  },
})

export const readOperatorInquiryReconstruction = queryGeneric({
  args: {
    threadId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    dispatchId: v.optional(v.string()),
  },
  returns: operatorInquiryReconstructionReadbackResult,
  handler: async (ctx, args) => {
    const db = runtimeDb(ctx.db)
    const authority = await resolveAdminAuthority({ db, auth: ctx.auth }, 'read_admin_readbacks')
    const filter = compactOperatorFilter(args)
    if (authority.kind === 'denied') {
      return {
        kind: 'denied' as const,
        httpStatus: authority.reason === 'missing_membership' ? 401 as const : 403 as const,
        reason: authority.reason,
        generatedAt: Date.now(),
        publicMessage: 'Admin inquiry reconstruction requires active source-owned membership.',
        filter,
        rows: [],
      }
    }

    const [state, attempts, webhooks, auditRows, funnelRows, operationRows] = await Promise.all([
      loadInquirySourceState(db),
      collect(db, 'notificationDispatchAttempts'),
      collect(db, 'notificationWebhookEvents'),
      collect(db, 'auditEvents'),
      collect(db, 'funnelEvents'),
      collect(db, 'operationKeys'),
    ])
    const readback = readInquiryOperatorReconstructionModule(state, filter)

    return serializeOperatorReconstructionReadback(readback, {
      actorRef: authority.membership.clerkUserId,
      attempts,
      webhooks,
      auditRows,
      funnelRows,
      operationRows,
    })
  },
})

export const readCurrentOwnerInquiry = queryGeneric({
  args: {
    threadId: v.string(),
  },
  returns: ownerInquiryDetailResult,
  handler: async (ctx, args) => {
    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return {
        kind: 'error' as const,
        code: owner.reason,
        retryable: false,
        reason: owner.reason,
      }
    }

    const state = await loadInquirySourceState(runtimeDb(ctx.db))
    const result = readOwnerInquiryModule(state, {
      authority: { ownerId: brandNonEmpty(owner.ownerId, 'OwnerId') },
      threadId: brandNonEmpty(args.threadId, 'InquiryThreadId'),
    })
    if (result.kind === 'error') {
      return result
    }

    return {
      kind: 'ok' as const,
      code: result.code,
      readback: serializeOwnerInquiryDetail(result.readback),
    }
  },
})

export const readCurrentOwnerInquiryDeliveryReadback = queryGeneric({
  args: {
    threadId: v.string(),
  },
  returns: ownerInquiryDeliveryReadbackResult,
  handler: async (ctx, args) => {
    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return ownerAuthError(owner.reason)
    }

    const state = await loadInquirySourceState(runtimeDb(ctx.db))
    const result = readInquiryDeliveryReadbackModule(state, {
      authority: { ownerId: brandNonEmpty(owner.ownerId, 'OwnerId') },
      threadId: brandNonEmpty(args.threadId, 'InquiryThreadId'),
    })
    if (result.kind === 'error') {
      return result
    }

    return {
      kind: 'ok' as const,
      code: result.code,
      readback: serializeInquiryDeliveryReadback(result.readback),
    }
  },
})

export const requestCurrentOwnerInquiryExport = queryGeneric({
  args: {
    threadId: v.string(),
  },
  returns: ownerInquiryExportResult,
  handler: async (ctx, args) => {
    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return ownerAuthError(owner.reason)
    }

    const state = await loadInquirySourceState(runtimeDb(ctx.db))
    const result = requestInquiryExportModule(state, {
      authority: { ownerId: brandNonEmpty(owner.ownerId, 'OwnerId') },
      threadId: brandNonEmpty(args.threadId, 'InquiryThreadId'),
    })
    if (result.kind === 'error') {
      return result
    }

    return {
      kind: 'ok' as const,
      code: result.code,
      exportData: serializeInquiryExport(result.exportData),
    }
  },
})

export const markCurrentOwnerInquiryRead = mutationGeneric({
  args: {
    threadId: v.string(),
    expectedVersion: v.number(),
    ...csrfArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: ownerInquiryMutationResult,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(args, 'owner_inquiry')
    if (sourceWrite.kind === 'rejected') {
      return ownerMutationCsrfError(sourceWrite.reason)
    }

    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return ownerMutationAuthError(owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadInquirySourceState(db)
    const result = markInquiryReadModule(state, {
      authority: { ownerId: brandNonEmpty(owner.ownerId, 'OwnerId') },
      threadId: brandNonEmpty(args.threadId, 'InquiryThreadId'),
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      expectedVersion: args.expectedVersion,
      now: Date.now(),
    })
    if (result.kind === 'error') {
      return ownerMutationError(result)
    }

    await persistInquirySourceState(db, result.state)
    return ownerMutationOk(result)
  },
})

export const deleteCurrentOwnerInquiryPrivateContent = mutationGeneric({
  args: {
    threadId: v.string(),
    reasonCode: v.string(),
    ...csrfArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: deleteInquiryPrivateContentResult,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(args, 'owner_inquiry')
    if (sourceWrite.kind === 'rejected') {
      return inquiryPrivacyCsrfError(sourceWrite.reason)
    }

    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return ownerAuthError(owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadInquirySourceState(db)
    const result = deleteInquiryPrivateContentModule(state, {
      authority: { ownerId: brandNonEmpty(owner.ownerId, 'OwnerId') },
      threadId: brandNonEmpty(args.threadId, 'InquiryThreadId'),
      reasonCode: args.reasonCode,
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      now: Date.now(),
    })
    if (result.kind === 'error') {
      return ownerPrivacyError(result)
    }

    await persistInquirySourceState(db, result.state)
    return {
      kind: 'ok' as const,
      code: result.code,
      tombstone: serializeInquiryPrivacyTombstone(result.tombstone),
    }
  },
})

export const readCurrentOwnerInquiryPrivacyTombstone = queryGeneric({
  args: {
    threadId: v.string(),
  },
  returns: inquiryPrivacyTombstoneReadResult,
  handler: async (ctx, args) => {
    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return ownerAuthError(owner.reason)
    }

    const state = await loadInquirySourceState(runtimeDb(ctx.db))
    const result = readInquiryPrivacyTombstoneModule(state, {
      authority: { ownerId: brandNonEmpty(owner.ownerId, 'OwnerId') },
      threadId: brandNonEmpty(args.threadId, 'InquiryThreadId'),
    })
    if (result.kind === 'error') {
      return result
    }

    return {
      kind: 'ok' as const,
      code: result.code,
      tombstones: result.tombstones.map(serializeInquiryPrivacyTombstone),
    }
  },
})

export const replyToCurrentOwnerInquiry = mutationGeneric({
  args: {
    threadId: v.string(),
    expectedVersion: v.number(),
    body: v.string(),
    ...csrfArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: ownerInquiryMutationResult,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(args, 'owner_inquiry')
    if (sourceWrite.kind === 'rejected') {
      return ownerMutationCsrfError(sourceWrite.reason)
    }

    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return ownerMutationAuthError(owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadInquirySourceState(db)
    const result = replyToInquiryModule(state, {
      authority: { ownerId: brandNonEmpty(owner.ownerId, 'OwnerId') },
      threadId: brandNonEmpty(args.threadId, 'InquiryThreadId'),
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      expectedVersion: args.expectedVersion,
      body: args.body,
      now: Date.now(),
    })
    if (result.kind === 'error') {
      return ownerMutationError(result)
    }

    const bridged = await enqueueInquiryNotificationDispatches(db, result.state, result.notification, result.thread.businessId, args.correlationId)
    await persistInquirySourceState(db, bridged.state)
    return ownerMutationOk(result)
  },
})

export const closeCurrentOwnerInquiry = mutationGeneric({
  args: {
    threadId: v.string(),
    expectedVersion: v.number(),
    ...csrfArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: ownerInquiryMutationResult,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(args, 'owner_inquiry')
    if (sourceWrite.kind === 'rejected') {
      return ownerMutationCsrfError(sourceWrite.reason)
    }

    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return ownerMutationAuthError(owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await loadInquirySourceState(db)
    const result = closeInquiryModule(state, {
      authority: { ownerId: brandNonEmpty(owner.ownerId, 'OwnerId') },
      threadId: brandNonEmpty(args.threadId, 'InquiryThreadId'),
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      expectedVersion: args.expectedVersion,
      now: Date.now(),
    })
    if (result.kind === 'error') {
      return ownerMutationError(result)
    }

    await persistInquirySourceState(db, result.state)
    return ownerMutationOk(result)
  },
})

async function enqueueInquiryNotificationDispatches(
  db: RuntimeDb,
  state: InquirySourceState,
  notification: InquiryNotificationRecord,
  businessId: string,
  correlationId: string
): Promise<{ state: InquirySourceState; notification: InquiryNotificationRecord }> {
  const now = Date.now()
  let outboxState = await loadNotificationDispatchBindingState(db)
  const bindings: InquiryNotificationDispatchBinding[] = []

  for (const providerFamily of notificationProviderFamilies()) {
    const result = enqueueInquiryNotificationModule(outboxState, {
      businessId: brandNonEmpty(businessId, 'BusinessId'),
      inquiryThreadId: notification.threadId,
      inquiryMessageId: notification.messageId,
      recipientRole: notification.recipientRole,
      providerFamily,
      redactedPayload: {
        notificationId: notification.notificationId,
        threadId: notification.threadId,
        messageId: notification.messageId,
        recipientRole: notification.recipientRole,
        notificationPayloadHash: notification.payloadHash,
      },
      providerIdempotencyKey: `ae:${notification.notificationId}:${providerFamily}`,
      operationKey: brandNonEmpty(`notification:enqueue:${notification.notificationId}:${providerFamily}`, 'OperationKey'),
      correlationId: brandNonEmpty(correlationId, 'CorrelationId'),
      now,
    })

    if (result.kind === 'error') {
      continue
    }

    outboxState = result.state
    bindings.push(dispatchBindingFromDispatch(result.dispatch))
  }

  await persistNotificationDispatchBindingState(db, outboxState)
  const bound = bindInquiryNotificationDispatchesModule(state, {
    notificationId: notification.notificationId,
    dispatchBindings: bindings,
    now,
  })

  return bound.kind === 'ok' ? { state: bound.state, notification: bound.notification } : { state, notification }
}

function notificationProviderFamilies(): readonly NotificationProviderFamily[] {
  return ['resend', 'novu']
}

function dispatchBindingFromDispatch(dispatch: NotificationDispatchRecord): InquiryNotificationDispatchBinding {
  return {
    dispatchId: dispatch.dispatchId,
    providerFamily: dispatch.providerFamily,
    status: dispatch.status,
    providerIdempotencyKey: dispatch.providerIdempotencyKey,
    payloadHash: dispatch.payloadHash,
    operatorNextAction: notificationOperatorNextAction(dispatch.status),
    updatedAt: dispatch.updatedAt,
  }
}

function notificationOperatorNextAction(status: InquiryNotificationDispatchStatus): InquiryNotificationDispatchBinding['operatorNextAction'] {
  if (status === 'no_repair' || status === 'delivered' || status === 'sent') {
    return 'terminal'
  }
  if (status === 'failed' || status === 'provider_missing' || status === 'orchestrator_missing') {
    return 'retry_available'
  }
  if (status === 'bounced' || status === 'complained' || status === 'delivery_delayed') {
    return 'operator_review_required'
  }
  return 'none'
}

async function loadNotificationDispatchBindingState(db: RuntimeDb): Promise<NotificationOutboxSourceState> {
  const dispatches = await collect(db, 'notificationDispatches')
  return createEmptyNotificationOutboxSourceState({
    dispatches: dispatches.map(toNotificationDispatchRecord),
  })
}

async function persistNotificationDispatchBindingState(db: RuntimeDb, state: NotificationOutboxSourceState): Promise<void> {
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
    await upsertNotificationDispatchReconstruction(db, dispatch)
  }
}

async function upsertNotificationDispatchReconstruction(db: RuntimeDb, dispatch: NotificationDispatchRecord): Promise<void> {
  await upsertByFields(db, 'operationKeys', ['scope', 'key'], {
    scope: 'notification',
    actorKind: 'system',
    actorRef: 'system:notification-outbox',
    operationName: 'enqueueInquiryNotification',
    key: dispatch.operationKey,
    requestHash: dispatch.payloadHash,
    sourceHash: dispatch.dispatchId,
    status: 'succeeded',
    resultHash: stableHash({ code: 'notification_queued', dispatchId: dispatch.dispatchId }),
    effectRefs: [
      'result:notification_queued',
      `dispatch:${dispatch.dispatchId}`,
      `inquiryThread:${dispatch.inquiryThreadId}`,
      `inquiryMessage:${dispatch.inquiryMessageId}`,
    ],
    createdAt: dispatch.createdAt,
    updatedAt: dispatch.updatedAt,
  })
  await upsertNotificationAuditEvent(db, {
    eventType: 'notification.queued',
    actorKind: 'system',
    actorRef: 'system:notification-outbox',
    targetRef: dispatch.dispatchId,
    businessId: dispatch.businessId,
    operationKey: dispatch.operationKey,
    correlationId: dispatch.correlationId,
    beforeState: 'none',
    afterState: dispatch.status,
    redactedPayload: {
      dispatchId: dispatch.dispatchId,
      providerFamily: dispatch.providerFamily,
      inquiryThreadId: dispatch.inquiryThreadId,
      inquiryMessageId: dispatch.inquiryMessageId,
      payloadHash: dispatch.payloadHash,
    },
    createdAt: dispatch.createdAt,
  })
  await upsertByFields(db, 'funnelEvents', ['eventType', 'businessId', 'correlationId', 'createdAt'], {
    eventType: 'notification_queued',
    source: 'notification-outbox',
    stage: 'published',
    pseudonymousSessionId: `notification:${dispatch.recipientRole}`,
    businessId: dispatch.businessId,
    redactedPayloadJson: JSON.stringify({
      dispatchId: dispatch.dispatchId,
      providerFamily: dispatch.providerFamily,
      status: dispatch.status,
    }),
    consentFlag: true,
    correlationId: dispatch.correlationId,
    createdAt: dispatch.createdAt,
  })
}

async function upsertNotificationAuditEvent(
  db: RuntimeDb,
  input: {
    eventType: string
    actorKind: 'anonymous' | 'owner' | 'admin' | 'system'
    actorRef: string
    targetRef: string
    businessId?: string
    operationKey: string
    correlationId: string
    beforeState: string
    afterState: string
    redactedPayload: RedactedPayload
    createdAt: number
  }
): Promise<void> {
  const payloadHash = stableHash(input.redactedPayload)
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
    targetType: 'notification',
    targetRef: input.targetRef,
    beforeState: input.beforeState,
    afterState: input.afterState,
    idempotencyKey: input.operationKey,
    correlationId: input.correlationId,
    evidenceRefs: [],
    redactedPayloadJson: JSON.stringify(input.redactedPayload),
    payloadHash,
    createdAt: input.createdAt,
  })
}

async function readCurrentOwner(ctx: RuntimeQueryCtx | RuntimeCtx): Promise<
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

async function loadInquirySourceState(db: RuntimeDb): Promise<InquirySourceState> {
  const [
    businesses,
    businessServices,
    serviceCapabilities,
    suppressionRules,
    threads,
    messages,
    notifications,
    privacyTombstones,
    auditEvents,
    abuseBuckets,
    operationKeys,
    supportRecords,
  ] = await Promise.all([
    collect(db, 'businesses'),
    collect(db, 'businessServices'),
    collect(db, 'serviceCapabilities'),
    collect(db, 'suppressionRules'),
    collect(db, 'inquiryThreads'),
    collect(db, 'inquiryMessages'),
    collect(db, 'inquiryNotifications'),
    collect(db, 'inquiryPrivacyTombstones'),
    collect(db, 'auditEvents'),
    collect(db, 'inquiryAbuseBuckets'),
    collect(db, 'operationKeys'),
    collect(db, 'capabilityLaunchSupportRecords'),
  ])

  return createEmptyInquirySourceState({
    businesses: businesses.map(toBusinessRecord),
    businessServices: businessServices.map(toBusinessServiceRecord),
    serviceCapabilities: serviceCapabilities.map(toServiceCapabilityRecord),
    suppressionRules: suppressionRules.map(toSuppressionRuleRecord),
    threads: threads.map(toInquiryThreadRecord),
    messages: messages.map(toInquiryMessageRecord),
    notifications: notifications.map(toInquiryNotificationRecord),
    privacyTombstones: privacyTombstones.map(toInquiryPrivacyTombstoneRecord),
    auditEvents: auditEvents.map(toInquiryAuditRecord).filter(isDefined),
    abuseRateLimitBuckets: abuseBuckets.map(toAbuseRateLimitBucketRecord),
    operations: operationKeys.filter((row) => stringField(row, 'scope') === 'inquiry').map(toInquiryOperationRecord),
    capabilityLaunchSupportRecords: supportRecords.map(toCapabilityLaunchSupportRecord).filter(isDefined),
  })
}

async function persistInquirySourceState(db: RuntimeDb, state: InquirySourceState): Promise<void> {
  for (const bucket of state.abuseRateLimitBuckets.filter((candidate) => candidate.scope === 'inquiry_submit')) {
    await upsertByFields(db, 'inquiryAbuseBuckets', ['key', 'window'], {
      key: bucket.key,
      window: bucket.window,
      count: bucket.count,
      state: bucket.state,
      resetAt: bucket.resetAt,
      updatedAt: bucket.updatedAt,
    })
  }

  for (const thread of state.threads) {
    await upsertByFields(db, 'inquiryThreads', ['threadId'], {
      threadId: thread.threadId,
      businessId: thread.businessId,
      ownerId: thread.ownerId,
      serviceId: thread.serviceId,
      capabilityKind: thread.capabilityKind,
      status: thread.status,
      firstMessageId: thread.firstMessageId,
      sourceHash: thread.sourceHash,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      version: thread.version,
      ...(thread.readAt === undefined ? {} : { readAt: thread.readAt }),
      ...(thread.repliedAt === undefined ? {} : { repliedAt: thread.repliedAt }),
      ...(thread.closedAt === undefined ? {} : { closedAt: thread.closedAt }),
    })
  }

  for (const message of state.messages) {
    await upsertByFields(db, 'inquiryMessages', ['messageId'], {
      messageId: message.messageId,
      threadId: message.threadId,
      sender: message.sender,
      body: message.body,
      bodyHash: message.bodyHash,
      ...(message.contactHash === undefined ? {} : { contactHash: message.contactHash }),
      ...(message.redactedContact === undefined ? {} : { redactedContact: redactedJson(message.redactedContact) }),
      ...(message.privateDeletedAt === undefined ? {} : { privateDeletedAt: message.privateDeletedAt }),
      createdAt: message.createdAt,
    })
  }

  for (const notification of state.notifications) {
    await upsertByFields(db, 'inquiryNotifications', ['notificationId'], {
      notificationId: notification.notificationId,
      threadId: notification.threadId,
      messageId: notification.messageId,
      recipientRole: notification.recipientRole,
      status: notification.status,
      redactedPayload: redactedJson(notification.redactedPayload),
      ...(notification.failureCode === undefined ? {} : { failureCode: notification.failureCode }),
      dispatchBindingsJson: JSON.stringify(notification.dispatchBindings),
      dispatchIds: notification.dispatchBindings.map((binding) => binding.dispatchId),
      providerFamilies: notification.dispatchBindings.map((binding) => binding.providerFamily),
      dispatchStatuses: notification.dispatchBindings.map((binding) => binding.status),
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    })
  }

  for (const tombstone of state.privacyTombstones) {
    await upsertByFields(db, 'inquiryPrivacyTombstones', ['threadId', 'operationKey'], {
      threadId: tombstone.threadId,
      businessId: tombstone.businessId,
      reasonCode: tombstone.reasonCode,
      status: tombstone.status,
      operationKey: tombstone.operationKey,
      correlationId: tombstone.correlationId,
      createdAt: tombstone.createdAt,
      ...(tombstone.appliedAt === undefined ? {} : { appliedAt: tombstone.appliedAt }),
    })
  }

  for (const operation of state.operations) {
    await upsertInquiryOperation(
      db,
      operation,
      state.auditEvents.find((auditEvent) => auditEvent.operationKey === operation.operationKey)
    )
  }

  for (const auditEvent of state.auditEvents) {
    await upsertAuditEvent(db, auditEvent)
  }

  for (const funnelEvent of state.funnelEvents) {
    await upsertFunnelEvent(db, funnelEvent)
  }
}

async function upsertInquiryOperation(
  db: RuntimeDb,
  operation: InquiryOperationRecord,
  auditEvent: InquiryAuditRecord | undefined
): Promise<void> {
  await upsertByFields(db, 'operationKeys', ['scope', 'key'], {
    scope: 'inquiry',
    actorKind: auditEvent?.actorKind ?? 'system',
    actorRef: auditEvent?.actorRef ?? 'system:inquiry',
    operationName: operationNameForResult(operation.resultCode),
    key: operation.operationKey,
    requestHash: operation.requestHash,
    sourceHash: operation.threadId,
    status: 'succeeded',
    resultHash: stableHash({ resultCode: operation.resultCode }),
    effectRefs: [
      `result:${operation.resultCode}`,
      operation.threadId === undefined ? undefined : `thread:${operation.threadId}`,
      operation.messageId === undefined ? undefined : `message:${operation.messageId}`,
      operation.notificationId === undefined ? undefined : `notification:${operation.notificationId}`,
    ].filter(isString),
    createdAt: operation.createdAt,
    updatedAt: operation.createdAt,
  })
}

async function upsertAuditEvent(db: RuntimeDb, auditEvent: InquiryAuditRecord): Promise<void> {
  const eventId = `audit:${stableHash({
    eventType: auditEvent.eventType,
    operationKey: auditEvent.operationKey,
    targetRef: auditEvent.targetRef,
  })}`
  await upsertByFields(db, 'auditEvents', ['eventId'], {
    eventId,
    eventType: auditEvent.eventType,
    actorKind: auditEvent.actorKind,
    actorRef: auditEvent.actorRef,
    businessId: auditEvent.businessId,
    targetType: auditEvent.targetType,
    targetRef: auditEvent.targetRef,
    beforeState: auditEvent.beforeState,
    afterState: auditEvent.afterState,
    idempotencyKey: auditEvent.operationKey,
    correlationId: auditEvent.correlationId,
    evidenceRefs: [],
    redactedPayloadJson: JSON.stringify(auditEvent.redactedPayload),
    payloadHash: auditEvent.payloadHash,
    createdAt: auditEvent.createdAt,
  })
}

async function upsertFunnelEvent(db: RuntimeDb, funnelEvent: InquiryFunnelRecord): Promise<void> {
  await upsertByFields(db, 'funnelEvents', ['eventType', 'businessId', 'correlationId', 'createdAt'], {
    eventType: funnelEvent.eventType,
    source: 'inquiry',
    stage: 'published',
    pseudonymousSessionId: funnelEvent.pseudonymousSessionId,
    businessId: funnelEvent.businessId,
    redactedPayloadJson: JSON.stringify(funnelEvent.redactedPayload),
    consentFlag: true,
    correlationId: funnelEvent.correlationId,
    createdAt: funnelEvent.createdAt,
  })
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

function toBusinessRecord(row: RuntimeDocument): BusinessRecord {
  return {
    businessId: brandNonEmpty(row._id, 'BusinessId'),
    ownerId: brandNonEmpty(stringField(row, 'ownerId'), 'OwnerId'),
    slug: brandNonEmpty(stringField(row, 'slug'), 'Slug'),
    name: stringField(row, 'name'),
    normalizedName: stringField(row, 'normalizedName'),
    category: stringField(row, 'category'),
    suburb: stringField(row, 'suburb'),
    stateTerritory: stringField(row, 'stateTerritory'),
    publicStatus: publicStatus(row),
    trustTier: trustTier(row),
    claimStatus: claimStatus(row),
    sourceHash: brandNonEmpty(stringField(row, 'sourceHash'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

function toBusinessServiceRecord(row: RuntimeDocument): BusinessServiceRecord {
  return {
    serviceId: brandNonEmpty(row._id, 'ServiceId'),
    serviceSlug: brandNonEmpty(stringField(row, 'serviceSlug'), 'Slug'),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    name: stringField(row, 'name'),
    category: stringField(row, 'category'),
    summary: stringField(row, 'summary'),
    serviceArea: stringField(row, 'serviceArea'),
    hoursOrUnknown: stringField(row, 'hoursOrUnknown'),
    status: businessServiceStatus(row),
    sortOrder: numberField(row, 'sortOrder'),
    sourceHash: brandNonEmpty(stringField(row, 'sourceHash'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

function toServiceCapabilityRecord(row: RuntimeDocument): ServiceCapabilityRecord {
  const mode = firstRequestMode(row)
  const noContactReason = optionalStringField(row, 'noContactReason')
  return {
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    serviceId: brandNonEmpty(stringField(row, 'serviceId'), 'ServiceId'),
    kind: capabilityKind(row),
    status: capabilityStatus(row),
    firstRequest:
      mode === 'not_available_yet'
        ? {
            mode,
            publicDisclosure: stringField(row, 'publicDisclosure'),
            publicChannel: publicFirstRequestChannel(row),
            rawContactExcluded: true,
            noContactReason: noContactReason ?? 'Not available yet.',
          }
        : {
            mode,
            publicDisclosure: stringField(row, 'publicDisclosure'),
            publicChannel: publicFirstRequestChannel(row),
            rawContactExcluded: true,
          },
    callable: false as const,
    paymentRequired: false as const,
    ...(optionalStringField(row, 'reason') === undefined ? {} : { reason: stringField(row, 'reason') }),
    sourceHash: brandNonEmpty(stringField(row, 'sourceHash'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

function toSuppressionRuleRecord(row: RuntimeDocument): SuppressionRuleRecord {
  return {
    targetType: suppressionTargetType(row),
    targetRef: stringField(row, 'targetRef'),
    status: suppressionStatus(row),
    reasonCode: stringField(row, 'reasonCode'),
    evidenceRefs: stringArrayField(row, 'evidenceRefs'),
    createdByAdminRef: stringField(row, 'createdByAdminRef'),
    createdAt: numberField(row, 'createdAt'),
    beforePublicStatus: beforePublicStatus(row),
    beforeClaimStatus: beforeClaimStatus(row),
    ...(optionalStringField(row, 'liftedByAdminRef') === undefined ? {} : { liftedByAdminRef: stringField(row, 'liftedByAdminRef') }),
    ...(optionalStringField(row, 'liftedReasonCode') === undefined ? {} : { liftedReasonCode: stringField(row, 'liftedReasonCode') }),
    ...(arrayField(row, 'liftedEvidenceRefs') === undefined ? {} : { liftedEvidenceRefs: stringArrayField(row, 'liftedEvidenceRefs') }),
    ...(optionalNumberField(row, 'liftedAt') === undefined ? {} : { liftedAt: numberField(row, 'liftedAt') }),
  }
}

function toInquiryThreadRecord(row: RuntimeDocument): InquiryThreadRecord {
  return {
    threadId: brandNonEmpty(stringField(row, 'threadId'), 'InquiryThreadId'),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    ownerId: brandNonEmpty(stringField(row, 'ownerId'), 'OwnerId'),
    serviceId: brandNonEmpty(stringField(row, 'serviceId'), 'ServiceId'),
    capabilityKind: capabilityKind(row),
    status: inquiryThreadStatus(row),
    firstMessageId: brandNonEmpty(stringField(row, 'firstMessageId'), 'InquiryMessageId'),
    sourceHash: brandNonEmpty(stringField(row, 'sourceHash'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
    version: numberField(row, 'version'),
    ...(optionalNumberField(row, 'readAt') === undefined ? {} : { readAt: numberField(row, 'readAt') }),
    ...(optionalNumberField(row, 'repliedAt') === undefined ? {} : { repliedAt: numberField(row, 'repliedAt') }),
    ...(optionalNumberField(row, 'closedAt') === undefined ? {} : { closedAt: numberField(row, 'closedAt') }),
  }
}

function toInquiryMessageRecord(row: RuntimeDocument): InquiryMessageRecord {
  const contactHash = optionalStringField(row, 'contactHash')
  const redactedContact = redactedJsonPayload(row, 'redactedContact')
  return {
    messageId: brandNonEmpty(stringField(row, 'messageId'), 'InquiryMessageId'),
    threadId: brandNonEmpty(stringField(row, 'threadId'), 'InquiryThreadId'),
    sender: inquiryMessageSender(row),
    body: stringField(row, 'body'),
    bodyHash: brandNonEmpty(stringField(row, 'bodyHash'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
    ...(contactHash === undefined ? {} : { contactHash: brandNonEmpty(contactHash, 'SourceHash') }),
    ...(redactedContact === undefined ? {} : { redactedContact }),
    ...(optionalNumberField(row, 'privateDeletedAt') === undefined ? {} : { privateDeletedAt: numberField(row, 'privateDeletedAt') }),
  }
}

function toInquiryNotificationRecord(row: RuntimeDocument): InquiryNotificationRecord {
  const payload = redactedJsonPayload(row, 'redactedPayload') ?? null
  const dispatchBindings = inquiryNotificationDispatchBindings(row)
  return {
    notificationId: brandNonEmpty(stringField(row, 'notificationId'), 'InquiryNotificationId'),
    threadId: brandNonEmpty(stringField(row, 'threadId'), 'InquiryThreadId'),
    messageId: brandNonEmpty(stringField(row, 'messageId'), 'InquiryMessageId'),
    recipientRole: recipientRole(row),
    status: inquiryNotificationStatus(row),
    redactedPayload: payload,
    payloadHash: brandNonEmpty(redactedJsonHash(row, 'redactedPayload'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
    ...(optionalStringField(row, 'failureCode') === undefined ? {} : { failureCode: stringField(row, 'failureCode') }),
    dispatchBindings,
  }
}

function inquiryNotificationDispatchBindings(row: RuntimeDocument): InquiryNotificationDispatchBinding[] {
  const value = optionalStringField(row, 'dispatchBindingsJson')
  if (value === undefined) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter(isInquiryNotificationDispatchBinding) : []
  } catch {
    return []
  }
}

function isInquiryNotificationDispatchBinding(value: unknown): value is InquiryNotificationDispatchBinding {
  return (
    isRecord(value) &&
    typeof value.dispatchId === 'string' &&
    (value.providerFamily === 'resend' || value.providerFamily === 'novu') &&
    typeof value.status === 'string' &&
    InquiryNotificationDispatchStatusValues.includes(value.status as InquiryNotificationDispatchStatus) &&
    typeof value.providerIdempotencyKey === 'string' &&
    typeof value.payloadHash === 'string' &&
    typeof value.updatedAt === 'number' &&
    (
      value.operatorNextAction === 'none' ||
      value.operatorNextAction === 'retry_available' ||
      value.operatorNextAction === 'operator_review_required' ||
      value.operatorNextAction === 'terminal'
    )
  )
}

function toNotificationDispatchRecord(row: RuntimeDocument): NotificationDispatchRecord {
  return {
    dispatchId: brandNonEmpty(stringField(row, 'dispatchId'), 'NotificationDispatchId'),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    inquiryThreadId: stringField(row, 'inquiryThreadId'),
    inquiryMessageId: stringField(row, 'inquiryMessageId'),
    recipientRole: recipientRole(row),
    providerFamily: notificationProviderFamily(row),
    status: notificationDispatchStatus(row),
    providerIdempotencyKey: stringField(row, 'providerIdempotencyKey'),
    redactedPayload: parseJson(stringField(row, 'redactedPayloadJson')),
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

function toInquiryPrivacyTombstoneRecord(row: RuntimeDocument): InquiryPrivacyTombstoneRecord {
  return {
    threadId: brandNonEmpty(stringField(row, 'threadId'), 'InquiryThreadId'),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    reasonCode: stringField(row, 'reasonCode'),
    status: inquiryPrivacyTombstoneStatus(row),
    operationKey: brandNonEmpty(stringField(row, 'operationKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    createdAt: numberField(row, 'createdAt'),
    ...(optionalNumberField(row, 'appliedAt') === undefined ? {} : { appliedAt: numberField(row, 'appliedAt') }),
  }
}

function toInquiryAuditRecord(row: RuntimeDocument): InquiryAuditRecord | undefined {
  if (!stringField(row, 'eventType').startsWith('inquiry.') || optionalStringField(row, 'businessId') === undefined) {
    return undefined
  }

  return {
    eventType: inquiryAuditEventType(row),
    actorKind: auditActorKind(row),
    actorRef: stringField(row, 'actorRef'),
    targetType: 'inquiry',
    targetRef: stringField(row, 'targetRef'),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    operationKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    ...(optionalStringField(row, 'beforeState') === undefined ? {} : { beforeState: stringField(row, 'beforeState') }),
    ...(optionalStringField(row, 'afterState') === undefined ? {} : { afterState: stringField(row, 'afterState') }),
    redactedPayload: parseJson(stringField(row, 'redactedPayloadJson')),
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
  }
}

function toAbuseRateLimitBucketRecord(row: RuntimeDocument): AbuseRateLimitBucketRecord {
  return {
    scope: 'inquiry_submit',
    key: stringField(row, 'key'),
    window: stringField(row, 'window'),
    count: numberField(row, 'count'),
    state: abuseBucketState(row),
    resetAt: numberField(row, 'resetAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

function toInquiryOperationRecord(row: RuntimeDocument): InquiryOperationRecord {
  const effectRefs = stringArrayField(row, 'effectRefs')
  return {
    operationKey: brandNonEmpty(stringField(row, 'key'), 'OperationKey'),
    requestHash: brandNonEmpty(stringField(row, 'requestHash'), 'SourceHash'),
    resultCode: effectValue(effectRefs, 'result') ?? 'inquiry_submitted',
    ...(effectValue(effectRefs, 'thread') === undefined ? {} : { threadId: brandNonEmpty(effectValue(effectRefs, 'thread') ?? '', 'InquiryThreadId') }),
    ...(effectValue(effectRefs, 'message') === undefined ? {} : { messageId: brandNonEmpty(effectValue(effectRefs, 'message') ?? '', 'InquiryMessageId') }),
    ...(effectValue(effectRefs, 'notification') === undefined ? {} : { notificationId: brandNonEmpty(effectValue(effectRefs, 'notification') ?? '', 'InquiryNotificationId') }),
    createdAt: numberField(row, 'createdAt'),
  }
}

function toCapabilityLaunchSupportRecord(row: RuntimeDocument): CapabilityLaunchSupportRecord | undefined {
  if (stringField(row, 'capability') !== 'human_inquiry_owner_inbox') {
    return undefined
  }
  const sourceHash = optionalStringField(row, 'sourceHash')
  const correlationId = optionalStringField(row, 'correlationId')
  if (sourceHash === undefined || correlationId === undefined) {
    return undefined
  }

  return {
    capability: 'human_inquiry_owner_inbox',
    primaryOwnerRef: optionalStringField(row, 'primaryOwnerRef') ?? '',
    primaryAdminOperatorRef: optionalStringField(row, 'primaryAdminOperatorRef') ?? '',
    backupOwnerRef: optionalStringField(row, 'backupOwnerRef') ?? '',
    backupAdminOperatorRef: optionalStringField(row, 'backupAdminOperatorRef') ?? '',
    supportedStage: inquirySupportStage(row),
    supportedChannels: stringArrayField(row, 'supportedChannels').filter(isInquirySupportChannel),
    capacityThreshold: supportCapacityThreshold(row),
    backlogAgeThresholdMs: numberField(row, 'backlogAgeThresholdMs'),
    phaseIncidentCounts: supportIncidentCounts(row),
    supportEscalationPath: optionalStringField(row, 'supportEscalationPath') ?? '',
    claimDisablePath: optionalStringField(row, 'claimDisablePath') ?? '',
    perChannelKillRules: supportKillRules(row),
    evidenceRefs: stringArrayField(row, 'evidenceRefs'),
    sourceHash: brandNonEmpty(sourceHash, 'SourceHash'),
    correlationId: brandNonEmpty(correlationId, 'CorrelationId'),
    lastReviewedAt: numberField(row, 'lastReviewedAt'),
  }
}

function inquirySupportStage(row: RuntimeDocument): CapabilityLaunchSupportRecord['supportedStage'] {
  const value = stringField(row, 'supportedStage')
  return value === 'internal_alpha' || value === 'public_alpha' ? value : 'manual_support'
}

function isInquirySupportChannel(value: string): value is CapabilityLaunchSupportRecord['supportedChannels'][number] {
  return (
    value === 'public_inquiry' ||
    value === 'owner_inbox' ||
    value === 'email_notification' ||
    value === 'provider_readback' ||
    value === 'operator_readback'
  )
}

function supportCapacityThreshold(row: RuntimeDocument): CapabilityLaunchSupportRecord['capacityThreshold'] {
  const value = parseRecordJson(optionalStringField(row, 'capacityThresholdJson'))
  return {
    maxOpenThreads: numberFromRecord(value, 'maxOpenThreads'),
    maxFailedNotifications: numberFromRecord(value, 'maxFailedNotifications'),
  }
}

function supportIncidentCounts(row: RuntimeDocument): CapabilityLaunchSupportRecord['phaseIncidentCounts'] {
  const value = parseRecordJson(optionalStringField(row, 'phaseIncidentCountsJson'))
  return {
    retryExhausted: numberFromRecord(value, 'retryExhausted'),
    noRepair: numberFromRecord(value, 'noRepair'),
    unresolvedDeliveryFailures: numberFromRecord(value, 'unresolvedDeliveryFailures'),
    abuseBlocked: numberFromRecord(value, 'abuseBlocked'),
    privacyDeletes: numberFromRecord(value, 'privacyDeletes'),
  }
}

function supportKillRules(row: RuntimeDocument): CapabilityLaunchSupportRecord['perChannelKillRules'] {
  const value = optionalStringField(row, 'perChannelKillRulesJson')
  if (value === undefined) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(isSupportKillRule)
  } catch {
    return []
  }
}

function isSupportKillRule(value: unknown): value is CapabilityLaunchSupportRecord['perChannelKillRules'][number] {
  return (
    isRecord(value) &&
    typeof value.channel === 'string' &&
    (isInquirySupportChannel(value.channel) || value.channel === 'public_claim') &&
    typeof value.trigger === 'string' &&
    typeof value.action === 'string'
  )
}

function parseRecordJson(value: string | undefined): Record<string, unknown> {
  if (value === undefined) {
    return {}
  }
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function numberFromRecord(record: Record<string, unknown>, field: string): number {
  const value = record[field]
  return typeof value === 'number' ? value : 0
}

function summarizeSubmitError(result: Extract<ReturnType<typeof submitInquiryModule>, { kind: 'error' }>) {
  return {
    kind: 'error' as const,
    code: result.code,
    retryable: result.retryable,
    reason: result.reason,
    ...(result.field === undefined ? {} : { field: result.field }),
    ...(result.retryAfter === undefined ? {} : { retryAfter: result.retryAfter }),
  }
}

type OwnerMutationOkResult =
  | Extract<ReturnType<typeof markInquiryReadModule>, { kind: 'ok' }>
  | Extract<ReturnType<typeof replyToInquiryModule>, { kind: 'ok' }>
  | Extract<ReturnType<typeof closeInquiryModule>, { kind: 'ok' }>

type OwnerMutationErrorResult =
  | Extract<ReturnType<typeof markInquiryReadModule>, { kind: 'error' }>
  | Extract<ReturnType<typeof replyToInquiryModule>, { kind: 'error' }>
  | Extract<ReturnType<typeof closeInquiryModule>, { kind: 'error' }>

type OwnerPrivacyErrorResult = Extract<ReturnType<typeof deleteInquiryPrivateContentModule>, { kind: 'error' }>

function ownerMutationOk(result: OwnerMutationOkResult) {
  return {
    kind: 'ok' as const,
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

function ownerMutationError(result: OwnerMutationErrorResult) {
  return {
    kind: 'error' as const,
    code: result.code,
    retryable: result.retryable,
    reason: result.reason,
  }
}

function ownerPrivacyError(result: OwnerPrivacyErrorResult) {
  return {
    kind: 'error' as const,
    code: result.code,
    retryable: result.retryable,
    reason: result.reason,
  }
}

function ownerAuthError(code: 'missing_auth' | 'owner_not_found') {
  return {
    kind: 'error' as const,
    code,
    retryable: false,
    reason: code,
  }
}

function ownerMutationAuthError(code: 'missing_auth' | 'owner_not_found') {
  return ownerAuthError(code)
}

function inquiryCsrfError(reason: 'missing_csrf' | 'foreign_origin') {
  return {
    kind: 'error' as const,
    code: 'inquiry_csrf_rejected' as const,
    retryable: false,
    reason,
  }
}

function ownerMutationCsrfError(reason: 'missing_csrf' | 'foreign_origin') {
  return inquiryCsrfError(reason)
}

function inquiryPrivacyCsrfError(reason: 'missing_csrf' | 'foreign_origin') {
  return {
    kind: 'error' as const,
    code: 'inquiry_csrf_rejected' as const,
    retryable: false,
    reason,
  }
}

function operationNameForResult(resultCode: string): string {
  if (resultCode === 'inquiry_read_marked') {
    return 'markInquiryRead'
  }
  if (resultCode === 'inquiry_replied') {
    return 'replyToInquiry'
  }
  if (resultCode === 'inquiry_closed') {
    return 'closeInquiry'
  }
  if (resultCode === 'inquiry_private_content_deleted') {
    return 'deleteInquiryPrivateContent'
  }
  return 'submitInquiry'
}

function redactedJson(payload: RedactedPayload) {
  return {
    json: JSON.stringify(payload),
    payloadHash: stableHash(payload),
  }
}

function redactedJsonPayload(row: RuntimeDocument, field: string): RedactedPayload | undefined {
  const value = row[field]
  if (!isRecord(value)) {
    return undefined
  }
  const json = value.json
  if (typeof json !== 'string') {
    return undefined
  }
  return parseJson(json)
}

function redactedJsonHash(row: RuntimeDocument, field: string): string {
  const value = row[field]
  if (!isRecord(value) || typeof value.payloadHash !== 'string') {
    return stableHash(null)
  }
  return value.payloadHash
}

function parseJson(value: string): RedactedPayload {
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
  if (!isRecord(value)) {
    return false
  }
  return Object.values(value).every(isRedactedPayload)
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

function arrayField(row: RuntimeDocument, field: string): unknown[] | undefined {
  const value = row[field]
  return Array.isArray(value) ? value : undefined
}

function stringArrayField(row: RuntimeDocument, field: string): string[] {
  return (arrayField(row, field) ?? []).filter(isString)
}

function effectValue(effectRefs: readonly string[], kind: string): string | undefined {
  const prefix = `${kind}:`
  return effectRefs.find((ref) => ref.startsWith(prefix))?.slice(prefix.length)
}

function serializeOwnerInbox(inbox: OwnerInboxReadback) {
  return {
    ownerId: inbox.ownerId,
    empty: inbox.empty,
    buckets: { ...inbox.buckets },
    delivery: { ...inbox.delivery },
    inquiries: inbox.inquiries.map((inquiry) => ({ ...inquiry })),
  }
}

function serializeOwnerInquiryDetail(readback: OwnerInquiryDetailReadback): {
  inquiry: ReturnType<typeof serializeOwnerInbox>['inquiries'][number]
  messages: {
    messageId: string
    sender: 'customer' | 'owner'
    body: string
    createdAt: number
  }[]
  notifications: ReturnType<typeof serializeOwnerNotificationProjection>[]
} {
  return {
    inquiry: { ...readback.inquiry },
    messages: readback.messages.map((message) => ({ ...message })),
    notifications: readback.notifications.map(serializeOwnerNotificationProjection),
  }
}

function serializeInquiryDeliveryReadback(readback: InquiryDeliveryReadback) {
  return {
    threadId: readback.threadId,
    notifications: readback.notifications.map(serializeOwnerNotificationProjection),
  }
}

function serializeInquiryExport(readback: InquiryExportReadback) {
  return {
    thread: { ...readback.thread },
    messages: readback.messages.map((message) => ({ ...message })),
    notifications: readback.notifications.map(serializeOwnerNotificationProjection),
    auditRefs: readback.auditRefs.map((auditRef) => ({ ...auditRef })),
    tombstones: readback.tombstones.map(serializeInquiryPrivacyTombstone),
  }
}

function serializeOwnerNotificationProjection(notification: InquiryDeliveryReadback['notifications'][number]) {
  return {
    notificationId: notification.notificationId,
    messageId: notification.messageId,
    recipientRole: notification.recipientRole,
    status: notification.status,
    label: notification.label,
    updatedAt: notification.updatedAt,
    ...(notification.failureCode === undefined ? {} : { failureCode: notification.failureCode }),
    dispatchIds: notification.dispatchIds.map((dispatchId) => dispatchId),
    providerFamilies: notification.providerFamilies.map((providerFamily) => providerFamily),
    dispatchStatuses: notification.dispatchStatuses.map((status) => status),
    dispatchBindings: notification.dispatchBindings.map((binding) => ({ ...binding })),
  }
}

function serializeInquiryPrivacyTombstone(tombstone: InquiryPrivacyTombstoneRecord) {
  return {
    threadId: tombstone.threadId,
    businessId: tombstone.businessId,
    reasonCode: tombstone.reasonCode,
    status: tombstone.status,
    operationKey: tombstone.operationKey,
    correlationId: tombstone.correlationId,
    createdAt: tombstone.createdAt,
    ...(tombstone.appliedAt === undefined ? {} : { appliedAt: tombstone.appliedAt }),
  }
}

function serializeOperatorReconstructionReadback(
  readback: InquiryOperatorReconstructionAllowedReadback,
  refs: {
    actorRef: string
    attempts: readonly RuntimeDocument[]
    webhooks: readonly RuntimeDocument[]
    auditRows: readonly RuntimeDocument[]
    funnelRows: readonly RuntimeDocument[]
    operationRows: readonly RuntimeDocument[]
  }
) {
  const rows = readback.rows.map((row) => serializeOperatorRow(row, refs))
  return {
    ...readback,
    actorRef: refs.actorRef,
    rows,
    summary: {
      threads: rows.length,
      messages: rows.reduce((count, row) => count + row.messageRefs.length, 0),
      notifications: rows.reduce((count, row) => count + row.notificationRefs.length, 0),
      dispatches: rows.reduce((count, row) => count + row.dispatchRefs.length, 0),
      needsRepair: rows.filter((row) => row.operatorNextAction === 'retry_available' || row.operatorNextAction === 'operator_review_required').length,
      terminal: rows.filter((row) => row.operatorNextAction === 'terminal').length,
    },
  }
}

function serializeOperatorRow(
  row: InquiryOperatorReconstructionRow,
  refs: {
    attempts: readonly RuntimeDocument[]
    webhooks: readonly RuntimeDocument[]
    auditRows: readonly RuntimeDocument[]
    funnelRows: readonly RuntimeDocument[]
    operationRows: readonly RuntimeDocument[]
  }
) {
  const dispatchIds = new Set(row.dispatchRefs.map((dispatch) => String(dispatch.dispatchId)))
  const webhookRefs = refs.webhooks.filter((webhook) => {
    const dispatchId = optionalStringField(webhook, 'dispatchId')
    return dispatchId !== undefined && dispatchIds.has(dispatchId)
  })
  const webhookIds = new Set(webhookRefs.map((webhook) => stringField(webhook, 'webhookEventId')))
  const notificationCorrelationIds = new Set([
    ...row.correlationIds.map((correlationId) => String(correlationId)),
    ...webhookRefs.map((webhook) => stringField(webhook, 'correlationId')),
  ].filter(Boolean))
  const notificationAuditRefs = refs.auditRows
    .filter((audit) => stringField(audit, 'eventType').startsWith('notification.'))
    .filter((audit) => dispatchIds.has(stringField(audit, 'targetRef')) || webhookIds.has(stringField(audit, 'targetRef')))
    .map(operatorAuditRefFromRow)
  const notificationFunnelRefs = refs.funnelRows
    .filter((funnel) => stringField(funnel, 'eventType').startsWith('notification_'))
    .filter((funnel) => notificationCorrelationIds.has(stringField(funnel, 'correlationId')))
    .map(operatorFunnelRefFromRow)
  const notificationOperationRefs = refs.operationRows
    .filter((operation) => stringField(operation, 'scope') === 'notification')
    .filter((operation) => {
      const effects = stringArrayField(operation, 'effectRefs')
      return effects.some((effect) => dispatchIds.has(effectValueFromRef(effect, 'dispatch') ?? '') || webhookIds.has(effectValueFromRef(effect, 'webhook') ?? ''))
    })
    .map(operatorOperationRefFromRow)

  return {
    rowId: row.rowId,
    threadId: row.threadId,
    businessId: row.businessId,
    serviceId: row.serviceId,
    status: row.status,
    sourceHash: row.sourceHash,
    correlationIds: row.correlationIds.map((correlationId) => String(correlationId)),
    operatorNextAction: row.operatorNextAction,
    messageRefs: row.messageRefs.map((message) => ({ ...message })),
    notificationRefs: row.notificationRefs.map((notification) => ({
      ...notification,
      dispatchIds: notification.dispatchIds.map((dispatchId) => dispatchId),
    })),
    dispatchRefs: row.dispatchRefs.map((dispatch) => ({
      ...dispatch,
      attemptRefs: refs.attempts
        .filter((attempt) => stringField(attempt, 'dispatchId') === dispatch.dispatchId)
        .map(operatorAttemptRefFromRow),
      webhookRefs: webhookRefs
        .filter((webhook) => optionalStringField(webhook, 'dispatchId') === dispatch.dispatchId)
        .map(operatorWebhookRefFromRow),
    })),
    auditRefs: uniqueOperatorRefs([...row.auditRefs, ...notificationAuditRefs], (ref) => `${ref.eventType}:${ref.targetRef}:${ref.operationKey}`),
    funnelRefs: uniqueOperatorRefs([...row.funnelRefs, ...notificationFunnelRefs], (ref) => `${ref.eventType}:${ref.correlationId}:${ref.createdAt}`),
    operationRefs: uniqueOperatorRefs([...row.operationRefs, ...notificationOperationRefs], (ref) => `${ref.operationKey}:${ref.resultCode}`),
    updatedAt: row.updatedAt,
  }
}

function operatorAttemptRefFromRow(row: RuntimeDocument): InquiryOperatorDispatchAttemptRef {
  return {
    attemptId: stringField(row, 'attemptId'),
    providerFamily: notificationProviderFamily(row),
    status: notificationAttemptStatus(row),
    requestPayloadHash: stringField(row, 'requestPayloadHash'),
    ...(optionalStringField(row, 'providerResponseHash') === undefined ? {} : { providerResponseHash: stringField(row, 'providerResponseHash') }),
    ...(optionalNumberField(row, 'retryAfter') === undefined ? {} : { retryAfter: numberField(row, 'retryAfter') }),
    startedAt: numberField(row, 'startedAt'),
    ...(optionalNumberField(row, 'completedAt') === undefined ? {} : { completedAt: numberField(row, 'completedAt') }),
  }
}

function operatorWebhookRefFromRow(row: RuntimeDocument): InquiryOperatorWebhookRef {
  return {
    webhookEventId: stringField(row, 'webhookEventId'),
    providerFamily: notificationProviderFamily(row),
    providerEventId: stringField(row, 'providerEventId'),
    logicalObjectKey: stringField(row, 'logicalObjectKey'),
    status: notificationWebhookEventStatus(row),
    eventType: stringField(row, 'eventType'),
    signatureStatus: notificationSignatureStatus(row),
    payloadHash: stringField(row, 'payloadHash'),
    ...(optionalStringField(row, 'reason') === undefined ? {} : { reason: stringField(row, 'reason') }),
    operationKey: stringField(row, 'operationKey'),
    correlationId: stringField(row, 'correlationId'),
    receivedAt: numberField(row, 'receivedAt'),
  }
}

function operatorAuditRefFromRow(row: RuntimeDocument) {
  return {
    eventType: stringField(row, 'eventType'),
    targetRef: stringField(row, 'targetRef'),
    payloadHash: stringField(row, 'payloadHash'),
    operationKey: stringField(row, 'idempotencyKey'),
    correlationId: stringField(row, 'correlationId'),
    createdAt: numberField(row, 'createdAt'),
  }
}

function operatorFunnelRefFromRow(row: RuntimeDocument) {
  return {
    eventType: stringField(row, 'eventType'),
    businessId: stringField(row, 'businessId'),
    payloadHash: redactedJsonHash(row, 'redactedPayloadJson'),
    correlationId: stringField(row, 'correlationId'),
    createdAt: numberField(row, 'createdAt'),
  }
}

function operatorOperationRefFromRow(row: RuntimeDocument): InquiryOperatorOperationRef {
  const effectRefs = stringArrayField(row, 'effectRefs')
  const resultCode = effectValue(effectRefs, 'result')
  const dispatchId = effectValue(effectRefs, 'dispatch')
  const webhookEventId = effectValue(effectRefs, 'webhook')
  return {
    operationKey: stringField(row, 'key'),
    requestHash: stringField(row, 'requestHash'),
    resultCode: resultCode ?? stringField(row, 'operationName'),
    createdAt: numberField(row, 'createdAt'),
    ...(dispatchId === undefined ? {} : { dispatchId }),
    ...(webhookEventId === undefined ? {} : { webhookEventId }),
  }
}

function compactOperatorFilter(input: {
  threadId?: string
  correlationId?: string
  dispatchId?: string
}): InquiryOperatorReconstructionFilter {
  return {
    ...(input.threadId === undefined || input.threadId.trim().length === 0 ? {} : { threadId: input.threadId.trim() }),
    ...(input.correlationId === undefined || input.correlationId.trim().length === 0 ? {} : { correlationId: input.correlationId.trim() }),
    ...(input.dispatchId === undefined || input.dispatchId.trim().length === 0 ? {} : { dispatchId: input.dispatchId.trim() }),
  }
}

function effectValueFromRef(ref: string, kind: string): string | undefined {
  const prefix = `${kind}:`
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : undefined
}

function uniqueOperatorRefs<T>(refs: readonly T[], key: (ref: T) => string): T[] {
  const seen = new Set<string>()
  return refs.filter((ref) => {
    const refKey = key(ref)
    if (seen.has(refKey)) {
      return false
    }
    seen.add(refKey)
    return true
  })
}

function publicStatus(row: RuntimeDocument): BusinessRecord['publicStatus'] {
  const value = stringField(row, 'publicStatus')
  return value === 'published' || value === 'suppressed' ? value : 'unpublished'
}

function trustTier(row: RuntimeDocument): BusinessRecord['trustTier'] {
  const value = stringField(row, 'trustTier')
  return value === 'contact_confirmed' || value === 'listed' || value === 'registry_verified' ? value : 'claimed'
}

function claimStatus(row: RuntimeDocument): BusinessRecord['claimStatus'] {
  const value = stringField(row, 'claimStatus')
  return value === 'published' || value === 'contested' || value === 'disputed' || value === 'suppressed' || value === 'draft'
    ? value
    : 'authenticated'
}

function businessServiceStatus(row: RuntimeDocument): BusinessServiceRecord['status'] {
  const value = stringField(row, 'status')
  return value === 'published' || value === 'suppressed' ? value : 'draft'
}

function capabilityKind(row: RuntimeDocument): CapabilityKind {
  const value = stringField(row, 'kind')
  return CapabilityKindValues.find((candidate) => candidate === value) ?? 'phone_inquiry'
}

function capabilityStatus(row: RuntimeDocument): ServiceCapabilityRecord['status'] {
  const value = stringField(row, 'status')
  return value === 'available' || value === 'degraded' || value === 'stale' ? value : 'unavailable'
}

function firstRequestMode(row: RuntimeDocument): ServiceCapabilityRecord['firstRequest']['mode'] {
  const value = stringField(row, 'firstRequestMode')
  return value === 'inquiry_available' || value === 'quote_request_available' ? value : 'not_available_yet'
}

function publicFirstRequestChannel(row: RuntimeDocument): ServiceCapabilityRecord['firstRequest']['publicChannel'] {
  const value = stringField(row, 'publicChannel')
  return value === 'public_business_contact' || value === 'ae_status_only' ? value : 'not_available'
}

function suppressionTargetType(row: RuntimeDocument) {
  const value = stringField(row, 'targetType')
  return value === 'service' || value === 'capability' ? value : 'business'
}

function suppressionStatus(row: RuntimeDocument) {
  const value = stringField(row, 'status')
  return value === 'lifted' ? value : 'active'
}

function beforePublicStatus(row: RuntimeDocument) {
  const value = stringField(row, 'beforePublicStatus')
  return value === 'published' || value === 'suppressed' ? value : 'unpublished'
}

function beforeClaimStatus(row: RuntimeDocument) {
  const value = stringField(row, 'beforeClaimStatus')
  return value === 'published' || value === 'contested' || value === 'disputed' || value === 'suppressed' || value === 'draft'
    ? value
    : 'authenticated'
}

function inquiryThreadStatus(row: RuntimeDocument) {
  const value = stringField(row, 'status')
  return value === 'read' || value === 'replied' || value === 'closed' ? value : 'unread'
}

function inquiryMessageSender(row: RuntimeDocument) {
  return stringField(row, 'sender') === 'owner' ? 'owner' : 'customer'
}

function recipientRole(row: RuntimeDocument) {
  return stringField(row, 'recipientRole') === 'customer' ? 'customer' : 'owner'
}

function inquiryNotificationStatus(row: RuntimeDocument) {
  const value = stringField(row, 'status')
  return value === 'sent' || value === 'failed' || value === 'held' ? value : 'queued'
}

function notificationProviderFamily(row: RuntimeDocument): NotificationProviderFamily {
  return stringField(row, 'providerFamily') === 'novu' ? 'novu' : 'resend'
}

function notificationDispatchStatus(row: RuntimeDocument): InquiryNotificationDispatchStatus {
  const value = stringField(row, 'status')
  return NotificationDispatchStatusValues.find((candidate) => candidate === value) ?? 'queued'
}

function notificationAttemptStatus(row: RuntimeDocument): NotificationAttemptStatus {
  const value = stringField(row, 'status')
  return NotificationAttemptStatusValues.find((candidate) => candidate === value) ?? 'pending'
}

function notificationWebhookEventStatus(row: RuntimeDocument): NotificationWebhookEventStatus {
  const value = stringField(row, 'status')
  return NotificationWebhookEventStatusValues.find((candidate) => candidate === value) ?? 'held_for_operator'
}

function notificationSignatureStatus(row: RuntimeDocument): NotificationSignatureStatus {
  return stringField(row, 'signatureStatus') === 'verified' ? 'verified' : 'rejected'
}

function inquiryAuditEventType(row: RuntimeDocument): InquiryAuditRecord['eventType'] {
  const value = stringField(row, 'eventType')
  switch (value) {
    case 'inquiry.rejected':
    case 'inquiry.rate_limited':
    case 'inquiry.viewed':
    case 'inquiry.read_marked':
    case 'inquiry.replied':
    case 'inquiry.closed':
    case 'inquiry.private_content_deleted':
      return value
    default:
      return 'inquiry.submitted'
  }
}

function auditActorKind(row: RuntimeDocument): InquiryAuditRecord['actorKind'] {
  const value = stringField(row, 'actorKind')
  return value === 'owner' || value === 'system' ? value : 'anonymous'
}

function inquiryPrivacyTombstoneStatus(row: RuntimeDocument) {
  const value = stringField(row, 'status')
  return value === 'requested' || value === 'held' ? value : 'applied'
}

function abuseBucketState(row: RuntimeDocument) {
  return stringField(row, 'state') === 'limited' ? 'limited' : 'open'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
