import { v } from 'convex/values'

import { AUTHORITY_REQUEST_TTL_MS } from '../../capabilityExecution/callLifecycle/admissionApprovals'
import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { resolveClerkUserIdForPrincipal } from '../workspace/directory'

const DELIVERY_LEASE_MS = 5 * 60_000
const MAX_CLAIM_LIMIT = 20

export const claimDueNotificationDeliveriesArgs = { limit: v.number() }
export const claimDueNotificationDeliveriesResult = v.array(v.object({
  deliveryId: v.id('notificationDeliveries'),
  deliveryRef: v.string(),
  attemptCount: v.number(),
}))

export async function claimDueNotificationDeliveriesHandler(
  ctx: MutationCtx,
  args: { limit: number },
): Promise<{ deliveryId: Id<'notificationDeliveries'>; deliveryRef: string; attemptCount: number }[]> {
  const now = Date.now()
  const limit = Math.min(MAX_CLAIM_LIMIT, Math.max(0, Math.floor(args.limit)))
  const rows = await ctx.db.query('notificationDeliveries')
    .withIndex('by_state_and_nextAttemptAt', (query) => query.eq('state', 'pending').lte('nextAttemptAt', now))
    .take(limit)
  const claimed: { deliveryId: Id<'notificationDeliveries'>; deliveryRef: string; attemptCount: number }[] = []
  for (const row of rows) {
    const attemptCount = (row.attemptCount ?? 0) + 1
    await ctx.db.patch(row._id, { nextAttemptAt: now + DELIVERY_LEASE_MS, attemptCount, updatedAt: now })
    claimed.push({ deliveryId: row._id, deliveryRef: row.deliveryRef, attemptCount })
  }
  return claimed
}

export const readNotificationContextArgs = { deliveryId: v.id('notificationDeliveries') }
export const readNotificationContextResult = v.union(
  v.object({ kind: v.literal('ready'), clerkUserId: v.string(), subject: v.string(), text: v.string() }),
  v.object({ kind: v.literal('skip'), code: v.string() }),
)

type NotificationContext =
  | { kind: 'ready'; clerkUserId: string; subject: string; text: string }
  | { kind: 'skip'; code: string }

export async function readNotificationContextHandler(
  ctx: QueryCtx,
  args: { deliveryId: Id<'notificationDeliveries'> },
): Promise<NotificationContext> {
  const delivery = await ctx.db.get(args.deliveryId)
  if (delivery === null || delivery.state !== 'pending' || delivery.eventKind !== 'agent_approval_requested') {
    return { kind: 'skip', code: 'approval_no_longer_pending' }
  }
  const call = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', delivery.sourceEventRef)).unique()
  if (call?.state !== 'pending' || call.result?.kind !== 'needs_authority') {
    return { kind: 'skip', code: 'approval_no_longer_pending' }
  }
  const clerkUserId = await resolveClerkUserIdForPrincipal(ctx.db, delivery.recipientPrincipalRef)
  if (clerkUserId === null) return { kind: 'skip', code: 'no_clerk_identity' }
  const siteUrl = process.env.AE_SITE_URL?.trim().replace(/\/+$/u, '')
  if (siteUrl === undefined || siteUrl.length === 0) return { kind: 'skip', code: 'site_url_missing' }
  const agent = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', call.principalId)).unique()
  const agentName = (agent?.displayName ?? 'Your Agent').replace(/[\r\n]+/gu, ' ').trim() || 'Your Agent'
  const minutes = Math.round(AUTHORITY_REQUEST_TTL_MS / 60_000)
  return {
    kind: 'ready',
    clerkUserId,
    subject: `${agentName} needs your approval`,
    text: `Your Agent "${agentName}" is waiting for your approval to run a paid Tool call.\n\nReview and approve or decline: ${siteUrl}/agent-access\n\nThis request expires ${minutes} minutes after it was made. If you do nothing, no money moves.\n`,
  }
}

export const finishNotificationDeliveryArgs = {
  deliveryId: v.id('notificationDeliveries'),
  outcome: v.union(v.literal('sent'), v.literal('retry'), v.literal('failed'), v.literal('suppressed')),
  vendorMessageId: v.optional(v.string()),
  code: v.optional(v.string()),
  nextAttemptAt: v.optional(v.number()),
}

export async function finishNotificationDeliveryHandler(
  ctx: MutationCtx,
  args: {
    deliveryId: Id<'notificationDeliveries'>
    outcome: 'sent' | 'retry' | 'failed' | 'suppressed'
    vendorMessageId?: string
    code?: string
    nextAttemptAt?: number
  },
): Promise<null> {
  const row = await ctx.db.get(args.deliveryId)
  if (row === null || row.state !== 'pending') return null
  const now = Date.now()
  if (args.outcome === 'retry') {
    if (args.nextAttemptAt === undefined || args.code === undefined) throw new Error('notification_retry_details_missing')
    await ctx.db.patch(row._id, {
      state: 'pending',
      nextAttemptAt: args.nextAttemptAt,
      lastFailureCode: args.code,
      updatedAt: now,
    })
    return null
  }
  if (args.outcome === 'sent') {
    await ctx.db.patch(row._id, {
      state: 'sent',
      nextAttemptAt: undefined,
      ...(args.vendorMessageId === undefined ? {} : { vendorMessageId: args.vendorMessageId }),
      updatedAt: now,
    })
    return null
  }
  if (args.code === undefined) throw new Error('notification_terminal_code_missing')
  await ctx.db.patch(row._id, args.outcome === 'failed'
    ? { state: 'failed', nextAttemptAt: undefined, lastFailureCode: args.code, updatedAt: now }
    : { state: 'suppressed', nextAttemptAt: undefined, suppressCode: args.code, updatedAt: now })
  return null
}
