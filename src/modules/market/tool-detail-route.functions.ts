import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { degrade } from '@/lib/observability/degrade'
import type { ToolDetailResult } from '@/modules/capability-supply/public'
import { readToolListingEvidence } from '@/modules/market/server'
import type { MarketListingEvidenceProjection } from '@/modules/market/listing-evidence'
import { readCapabilityToolDetail } from '@/modules/capability-supply/tool-source'
import { registryServicesDetailAction } from '@/modules/registry/registry.actions'

export type PublicToolDetailRouteResult =
  | (ToolDetailResult & Readonly<{ evidence?: MarketListingEvidenceProjection; verifiedBusinessSlug?: string }>)
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
      const [evidence, service] = await Promise.all([
        readToolListingEvidence(result.tool),
        registryServicesDetailAction.run({ data: { slug: result.tool.business.slug }, context: { caller: 'ui' } }).catch(() => undefined),
      ])
      const exactPublicBusiness = service?.kind === 'found'
        && service.service.id === result.tool.business.businessId
        && service.service.ae.publicUrl === `/${result.tool.business.slug}`
        && service.service.ae.source === 'business_published'
        && service.service.ae.disposition === 'current'
      return { ...result, ...(evidence === undefined ? {} : { evidence }), ...(exactPublicBusiness ? { verifiedBusinessSlug: result.tool.business.slug } : {}) }
    } catch (cause) {
      return degrade(cause, { kind: 'source_unavailable', toolRef: data.toolRef } as const, {
        site: 'readPublicToolDetailRouteServer',
        reason: 'source_unavailable',
      })
    }
  })
