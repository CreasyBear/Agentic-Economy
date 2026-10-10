import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { PaginationOptions } from 'convex/server'
import { STALLED_STEPS as JOURNEY_STALLED_STEPS, readStalledPage, type StalledStep } from '../../journey/stalled'
import { resolveClerkUserIdForPrincipal } from '../workspace/directory'
import { enqueueEmail } from './enqueue'
import { unsubscribeUrlFor } from './unsubscribe'

type StalledKind = 'stalled_not_funded' | 'stalled_no_agent' | 'stalled_never_called'

/** Copy lives in src/emails/templates/stalled-step.tsx; this map only names the step each kind checks. */
const STALLED_STEPS: Record<StalledKind, { step: StalledStep }> = {
  stalled_not_funded: { step: 'notFunded' },
  stalled_no_agent: { step: 'noAgent' },
  stalled_never_called: { step: 'neverCalled' },
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
    await enqueueEmail(ctx, {
      eventKind,
      stream: 'lifecycle',
      recipientPrincipalRef,
      accountRef,
      sourceEventRef: accountRef,
    })
  }
  return { isDone: page.isDone, continueCursor: page.continueCursor }
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
  const unsubscribeUrl = await unsubscribeUrlFor({
    principalRef: delivery.recipientPrincipalRef,
    accountRef: delivery.accountRef,
    stream: 'lifecycle',
  })
  if (unsubscribeUrl === null) return { kind: 'skip' as const, code: 'unsubscribe_url_missing' }
  return {
    kind: 'ready' as const,
    deliveryRef: delivery.deliveryRef,
    clerkUserId,
    stream: 'lifecycle' as const,
    email: { eventKind: delivery.eventKind, props: { siteUrl, unsubscribeUrl } },
  }
}
