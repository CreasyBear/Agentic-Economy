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
import { requireSourceWrite } from './lib/security/sourceWrite/admission'
import { sourceWriteArgs } from './lib/security/sourceWrite/contracts'
import { enqueueOperatorAlert } from './operatorDigest'
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
      : args.event.kind === 'checkout' || args.event.kind === 'refund' || args.event.kind === 'dispute'
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
        if (existing.state === 'failed') {
          await ctx.db.patch(existing._id, {
            state: 'queued',
            failureCode: undefined,
            completedAt: undefined,
            updatedAt: now,
          })
          const workId = await stripeWebhookWorkpool.enqueueAction(
            ctx,
            processStripeWebhookRef,
            { stripeEventId: existing.stripeEventId },
            {
              retry: true,
              onComplete: completeStripeWebhookRef,
              context: { stripeEventId: existing.stripeEventId },
            },
          )
          await ctx.db.patch(existing._id, { workId })
          return { kind: 'accepted', status: 'queued' }
        }
        return { kind: 'accepted', status: 'replayed' }
      }
      if (existing.state === 'applied' || existing.state === 'ignored') {
        await ctx.db.patch(existing._id, {
          conflictPayloadDigest: args.event.payloadDigest,
          failureCode: 'stripe_event_identity_conflict',
          updatedAt: now,
        })
        return { kind: 'accepted', status: 'reconciliation_required' }
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

export const listStuckForOperator = internalQuery({
  args: {},
  returns: v.array(v.object({
    stripeEventId: v.string(),
    state: v.union(v.literal('failed'), v.literal('reconciliation_required')),
    failureCode: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  })),
  handler: async (ctx) => {
    const rows = []
    for (const state of ['failed', 'reconciliation_required'] as const) {
      rows.push(...await ctx.db.query('moneyStripeWebhookInbox')
        .withIndex('by_state_and_receivedAt', (index) => index.eq('state', state))
        .take(100))
    }
    return rows.map((row) => ({
      stripeEventId: row.stripeEventId,
      state: row.state as 'failed' | 'reconciliation_required',
      ...(row.failureCode === undefined ? {} : { failureCode: row.failureCode }),
      ...(row.completedAt === undefined ? {} : { completedAt: row.completedAt }),
    }))
  },
})

/** Hourly cron: alerts the operator when Stripe inbox rows are stuck in failed or reconciliation_required. */
export const alertStuck = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const stuck: Array<{ stripeEventId: string; completedAt?: number }> = []
    for (const state of ['failed', 'reconciliation_required'] as const) {
      stuck.push(...await ctx.db.query('moneyStripeWebhookInbox')
        .withIndex('by_state_and_receivedAt', (index) => index.eq('state', state))
        .take(100))
    }
    if (stuck.length === 0) return null
    const oldest = stuck.reduce((a, b) => ((b.completedAt ?? Infinity) < (a.completedAt ?? Infinity) ? b : a))
    await enqueueOperatorAlert(ctx, {
      alertRef: `stripe-inbox-stuck-${Math.floor(Date.now() / 3_600_000)}`,
      subject: `Stripe inbox: ${stuck.length} stuck event${stuck.length === 1 ? '' : 's'}`,
      text: `${stuck.length} Stripe webhook inbox rows are failed or reconciliation_required. Oldest: ${oldest.stripeEventId}.`,
    })
    return null
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

