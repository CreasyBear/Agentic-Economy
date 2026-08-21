import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { sourceWriteArgs } from './sourceWriteAdmission'
import {
  changeBusinessOfferingStatusHandler,
  createBusinessOfferingHandler,
  retryBusinessSupplyProjectionHandler,
  reviseBusinessOfferingHandler,
  upsertOfferingAccessPathHandler,
  withdrawOfferingAccessPathHandler,
} from './catalogOfferingMutations'
import {
  catalogOwnerSupplyResult,
  externalAccessPathArg,
  getCurrentOwnerOfferingSupplyHandler,
  getCurrentOwnerPublicCatalogHandler,
  getPublicBusinessCatalogBySlugHandler,
  humanAccessPathArg,
  offeringPriceArg,
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

const offeringFactsArg = v.object({
  name: v.string(), category: v.string(), summary: v.string(),
  serviceAreaSummary: v.optional(v.string()), availabilitySummary: v.optional(v.string()), pricingSummary: v.optional(v.string()),
  price: v.optional(offeringPriceArg),
})
const offeringCommandResult = v.object({
  kind: v.union(v.literal('ok'), v.literal('error')),
  code: v.string(),
  reason: v.optional(v.string()),
  resultRef: v.optional(v.string()),
  currentRevision: v.optional(v.number()),
})
const catalogProjectionRetryResult = v.union(
  v.object({ kind: v.literal('ok'), sourceDigest: v.string() }),
  v.object({ kind: v.literal('error'), code: v.string(), reason: v.optional(v.string()) }),
)

export const createBusinessOffering = mutationGeneric({
  args: { businessId: v.id('businesses'), offeringRef: v.string(), operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs, facts: offeringFactsArg },
  returns: offeringCommandResult,
  handler: createBusinessOfferingHandler,
})

export const reviseBusinessOffering = mutationGeneric({
  args: { businessId: v.id('businesses'), offeringRef: v.string(), operationKey: v.string(), correlationId: v.string(), expectedRevision: v.number(), ...sourceWriteArgs, facts: offeringFactsArg },
  returns: offeringCommandResult,
  handler: reviseBusinessOfferingHandler,
})

export const changeBusinessOfferingStatus = mutationGeneric({
  args: { businessId: v.id('businesses'), offeringRef: v.string(), operationKey: v.string(), correlationId: v.string(), expectedRevision: v.number(), status: v.union(v.literal('draft'), v.literal('published'), v.literal('paused'), v.literal('retired')), ...sourceWriteArgs },
  returns: offeringCommandResult,
  handler: changeBusinessOfferingStatusHandler,
})

export const upsertOfferingAccessPath = mutationGeneric({
  args: { businessId: v.id('businesses'), offeringRef: v.string(), accessPathRef: v.string(), operationKey: v.string(), correlationId: v.string(), expectedRevision: v.number(), status: v.union(v.literal('draft'), v.literal('published')), descriptor: v.union(humanAccessPathArg, externalAccessPathArg), ...sourceWriteArgs },
  returns: offeringCommandResult,
  handler: upsertOfferingAccessPathHandler,
})

export const withdrawOfferingAccessPath = mutationGeneric({
  args: { businessId: v.id('businesses'), accessPathRef: v.string(), operationKey: v.string(), correlationId: v.string(), expectedRevision: v.number(), ...sourceWriteArgs },
  returns: offeringCommandResult,
  handler: withdrawOfferingAccessPathHandler,
})

export const retryBusinessSupplyProjection = mutationGeneric({
  args: { businessId: v.id('businesses') },
  returns: catalogProjectionRetryResult,
  handler: retryBusinessSupplyProjectionHandler,
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

/** Authenticated source read for the protected owner Offering editor. */
export const getCurrentOwnerOfferingSupply = queryGeneric({
  args: {},
  returns: catalogOwnerSupplyResult,
  handler: getCurrentOwnerOfferingSupplyHandler,
})

export type {
  PublicFirstRequestDisclosure,
} from '../src/modules/catalog/public'
