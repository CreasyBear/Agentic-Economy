import { usageAlertPolicyInputValue,usageAlertPolicyValue } from '@/modules/principal-account/account/public'
import type { UsageAlertPolicy } from '@/modules/principal-account/notification-preferences.view-model'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { readUsagePolicyReplay,recordUsagePolicyAudit } from './usagePolicyAudit'
import type { UnsubscribePayload, UnsubscribeStream } from './unsubscribe'
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
  agentApprovalRequested: v.boolean(),
  stalledStepEmails: v.boolean(),
  revision: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  isVirtualDefault: v.boolean(),
  usageAlertPolicy:v.optional(usageAlertPolicyValue),
})

export const updatePreferencesArgs = {
  usageAlertPolicy:v.optional(usageAlertPolicyInputValue),
  lowCreditBalance: v.optional(v.boolean()),
  lowCreditThresholdCents: v.optional(v.number()),
  spendCapWarning: v.optional(v.boolean()),
  callFailureSpike: v.optional(v.boolean()),
  invoiceReady: v.optional(v.boolean()),
  teamMembershipChanged: v.optional(v.boolean()),
  agentApprovalRequested: v.optional(v.boolean()),
  stalledStepEmails: v.optional(v.boolean()),
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
  agentApprovalRequested: boolean
  stalledStepEmails: boolean
}>

const VIRTUAL_DEFAULT_PREFERENCE_FIELDS: PreferenceFields = {
  lowCreditBalance: true,
  lowCreditThresholdCents: 2500,
  spendCapWarning: true,
  callFailureSpike: true,
  invoiceReady: true,
  teamMembershipChanged: true,
  agentApprovalRequested: true,
  stalledStepEmails: false,
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
  authorityRevisionAccount:number
}> {
  const principal = await requireInteractiveHumanPrincipal(db, identity)
  const canonicalPrincipalRef = principalRef(principal.principalRef)
  const { activeAccountRef } = await resolveActiveAccountRefForPrincipal(db, canonicalPrincipalRef, identity)
  const canonicalAccountRef = accountRef(activeAccountRef)
  await requireAccessFactForAccount(db, canonicalPrincipalRef, canonicalAccountRef)
  const account = await db
    .query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
    .unique()
  if (account === null) throw new InteractiveAuthorityError('account_missing')
  if (account.lifecycle !== 'active') throw new InteractiveAuthorityError('account_inactive')
  return { principal, canonicalPrincipalRef, canonicalAccountRef,authorityRevisionAccount:account.revision }
}

function preferenceFieldsFromRow(row: Doc<'userNotificationPreferences'>): PreferenceFields {
  return {
    lowCreditBalance: row.lowCreditBalance,
    lowCreditThresholdCents: row.lowCreditThresholdCents,
    spendCapWarning: row.spendCapWarning,
    callFailureSpike: row.callFailureSpike,
    invoiceReady: row.invoiceReady,
    teamMembershipChanged: row.teamMembershipChanged,
    agentApprovalRequested: row.agentApprovalRequested ?? true,
    stalledStepEmails: row.stalledStepEmails ?? false,
  }
}

function patchMatchesExisting(
  existing: Doc<'userNotificationPreferences'>,
  args: Readonly<{
    usageAlertPolicy?:UsageAlertPolicy
    lowCreditBalance?: boolean
    lowCreditThresholdCents?: number
    spendCapWarning?: boolean
    callFailureSpike?: boolean
    invoiceReady?: boolean
    teamMembershipChanged?: boolean
    agentApprovalRequested?: boolean
    stalledStepEmails?: boolean
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
  if (
    args.agentApprovalRequested !== undefined
    && args.agentApprovalRequested !== (existing.agentApprovalRequested ?? true)
  ) {
    return false
  }
  if (
    args.stalledStepEmails !== undefined
    && args.stalledStepEmails !== (existing.stalledStepEmails ?? false)
  ) {
    return false
  }
  if(args.usageAlertPolicy!==undefined){const policy=existing.usageAlertPolicy
    if(policy===undefined||canonicalDigest(args.usageAlertPolicy)!==canonicalDigest({enabled:policy.enabled,failurePercent:policy.failurePercent,minimumCalls:policy.minimumCalls,spendWarningPercent:policy.spendWarningPercent}))return false}
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
    agentApprovalRequested?: boolean
    stalledStepEmails?: boolean
  }>,
): PreferenceFields {
  return {
    lowCreditBalance: args.lowCreditBalance ?? base.lowCreditBalance,
    lowCreditThresholdCents: args.lowCreditThresholdCents ?? base.lowCreditThresholdCents,
    spendCapWarning: args.spendCapWarning ?? base.spendCapWarning,
    callFailureSpike: args.callFailureSpike ?? base.callFailureSpike,
    invoiceReady: args.invoiceReady ?? base.invoiceReady,
    teamMembershipChanged: args.teamMembershipChanged ?? base.teamMembershipChanged,
    agentApprovalRequested: args.agentApprovalRequested ?? base.agentApprovalRequested,
    stalledStepEmails: args.stalledStepEmails ?? base.stalledStepEmails,
  }
}

export const unsubscribeEmailStreamArgs = {
  principalRef: v.string(),
  accountRef: v.string(),
  stream: v.union(v.literal('alert'), v.literal('lifecycle')),
}

const STREAM_OFF_FIELDS: Record<UnsubscribeStream, Partial<PreferenceFields>> = {
  alert: { lowCreditBalance: false, spendCapWarning: false, callFailureSpike: false },
  lifecycle: { stalledStepEmails: false },
}

/** Called only after the HMAC token is verified. Flips the stream's toggles and nothing else. */
export async function unsubscribeEmailStreamHandler(
  ctx: MutationCtx,
  args: UnsubscribePayload,
): Promise<boolean> {
  const existing = await ctx.db
    .query('userNotificationPreferences')
    .withIndex('by_principalRef_and_accountRef', (query) => query
      .eq('principalRef', args.principalRef)
      .eq('accountRef', args.accountRef))
    .unique()
  const base = existing === null ? VIRTUAL_DEFAULT_PREFERENCE_FIELDS : preferenceFieldsFromRow(existing)
  const off = STREAM_OFF_FIELDS[args.stream]
  if (existing !== null && Object.entries(off).every(([key, value]) => base[key as keyof PreferenceFields] === value)) {
    return true
  }

  const merged = { ...base, ...off }
  const now = Date.now()
  const lastCorrelationRef = `unsubscribe:${args.stream}`
  if (existing === null) {
    await ctx.db.insert('userNotificationPreferences', {
      principalRef: args.principalRef,
      accountRef: args.accountRef,
      ...merged,
      lowCreditThresholdCents: merged.lowCreditThresholdCents as 1000 | 2500 | 5000,
      revision: 1,
      updatedAt: now,
      lastCorrelationRef,
    })
  } else {
    await ctx.db.patch(existing._id, {
      ...merged,
      lowCreditThresholdCents: merged.lowCreditThresholdCents as 1000 | 2500 | 5000,
      revision: existing.revision + 1,
      updatedAt: now,
      lastCorrelationRef,
    })
  }
  return true
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
      ...(row.usageAlertPolicy===undefined?{}:{usageAlertPolicy:row.usageAlertPolicy}),
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
    usageAlertPolicy?:UsageAlertPolicy
    lowCreditBalance?: boolean
    lowCreditThresholdCents?: number
    spendCapWarning?: boolean
    callFailureSpike?: boolean
    invoiceReady?: boolean
    agentApprovalRequested?: boolean
    stalledStepEmails?: boolean
    teamMembershipChanged?: boolean
    expectedRevision: number
    correlationRef: string
    idempotencyRef: string
  },
) {
  validateCorrelationRef(args.correlationRef)
  if(args.usageAlertPolicy!==undefined)validateCorrelationRef(args.idempotencyRef)
  if (
    args.lowCreditThresholdCents !== undefined
    && !LEGAL_LOW_CREDIT_THRESHOLDS.has(args.lowCreditThresholdCents)
  ) {
    throw new InteractiveAuthorityError('threshold_invalid')
  }

  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
  const { principal, canonicalAccountRef,authorityRevisionAccount } =
    await requireAuthenticatedAccountContext(ctx.db, identity)

  if(args.usageAlertPolicy!==undefined){
    const policy=args.usageAlertPolicy
    if(!Number.isSafeInteger(policy.failurePercent)||policy.failurePercent<1||policy.failurePercent>100||!Number.isSafeInteger(policy.minimumCalls)||policy.minimumCalls<1||policy.minimumCalls>100000||!Number.isSafeInteger(policy.spendWarningPercent)||policy.spendWarningPercent<1||policy.spendWarningPercent>100)throw new InteractiveAuthorityError('threshold_invalid')
    const access=await requireAccessFactForAccount(ctx.db,principalRef(principal.principalRef),canonicalAccountRef)
    if(access.kind!=='ownership')throw new InteractiveAuthorityError('authority_mismatch')
  }
  const usageAlertPolicy=args.usageAlertPolicy===undefined?undefined:{...args.usageAlertPolicy,authorityRevisionAccount}
  const existing = await ctx.db
    .query('userNotificationPreferences')
    .withIndex('by_principalRef_and_accountRef', (query) => query
      .eq('principalRef', principal.principalRef)
      .eq('accountRef', canonicalAccountRef))
    .unique()

  const currentRevision = existing?.revision ?? 0
  const requestDigest=usageAlertPolicy===undefined?undefined:canonicalDigest({format:'ae.usage-alert-request:v1',accountRef:canonicalAccountRef,principalRef:principal.principalRef,authorityRevisionAccount,patch:Object.fromEntries(Object.entries(args).filter(([key,value])=>key!=='correlationRef'&&value!==undefined))})
  if(requestDigest!==undefined){
    const replay=await readUsagePolicyReplay(ctx,{accountRef:canonicalAccountRef,idempotencyRef:args.idempotencyRef,requestDigest})
    if(replay?.kind==='conflict')throw new InteractiveAuthorityError('preference_revision_conflict')
    if(replay?.kind==='replayed')return replay
  }

  if (
    existing !== null
    && existing.lastCorrelationRef === args.correlationRef
    && patchMatchesExisting(existing, args)
    && (usageAlertPolicy===undefined||existing.usageAlertPolicy?.authorityRevisionAccount===authorityRevisionAccount)
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
      ...(usageAlertPolicy===undefined?{}:{usageAlertPolicy}),
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
      ...(usageAlertPolicy===undefined?{}:{usageAlertPolicy}),
      lowCreditThresholdCents: merged.lowCreditThresholdCents as 1000 | 2500 | 5000,
      revision: nextRevision,
      updatedAt: now,
      lastCorrelationRef: args.correlationRef,
    })
  }

  if(usageAlertPolicy!==undefined&&requestDigest!==undefined)await recordUsagePolicyAudit(ctx,{accountRef:canonicalAccountRef,principalRef:principal.principalRef,authorityRevisionAccount,idempotencyRef:args.idempotencyRef,correlationRef:args.correlationRef,before:existing?.usageAlertPolicy,after:usageAlertPolicy,requestDigest,revision:nextRevision})
  return { kind: 'updated' as const, revision: nextRevision }
}
