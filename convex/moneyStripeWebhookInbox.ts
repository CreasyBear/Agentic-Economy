import { vOnCompleteArgs } from '@convex-dev/workpool'
import { makeFunctionReference } from 'convex/server'
import { v, type Infer } from 'convex/values'

import { internalMutation, internalQuery, mutation } from './_generated/server'
import { stripeMoneyWebhookEventArg } from './moneyLedgerValues'
import {
  stripeWebhookAdmissionResultValue,
  stripeWebhookDestinationValue,
  stripeWebhookWorkResultValue,
} from './moneyStripeWebhookValues'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { stripeWebhookWorkpool } from './stripeWebhookWorkpool'

const processStripeWebhookRef = makeFunctionReference<
  'action',
  { stripeEventId: string },
  Infer<typeof stripeWebhookWorkResultValue>
>('moneyStripeWebhookWorker:process')
const completeStripeWebhookRef = makeFunctionReference<
  'mutation',
  {
    workId: string
    context: { stripeEventId: string }
    result:
      | { kind: 'success'; returnValue: Infer<typeof stripeWebhookWorkResultValue> }
      | { kind: 'failed'; error: string }
      | { kind: 'canceled' }
  },
  null
>('moneyStripeWebhookInbox:complete')

const ingestArgs = v.object({
  destination: stripeWebhookDestinationValue,
  event: stripeMoneyWebhookEventArg,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})

export const ingest = mutation({
  args: ingestArgs.fields,
  returns: stripeWebhookAdmissionResultValue,
  handler: async (ctx, args): Promise<Infer<typeof stripeWebhookAdmissionResultValue>> => {
    const admission = await requireSourceWrite(ctx, args, 'billing')
    if (admission.kind === 'rejected') {
      return { kind: 'refused', code: 'source_write_denied', retryable: false }
    }
    const destinationMatches = args.destination === 'accounts_v2'
      ? args.event.kind === 'account'
      : args.event.kind === 'checkout' || args.event.kind === 'refund'
    if (!destinationMatches || args.correlationId !== args.event.stripeEventId) {
      return { kind: 'refused', code: 'payment_binding_invalid', retryable: false }
    }

    const existing = await ctx.db.query('moneyStripeWebhookInbox')
      .withIndex('by_stripeEventId', (index) => index.eq('stripeEventId', args.event.stripeEventId))
      .unique()
    const now = Date.now()
    if (existing !== null) {
      if (existing.payloadDigest === args.event.payloadDigest
        && existing.eventType === args.event.eventType
        && existing.destination === args.destination) {
        return { kind: 'accepted', status: 'replayed' }
      }
      await ctx.db.patch(existing._id, {
        state: 'reconciliation_required',
        conflictPayloadDigest: args.event.payloadDigest,
        failureCode: 'stripe_event_identity_conflict',
        updatedAt: now,
        completedAt: now,
      })
      return { kind: 'accepted', status: 'reconciliation_required' }
    }

    const rowId = await ctx.db.insert('moneyStripeWebhookInbox', {
      stripeEventId: args.event.stripeEventId,
      eventType: args.event.eventType,
      destination: args.destination,
      event: args.event,
      payloadDigest: args.event.payloadDigest,
      state: 'queued',
      receivedAt: now,
      updatedAt: now,
    })
    const workId = await stripeWebhookWorkpool.enqueueAction(
      ctx,
      processStripeWebhookRef,
      { stripeEventId: args.event.stripeEventId },
      {
        retry: true,
        onComplete: completeStripeWebhookRef,
        context: { stripeEventId: args.event.stripeEventId },
      },
    )
    await ctx.db.patch(rowId, { workId })
    return { kind: 'accepted', status: 'queued' }
  },
})

export const readForProcessing = internalQuery({
  args: { stripeEventId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      destination: stripeWebhookDestinationValue,
      event: stripeMoneyWebhookEventArg,
      state: v.union(
        v.literal('queued'),
        v.literal('applied'),
        v.literal('ignored'),
        v.literal('reconciliation_required'),
        v.literal('failed'),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('moneyStripeWebhookInbox')
      .withIndex('by_stripeEventId', (index) => index.eq('stripeEventId', args.stripeEventId))
      .unique()
    return row === null ? null : { destination: row.destination, event: row.event, state: row.state }
  },
})

export const complete = internalMutation({
  args: vOnCompleteArgs(v.object({ stripeEventId: v.string() }), stripeWebhookWorkResultValue),
  returns: v.null(),
  handler: async (ctx, { workId, context, result }) => {
    const row = await ctx.db.query('moneyStripeWebhookInbox')
      .withIndex('by_stripeEventId', (index) => index.eq('stripeEventId', context.stripeEventId))
      .unique()
    if (row === null || row.workId !== workId || row.conflictPayloadDigest !== undefined) return null
    const now = Date.now()
    if (result.kind !== 'success') {
      await ctx.db.patch(row._id, {
        state: 'failed',
        failureCode: result.kind === 'canceled' ? 'stripe_webhook_work_canceled' : 'stripe_webhook_work_failed',
        updatedAt: now,
        completedAt: now,
      })
      return null
    }
    if (result.returnValue.kind === 'reconciliation_required') {
      await ctx.db.patch(row._id, {
        state: 'reconciliation_required',
        failureCode: result.returnValue.code,
        updatedAt: now,
        completedAt: now,
      })
      return null
    }
    await ctx.db.patch(row._id, {
      state: result.returnValue.status === 'ignored' ? 'ignored' : 'applied',
      ...(result.returnValue.appliedRef === undefined ? {} : { appliedRef: result.returnValue.appliedRef }),
      updatedAt: now,
      completedAt: now,
    })
    return null
  },
})

export const readHealth = internalQuery({
  args: { staleBefore: v.number() },
  returns: v.object({
    stalled: v.number(),
    failed: v.number(),
    reconciliationRequired: v.number(),
  }),
  handler: async (ctx, args) => {
    const [stalled, failed, reconciliationRequired] = await Promise.all([
      ctx.db.query('moneyStripeWebhookInbox')
        .withIndex('by_state_and_receivedAt', (index) => index.eq('state', 'queued').lt('receivedAt', args.staleBefore))
        .take(100),
      ctx.db.query('moneyStripeWebhookInbox')
        .withIndex('by_state_and_receivedAt', (index) => index.eq('state', 'failed'))
        .take(100),
      ctx.db.query('moneyStripeWebhookInbox')
        .withIndex('by_state_and_receivedAt', (index) => index.eq('state', 'reconciliation_required'))
        .take(100),
    ])
    return {
      stalled: stalled.length,
      failed: failed.length,
      reconciliationRequired: reconciliationRequired.length,
    }
  },
})
