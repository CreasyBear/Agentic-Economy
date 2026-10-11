import type { Doc } from '../../../_generated/dataModel'
import type { DatabaseReader, MutationCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { notificationWorkpool } from '../../../notificationWorkpool'
import { assertAdmission } from '../../platform/rateLimit'
import { resolveInteractiveAuthorityContext } from '../../../interactiveAuthority'

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
  'deletion_requested', 'deletion_completed', 'auto_topup_failed', 'card_changed', 'deletion_final_reminder',
])
const phase2Enabled = () => process.env.AE_EMAIL_PHASE2_ENABLED?.trim() === 'true'

/** Account notices wired by T13. Each has its own off switch, AE_EMAIL_KIND_<KIND>_ENABLED, which must be exactly 'true' and is off by default. */
export const ACCOUNT_STATE_KINDS = new Set<Doc<'notificationDeliveries'>['eventKind']>([
  'funding_failed', 'task_stuck', 'credit_exhausted', 'key_issued', 'key_revoked',
  'account_paused', 'account_restored', 'role_changed', 'team_membership_changed', 'email_changed', 'data_request_received',
  'deletion_requested', 'deletion_completed', 'first_call_done', 'week_one_wrap', 'auto_topup_failed',
  'card_changed', 'first_call_failed', 'deletion_final_reminder',
])
const kindEnabled = (kind: Doc<'notificationDeliveries'>['eventKind']) =>
  !ACCOUNT_STATE_KINDS.has(kind) || process.env[`AE_EMAIL_KIND_${kind.toUpperCase()}_ENABLED`]?.trim() === 'true'

/** Key notices batch per 10 minutes: one send per owner per window, keyed on the window. */
const KEY_BATCH_MS = 10 * 60 * 1000
export const keyBatchSourceRef = (accountRef: string, now: number) => `${accountRef}:${Math.floor(now / KEY_BATCH_MS)}`
const DAY_MS = 24 * 60 * 60 * 1000
export const dayBucketSourceRef = (accountRef: string, now: number) => `${accountRef}:${Math.floor(now / DAY_MS)}`

/** Phase 3 lifecycle and provider notices stay dark until AE_EMAIL_PHASE3_ENABLED=true. Payouts, the weekly summary and exception alerts are not wired yet. */
export const PHASE3_KINDS = new Set<Doc<'notificationDeliveries'>['eventKind']>(['welcome', 'provider_live', 'provider_offboarded', 'provider_offboarding_blocked', 'first_call_done', 'week_one_wrap', 'first_call_failed'])
const phase3Enabled = () => process.env.AE_EMAIL_PHASE3_ENABLED?.trim() === 'true'

/** The owner of an active account, or null. Account and money mail go to the owner. */
export async function activeOwnerPrincipalRef(db: DatabaseReader, accountRef: string): Promise<string | null> {
  const account = await db.query('accounts').withIndex('by_accountRef', (query) => query.eq('accountRef', accountRef)).unique()
  return account?.lifecycle === 'active' ? await currentOwnerPrincipalRef(db, account) : null
}

/** The current owner whatever the account lifecycle, for notices about a paused account. */
export async function accountOwnerPrincipalRef(db: DatabaseReader, accountRef: string): Promise<string | null> {
  const account = await db.query('accounts').withIndex('by_accountRef', (query) => query.eq('accountRef', accountRef)).unique()
  return account === null ? null : await currentOwnerPrincipalRef(db, account)
}

async function currentOwnerPrincipalRef(db: DatabaseReader, account: Doc<'accounts'>): Promise<string | null> {
  const accountRef = account.accountRef
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

const LIFECYCLE_WINDOW_CAP = 4
const LIFECYCLE_WINDOW_MS = 14 * ALERT_WINDOW_MS

/** Lifecycle caps (design doc section 5): one per owner per 24 hours and 4 in 14 days, counted from sent or pending lifecycle rows only (suppressed and failed rows do not count). */
async function lifecycleCapCode(ctx: MutationCtx, input: {
  eventKind: Doc<'notificationDeliveries'>['eventKind']
  stream: EmailStream
  recipientPrincipalRef: string
  accountRef: string
}, now: number): Promise<string | null> {
  if (input.stream !== 'lifecycle') return null
  const sent = (await ctx.db.query('notificationDeliveries')
    .withIndex('by_accountRef_and_createdAt', (query) => query
      .eq('accountRef', input.accountRef).gte('createdAt', now - LIFECYCLE_WINDOW_MS))
    .collect())
    .filter((row) => row.recipientPrincipalRef === input.recipientPrincipalRef
      && row.stream === 'lifecycle' && row.state !== 'suppressed' && row.state !== 'failed')
  if (sent.length >= LIFECYCLE_WINDOW_CAP) return 'lifecycle_window_cap'
  if (sent.some((row) => row.createdAt >= now - ALERT_WINDOW_MS)) return 'lifecycle_daily_cap'
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
  /** Hold the send until this time (ms epoch), for quiet hours. */
  notBefore?: number
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
    && kindEnabled(input.eventKind)
  const now = Date.now()
  const capCode = enabled ? (await alertCapCode(ctx, input, now)) ?? (await lifecycleCapCode(ctx, input, now)) : null
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
      ...(input.notBefore === undefined ? {} : { runAt: input.notBefore }),
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

/** One account state notice, always transactional. Goes to `recipientPrincipalRef`, else the account owner. */
export async function enqueueAccountNotice(ctx: MutationCtx, input: {
  eventKind: Doc<'notificationDeliveries'>['eventKind']
  accountRef: string
  sourceEventRef: string
  recipientPrincipalRef?: string
}): Promise<'enqueued' | 'exists' | 'suppressed' | 'skipped'> {
  const recipientPrincipalRef = input.recipientPrincipalRef ?? await accountOwnerPrincipalRef(ctx.db, input.accountRef)
  if (recipientPrincipalRef === null) return 'skipped'
  return await enqueueEmail(ctx, {
    eventKind: input.eventKind,
    stream: 'transactional',
    recipientPrincipalRef,
    accountRef: input.accountRef,
    sourceEventRef: input.sourceEventRef,
  })
}

/** Payment stuck: a top-up still unconfirmed after the wait. Skipped when the command settled meanwhile. */
export async function enqueuePaymentStuckHandler(ctx: MutationCtx, args: { commandRef: string }): Promise<null> {
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (query) => query.eq('commandRef', args.commandRef)).unique()
  if (command === null || command.state === 'succeeded' || command.state === 'failed') return null
  await enqueueAccountNotice(ctx, {
    eventKind: 'task_stuck', accountRef: command.accountRef,
    sourceEventRef: command.commandRef, recipientPrincipalRef: command.actorPrincipalRef,
  })
  return null
}

/** Data export: the owner is told when their Account data was downloaded, once a day. Needs a signed-in caller. */
export async function enqueueDataExportHandler(ctx: MutationCtx): Promise<null> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return null
  const owner = await resolveInteractiveAuthorityContext(ctx, identity).catch(() => null)
  if (owner === null) return null
  await enqueueAccountNotice(ctx, {
    eventKind: 'data_request_received', accountRef: owner.accountRef,
    recipientPrincipalRef: owner.principalRef,
    sourceEventRef: dayBucketSourceRef(owner.principalRef, Date.now()),
  })
  return null
}
