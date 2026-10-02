import type { MutationCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { notificationWorkpool } from '../../../notificationWorkpool'
import { assertAdmission } from '../../platform/rateLimit'

export async function enqueueAgentApprovalRequestedHandler(
  ctx: MutationCtx,
  args: { callRef: string },
): Promise<{ kind: 'enqueued' | 'exists' | 'skipped' | 'suppressed' }> {
  const call = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  if (call?.state !== 'pending' || call.result?.kind !== 'needs_authority') return { kind: 'skipped' }

  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', call.ownerId)).unique()
  if (account === null || account.lifecycle !== 'active') return { kind: 'skipped' }
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef)).unique()
  if (ownership === null || ownership.lifecycle !== 'active' || ownership.accountRef !== account.accountRef) {
    return { kind: 'skipped' }
  }

  const recipientPrincipalRef = ownership.ownerPrincipalRef
  const preference = await ctx.db.query('userNotificationPreferences')
    .withIndex('by_principalRef_and_accountRef', (query) => query
      .eq('principalRef', recipientPrincipalRef).eq('accountRef', account.accountRef)).unique()
  if (preference?.agentApprovalRequested === false) return { kind: 'skipped' }

  const existing = await ctx.db.query('notificationDeliveries')
    .withIndex('by_recipient_account_event_source', (query) => query
      .eq('recipientPrincipalRef', recipientPrincipalRef)
      .eq('accountRef', account.accountRef)
      .eq('eventKind', 'agent_approval_requested')
      .eq('sourceEventRef', call.callRef)).unique()
  if (existing !== null) return { kind: 'exists' }

  const rate = await assertAdmission(ctx, { name: 'agent-approval-email', key: account.accountRef })
  const now = Date.now()
  const deliveryId = await ctx.db.insert('notificationDeliveries', {
    deliveryRef: `notification:${crypto.randomUUID()}`,
    recipientPrincipalRef,
    accountRef: account.accountRef,
    eventKind: 'agent_approval_requested',
    sourceEventRef: call.callRef,
    state: rate.ok ? 'pending' : 'suppressed',
    ...(rate.ok ? {} : { suppressCode: 'notification_rate_limited' }),
    createdAt: now,
    updatedAt: now,
  })
  if (!rate.ok) return { kind: 'suppressed' }

  const workId = await notificationWorkpool.enqueueAction(
    ctx,
    internal.notificationDelivery.sendApprovalEmail,
    { deliveryId },
    {
      retry: true,
      onComplete: internal.notifications.completeDelivery,
      context: { deliveryId },
    },
  )
  await ctx.db.patch(deliveryId, { workId })
  return { kind: 'enqueued' }
}
