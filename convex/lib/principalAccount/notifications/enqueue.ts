import type { Doc } from '../../../_generated/dataModel'
import type { DatabaseReader, MutationCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { notificationWorkpool } from '../../../notificationWorkpool'
import { assertAdmission } from '../../platform/rateLimit'

export type EmailStream = 'transactional' | 'alert' | 'lifecycle'

const STREAM_SWITCH: Record<EmailStream, string> = {
  transactional: 'AE_EMAIL_TRANSACTIONAL_ENABLED',
  alert: 'AE_EMAIL_ALERT_ENABLED',
  lifecycle: 'AE_EMAIL_LIFECYCLE_ENABLED',
}

const streamEnabled = (stream: EmailStream) => process.env[STREAM_SWITCH[stream]]?.trim() !== 'false'

/** Phase 2 account notices stay dark until AE_EMAIL_PHASE2_ENABLED=true, whatever the stream switch says. */
const PHASE2_KINDS = new Set<Doc<'notificationDeliveries'>['eventKind']>([
  'funding_receipt', 'funding_failed', 'task_refunded', 'task_stuck', 'credit_exhausted',
  'key_issued', 'key_revoked', 'account_paused', 'account_restored', 'role_changed',
  'team_membership_changed', 'email_changed', 'data_request_received',
])
const phase2Enabled = () => process.env.AE_EMAIL_PHASE2_ENABLED?.trim() === 'true'

/** Phase 3 lifecycle and provider notices stay dark until AE_EMAIL_PHASE3_ENABLED=true. Payouts, the weekly summary and exception alerts are not wired yet. */
export const PHASE3_KINDS = new Set<Doc<'notificationDeliveries'>['eventKind']>(['welcome', 'provider_live', 'provider_offboarded'])
const phase3Enabled = () => process.env.AE_EMAIL_PHASE3_ENABLED?.trim() === 'true'

/** The owner of an active account, or null. Account and money mail go to the owner. */
export async function activeOwnerPrincipalRef(db: DatabaseReader, accountRef: string): Promise<string | null> {
  const account = await db.query('accounts').withIndex('by_accountRef', (query) => query.eq('accountRef', accountRef)).unique()
  if (account?.lifecycle !== 'active') return null
  const ownership = await db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef)).unique()
  return ownership?.lifecycle === 'active' && ownership.accountRef === accountRef ? ownership.ownerPrincipalRef : null
}

const ALERT_WINDOW_MS = 24 * 60 * 60 * 1000
const ALERT_KIND_DAILY_CAP = 1
const ALERT_DAILY_CAP = 3

/** Alert caps over a rolling 24 hours per recipient: 1 per kind, 3 in total. Only non-suppressed alert sends count. */
async function alertCapCode(ctx: MutationCtx, input: {
  eventKind: Doc<'notificationDeliveries'>['eventKind']
  stream: EmailStream
  recipientPrincipalRef: string
  accountRef: string
}, now: number): Promise<string | null> {
  if (input.stream !== 'alert') return null
  const sent = (await ctx.db.query('notificationDeliveries')
    .withIndex('by_accountRef_and_createdAt', (query) => query
      .eq('accountRef', input.accountRef).gte('createdAt', now - ALERT_WINDOW_MS))
    .collect())
    .filter((row) => row.recipientPrincipalRef === input.recipientPrincipalRef
      && row.stream === 'alert' && row.state !== 'suppressed')
  if (sent.filter((row) => row.eventKind === input.eventKind).length >= ALERT_KIND_DAILY_CAP) return 'alert_kind_daily_cap'
  if (sent.length >= ALERT_DAILY_CAP) return 'alert_daily_cap'
  return null
}

/** The one enqueue path for every email: dedupe, then the stream kill switch, then alert caps, then the stream's admission bucket.
 * Callers own their preference checks. Refused sends are kept as suppressed rows so the dedupe key still holds. */
export async function enqueueEmail(ctx: MutationCtx, input: {
  eventKind: Doc<'notificationDeliveries'>['eventKind']
  stream: EmailStream
  recipientPrincipalRef: string
  accountRef: string
  sourceEventRef: string
  consentBasis?: 'express' | 'inferred'
  evidence?: Pick<Doc<'notificationDeliveries'>, 'usageEvidenceJson' | 'preferenceRevision' | 'authorityRevisionAccount'>
}): Promise<'enqueued' | 'exists' | 'suppressed'> {
  const existing = await ctx.db.query('notificationDeliveries')
    .withIndex('by_recipient_account_event_source', (query) => query
      .eq('recipientPrincipalRef', input.recipientPrincipalRef)
      .eq('accountRef', input.accountRef)
      .eq('eventKind', input.eventKind)
      .eq('sourceEventRef', input.sourceEventRef)).unique()
  if (existing !== null) return 'exists'

  // Lifecycle mail without a recorded consent basis is refused, and the refusal is kept as a suppressed row.
  const consented = input.stream !== 'lifecycle' || input.consentBasis !== undefined
  const enabled = consented && streamEnabled(input.stream)
    && (!PHASE2_KINDS.has(input.eventKind) || phase2Enabled())
    && (!PHASE3_KINDS.has(input.eventKind) || phase3Enabled())
  const now = Date.now()
  const capCode = enabled ? await alertCapCode(ctx, input, now) : null
  const admitted = enabled && capCode === null
    && (await assertAdmission(ctx, { name: `email-${input.stream}`, key: input.accountRef })).ok
  const deliveryId = await ctx.db.insert('notificationDeliveries', {
    deliveryRef: `notification:${crypto.randomUUID()}`,
    recipientPrincipalRef: input.recipientPrincipalRef,
    accountRef: input.accountRef,
    eventKind: input.eventKind,
    stream: input.stream,
    required: input.stream === 'transactional',
    sourceEventRef: input.sourceEventRef,
    ...(input.consentBasis === undefined ? {} : { consentBasis: input.consentBasis }),
    ...input.evidence,
    state: admitted ? 'pending' : 'suppressed',
    ...(admitted ? {} : { suppressCode: !consented ? 'consent_basis_missing' : !enabled ? 'stream_disabled' : (capCode ?? 'notification_rate_limited') }),
    createdAt: now,
    updatedAt: now,
  })
  if (!admitted) return 'suppressed'

  const workId = await notificationWorkpool.enqueueAction(
    ctx,
    internal.notificationDelivery.sendDeliveryEmail,
    { deliveryId },
    {
      retry: true,
      onComplete: internal.notifications.completeDelivery,
      context: { deliveryId },
    },
  )
  await ctx.db.patch(deliveryId, { workId })
  return 'enqueued'
}

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

  const kind = await enqueueEmail(ctx, {
    eventKind: 'agent_approval_requested',
    stream: 'transactional',
    recipientPrincipalRef,
    accountRef: account.accountRef,
    sourceEventRef: call.callRef,
  })
  return { kind }
}

/** Funding receipt is owed to the payer who funded the Credit. The amount is read from the funding command at send time. */
export async function enqueueFundingReceiptHandler(ctx: MutationCtx, args: { commandRef: string }): Promise<null> {
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (query) => query.eq('commandRef', args.commandRef)).unique()
  if (command === null) return null
  await enqueueEmail(ctx, {
    eventKind: 'funding_receipt',
    stream: 'transactional',
    recipientPrincipalRef: command.actorPrincipalRef,
    accountRef: command.accountRef,
    sourceEventRef: command.commandRef,
  })
  return null
}
