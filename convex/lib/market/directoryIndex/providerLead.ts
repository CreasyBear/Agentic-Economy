import type { MutationCtx } from '../../../_generated/server'

export type ProviderLeadSource = Readonly<{
  popularOrder: number
  payersOrder?: number
  minimumUsdPrice?: string
  slug?: string
  name?: string
}>

export type ProviderLeadPatch = Readonly<{
  leadCalls: number
  leadPayers?: number
  leadTitle?: string
  leadPrice?: string
  leadSlug?: string
}>

/** The busiest Tool already sorted onto the search row. -1 keeps a quiet host in the index, at the bottom. */
export function providerLeadPatch(lead: ProviderLeadSource | null): ProviderLeadPatch {
  if (lead === null || !Number.isSafeInteger(lead.popularOrder)) return { leadCalls: -1 }
  const payers = lead.payersOrder !== undefined && Number.isSafeInteger(lead.payersOrder) && lead.payersOrder >= 0 ? lead.payersOrder : undefined
  const title = lead.name?.trim().slice(0, 140)
  const price = lead.minimumUsdPrice?.trim()
  const slug = lead.slug?.trim()
  return {
    leadCalls: lead.popularOrder,
    ...(payers === undefined ? {} : { leadPayers: payers }),
    ...(title === undefined || title.length === 0 ? {} : { leadTitle: title }),
    ...(price === undefined || price.length === 0 ? {} : { leadPrice: price }),
    ...(slug === undefined || slug.length === 0 ? {} : { leadSlug: slug }),
  }
}

/** Replaces the host's lead from its highest-call Tool. Safe to repeat. */
export async function refreshProviderLead(ctx: MutationCtx, generation: string, provider: string): Promise<void> {
  const facet = await ctx.db.query('marketDirectoryFacets')
    .withIndex('by_generation_and_kind_and_key', q => q.eq('generation', generation).eq('kind', 'provider').eq('key', provider))
    .unique()
  if (facet === null) return
  const lead = await ctx.db.query('marketDirectorySearchEntries')
    .withIndex('by_generation_and_network_and_provider_and_popularOrder', q => q.eq('generation', generation).eq('network', '*').eq('provider', provider.toLowerCase()))
    .order('desc')
    .first()
  const entry = lead === null ? null : await ctx.db.get(lead.entryId)
  const patch = providerLeadPatch(lead === null ? null : {
    popularOrder: lead.popularOrder,
    ...(lead.payersOrder === undefined ? {} : { payersOrder: lead.payersOrder }),
    ...(lead.minimumUsdPrice === undefined ? {} : { minimumUsdPrice: lead.minimumUsdPrice }),
    ...(lead.slug === undefined ? {} : { slug: lead.slug }),
    ...(entry?.name === undefined ? {} : { name: entry.name }),
  })
  const { _id, _creationTime, leadCalls: _calls, leadPayers: _payers, leadTitle: _title, leadPrice: _price, leadSlug: _slug, ...rest } = facet
  await ctx.db.replace(_id, { ...rest, ...patch })
}
