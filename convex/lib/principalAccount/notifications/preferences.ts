import type { GenericDatabaseReader, UserIdentity } from 'convex/server'
import { v } from 'convex/values'

import { accountRef } from '../../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../../src/modules/principal-account/principal/public'
import type { DataModel, Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import {
  InteractiveAuthorityError,
  requireAccessFactForAccount,
  resolveActiveAccountRefForPrincipal,
} from '../../../interactiveAuthority'

const CLERK_USER_PROVIDER_NAMESPACE = 'clerk/user' as const
const CORRELATION_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u

const LEGAL_LOW_CREDIT_THRESHOLDS = new Set([1000, 2500, 5000])

type NotificationsDb = GenericDatabaseReader<DataModel>

export const readPreferencesArgs = {}
export const readPreferencesResult = v.object({
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

export const updatePreferencesArgs = {
  lowCreditBalance: v.optional(v.boolean()),
  lowCreditThresholdCents: v.optional(v.number()),
  spendCapWarning: v.optional(v.boolean()),
  callFailureSpike: v.optional(v.boolean()),
  invoiceReady: v.optional(v.boolean()),
  teamMembershipChanged: v.optional(v.boolean()),
  expectedRevision: v.number(),
  correlationRef: v.string(),
  idempotencyRef: v.string(),
}
export const updatePreferencesResult = v.object({
  kind: v.union(v.literal('updated'), v.literal('replayed')),
  revision: v.number(),
})

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

export async function readPreferencesHandler(ctx: QueryCtx) {
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
}

export async function updatePreferencesHandler(
  ctx: MutationCtx,
  args: {
    lowCreditBalance?: boolean
    lowCreditThresholdCents?: number
    spendCapWarning?: boolean
    callFailureSpike?: boolean
    invoiceReady?: boolean
    teamMembershipChanged?: boolean
    expectedRevision: number
    correlationRef: string
    idempotencyRef: string
  },
) {
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
}
