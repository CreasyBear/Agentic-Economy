import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { degrade } from '@/lib/observability/degrade'
import type { ToolDetailResult } from '@/modules/capability-supply/public'
import type { ReferenceRate } from '@/modules/money/public'
import { readPersistedReferenceRate } from '@/modules/money/reference-rate.server'
import { readToolListingEvidence } from '@/modules/market/server'
import type { MarketListingEvidenceProjection } from '@/modules/market/listing-evidence'
import { readCapabilityToolDetail } from '@/modules/capability-supply/tool-source'
import { registryServicesDetailAction } from '@/modules/registry/registry.actions'
import { readX402DirectoryCatalogueBySlug } from '@/modules/market/x402-directory-index.server'
import type { X402DirectoryCatalogueResource } from '@/modules/market/x402-directory-catalogue'

export type PublicToolDetailRouteResult =
  | (ToolDetailResult & Readonly<{ evidence?: MarketListingEvidenceProjection; verifiedBusinessSlug?: string; referenceRate?: ReferenceRate }>)
  | Readonly<{ kind: 'source_unavailable'; toolRef: string }>

const inputSchema = z.strictObject({ toolRef: z.string() })

export const readPublicToolDetailRouteServer = createServerFn()
  .validator((data) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<PublicToolDetailRouteResult> => {
    let result: ToolDetailResult
    try {
      result = await readCapabilityToolDetail(data)
    } catch (cause) {
      return degrade(cause, { kind: 'source_unavailable', toolRef: data.toolRef } as const, {
        site: 'readPublicToolDetailRouteServer',
        reason: 'source_unavailable',
      })
    }
    if (result.kind !== 'found') return result
    // Descriptor authority is independent of listing evidence and public links.
    const price = result.tool.commercial.price
    const needsRate = result.tool.commercial.displayPrice === undefined && (price.kind === 'fixed'
      ? price.amount.currency === 'USDC'
      : price.kind === 'range' && price.minimum.currency === 'USDC')
    const [evidence, service, referenceRate] = await Promise.all([
      readToolListingEvidence(result.tool).catch(cause => degrade(cause, undefined, { site: 'toolListingEvidence', reason: 'source_unavailable' })),
      registryServicesDetailAction.run({ data: { slug: result.tool.business.slug }, context: { caller: 'ui' } })
        .catch(cause => degrade(cause, undefined, { site: 'toolPublicBusiness', reason: 'source_unavailable' })),
      needsRate ? readPersistedReferenceRate().catch(cause => degrade(cause, undefined, { site: 'toolReferenceRate', reason: 'source_unavailable' })) : undefined,
    ])
    const exactPublicBusiness = service?.kind === 'found'
      && service.service.id === result.tool.business.businessId
      && service.service.ae.publicUrl === `/${result.tool.business.slug}`
      && service.service.ae.source === 'business_published'
      && service.service.ae.disposition === 'current'
    return { ...result, ...(evidence === undefined ? {} : { evidence }), ...(exactPublicBusiness ? { verifiedBusinessSlug: result.tool.business.slug } : {}), ...(referenceRate === undefined ? {} : { referenceRate }) }
  })

/** Rate and external listing are fetched on the server; directory details are not AE admissions. */
export const readDirectoryToolDetailRouteServer = createServerFn({ method: 'GET' })
  .validator((data) => z.strictObject({ providerKey: z.string().min(1).max(253), slug: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }): Promise<Readonly<{ metadata: X402DirectoryCatalogueResource; referenceRate?: ReferenceRate }>> => {
    const metadata = await readX402DirectoryCatalogueBySlug(data)
    if (metadata.kind !== 'found' && metadata.kind !== 'found_upstream') return { metadata }
    if (metadata.kind === 'found' && metadata.item.toolRef !== undefined) return { metadata }
    const usdcPrice = metadata.item.entry.prices.some(price => price.scheme === 'exact' && price.symbol === 'USDC')
    const referenceRate = usdcPrice ? await readPersistedReferenceRate().catch(cause => degrade(cause, undefined, { site: 'directoryToolReferenceRate', reason: 'source_unavailable' })) : undefined
    return { metadata, ...(referenceRate === undefined ? {} : { referenceRate }) }
  })
