/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import type { WorkId } from '@convex-dev/workpool'

import { api, internal } from '../../../convex/_generated/api'
import { stripeWebhookWorkpool } from '../../../convex/stripeWebhookWorkpool'
import { convexTestWithWorkers } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const ingest = api.moneyStripeWebhookInbox.ingest

function checkoutEvent(payloadDigest = `sha256:${'a'.repeat(64)}`) {
  return {
    kind: 'checkout' as const,
    stripeEventId: 'evt_inbox_one',
    eventType: 'checkout.session.completed' as const,
    externalRef: 'cs_inbox_one',
    sessionId: 'cs_inbox_one',
    commandRef: `sha256:${'b'.repeat(64)}`,
    paymentId: 'pi_inbox_one',
    checkoutSessionDigest: `sha256:${'c'.repeat(64)}`,
    paymentIntentDigest: `sha256:${'d'.repeat(64)}`,
    status: 'paid' as const,
    amount: { currency: 'AUD', units: '5280000', exponent: 6 },
    metadataDigest: `sha256:${'e'.repeat(64)}`,
    payloadDigest,
    observedAt: 1_800_000_000_000,
  }
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

  it('keeps exhausted work visible to the deployment gate', async () => {
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

    await expect(backend.query(internal.moneyStripeWebhookInbox.readHealth, {
      staleBefore: Date.now() + 1,
    })).resolves.toEqual({ stalled: 0, failed: 1, reconciliationRequired: 0 })
  })
})
