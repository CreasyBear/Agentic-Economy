import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { offeringApiDtoToSupplyView, type PublicOfferingSupplyView } from '@/components/ae/offerings/offering-presentation'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import type { PublicBusinessPageRouteReadbackResult } from '@/modules/catalog/public'
import { readPublicBusinessPageServer } from '@/modules/catalog/owner-status.functions'
import { readPublicOfferingRegistryBusinessDetail } from '@/modules/registry/registry.functions'
import { buildPublicBusinessRouteSeo } from '@/modules/seo/public-route'
import type { PublicBusinessSeoContract } from '@/modules/seo/public'

type PublicBusinessRouteData = Readonly<{
  kind: 'available'
  page: Extract<PublicBusinessPageRouteReadbackResult, { kind: 'available' }>
  seo: PublicBusinessSeoContract
  supply: PublicOfferingSupplyView
}>

export type PublicBusinessRouteDataResult =
  | PublicBusinessRouteData
  | Exclude<PublicBusinessPageRouteReadbackResult, { kind: 'available' }>

const publicBusinessRouteInputSchema = z.object({
  slug: z.string(),
})

export const readPublicBusinessRouteServer = createServerFn()
  .validator((data) => publicBusinessRouteInputSchema.parse(data))
  .handler(async ({ data }): Promise<PublicBusinessRouteDataResult> => {
    try {
      const page = await readPublicBusinessPageServer({ data })
      if (page.kind !== 'available') return page

      const offeringDetail = await readPublicOfferingRegistryBusinessDetail({ slug: data.slug })
      if (offeringDetail.kind === 'not_found') {
        return { kind: 'not_found', reason: 'not_public' }
      }

      const seo = buildPublicBusinessRouteSeo(page.catalog, await readCanonicalBaseUrlServer())

      return {
        kind: 'available',
        page,
        seo,
        supply: offeringApiDtoToSupplyView(offeringDetail.business),
      }
    } catch {
      return { kind: 'unavailable', reason: 'source_unavailable', retryable: true }
    }
  })
