import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { degrade } from '@/lib/observability/degrade'
import type { ToolDetailResult } from '@/modules/capability-supply/public'
import { fetchCoinbaseReferenceRate, type ReferenceRate } from '@/modules/money/public'
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
    try {
      const result = await readCapabilityToolDetail(data)
      if (result.kind !== 'found') return result
      // Universal route loaders also run in the browser. Keep the evidence
      // query inside this existing server boundary alongside the descriptor.
      const price = result.tool.commercial.price
      const needsRate = result.tool.commercial.displayPrice === undefined && (price.kind === 'fixed'
        ? price.amount.currency === 'USDC'
        : price.kind === 'range' && price.minimum.currency === 'USDC')
      const [evidence, service, referenceRate] = await Promise.all([
        readToolListingEvidence(result.tool),
        registryServicesDetailAction.run({ data: { slug: result.tool.business.slug }, context: { caller: 'ui' } }).catch(() => undefined),
        needsRate ? fetchCoinbaseReferenceRate() : undefined,
      ])
      const exactPublicBusiness = service?.kind === 'found'
        && service.service.id === result.tool.business.businessId
        && service.service.ae.publicUrl === `/${result.tool.business.slug}`
        && service.service.ae.source === 'business_published'
        && service.service.ae.disposition === 'current'
      return { ...result, ...(evidence === undefined ? {} : { evidence }), ...(exactPublicBusiness ? { verifiedBusinessSlug: result.tool.business.slug } : {}), ...(referenceRate === undefined ? {} : { referenceRate }) }
    } catch (cause) {
      return degrade(cause, { kind: 'source_unavailable', toolRef: data.toolRef } as const, {
        site: 'readPublicToolDetailRouteServer',
        reason: 'source_unavailable',
      })
    }
  })

/** Rate and external listing are fetched on the server; directory details are not AE admissions. */
export const readDirectoryToolDetailRouteServer = createServerFn({ method: 'GET' })
  .validator((data) => z.strictObject({ providerKey: z.string().min(1).max(253), slug: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }): Promise<Readonly<{ metadata: X402DirectoryCatalogueResource; referenceRate?: ReferenceRate }>> => {
    const metadata = await readX402DirectoryCatalogueBySlug(data)
    if (metadata.kind !== 'found' && metadata.kind !== 'found_upstream') return { metadata }
    if (metadata.kind === 'found' && metadata.item.toolRef !== undefined) return { metadata }
    const usdcPrice = metadata.item.entry.prices.some(price => price.scheme === 'exact' && price.symbol === 'USDC')
    const referenceRate = usdcPrice ? await fetchCoinbaseReferenceRate() : undefined
    return { metadata, ...(referenceRate === undefined ? {} : { referenceRate }) }
  })
