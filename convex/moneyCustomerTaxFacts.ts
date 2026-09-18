import type { GenericDatabaseReader, UserIdentity } from 'convex/server'
import { v } from 'convex/values'

import { isValidAbn, normalizeAbn } from '../src/modules/money/public'
import { accountRef } from '../src/modules/principal-account/account/public'
import { principalRef } from '../src/modules/principal-account/principal/public'
import type { DataModel, Doc } from './_generated/dataModel'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import {
  InteractiveAuthorityError,
  requireAccessFactForAccount,
  resolveActiveAccountRefForPrincipal,
} from './interactiveAuthority'
import { resolveAndBindLegalCustomer } from './lib/moneyLegalCustomer'
import { CLERK_USER_PROVIDER_NAMESPACE } from './workspaceProvisioning'

const AU_POSTCODE_PATTERN = /^\d{4}$/u

export type MoneyCustomerTaxFactsErrorCode =
  | 'identity_invalid'
  | 'principal_kind_invalid'
  | 'account_access_missing'
  | 'active_account_selection_required'
  | 'account_missing'
  | 'account_inactive'
  | 'correlation_ref_invalid'
  | 'customer_abn_invalid'
  | 'legal_name_invalid'
  | 'billing_address_invalid'
  | 'tax_facts_revision_conflict'
  | 'tax_facts_correlation_mismatch'
  | 'legal_customer_unavailable'
  | 'legal_customer_rebinding_blocked'

export class MoneyCustomerTaxFactsError extends Error {
  readonly code: MoneyCustomerTaxFactsErrorCode

  constructor(code: MoneyCustomerTaxFactsErrorCode) {
    super(code)
    this.name = 'MoneyCustomerTaxFactsError'
    this.code = code
  }
}

const customerTaxFactsReadValue = v.union(
  v.object({
    kind: v.literal('missing'),
    accountRef: v.string(),
    revision: v.literal(0),
  }),
  v.object({
    kind: v.literal('available'),
    accountRef: v.string(),
    abn: v.string(),
    gstRegistered: v.boolean(),
    legalName: v.string(),
    addressLine1: v.string(),
    addressLine2: v.optional(v.string()),
    locality: v.string(),
    region: v.optional(v.string()),
    postalCode: v.string(),
    country: v.literal('AU'),
    legalCustomerRef: v.string(),
    effectiveAt: v.number(),
    updatedAt: v.number(),
    revision: v.number(),
  }),
)

const upsertCustomerTaxFactsReceiptValue = v.union(
  v.object({
    kind: v.literal('updated'),
    revision: v.number(),
    effectiveAt: v.number(),
  }),
  v.object({
    kind: v.literal('replayed'),
    revision: v.number(),
    effectiveAt: v.number(),
  }),
)

type CustomerTaxFactsRead =
  | Readonly<{
      kind: 'missing'
      accountRef: string
      revision: 0
    }>
  | Readonly<{
      kind: 'available'
      accountRef: string
      abn: string
      gstRegistered: boolean
      legalName: string
      addressLine1: string
      addressLine2?: string
      locality: string
      region?: string
      postalCode: string
      country: 'AU'
      legalCustomerRef: string
      effectiveAt: number
      updatedAt: number
      revision: number
    }>

type UpsertCustomerTaxFactsReceipt = Readonly<
  | { kind: 'updated'; revision: number; effectiveAt: number }
  | { kind: 'replayed'; revision: number; effectiveAt: number }
>

type TaxFactsDb = GenericDatabaseReader<DataModel>

async function requireInteractiveHumanPrincipal(
  db: TaxFactsDb,
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
  db: TaxFactsDb,
  identity: UserIdentity,
): Promise<{
  principal: Doc<'principals'>
  canonicalPrincipalRef: ReturnType<typeof principalRef>
  canonicalAccountRef: ReturnType<typeof accountRef>
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
  await requireAccessFactForAccount(db, canonicalPrincipalRef, canonicalAccountRef)
  const account = await db
    .query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
    .unique()
  if (account === null) throw new InteractiveAuthorityError('account_missing')
  if (account.lifecycle !== 'active') throw new InteractiveAuthorityError('account_inactive')
  return { principal, canonicalPrincipalRef, canonicalAccountRef }
}

function validateCorrelationRef(value: unknown): void {
  if (typeof value !== 'string') {
    throw new InteractiveAuthorityError('correlation_ref_invalid')
  }
  const sanitized = value.trim()
  if (sanitized.length < 3 || sanitized.length > 128) {
    throw new InteractiveAuthorityError('correlation_ref_invalid')
  }
}

export const readCustomerTaxFacts = query({
  args: {},
  returns: customerTaxFactsReadValue,
  handler: async (ctx: QueryCtx): Promise<CustomerTaxFactsRead> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalAccountRef } = await requireAuthenticatedAccountContext(ctx.db, identity)

    const row = await ctx.db
      .query('moneyCustomerTaxFacts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()

    if (row === null) {
      return {
        kind: 'missing',
        accountRef: canonicalAccountRef,
        revision: 0,
      }
    }

    return {
      kind: 'available',
      accountRef: row.accountRef,
      abn: row.abn,
      gstRegistered: row.gstRegistered,
      legalName: row.legalName ?? '',
      addressLine1: row.addressLine1 ?? '',
      ...(row.addressLine2 !== undefined ? { addressLine2: row.addressLine2 } : {}),
      locality: row.locality ?? '',
      ...(row.region !== undefined ? { region: row.region } : {}),
      postalCode: row.postalCode ?? '',
      country: (row.country ?? 'AU') as 'AU',
      legalCustomerRef: row.legalCustomerRef,
      effectiveAt: row.effectiveAt,
      updatedAt: row.updatedAt,
      revision: row.revision ?? 1,
    }
  },
})

export const upsertCustomerTaxFacts = mutation({
  args: {
    abn: v.string(),
    legalName: v.string(),
    addressLine1: v.string(),
    addressLine2: v.optional(v.string()),
    locality: v.string(),
    region: v.optional(v.string()),
    postalCode: v.string(),
    country: v.optional(v.string()),
    gstRegistered: v.optional(v.boolean()),
    expectedRevision: v.number(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
  },
  returns: upsertCustomerTaxFactsReceiptValue,
  handler: async (ctx: MutationCtx, args): Promise<UpsertCustomerTaxFactsReceipt> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalAccountRef } = await requireAuthenticatedAccountContext(ctx.db, identity)

    validateCorrelationRef(args.correlationRef)

    const normalizedAbn = normalizeAbn(args.abn)
    if (!isValidAbn(normalizedAbn)) {
      throw new InteractiveAuthorityError('customer_abn_invalid')
    }

    const trimmedLegalName = args.legalName.trim()
    if (trimmedLegalName.length === 0 || trimmedLegalName.length > 200) {
      throw new InteractiveAuthorityError('legal_name_invalid')
    }

    const trimmedAddress1 = args.addressLine1.trim()
    const trimmedLocality = args.locality.trim()
    const trimmedPostalCode = args.postalCode.trim()
    const address2Trimmed = args.addressLine2?.trim()
    const regionTrimmed = args.region?.trim()

    if (
      trimmedAddress1.length === 0
      || trimmedLocality.length === 0
      || !AU_POSTCODE_PATTERN.test(trimmedPostalCode)
      || args.country !== 'AU'
    ) {
      throw new InteractiveAuthorityError('billing_address_invalid')
    }

    const gstRegistered = args.gstRegistered ?? true

    const existing = await ctx.db
      .query('moneyCustomerTaxFacts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()

    const currentRevision = existing?.revision ?? 0
    const now = Date.now()

    if (existing !== null && existing.lastCorrelationRef === args.correlationRef) {
      const isSamePayload =
        existing.abn === normalizedAbn
        && existing.legalName === trimmedLegalName
        && existing.addressLine1 === trimmedAddress1
        && (existing.addressLine2 ?? undefined) === (address2Trimmed || undefined)
        && existing.locality === trimmedLocality
        && (existing.region ?? undefined) === (regionTrimmed || undefined)
        && existing.postalCode === trimmedPostalCode
        && (existing.country ?? 'AU') === args.country
        && existing.gstRegistered === gstRegistered

      if (isSamePayload) {
        return {
          kind: 'replayed',
          revision: currentRevision,
          effectiveAt: existing.effectiveAt,
        }
      }

      throw new InteractiveAuthorityError('tax_facts_correlation_mismatch')
    }

    if (args.expectedRevision !== currentRevision) {
      throw new InteractiveAuthorityError('tax_facts_revision_conflict')
    }

    const legalCustomerResult = await resolveAndBindLegalCustomer(ctx, canonicalAccountRef, now)
    if (legalCustomerResult.kind === 'refused') {
      throw new InteractiveAuthorityError(legalCustomerResult.code)
    }
    const legalCustomerRef = legalCustomerResult.legalCustomerRef

    const nextRevision = currentRevision + 1

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        abn: normalizedAbn,
        gstRegistered,
        legalCustomerRef,
        legalName: trimmedLegalName,
        addressLine1: trimmedAddress1,
        ...(address2Trimmed !== undefined && address2Trimmed.length > 0 ? { addressLine2: address2Trimmed } : {}),
        locality: trimmedLocality,
        ...(regionTrimmed !== undefined && regionTrimmed.length > 0 ? { region: regionTrimmed } : {}),
        postalCode: trimmedPostalCode,
        country: 'AU',
        revision: nextRevision,
        lastCorrelationRef: args.correlationRef,
        updatedAt: now,
        effectiveAt: now,
      })
    } else {
      await ctx.db.insert('moneyCustomerTaxFacts', {
        accountRef: canonicalAccountRef,
        abn: normalizedAbn,
        gstRegistered,
        legalCustomerRef,
        legalName: trimmedLegalName,
        addressLine1: trimmedAddress1,
        ...(address2Trimmed !== undefined && address2Trimmed.length > 0 ? { addressLine2: address2Trimmed } : {}),
        locality: trimmedLocality,
        ...(regionTrimmed !== undefined && regionTrimmed.length > 0 ? { region: regionTrimmed } : {}),
        postalCode: trimmedPostalCode,
        country: 'AU',
        revision: nextRevision,
        lastCorrelationRef: args.correlationRef,
        effectiveAt: now,
        updatedAt: now,
      })
    }

    return {
      kind: 'updated',
      revision: nextRevision,
      effectiveAt: now,
    }
  },
})
