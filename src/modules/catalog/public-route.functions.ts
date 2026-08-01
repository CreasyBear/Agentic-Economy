import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { offeringApiDtoToSupplyView, type PublicOfferingSupplyView } from '@/components/ae/offerings/offering-presentation'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import type {
  PublicBusinessPageNotFoundReason,
  PublicBusinessPageRouteReadbackResult,
} from '@/modules/catalog/public'
import { readPublicBusinessPageServer } from '@/modules/catalog/owner-claim.functions'
import { readPublicTargetAdmissionServer } from '@/modules/inquiries/inquiry.functions'
import type { R1TargetAdmission } from '@/modules/inquiries/public'
import { selectPublicInquiryTarget } from '@/modules/inquiries/route-readbacks'
import { readPublicOfferingRegistryBusinessDetail } from '@/modules/registry/registry.functions'
import { buildPublicBusinessRouteSeo } from '@/modules/seo/public-route'
import type { PublicBusinessSeoContract } from '@/modules/seo/public'

type PublicBusinessRouteData = Readonly<{
  kind: 'available'
  page: Extract<PublicBusinessPageRouteReadbackResult, { kind: 'available' }>
  seo: PublicBusinessSeoContract
  admission: R1TargetAdmission | undefined
  supply: PublicOfferingSupplyView
}>

export type PublicBusinessRouteDataResult =
  | PublicBusinessRouteData
  | Readonly<{ kind: 'not_found'; reason: PublicBusinessPageNotFoundReason }>

const publicBusinessRouteInputSchema = z.object({
  slug: z.string(),
})

export const readPublicBusinessRouteServer = createServerFn()
  .validator((data) => publicBusinessRouteInputSchema.parse(data))
  .handler(async ({ data }): Promise<PublicBusinessRouteDataResult> => {
    const page = await readPublicBusinessPageServer({ data })
    if (page.kind === 'not_found') return page

    const offeringDetail = await readPublicOfferingRegistryBusinessDetail({ slug: data.slug })
    if (offeringDetail.kind === 'not_found') {
      return { kind: 'not_found', reason: 'not_public' }
    }

    const target = selectPublicInquiryTarget(page.catalog)
    const admissionResult = target === undefined
      ? undefined
      : await readPublicTargetAdmissionServer({ data: target })
    const seo = buildPublicBusinessRouteSeo(page.catalog, await readCanonicalBaseUrlServer())

    return {
      kind: 'available',
      page,
      seo,
      admission: admissionResult?.kind === 'ok' ? admissionResult.admission : undefined,
      supply: offeringApiDtoToSupplyView(offeringDetail.business),
    }
  })
