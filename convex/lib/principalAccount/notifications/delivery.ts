import {readUsageDeliveryContext} from './usageAlerts'
import { v, type Infer } from 'convex/values'
import { vOnCompleteArgs } from '@convex-dev/workpool'

import { AUTHORITY_REQUEST_TTL_MS } from '../../capabilityExecution/callLifecycle/admissionApprovals'
import { notificationDeliveryStateRank } from '@/modules/principal-account/account/convex-schema'
import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { resolveClerkUserIdForPrincipal } from '../workspace/directory'
import { isStalledKind, readStalledDeliveryContext } from './stalled'
import { recordSuppression, suppressionCode } from './suppression'

export const readSendSuppressionArgs = { deliveryId: v.id('notificationDeliveries'), addressHash: v.string() }

/** Checked at send time, where the Clerk address is known. Returns the suppression code, or null when the send may go. */
export async function readSendSuppressionHandler(
  ctx: QueryCtx,
  args: { deliveryId: Id<'notificationDeliveries'>; addressHash: string },
): Promise<string | null> {
  const delivery = await ctx.db.get(args.deliveryId)
  if (delivery === null) return 'delivery_missing'
  return await suppressionCode(ctx.db, { addressHash: args.addressHash, stream: delivery.stream ?? 'transactional' })
}

export const resendEventArgs = {
  svixId: v.string(),
  type: v.string(),
  emailId: v.string(),
  addressHash: v.string(),
  domain: v.string(),
  permanentBounce: v.boolean(),
}

/** A replayed svix-id is a duplicate and changes nothing. Delivery states move only up the rank order, so a late
 * "delivered" never overwrites a bounce. Suppressions do not depend on the delivery row, which can lag the send. */
export async function applyResendEventHandler(
  ctx: MutationCtx,
  args: { svixId: string; type: string; emailId: string; addressHash: string; domain: string; permanentBounce: boolean },
): Promise<'applied' | 'duplicate'> {
  const seen = await ctx.db.query('emailWebhookEvents')
    .withIndex('by_svixId', (query) => query.eq('svixId', args.svixId)).unique()
  if (seen !== null) return 'duplicate'
  const now = Date.now()
  await ctx.db.insert('emailWebhookEvents', { svixId: args.svixId, receivedAt: now })

  const delivery = await ctx.db.query('notificationDeliveries')
    .withIndex('by_vendorMessageId', (query) => query.eq('vendorMessageId', args.emailId)).unique()
  const sourceDeliveryRef = delivery?.deliveryRef ?? `resend:${args.emailId}`
  const hardBounce = args.type === 'email.bounced' && args.permanentBounce
  if (hardBounce) {
    await recordSuppression(ctx.db, { addressHash: args.addressHash, domain: args.domain, reason: 'hard_bounce', sourceDeliveryRef })
  }
  if (args.type === 'email.complained') {
    await recordSuppression(ctx.db, { addressHash: args.addressHash, domain: args.domain, reason: 'complaint', sourceDeliveryRef })
  }

  const target = args.type === 'email.delivered' ? 'delivered'
    : args.type === 'email.complained' ? 'complained'
      : hardBounce ? 'bounced'
        : null
  if (delivery !== null && target !== null && notificationDeliveryStateRank[delivery.state] < notificationDeliveryStateRank[target]) {
    await ctx.db.patch(delivery._id, { state: target, lastEventAt: now, updatedAt: now })
  }
  return 'applied'
}

export const readNotificationContextArgs = { deliveryId: v.id('notificationDeliveries') }

export const readNotificationContextResult = v.union(
  // Props are rebuilt at send time; sendDeliveryEmail picks the template by eventKind and renders it.
  v.object({
    kind: v.literal('ready'),
    deliveryRef: v.string(),
    clerkUserId: v.string(),
    stream: v.string(),
    // Every template prop is a flat string or number, so the validator stays exact.
    email: v.object({ eventKind: v.string(), props: v.record(v.string(), v.union(v.string(), v.number())) }),
  }),
  v.object({ kind: v.literal('skip'), code: v.string() }),
)

export const sendDeliveryEmailResult = v.union(
  v.object({ outcome: v.literal('sent'), vendorMessageId: v.optional(v.string()) }),
  v.object({ outcome: v.literal('failed'), code: v.string() }),
  v.object({ outcome: v.literal('suppressed'), code: v.string() }),
)

export const completeDeliveryArgs = vOnCompleteArgs(
  v.object({ deliveryId: v.id('notificationDeliveries') }),
  sendDeliveryEmailResult,
)

type NotificationContext = Infer<typeof readNotificationContextResult>
type CompleteDeliveryArgs = Infer<typeof completeDeliveryArgs>

export async function readNotificationContextHandler(
  ctx: QueryCtx,
  args: { deliveryId: Id<'notificationDeliveries'> },
): Promise<NotificationContext> {
  const delivery = await ctx.db.get(args.deliveryId)
  if(delivery!==null&&delivery.state==='pending'&&delivery.usageEvidenceJson!==undefined)return await readUsageDeliveryContext(ctx,delivery)
  if (delivery !== null && delivery.state === 'pending' && isStalledKind(delivery.eventKind)) {
    return await readStalledDeliveryContext(ctx, { ...delivery, eventKind: delivery.eventKind })
  }
  if (delivery === null || delivery.state !== 'pending' || delivery.eventKind !== 'agent_approval_requested') {
    return { kind: 'skip', code: 'approval_no_longer_pending' }
  }

  const call = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', delivery.sourceEventRef)).unique()
  if (call?.state !== 'pending' || call.result?.kind !== 'needs_authority') {
    return { kind: 'skip', code: 'approval_no_longer_pending' }
  }
  if (Date.now() - call.createdAt >= AUTHORITY_REQUEST_TTL_MS) {
    return { kind: 'skip', code: 'approval_expired' }
  }

  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', delivery.accountRef)).unique()
  const ownership = account === null || account.lifecycle !== 'active'
    ? null
    : await ctx.db.query('accountOwnerships')
      .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef)).unique()
  if (ownership?.lifecycle !== 'active' || ownership.accountRef !== delivery.accountRef
    || ownership.ownerPrincipalRef !== delivery.recipientPrincipalRef) {
    return { kind: 'skip', code: 'recipient_changed' }
  }

  const preference = await ctx.db.query('userNotificationPreferences')
    .withIndex('by_principalRef_and_accountRef', (query) => query
      .eq('principalRef', delivery.recipientPrincipalRef).eq('accountRef', delivery.accountRef)).unique()
  if (preference?.agentApprovalRequested === false) return { kind: 'skip', code: 'opted_out' }

  const clerkUserId = await resolveClerkUserIdForPrincipal(ctx.db, delivery.recipientPrincipalRef)
  if (clerkUserId === null) return { kind: 'skip', code: 'no_clerk_identity' }
  const siteUrl = process.env.AE_SITE_URL?.trim().replace(/\/+$/u, '')
  if (siteUrl === undefined || siteUrl.length === 0) return { kind: 'skip', code: 'site_url_missing' }

  const agent = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', call.principalId)).unique()
  const agentName = (agent?.displayName ?? 'Your Agent').replace(/[\r\n]+/gu, ' ').trim() || 'Your Agent'
  const expiresMinutes = Math.round(AUTHORITY_REQUEST_TTL_MS / 60_000)
  return {
    kind: 'ready',
    deliveryRef: delivery.deliveryRef,
    clerkUserId,
    stream: delivery.stream ?? 'transactional',
    email: { eventKind: 'agent_approval_requested', props: { siteUrl, agentName, expiresMinutes } },
  }
}

export async function completeDeliveryHandler(
  ctx: MutationCtx,
  args: CompleteDeliveryArgs,
): Promise<null> {
  const row = await ctx.db.get(args.context.deliveryId)
  if (row === null || row.workId !== args.workId || row.state !== 'pending') return null

  const now = Date.now()
  if (args.result.kind === 'failed') {
    await ctx.db.patch(row._id, { state: 'failed', lastFailureCode: 'retries_exhausted', updatedAt: now })
    return null
  }
  if (args.result.kind === 'canceled') {
    await ctx.db.patch(row._id, { state: 'suppressed', suppressCode: 'canceled', updatedAt: now })
    return null
  }

  const outcome = args.result.returnValue
  if (outcome.outcome === 'sent') {
    await ctx.db.patch(row._id, {
      state: 'sent',
      ...(outcome.vendorMessageId === undefined ? {} : { vendorMessageId: outcome.vendorMessageId }),
      updatedAt: now,
    })
  } else if (outcome.outcome === 'failed') {
    await ctx.db.patch(row._id, { state: 'failed', lastFailureCode: outcome.code, updatedAt: now })
  } else {
    await ctx.db.patch(row._id, { state: 'suppressed', suppressCode: outcome.code, updatedAt: now })
  }
  return null
}
