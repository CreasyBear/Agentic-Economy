import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  callPublicSourceQuery,
  callSourceQuery,
  sourceQuery,
} from '@/lib/server/convex-source'
import {
  buildPublicOwnerStatusReadback,
  type PublicBusinessPageNotFoundReason,
  type PublicBusinessPageRouteReadbackResult,
  type PublicOwnerStatusRouteReadbackResult,
  type PublicOwnerStatusReadback,
} from '@/modules/catalog/public'
import { readPublicOfferingRegistryBusinessDetail } from '@/modules/registry/registry.functions'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

const ownerStatusInputSchema = z.object({
  slug: z.string().optional(),
})

const publicPageInputSchema = z.object({
  slug: z.string(),
})

type PublicCatalogReadResult =
  | { kind: 'available'; catalog: PublicBusinessCatalogApiV2Dto }
  | { kind: 'not_found'; reason: PublicBusinessPageNotFoundReason }

const publicCatalogBySlugQuery = sourceQuery<{ slug: string }, PublicCatalogReadResult>(
  'catalog:getPublicBusinessCatalogBySlug',
)
const currentOwnerCatalogQuery = sourceQuery<Record<string, never>, PublicCatalogReadResult>(
  'catalog:getCurrentOwnerPublicCatalog',
)

export const readOwnerStatusServer = createServerFn()
  .validator((data) => ownerStatusInputSchema.parse(data ?? {}))
  .handler(async ({ data }) => readOwnerStatusThroughSource(data.slug))

export const readPublicBusinessPageServer = createServerFn()
  .validator((data) => publicPageInputSchema.parse(data))
  .handler(async ({ data }) => readPublicBusinessPageThroughSource(data.slug))

export async function readOwnerStatusThroughSource(
  slug: string | undefined,
): Promise<PublicOwnerStatusRouteReadbackResult> {
  const readsCurrentOwner = slug === undefined || slug.trim().length === 0
  try {
    const result = readsCurrentOwner
      ? await callSourceQuery(currentOwnerCatalogQuery, {})
      : await callPublicSourceQuery(publicCatalogBySlugQuery, { slug })

    if (result.kind !== 'available') return { kind: 'not_found', reason: result.reason }

    const publicDetail = await readPublicOfferingRegistryBusinessDetail({ slug: result.catalog.slug })
    if (publicDetail.kind === 'not_found') return { kind: 'not_found', reason: 'not_public' }

    return {
      kind: 'available',
      readback: buildOwnerStatusRouteReadback(buildPublicOwnerStatusReadback(result.catalog)),
    }
  } catch {
    return { kind: 'unavailable', reason: 'source_unavailable', retryable: true }
  }
}

async function readPublicBusinessPageThroughSource(
  slug: string,
): Promise<PublicBusinessPageRouteReadbackResult> {
  try {
    const result = await callPublicSourceQuery(publicCatalogBySlugQuery, { slug })
    return result.kind === 'available'
      ? { kind: 'available', catalog: result.catalog }
      : { kind: 'not_found', reason: result.reason }
  } catch {
    return { kind: 'unavailable', reason: 'source_unavailable', retryable: true }
  }
}

function buildOwnerStatusRouteReadback(
  readback: PublicOwnerStatusReadback,
): PublicOwnerStatusReadback {
  return readback
}
