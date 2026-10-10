import {readUsageDeliveryContext} from './usageAlerts'
import { v, type Infer } from 'convex/values'
import { vOnCompleteArgs } from '@convex-dev/workpool'

import { AUTHORITY_REQUEST_TTL_MS } from '../../capabilityExecution/callLifecycle/admissionApprovals'
import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { resolveClerkUserIdForPrincipal } from '../workspace/directory'
import { isStalledKind, readStalledDeliveryContext } from './stalled'

export const readNotificationContextArgs = { deliveryId: v.id('notificationDeliveries') }

export const readNotificationContextResult = v.union(
  v.object({ kind: v.literal('ready'), deliveryRef: v.string(), clerkUserId: v.string(), subject: v.string(), text: v.string(), unsubscribeUrl: v.optional(v.string()) }),
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
  const minutes = Math.round(AUTHORITY_REQUEST_TTL_MS / 60_000)
  return {
    kind: 'ready',
    deliveryRef: delivery.deliveryRef,
    clerkUserId,
    subject: `${agentName} needs your approval`,
    text: `Your Agent "${agentName}" is waiting for your approval to run a paid Tool call.\n\nReview and approve or decline: ${siteUrl}/agent-access\n\nThis request expires ${minutes} minutes after it was made. If you do nothing, no money moves.\n`,
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
