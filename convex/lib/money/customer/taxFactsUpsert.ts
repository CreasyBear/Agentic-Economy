import { v } from 'convex/values'

import { isValidAbn, normalizeAbn } from '../../../../src/modules/money/public'
import type { MutationCtx } from '../../../_generated/server'
import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import { resolveAndBindLegalCustomer } from '../legalCustomer/binding'
import { requireTaxAccountContext, validateCorrelationRef } from './authority'

const AU_POSTCODE_PATTERN = /^\d{4}$/u

export const upsertCustomerTaxFactsArgs = {
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
}

export const upsertCustomerTaxFactsResult = v.union(
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

type UpsertCustomerTaxFactsReceipt = Readonly<
  | { kind: 'updated'; revision: number; effectiveAt: number }
  | { kind: 'replayed'; revision: number; effectiveAt: number }
>

type UpsertCustomerTaxFactsArgs = Readonly<{
  abn: string
  legalName: string
  addressLine1: string
  addressLine2?: string
  locality: string
  region?: string
  postalCode: string
  country?: string
  gstRegistered?: boolean
  expectedRevision: number
  correlationRef: string
  idempotencyRef: string
}>

export async function upsertCustomerTaxFactsHandler(ctx: MutationCtx, args: UpsertCustomerTaxFactsArgs): Promise<UpsertCustomerTaxFactsReceipt> {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const canonicalAccountRef = await requireTaxAccountContext(ctx.db, identity)

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
}
