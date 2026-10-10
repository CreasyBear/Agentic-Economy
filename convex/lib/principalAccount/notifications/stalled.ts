import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { notificationWorkpool } from '../../../notificationWorkpool'
import type { PaginationOptions } from 'convex/server'
import { STALLED_STEPS as JOURNEY_STALLED_STEPS, readStalledPage, type StalledStep } from '../../journey/stalled'
import { resolveClerkUserIdForPrincipal } from '../workspace/directory'

type StalledKind = 'stalled_not_funded' | 'stalled_no_agent' | 'stalled_never_called'

const STALLED_STEPS: Record<StalledKind, { step: StalledStep; path: string; subject: string; body: string }> = {
  stalled_not_funded: {
    step: 'notFunded',
    path: '/owner/credit',
    subject: 'Add credit to start using Tools',
    body: 'Your account is set up but has no credit yet. Add credit so your Agent can make paid Tool calls.',
  },
  stalled_no_agent: {
    step: 'noAgent',
    path: '/agent-access',
    subject: 'Connect your first Agent',
    body: 'Your account has credit but no Agent connected yet. Connect an Agent so it can call Tools on your behalf.',
  },
  stalled_never_called: {
    step: 'neverCalled',
    path: '/market',
    subject: 'Your Agent has not made a call yet',
    body: 'Your Agent is connected but has not called a Tool yet. Browse the market to find a Tool for it to try.',
  },
}

export const isStalledKind = (kind: Doc<'notificationDeliveries'>['eventKind']): kind is StalledKind =>
  Object.hasOwn(STALLED_STEPS, kind)

async function stalledRecipient(ctx: QueryCtx, accountRef: string) {
  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', accountRef)).unique()
  if (account?.lifecycle !== 'active') return null
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef)).unique()
  if (ownership?.lifecycle !== 'active' || ownership.accountRef !== accountRef) return null
  const preference = await ctx.db.query('userNotificationPreferences')
    .withIndex('by_principalRef_and_accountRef', (query) => query
      .eq('principalRef', ownership.ownerPrincipalRef).eq('accountRef', accountRef)).unique()
  return preference?.stalledStepEmails === true ? ownership.ownerPrincipalRef : null
}

export const stalledEmailsEnabled = () => process.env.AE_STALLED_EMAILS_ENABLED?.trim() === 'true'

const KIND_BY_STEP = Object.fromEntries(
  (Object.keys(STALLED_STEPS) as StalledKind[]).map(kind => [STALLED_STEPS[kind].step, kind]),
) as Record<StalledStep, StalledKind>

/** One email per (account, stalled step), ever. Off unless AE_STALLED_EMAILS_ENABLED=true and the owner opted in.
 * Handles one page of one step; the sweep action follows the cursor so every stalled account is reached. */
export async function enqueueStalledStepEmailsHandler(
  ctx: MutationCtx,
  args: { step: StalledStep; now: number; paginationOpts: PaginationOptions },
): Promise<{ isDone: boolean; continueCursor: string }> {
  if (!stalledEmailsEnabled()) return { isDone: true, continueCursor: '' }
  const page = await readStalledPage(ctx, args.step, args.now, args.paginationOpts)
  const eventKind = KIND_BY_STEP[args.step]
  for (const { accountRef } of page.page) {
    const recipientPrincipalRef = await stalledRecipient(ctx, accountRef)
    if (recipientPrincipalRef === null) continue
    const existing = await ctx.db.query('notificationDeliveries')
      .withIndex('by_recipient_account_event_source', (query) => query
        .eq('recipientPrincipalRef', recipientPrincipalRef)
        .eq('accountRef', accountRef)
        .eq('eventKind', eventKind)
        .eq('sourceEventRef', accountRef)).unique()
    if (existing !== null) continue

    const now = Date.now()
    const deliveryId = await ctx.db.insert('notificationDeliveries', {
      deliveryRef: `notification:${crypto.randomUUID()}`,
      recipientPrincipalRef,
      accountRef,
      eventKind,
      sourceEventRef: accountRef,
      state: 'pending',
      createdAt: now,
      updatedAt: now,
    })
    const workId = await notificationWorkpool.enqueueAction(
      ctx,
      internal.notificationDelivery.sendApprovalEmail,
      { deliveryId },
      { retry: true, onComplete: internal.notifications.completeDelivery, context: { deliveryId } },
    )
    await ctx.db.patch(deliveryId, { workId })
  }
  return { isDone: page.isDone, continueCursor: page.continueCursor }
}

/** RFC 8058 one-click target. The deliveryRef is a random UUID only the recipient's inbox holds. */
export async function unsubscribeStalledHandler(ctx: MutationCtx, args: { deliveryRef: string }): Promise<boolean> {
  const delivery = await ctx.db.query('notificationDeliveries')
    .withIndex('by_deliveryRef', (query) => query.eq('deliveryRef', args.deliveryRef)).unique()
  if (delivery === null || !isStalledKind(delivery.eventKind)) return false
  const preference = await ctx.db.query('userNotificationPreferences')
    .withIndex('by_principalRef_and_accountRef', (query) => query
      .eq('principalRef', delivery.recipientPrincipalRef).eq('accountRef', delivery.accountRef)).unique()
  if (preference?.stalledStepEmails === true) {
    await ctx.db.patch(preference._id, {
      stalledStepEmails: false,
      revision: preference.revision + 1,
      updatedAt: Date.now(),
      lastCorrelationRef: `unsubscribe:${delivery.deliveryRef}`,
    })
  }
  return true
}

/** Re-checks at send time: still the owner, still opted in, step still not done. */
export async function readStalledDeliveryContext(
  ctx: QueryCtx,
  delivery: Doc<'notificationDeliveries'> & { eventKind: StalledKind },
) {
  const step = STALLED_STEPS[delivery.eventKind]
  if (await stalledRecipient(ctx, delivery.accountRef) !== delivery.recipientPrincipalRef) {
    return { kind: 'skip' as const, code: 'recipient_changed' }
  }
  const done = await ctx.db.query('journeyEvents')
    .withIndex('by_accountRef_and_name', (query) => query.eq('accountRef', delivery.accountRef).eq('name', JOURNEY_STALLED_STEPS[step.step].to))
    .first()
  if (done !== null) return { kind: 'skip' as const, code: 'stalled_step_completed' }
  const clerkUserId = await resolveClerkUserIdForPrincipal(ctx.db, delivery.recipientPrincipalRef)
  if (clerkUserId === null) return { kind: 'skip' as const, code: 'no_clerk_identity' }
  const siteUrl = process.env.AE_SITE_URL?.trim().replace(/\/+$/u, '')
  if (siteUrl === undefined || siteUrl.length === 0) return { kind: 'skip' as const, code: 'site_url_missing' }
  const convexSiteUrl = process.env.CONVEX_SITE_URL?.trim().replace(/\/+$/u, '')
  if (convexSiteUrl === undefined || convexSiteUrl.length === 0) return { kind: 'skip' as const, code: 'unsubscribe_url_missing' }
  const unsubscribeUrl = `${convexSiteUrl}/notifications/unsubscribe?d=${encodeURIComponent(delivery.deliveryRef)}`
  return {
    kind: 'ready' as const,
    deliveryRef: delivery.deliveryRef,
    clerkUserId,
    subject: step.subject,
    text: `${step.body}\n\n${siteUrl}${step.path}\n\nYou get this because stalled-step emails are on in your notification settings. Stop these emails: ${unsubscribeUrl}\n`,
    unsubscribeUrl,
  }
}
