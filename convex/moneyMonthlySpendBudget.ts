import type { GenericDatabaseReader, UserIdentity } from 'convex/server'
import { v } from 'convex/values'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { brandNonEmpty } from '../src/modules/common/ids'
import { redactPayload, validateAuditEvent } from '../src/modules/observability/public'
import { accountRef } from '../src/modules/principal-account/account/public'
import { principalRef } from '../src/modules/principal-account/principal/public'
import type { DataModel, Doc } from './_generated/dataModel'
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import {
  InteractiveAuthorityError,
  requireAccessFactForAccount,
  resolveActiveAccountRefForPrincipal,
} from './interactiveAuthority'
import { persistAuditEvent } from './lib/security/audit/persistence'
import { CLERK_USER_PROVIDER_NAMESPACE } from './workspaceProvisioning'

const NON_NEGATIVE_UNITS_PATTERN = /^\d+$/u

const monthlySpendBudgetReadValue = v.object({
  kind: v.union(v.literal('missing'), v.literal('configured')),
  revision: v.number(),
  enabled: v.boolean(),
  ceilingUnits: v.string(),
})

const configureMonthlySpendBudgetReceiptValue = v.union(
  v.object({ kind: v.literal('updated'), revision: v.number() }),
  v.object({ kind: v.literal('replayed'), revision: v.number() }),
)

type MonthlySpendBudgetRead = Readonly<{
  kind: 'missing' | 'configured'
  revision: number
  enabled: boolean
  ceilingUnits: string
}>

type ConfigureMonthlySpendBudgetReceipt = Readonly<
  | { kind: 'updated'; revision: number }
  | { kind: 'replayed'; revision: number }
>

type MonthlySpendBudgetDb = GenericDatabaseReader<DataModel>

async function requireInteractiveHumanPrincipal(
  db: MonthlySpendBudgetDb,
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
  db: MonthlySpendBudgetDb,
  identity: UserIdentity,
): Promise<{
  principal: Doc<'principals'>
  canonicalPrincipalRef: ReturnType<typeof principalRef>
  canonicalAccountRef: ReturnType<typeof accountRef>
  authorityGeneration: number
}> {
  const principal = await requireInteractiveHumanPrincipal(db, identity)
  const canonicalPrincipalRef = principalRef(principal.principalRef)
  const res = await resolveActiveAccountRefForPrincipal(
    db,
    canonicalPrincipalRef,
    identity,
    'require',
  )
  const canonicalAccountRef = accountRef(res.activeAccountRef)
  const access = await requireAccessFactForAccount(db, canonicalPrincipalRef, canonicalAccountRef)
  if (access.kind !== 'ownership') {
    throw new InteractiveAuthorityError('authority_mismatch')
  }
  const account = await db
    .query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
    .unique()
  if (account === null) throw new InteractiveAuthorityError('account_missing')
  if (account.lifecycle !== 'active') throw new InteractiveAuthorityError('account_inactive')
  return {
    principal,
    canonicalPrincipalRef,
    canonicalAccountRef,
    authorityGeneration: account.revision,
  }
}

function validateCeilingUnits(value: string): void {
  if (!NON_NEGATIVE_UNITS_PATTERN.test(value)) {
    throw new InteractiveAuthorityError('monthly_spend_budget_units_invalid')
  }
}

function validateCorrelationRef(value: string): void {
  const sanitized = value.trim()
  if (sanitized.length < 3 || sanitized.length > 128) {
    throw new InteractiveAuthorityError('correlation_ref_invalid')
  }
}

async function recordMonthlySpendCeilingConfiguredAudit(
  db: MutationCtx['db'],
  input: Readonly<{
    actorPrincipalRef: string
    activeAccountRef: string
    authorityGeneration: number
    correlationRef: string
    idempotencyRef: string
    beforeState: string
    afterState: string
    createdAt: number
  }>,
): Promise<void> {
  const commandDigest = canonicalDigest({
    enabled: input.afterState,
    correlationRef: input.correlationRef,
    idempotencyRef: input.idempotencyRef,
  })
  const eventId = `audit:monthly-spend-ceiling:${input.correlationRef}`
  const audit = validateAuditEvent({
    eventId: brandNonEmpty(eventId, 'AuditEventId'),
    eventType: 'billing.monthly_spend_ceiling_configured',
    actorKind: 'owner',
    actorRef: input.actorPrincipalRef,
    activeAccountRef: input.activeAccountRef,
    authorityGeneration: input.authorityGeneration,
    sourceSystem: 'ae_recorded',
    targetType: 'billing',
    targetRef: input.activeAccountRef,
    idempotencyKey: brandNonEmpty(input.idempotencyRef, 'OperationKey'),
    correlationId: brandNonEmpty(input.correlationRef, 'CorrelationId'),
    beforeState: input.beforeState,
    afterState: input.afterState,
    evidenceRefs: [],
    redactedPayload: redactPayload({
      correlationRef: input.correlationRef,
    }),
    payloadHash: brandNonEmpty(commandDigest, 'SourceHash'),
    createdAt: input.createdAt,
  })
  if (!audit.valid) throw new Error(`monthly_spend_ceiling_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
}

export const readMonthlySpendBudget = query({
  args: {},
  returns: monthlySpendBudgetReadValue,
  handler: async (ctx: QueryCtx): Promise<MonthlySpendBudgetRead> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalAccountRef } = await requireAuthenticatedAccountContext(ctx.db, identity)

    const row = await ctx.db
      .query('moneyMonthlySpendBudgets')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()

    if (row === null) {
      return {
        kind: 'missing',
        revision: 0,
        enabled: false,
        ceilingUnits: '0',
      }
    }

    return {
      kind: 'configured',
      revision: row.revision,
      enabled: row.enabled,
      ceilingUnits: row.ceilingUnits,
    }
  },
})

export const configureMonthlySpendBudget = mutation({
  args: {
    enabled: v.boolean(),
    ceilingUnits: v.string(),
    expectedRevision: v.number(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
  },
  returns: configureMonthlySpendBudgetReceiptValue,
  handler: async (ctx: MutationCtx, args): Promise<ConfigureMonthlySpendBudgetReceipt> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const {
      principal,
      canonicalAccountRef,
      authorityGeneration,
    } = await requireAuthenticatedAccountContext(ctx.db, identity)

    validateCorrelationRef(args.correlationRef)
    validateCeilingUnits(args.ceilingUnits)

    const existing = await ctx.db
      .query('moneyMonthlySpendBudgets')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()

    const currentRevision = existing?.revision ?? 0
    const now = Date.now()

    if (existing !== null && existing.lastCorrelationRef === args.correlationRef) {
      const isSamePayload =
        existing.enabled === args.enabled
        && existing.ceilingUnits === args.ceilingUnits
      if (isSamePayload) {
        return { kind: 'replayed', revision: currentRevision }
      }
      throw new InteractiveAuthorityError('monthly_spend_budget_correlation_mismatch')
    }

    if (args.expectedRevision !== currentRevision) {
      throw new InteractiveAuthorityError('monthly_spend_budget_revision_conflict')
    }

    const nextRevision = currentRevision + 1
    const beforeState = existing === null
      ? 'missing'
      : canonicalDigest({
          enabled: existing.enabled,
          ceilingUnits: existing.ceilingUnits,
        })
    const afterState = canonicalDigest({
      enabled: args.enabled,
      ceilingUnits: args.ceilingUnits,
    })

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        ceilingUnits: args.ceilingUnits,
        revision: nextRevision,
        lastCorrelationRef: args.correlationRef,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('moneyMonthlySpendBudgets', {
        accountRef: canonicalAccountRef,
        enabled: args.enabled,
        currency: 'AUD',
        exponent: 6,
        ceilingUnits: args.ceilingUnits,
        revision: nextRevision,
        lastCorrelationRef: args.correlationRef,
        createdAt: now,
        updatedAt: now,
      })
    }

    await recordMonthlySpendCeilingConfiguredAudit(ctx.db, {
      actorPrincipalRef: principal.principalRef,
      activeAccountRef: canonicalAccountRef,
      authorityGeneration,
      correlationRef: args.correlationRef,
      idempotencyRef: args.idempotencyRef,
      beforeState,
      afterState,
      createdAt: now,
    })

    return { kind: 'updated', revision: nextRevision }
  },
})

export const readOrganizationMonthlySpendBudgetForAccount = internalQuery({
  args: { accountRef: v.string() },
  returns: v.object({
    enabled: v.boolean(),
    ceilingUnits: v.string(),
  }),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('moneyMonthlySpendBudgets')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', args.accountRef))
      .unique()
    if (row === null || !row.enabled) {
      return { enabled: false, ceilingUnits: '0' }
    }
    return { enabled: true, ceilingUnits: row.ceilingUnits }
  },
})
