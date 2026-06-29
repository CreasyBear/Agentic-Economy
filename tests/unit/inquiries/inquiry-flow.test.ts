import { describe, expect, it } from 'vitest'

import type { BusinessRecord } from '@/modules/business/public'
import type { BusinessServiceRecord, ServiceCapabilityRecord } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'
import * as inquiries from '@/modules/inquiries/public'
import type { CapabilityLaunchSupportRecord, InquirySourceState, SubmitInquiryCommand } from '@/modules/inquiries/public'
import {
  buildPublicInquiryAffordance,
  submitPublicInquiryRouteReadback,
  validatePublicInquiryFormInput,
} from '@/modules/inquiries/route-readbacks'
import type { SuppressionRuleRecord } from '@/modules/security/public'
import { readPublicInquiryRouteReadback } from '@/routes/$slug.inquiry'
import { readOwnerInquiriesRouteReadback } from '@/routes/owner.inquiries'
import { readOwnerInquiryThreadRouteReadback } from '@/routes/owner.inquiries.$threadId'

const ownerId = brandNonEmpty('owner:inquiry', 'OwnerId')
const otherOwnerId = brandNonEmpty('owner:other', 'OwnerId')
const businessId = brandNonEmpty('business:inquiry', 'BusinessId')
const serviceId = brandNonEmpty('service:emergency-plumbing', 'ServiceId')
const serviceSlug = brandNonEmpty('emergency-plumbing', 'Slug')
const now = 1_900_000_000_000

const target = {
  businessId,
  serviceId,
  capabilityKind: 'phone_inquiry',
} as const

describe('human inquiry owner inbox slice', () => {
  it('submits, appears in owner inbox, marks read, replies, closes, and renders through the owner route helper', () => {
    const submit = inquiries.submitInquiry(sourceState(), submitCommand('submit', {
      body: 'Pipe burst under the kitchen sink. Can someone contact me today?',
      contact: { name: 'Sam Customer', email: 'sam.customer@example.test' },
      notificationStatus: 'queued',
    }))

    expect(submit.kind).toBe('ok')
    if (submit.kind !== 'ok') throw new Error(submit.code)
    expect(submit.state.threads).toHaveLength(1)
    expect(submit.state.messages).toHaveLength(1)
    expect(submit.state.auditEvents.map((event) => event.eventType)).toContain('inquiry.submitted')
    expect(submit.state.funnelEvents.map((event) => event.eventType)).toContain('inquiry_submitted')
    expect(JSON.stringify([submit.notification, submit.state.auditEvents, submit.state.funnelEvents])).not.toContain('sam.customer@example.test')
    expect(JSON.stringify([submit.notification, submit.state.auditEvents, submit.state.funnelEvents])).not.toContain('Pipe burst')

    const inbox = inquiries.listOwnerInbox(submit.state, { authority: { ownerId } })
    expect(inbox.buckets).toEqual({ unread: 1, needs_reply: 0, resolved: 0 })
    const firstInboxItem = inbox.inquiries[0]
    expect(firstInboxItem).toBeDefined()
    if (firstInboxItem === undefined) throw new Error('missing inbox item')
    expect(firstInboxItem).toMatchObject({ notificationStatus: 'queued', status: 'unread' })

    const otherInbox = inquiries.listOwnerInbox(submit.state, { authority: { ownerId: otherOwnerId } })
    expect(otherInbox.inquiries).toEqual([])

    const detail = inquiries.readOwnerInquiry(submit.state, { authority: { ownerId }, threadId: submit.thread.threadId })
    expect(detail.kind).toBe('ok')
    if (detail.kind !== 'ok') throw new Error(detail.code)
    expect(detail.readback.messages).toHaveLength(1)
    expect(detail.readback.messages[0]?.body).toContain('Pipe burst')

    const read = inquiries.markInquiryRead(submit.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('read'),
      correlationId: correlationId('read'),
      expectedVersion: submit.thread.version,
      now: now + 1,
    })
    expect(read.kind).toBe('ok')
    if (read.kind !== 'ok') throw new Error(read.code)
    expect(read.thread.status).toBe('read')

    const reply = inquiries.replyToInquiry(read.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('reply'),
      correlationId: correlationId('reply'),
      expectedVersion: read.thread.version,
      now: now + 2,
      body: 'Thanks, we received your inquiry and will respond from the business contact path.',
      notificationStatus: 'sent',
    })
    expect(reply.kind).toBe('ok')
    if (reply.kind !== 'ok') throw new Error(reply.code)
    expect(reply.thread.status).toBe('replied')
    expect(reply.state.messages).toHaveLength(2)
    expect(reply.notification.status).toBe('sent')

    const close = inquiries.closeInquiry(reply.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('close'),
      correlationId: correlationId('close'),
      expectedVersion: reply.thread.version,
      now: now + 3,
    })
    expect(close.kind).toBe('ok')
    if (close.kind !== 'ok') throw new Error(close.code)
    expect(close.thread.status).toBe('closed')

    const routeReadback = readOwnerInquiriesRouteReadback({ state: close.state, ownerId })
    expect(routeReadback.inbox.buckets).toEqual({ unread: 0, needs_reply: 0, resolved: 1 })
    expect(routeReadback.inbox.inquiries[0]?.status).toBe('closed')

    const threadRouteReadback = readOwnerInquiryThreadRouteReadback({ state: close.state, ownerId, threadId: submit.thread.threadId })
    expect(threadRouteReadback.kind).toBe('available')
    if (threadRouteReadback.kind !== 'available') throw new Error(threadRouteReadback.reason)
    expect(threadRouteReadback.detail.messages).toHaveLength(2)
    expect(threadRouteReadback.notifications).toHaveLength(2)
    expect(threadRouteReadback.canReply).toBe(false)
    expect(threadRouteReadback.canClose).toBe(false)
  })

  it('renders public inquiry availability and submit receipts through the route helpers', () => {
    const eligibleState = sourceState()
    expect(inquiries.evaluateInquiryLaunchSupportReadiness(eligibleState)).toMatchObject({
      kind: 'ready',
      record: { capability: 'human_inquiry_owner_inbox' },
    })
    const publicReadback = readPublicInquiryRouteReadback({ state: eligibleState, slug: 'plumbing-demo' })
    expect(publicReadback).toMatchObject({
      kind: 'available',
      businessName: 'Demo Plumbing',
      serviceName: 'Emergency plumbing',
      target: {
        businessId,
        serviceId,
        capabilityKind: 'phone_inquiry',
      },
    })
    if (publicReadback.kind !== 'available') throw new Error(publicReadback.reason)

    expect(buildPublicInquiryAffordance({
      businessId,
      slug: brandNonEmpty('plumbing-demo', 'Slug'),
      name: 'Demo Plumbing',
      category: 'Emergency plumbing',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      publicUrl: '/plumbing-demo',
      publicStatus: 'published',
      trustTier: 'contact_confirmed',
      indexStatus: 'queued',
      discoveryStatus: 'degraded',
      schemaVersion: 'public-catalog:v1',
      updatedAt: now,
      services: [
        {
          serviceId,
          serviceSlug,
          businessId,
          name: 'Emergency plumbing',
          category: 'Emergency plumbing',
          summary: 'Human triage for urgent plumbing issues.',
          serviceArea: 'Parramatta',
          hoursOrUnknown: 'Hours supplied by owner',
          firstRequest: capability().firstRequest,
          status: 'published',
          capabilities: [
            {
              serviceId,
              kind: 'phone_inquiry',
              status: 'available',
              firstRequest: capability().firstRequest,
              callable: false,
              paymentRequired: false,
            },
          ],
        },
      ],
    })).toMatchObject({ kind: 'available', href: '/plumbing-demo/inquiry' })

    const invalid = validatePublicInquiryFormInput({ body: ' ', contact: {} })
    expect(invalid).toMatchObject({ kind: 'invalid', errors: expect.arrayContaining([expect.objectContaining({ field: 'body' })]) })

    const submitted = submitPublicInquiryRouteReadback({
      state: eligibleState,
      slug: 'plumbing-demo',
      body: 'Please ask a human owner to contact me about this leak.',
      contact: { name: 'Route Customer', email: 'route.customer@example.test' },
      operationKey: operationKey('public-route-submit'),
      correlationId: correlationId('public-route-submit'),
      pseudonymousSessionId: 'session:public-route',
      abuseBucketKey: 'ip:public-route',
      now,
    })
    expect(submitted.kind).toBe('submitted')
    if (submitted.kind !== 'submitted') throw new Error(submitted.reason)
    expect(submitted.receipt).toMatchObject({
      businessName: 'Demo Plumbing',
      serviceName: 'Emergency plumbing',
      notificationStatus: 'queued',
      deliveryLabel: 'Queued for owner delivery',
    })
    expect(submitted.state.threads).toHaveLength(1)
    expect(JSON.stringify(submitted.receipt)).not.toContain('route.customer@example.test')
    expect(JSON.stringify(submitted.receipt)).not.toContain('contact me about this leak')

    const notReady = readPublicInquiryRouteReadback({
      state: sourceState({ serviceCapabilities: [{ ...capability(), status: 'degraded' }] }),
      slug: 'plumbing-demo',
    })
    expect(notReady).toMatchObject({ kind: 'unavailable' })
  })

  it('requires a launch support record before human inquiry availability can be claimed', () => {
    const missingSupport = sourceState({ capabilityLaunchSupportRecords: [] })
    expect(inquiries.evaluateInquiryLaunchSupportReadiness(missingSupport)).toMatchObject({
      kind: 'blocked',
      reason: 'Support launch record is not ready for human inquiry.',
    })
    expect(readPublicInquiryRouteReadback({ state: missingSupport, slug: 'plumbing-demo' })).toMatchObject({
      kind: 'unavailable',
      reason: 'Support launch record is not ready for human inquiry.',
    })
    expect(inquiries.submitInquiry(missingSupport, submitCommand('missing-support'))).toMatchObject({
      kind: 'error',
      code: 'inquiry_target_not_ready',
    })

    const seed = inquiries.submitInquiry(sourceState(), submitCommand('support-capacity-seed'))
    expect(seed.kind).toBe('ok')
    if (seed.kind !== 'ok') throw new Error(seed.code)
    const overCapacity = {
      ...seed.state,
      capabilityLaunchSupportRecords: [
        supportRecord({
          capacityThreshold: { maxOpenThreads: 1, maxFailedNotifications: 0 },
          lastReviewedAt: now + 1_000,
        }),
      ],
    }
    expect(inquiries.evaluateInquiryLaunchSupportReadiness(overCapacity)).toMatchObject({
      kind: 'blocked',
      reason: 'Inquiry support capacity threshold is exceeded.',
    })
    const secondThreadBlocked = inquiries.submitInquiry(overCapacity, submitCommand('support-capacity-second'))
    expect(secondThreadBlocked).toMatchObject({ kind: 'error', code: 'inquiry_target_not_ready' })

    const failedDelivery = inquiries.submitInquiry(
      sourceState({ capabilityLaunchSupportRecords: [supportRecord({ capacityThreshold: { maxOpenThreads: 10, maxFailedNotifications: 0 } })] }),
      submitCommand('support-failed-notification', {
        notificationStatus: 'failed',
        notificationFailureCode: 'provider_missing',
      })
    )
    expect(failedDelivery.kind).toBe('ok')
    if (failedDelivery.kind !== 'ok') throw new Error(failedDelivery.code)
    expect(inquiries.evaluateInquiryLaunchSupportReadiness(failedDelivery.state)).toMatchObject({
      kind: 'blocked',
      reason: 'Inquiry delivery support threshold is exceeded.',
    })

    const unresolvedIncident = sourceState({
      capabilityLaunchSupportRecords: [
        supportRecord({
          phaseIncidentCounts: {
            retryExhausted: 1,
            noRepair: 0,
            unresolvedDeliveryFailures: 0,
            abuseBlocked: 0,
            privacyDeletes: 0,
          },
        }),
      ],
    })
    expect(readPublicInquiryRouteReadback({ state: unresolvedIncident, slug: 'plumbing-demo' })).toMatchObject({
      kind: 'unavailable',
      reason: 'Inquiry support incidents must be reviewed before public claims continue.',
    })
  })

  it('keeps the inquiry when notification delivery fails', () => {
    const submit = inquiries.submitInquiry(sourceState(), submitCommand('failed-delivery', {
      body: 'The tap is leaking and I need a human follow-up.',
      contact: { email: 'leak.customer@example.test' },
      notificationStatus: 'failed',
      notificationFailureCode: 'provider_missing',
    }))

    expect(submit.kind).toBe('ok')
    if (submit.kind !== 'ok') throw new Error(submit.code)
    expect(submit.notification).toMatchObject({ status: 'failed', failureCode: 'provider_missing' })
    expect(submit.state.threads).toHaveLength(1)
    expect(submit.state.messages).toHaveLength(1)

    const inbox = inquiries.listOwnerInbox(submit.state, { authority: { ownerId } })
    expect(inbox.delivery.failed).toBe(1)
    expect(inbox.inquiries[0]?.notificationStatus).toBe('failed')

    const delivery = inquiries.readInquiryDeliveryReadback(submit.state, { authority: { ownerId }, threadId: submit.thread.threadId })
    expect(delivery.kind).toBe('ok')
    if (delivery.kind !== 'ok') throw new Error(delivery.code)
    expect(delivery.readback.notifications).toHaveLength(1)
    expect(delivery.readback.notifications[0]).toMatchObject({ status: 'failed', failureCode: 'provider_missing' })

    const detail = inquiries.readOwnerInquiry(submit.state, { authority: { ownerId }, threadId: submit.thread.threadId })
    expect(detail.kind).toBe('ok')
    if (detail.kind !== 'ok') throw new Error(detail.code)
    expect(detail.readback.messages[0]?.body).toContain('tap is leaking')

    const held = inquiries.submitInquiry(sourceState(), submitCommand('held-delivery', {
      body: 'Please hold delivery readback without losing this message.',
      contact: { email: 'held.customer@example.test' },
      notificationStatus: 'held',
      notificationFailureCode: 'dispatch_disabled',
    }))
    expect(held.kind).toBe('ok')
    if (held.kind !== 'ok') throw new Error(held.code)
    expect(held.state.messages).toHaveLength(1)
    expect(inquiries.listOwnerInbox(held.state, { authority: { ownerId } }).delivery.held).toBe(1)
  })

  it('reconstructs a redacted operator timeline by thread, correlation, and dispatch refs', () => {
    const empty = inquiries.readInquiryOperatorReconstruction(inquiries.createEmptyInquirySourceState())
    expect(empty).toMatchObject({ kind: 'allowed', summary: { threads: 0, messages: 0, notifications: 0, dispatches: 0 }, rows: [] })

    const submit = inquiries.submitInquiry(sourceState(), submitCommand('operator-submit', {
      body: 'Raw private customer pipe leak text must never render.',
      contact: { name: 'Private Customer', email: 'private.operator@example.test' },
      notificationStatus: 'failed',
      notificationFailureCode: 'provider_missing',
    }))
    expect(submit.kind).toBe('ok')
    if (submit.kind !== 'ok') throw new Error(submit.code)

    const read = inquiries.markInquiryRead(submit.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('operator-read'),
      correlationId: correlationId('operator-read'),
      expectedVersion: submit.thread.version,
      now: now + 20,
    })
    expect(read.kind).toBe('ok')
    if (read.kind !== 'ok') throw new Error(read.code)

    const reply = inquiries.replyToInquiry(read.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('operator-reply'),
      correlationId: correlationId('operator-reply'),
      expectedVersion: read.thread.version,
      now: now + 21,
      body: 'Raw private owner note must never render.',
      notificationStatus: 'queued',
    })
    expect(reply.kind).toBe('ok')
    if (reply.kind !== 'ok') throw new Error(reply.code)

    const close = inquiries.closeInquiry(reply.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('operator-close'),
      correlationId: correlationId('operator-close'),
      expectedVersion: reply.thread.version,
      now: now + 22,
    })
    expect(close.kind).toBe('ok')
    if (close.kind !== 'ok') throw new Error(close.code)

    const dispatchId = brandNonEmpty('notification_dispatch:operator-resend', 'NotificationDispatchId')
    const bound = inquiries.bindInquiryNotificationDispatches(close.state, {
      notificationId: reply.notification.notificationId,
      dispatchBindings: [
        {
          dispatchId,
          providerFamily: 'resend',
          status: 'provider_missing',
          providerIdempotencyKey: 'ae:notification_dispatch:operator-resend',
          payloadHash: stableHash({ dispatchId, redacted: true }),
          operatorNextAction: 'retry_available',
          updatedAt: now + 23,
        },
      ],
      now: now + 23,
    })
    expect(bound.kind).toBe('ok')
    if (bound.kind !== 'ok') throw new Error(bound.code)

    const byThread = inquiries.readInquiryOperatorReconstruction(bound.state, { threadId: submit.thread.threadId })
    expect(byThread.kind).toBe('allowed')
    expect(byThread.summary).toMatchObject({ threads: 1, messages: 2, notifications: 2, dispatches: 1 })
    expect(byThread.rows[0]).toMatchObject({
      threadId: submit.thread.threadId,
      sourceHash: submit.thread.sourceHash,
      status: 'closed',
      operatorNextAction: 'retry_available',
      messageRefs: expect.arrayContaining([
        expect.objectContaining({ sender: 'customer', bodyHash: expect.any(String), contactHash: expect.any(String) }),
        expect.objectContaining({ sender: 'owner', bodyHash: expect.any(String) }),
      ]),
      dispatchRefs: [
        expect.objectContaining({
          dispatchId,
          providerFamily: 'resend',
          status: 'provider_missing',
          payloadHash: expect.any(String),
          operatorNextAction: 'retry_available',
        }),
      ],
      auditRefs: expect.arrayContaining([
        expect.objectContaining({ eventType: 'inquiry.submitted', correlationId: correlationId('operator-submit') }),
        expect.objectContaining({ eventType: 'inquiry.read_marked', correlationId: correlationId('operator-read') }),
        expect.objectContaining({ eventType: 'inquiry.replied', correlationId: correlationId('operator-reply') }),
        expect.objectContaining({ eventType: 'inquiry.closed', correlationId: correlationId('operator-close') }),
      ]),
      funnelRefs: expect.arrayContaining([
        expect.objectContaining({ eventType: 'inquiry_submitted' }),
        expect.objectContaining({ eventType: 'owner_inquiry_read' }),
        expect.objectContaining({ eventType: 'owner_inquiry_replied' }),
        expect.objectContaining({ eventType: 'inquiry_closed' }),
      ]),
      operationRefs: expect.arrayContaining([
        expect.objectContaining({ operationKey: operationKey('operator-submit'), resultCode: 'inquiry_submitted' }),
        expect.objectContaining({ operationKey: operationKey('operator-reply'), resultCode: 'inquiry_replied' }),
      ]),
    })
    expect(inquiries.readInquiryOperatorReconstruction(bound.state, { correlationId: correlationId('operator-reply') }).rows).toHaveLength(1)
    expect(inquiries.readInquiryOperatorReconstruction(bound.state, { dispatchId }).rows).toHaveLength(1)

    const rendered = JSON.stringify(byThread)
    expect(rendered).not.toContain('Raw private customer pipe leak text')
    expect(rendered).not.toContain('Raw private owner note')
    expect(rendered).not.toContain('private.operator@example.test')
    expect(rendered).not.toContain('redactedPayload')
    expect(rendered).not.toContain('provider payload')
    expect(rendered).not.toContain('[private content deleted]')
  })

  it('exports owner-authorized inquiry data and tombstones private content deletion', () => {
    const submit = inquiries.submitInquiry(sourceState(), submitCommand('privacy-delete', {
      body: 'Private pipe leak details that should be removed.',
      contact: { name: 'Private Customer', email: 'private.customer@example.test' },
    }))
    expect(submit.kind).toBe('ok')
    if (submit.kind !== 'ok') throw new Error(submit.code)

    const reply = inquiries.replyToInquiry(submit.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('privacy-reply'),
      correlationId: correlationId('privacy-reply'),
      expectedVersion: submit.thread.version,
      now: now + 10,
      body: 'Private owner reply that should be removed.',
    })
    expect(reply.kind).toBe('ok')
    if (reply.kind !== 'ok') throw new Error(reply.code)

    const ownerExport = inquiries.requestInquiryExport(reply.state, { authority: { ownerId }, threadId: submit.thread.threadId })
    expect(ownerExport.kind).toBe('ok')
    if (ownerExport.kind !== 'ok') throw new Error(ownerExport.code)
    expect(ownerExport.exportData.messages.map((message) => message.body)).toEqual(
      expect.arrayContaining(['Private pipe leak details that should be removed.', 'Private owner reply that should be removed.'])
    )

    const wrongOwnerDelete = inquiries.deleteInquiryPrivateContent(reply.state, {
      authority: { ownerId: otherOwnerId },
      threadId: submit.thread.threadId,
      reasonCode: 'privacy_delete_requested',
      operationKey: operationKey('privacy-erase'),
      correlationId: correlationId('privacy-erase'),
      now: now + 11,
    })
    expect(wrongOwnerDelete).toMatchObject({ kind: 'error', code: 'inquiry_not_found' })

    const deleted = inquiries.deleteInquiryPrivateContent(reply.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      reasonCode: 'privacy_delete_requested',
      operationKey: operationKey('privacy-erase'),
      correlationId: correlationId('privacy-erase'),
      now: now + 11,
    })
    expect(deleted.kind).toBe('ok')
    if (deleted.kind !== 'ok') throw new Error(deleted.code)
    expect(deleted.tombstone).toMatchObject({ status: 'applied', reasonCode: 'privacy_delete_requested' })
    expect(deleted.state.privacyTombstones).toHaveLength(1)
    expect(deleted.state.messages.every((message) => message.privateDeletedAt === now + 11)).toBe(true)

    const deletedDetail = inquiries.readOwnerInquiry(deleted.state, { authority: { ownerId }, threadId: submit.thread.threadId })
    expect(deletedDetail.kind).toBe('ok')
    if (deletedDetail.kind !== 'ok') throw new Error(deletedDetail.code)
    expect(JSON.stringify(deletedDetail.readback)).not.toContain('Private pipe leak details')
    expect(JSON.stringify(deletedDetail.readback)).not.toContain('Private owner reply')
    expect(deletedDetail.readback.messages.map((message) => message.body)).toEqual(['[private content deleted]', '[private content deleted]'])

    const exportAfterDelete = inquiries.requestInquiryExport(deleted.state, { authority: { ownerId }, threadId: submit.thread.threadId })
    expect(exportAfterDelete.kind).toBe('ok')
    if (exportAfterDelete.kind !== 'ok') throw new Error(exportAfterDelete.code)
    expect(JSON.stringify(exportAfterDelete.exportData)).not.toContain('Private pipe leak details')
    expect(JSON.stringify(exportAfterDelete.exportData)).not.toContain('Private owner reply')
    expect(exportAfterDelete.exportData.messages.every((message) => message.bodyHash.length > 0)).toBe(true)
    expect(exportAfterDelete.exportData.tombstones).toHaveLength(1)
    expect(exportAfterDelete.exportData.auditRefs.map((auditRef) => auditRef.eventType)).toContain('inquiry.private_content_deleted')

    const routeReadback = readOwnerInquiryThreadRouteReadback({ state: deleted.state, ownerId, threadId: submit.thread.threadId })
    expect(routeReadback.kind).toBe('available')
    if (routeReadback.kind !== 'available') throw new Error(routeReadback.reason)
    expect(routeReadback.tombstones).toHaveLength(1)
    expect(routeReadback.detail.messages.map((message) => message.body)).toEqual(['[private content deleted]', '[private content deleted]'])
    expect(JSON.stringify(routeReadback)).not.toContain('Private pipe leak details')

    const replay = inquiries.deleteInquiryPrivateContent(deleted.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      reasonCode: 'privacy_delete_requested',
      operationKey: operationKey('privacy-erase'),
      correlationId: correlationId('privacy-erase'),
      now: now + 12,
    })
    expect(replay).toMatchObject({ kind: 'ok', code: 'inquiry_private_content_delete_replayed' })

    const conflict = inquiries.deleteInquiryPrivateContent(deleted.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      reasonCode: 'changed_reason',
      operationKey: operationKey('privacy-erase'),
      correlationId: correlationId('privacy-erase'),
      now: now + 12,
    })
    expect(conflict).toMatchObject({ kind: 'error', code: 'inquiry_duplicate_conflict' })
  })

  it('replays duplicate public submits and rejects same-key changed bodies without extra records', () => {
    const first = inquiries.submitInquiry(sourceState(), submitCommand('duplicate-submit', {
      body: 'Please route this to the owner once.',
      contact: { email: 'duplicate.customer@example.test' },
    }))
    expect(first.kind).toBe('ok')
    if (first.kind !== 'ok') throw new Error(first.code)

    const replay = inquiries.submitInquiry(first.state, submitCommand('duplicate-submit', {
      body: 'Please route this to the owner once.',
      contact: { email: 'duplicate.customer@example.test' },
    }))
    expect(replay.kind).toBe('ok')
    if (replay.kind !== 'ok') throw new Error(replay.code)
    expect(replay.code).toBe('inquiry_replayed')
    expect(replay.thread.threadId).toBe(first.thread.threadId)
    expect(replay.state.threads).toHaveLength(1)
    expect(replay.state.messages).toHaveLength(1)
    expect(replay.state.notifications).toHaveLength(1)

    const conflict = inquiries.submitInquiry(first.state, submitCommand('duplicate-submit', {
      body: 'Please route this to the owner, but with changed content.',
      contact: { email: 'duplicate.customer@example.test' },
    }))
    expect(conflict).toMatchObject({ kind: 'error', code: 'inquiry_duplicate_conflict' })
    expect(first.state.threads).toHaveLength(1)
    expect(first.state.messages).toHaveLength(1)
  })

  it('rate limits public submits by abuse bucket without creating extra inquiry rows', () => {
    const first = inquiries.submitInquiry(
      sourceState({
        operatorControls: { ...inquiries.defaultInquiryOperatorControls, abuseMaxSubmissionsPerWindow: 1 },
      }),
      submitCommand('rate-limit-first', {
        abuseBucketKey: 'ip:shared-rate-limit',
        body: 'First allowed inquiry in this source-owned abuse bucket.',
      })
    )
    expect(first.kind).toBe('ok')
    if (first.kind !== 'ok') throw new Error(first.code)
    expect(first.state.abuseRateLimitBuckets).toMatchObject([
      { scope: 'inquiry_submit', key: 'ip:shared-rate-limit', count: 1, state: 'open' },
    ])

    const second = inquiries.submitInquiry(first.state, submitCommand('rate-limit-second', {
      abuseBucketKey: 'ip:shared-rate-limit',
      body: 'Second inquiry should be blocked by the same abuse bucket.',
    }))
    expect(second).toMatchObject({ kind: 'error', code: 'inquiry_rate_limited', retryable: true })
    if (second.kind !== 'error') throw new Error(second.code)
    expect(second.state?.threads).toHaveLength(1)
    expect(second.state?.messages).toHaveLength(1)
    expect(second.state?.notifications).toHaveLength(1)
    expect(second.state?.abuseRateLimitBuckets).toMatchObject([
      { scope: 'inquiry_submit', key: 'ip:shared-rate-limit', count: 1, state: 'limited' },
    ])
  })

  it('fails closed for wrong owners and stale owner state changes', () => {
    const submit = inquiries.submitInquiry(sourceState(), submitCommand('owner-failures'))
    expect(submit.kind).toBe('ok')
    if (submit.kind !== 'ok') throw new Error(submit.code)

    const wrongOwnerRead = inquiries.readOwnerInquiry(submit.state, {
      authority: { ownerId: otherOwnerId },
      threadId: submit.thread.threadId,
    })
    expect(wrongOwnerRead).toMatchObject({ kind: 'error', code: 'inquiry_not_found' })

    const wrongOwnerReply = inquiries.replyToInquiry(submit.state, {
      authority: { ownerId: otherOwnerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('wrong-owner-reply'),
      correlationId: correlationId('wrong-owner-reply'),
      expectedVersion: submit.thread.version,
      now: now + 4,
      body: 'This should not leak cross-owner existence.',
    })
    expect(wrongOwnerReply).toMatchObject({ kind: 'error', code: 'inquiry_not_found' })

    const staleRead = inquiries.markInquiryRead(submit.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('stale-read'),
      correlationId: correlationId('stale-read'),
      expectedVersion: submit.thread.version + 1,
      now: now + 5,
    })
    expect(staleRead).toMatchObject({ kind: 'error', code: 'inquiry_stale_version' })
  })

  it('replays owner actions before stale gates and rejects disabled or terminal replies', () => {
    const submit = inquiries.submitInquiry(sourceState(), submitCommand('owner-idempotency'))
    expect(submit.kind).toBe('ok')
    if (submit.kind !== 'ok') throw new Error(submit.code)

    const replyCommand = {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('reply-idempotent'),
      correlationId: correlationId('reply-idempotent'),
      expectedVersion: submit.thread.version,
      now: now + 6,
      body: 'A human owner has received this and will follow up through the business contact path.',
      notificationStatus: 'sent' as const,
    }
    const reply = inquiries.replyToInquiry(submit.state, replyCommand)
    expect(reply.kind).toBe('ok')
    if (reply.kind !== 'ok') throw new Error(reply.code)

    const replay = inquiries.replyToInquiry(reply.state, replyCommand)
    expect(replay.kind).toBe('ok')
    if (replay.kind !== 'ok') throw new Error(replay.code)
    expect(replay.code).toBe('inquiry_reply_replayed')
    expect(replay.state.messages).toHaveLength(2)
    expect(replay.message.messageId).toBe(reply.message.messageId)

    const conflict = inquiries.replyToInquiry(reply.state, {
      ...replyCommand,
      body: 'Changed body on the same operation key should be rejected.',
    })
    expect(conflict).toMatchObject({ kind: 'error', code: 'inquiry_duplicate_conflict' })

    const close = inquiries.closeInquiry(reply.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('terminal-close'),
      correlationId: correlationId('terminal-close'),
      expectedVersion: reply.thread.version,
      now: now + 7,
    })
    expect(close.kind).toBe('ok')
    if (close.kind !== 'ok') throw new Error(close.code)

    const terminalReply = inquiries.replyToInquiry(close.state, {
      authority: { ownerId },
      threadId: submit.thread.threadId,
      operationKey: operationKey('terminal-reply'),
      correlationId: correlationId('terminal-reply'),
      expectedVersion: close.thread.version,
      now: now + 8,
      body: 'Closed threads must not accept new owner replies.',
    })
    expect(terminalReply).toMatchObject({ kind: 'error', code: 'inquiry_terminal' })

    const disabledSubmit = inquiries.submitInquiry(
      sourceState({
        operatorControls: { ...inquiries.defaultInquiryOperatorControls, ownerRepliesEnabled: false },
      }),
      submitCommand('owner-disabled')
    )
    expect(disabledSubmit.kind).toBe('ok')
    if (disabledSubmit.kind !== 'ok') throw new Error(disabledSubmit.code)

    const disabledReply = inquiries.replyToInquiry(disabledSubmit.state, {
      authority: { ownerId },
      threadId: disabledSubmit.thread.threadId,
      operationKey: operationKey('disabled-reply'),
      correlationId: correlationId('disabled-reply'),
      expectedVersion: disabledSubmit.thread.version,
      now: now + 9,
      body: 'This reply is blocked by operator controls.',
    })
    expect(disabledReply).toMatchObject({ kind: 'error', code: 'inquiry_owner_replies_disabled' })
  })

  it('rejects unavailable, suppressed, not-ready, and unsafe future-surface submissions', () => {
    const unavailable = inquiries.submitInquiry(sourceState({ businessServices: [{ ...service(), status: 'draft' }] }), submitCommand('unavailable'))
    expect(unavailable).toMatchObject({ kind: 'error', code: 'inquiry_target_unavailable' })

    const suppressed = inquiries.submitInquiry(sourceState({ suppressionRules: [businessSuppression()] }), submitCommand('suppressed'))
    expect(suppressed).toMatchObject({ kind: 'error', code: 'inquiry_target_suppressed' })

    const notReady = inquiries.submitInquiry(sourceState({ serviceCapabilities: [{ ...capability(), status: 'degraded' }] }), submitCommand('not-ready'))
    expect(notReady).toMatchObject({ kind: 'error', code: 'inquiry_target_not_ready' })

    const unsafe = inquiries.submitInquiry(sourceState(), submitCommand('unsafe', {
      unsafeClientFields: { paymentIntentId: 'pi_123' },
    }))
    expect(unsafe).toMatchObject({ kind: 'error', code: 'inquiry_unsafe_future_surface_field', field: 'paymentIntentId' })
  })
})

function submitCommand(key: string, overrides: Partial<SubmitInquiryCommand> = {}): SubmitInquiryCommand {
  return {
    target,
    body: 'Can a human owner contact me about this service?',
    contact: { email: 'customer@example.test' },
    operationKey: operationKey(key),
    correlationId: correlationId(key),
    pseudonymousSessionId: `session:${key}`,
    abuseBucketKey: `ip:${key}`,
    now,
    ...overrides,
  }
}

function sourceState(overrides: Partial<InquirySourceState> = {}): InquirySourceState {
  return inquiries.createEmptyInquirySourceState({
    businesses: [business()],
    businessServices: [service()],
    serviceCapabilities: [capability()],
    capabilityLaunchSupportRecords: [supportRecord()],
    suppressionRules: [],
    ...overrides,
  })
}

function business(): BusinessRecord {
  return {
    businessId,
    ownerId,
    slug: brandNonEmpty('plumbing-demo', 'Slug'),
    name: 'Demo Plumbing',
    normalizedName: 'demo plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicStatus: 'published',
    trustTier: 'contact_confirmed',
    claimStatus: 'published',
    sourceHash: stableHash({ businessId: 'business:inquiry' }),
    createdAt: now,
    updatedAt: now,
  }
}

function service(): BusinessServiceRecord {
  return {
    serviceId,
    serviceSlug,
    businessId,
    name: 'Emergency plumbing',
    category: 'Emergency plumbing',
    summary: 'Human triage for urgent plumbing issues.',
    serviceArea: 'Parramatta',
    hoursOrUnknown: 'Hours supplied by owner',
    status: 'published',
    sortOrder: 1,
    sourceHash: stableHash({ serviceId: 'service:emergency-plumbing' }),
    createdAt: now,
    updatedAt: now,
  }
}

function capability(): ServiceCapabilityRecord {
  return {
    businessId,
    serviceId,
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
    createdAt: now,
    updatedAt: now,
  }
}

function supportRecord(overrides: Partial<CapabilityLaunchSupportRecord> = {}): CapabilityLaunchSupportRecord {
  return {
    capability: 'human_inquiry_owner_inbox',
    primaryOwnerRef: 'owner:inquiry',
    primaryAdminOperatorRef: 'admin:phase2-primary',
    backupOwnerRef: 'owner:phase2-backup',
    backupAdminOperatorRef: 'admin:phase2-backup',
    supportedStage: 'manual_support',
    supportedChannels: ['public_inquiry', 'owner_inbox', 'email_notification', 'provider_readback', 'operator_readback'],
    capacityThreshold: {
      maxOpenThreads: 10,
      maxFailedNotifications: 2,
    },
    backlogAgeThresholdMs: 7 * 24 * 60 * 60 * 1_000,
    phaseIncidentCounts: {
      retryExhausted: 0,
      noRepair: 0,
      unresolvedDeliveryFailures: 0,
      abuseBlocked: 0,
      privacyDeletes: 0,
    },
    supportEscalationPath: 'Phase 2 owner inbox support queue.',
    claimDisablePath: 'Set inquiries_enabled false or remove inquiry_available from the service capability.',
    perChannelKillRules: [
      {
        channel: 'public_claim',
        trigger: 'Capacity, backlog, retry-exhausted, or no-repair thresholds are exceeded.',
        action: 'Hide positive inquiry availability while preserving owner readback.',
      },
      {
        channel: 'email_notification',
        trigger: 'Provider dispatch or readback fails.',
        action: 'Hold delivery status separately from the saved message.',
      },
    ],
    evidenceRefs: ['tests/unit/inquiries/inquiry-flow.test.ts', '.planning/phases/02-human-inquiry-owner-inbox/02-EXECUTION-EVIDENCE.md'],
    sourceHash: stableHash({ supportRecord: 'human_inquiry_owner_inbox' }),
    correlationId: correlationId('support-record'),
    lastReviewedAt: now + 1_000,
    ...overrides,
  }
}

function businessSuppression(): SuppressionRuleRecord {
  return {
    targetType: 'business',
    targetRef: businessId,
    status: 'active',
    reasonCode: 'privacy_review',
    evidenceRefs: ['evidence:suppression'],
    createdByAdminRef: 'admin:1',
    createdAt: now,
    beforePublicStatus: 'published',
    beforeClaimStatus: 'published',
  }
}

function operationKey(value: string) {
  return brandNonEmpty(`inquiry:${value}`, 'OperationKey')
}

function correlationId(value: string) {
  return brandNonEmpty(`correlation:inquiry:${value}`, 'CorrelationId')
}
