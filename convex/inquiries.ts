import type { UserIdentity } from 'convex/server'
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import { runtimeDb } from './source_state'
import { inquirySourceStatePorts } from './inquirySourceStatePorts'
import { inquiryNotificationPorts } from './inquiryNotificationPorts'
import { serializeOperatorReconstructionReadback } from './inquirySerializeOperator'
import {
  collect,
  stringField,
} from './inquiryRuntimeDbHelpers'
import { csrfArgs } from './notificationOutbox'
import { resolveAdminAuthority, resolveBusinessActor } from './authz'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { literalUnion } from '../src/modules/common/convex-literals'
import { brandNonEmpty } from '../src/modules/common/ids'
import { CapabilityKindValues } from '../src/modules/catalog/public'
import {
  accessIdFromInquiryCustomerAccessKey,
  closeInquiry as closeInquiryModule,
  deleteInquiryPrivateContent as deleteInquiryPrivateContentModule,
  evaluateR1TargetAdmission,
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
  readCustomerRecord as readCustomerRecordModule,
  resolveGovernedSendIntegrityKeyring,
  resolveInquiryCustomerAccessKeyring,
  OwnerInboxBucketValues,
  readOwnerInquiry as readOwnerInquiryModule,
  replyToInquiry as replyToInquiryModule,
  requestInquiryExport as requestInquiryExportModule,
  submitInquiry as submitInquiryModule,
  verifyInquiryCustomerAccess,
} from '../src/modules/inquiries/public'
import type {
  InquiryOperatorReconstructionFilter,
} from '../src/modules/inquiries/public'
import {
  serializeCustomerRecord,
  serializeInquiryDeliveryReadback,
  serializeInquiryExport,
  serializeInquiryPrivacyTombstone,
  serializeOwnerInbox,
  serializeOwnerInquiryDetail,
} from '../src/modules/inquiries/public'
import {
  NotificationAttemptStatusValues,
  NotificationProviderFamilyValues,
  NotificationSignatureStatusValues,
  NotificationWebhookEventStatusValues,
} from '../src/modules/notification-outbox/public'

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

const inquiryOrigin = v.object({
  kind: v.literal('answer_thread'),
  threadId: v.string(),
})


const admissionBlocker = v.union(
  v.object({ kind: v.literal('not_published'), ownerLabel: v.literal('Publish this business page') }),
  v.object({ kind: v.literal('not_claimed'), ownerLabel: v.literal('Complete the business claim') }),
  v.object({ kind: v.literal('destination_unverified'), ownerLabel: v.literal('Verify the inquiry destination') }),
  v.object({ kind: v.literal('recipient_unresolvable'), ownerLabel: v.literal('Add a usable owner notification email') }),
  v.object({ kind: v.literal('suppressed'), ownerLabel: v.literal('Turn inquiry receiving back on') }),
  v.object({ kind: v.literal('not_ready'), ownerLabel: v.literal('Finish inquiry setup') }),
)

const r1TargetAdmission = v.union(
  v.object({
    version: v.literal('r1-target-admitted:v1'),
    admitted: v.literal(true),
    proof: v.object({
      kind: v.literal('claimed_owner'),
      claimRef: v.string(),
      recipientRef: v.string(),
      destinationVerifiedAt: v.optional(v.number()),
    }),
  }),
  v.object({
    version: v.literal('r1-target-admitted:v1'),
    admitted: v.literal(false),
    blockers: v.array(admissionBlocker),
  }),
)

const ownerTargetAdmissionResult = v.union(
  v.object({ kind: v.literal('ok'), admission: r1TargetAdmission }),
  v.object({
    kind: v.literal('error'),
    code: v.union(
      v.literal('owner_not_found'),
      v.literal('inquiry_target_not_found'),
      v.literal('inquiry_target_wrong_owner'),
    ),
    retryable: v.boolean(),
    reason: v.string(),
  }),
)

const submitInquiryErrorCode = v.union(
  v.literal('inquiry_target_not_admitted'),
  v.literal('inquiry_target_admission_conflict'),
  v.literal('inquiry_invalid_input'),
  v.literal('inquiry_digest_mismatch'),
  v.literal('inquiry_duplicate_conflict'),
  v.literal('inquiry_rate_limited'),
  v.literal('inquiry_unsafe_action_intent'),
  v.literal('inquiry_unsafe_future_surface_field'),
  v.literal('inquiry_integrity_conflict'),
  v.literal('inquiry_csrf_rejected'),
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
      customerAccessKey: v.string(),
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
    blockers: v.optional(v.array(admissionBlocker)),
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
  origin: v.optional(v.object({
    kind: v.literal('answer_thread'),
    label: v.string(),
    href: v.string(),
  })),
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

const customerRecordTimelineStep = v.object({
  key: v.union(
    v.literal('received'),
    v.literal('sent_to_business'),
    v.literal('business_replied'),
    v.literal('closed')
  ),
  label: v.string(),
  detail: v.string(),
  status: v.union(v.literal('complete'), v.literal('current'), v.literal('pending')),
  timestamp: v.optional(v.number()),
})

const customerRecordReadback = v.object({
  schemaVersion: v.literal('inquiry-customer-record:v1'),
  threadId: v.string(),
  business: v.object({
    name: v.string(),
    slug: v.string(),
  }),
  submitted: v.object({
    messageSummary: v.string(),
    submittedAt: v.number(),
  }),
  governedSend: v.optional(v.union(
    v.object({
      posture: v.literal('verified'),
      digest: v.string(),
      fields: v.array(v.object({
        key: v.union(
          v.literal('businessId'),
          v.literal('serviceId'),
          v.literal('capabilityKind'),
          v.literal('body'),
          v.literal('contactName'),
          v.literal('contactEmail'),
          v.literal('contactPhone'),
          v.literal('originThreadId'),
        ),
        label: v.string(),
        value: v.union(v.string(), v.null()),
      })),
    }),
    v.object({
      posture: v.literal('erased'),
      digest: v.string(),
      erasedAt: v.number(),
      erasureEventId: v.string(),
    }),
  )),
  delivery: v.object({
    state: literalUnion(InquiryNotificationStatusValues),
    label: v.string(),
    updatedAt: v.number(),
  }),
  timeline: v.array(customerRecordTimelineStep),
  reply: v.optional(v.object({
    body: v.string(),
    createdAt: v.number(),
  })),
  closedAt: v.optional(v.number()),
  updatedAt: v.number(),
})

const customerRecordResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.literal('inquiry_customer_record_read'),
    record: customerRecordReadback,
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(v.literal('inquiry_not_found'), v.literal('inquiry_access_denied')),
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
  receiptErasureCount: v.number(),
  erasureEventIds: v.array(v.string()),
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

const inquiryAbuseBucketCleanupResult = v.object({
  deleted: v.number(),
  cutoff: v.number(),
  rescheduled: v.boolean(),
})

const INQUIRY_ABUSE_BUCKET_STATES = ['open', 'limited'] as const
const ABUSE_BUCKET_CLEANUP_BATCH_SIZE = 100
const ABUSE_BUCKET_CLEANUP_MAX_BATCH_SIZE = 250

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

export const cleanupExpiredInquiryAbuseBuckets = internalMutation({
  args: {
    now: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  returns: inquiryAbuseBucketCleanupResult,
  handler: async (ctx, args) => {
    const cutoff = cleanupCutoff(args.now)
    const batchSize = cleanupBatchSize(args.batchSize)
    let deleted = 0

    for (const state of INQUIRY_ABUSE_BUCKET_STATES) {
      if (deleted >= batchSize) {
        break
      }

      const expiredBuckets = await ctx.db
        .query('inquiryAbuseBuckets')
        .withIndex('by_state_resetAt', (query) => query.eq('state', state).lte('resetAt', cutoff))
        .take(batchSize - deleted)

      for (const bucket of expiredBuckets) {
        await ctx.db.delete(bucket._id)
        deleted += 1
      }
    }

    const rescheduled = deleted >= batchSize
    if (rescheduled) {
      await ctx.scheduler.runAfter(0, internal.inquiries.cleanupExpiredInquiryAbuseBuckets, {
        now: cutoff,
        batchSize,
      })
    }

    return { deleted, cutoff, rescheduled }
  },
})

export const submitPublicInquiry = mutationGeneric({
  args: {
    target: inquiryTarget,
    body: v.string(),
    contact: publicInquiryContact,
    inquiryOrigin: v.optional(inquiryOrigin),
    pseudonymousSessionId: v.string(),
    abuseBucketKey: v.string(),
    ...csrfArgs,
    operationKey: v.string(),
    expectedDigest: v.string(),
    correlationId: v.string(),
  },
  returns: submitInquiryResult,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'public_inquiry')
    if (sourceWrite.kind === 'rejected') {
      return inquiryCsrfError(sourceWrite.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await inquirySourceStatePorts(db).load()
    const result = submitInquiryModule(state, {
      target: {
        businessId: brandNonEmpty(args.target.businessId, 'BusinessId'),
        serviceId: brandNonEmpty(args.target.serviceId, 'ServiceId'),
        capabilityKind: args.target.capabilityKind,
      },
      body: args.body,
      contact: args.contact,
      customerAccessKeyring: resolveInquiryCustomerAccessKeyring(process.env),
      governedSendIntegrityKeyring: resolveGovernedSendIntegrityKeyring(process.env),
      ...(args.inquiryOrigin === undefined ? {} : { origin: args.inquiryOrigin }),
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      pseudonymousSessionId: args.pseudonymousSessionId,
      abuseBucketKey: args.abuseBucketKey,
      expectedDigest: args.expectedDigest,
      now: Date.now(),
    })

    if (result.kind === 'error') {
      if (result.state !== undefined) {
        await inquirySourceStatePorts(db).persist(result.state)
      }
      return summarizeSubmitError(result)
    }

    const bridged = await inquiryNotificationPorts(db).enqueueDispatches(
      result.state,
      result.notification,
      result.thread.businessId,
      args.correlationId,
    )
    await inquirySourceStatePorts(db).persist(bridged.state)
    return {
      kind: 'ok' as const,
      code: result.code,
      thread: {
        threadId: result.thread.threadId,
        businessId: result.thread.businessId,
        serviceId: result.thread.serviceId,
        status: result.thread.status,
        version: result.thread.version,
        customerAccessKey: result.customerAccessKey,
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

    const state = await inquirySourceStatePorts(runtimeDb(ctx.db)).load()
    return {
      kind: 'allowed' as const,
      inbox: serializeOwnerInbox(listOwnerInboxModule(state, { authority: { ownerId: brandNonEmpty(owner.ownerId, 'OwnerId') } })),
    }
  },
})

export const readPublicTargetAdmission = queryGeneric({
  args: inquiryTarget,
  returns: r1TargetAdmission,
  handler: async (ctx, args) => {
    const state = await inquirySourceStatePorts(runtimeDb(ctx.db)).load()
    const admission = evaluateR1TargetAdmission(state, {
      businessId: brandNonEmpty(args.businessId, 'BusinessId'),
      serviceId: brandNonEmpty(args.serviceId, 'ServiceId'),
      capabilityKind: args.capabilityKind,
    })
    return admission.admitted
      ? { ...admission, proof: { ...admission.proof } }
      : { ...admission, blockers: [...admission.blockers] }
  },
})

const publicCatalogInquiryAvailability = v.object({
  businessSlug: v.string(),
  serviceSlug: v.string(),
  capabilityKind: literalUnion(CapabilityKindValues),
  admitted: v.boolean(),
})

export const readPublicCatalogInquiryAvailability = queryGeneric({
  args: {
    targets: v.array(v.object({
      businessSlug: v.string(),
      serviceSlug: v.string(),
      capabilityKind: literalUnion(CapabilityKindValues),
    })),
  },
  returns: v.array(publicCatalogInquiryAvailability),
  handler: async (ctx, args) => {
    if (args.targets.length > 100) throw new Error('public_catalog_inquiry_targets_exceeded')
    const state = await inquirySourceStatePorts(runtimeDb(ctx.db)).load()
    return args.targets.map((target) => {
      const business = state.businesses.find((candidate) => String(candidate.slug) === target.businessSlug)
      const service = business === undefined
        ? undefined
        : state.businessServices.find((candidate) =>
            candidate.businessId === business.businessId
            && String(candidate.serviceSlug) === target.serviceSlug)
      const admitted = business !== undefined && service !== undefined
        && evaluateR1TargetAdmission(state, {
          businessId: business.businessId,
          serviceId: service.serviceId,
          capabilityKind: target.capabilityKind,
        }).admitted
      return { ...target, admitted }
    })
  },
})

export const readCurrentOwnerTargetAdmission = queryGeneric({
  args: inquiryTarget,
  returns: ownerTargetAdmissionResult,
  handler: async (ctx, args) => {
    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return { kind: 'error' as const, code: 'owner_not_found' as const, retryable: false, reason: owner.reason }
    }

    const state = await inquirySourceStatePorts(runtimeDb(ctx.db)).load()
    const business = state.businesses.find((candidate) => candidate.businessId === args.businessId)
    const service = state.businessServices.find((candidate) =>
      candidate.businessId === args.businessId && candidate.serviceId === args.serviceId)
    const capability = state.serviceCapabilities.find((candidate) =>
      candidate.businessId === args.businessId
      && candidate.serviceId === args.serviceId
      && candidate.kind === args.capabilityKind)
    if (business === undefined || service === undefined || capability === undefined) {
      return {
        kind: 'error' as const,
        code: 'inquiry_target_not_found' as const,
        retryable: false,
        reason: 'Inquiry target was not found.',
      }
    }
    if (business.ownerId !== owner.ownerId) {
      return {
        kind: 'error' as const,
        code: 'inquiry_target_wrong_owner' as const,
        retryable: false,
        reason: 'Inquiry target does not belong to the current owner.',
      }
    }

    const admission = evaluateR1TargetAdmission(state, {
      businessId: brandNonEmpty(args.businessId, 'BusinessId'),
      serviceId: brandNonEmpty(args.serviceId, 'ServiceId'),
      capabilityKind: args.capabilityKind,
    })
    return {
      kind: 'ok' as const,
      admission: admission.admitted
        ? { ...admission, proof: { ...admission.proof } }
        : { ...admission, blockers: [...admission.blockers] },
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
      inquirySourceStatePorts(db).load(),
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

    const state = await inquirySourceStatePorts(runtimeDb(ctx.db)).load()
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

export const readCustomerRecord = queryGeneric({
  args: {
    threadId: v.string(),
    accessKey: v.string(),
  },
  returns: customerRecordResult,
  handler: async (ctx, args) => {
    const db = runtimeDb(ctx.db)
    const threadId = brandNonEmpty(args.threadId, 'InquiryThreadId')
    const keyring = resolveInquiryCustomerAccessKeyring(process.env)
    const accessId = accessIdFromInquiryCustomerAccessKey(args.accessKey)
    const grant = accessId === undefined
      ? undefined
      : await inquirySourceStatePorts(db).loadCustomerAccessGrant(accessId)
    const now = Date.now()
    if (grant === undefined || !verifyInquiryCustomerAccess({
      grant,
      accessKey: args.accessKey,
      requestedThreadId: threadId,
      now,
      keyring,
    })) {
      return { kind: 'error' as const, code: 'inquiry_access_denied' as const, retryable: false, reason: 'Inquiry record was not found for this key.' }
    }

    const state = await inquirySourceStatePorts(db).loadCustomerRecord(threadId, grant)
    const result = readCustomerRecordModule(state, {
      threadId,
      accessKey: args.accessKey,
      keyring,
      governedSendIntegrityKeyring: resolveGovernedSendIntegrityKeyring(process.env),
      now,
    })
    if (result.kind === 'error') {
      return result
    }

    return {
      kind: 'ok' as const,
      code: result.code,
      record: serializeCustomerRecord(result.record),
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

    const state = await inquirySourceStatePorts(runtimeDb(ctx.db)).load()
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

    const state = await inquirySourceStatePorts(runtimeDb(ctx.db)).load()
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
    const sourceWrite = await requireSourceWrite(ctx, args, 'owner_inquiry')
    if (sourceWrite.kind === 'rejected') {
      return ownerMutationCsrfError(sourceWrite.reason)
    }

    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return ownerMutationAuthError(owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await inquirySourceStatePorts(db).load()
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

    await inquirySourceStatePorts(db).persist(result.state)
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
    const sourceWrite = await requireSourceWrite(ctx, args, 'owner_inquiry')
    if (sourceWrite.kind === 'rejected') {
      return inquiryPrivacyCsrfError(sourceWrite.reason)
    }

    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return ownerAuthError(owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const ownedThread = await db.query('inquiryThreads')
      .withIndex('by_threadId', (query) => query.eq('threadId', args.threadId))
      .unique()
    if (ownedThread === null || stringField(ownedThread, 'ownerId') !== owner.ownerId) {
      return { kind: 'error' as const, code: 'inquiry_not_found' as const, retryable: false, reason: 'Inquiry thread was not found for this owner.' }
    }
    await inquirySourceStatePorts(db).repairErasureKeys(args.threadId)
    const state = await inquirySourceStatePorts(db).load()
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

    await inquirySourceStatePorts(db).persist(result.state)
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

    const state = await inquirySourceStatePorts(runtimeDb(ctx.db)).load()
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
    const sourceWrite = await requireSourceWrite(ctx, args, 'owner_inquiry')
    if (sourceWrite.kind === 'rejected') {
      return ownerMutationCsrfError(sourceWrite.reason)
    }

    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return ownerMutationAuthError(owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await inquirySourceStatePorts(db).load()
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

    const bridged = await inquiryNotificationPorts(db).enqueueDispatches(
      result.state,
      result.notification,
      result.thread.businessId,
      args.correlationId,
    )
    await inquirySourceStatePorts(db).persist(bridged.state)
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
    const sourceWrite = await requireSourceWrite(ctx, args, 'owner_inquiry')
    if (sourceWrite.kind === 'rejected') {
      return ownerMutationCsrfError(sourceWrite.reason)
    }

    const owner = await readCurrentOwner(ctx)
    if (owner.kind === 'denied') {
      return ownerMutationAuthError(owner.reason)
    }

    const db = runtimeDb(ctx.db)
    const state = await inquirySourceStatePorts(db).load()
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

    await inquirySourceStatePorts(db).persist(result.state)
    return ownerMutationOk(result)
  },
})

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

function summarizeSubmitError(result: Extract<ReturnType<typeof submitInquiryModule>, { kind: 'error' }>) {
  return {
    kind: 'error' as const,
    code: result.code,
    retryable: result.retryable,
    reason: result.reason,
    ...(result.blockers === undefined ? {} : { blockers: [...result.blockers] }),
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

function inquiryCsrfError(reason: string) {
  return {
    kind: 'error' as const,
    code: 'inquiry_csrf_rejected' as const,
    retryable: false,
    reason,
  }
}

function ownerMutationCsrfError(reason: string) {
  return inquiryCsrfError(reason)
}

function inquiryPrivacyCsrfError(reason: string) {
  return {
    kind: 'error' as const,
    code: 'inquiry_csrf_rejected' as const,
    retryable: false,
    reason,
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

function cleanupCutoff(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value) ? Date.now() : value
}

function cleanupBatchSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return ABUSE_BUCKET_CLEANUP_BATCH_SIZE
  }

  return Math.min(Math.max(Math.floor(value), 1), ABUSE_BUCKET_CLEANUP_MAX_BATCH_SIZE)
}
