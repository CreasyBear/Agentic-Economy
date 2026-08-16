import {
  buildPublicOwnerStatusReadback,
  publicOwnerDefaultClaimInput,
  submitPublicOwnerClaimFlow,
} from '@/modules/catalog/public'
import type {
  PublicBusinessPageReadbackResult,
  PublicOwnerStatusReadback,
} from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { normalizeSlug } from '@/modules/common/normalize-slug'

export function getDefaultPublicOwnerStatusReadback(): PublicOwnerStatusReadback {
  const result = submitPublicOwnerClaimFlow(publicOwnerDefaultClaimInput)
  if (result.kind !== 'ok') {
    throw new Error(`Default public owner claim fixture failed: ${result.kind}`)
  }
  return result.readback
}

export function getPublicOwnerStatusReadbackBySlug(
  catalog: PublicBusinessCatalogApiV2Dto,
  slug: string,
): PublicOwnerStatusReadback | undefined {
  return normalizeSlug(slug) === catalog.slug ? buildPublicOwnerStatusReadback(catalog) : undefined
}

export function getPublicBusinessPageReadback(
  catalog: PublicBusinessCatalogApiV2Dto,
  slug: string,
): PublicBusinessPageReadbackResult {
  return normalizeSlug(slug) === catalog.slug
    ? { kind: 'available', catalog }
    : { kind: 'not_found', reason: 'no_such_business' }
}
