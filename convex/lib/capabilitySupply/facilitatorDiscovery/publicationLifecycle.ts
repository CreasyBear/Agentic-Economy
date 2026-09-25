import { capabilityPublicationProvenanceDigest, refreshCapabilityCommand } from '@/modules/capability-supply/public'
import { FACILITATOR_DISCOVERY_PUBLISHER_REF } from '@/modules/capability-supply/convex'
import { pricingConfigDigest, type PricingConfig } from '@/modules/money/public'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import type { MutationCtx } from '../../../_generated/server'
import { publicationPorts, publishBootstrapCapability } from '../../../capabilitySupplyPublish'
import { rebuildCapabilityOriginSupplyProjection } from '../projection/rebuild'
import { SOURCE_EVIDENCE } from './contracts'

export async function publishFacilitatorDiscoveryCapability(
  ctx: MutationCtx,
  input: Parameters<typeof publishBootstrapCapability>[1],
) {
  return publishBootstrapCapability(ctx, input, {
    kind: 'system',
    ref: FACILITATOR_DISCOVERY_PUBLISHER_REF,
  })
}

export async function refreshFacilitatorDiscoveryCapability(
  ctx: MutationCtx,
  input: Parameters<typeof refreshCapabilityCommand>[0],
  pricingConfig: PricingConfig,
  sourceRevision: string,
) {
  if (
    input.publication.publisherRef !== FACILITATOR_DISCOVERY_PUBLISHER_REF
    || input.publication.authorityMode !== 'observed_external'
  ) {
    return { kind: 'refused' as const, reason: 'refresh_invalid' as const }
  }
  const result = await refreshCapabilityCommand(input, publicationPorts(ctx))
  if (result.kind !== 'refreshed') return result
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', result.publicationRef).eq('revision', result.revision)
    )).unique()
  if (publication === null) throw new Error('facilitator_discovery_publication_missing_after_refresh')
  if (
    publication.publisherRef !== FACILITATOR_DISCOVERY_PUBLISHER_REF
    || publication.authorityMode !== 'observed_external'
  ) {
    throw new Error('facilitator_discovery_publication_provenance_invalid')
  }
  await ctx.db.patch(publication._id, {
    pricingConfigJson: stableStringify(pricingConfig as StableHashValue),
    priceDigest: pricingConfigDigest(pricingConfig),
    sourceRevision,
    provenanceDigest: capabilityPublicationProvenanceDigest({
      publisherRef: publication.publisherRef,
      authorityMode: publication.authorityMode,
      sourceRevision,
      sourceDigest: publication.sourceDigest,
    }),
  })
  if (publication.disposition === 'current') {
    await admitRefreshedDiscoverySupply(ctx, publication, input.now)
  }
  await rebuildCapabilityOriginSupplyProjection(
    ctx,
    publication.businessId,
    input.now,
  )
  return result
}

export async function admitRefreshedDiscoverySupply(
  ctx: MutationCtx,
  publication: { offeringId: string; bindingId: string; capabilityId: string; version: number; contractDigest: string },
  now: number,
) {
  const ports = publicationPorts(ctx)
  const [offering, binding] = await Promise.all([
    ports.loadOfferingByOfferingId(publication.offeringId),
    ports.loadBindingByBindingId(publication.bindingId),
  ])
  if (offering === null || binding === null) throw new Error('facilitator_discovery_supply_missing')
  if (offering.status === 'active' && binding.admission === 'admitted' && binding.conformance === 'conformant') return
  // The imported contract is admitted here, as on first publication. Live
  // request readiness remains a separate check with customer input at Quote.
  const result = await ports.setEligibility({
    offeringId: offering.offeringId,
    bindingId: binding.bindingId,
    contractRef: { capabilityId: publication.capabilityId, version: publication.version, contractDigest: publication.contractDigest },
    decision: 'admit',
    expectedOfferingRegistrationHash: offering.registrationHash,
    expectedBindingRegistrationHash: binding.registrationHash,
    admissionEvidenceRefs: [SOURCE_EVIDENCE],
    conformanceEvidenceRefs: [SOURCE_EVIDENCE],
  }, now)
  if (result.kind !== 'eligible') throw new Error('facilitator_discovery_supply_admission_failed')
}

export async function currentPublication(ctx: MutationCtx, publicationRef: string) {
  const publication = (await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query.eq('publicationRef', publicationRef))
    .order('desc').take(100)).find((candidate) => (
      candidate.disposition === 'current' && candidate.publisherRef === FACILITATOR_DISCOVERY_PUBLISHER_REF
    ))
  if (publication === undefined) return undefined
  return (await publicationPorts(ctx).loadPublicationAtRevision(publicationRef, publication.revision)) ?? undefined
}
