import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { sourceWriteArgs } from './sourceWriteAdmission'
import {
  authorizeSupplierBusinessHandler,
  ensureSupplierBusinessHandler,
  renameSupplierBusinessHandler,
} from './catalogOfferingMutations'
import {
  currentOwnerSupplierIdentityResult,
  getCurrentOwnerSupplierIdentityHandler,
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

const ensureSupplierBusinessResult = v.union(
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
const renameSupplierBusinessResult = v.union(
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

export const ensureSupplierBusiness = mutationGeneric({
  args: {
    name: v.string(),
    slug: v.string(),
    website: v.string(),
    providerIdentifier: v.string(),
  },
  returns: ensureSupplierBusinessResult,
  handler: ensureSupplierBusinessHandler,
})

export const renameSupplierBusiness = mutationGeneric({
  args: {
    businessId: v.id('businesses'),
    name: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
  },
  returns: renameSupplierBusinessResult,
  handler: renameSupplierBusinessHandler,
})

export const authorizeSupplierBusiness = queryGeneric({
  args: { businessId: v.id('businesses') },
  returns: v.boolean(),
  handler: authorizeSupplierBusinessHandler,
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

/** Minimal authenticated owner scope for Operations side-surface reads. */
export const getCurrentOwnerSupplierIdentity = queryGeneric({
  args: {},
  returns: currentOwnerSupplierIdentityResult,
  handler: getCurrentOwnerSupplierIdentityHandler,
})

export type { PublicFirstRequestDisclosure } from '../src/modules/catalog/public'
