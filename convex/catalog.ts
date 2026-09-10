import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { sourceWriteArgs } from './sourceWriteAdmission'
import {
  authorizeProviderBusinessHandler,
  ensureProviderBusinessHandler,
  renameProviderBusinessHandler,
} from './catalogOfferingMutations'
import {
  currentOwnerProviderIdentityResult,
  getCurrentOwnerProviderIdentityHandler,
  getCurrentOwnerPublicCatalogHandler,
  getPublicBusinessCatalogBySlugHandler,
  publicCatalogReadbackResult,
} from './catalogPublicReads'
export {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from './capabilitySupplyProjection'
export {
  persistOfferingSourceState,
  readCatalogDescriptor,
  reviseBusinessOfferingCommand,
  upsertOfferingAccessPathCommand,
  withdrawOfferingAccessPathCommand,
} from './catalogOfferingMutations'

const ensureProviderBusinessResult = v.union(
  v.object({
    kind: v.union(v.literal('created'), v.literal('existing')),
    businessId: v.id('businesses'),
    slug: v.string(),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('unauthenticated'),
      v.literal('invalid_business'),
      v.literal('slug_taken'),
      v.literal('multiple_businesses'),
    ),
  }),
)
const renameProviderBusinessResult = v.union(
  v.object({
    kind: v.union(v.literal('updated'), v.literal('unchanged')),
    businessId: v.id('businesses'),
    slug: v.string(),
    name: v.string(),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('unauthenticated'),
      v.literal('wrong_owner'),
      v.literal('invalid_name'),
      v.literal('source_write_refused'),
    ),
  }),
)

export const ensureProviderBusiness = mutationGeneric({
  args: {
    name: v.string(),
    slug: v.string(),
    website: v.string(),
    providerIdentifier: v.string(),
  },
  returns: ensureProviderBusinessResult,
  handler: ensureProviderBusinessHandler,
})

export const renameProviderBusiness = mutationGeneric({
  args: {
    businessId: v.id('businesses'),
    name: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
  },
  returns: renameProviderBusinessResult,
  handler: renameProviderBusinessHandler,
})

export const authorizeProviderBusiness = queryGeneric({
  args: { businessId: v.id('businesses') },
  returns: v.boolean(),
  handler: authorizeProviderBusinessHandler,
})

export const getPublicBusinessCatalogBySlug = queryGeneric({
  args: {
    slug: v.string(),
  },
  returns: publicCatalogReadbackResult,
  handler: getPublicBusinessCatalogBySlugHandler,
})

export const getCurrentOwnerPublicCatalog = queryGeneric({
  args: {},
  returns: publicCatalogReadbackResult,
  handler: getCurrentOwnerPublicCatalogHandler,
})

/** Minimal authenticated owner scope for Provider side-surface reads. */
export const getCurrentOwnerProviderIdentity = queryGeneric({
  args: {},
  returns: currentOwnerProviderIdentityResult,
  handler: getCurrentOwnerProviderIdentityHandler,
})

export type { PublicFirstRequestDisclosure } from '../src/modules/catalog/public'
