import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { offeringApiDtoToSupplyView, type PublicOfferingSupplyView } from '@/components/ae/offerings/offering-presentation'
import { degrade } from '@/lib/observability/degrade'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import {
  readPublicBusinessPageServer,
  type PublicBusinessPageRouteReadbackResult,
} from '@/lib/server/owner-status.functions'
import { readPublicOfferingRegistryBusinessDetail } from '@/modules/registry/registry.functions'
import { buildPublicBusinessRouteSeo } from '@/modules/seo/public-route'
import { registryServicesDetailAction } from '@/modules/registry/registry.actions'
import type { ServiceDto } from '@/modules/registry/public'
import type { PublicBusinessSeoContract } from '@/modules/seo/public'

type PublicBusinessRouteData = Readonly<{
  kind: 'available'
  page: Extract<PublicBusinessPageRouteReadbackResult, { kind: 'available' }>
  seo?: PublicBusinessSeoContract
  supply?: PublicOfferingSupplyView
  service?: ServiceDto
}>

export type PublicBusinessRouteDataResult =
  | PublicBusinessRouteData
  | Exclude<PublicBusinessPageRouteReadbackResult, { kind: 'available' }>

const publicBusinessRouteInputSchema = z.object({ slug: z.string() })

export const readPublicBusinessRouteServer = createServerFn()
  .validator((data) => publicBusinessRouteInputSchema.parse(data))
  .handler(async ({ data }): Promise<PublicBusinessRouteDataResult> => {
    let page: PublicBusinessPageRouteReadbackResult
    try {
      page = await readPublicBusinessPageServer({ data })
    } catch (cause) {
      return degrade(cause, { kind: 'unavailable', reason: 'source_unavailable', retryable: true } as const, {
        site: 'readPublicBusinessRouteServer',
        reason: 'source_unavailable',
      })
    }
    if (page.kind !== 'available') return page

    const [offeringDetail, canonicalBaseUrl, serviceResult] = await Promise.all([
      readPublicOfferingRegistryBusinessDetail({ slug: data.slug })
        .catch(cause => degrade(cause, undefined, { site: 'businessOfferingDetail', reason: 'source_unavailable' })),
      readCanonicalBaseUrlServer()
        .catch(cause => degrade(cause, undefined, { site: 'businessCanonicalUrl', reason: 'source_unavailable' })),
      registryServicesDetailAction.run({ data: { slug: data.slug }, context: { caller: 'ui' } })
        .catch(cause => degrade(cause, undefined, { site: 'businessPublicService', reason: 'source_unavailable' })),
    ])
    return {
      kind: 'available',
      page,
      ...(canonicalBaseUrl === undefined ? {} : { seo: buildPublicBusinessRouteSeo(page.catalog, canonicalBaseUrl) }),
      ...(offeringDetail?.kind === 'found' ? { supply: offeringApiDtoToSupplyView(offeringDetail.business) } : {}),
      ...(serviceResult?.kind === 'found' ? { service: serviceResult.service } : {}),
    }
  })
