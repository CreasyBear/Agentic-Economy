import type { GenericDatabaseReader, UserIdentity } from 'convex/server'
import { v } from 'convex/values'

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
import { resolveAndBindLegalCustomer } from './lib/money/legalCustomer/binding'
import { persistAuditEvent } from './securityShared'
import { CLERK_USER_PROVIDER_NAMESPACE } from './workspaceProvisioning'

const STRIPE_CUSTOMER_ID_PATTERN = /^cus_[A-Za-z0-9_]+$/u

const upsertStripeCustomerBindingReceiptValue = v.union(
  v.object({ kind: v.literal('updated'), revision: v.number() }),
  v.object({ kind: v.literal('replayed'), revision: v.number() }),
)

const observeStripePaymentMandateReceiptValue = v.union(
  v.object({
    kind: v.literal('updated'),
    revision: v.number(),
    mandateState: v.union(v.literal('ready'), v.literal('missing')),
  }),
  v.object({
    kind: v.literal('replayed'),
    revision: v.number(),
    mandateState: v.union(v.literal('ready'), v.literal('missing')),
  }),
)

const recordBillingPortalStartedReceiptValue = v.object({
  kind: v.literal('recorded'),
})

const stripeCustomerBindingReadValue = v.object({
  accountRef: v.string(),
  binding: v.union(
    v.null(),
    v.object({
      legalCustomerRef: v.string(),
      stripeCustomerId: v.string(),
      mandateState: v.union(
        v.literal('missing'),
        v.literal('ready'),
        v.literal('authentication_required'),
        v.literal('failed'),
      ),
      revision: v.number(),
    }),
  ),
})

type UpsertStripeCustomerBindingReceipt = Readonly<
  | { kind: 'updated'; revision: number }
  | { kind: 'replayed'; revision: number }
>

type ObserveStripePaymentMandateReceipt = Readonly<
  | { kind: 'updated'; revision: number; mandateState: 'ready' | 'missing' }
  | { kind: 'replayed'; revision: number; mandateState: 'ready' | 'missing' }
>

type RecordBillingPortalStartedReceipt = Readonly<{ kind: 'recorded' }>

type StripeCustomerDb = GenericDatabaseReader<DataModel>

async function requireInteractiveHumanPrincipal(
  db: StripeCustomerDb,
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
  db: StripeCustomerDb,
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

function validateCorrelationRef(value: string): void {
  const sanitized = value.trim()
  if (sanitized.length < 3 || sanitized.length > 128) {
    throw new InteractiveAuthorityError('correlation_ref_invalid')
  }
}

function validateStripeCustomerId(value: string): void {
  if (!STRIPE_CUSTOMER_ID_PATTERN.test(value)) {
    throw new InteractiveAuthorityError('payment_binding_invalid')
  }
}

function correlationStorageRef(correlationRef: string): string {
  return `corr:${correlationRef}`
}

export const readStripeCustomerBinding = query({
  args: {},
  returns: stripeCustomerBindingReadValue,
  handler: async (ctx: QueryCtx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalAccountRef } = await requireAuthenticatedAccountContext(ctx.db, identity)
    const row = await ctx.db
      .query('moneyStripeCustomerBindings')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()
    if (row === null) {
      return { accountRef: canonicalAccountRef, binding: null }
    }
    return {
      accountRef: canonicalAccountRef,
      binding: {
        legalCustomerRef: row.legalCustomerRef,
        stripeCustomerId: row.stripeCustomerId,
        mandateState: row.mandateState,
        revision: row.revision,
      },
    }
  },
})

export const upsertStripeCustomerBinding = mutation({
  args: {
    stripeCustomerId: v.string(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
  },
  returns: upsertStripeCustomerBindingReceiptValue,
  handler: async (ctx: MutationCtx, args): Promise<UpsertStripeCustomerBindingReceipt> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalAccountRef } = await requireAuthenticatedAccountContext(ctx.db, identity)

    validateCorrelationRef(args.correlationRef)
    validateStripeCustomerId(args.stripeCustomerId)

    const existing = await ctx.db
      .query('moneyStripeCustomerBindings')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()

    const currentRevision = existing?.revision ?? 0
    const correlationMarker = correlationStorageRef(args.correlationRef)

    if (
      existing !== null
      && existing.setupExternalRef === correlationMarker
      && existing.stripeCustomerId === args.stripeCustomerId
    ) {
      return { kind: 'replayed', revision: currentRevision }
    }

    const now = Date.now()
    const legalCustomerResult = await resolveAndBindLegalCustomer(ctx, canonicalAccountRef, now)
    if (legalCustomerResult.kind === 'refused') {
      throw new InteractiveAuthorityError(legalCustomerResult.code)
    }
    const legalCustomerRef = legalCustomerResult.legalCustomerRef

    const nextRevision = currentRevision + 1

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        stripeCustomerId: args.stripeCustomerId,
        legalCustomerRef,
        mandateState: 'missing',
        revision: nextRevision,
        setupExternalRef: correlationMarker,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('moneyStripeCustomerBindings', {
        accountRef: canonicalAccountRef,
        legalCustomerRef,
        stripeCustomerId: args.stripeCustomerId,
        mandateState: 'missing',
        revision: nextRevision,
        setupExternalRef: correlationMarker,
        createdAt: now,
        updatedAt: now,
      })
    }

    return { kind: 'updated', revision: nextRevision }
  },
})

export const observeStripePaymentMandate = mutation({
  args: {
    mandateState: v.union(v.literal('ready'), v.literal('missing')),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
    expectedRevision: v.number(),
  },
  returns: observeStripePaymentMandateReceiptValue,
  handler: async (ctx: MutationCtx, args): Promise<ObserveStripePaymentMandateReceipt> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalAccountRef } = await requireAuthenticatedAccountContext(ctx.db, identity)

    validateCorrelationRef(args.correlationRef)

    const existing = await ctx.db
      .query('moneyStripeCustomerBindings')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()
    if (existing === null) {
      throw new InteractiveAuthorityError('payment_binding_invalid')
    }

    const correlationMarker = correlationStorageRef(args.correlationRef)
    if (
      existing.setupExternalRef === correlationMarker
      && existing.mandateState === args.mandateState
    ) {
      return {
        kind: 'replayed',
        revision: existing.revision,
        mandateState: args.mandateState,
      }
    }

    if (args.expectedRevision !== existing.revision) {
      throw new InteractiveAuthorityError('payment_binding_revision_conflict')
    }

    const nextRevision = existing.revision + 1
    const now = Date.now()
    await ctx.db.patch(existing._id, {
      mandateState: args.mandateState,
      revision: nextRevision,
      setupExternalRef: correlationMarker,
      updatedAt: now,
    })

    return {
      kind: 'updated',
      revision: nextRevision,
      mandateState: args.mandateState,
    }
  },
})

export const recordBillingPortalStarted = mutation({
  args: {
    correlationRef: v.string(),
    idempotencyRef: v.string(),
  },
  returns: recordBillingPortalStartedReceiptValue,
  handler: async (ctx: MutationCtx, args): Promise<RecordBillingPortalStartedReceipt> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const {
      principal,
      canonicalAccountRef,
      authorityGeneration,
    } = await requireAuthenticatedAccountContext(ctx.db, identity)

    validateCorrelationRef(args.correlationRef)

    const now = Date.now()
    const eventId = `audit:billing-portal:${args.correlationRef}`
    const audit = validateAuditEvent({
      eventId: brandNonEmpty(eventId, 'AuditEventId'),
      eventType: 'billing.portal_started',
      actorKind: 'owner',
      actorRef: principal.principalRef,
      activeAccountRef: canonicalAccountRef,
      authorityGeneration,
      sourceSystem: 'ae_recorded',
      targetType: 'billing',
      targetRef: canonicalAccountRef,
      idempotencyKey: brandNonEmpty(args.idempotencyRef, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationRef, 'CorrelationId'),
      beforeState: 'idle',
      afterState: 'portal_started',
      evidenceRefs: [],
      redactedPayload: redactPayload({
        correlationRef: args.correlationRef,
      }),
      payloadHash: brandNonEmpty(args.idempotencyRef, 'SourceHash'),
      createdAt: now,
    })
    if (!audit.valid) throw new Error(`billing_portal_audit_invalid:${audit.reason}`)
    await persistAuditEvent(ctx.db, audit.event)

    return { kind: 'recorded' }
  },
})
