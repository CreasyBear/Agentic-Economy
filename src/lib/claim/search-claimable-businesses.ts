import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { readPublicOfferingRegistrySearchPage } from '@/modules/registry/registry.functions'
import type { FoundBusiness } from '@/components/ae/claim/AeFindMyBusiness'

const claimBusinessSearchSchema = z.object({ query: z.string().trim().min(1).max(120) })

export const searchClaimableBusinessesServer = createServerFn()
  .validator((data) => claimBusinessSearchSchema.parse(data))
  .handler(async ({ data }): Promise<readonly FoundBusiness[]> => {
    const page = await readPublicOfferingRegistrySearchPage({ query: data.query, limit: 5 })
    return page.items.map((item) => ({
      slug: item.slug,
      name: item.name,
      category: item.category,
      businessContext: item.businessContext,
    }))
  })
