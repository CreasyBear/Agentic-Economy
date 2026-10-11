import {readUsageDeliveryContext} from './usageAlerts'
import { v, type Infer } from 'convex/values'
import { vOnCompleteArgs } from '@convex-dev/workpool'

import { AUTHORITY_REQUEST_TTL_MS } from '../../capabilityExecution/callLifecycle/admissionApprovals'
import { notificationDeliveryStateRank } from '@/modules/principal-account/account/convex-schema'
import { formatMoney } from '@/emails/money'
import { formatTimestamp, formatZoneName } from '@/lib/ui/format-time'
import { readExactAmount } from '@/modules/money/public'
import type { Doc, Id } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { readFundingTaxDocuments } from '../../money/documents/taxInvoices'
import { resolveClerkUserIdForPrincipal } from '../workspace/directory'
import { accountOwnerPrincipalRef, ACCOUNT_STATE_KINDS, activeOwnerPrincipalRef, PHASE3_KINDS } from './enqueue'
import { isStalledKind, readStalledDeliveryContext } from './stalled'
import { LIFECYCLE_EXIT_EVENTS, lifecycleSkipCode } from './unsubscribe'
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

/** Stream and kind come back so the webhook action can label its PostHog event; they are 'unknown' when no delivery row matches. */
export const resendEventResult = v.union(
  v.object({ outcome: v.literal('duplicate') }),
  v.object({ outcome: v.literal('applied'), stream: v.string(), eventKind: v.string(), accountRef: v.optional(v.string()) }),
)

/** A replayed svix-id is a duplicate and changes nothing. Delivery states move only up the rank order, so a late
 * "delivered" never overwrites a bounce. Suppressions do not depend on the delivery row, which can lag the send. */
export async function applyResendEventHandler(
  ctx: MutationCtx,
  args: { svixId: string; type: string; emailId: string; addressHash: string; domain: string; permanentBounce: boolean },
): Promise<Infer<typeof resendEventResult>> {
  const seen = await ctx.db.query('emailWebhookEvents')
    .withIndex('by_svixId', (query) => query.eq('svixId', args.svixId)).unique()
  if (seen !== null) return { outcome: 'duplicate' }
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
  // Opens and clicks are stored once, on the first sighting, and never move the delivery state.
  if (delivery !== null && args.type === 'email.opened' && delivery.openedAt === undefined) await ctx.db.patch(delivery._id, { openedAt: now, lastEventAt: now })
  if (delivery !== null && args.type === 'email.clicked' && delivery.clickedAt === undefined) await ctx.db.patch(delivery._id, { clickedAt: now, lastEventAt: now })
  return {
    outcome: 'applied',
    stream: delivery?.stream ?? 'unknown',
    eventKind: delivery?.eventKind ?? 'unknown',
    ...(delivery === null ? {} : { accountRef: delivery.accountRef }),
  }
}

export const readNotificationContextArgs = { deliveryId: v.id('notificationDeliveries') }

export const readNotificationContextResult = v.union(
  // Props are rebuilt at send time; sendDeliveryEmail picks the template by eventKind and renders it.
  v.object({
    kind: v.literal('ready'),
    deliveryRef: v.string(),
    clerkUserId: v.string(),
    stream: v.string(),
    previousAddress: v.optional(v.string()),
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

/** Money notices print the ledger amount exactly or not at all: AUD, canonical units and a valid exponent. */
export function moneyNoticeAmount(value: unknown): string | undefined {
  const amount = readExactAmount(value)
  if (amount === undefined || amount.currency !== 'AUD') return undefined
  const text = formatMoney(amount)
  return text === '--' ? undefined : text
}

const MONEY_NOTICE_KINDS = new Set<Doc<'notificationDeliveries'>['eventKind']>(['funding_receipt', 'task_refunded'])

/** Reads the amount from the ledger row at send time. Refuses (skips) when the row is gone, the recipient changed or the amount is unsafe. */
async function readMoneyNoticeContext(ctx: QueryCtx, delivery: Doc<'notificationDeliveries'>): Promise<NotificationContext> {
  const skip = (code: string): NotificationContext => ({ kind: 'skip', code })
  let amount: string | undefined
  let props: Record<string, string | number> = {}
  if (delivery.eventKind === 'funding_receipt') {
    const command = await ctx.db.query('moneyFundingCommands')
      .withIndex('by_commandRef', (query) => query.eq('commandRef', delivery.sourceEventRef)).unique()
    if (command === null) return skip('funding_command_missing')
    if (command.actorPrincipalRef !== delivery.recipientPrincipalRef || command.accountRef !== delivery.accountRef) return skip('recipient_changed')
    // Tax invoice (design doc 6.1): every amount is the funding command's own unit string, never recomputed.
    const { principalUnits, serviceFeeUnits, taxUnits, totalUnits, exponent } = command
    const exact = [principalUnits, serviceFeeUnits, taxUnits, totalUnits].map((units) => moneyNoticeAmount({ currency: command.currency, units, exponent }))
    if (exact.includes(undefined)) return skip('amount_unsafe')
    amount = exact[0]
    // The invoice number and date are the issued tax document's own. A withheld invoice sends the plain receipt; rendering or retryable states wait.
    const invoice = (await readFundingTaxDocuments(ctx, command, Date.now())).taxInvoice
    if (invoice.kind === 'withheld') {
      props = { principalUnits, serviceFeeUnits, taxUnits, totalUnits, exponent, plain: 1, confirmedAt: new Date(delivery.createdAt).toISOString() }
    } else if (invoice.kind !== 'issued') return skip('tax_invoice_not_issued')
    else {
    const taxFacts = await ctx.db.query('moneyCustomerTaxFacts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', delivery.accountRef)).unique()
    props = {
      principalUnits, serviceFeeUnits, taxUnits, totalUnits, exponent,
      invoiceNumber: invoice.documentNumber, confirmedAt: new Date(invoice.issuedAt).toISOString(),
      ...(taxFacts?.abn ? { buyerAbn: taxFacts.abn } : {}),
      ...(taxFacts?.legalName ? { buyerName: taxFacts.legalName } : {}),
    }
    }
  } else {
    const call = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', delivery.sourceEventRef)).unique()
    if (call?.result?.kind !== 'refused' || call.result.receipt?.refundState !== 'released') return skip('refund_not_released')
    if (call.ownerId !== delivery.accountRef || await activeOwnerPrincipalRef(ctx.db, delivery.accountRef) !== delivery.recipientPrincipalRef) {
      return skip('recipient_changed')
    }
    amount = moneyNoticeAmount(call.result.receipt.totalBuyerCharge)
    props = { taskRef: call.callRef }
  }
  if (amount === undefined) return skip('amount_unsafe')

  const clerkUserId = await resolveClerkUserIdForPrincipal(ctx.db, delivery.recipientPrincipalRef)
  if (clerkUserId === null) return skip('no_clerk_identity')
  const siteUrl = process.env.AE_SITE_URL?.trim().replace(/\/+$/u, '')
  if (siteUrl === undefined || siteUrl.length === 0) return skip('site_url_missing')
  // Required mail: no unsubscribe target.
  return {
    kind: 'ready',
    deliveryRef: delivery.deliveryRef,
    clerkUserId,
    stream: delivery.stream ?? 'transactional',
    email: { eventKind: delivery.eventKind, props: { siteUrl, amount, ...props } },
  }
}

/** Who must still be the recipient at send time: the member for a role change, the person themselves for their own email and data, else the owner (even when the account is paused). */
async function recipientStillValid(ctx: QueryCtx, delivery: Doc<'notificationDeliveries'>): Promise<boolean> {
  switch (delivery.eventKind) {
    case 'email_changed':
    case 'data_request_received':
      return true
    case 'role_changed':
      return (await readActiveMembership(ctx, delivery)) !== null
    case 'account_paused':
    case 'account_restored':
    case 'funding_disputed':
      return await accountOwnerPrincipalRef(ctx.db, delivery.accountRef) === delivery.recipientPrincipalRef
    default:
      return await activeOwnerPrincipalRef(ctx.db, delivery.accountRef) === delivery.recipientPrincipalRef
  }
}

const readActiveMembership = async (ctx: QueryCtx, delivery: Doc<'notificationDeliveries'>) =>
  await ctx.db.query('memberships')
    .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
      .eq('accountRef', delivery.accountRef).eq('memberPrincipalRef', delivery.recipientPrincipalRef).eq('lifecycle', 'active'))
    .first()

/** Phase 3 and T13 account notices. Recipient is re-checked at send time; the link target comes from sourceEventRef. Required mail, so no unsubscribe target. */
async function readAccountNoticeContext(ctx: QueryCtx, delivery: Doc<'notificationDeliveries'>): Promise<NotificationContext> {
  const skip = (code: string): NotificationContext => ({ kind: 'skip', code })
  if (!await recipientStillValid(ctx, delivery)) return skip('recipient_changed')
  const clerkUserId = await resolveClerkUserIdForPrincipal(ctx.db, delivery.recipientPrincipalRef)
  if (clerkUserId === null) return skip('no_clerk_identity')
  const siteUrl = process.env.AE_SITE_URL?.trim().replace(/\/+$/u, '')
  if (siteUrl === undefined || siteUrl.length === 0) return skip('site_url_missing')
  const props: Record<string, string> = delivery.eventKind === 'provider_live' ? { toolRef: delivery.sourceEventRef } : {}
  if (LIFECYCLE_EXIT_EVENTS[delivery.eventKind] !== undefined) {
    const skipCode = await lifecycleSkipCode(ctx, delivery, props)
    if (skipCode !== null) return skip(skipCode)
  }
  if (delivery.eventKind === 'role_changed') {
    const role = (await readActiveMembership(ctx, delivery))?.role
    if (role === undefined) return skip('role_unknown')
    props.role = role
  }
  if (delivery.eventKind === 'funding_failed' || delivery.eventKind === 'task_stuck') {
    const command = await ctx.db.query('moneyFundingCommands')
      .withIndex('by_commandRef', (query) => query.eq('commandRef', delivery.sourceEventRef)).unique()
    if (command === null) return skip('funding_command_missing')
    if (command.actorPrincipalRef !== delivery.recipientPrincipalRef) return skip('recipient_changed')
    // Resolved before send: a later success, or for a stuck payment any settled state.
    if (command.state === 'succeeded' || (delivery.eventKind === 'task_stuck' && command.state === 'failed')) return skip('payment_resolved')
    const amount = moneyNoticeAmount({ currency: command.currency, units: command.totalUnits, exponent: command.exponent })
    if (amount !== undefined) props.amount = amount
  }
  if (delivery.eventKind === 'data_request_received') {
    props.when = `${formatTimestamp(delivery.createdAt, 'Australia/Perth')} ${formatZoneName(delivery.createdAt, 'Australia/Perth')}`
  }
  return {
    kind: 'ready',
    deliveryRef: delivery.deliveryRef,
    clerkUserId,
    stream: delivery.stream ?? 'transactional',
    ...(delivery.previousAddress === undefined ? {} : { previousAddress: delivery.previousAddress }),
    email: { eventKind: delivery.eventKind, props: { siteUrl, ...props } },
  }
}

export async function readNotificationContextHandler(
  ctx: QueryCtx,
  args: { deliveryId: Id<'notificationDeliveries'> },
): Promise<NotificationContext> {
  const delivery = await ctx.db.get(args.deliveryId)
  // Enforced again at send time: lifecycle mail never goes without a stored consent basis.
  if (delivery?.state === 'pending' && delivery.stream === 'lifecycle' && delivery.consentBasis === undefined) return { kind: 'skip', code: 'consent_basis_missing' }
  if(delivery!==null&&delivery.state==='pending'&&delivery.usageEvidenceJson!==undefined)return await readUsageDeliveryContext(ctx,delivery)
  if (delivery !== null && delivery.state === 'pending' && isStalledKind(delivery.eventKind)) {
    return await readStalledDeliveryContext(ctx, { ...delivery, eventKind: delivery.eventKind })
  }
  if (delivery !== null && delivery.state === 'pending' && MONEY_NOTICE_KINDS.has(delivery.eventKind)) {
    return await readMoneyNoticeContext(ctx, delivery)
  }
  if (delivery !== null && delivery.state === 'pending' && (PHASE3_KINDS.has(delivery.eventKind) || ACCOUNT_STATE_KINDS.has(delivery.eventKind))) {
    return await readAccountNoticeContext(ctx, delivery)
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
