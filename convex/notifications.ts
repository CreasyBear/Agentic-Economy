import type { GenericDatabaseReader, UserIdentity } from 'convex/server'
import { v } from 'convex/values'

import { accountRef } from '../src/modules/principal-account/account/public'
import { principalRef } from '../src/modules/principal-account/principal/public'
import type { DataModel, Doc } from './_generated/dataModel'
import { internalMutation, mutation, query } from './_generated/server'
import {
  InteractiveAuthorityError,
  requireAccessFactForAccount,
  resolveActiveAccountRefForPrincipal,
} from './interactiveAuthority'

const CLERK_USER_PROVIDER_NAMESPACE = 'clerk/user' as const
const CORRELATION_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u

const LEGAL_LOW_CREDIT_THRESHOLDS = new Set([1000, 2500, 5000])

const NOTIFICATION_EVENT_KINDS = [
  'low_credit_balance',
  'spend_cap_warning',
  'spend_cap_exceeded',
  'call_failure_spike',
  'invoice_ready',
  'team_membership_changed',
] as const

type NotificationEventKind = (typeof NOTIFICATION_EVENT_KINDS)[number]

type NotificationsDb = GenericDatabaseReader<DataModel>

const preferencesViewValue = v.object({
  principalRef: v.string(),
  accountRef: v.string(),
  lowCreditBalance: v.boolean(),
  lowCreditThresholdCents: v.number(),
  spendCapWarning: v.boolean(),
  callFailureSpike: v.boolean(),
  invoiceReady: v.boolean(),
  teamMembershipChanged: v.boolean(),
  revision: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  isVirtualDefault: v.boolean(),
})

const preferenceUpdateReceiptValue = v.object({
  kind: v.union(v.literal('updated'), v.literal('replayed')),
  revision: v.number(),
})

const dispatchResultValue = v.union(
  v.object({ kind: v.literal('accepted') }),
  v.object({ kind: v.literal('replayed') }),
  v.object({
    kind: v.literal('suppressed'),
    code: v.union(v.literal('preference_disabled'), v.literal('recipient_email_missing')),
  }),
  v.object({ kind: v.literal('refused'), code: v.literal('event_kind_invalid') }),
)

type PreferenceFields = Readonly<{
  lowCreditBalance: boolean
  lowCreditThresholdCents: number
  spendCapWarning: boolean
  callFailureSpike: boolean
  invoiceReady: boolean
  teamMembershipChanged: boolean
}>

const VIRTUAL_DEFAULT_PREFERENCE_FIELDS: PreferenceFields = {
  lowCreditBalance: true,
  lowCreditThresholdCents: 2500,
  spendCapWarning: true,
  callFailureSpike: true,
  invoiceReady: true,
  teamMembershipChanged: true,
}

function validateCorrelationRef(value: string): void {
  if (value.length < 3 || value.length > 128 || !CORRELATION_REF_PATTERN.test(value)) {
    throw new InteractiveAuthorityError('correlation_ref_invalid')
  }
}

function isNotificationEventKind(value: string): value is NotificationEventKind {
  return (NOTIFICATION_EVENT_KINDS as readonly string[]).includes(value)
}

async function requireInteractiveHumanPrincipal(
  db: NotificationsDb,
  identity: UserIdentity,
): Promise<Doc<'principals'>> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const bindings = await db
    .query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', tokenIdentifier))
    .take(2)
  if (bindings.length !== 1) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const [binding] = bindings
  if (binding === undefined || binding.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const principals = await db
    .query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .take(2)
  if (principals.length !== 1) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const [principal] = principals
  if (principal === undefined || principal.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  if (principal.kind !== 'human') {
    throw new InteractiveAuthorityError('principal_kind_invalid')
  }
  return principal
}

async function requireAuthenticatedAccountContext(
  db: NotificationsDb,
  identity: UserIdentity,
): Promise<{
  principal: Doc<'principals'>
  canonicalPrincipalRef: ReturnType<typeof principalRef>
  canonicalAccountRef: ReturnType<typeof accountRef>
}> {
  const principal = await requireInteractiveHumanPrincipal(db, identity)
  const canonicalPrincipalRef = principalRef(principal.principalRef)
  const { activeAccountRef } = await resolveActiveAccountRefForPrincipal(
    db,
    canonicalPrincipalRef,
    identity,
    'require',
  )
  const canonicalAccountRef = accountRef(activeAccountRef)
  await requireAccessFactForAccount(db, canonicalPrincipalRef, canonicalAccountRef)
  const account = await db
    .query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
    .unique()
  if (account === null) throw new InteractiveAuthorityError('account_missing')
  if (account.lifecycle !== 'active') throw new InteractiveAuthorityError('account_inactive')
  return { principal, canonicalPrincipalRef, canonicalAccountRef }
}

function preferenceFieldsFromRow(row: Doc<'userNotificationPreferences'>): PreferenceFields {
  return {
    lowCreditBalance: row.lowCreditBalance,
    lowCreditThresholdCents: row.lowCreditThresholdCents,
    spendCapWarning: row.spendCapWarning,
    callFailureSpike: row.callFailureSpike,
    invoiceReady: row.invoiceReady,
    teamMembershipChanged: row.teamMembershipChanged,
  }
}

function patchMatchesExisting(
  existing: Doc<'userNotificationPreferences'>,
  args: Readonly<{
    lowCreditBalance?: boolean
    lowCreditThresholdCents?: number
    spendCapWarning?: boolean
    callFailureSpike?: boolean
    invoiceReady?: boolean
    teamMembershipChanged?: boolean
  }>,
): boolean {
  if (args.lowCreditBalance !== undefined && args.lowCreditBalance !== existing.lowCreditBalance) {
    return false
  }
  if (
    args.lowCreditThresholdCents !== undefined
    && args.lowCreditThresholdCents !== existing.lowCreditThresholdCents
  ) {
    return false
  }
  if (args.spendCapWarning !== undefined && args.spendCapWarning !== existing.spendCapWarning) {
    return false
  }
  if (args.callFailureSpike !== undefined && args.callFailureSpike !== existing.callFailureSpike) {
    return false
  }
  if (args.invoiceReady !== undefined && args.invoiceReady !== existing.invoiceReady) {
    return false
  }
  if (
    args.teamMembershipChanged !== undefined
    && args.teamMembershipChanged !== existing.teamMembershipChanged
  ) {
    return false
  }
  return true
}

function mergePreferencePatch(
  base: PreferenceFields,
  args: Readonly<{
    lowCreditBalance?: boolean
    lowCreditThresholdCents?: number
    spendCapWarning?: boolean
    callFailureSpike?: boolean
    invoiceReady?: boolean
    teamMembershipChanged?: boolean
  }>,
): PreferenceFields {
  return {
    lowCreditBalance: args.lowCreditBalance ?? base.lowCreditBalance,
    lowCreditThresholdCents: args.lowCreditThresholdCents ?? base.lowCreditThresholdCents,
    spendCapWarning: args.spendCapWarning ?? base.spendCapWarning,
    callFailureSpike: args.callFailureSpike ?? base.callFailureSpike,
    invoiceReady: args.invoiceReady ?? base.invoiceReady,
    teamMembershipChanged: args.teamMembershipChanged ?? base.teamMembershipChanged,
  }
}

async function resolvePreferenceFields(
  db: NotificationsDb,
  recipientPrincipalRef: string,
  accountRefValue: string,
): Promise<PreferenceFields & { deliveryEmail?: string }> {
  const row = await db
    .query('userNotificationPreferences')
    .withIndex('by_principalRef_and_accountRef', (query) => query
      .eq('principalRef', recipientPrincipalRef)
      .eq('accountRef', accountRefValue))
    .unique()
  if (row === null) {
    return VIRTUAL_DEFAULT_PREFERENCE_FIELDS
  }
  const base = preferenceFieldsFromRow(row)
  return row.deliveryEmail !== undefined
    ? { ...base, deliveryEmail: row.deliveryEmail }
    : base
}

function eventKindEnabled(
  eventKind: NotificationEventKind,
  prefs: PreferenceFields,
): boolean {
  switch (eventKind) {
    case 'low_credit_balance':
      return prefs.lowCreditBalance
    case 'spend_cap_warning':
    case 'spend_cap_exceeded':
      return prefs.spendCapWarning
    case 'call_failure_spike':
      return prefs.callFailureSpike
    case 'invoice_ready':
      return prefs.invoiceReady
    case 'team_membership_changed':
      return prefs.teamMembershipChanged
    default: {
      const _exhaustive: never = eventKind
      return _exhaustive
    }
  }
}

async function resolveRecipientEmail(
  db: NotificationsDb,
  recipientPrincipalRef: string,
  prefs: Readonly<{ deliveryEmail?: string }>,
  recipientEmail?: string,
): Promise<string | null> {
  const fromArg = recipientEmail?.trim()
  if (fromArg !== undefined && fromArg.length > 0) return fromArg
  const fromPrefs = prefs.deliveryEmail?.trim()
  if (fromPrefs !== undefined && fromPrefs.length > 0) return fromPrefs
  const observed = await db
    .query('principalNotificationEmails')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', recipientPrincipalRef))
    .unique()
  const observedEmail = observed?.email.trim()
  if (observedEmail !== undefined && observedEmail.length > 0) return observedEmail
  return null
}

export const readPreferences = query({
  args: {},
  returns: preferencesViewValue,
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { principal, canonicalPrincipalRef, canonicalAccountRef } =
      await requireAuthenticatedAccountContext(ctx.db, identity)

    const row = await ctx.db
      .query('userNotificationPreferences')
      .withIndex('by_principalRef_and_accountRef', (query) => query
        .eq('principalRef', principal.principalRef)
        .eq('accountRef', canonicalAccountRef))
      .unique()

    if (row !== null) {
      return {
        principalRef: canonicalPrincipalRef,
        accountRef: canonicalAccountRef,
        ...preferenceFieldsFromRow(row),
        revision: row.revision,
        updatedAt: row.updatedAt,
        isVirtualDefault: false,
      }
    }

    return {
      principalRef: canonicalPrincipalRef,
      accountRef: canonicalAccountRef,
      ...VIRTUAL_DEFAULT_PREFERENCE_FIELDS,
      revision: 0,
      updatedAt: null,
      isVirtualDefault: true,
    }
  },
})

export const updatePreferences = mutation({
  args: {
    lowCreditBalance: v.optional(v.boolean()),
    lowCreditThresholdCents: v.optional(v.number()),
    spendCapWarning: v.optional(v.boolean()),
    callFailureSpike: v.optional(v.boolean()),
    invoiceReady: v.optional(v.boolean()),
    teamMembershipChanged: v.optional(v.boolean()),
    expectedRevision: v.number(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
  },
  returns: preferenceUpdateReceiptValue,
  handler: async (ctx, args) => {
    validateCorrelationRef(args.correlationRef)
    if (
      args.lowCreditThresholdCents !== undefined
      && !LEGAL_LOW_CREDIT_THRESHOLDS.has(args.lowCreditThresholdCents)
    ) {
      throw new InteractiveAuthorityError('threshold_invalid')
    }

    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { principal, canonicalAccountRef } =
      await requireAuthenticatedAccountContext(ctx.db, identity)

    const existing = await ctx.db
      .query('userNotificationPreferences')
      .withIndex('by_principalRef_and_accountRef', (query) => query
        .eq('principalRef', principal.principalRef)
        .eq('accountRef', canonicalAccountRef))
      .unique()

    const currentRevision = existing?.revision ?? 0

    if (
      existing !== null
      && existing.lastCorrelationRef === args.correlationRef
      && patchMatchesExisting(existing, args)
    ) {
      return { kind: 'replayed' as const, revision: existing.revision }
    }

    if (args.expectedRevision !== currentRevision) {
      throw new InteractiveAuthorityError('preference_revision_conflict')
    }

    const baseFields = existing === null
      ? VIRTUAL_DEFAULT_PREFERENCE_FIELDS
      : preferenceFieldsFromRow(existing)
    const merged = mergePreferencePatch(baseFields, args)
    const now = Date.now()
    const nextRevision = currentRevision + 1

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        ...merged,
        lowCreditThresholdCents: merged.lowCreditThresholdCents as 1000 | 2500 | 5000,
        revision: nextRevision,
        updatedAt: now,
        lastCorrelationRef: args.correlationRef,
      })
    } else {
      await ctx.db.insert('userNotificationPreferences', {
        principalRef: principal.principalRef,
        accountRef: canonicalAccountRef,
        ...merged,
        lowCreditThresholdCents: merged.lowCreditThresholdCents as 1000 | 2500 | 5000,
        revision: nextRevision,
        updatedAt: now,
        lastCorrelationRef: args.correlationRef,
      })
    }

    return { kind: 'updated' as const, revision: nextRevision }
  },
})

export const dispatchNotificationInternal = internalMutation({
  args: {
    recipientPrincipalRef: v.string(),
    accountRef: v.string(),
    eventKind: v.string(),
    sourceEventRef: v.string(),
    payload: v.optional(v.string()),
    recipientEmail: v.optional(v.string()),
    correlationRef: v.string(),
  },
  returns: dispatchResultValue,
  handler: async (ctx, args) => {
    if (!isNotificationEventKind(args.eventKind)) {
      return { kind: 'refused' as const, code: 'event_kind_invalid' as const }
    }

    const canonicalAccountRef = accountRef(args.accountRef)
    const eventKind = args.eventKind as NotificationEventKind
    const existingDelivery = await ctx.db
      .query('notificationDeliveries')
      .withIndex(
        'by_recipient_account_event_source',
        (query) => query
          .eq('recipientPrincipalRef', args.recipientPrincipalRef)
          .eq('accountRef', canonicalAccountRef)
          .eq('eventKind', eventKind)
          .eq('sourceEventRef', args.sourceEventRef),
      )
      .unique()
    if (existingDelivery !== null) {
      return { kind: 'replayed' as const }
    }

    const prefs = await resolvePreferenceFields(
      ctx.db,
      args.recipientPrincipalRef,
      canonicalAccountRef,
    )
    if (!eventKindEnabled(args.eventKind, prefs)) {
      return { kind: 'suppressed' as const, code: 'preference_disabled' as const }
    }

    const email = await resolveRecipientEmail(
      ctx.db,
      args.recipientPrincipalRef,
      prefs,
      args.recipientEmail,
    )
    if (email === null) {
      return { kind: 'suppressed' as const, code: 'recipient_email_missing' as const }
    }

    const now = Date.now()
    const deliveryRef = `del_${crypto.randomUUID().replace(/-/g, '')}`
    await ctx.db.insert('notificationDeliveries', {
      deliveryRef,
      recipientPrincipalRef: args.recipientPrincipalRef,
      accountRef: canonicalAccountRef,
      eventKind: args.eventKind,
      sourceEventRef: args.sourceEventRef,
      state: 'pending',
      createdAt: now,
      updatedAt: now,
    })

    return { kind: 'accepted' as const }
  },
})
