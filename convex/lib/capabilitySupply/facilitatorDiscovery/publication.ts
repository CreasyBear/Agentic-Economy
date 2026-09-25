import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { capabilityPublicationProvenanceDigest, preparePublicationDraft } from '@/modules/capability-supply/public'
import { FACILITATOR_DISCOVERY_PUBLISHER_REF, dereferenceLocalSchema, parseFacilitatorDiscoverySourceImport } from '@/modules/capability-supply/convex'
import { pricingConfigDigest, normalizePricingConfig, type PricingConfig } from '@/modules/money/public'
import type { MutationCtx } from '../../../_generated/server'
import { providerRouteabilityIsFrozen } from '../providerOffboarding/freeze'
import { SOURCE_EVIDENCE, type FacilitatorDiscoveryAdmissionItem } from './contracts'
import { facilitatorRuntimeEnvironment, routeIdentity } from './identity'
import { ensureProviderBusiness, ensureProviderConnection } from './provider'
import { admitRefreshedDiscoverySupply, currentPublication, publishFacilitatorDiscoveryCapability, refreshFacilitatorDiscoveryCapability } from './publicationLifecycle'

export async function reconcileDraft(
  ctx: MutationCtx,
  draft: FacilitatorDiscoveryAdmissionItem,
  now: number,
): Promise<'published' | 'skipped'> {
  const sourceImport = parseFacilitatorDiscoverySourceImport(draft.sourceImportJson)
  if (sourceImport === undefined || sourceImport.kind !== 'x402') return 'skipped'
  const runtimeEnvironment = facilitatorRuntimeEnvironment(sourceImport)
  if (runtimeEnvironment === undefined) return 'skipped'
  const route = routeIdentity(sourceImport)
  if (route === undefined) return 'skipped'
  const sourceResource = isRecord(sourceImport.resource) ? sourceImport.resource : undefined
  if (
    typeof sourceResource?.network !== 'string'
    || typeof sourceResource.asset !== 'string'
  ) return 'skipped'
  const existingCurrent = await currentPublication(ctx, draft.offering.offeringId)
  let existingPricing: ReturnType<typeof normalizePricingConfig> | undefined
  try { existingPricing = normalizePricingConfig(JSON.parse(existingCurrent?.pricingConfigJson ?? 'null')) } catch (cause) { degradeBackend(cause, undefined, { site: 'reconcileDraft', reason: 'invalid_response' }) /* Invalid historical material is not adopted. */ }
  const pricingConfig: PricingConfig = {
    version: 'pricing:v3',
    kind: 'managed_x402',
    effectTiming: 'payment_required_before_effect',
    sourceRequirement: {
      network: sourceResource.network,
      asset: sourceResource.asset,
      atomicUnits: draft.price.provider.units,
    },
    pricingPolicyRef: existingPricing?.kind === 'valid' && existingPricing.config.kind === 'managed_x402'
      ? existingPricing.config.pricingPolicyRef : 'pricing-policy:managed-x402-reference:v1',
    publicDisplay: 'on_request',
  }
  const sourceRevision = draft.sourceRevision
  const probe = await preparePublicationDraft({
    source: sourceImport,
    sourceRevision,
    pricingConfig,
    offering: draft.offering,
    binding: draft.binding,
    evidenceRefs: [SOURCE_EVIDENCE],
    derefSchema: dereferenceLocalSchema,
  })
  if (probe.kind === 'refused') return 'skipped'
  const business = await ensureProviderBusiness(ctx, route.host, now)
  if (business === undefined) return 'skipped'
  if (await providerRouteabilityIsFrozen(ctx, business.businessId)) return 'skipped'
  const connection = await ensureProviderConnection(ctx, business.businessId, route, now)
  if (connection === undefined) {
    if (business.created || business.activated) throw new Error('facilitator_discovery_connection_unavailable')
    return 'skipped'
  }
  const binding = {
    ...draft.binding,
    authority: {
      kind: 'provider_connection' as const,
      connectionRef: connection.connectionRef,
      providerRef: connection.providerRef,
    },
  }
  const prepared = await preparePublicationDraft({
    source: sourceImport,
    sourceRevision,
    pricingConfig,
    offering: draft.offering,
    binding,
    evidenceRefs: [SOURCE_EVIDENCE],
    derefSchema: dereferenceLocalSchema,
  })
  if (prepared.kind === 'refused') {
    if (business.created || business.activated) {
      throw new Error(`facilitator_discovery_publication_prepare_failed:${prepared.reason}`)
    }
    return 'skipped'
  }
  const publicationRef = draft.offering.offeringId
  const current = existingCurrent
  const priceDigest = pricingConfigDigest(pricingConfig)
  if (current !== undefined
    && current.publisherRef === FACILITATOR_DISCOVERY_PUBLISHER_REF
    && current.authorityMode === 'observed_external'
    && current.sourceDigest === prepared.sourceDigest
    && current.priceDigest === priceDigest
    && current.sourceRevision === sourceRevision) {
    await admitRefreshedDiscoverySupply(ctx, current, now)
    return 'skipped'
  }

  const operationDigest = canonicalDigest({ publicationRef, sourceRevision, sourceDigest: prepared.sourceDigest })
  const context = {
    operationKey: `facilitator-discovery:${operationDigest.slice(7)}`,
    correlationId: `facilitator-discovery:${canonicalDigest(route).slice(7)}`,
    reasonCode: 'facilitator_discovery_ingest',
    evidenceRefs: [SOURCE_EVIDENCE],
    now,
  }
  if (current === undefined) {
    const result = await publishFacilitatorDiscoveryCapability(ctx, {
      businessId: String(business.businessId),
      runtimeEnvironment,
      prepared: prepared.prepared,
      publicationMetadata: {
        sourceRevision: prepared.prepared.sourceRevision,
        authorityMode: 'observed_external',
        publisherRef: FACILITATOR_DISCOVERY_PUBLISHER_REF,
        provenanceDigest: capabilityPublicationProvenanceDigest({
          publisherRef: FACILITATOR_DISCOVERY_PUBLISHER_REF,
          authorityMode: 'observed_external',
          sourceRevision: prepared.prepared.sourceRevision,
          sourceDigest: prepared.prepared.sourceDigest,
        }),
      },
      ...context,
    })
    if (result.kind === 'refused') {
      if (business.created || business.activated) {
        throw new Error(`facilitator_discovery_publication_failed:${result.reason}`)
      }
      return 'skipped'
    }
    return 'published'
  }
  const result = await refreshFacilitatorDiscoveryCapability(ctx, {
    publication: current,
    source: sourceImport,
    offering: { ...draft.offering, offeringId: current.offeringId },
    binding: { ...binding, bindingId: current.bindingId },
    ...context,
  }, pricingConfig, sourceRevision)
  return result.kind === 'refreshed' ? 'published' : 'skipped'
}
