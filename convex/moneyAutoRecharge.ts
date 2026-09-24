import type { GenericDatabaseReader, UserIdentity } from 'convex/server'
import { v } from 'convex/values'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { brandNonEmpty } from '../src/modules/common/ids'
import { redactPayload, validateAuditEvent } from '../src/modules/observability/public'
import { accountRef } from '../src/modules/principal-account/account/public'
import { principalRef } from '../src/modules/principal-account/principal/public'
import type { DataModel, Doc } from './_generated/dataModel'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import {
  InteractiveAuthorityError,
  requireAccessFactForAccount,
  resolveActiveAccountRefForPrincipal,
} from './interactiveAuthority'
import { persistAuditEvent } from './lib/security/audit/persistence'
import { CLERK_USER_PROVIDER_NAMESPACE } from './workspaceProvisioning'

const NON_NEGATIVE_UNITS_PATTERN = /^\d+$/u

const MIN_RECHARGE_UNITS = 5_000_000n
const MAX_RECHARGE_UNITS = 25_000_000_000n
const RECHARGE_INCREMENT_UNITS = 10_000n

const autoRechargeSettingsReadValue = v.object({
  kind: v.union(v.literal('missing'), v.literal('configured')),
  revision: v.number(),
  enabled: v.boolean(),
  thresholdUnits: v.string(),
  rechargeAmountUnits: v.string(),
})

const configureAutoRechargeReceiptValue = v.union(
  v.object({ kind: v.literal('updated'), revision: v.number() }),
  v.object({ kind: v.literal('replayed'), revision: v.number() }),
)

type AutoRechargeSettingsRead = Readonly<{
  kind: 'missing' | 'configured'
  revision: number
  enabled: boolean
  thresholdUnits: string
  rechargeAmountUnits: string
}>

type ConfigureAutoRechargeReceipt = Readonly<
  | { kind: 'updated'; revision: number }
  | { kind: 'replayed'; revision: number }
>

type AutoRechargeDb = GenericDatabaseReader<DataModel>

async function requireInteractiveHumanPrincipal(
  db: AutoRechargeDb,
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
  db: AutoRechargeDb,
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

function validateThresholdUnits(value: string): void {
  if (!NON_NEGATIVE_UNITS_PATTERN.test(value)) {
    throw new InteractiveAuthorityError('auto_recharge_units_invalid')
  }
}

function validateRechargeAmountUnits(value: string): void {
  if (!NON_NEGATIVE_UNITS_PATTERN.test(value)) {
    throw new InteractiveAuthorityError('funding_amount_invalid')
  }
  const units = BigInt(value)
  if (
    units < MIN_RECHARGE_UNITS
    || units > MAX_RECHARGE_UNITS
    || (units % RECHARGE_INCREMENT_UNITS !== 0n)
  ) {
    throw new InteractiveAuthorityError('funding_amount_invalid')
  }
}

function validateCorrelationRef(value: string): void {
  const sanitized = value.trim()
  if (sanitized.length < 3 || sanitized.length > 128) {
    throw new InteractiveAuthorityError('correlation_ref_invalid')
  }
}

async function requireReadyMandate(
  db: AutoRechargeDb,
  canonicalAccountRef: ReturnType<typeof accountRef>,
): Promise<void> {
  const binding = await db
    .query('moneyStripeCustomerBindings')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
    .unique()
  if (binding === null || binding.mandateState !== 'ready') {
    throw new InteractiveAuthorityError('payment_mandate_missing')
  }
}

async function recordAutoRechargeConfiguredAudit(
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
  const eventId = `audit:auto-recharge:${input.correlationRef}`
  const audit = validateAuditEvent({
    eventId: brandNonEmpty(eventId, 'AuditEventId'),
    eventType: 'billing.auto_recharge_configured',
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
  if (!audit.valid) throw new Error(`auto_recharge_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
}

export const readAutoRechargeSettings = query({
  args: {},
  returns: autoRechargeSettingsReadValue,
  handler: async (ctx: QueryCtx): Promise<AutoRechargeSettingsRead> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalAccountRef } = await requireAuthenticatedAccountContext(ctx.db, identity)

    const row = await ctx.db
      .query('moneyAutoRechargeSettings')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()

    if (row === null) {
      return {
        kind: 'missing',
        revision: 0,
        enabled: false,
        thresholdUnits: '0',
        rechargeAmountUnits: '0',
      }
    }

    return {
      kind: 'configured',
      revision: row.revision,
      enabled: row.enabled,
      thresholdUnits: row.thresholdUnits,
      rechargeAmountUnits: row.rechargeAmountUnits,
    }
  },
})

export const configureAutoRecharge = mutation({
  args: {
    enabled: v.boolean(),
    thresholdUnits: v.string(),
    rechargeAmountUnits: v.string(),
    expectedRevision: v.number(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
  },
  returns: configureAutoRechargeReceiptValue,
  handler: async (ctx: MutationCtx, args): Promise<ConfigureAutoRechargeReceipt> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const {
      principal,
      canonicalAccountRef,
      authorityGeneration,
    } = await requireAuthenticatedAccountContext(ctx.db, identity)

    validateCorrelationRef(args.correlationRef)
    validateThresholdUnits(args.thresholdUnits)
    validateRechargeAmountUnits(args.rechargeAmountUnits)

    if (args.enabled) {
      await requireReadyMandate(ctx.db, canonicalAccountRef)
    }

    const existing = await ctx.db
      .query('moneyAutoRechargeSettings')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()

    const currentRevision = existing?.revision ?? 0
    const now = Date.now()

    if (existing !== null && existing.lastCorrelationRef === args.correlationRef) {
      const isSamePayload =
        existing.enabled === args.enabled
        && existing.thresholdUnits === args.thresholdUnits
        && existing.rechargeAmountUnits === args.rechargeAmountUnits
      if (isSamePayload) {
        return { kind: 'replayed', revision: currentRevision }
      }
      throw new InteractiveAuthorityError('auto_recharge_correlation_mismatch')
    }

    if (args.expectedRevision !== currentRevision) {
      throw new InteractiveAuthorityError('auto_recharge_revision_conflict')
    }

    const nextRevision = currentRevision + 1
    const beforeState = existing === null
      ? 'missing'
      : canonicalDigest({
          enabled: existing.enabled,
          thresholdUnits: existing.thresholdUnits,
          rechargeAmountUnits: existing.rechargeAmountUnits,
        })
    const afterState = canonicalDigest({
      enabled: args.enabled,
      thresholdUnits: args.thresholdUnits,
      rechargeAmountUnits: args.rechargeAmountUnits,
    })

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        thresholdUnits: args.thresholdUnits,
        rechargeAmountUnits: args.rechargeAmountUnits,
        revision: nextRevision,
        lastCorrelationRef: args.correlationRef,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('moneyAutoRechargeSettings', {
        accountRef: canonicalAccountRef,
        enabled: args.enabled,
        currency: 'AUD',
        exponent: 6,
        thresholdUnits: args.thresholdUnits,
        rechargeAmountUnits: args.rechargeAmountUnits,
        revision: nextRevision,
        lastCorrelationRef: args.correlationRef,
        createdAt: now,
        updatedAt: now,
      })
    }

    await recordAutoRechargeConfiguredAudit(ctx.db, {
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
