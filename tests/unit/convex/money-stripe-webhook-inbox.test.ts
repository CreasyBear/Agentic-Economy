/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import type { WorkId } from '@convex-dev/workpool'

import { api, internal } from '../../../convex/_generated/api'
import { stripeWebhookWorkpool } from '../../../convex/stripeWebhookWorkpool'
import { convexTestWithWorkers } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'
import { createTestCheckoutEvent } from '../../helpers/stripe-events'

const ingest = api.moneyStripeWebhookInbox.ingest

function checkoutEvent(payloadDigest = `sha256:${'a'.repeat(64)}`) {
  return createTestCheckoutEvent({
    stripeEventId: 'evt_inbox_one',
    sessionId: 'cs_inbox_one',
    paymentId: 'pi_inbox_one',
    payloadDigest,
  })
}

describe('Stripe webhook durable inbox', () => {
  it('uses the isolated bounded retry policy', () => {
    expect(stripeWebhookWorkpool.options).toMatchObject({
      maxParallelism: 4,
      retryActionsByDefault: true,
      defaultRetryBehavior: { maxAttempts: 13, initialBackoffMs: 60_000, base: 2 },
    })
  })

  it('queues one job for exact duplicate evidence', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const command = {
      destination: 'snapshot' as const,
      event: checkoutEvent(),
      operationKey: 'moneyStripeWebhookInbox:ingest',
      correlationId: 'evt_inbox_one',
    }

    await expect(backend.mutation(ingest, await withSourceWrite('billing', command)))
      .resolves.toEqual({ kind: 'accepted', status: 'queued' })
    const first = await backend.run(async (ctx) => ctx.db.query('moneyStripeWebhookInbox').collect())
    await expect(backend.mutation(ingest, await withSourceWrite('billing', command)))
      .resolves.toEqual({ kind: 'accepted', status: 'replayed' })
    const second = await backend.run(async (ctx) => ctx.db.query('moneyStripeWebhookInbox').collect())

    expect(first).toHaveLength(1)
    expect(first[0]?.workId).toBeTruthy()
    expect(second).toHaveLength(1)
    expect(second[0]?.workId).toBe(first[0]?.workId)
  })

  it('contains conflicting evidence under the original event identity', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const base = {
      destination: 'snapshot' as const,
      event: checkoutEvent(),
      operationKey: 'moneyStripeWebhookInbox:ingest',
      correlationId: 'evt_inbox_one',
    }
    await backend.mutation(ingest, await withSourceWrite('billing', base))
    const conflict = { ...base, event: checkoutEvent(`sha256:${'f'.repeat(64)}`) }

    await expect(backend.mutation(ingest, await withSourceWrite('billing', conflict)))
      .resolves.toEqual({ kind: 'accepted', status: 'reconciliation_required' })
    const rows = await backend.run(async (ctx) => ctx.db.query('moneyStripeWebhookInbox').collect())

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      state: 'reconciliation_required',
      payloadDigest: base.event.payloadDigest,
      conflictPayloadDigest: conflict.event.payloadDigest,
      failureCode: 'stripe_event_identity_conflict',
    })
  })

  it('rejects events presented to the wrong destination', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const command = {
      destination: 'accounts_v2' as const,
      event: checkoutEvent(),
      operationKey: 'moneyStripeWebhookInbox:ingest',
      correlationId: 'evt_inbox_one',
    }

    await expect(backend.mutation(ingest, await withSourceWrite('billing', command)))
      .resolves.toEqual({ kind: 'refused', code: 'payment_binding_invalid', retryable: false })
    await expect(backend.run(async (ctx) => ctx.db.query('moneyStripeWebhookInbox').collect()))
      .resolves.toHaveLength(0)
  })

  it('persists exhausted work as failed for the processing reader', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const command = {
      destination: 'snapshot' as const,
      event: checkoutEvent(),
      operationKey: 'moneyStripeWebhookInbox:ingest',
      correlationId: 'evt_inbox_one',
    }
    await backend.mutation(ingest, await withSourceWrite('billing', command))
    const row = await backend.run(async (ctx) => ctx.db.query('moneyStripeWebhookInbox').unique())
    if (row?.workId === undefined) throw new Error('work_not_queued')

    await backend.mutation(internal.moneyStripeWebhookInbox.complete, {
      workId: row.workId as WorkId,
      context: { stripeEventId: command.event.stripeEventId },
      result: { kind: 'failed', error: 'retry attempts exhausted' },
    })

    const failed = await backend.run(async (ctx) => ctx.db.get(row._id))
    expect(failed).toMatchObject({
      state: 'failed',
      failureCode: 'stripe_webhook_work_failed',
    })
    await expect(backend.query(internal.moneyStripeWebhookInbox.readForProcessing, {
      stripeEventId: command.event.stripeEventId,
    })).resolves.toEqual({
      destination: command.destination,
      event: command.event,
      state: 'failed',
    })
  })

  const command = () => ({
    destination: 'snapshot' as const,
    event: checkoutEvent(),
    operationKey: 'moneyStripeWebhookInbox:ingest',
    correlationId: 'evt_inbox_one',
  })

  it('re-queues a replayed failed row with fresh work', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    await backend.mutation(ingest, await withSourceWrite('billing', command()))
    const row = await backend.run(async (ctx) => ctx.db.query('moneyStripeWebhookInbox').unique())
    if (row?.workId === undefined) throw new Error('work_not_queued')
    await backend.mutation(internal.moneyStripeWebhookInbox.complete, {
      workId: row.workId as WorkId,
      context: { stripeEventId: 'evt_inbox_one' },
      result: { kind: 'failed', error: 'retry attempts exhausted' },
    })

    await expect(backend.mutation(ingest, await withSourceWrite('billing', command())))
      .resolves.toEqual({ kind: 'accepted', status: 'queued' })
    const rows = await backend.run(async (ctx) => ctx.db.query('moneyStripeWebhookInbox').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ state: 'queued' })
    expect(rows[0]?.failureCode).toBeUndefined()
    expect(rows[0]?.completedAt).toBeUndefined()
    expect(rows[0]?.workId).toBeTruthy()
    expect(rows[0]?.workId).not.toBe(row.workId)
  })

  it('keeps a replayed applied row replayed', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    await backend.mutation(ingest, await withSourceWrite('billing', command()))
    const row = await backend.run(async (ctx) => ctx.db.query('moneyStripeWebhookInbox').unique())
    if (row === null) throw new Error('row_missing')
    await backend.run(async (ctx) => ctx.db.patch(row._id, { state: 'applied' }))

    await expect(backend.mutation(ingest, await withSourceWrite('billing', command())))
      .resolves.toEqual({ kind: 'accepted', status: 'replayed' })
    const after = await backend.run(async (ctx) => ctx.db.get(row._id))
    expect(after).toMatchObject({ state: 'applied', workId: row.workId })
  })

  it('lists only failed and reconciliation_required rows for the operator', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    await backend.mutation(ingest, await withSourceWrite('billing', command()))
    const row = await backend.run(async (ctx) => ctx.db.query('moneyStripeWebhookInbox').unique())
    if (row === null) throw new Error('row_missing')
    const { _id, _creationTime, ...rest } = row
    void _creationTime
    await backend.run(async (ctx) => {
      await ctx.db.patch(_id, { state: 'failed', failureCode: 'stripe_webhook_work_failed' })
      await ctx.db.insert('moneyStripeWebhookInbox', { ...rest, stripeEventId: 'evt_r', state: 'reconciliation_required' })
      await ctx.db.insert('moneyStripeWebhookInbox', { ...rest, stripeEventId: 'evt_a', state: 'applied' })
      await ctx.db.insert('moneyStripeWebhookInbox', { ...rest, stripeEventId: 'evt_q', state: 'queued' })
    })

    const stuck = await backend.query(internal.moneyStripeWebhookInbox.listStuckForOperator, {})
    expect(stuck.map((r) => [r.stripeEventId, r.state]).sort()).toEqual([
      ['evt_inbox_one', 'failed'],
      ['evt_r', 'reconciliation_required'],
    ])
  })

})
