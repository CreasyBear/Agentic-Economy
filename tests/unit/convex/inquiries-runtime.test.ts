import { describe, expect, it } from 'vitest'
import type { UserIdentity } from 'convex/server'

import {
  closeCurrentOwnerInquiry,
  deleteCurrentOwnerInquiryPrivateContent,
  listCurrentOwnerInbox,
  markCurrentOwnerInquiryRead,
  readCurrentOwnerInquiryDeliveryReadback,
  readCurrentOwnerInquiry,
  readCurrentOwnerInquiryPrivacyTombstone,
  replyToCurrentOwnerInquiry,
  requestCurrentOwnerInquiryExport,
  submitPublicInquiry,
} from '../../../convex/inquiries'
import {
  withSourceWrite,
  withoutSourceWrite,
} from '../../helpers/source-write-admission'
import type { SourceWriteAdmission } from '@/modules/security/source-write-admission'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type EqFilter = { field: string; value: unknown }

type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
}

type Query = {
  withIndex: (indexName: string, callback: (query: IndexBuilder) => IndexBuilder) => Query
  collect: () => Promise<Row[]>
  unique: () => Promise<Row | null>
  first: () => Promise<Row | null>
}

type Db = {
  query: (tableName: string) => Query
  get: (id: string) => Promise<Row | null>
  insert: (tableName: string, value: Record<string, unknown>) => Promise<string>
  patch: (id: string, value: Record<string, unknown>) => Promise<void>
}

type AuthCtx = {
  db: Db
  auth: { getUserIdentity: () => Promise<UserIdentity | null> }
}

type SubmitArgs = {
  target: {
    businessId: string
    serviceId: string
    capabilityKind: 'phone_inquiry'
  }
  body: string
  contact: { name?: string; email?: string; phone?: string }
  pseudonymousSessionId: string
  abuseBucketKey: string
  operationKey: string
  correlationId: string
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  sourceWrite?: SourceWriteAdmission
}

type SubmitOk = {
  kind: 'ok'
  code: 'inquiry_submitted' | 'inquiry_replayed'
  thread: { threadId: string }
}

const submitHandler = (submitPublicInquiry as unknown as { _handler: (ctx: AuthCtx, args: SubmitArgs) => Promise<unknown> })._handler
const listHandler = (listCurrentOwnerInbox as unknown as { _handler: (ctx: AuthCtx, args: Record<string, never>) => Promise<unknown> })._handler
const readHandler = (readCurrentOwnerInquiry as unknown as { _handler: (ctx: AuthCtx, args: { threadId: string }) => Promise<unknown> })._handler
const deliveryHandler = (readCurrentOwnerInquiryDeliveryReadback as unknown as {
  _handler: (ctx: AuthCtx, args: { threadId: string }) => Promise<unknown>
})._handler
const exportHandler = (requestCurrentOwnerInquiryExport as unknown as {
  _handler: (ctx: AuthCtx, args: { threadId: string }) => Promise<unknown>
})._handler
const markReadHandler = (markCurrentOwnerInquiryRead as unknown as {
  _handler: (ctx: AuthCtx, args: OwnerVersionedArgs) => Promise<unknown>
})._handler
const replyHandler = (replyToCurrentOwnerInquiry as unknown as {
  _handler: (ctx: AuthCtx, args: OwnerReplyArgs) => Promise<unknown>
})._handler
const closeHandler = (closeCurrentOwnerInquiry as unknown as {
  _handler: (ctx: AuthCtx, args: OwnerVersionedArgs) => Promise<unknown>
})._handler
const deletePrivateHandler = (deleteCurrentOwnerInquiryPrivateContent as unknown as {
  _handler: (ctx: AuthCtx, args: OwnerPrivacyDeleteArgs) => Promise<unknown>
})._handler
const tombstoneHandler = (readCurrentOwnerInquiryPrivacyTombstone as unknown as {
  _handler: (ctx: AuthCtx, args: { threadId: string }) => Promise<unknown>
})._handler

describe('Convex inquiry runtime bridge', () => {
  it('persists public inquiry effects and exposes only source-owned owner readbacks', async () => {
    const db = seededInquiryDb()

    const submitted = requireSubmitOk(await submitHandler(authCtx(db, null), submitArgs('first')))

    expect(submitted.code).toBe('inquiry_submitted')
    expect(db.dump('inquiryThreads')).toHaveLength(1)
    expect(db.dump('inquiryMessages')).toHaveLength(1)
    expect(db.dump('inquiryNotifications')).toHaveLength(1)
    expect(db.dump('notificationDispatches')).toHaveLength(2)
    expect(db.dump('inquiryNotifications')[0]).toMatchObject({
      dispatchIds: expect.arrayContaining([expect.any(String), expect.any(String)]),
      providerFamilies: expect.arrayContaining(['resend', 'novu']),
      dispatchStatuses: expect.arrayContaining(['queued']),
    })
    expect(db.dump('operationKeys')).toHaveLength(3)
    expect(db.dump('operationKeys').map((operation) => operation.operationName)).toEqual(
      expect.arrayContaining(['submitInquiry', 'enqueueInquiryNotification'])
    )
    expect(db.dump('auditEvents').map((event) => event.eventType)).toEqual(
      expect.arrayContaining(['inquiry.submitted', 'notification.queued'])
    )
    expect(db.dump('funnelEvents').map((event) => event.eventType)).toEqual(
      expect.arrayContaining(['inquiry_submitted', 'notification_queued'])
    )
    expect(JSON.stringify([db.dump('auditEvents'), db.dump('funnelEvents'), db.dump('inquiryNotifications')])).not.toContain(
      'sam.customer@example.test'
    )
    expect(JSON.stringify([db.dump('notificationDispatches'), db.dump('auditEvents')])).not.toContain('Pipe burst under the sink')

    const replay = requireSubmitOk(await submitHandler(authCtx(db, null), submitArgs('first')))
    expect(replay.code).toBe('inquiry_replayed')
    expect(replay.thread.threadId).toBe(submitted.thread.threadId)
    expect(db.dump('inquiryThreads')).toHaveLength(1)
    expect(db.dump('inquiryMessages')).toHaveLength(1)
    expect(db.dump('inquiryNotifications')).toHaveLength(1)
    expect(db.dump('notificationDispatches')).toHaveLength(2)
    expect(db.dump('operationKeys')).toHaveLength(3)

    const unauthenticatedInbox = await listHandler(authCtx(db, null), {})
    expect(unauthenticatedInbox).toMatchObject({ kind: 'denied', reason: 'missing_auth' })

    const ownerInbox = await listHandler(authCtx(db, sam()), {})
    expect(ownerInbox).toMatchObject({
      kind: 'allowed',
      inbox: {
        buckets: { unread: 1, needs_reply: 0, resolved: 0 },
        inquiries: [expect.objectContaining({ threadId: submitted.thread.threadId, notificationStatus: 'queued' })],
      },
    })

    const wrongOwner = await readHandler(authCtx(db, alex()), { threadId: submitted.thread.threadId })
    expect(wrongOwner).toMatchObject({ kind: 'error', code: 'inquiry_not_found' })

    const detail = await readHandler(authCtx(db, sam()), { threadId: submitted.thread.threadId })
    expect(detail).toMatchObject({
      kind: 'ok',
      readback: {
        messages: [expect.objectContaining({ body: 'Pipe burst under the sink. Please ask the owner to contact me.' })],
      },
    })
  })

  it('lists equal-updated owner inquiries by thread id and denies no-longer-present owner readbacks without leaking rows', async () => {
    const db = seededInquiryDb()
    const equalUpdatedAt = 1_900_000_123_000
    const insertionOrder = ['thread:z-last', 'thread:a-first', 'thread:m-middle']

    seedOwnerInquiryRow(db, {
      threadId: 'thread:z-last',
      body: 'Equal timestamp Z customer message.',
      createdAt: equalUpdatedAt - 30,
      updatedAt: equalUpdatedAt,
    })
    seedOwnerInquiryRow(db, {
      threadId: 'thread:a-first',
      body: 'Equal timestamp A customer message.',
      createdAt: equalUpdatedAt - 20,
      updatedAt: equalUpdatedAt,
    })
    seedOwnerInquiryRow(db, {
      threadId: 'thread:m-middle',
      body: 'Equal timestamp M customer message.',
      createdAt: equalUpdatedAt - 10,
      updatedAt: equalUpdatedAt,
    })

    const ownerInbox = await listHandler(authCtx(db, sam()), {})
    expect(ownerInbox).toMatchObject({
      kind: 'allowed',
      inbox: {
        empty: false,
        buckets: { unread: 3, needs_reply: 0, resolved: 0 },
        inquiries: [
          expect.objectContaining({ threadId: 'thread:a-first', updatedAt: equalUpdatedAt }),
          expect.objectContaining({ threadId: 'thread:m-middle', updatedAt: equalUpdatedAt }),
          expect.objectContaining({ threadId: 'thread:z-last', updatedAt: equalUpdatedAt }),
        ],
      },
    })

    const allowedInbox = ownerInbox as {
      kind: 'allowed'
      inbox: { inquiries: Array<{ threadId: string; updatedAt: number }> }
    }
    expect(allowedInbox.inbox.inquiries.map((inquiry) => inquiry.threadId)).toEqual([
      'thread:a-first',
      'thread:m-middle',
      'thread:z-last',
    ])
    expect(allowedInbox.inbox.inquiries.map((inquiry) => inquiry.threadId)).not.toEqual(insertionOrder)

    const noLongerPresentInbox = await listHandler(authCtx(db, noLongerPresentOwner()), {})
    expect(noLongerPresentInbox).toMatchObject({ kind: 'denied', reason: 'owner_not_found' })

    const noLongerPresentDetail = await readHandler(authCtx(db, noLongerPresentOwner()), { threadId: 'thread:a-first' })
    expect(noLongerPresentDetail).toMatchObject({ kind: 'error', code: 'owner_not_found' })

    const deniedReadbacks = JSON.stringify([noLongerPresentInbox, noLongerPresentDetail])
    expect(deniedReadbacks).not.toContain('thread:a-first')
    expect(deniedReadbacks).not.toContain('Equal timestamp A customer message.')
    expect(deniedReadbacks).not.toContain('owners:1')
  })

  it('persists owner read, reply, close, replay, stale, terminal, and wrong-owner outcomes', async () => {
    const db = seededInquiryDb()
    const submitted = requireSubmitOk(await submitHandler(authCtx(db, null), submitArgs('owner-actions')))

    const wrongOwnerRead = await markReadHandler(authCtx(db, alex()), ownerVersionedArgs(submitted.thread.threadId, 1, 'wrong-read'))
    expect(wrongOwnerRead).toMatchObject({ kind: 'error', code: 'inquiry_not_found' })

    const staleRead = await markReadHandler(authCtx(db, sam()), ownerVersionedArgs(submitted.thread.threadId, 2, 'stale-read'))
    expect(staleRead).toMatchObject({ kind: 'error', code: 'inquiry_stale_version' })

    const read = await markReadHandler(authCtx(db, sam()), ownerVersionedArgs(submitted.thread.threadId, 1, 'read'))
    expect(read).toMatchObject({ kind: 'ok', code: 'inquiry_read_marked', thread: { status: 'read', version: 2 } })
    expect(db.dump('inquiryThreads')[0]).toMatchObject({ status: 'read', version: 2 })

    const readReplay = await markReadHandler(authCtx(db, sam()), ownerVersionedArgs(submitted.thread.threadId, 1, 'read'))
    expect(readReplay).toMatchObject({ kind: 'ok', code: 'inquiry_read_replayed', thread: { status: 'read', version: 2 } })
    expect(db.dump('auditEvents').filter((event) => event.eventType === 'inquiry.read_marked')).toHaveLength(1)

    const reply = await replyHandler(authCtx(db, sam()), {
      ...ownerVersionedArgs(submitted.thread.threadId, 2, 'reply'),
      body: 'Thanks, a human owner has received this and will follow up.',
    })
    expect(reply).toMatchObject({
      kind: 'ok',
      code: 'inquiry_replied',
      thread: { status: 'replied', version: 3 },
      message: { sender: 'owner' },
      notification: { recipientRole: 'customer', status: 'queued' },
    })
    expect(db.dump('inquiryMessages')).toHaveLength(2)
    expect(db.dump('inquiryNotifications')).toHaveLength(2)
    expect(db.dump('notificationDispatches')).toHaveLength(4)
    expect(db.dump('inquiryNotifications').at(1)).toMatchObject({
      providerFamilies: expect.arrayContaining(['resend', 'novu']),
      dispatchStatuses: expect.arrayContaining(['queued']),
    })

    const replyReplay = await replyHandler(authCtx(db, sam()), {
      ...ownerVersionedArgs(submitted.thread.threadId, 2, 'reply'),
      body: 'Thanks, a human owner has received this and will follow up.',
    })
    expect(replyReplay).toMatchObject({ kind: 'ok', code: 'inquiry_reply_replayed', thread: { status: 'replied', version: 3 } })
    expect(db.dump('inquiryMessages')).toHaveLength(2)
    expect(db.dump('notificationDispatches')).toHaveLength(4)

    const replyConflict = await replyHandler(authCtx(db, sam()), {
      ...ownerVersionedArgs(submitted.thread.threadId, 3, 'reply'),
      body: 'Changed body with the same operation key.',
    })
    expect(replyConflict).toMatchObject({ kind: 'error', code: 'inquiry_duplicate_conflict' })

    const close = await closeHandler(authCtx(db, sam()), ownerVersionedArgs(submitted.thread.threadId, 3, 'close'))
    expect(close).toMatchObject({ kind: 'ok', code: 'inquiry_closed', thread: { status: 'closed', version: 4 } })

    const closeReplay = await closeHandler(authCtx(db, sam()), ownerVersionedArgs(submitted.thread.threadId, 3, 'close'))
    expect(closeReplay).toMatchObject({ kind: 'ok', code: 'inquiry_close_replayed', thread: { status: 'closed', version: 4 } })

    const terminalReply = await replyHandler(authCtx(db, sam()), {
      ...ownerVersionedArgs(submitted.thread.threadId, 4, 'terminal-reply'),
      body: 'Closed threads must not accept this.',
    })
    expect(terminalReply).toMatchObject({ kind: 'error', code: 'inquiry_terminal' })

    expect(db.dump('operationKeys').map((operation) => operation.operationName)).toEqual(
      expect.arrayContaining(['submitInquiry', 'markInquiryRead', 'replyToInquiry', 'closeInquiry'])
    )
    expect(db.dump('operationKeys').filter((operation) => operation.key === 'inquiry:reply')).toHaveLength(1)
  })

  it('rejects missing CSRF evidence before Phase 2 inquiry side effects', async () => {
    const db = seededInquiryDb()
    const rejectedSubmit = await submitHandler(authCtx(db, null), withoutCsrf(submitArgs('missing-csrf')))
    expect(rejectedSubmit).toMatchObject({ kind: 'error', code: 'inquiry_csrf_rejected' })
    expect(db.dump('inquiryThreads')).toHaveLength(0)
    expect(db.dump('notificationDispatches')).toHaveLength(0)
    expect(db.dump('operationKeys')).toHaveLength(0)
    expect(db.dump('auditEvents')).toHaveLength(0)
    expect(db.dump('funnelEvents')).toHaveLength(0)

    const submitted = requireSubmitOk(await submitHandler(authCtx(db, null), submitArgs('csrf-seed')))

    await expect(
      markReadHandler(authCtx(db, sam()), withoutCsrf(ownerVersionedArgs(submitted.thread.threadId, 1, 'csrf-read')))
    ).resolves.toMatchObject({ kind: 'error', code: 'inquiry_csrf_rejected' })
    await expect(
      replyHandler(authCtx(db, sam()), {
        ...withoutCsrf(ownerVersionedArgs(submitted.thread.threadId, 1, 'csrf-reply')),
        body: 'This reply must not be written.',
      })
    ).resolves.toMatchObject({ kind: 'error', code: 'inquiry_csrf_rejected' })
    await expect(
      closeHandler(authCtx(db, sam()), withoutCsrf(ownerVersionedArgs(submitted.thread.threadId, 1, 'csrf-close')))
    ).resolves.toMatchObject({ kind: 'error', code: 'inquiry_csrf_rejected' })

    expect(db.dump('inquiryThreads')).toHaveLength(1)
    expect(db.dump('inquiryThreads')[0]).toMatchObject({ status: 'unread', version: 1 })
    expect(db.dump('inquiryMessages')).toHaveLength(1)
    expect(db.dump('inquiryNotifications')).toHaveLength(1)
    expect(db.dump('notificationDispatches')).toHaveLength(2)
  })

  it('rejects same-site Origin without source admission for Phase 2 inquiry mutations', async () => {
    const db = seededInquiryDb()
    const rejectedSubmit = await submitHandler(authCtx(db, null), withOriginOnly(submitArgs('origin-submit')))
    expect(rejectedSubmit).toMatchObject({ kind: 'error', code: 'inquiry_csrf_rejected' })

    const submitted = requireSubmitOk(await submitHandler(authCtx(db, null), submitArgs('origin-seed')))

    const read = await markReadHandler(authCtx(db, sam()), withOriginOnly(ownerVersionedArgs(submitted.thread.threadId, 1, 'origin-read')))
    expect(read).toMatchObject({ kind: 'error', code: 'inquiry_csrf_rejected' })

    const reply = await replyHandler(authCtx(db, sam()), {
      ...withOriginOnly(ownerVersionedArgs(submitted.thread.threadId, 2, 'origin-reply')),
      body: 'Same-site Origin admitted owner reply.',
    })
    expect(reply).toMatchObject({ kind: 'error', code: 'inquiry_csrf_rejected' })

    const close = await closeHandler(authCtx(db, sam()), withOriginOnly(ownerVersionedArgs(submitted.thread.threadId, 3, 'origin-close')))
    expect(close).toMatchObject({ kind: 'error', code: 'inquiry_csrf_rejected' })
    expect(db.dump('inquiryThreads')[0]).toMatchObject({ status: 'unread', version: 1 })
  })

  it('persists owner delivery readback, export, privacy delete, tombstone, replay, and conflict outcomes', async () => {
    const db = seededInquiryDb()
    const submitted = requireSubmitOk(await submitHandler(authCtx(db, null), submitArgs('privacy')))

    const delivery = await deliveryHandler(authCtx(db, sam()), { threadId: submitted.thread.threadId })
    expect(delivery).toMatchObject({
      kind: 'ok',
      readback: { notifications: [expect.objectContaining({ status: 'queued', recipientRole: 'owner' })] },
    })

    const reply = await replyHandler(authCtx(db, sam()), {
      ...ownerVersionedArgs(submitted.thread.threadId, 1, 'privacy-reply'),
      body: 'Private owner bridge reply that should be deleted.',
    })
    expect(reply).toMatchObject({ kind: 'ok', code: 'inquiry_replied' })

    const ownerExport = await exportHandler(authCtx(db, sam()), { threadId: submitted.thread.threadId })
    expect(ownerExport).toMatchObject({
      kind: 'ok',
      exportData: {
        messages: [
          expect.objectContaining({ body: 'Pipe burst under the sink. Please ask the owner to contact me.' }),
          expect.objectContaining({ body: 'Private owner bridge reply that should be deleted.' }),
        ],
      },
    })

    const wrongOwnerExport = await exportHandler(authCtx(db, alex()), { threadId: submitted.thread.threadId })
    expect(wrongOwnerExport).toMatchObject({ kind: 'error', code: 'inquiry_not_found' })

    const deleted = await deletePrivateHandler(authCtx(db, sam()), ownerPrivacyDeleteArgs(submitted.thread.threadId))
    expect(deleted).toMatchObject({
      kind: 'ok',
      code: 'inquiry_private_content_deleted',
      tombstone: { status: 'applied', reasonCode: 'privacy_delete_requested' },
    })
    expect(db.dump('inquiryPrivacyTombstones')).toHaveLength(1)
    expect(db.dump('inquiryMessages').map((message) => message.body)).toEqual(['[private content deleted]', '[private content deleted]'])
    expect(db.dump('inquiryMessages').every((message) => typeof message.privateDeletedAt === 'number')).toBe(true)
    expect(JSON.stringify(db.dump('inquiryMessages'))).not.toContain('Pipe burst under the sink')
    expect(JSON.stringify(db.dump('inquiryMessages'))).not.toContain('Private owner bridge reply')

    const detailAfterDelete = await readHandler(authCtx(db, sam()), { threadId: submitted.thread.threadId })
    expect(detailAfterDelete).toMatchObject({
      kind: 'ok',
      readback: {
        messages: [
          expect.objectContaining({ body: '[private content deleted]' }),
          expect.objectContaining({ body: '[private content deleted]' }),
        ],
      },
    })
    expect(JSON.stringify(detailAfterDelete)).not.toContain('Pipe burst under the sink')

    const exportAfterDelete = await exportHandler(authCtx(db, sam()), { threadId: submitted.thread.threadId })
    expect(exportAfterDelete).toMatchObject({
      kind: 'ok',
      exportData: {
        tombstones: [expect.objectContaining({ reasonCode: 'privacy_delete_requested' })],
        auditRefs: expect.arrayContaining([expect.objectContaining({ eventType: 'inquiry.private_content_deleted' })]),
      },
    })
    expect(JSON.stringify(exportAfterDelete)).not.toContain('Private owner bridge reply')

    const tombstones = await tombstoneHandler(authCtx(db, sam()), { threadId: submitted.thread.threadId })
    expect(tombstones).toMatchObject({
      kind: 'ok',
      tombstones: [expect.objectContaining({ status: 'applied', operationKey: 'inquiry:privacy-delete' })],
    })

    const replay = await deletePrivateHandler(authCtx(db, sam()), ownerPrivacyDeleteArgs(submitted.thread.threadId))
    expect(replay).toMatchObject({ kind: 'ok', code: 'inquiry_private_content_delete_replayed' })
    expect(db.dump('inquiryPrivacyTombstones')).toHaveLength(1)

    const conflict = await deletePrivateHandler(
      authCtx(db, sam()),
      ownerPrivacyDeleteArgs(submitted.thread.threadId, 'changed_reason')
    )
    expect(conflict).toMatchObject({ kind: 'error', code: 'inquiry_duplicate_conflict' })

    expect(db.dump('operationKeys').map((operation) => operation.operationName)).toContain('deleteInquiryPrivateContent')
  })
})

type OwnerVersionedArgs = {
  threadId: string
  expectedVersion: number
  operationKey: string
  correlationId: string
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  sourceWrite?: SourceWriteAdmission
}

type OwnerReplyArgs = OwnerVersionedArgs & {
  body: string
}

type OwnerPrivacyDeleteArgs = {
  threadId: string
  reasonCode: string
  operationKey: string
  correlationId: string
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  sourceWrite?: SourceWriteAdmission
}

class FakeIndexBuilder implements IndexBuilder {
  readonly filters: EqFilter[] = []

  eq(field: string, value: unknown): IndexBuilder {
    this.filters.push({ field, value })
    return this
  }
}

class FakeQuery implements Query {
  constructor(
    private readonly rows: readonly Row[],
    private readonly filters: readonly EqFilter[] = []
  ) {}

  withIndex(_indexName: string, callback: (query: IndexBuilder) => IndexBuilder): Query {
    const builder = new FakeIndexBuilder()
    callback(builder)
    return new FakeQuery(this.rows, [...this.filters, ...builder.filters])
  }

  async collect(): Promise<Row[]> {
    return this.rows.filter((row) => this.filters.every((filter) => row[filter.field] === filter.value))
  }

  async unique(): Promise<Row | null> {
    return (await this.collect()).at(0) ?? null
  }

  async first(): Promise<Row | null> {
    return this.unique()
  }
}

class FakeDb implements Db {
  private readonly tables: Record<string, Row[]> = {}
  private sequence = 0

  query(tableName: string): Query {
    return new FakeQuery(this.table(tableName))
  }

  async get(id: string): Promise<Row | null> {
    return this.allRows().find((row) => row._id === id) ?? null
  }

  async insert(tableName: string, value: Record<string, unknown>): Promise<string> {
    this.sequence += 1
    const id = `${tableName}:${this.sequence}`
    this.table(tableName).push({ _id: id, _creationTime: this.sequence, ...value })
    return id
  }

  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    const row = await this.get(id)
    if (row === null) {
      throw new Error(`Missing row ${id}`)
    }
    Object.assign(row, value)
  }

  seed(tableName: string, row: Row): void {
    this.table(tableName).push(row)
  }

  dump(tableName: string): Row[] {
    return [...this.table(tableName)]
  }

  private table(tableName: string): Row[] {
    this.tables[tableName] ??= []
    return this.tables[tableName]
  }

  private allRows(): Row[] {
    return Object.values(this.tables).flat()
  }
}

function seededInquiryDb(): FakeDb {
  const db = new FakeDb()
  db.seed('owners', {
    _id: 'owners:1',
    _creationTime: 1,
    clerkUserId: 'user_sam',
    displayName: 'Sam Owner',
    emailHash: 'email:user_sam',
    createdAt: 1,
    updatedAt: 1,
  })
  db.seed('owners', {
    _id: 'owners:2',
    _creationTime: 2,
    clerkUserId: 'user_alex',
    displayName: 'Alex Owner',
    emailHash: 'email:user_alex',
    createdAt: 2,
    updatedAt: 2,
  })
  db.seed('businesses', {
    _id: 'businesses:1',
    _creationTime: 3,
    ownerId: 'owners:1',
    slug: 'sam-plumbing',
    name: 'Sam Plumbing',
    normalizedName: 'sam plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicStatus: 'published',
    trustTier: 'claimed',
    claimStatus: 'published',
    sourceHash: 'source:business:sam',
    createdAt: 3,
    updatedAt: 3,
  })
  db.seed('businessServices', {
    _id: 'businessServices:1',
    _creationTime: 4,
    businessId: 'businesses:1',
    serviceSlug: 'emergency-pipe-repair',
    name: 'Emergency pipe repair',
    category: 'Emergency plumbing',
    summary: 'Burst pipe triage and repair.',
    serviceArea: 'Parramatta and nearby suburbs',
    hoursOrUnknown: 'Owner supplied hours',
    status: 'published',
    sortOrder: 0,
    sourceHash: 'source:service:sam',
    createdAt: 4,
    updatedAt: 4,
  })
  db.seed('serviceCapabilities', {
    _id: 'serviceCapabilities:1',
    _creationTime: 5,
    businessId: 'businesses:1',
    serviceId: 'businessServices:1',
    kind: 'phone_inquiry',
    status: 'available',
    firstRequestMode: 'inquiry_available',
    publicDisclosure: 'Use the source-owned inquiry form for a first contact.',
    publicChannel: 'public_business_contact',
    callable: false,
    paymentRequired: false,
    sourceHash: 'source:capability:sam',
    createdAt: 5,
    updatedAt: 5,
  })
  db.seed('capabilityLaunchSupportRecords', {
    _id: 'capabilityLaunchSupportRecords:1',
    _creationTime: 6,
    supportRecordId: 'support:phase2:human-inquiry-owner-inbox',
    businessId: 'businesses:1',
    capability: 'human_inquiry_owner_inbox',
    status: 'open',
    reason: 'phase2_human_inquiry_support_ready',
    evidenceRefs: ['tests/unit/convex/inquiries-runtime.test.ts'],
    primaryOwnerRef: 'owners:1',
    primaryAdminOperatorRef: 'admin:phase2-primary',
    backupOwnerRef: 'owners:2',
    backupAdminOperatorRef: 'admin:phase2-backup',
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
    supportEscalationPath: 'Phase 2 owner inbox support queue.',
    claimDisablePath: 'Set inquiries_enabled false or remove inquiry_available from the service capability.',
    perChannelKillRulesJson: JSON.stringify([
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
    ]),
    sourceHash: 'source:support:phase2-human-inquiry',
    correlationId: 'correlation:phase2-support-record',
    lastReviewedAt: 1_900_000_000_000,
    operatorNextAction: 'watch owner inbox and notification delivery readback',
    createdAt: 6,
    updatedAt: 6,
  })
  return db
}

function seedOwnerInquiryRow(
  db: FakeDb,
  input: {
    threadId: string
    body: string
    createdAt: number
    updatedAt: number
  }
): void {
  const messageId = `${input.threadId}:message:first`
  const notificationId = `${input.threadId}:notification:owner`

  db.seed('inquiryThreads', {
    _id: `inquiryThreads:${input.threadId}`,
    _creationTime: input.createdAt,
    threadId: input.threadId,
    businessId: 'businesses:1',
    ownerId: 'owners:1',
    serviceId: 'businessServices:1',
    capabilityKind: 'phone_inquiry',
    status: 'unread',
    firstMessageId: messageId,
    sourceHash: `source:${input.threadId}`,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    version: 1,
  })
  db.seed('inquiryMessages', {
    _id: `inquiryMessages:${messageId}`,
    _creationTime: input.createdAt,
    messageId,
    threadId: input.threadId,
    sender: 'customer',
    body: input.body,
    bodyHash: `hash:${messageId}`,
    contactHash: `contact:${messageId}`,
    createdAt: input.createdAt,
  })
  db.seed('inquiryNotifications', {
    _id: `inquiryNotifications:${notificationId}`,
    _creationTime: input.createdAt,
    notificationId,
    threadId: input.threadId,
    messageId,
    recipientRole: 'owner',
    status: 'queued',
    dispatchBindingsJson: '[]',
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  })
}

function submitArgs(key: string, overrides: Partial<SubmitArgs> = {}): SubmitArgs {
  const operationKey = `inquiry:${key}`
  const correlationId = `correlation:${key}`
  return withSourceWrite('public_inquiry', {
    target: {
      businessId: 'businesses:1',
      serviceId: 'businessServices:1',
      capabilityKind: 'phone_inquiry',
    },
    body: 'Pipe burst under the sink. Please ask the owner to contact me.',
    contact: { name: 'Sam Customer', email: 'sam.customer@example.test' },
    pseudonymousSessionId: `session:${key}`,
    abuseBucketKey: 'ip:127.0.0.1',
    csrfToken: 'csrf-inquiry',
    csrfCookie: 'csrf-inquiry',
    operationKey,
    correlationId,
    ...overrides,
  })
}

function ownerVersionedArgs(threadId: string, expectedVersion: number, key: string, overrides: Partial<OwnerVersionedArgs> = {}): OwnerVersionedArgs {
  const operationKey = `inquiry:${key}`
  const correlationId = `correlation:${key}`
  return withSourceWrite('owner_inquiry', {
    threadId,
    expectedVersion,
    csrfToken: 'csrf-inquiry',
    csrfCookie: 'csrf-inquiry',
    operationKey,
    correlationId,
    ...overrides,
  })
}

function ownerPrivacyDeleteArgs(
  threadId: string,
  reasonCode = 'privacy_delete_requested'
): OwnerPrivacyDeleteArgs {
  return withSourceWrite('owner_inquiry', {
    threadId,
    reasonCode,
    csrfToken: 'csrf-inquiry',
    csrfCookie: 'csrf-inquiry',
    operationKey: 'inquiry:privacy-delete',
    correlationId: 'correlation:privacy-delete',
  })
}

function withoutCsrf<T extends { csrfToken?: string; csrfCookie?: string; origin?: string; sourceWrite?: SourceWriteAdmission }>(args: T): T {
  const { csrfToken: _csrfToken, csrfCookie: _csrfCookie, origin: _origin, ...rest } = withoutSourceWrite(args)
  return rest as T
}

function withOriginOnly<T extends { csrfToken?: string; csrfCookie?: string; origin?: string; sourceWrite?: SourceWriteAdmission }>(args: T): T {
  return {
    ...withoutCsrf(args),
    origin: 'https://ae.example',
  }
}

function requireSubmitOk(value: unknown): SubmitOk {
  expect(value).toMatchObject({ kind: 'ok' })
  return value as SubmitOk
}

function authCtx(db: FakeDb, identity: UserIdentity | null): AuthCtx {
  return {
    db,
    auth: {
      getUserIdentity: async () => identity,
    },
  }
}

function sam(): UserIdentity {
  return {
    tokenIdentifier: 'clerk|user_sam',
    subject: 'user_sam',
    issuer: 'https://clerk.example.test',
    name: 'Sam Owner',
    email: 'sam@example.test',
  }
}

function alex(): UserIdentity {
  return {
    tokenIdentifier: 'clerk|user_alex',
    subject: 'user_alex',
    issuer: 'https://clerk.example.test',
    name: 'Alex Owner',
    email: 'alex@example.test',
  }
}

function noLongerPresentOwner(): UserIdentity {
  return {
    tokenIdentifier: 'clerk|user_sam_revoked',
    subject: 'user_sam_revoked',
    issuer: 'https://clerk.example.test',
    name: 'Sam Revoked',
    email: 'sam.revoked@example.test',
  }
}
