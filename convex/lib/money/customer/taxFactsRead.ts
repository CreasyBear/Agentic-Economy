import { v } from 'convex/values'

import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import type { QueryCtx } from '../../../_generated/server'
import { requireTaxAccountContext } from './authority'

export const readCustomerTaxFactsArgs = {}
export const readCustomerTaxFactsResult =  v.union(
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

export async function readCustomerTaxFactsHandler(ctx: QueryCtx): Promise<CustomerTaxFactsRead> {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const canonicalAccountRef = await requireTaxAccountContext(ctx.db, identity)

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
}
