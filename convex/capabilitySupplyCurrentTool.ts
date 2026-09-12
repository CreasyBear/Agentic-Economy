import { v } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  capabilityToolId,
  createPublicToolRef,
  parseX402FetchTransportConfiguration,
  qualifySuppliedCandidate,
  x402PaymentProfileForEnvironment,
} from '@/modules/capability-supply/public'

import { internalQuery, internalMutation, type QueryCtx } from './_generated/server'
import { getExactRegisteredCapabilityContract } from './capabilityContractDocuments'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import { toolProviderRouteabilityIsFrozen } from './lib/providerOffboardingFreeze'
import { observeCapabilityReadinessHandler } from './capabilitySupplyProbes'
import {
  canonicalPublicationPricing,
  publishedOperationSnapshotReturns,
  readCurrentPublishedTool,
  readCurrentPublishedToolSnapshotHandler,
  readExactSellerCanaryOperationSnapshotHandler,
  sellerCanaryOperationSnapshotReturns,
  type SellerCanaryOperationSnapshot,
} from './lib/capabilitySupply/currentTool'

export {
  publishedOperationSnapshotReturns,
  sellerCanaryOperationSnapshotReturns,
  readCurrentPublishedToolSnapshotHandler,
  readCurrentPublishedTool,
  readExactSellerCanaryOperationSnapshotHandler,
  type SellerCanaryOperationSnapshot,
}

export const readExactSellerCanaryOperationSnapshot = internalQuery({
  args: {
    publicationRef: v.string(),
    revision: v.number(),
  },
  returns: sellerCanaryOperationSnapshotReturns,
  handler: readExactSellerCanaryOperationSnapshotHandler,
})

/** An admitted request target, not proof of execution readiness or delivery. */
export async function readManagedX402InspectionTarget(
  ctx: Pick<QueryCtx, 'db'>,
  toolRef: string,
  now = Date.now(),
) {
  if (await toolProviderRouteabilityIsFrozen(ctx, toolRef)) return undefined
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_toolRef_and_disposition', (q) => q.eq('toolRef', toolRef).eq('disposition', 'current')).unique()
  if (publication === null) return undefined
  const candidate = {
    publicationRef: publication.publicationRef, revision: publication.revision,
    networkId: publication.networkId, businessId: publication.businessId,
    offeringId: publication.offeringId, bindingId: publication.bindingId,
    contractRef: { capabilityId: publication.capabilityId, version: publication.version, contractDigest: publication.contractDigest },
  }
  const qualification = await qualifySuppliedCandidate(capabilitySupplyGraphPorts(ctx.db), { candidate, now })
  const inspectableReasons = new Set(['credential_readiness_unobserved', 'readiness_unobserved', 'readiness_unhealthy', 'readiness_stale'])
  if (qualification.reasons.some((reason) => !inspectableReasons.has(reason))) return undefined
  const [binding, contractResult] = await Promise.all([
    ctx.db.query('capabilityTransportBindings').withIndex('by_bindingId', (q) => q.eq('bindingId', publication.bindingId)).unique(),
    getExactRegisteredCapabilityContract(ctx.db, candidate.contractRef),
  ])
  if (binding === null || binding.adapterId !== 'x402-fetch:v2' || contractResult.kind !== 'found') return undefined
  const pricing = canonicalPublicationPricing(publication)
  if (pricing?.config.kind !== 'managed_x402' || pricing.config.effectTiming !== 'payment_required_before_effect') return undefined
  let config
  try { config = parseX402FetchTransportConfiguration(JSON.parse(binding.configJson)) } catch (cause) { return degradeBackend(cause, undefined, { site: 'readManagedX402InspectionTarget', reason: 'invalid_response' }) }
  const profile = x402PaymentProfileForEnvironment(publication.runtimeEnvironment)
  if (config === undefined || profile === undefined || config.network !== profile.network
    || config.asset.toLowerCase() !== profile.asset.toLowerCase() || config.scheme !== profile.scheme) return undefined
  const expectedToolRef = createPublicToolRef({ operationId: capabilityToolId(candidate.contractRef.capabilityId),
    publicationRef: publication.publicationRef, publicationRevision: publication.revision, contractRef: candidate.contractRef })
  if (expectedToolRef !== toolRef) return undefined
  const target = {
    publicationRef: publication.publicationRef, revision: publication.revision,
    contract: contractResult.contract, runtimeEnvironment: publication.runtimeEnvironment,
    pricingConfig: pricing.config,
    identity: {
      endpoint: { url: binding.endpointUrl, method: config.method },
      payment: { kind: 'x402' as const, network: config.network, asset: config.asset, payTo: config.payTo,
        currency: config.currency, routeAmountExponent: config.routeAmountExponent, assetAmountExponent: config.assetAmountExponent },
    },
    transport: { configJson: binding.configJson },
    sourceAnchors: qualification.sources.filter((source) => source.kind !== 'readiness'),
  }
  return { ...target, targetDigest: canonicalDigest(target) }
}

export const readManagedX402InspectionSnapshot = internalQuery({
  args: { toolRef: v.string() },
  returns: v.union(v.object({ targetJson: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const target = await readManagedX402InspectionTarget(ctx, args.toolRef)
    return target === undefined ? null : { targetJson: JSON.stringify(target) }
  },
})

/** Commit the selected unpaid request only while every non-readiness source is unchanged. */
export const recordManagedX402Inspection = internalMutation({
  args: { toolRef: v.string(), targetDigest: v.string(), requirementDigest: v.string(), observedAt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const now = Date.now()
    if (!Number.isSafeInteger(args.observedAt) || args.observedAt > now || args.observedAt < now - 60_000
      || !/^sha256:[a-f0-9]{64}$/.test(args.requirementDigest)) return false
    const target = await readManagedX402InspectionTarget(ctx, args.toolRef, now)
    if (target === undefined || target.targetDigest !== args.targetDigest) return false
    // Fresh readiness is already bound into issued Quotes: do not rotate it for another inspection.
    if (await readCurrentPublishedTool(ctx, args.toolRef, now) !== undefined) return true
    const result = await observeCapabilityReadinessHandler(ctx, {
      publicationRef: target.publicationRef, expectedRevision: target.revision,
      credentialState: 'ready', healthState: 'healthy', validUntil: args.observedAt + 5 * 60_000,
      operationKey: `quote-inspection:${args.requirementDigest}`, correlationId: `quote-inspection:${args.targetDigest}`,
      reasonCode: 'selected_x402_requirement_observed', evidenceRefs: [args.requirementDigest],
    })
    return result.kind === 'observed' && await readCurrentPublishedTool(ctx, args.toolRef, now) !== undefined
  },
})
