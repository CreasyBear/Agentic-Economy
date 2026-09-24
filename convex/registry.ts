import { queryGeneric } from 'convex/server'

import {
  getPublicBusinessOfferingSupplyBySlugArgs,
  getPublicBusinessOfferingSupplyBySlugResult,
  listPublicBusinessOfferingSupplyArgs,
  listPublicBusinessOfferingSupplyResult,
  searchPublicBusinessOfferingSupplyArgs,
  searchPublicBusinessOfferingSupplyResult,
} from './lib/registry/offeringSupply/contracts'
import {
  getPublicBusinessOfferingSupplyBySlugHandler,
  listPublicBusinessOfferingSupplyHandler,
} from './lib/registry/offeringSupply/reads'
import { searchPublicBusinessOfferingSupplyHandler } from './lib/registry/offeringSupply/search'

export const listPublicBusinessOfferingSupply = queryGeneric({
  args: listPublicBusinessOfferingSupplyArgs,
  returns: listPublicBusinessOfferingSupplyResult,
  handler: listPublicBusinessOfferingSupplyHandler,
})

export const searchPublicBusinessOfferingSupply = queryGeneric({
  args: searchPublicBusinessOfferingSupplyArgs,
  returns: searchPublicBusinessOfferingSupplyResult,
  handler: searchPublicBusinessOfferingSupplyHandler,
})

export const getPublicBusinessOfferingSupplyBySlug = queryGeneric({
  args: getPublicBusinessOfferingSupplyBySlugArgs,
  returns: getPublicBusinessOfferingSupplyBySlugResult,
  handler: getPublicBusinessOfferingSupplyBySlugHandler,
})
