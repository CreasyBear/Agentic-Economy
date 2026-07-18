import type {
  InquiryCustomerRecordReadback,
  InquiryDeliveryReadback,
  InquiryExportReadback,
  InquiryPrivacyTombstoneRecord,
  OwnerInboxReadback,
  OwnerInquiryDetailReadback,
} from '../schema'

export function serializeOwnerInbox(inbox: OwnerInboxReadback) {
  return {
    ownerId: inbox.ownerId,
    empty: inbox.empty,
    buckets: { ...inbox.buckets },
    delivery: { ...inbox.delivery },
    inquiries: inbox.inquiries.map((inquiry) => ({ ...inquiry })),
  }
}

export function serializeOwnerInquiryDetail(readback: OwnerInquiryDetailReadback): {
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

export function serializeCustomerRecord(record: InquiryCustomerRecordReadback) {
  return {
    schemaVersion: record.schemaVersion,
    threadId: record.threadId,
    business: { ...record.business },
    submitted: { ...record.submitted },
    ...(record.governedSend === undefined ? {} : {
      governedSend: record.governedSend.posture === 'verified'
        ? {
            posture: 'verified' as const,
            digest: record.governedSend.digest,
            fields: record.governedSend.fields.map((field) => ({ ...field })),
          }
        : {
            posture: 'erased' as const,
            digest: record.governedSend.digest,
            erasedAt: record.governedSend.erasedAt,
            erasureEventId: record.governedSend.erasureEventId,
          },
    }),
    delivery: { ...record.delivery },
    timeline: record.timeline.map((step) => ({ ...step })),
    ...(record.reply === undefined ? {} : { reply: { ...record.reply } }),
    ...(record.closedAt === undefined ? {} : { closedAt: record.closedAt }),
    updatedAt: record.updatedAt,
  }
}

export function serializeInquiryDeliveryReadback(readback: InquiryDeliveryReadback) {
  return {
    threadId: readback.threadId,
    notifications: readback.notifications.map(serializeOwnerNotificationProjection),
  }
}

export function serializeInquiryExport(readback: InquiryExportReadback) {
  return {
    thread: { ...readback.thread },
    messages: readback.messages.map((message) => ({ ...message })),
    notifications: readback.notifications.map(serializeOwnerNotificationProjection),
    auditRefs: readback.auditRefs.map((auditRef) => ({ ...auditRef })),
    tombstones: readback.tombstones.map(serializeInquiryPrivacyTombstone),
  }
}

export function serializeOwnerNotificationProjection(
  notification: InquiryDeliveryReadback['notifications'][number],
) {
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

export function serializeInquiryPrivacyTombstone(tombstone: InquiryPrivacyTombstoneRecord) {
  return {
    threadId: tombstone.threadId,
    businessId: tombstone.businessId,
    reasonCode: tombstone.reasonCode,
    status: tombstone.status,
    operationKey: tombstone.operationKey,
    correlationId: tombstone.correlationId,
    createdAt: tombstone.createdAt,
    ...(tombstone.appliedAt === undefined ? {} : { appliedAt: tombstone.appliedAt }),
    receiptErasureCount: tombstone.receiptErasureCount,
    erasureEventIds: [...tombstone.erasureEventIds],
  }
}
