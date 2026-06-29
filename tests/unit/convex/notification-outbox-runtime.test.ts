import type { UserIdentity } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { stableHash } from '@/modules/common/stable-hash'
import {
  dispatchNotificationOutbox,
  enqueueInquiryNotificationDispatch,
  ingestNotificationWebhookEvent,
  markNotificationDispatchNoRepairAsOperator,
  readCurrentOwnerNotificationDispatchReadback,
  readNotificationDispatchForSystemSend,
  retryNotificationDispatchAsOperator,
} from '../../../convex/notificationOutbox'

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

type EnqueueArgs = {
  businessId: string
  inquiryThreadId: string
  inquiryMessageId: string
  recipientRole: 'owner' | 'customer'
  providerFamily: 'resend' | 'novu'
  redactedPayloadJson: string
  providerIdempotencyKey?: string
  systemKey: string
  operationKey: string
  correlationId: string
}

type EnqueueOk = {
  kind: 'ok'
  dispatch: { dispatchId: string; status: string }
}

type ProviderResult =
  | {
      kind: 'ok'
      status: 'triggered' | 'sent'
      providerResponseHash: string
      resendMessageId?: string
    }
  | {
      kind: 'error'
      status: 'failed' | 'provider_missing' | 'orchestrator_missing'
      redactedError: string
      retryAfter?: number
      providerResponseHash?: string
    }

const enqueueHandler = (enqueueInquiryNotificationDispatch as unknown as {
  _handler: (ctx: AuthCtx, args: EnqueueArgs) => Promise<unknown>
})._handler
const dispatchHandler = (dispatchNotificationOutbox as unknown as {
  _handler: (ctx: AuthCtx, args: { dispatchId: string; systemKey: string; providerResult?: ProviderResult; operationKey: string; correlationId: string }) => Promise<unknown>
})._handler
const webhookHandler = (ingestNotificationWebhookEvent as unknown as {
  _handler: (ctx: AuthCtx, args: WebhookArgs) => Promise<unknown>
})._handler
const readSystemSendHandler = (readNotificationDispatchForSystemSend as unknown as {
  _handler: (ctx: AuthCtx, args: { dispatchId: string; systemKey: string }) => Promise<unknown>
})._handler
const readHandler = (readCurrentOwnerNotificationDispatchReadback as unknown as {
  _handler: (ctx: AuthCtx, args: { dispatchId: string }) => Promise<unknown>
})._handler
const retryHandler = (retryNotificationDispatchAsOperator as unknown as {
  _handler: (ctx: AuthCtx, args: ReturnType<typeof retryArgs>) => Promise<unknown>
})._handler
const noRepairHandler = (markNotificationDispatchNoRepairAsOperator as unknown as {
  _handler: (ctx: AuthCtx, args: ReturnType<typeof noRepairArgs>) => Promise<unknown>
})._handler

const systemKey = 'test-notification-outbox-secret'
process.env.AE_NOTIFICATION_OUTBOX_SECRET = systemKey

describe('Convex notification outbox runtime bridge', () => {
  it('persists queued dispatches and owner-scoped redacted readbacks', async () => {
    const db = seededNotificationDb()
    const denied = await enqueueHandler(authCtx(db, null), { ...enqueueArgs('denied'), systemKey: 'wrong-key' })
    expect(denied).toMatchObject({ kind: 'error', code: 'notification_system_denied' })

    const queued = requireEnqueueOk(await enqueueHandler(authCtx(db, null), enqueueArgs('first')))

    expect(db.dump('notificationDispatches')).toHaveLength(1)
    expect(db.dump('operationKeys').map((operation) => operation.operationName)).toContain('enqueueInquiryNotification')
    expect(db.dump('auditEvents').map((event) => event.eventType)).toContain('notification.queued')
    expect(db.dump('funnelEvents').map((event) => event.eventType)).toContain('notification_queued')
    expect(db.dump('notificationDispatches')[0]).toMatchObject({
      dispatchId: queued.dispatch.dispatchId,
      businessId: 'businesses:1',
      providerFamily: 'resend',
      status: 'queued',
    })
    expect(JSON.stringify(db.dump('notificationDispatches'))).not.toContain('customer@example.test')
    expect(JSON.stringify(db.dump('notificationDispatches'))).not.toContain('burst pipe raw body')

    const replay = await enqueueHandler(authCtx(db, null), enqueueArgs('first'))
    expect(replay).toMatchObject({ kind: 'ok', code: 'notification_enqueue_replayed' })
    expect(db.dump('notificationDispatches')).toHaveLength(1)

    const deniedSendRead = await readSystemSendHandler(authCtx(db, null), {
      dispatchId: queued.dispatch.dispatchId,
      systemKey: 'wrong-key',
    })
    expect(deniedSendRead).toMatchObject({ kind: 'error', code: 'notification_system_denied' })

    const sendRead = await readSystemSendHandler(authCtx(db, null), {
      dispatchId: queued.dispatch.dispatchId,
      systemKey,
    })
    expect(sendRead).toMatchObject({
      kind: 'ok',
      code: 'notification_dispatch_send_read',
      send: {
        dispatch: { dispatchId: queued.dispatch.dispatchId, providerFamily: 'resend' },
        owner: { ownerId: 'owners:1', clerkUserId: 'user_sam' },
        business: { businessId: 'businesses:1', slug: 'sam-plumbing', name: 'Sam Plumbing' },
      },
    })
    expect(JSON.stringify(sendRead)).not.toContain('sam@example.test')

    const unauthenticated = await readHandler(authCtx(db, null), { dispatchId: queued.dispatch.dispatchId })
    expect(unauthenticated).toMatchObject({ kind: 'error', code: 'missing_auth' })

    const wrongOwner = await readHandler(authCtx(db, alex()), { dispatchId: queued.dispatch.dispatchId })
    expect(wrongOwner).toMatchObject({ kind: 'error', code: 'notification_not_found' })

    const readback = await readHandler(authCtx(db, sam()), { dispatchId: queued.dispatch.dispatchId })
    expect(readback).toMatchObject({
      kind: 'ok',
      readback: {
        ownerCanRepair: false,
        operatorNextAction: 'none',
        dispatch: { status: 'queued', payloadHash: expect.any(String) },
      },
    })
    expect(JSON.stringify(readback)).not.toContain('customer@example.test')
  })

  it('records missing provider attempts without turning delivery into inquiry truth', async () => {
    const db = seededNotificationDb()
    const queued = requireEnqueueOk(await enqueueHandler(authCtx(db, null), enqueueArgs('missing-provider')))

    const missing = await dispatchHandler(authCtx(db, null), {
      dispatchId: queued.dispatch.dispatchId,
      systemKey,
      operationKey: 'notification:dispatch:missing-provider',
      correlationId: 'correlation:notification:missing-provider',
    })

    expect(missing).toMatchObject({
      kind: 'ok',
      code: 'notification_provider_missing',
      dispatch: { status: 'provider_missing', providerMissing: true },
      attempt: { status: 'provider_missing' },
    })
    expect(db.dump('notificationDispatchAttempts')).toHaveLength(1)
    expect(db.dump('operationKeys').map((operation) => operation.operationName)).toEqual(
      expect.arrayContaining(['enqueueInquiryNotification', 'dispatchNotificationOutbox'])
    )
    expect(db.dump('auditEvents').map((event) => event.eventType)).toContain('notification.failed')
    expect(db.dump('funnelEvents').map((event) => event.eventType)).toEqual(expect.arrayContaining(['notification_queued', 'notification_failed']))
    expect(db.dump('inquiryThreads')).toHaveLength(0)

    const readback = await readHandler(authCtx(db, sam()), { dispatchId: queued.dispatch.dispatchId })
    expect(readback).toMatchObject({
      kind: 'ok',
      readback: {
        dispatch: { status: 'provider_missing' },
        attempts: [expect.objectContaining({ status: 'provider_missing' })],
        operatorNextAction: 'retry_available',
      },
    })
  })

  it('records source-owned provider send results supplied by the server bridge', async () => {
    const db = seededNotificationDb()
    const queued = requireEnqueueOk(await enqueueHandler(authCtx(db, null), enqueueArgs('sent-provider-result')))

    const sent = await dispatchHandler(authCtx(db, null), {
      dispatchId: queued.dispatch.dispatchId,
      systemKey,
      providerResult: {
        kind: 'ok',
        status: 'sent',
        providerResponseHash: stableHash({ provider: 'resend', id: 'resend_email_123' }),
        resendMessageId: 'resend_email_123',
      },
      operationKey: 'notification:dispatch:sent-provider-result',
      correlationId: 'correlation:notification:sent-provider-result',
    })

    expect(sent).toMatchObject({
      kind: 'ok',
      code: 'notification_sent',
      dispatch: {
        status: 'sent',
        resendMessageId: 'resend_email_123',
        providerMissing: false,
      },
      attempt: {
        status: 'sent',
        providerResponseHash: expect.any(String),
      },
    })
    expect(db.dump('notificationDispatchAttempts')).toHaveLength(1)
    expect(db.dump('funnelEvents').map((event) => event.eventType)).toContain('notification_delivered')
    expect(JSON.stringify(db.dump('notificationDispatchAttempts'))).not.toContain('owner@example.test')

    const providerBoundWebhook = await webhookHandler(authCtx(db, null), webhookArgs({
      providerEventId: 'svix:provider-bound',
      logicalObjectKey: 'resend_email_123',
      eventType: 'email.delivered',
    }))
    expect(providerBoundWebhook).toMatchObject({
      kind: 'ok',
      code: 'notification_webhook_received',
      dispatch: { dispatchId: queued.dispatch.dispatchId, status: 'delivered' },
    })
  })

  it('persists rejected, held, accepted, and duplicate webhook readbacks', async () => {
    const db = seededNotificationDb()
    const queued = requireEnqueueOk(await enqueueHandler(authCtx(db, null), enqueueArgs('webhook')))

    const rejected = await webhookHandler(authCtx(db, null), webhookArgs({
      providerEventId: 'svix:bad',
      signatureStatus: 'rejected',
      dispatchId: queued.dispatch.dispatchId,
    }))
    expect(rejected).toMatchObject({
      kind: 'ok',
      code: 'notification_webhook_rejected',
      webhookEvent: { status: 'rejected', reason: 'signature_rejected' },
    })
    expect(db.dump('notificationDispatches')[0]).toMatchObject({ status: 'queued' })

    const held = await webhookHandler(authCtx(db, null), webhookArgs({
      providerEventId: 'svix:unbound',
      logicalObjectKey: 'resend:missing',
    }))
    expect(held).toMatchObject({
      kind: 'ok',
      code: 'notification_webhook_held',
      webhookEvent: { status: 'held_for_operator', reason: 'unbound_provider_event' },
    })

    const delivered = await webhookHandler(authCtx(db, null), webhookArgs({
      providerEventId: 'svix:delivered',
      eventType: 'email.delivered',
      dispatchId: queued.dispatch.dispatchId,
    }))
    expect(delivered).toMatchObject({
      kind: 'ok',
      code: 'notification_webhook_received',
      dispatch: { status: 'delivered' },
      webhookEvent: { status: 'accepted' },
    })

    const duplicate = await webhookHandler(authCtx(db, null), webhookArgs({
      providerEventId: 'svix:delivered',
      eventType: 'email.delivered',
      dispatchId: queued.dispatch.dispatchId,
    }))
    expect(duplicate).toMatchObject({
      kind: 'ok',
      code: 'notification_webhook_duplicate',
      webhookEvent: { status: 'duplicate' },
    })
    expect(db.dump('notificationWebhookEvents')).toHaveLength(3)
    expect(db.dump('operationKeys').map((operation) => operation.operationName)).toContain('ingestNotificationWebhook')
    expect(db.dump('auditEvents').map((event) => event.eventType)).toEqual(
      expect.arrayContaining(['notification.webhook_rejected', 'notification.webhook_held', 'notification.webhook_received', 'notification.webhook_duplicate'])
    )
  })

  it('keeps retry and no-repair controls operator-scoped', async () => {
    const db = seededNotificationDb()
    const queued = requireEnqueueOk(await enqueueHandler(authCtx(db, null), enqueueArgs('operator')))
    await dispatchHandler(authCtx(db, null), {
      dispatchId: queued.dispatch.dispatchId,
      systemKey,
      operationKey: 'notification:dispatch:operator',
      correlationId: 'correlation:notification:operator',
    })

    const noAuthRetry = await retryHandler(authCtx(db, null), retryArgs(queued.dispatch.dispatchId, 'no-auth'))
    expect(noAuthRetry).toMatchObject({ kind: 'error', code: 'notification_operator_denied' })

    const supportRetry = await retryHandler(authCtx(db, support()), retryArgs(queued.dispatch.dispatchId, 'support'))
    expect(supportRetry).toMatchObject({
      kind: 'ok',
      code: 'notification_retry_scheduled',
      dispatch: { status: 'retry_scheduled', retryCount: 1 },
    })

    const supportNoRepair = await noRepairHandler(authCtx(db, support()), noRepairArgs(queued.dispatch.dispatchId, 'support'))
    expect(supportNoRepair).toMatchObject({ kind: 'error', code: 'notification_operator_denied' })

    const adminNoRepair = await noRepairHandler(authCtx(db, admin()), noRepairArgs(queued.dispatch.dispatchId, 'admin'))
    expect(adminNoRepair).toMatchObject({
      kind: 'ok',
      code: 'notification_no_repair_marked',
      dispatch: { status: 'no_repair' },
    })
    expect(db.dump('operationKeys').map((operation) => operation.operationName)).toEqual(
      expect.arrayContaining(['retryNotificationDispatch', 'markNotificationNoRepair'])
    )
  })

  it('rejects missing CSRF evidence before operator repair side effects', async () => {
    const db = seededNotificationDb()
    const queued = requireEnqueueOk(await enqueueHandler(authCtx(db, null), enqueueArgs('csrf-operator')))
    await dispatchHandler(authCtx(db, null), {
      dispatchId: queued.dispatch.dispatchId,
      systemKey,
      operationKey: 'notification:dispatch:csrf-operator',
      correlationId: 'correlation:notification:csrf-operator',
    })
    const beforeRetryState = { ...db.dump('notificationDispatches')[0] }

    await expect(
      retryHandler(authCtx(db, support()), withoutCsrf(retryArgs(queued.dispatch.dispatchId, 'missing-csrf')))
    ).resolves.toMatchObject({ kind: 'error', code: 'notification_csrf_rejected' })
    await expect(
      noRepairHandler(authCtx(db, admin()), withoutCsrf(noRepairArgs(queued.dispatch.dispatchId, 'missing-csrf')))
    ).resolves.toMatchObject({ kind: 'error', code: 'notification_csrf_rejected' })

    expect(db.dump('notificationDispatches')[0]).toEqual(beforeRetryState)
    expect(db.dump('operationKeys').map((operation) => operation.operationName)).not.toContain('retryNotificationDispatch')
    expect(db.dump('operationKeys').map((operation) => operation.operationName)).not.toContain('markNotificationNoRepair')
  })

  it('accepts same-site Origin admission for operator repair mutations', async () => {
    const db = seededNotificationDb()
    const queued = requireEnqueueOk(await enqueueHandler(authCtx(db, null), enqueueArgs('origin-operator')))
    await dispatchHandler(authCtx(db, null), {
      dispatchId: queued.dispatch.dispatchId,
      systemKey,
      operationKey: 'notification:dispatch:origin-operator',
      correlationId: 'correlation:notification:origin-operator',
    })
    await expect(
      retryHandler(authCtx(db, support()), withOriginOnly(retryArgs(queued.dispatch.dispatchId, 'origin')))
    ).resolves.toMatchObject({ kind: 'ok', code: 'notification_retry_scheduled' })
    await expect(
      noRepairHandler(authCtx(db, admin()), withOriginOnly(noRepairArgs(queued.dispatch.dispatchId, 'origin')))
    ).resolves.toMatchObject({ kind: 'ok', code: 'notification_no_repair_marked' })
  })
})

type WebhookArgs = {
  providerFamily: 'resend' | 'novu'
  providerEventId: string
  logicalObjectKey: string
  eventType: string
  signatureStatus: 'verified' | 'rejected'
  payloadHash: string
  redactedPayloadJson: string
  dispatchId?: string
  systemKey: string
  operationKey: string
  correlationId: string
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

function seededNotificationDb(): FakeDb {
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
  db.seed('adminMemberships', {
    _id: 'adminMemberships:1',
    _creationTime: 4,
    clerkUserId: 'user_admin',
    role: 'owner_admin',
    state: 'active',
    grantedBy: 'system',
    grantedAt: 4,
  })
  db.seed('adminMemberships', {
    _id: 'adminMemberships:2',
    _creationTime: 5,
    clerkUserId: 'user_support',
    role: 'support',
    state: 'active',
    grantedBy: 'system',
    grantedAt: 5,
  })
  return db
}

function enqueueArgs(key: string): EnqueueArgs {
  return {
    businessId: 'businesses:1',
    inquiryThreadId: 'inquiry_thread:1',
    inquiryMessageId: 'inquiry_message:1',
    recipientRole: 'owner',
    providerFamily: 'resend',
    redactedPayloadJson: JSON.stringify({
      bodyHash: stableHash('burst pipe raw body'),
      contactHash: stableHash('customer@example.test'),
      template: 'inquiry-owner',
    }),
    systemKey,
    operationKey: `notification:enqueue:${key}`,
    correlationId: `correlation:notification:${key}`,
  }
}

function webhookArgs(overrides: Partial<WebhookArgs> = {}): WebhookArgs {
  const providerEventId = overrides.providerEventId ?? 'svix:1'
  const eventType = overrides.eventType ?? 'email.delivered'
  const payloadHash = overrides.payloadHash ?? stableHash({ providerEventId, eventType })
  return {
    providerFamily: overrides.providerFamily ?? 'resend',
    providerEventId,
    logicalObjectKey: overrides.logicalObjectKey ?? 'resend:message:1',
    eventType,
    signatureStatus: overrides.signatureStatus ?? 'verified',
    payloadHash,
    redactedPayloadJson: overrides.redactedPayloadJson ?? JSON.stringify({ providerEventId, payloadHash }),
    ...(overrides.dispatchId === undefined ? {} : { dispatchId: overrides.dispatchId }),
    systemKey: overrides.systemKey ?? systemKey,
    operationKey: overrides.operationKey ?? `notification:webhook:${providerEventId}`,
    correlationId: overrides.correlationId ?? `correlation:notification:webhook:${providerEventId}`,
  }
}

function retryArgs(dispatchId: string, key: string, overrides: CsrfOverride = {}) {
  return {
    dispatchId,
    retryAfter: Date.now() + 60_000,
    ...csrfEvidence(),
    operationKey: `notification:retry:${key}`,
    correlationId: `correlation:notification:retry:${key}`,
    ...overrides,
  }
}

function noRepairArgs(dispatchId: string, key: string, overrides: CsrfOverride = {}) {
  return {
    dispatchId,
    reason: 'Provider evidence exhausted; preserve inquiry truth.',
    ...csrfEvidence(),
    operationKey: `notification:no-repair:${key}`,
    correlationId: `correlation:notification:no-repair:${key}`,
    ...overrides,
  }
}

function csrfEvidence() {
  return {
    csrfToken: 'csrf-notification',
    csrfCookie: 'csrf-notification',
  }
}

function withoutCsrf<T extends { csrfToken?: string; csrfCookie?: string; origin?: string }>(args: T): T {
  const { csrfToken: _csrfToken, csrfCookie: _csrfCookie, origin: _origin, ...rest } = args
  return rest as T
}

function withOriginOnly<T extends { csrfToken?: string; csrfCookie?: string; origin?: string }>(args: T): T {
  return {
    ...withoutCsrf(args),
    origin: 'https://ae.example',
  }
}

type CsrfOverride = {
  csrfToken?: string
  csrfCookie?: string
  origin?: string
}

function requireEnqueueOk(value: unknown): EnqueueOk {
  expect(value).toMatchObject({ kind: 'ok' })
  return value as EnqueueOk
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

function admin(): UserIdentity {
  return {
    tokenIdentifier: 'clerk|user_admin',
    subject: 'user_admin',
    issuer: 'https://clerk.example.test',
    name: 'Admin Owner',
    email: 'admin@example.test',
  }
}

function support(): UserIdentity {
  return {
    tokenIdentifier: 'clerk|user_support',
    subject: 'user_support',
    issuer: 'https://clerk.example.test',
    name: 'Support Operator',
    email: 'support@example.test',
  }
}
