import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { sourceWriteArgs } from './sourceWriteAdmission'
import {
  changeBusinessOfferingStatusHandler,
  authorizeSupplierBusinessHandler,
  createBusinessOfferingHandler,
  ensureSupplierBusinessHandler,
  promoteX402SellerCanaryHandler,
  renameSupplierBusinessHandler,
  retryBusinessSupplyProjectionHandler,
  reviseBusinessOfferingHandler,
  upsertOfferingAccessPathHandler,
  withdrawOfferingAccessPathHandler,
} from './catalogOfferingMutations'
import {
  catalogOwnerSupplyResult,
  currentOwnerSupplierIdentityResult,
  externalAccessPathArg,
  getCurrentOwnerOfferingSupplyHandler,
  getCurrentOwnerSupplierIdentityHandler,
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
const promoteX402SellerCanaryResult = v.union(
  v.object({
    kind: v.union(v.literal('promoted'), v.literal('replayed')),
    canaryRef: v.string(),
    offeringRef: v.string(),
    offeringRevision: v.number(),
    publicationRef: v.string(),
    publicationRevision: v.number(),
    operationRef: v.string(),
    promotionEvidenceDigest: v.string(),
    outputDigest: v.string(),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('unauthenticated'),
      v.literal('wrong_owner'),
      v.literal('source_write_refused'),
      v.literal('canary_not_found'),
      v.literal('canary_evidence_invalid'),
      v.literal('target_drift'),
      v.literal('operation_conflict'),
      v.literal('seller_claim_stale'),
      v.literal('funding_authority_invalid'),
      v.literal('readiness_stale'),
      v.literal('output_nondeterministic'),
      v.literal('canary_pending'),
      v.literal('reconciliation_required'),
      v.literal('canary_identity_mismatch'),
      v.literal('canary_expired'),
      v.literal('operation_commitment_stale'),
      v.literal('invocation_refused'),
      v.literal('payment_not_settled'),
      v.literal('payment_evidence_missing'),
      v.literal('spend_commitment_mismatch'),
      v.literal('output_contract_invalid'),
      v.literal('output_unusable'),
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

/** Explicit owner promotion. The paid canary is executed on a separate rail. */
export const promoteX402SellerCanary = mutationGeneric({
  args: {
    businessId: v.id('businesses'),
    canaryRef: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
  },
  returns: promoteX402SellerCanaryResult,
  handler: promoteX402SellerCanaryHandler,
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

/** Minimal authenticated owner scope for Operations side-surface reads. */
export const getCurrentOwnerSupplierIdentity = queryGeneric({
  args: {},
  returns: currentOwnerSupplierIdentityResult,
  handler: getCurrentOwnerSupplierIdentityHandler,
})

export type {
  PublicFirstRequestDisclosure,
} from '../src/modules/catalog/public'
