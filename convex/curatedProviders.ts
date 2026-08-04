import { v } from 'convex/values'

import { defineCapabilityContract, type CapabilityContract } from '@/modules/capability-contract/public'
import {
  buildExaSearchContentsMapping,
  createRegisteredOperationMappingRef,
  CURATED_PROVIDER_PUBLICATIONS,
  EXA_BUSINESS_SLUG,
  FRANKFURTER_BUSINESS_SLUG,
  normalizeCapabilityPublication,
} from '@/modules/capability-supply/public'
import { DEV_SEED_BUSINESS_FIXTURES } from '@/modules/dev/public'

import { internalMutation } from './_generated/server'
import {
  publishCuratedCapability,
  registerCuratedMapping,
  setCapabilitySupplyEligibilityCommand,
} from './capabilitySupply'
import { registerSandboxBusinesses } from './devSeed'

const PROVIDER_SLUGS = [EXA_BUSINESS_SLUG, FRANKFURTER_BUSINESS_SLUG] as const
const publicationResult = v.object({
  businessSlug: v.string(),
  capabilityId: v.string(),
  operationRef: v.string(),
  publicationRef: v.string(),
  readiness: v.union(
    v.literal('active'),
    v.literal('pending'),
    v.literal('unavailable'),
  ),
})

/**
 * Idempotently ports the source-owned real-provider records into the generic
 * Contract -> Offering -> Binding -> Publication path. Readiness remains a
 * separate live observation; this mutation never fabricates it.
 */
export const seed = internalMutation({
  args: {},
  returns: v.object({
    businessSlugs: v.array(v.string()),
    publications: v.array(publicationResult),
    mappingRef: v.string(),
  }),
  handler: async (ctx) => {
    const now = Date.now()
    const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter(({ requestedSlug }) => (
      PROVIDER_SLUGS.some((slug) => slug === requestedSlug)
    ))
    if (fixtures.length !== PROVIDER_SLUGS.length) {
      throw new Error('curated_provider_business_fixture_missing')
    }

    const existing = await Promise.all(PROVIDER_SLUGS.map(async (slug) => (
      await ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', slug)).unique()
    )))
    const missing = fixtures.filter(({ requestedSlug }) => (
      existing.every((business) => business?.slug !== requestedSlug)
    ))
    if (missing.length > 0) {
      await registerSandboxBusinesses(ctx.db, missing, now)
    }

    const businesses = new Map<string, string>()
    for (const slug of PROVIDER_SLUGS) {
      const business = await ctx.db.query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', slug))
        .unique()
      if (business === null || business.publicStatus !== 'published' || business.claimStatus !== 'published') {
        throw new Error(`curated_provider_business_unavailable:${slug}`)
      }
      businesses.set(slug, business._id)
    }

    const publications: Array<{
      businessSlug: string
      capabilityId: string
      operationRef: string
      publicationRef: string
      readiness: 'active' | 'pending' | 'unavailable'
    }> = []
    const contracts = new Map<string, CapabilityContract>()
    for (const [index, entry] of CURATED_PROVIDER_PUBLICATIONS.entries()) {
      const businessId = businesses.get(entry.businessSlug)
      if (businessId === undefined) throw new Error(`curated_provider_business_missing:${entry.businessSlug}`)
      const normalized = normalizeCapabilityPublication(entry.publication)
      if (normalized.kind !== 'normalized') {
        throw new Error(`curated_provider_publication_${normalized.reason}`)
      }
      const contract = defineCapabilityContract(JSON.parse(normalized.draft.documentJson))
      contracts.set(contract.ref.capabilityId, contract)
      const source = entry.publication
      const published = await publishCuratedCapability(ctx, {
        businessId,
        source,
        operationKey: `curated-provider:publish:${source.commercial.offering.offeringId}`,
        correlationId: `curated-provider:${entry.businessSlug}`,
        reasonCode: 'source_owned_curated_provider_publication',
        evidenceRefs: [...source.evidenceRefs],
        now: now + index,
      })
      if (published.kind !== 'published') {
        throw new Error(`curated_provider_publication_${published.reason}`)
      }

      const [offering, binding] = await Promise.all([
        ctx.db.query('capabilityOfferings')
          .withIndex('by_offeringId', (query) => query.eq('offeringId', published.offeringId))
          .unique(),
        ctx.db.query('capabilityTransportBindings')
          .withIndex('by_bindingId', (query) => query.eq('bindingId', published.bindingId))
          .unique(),
      ])
      if (offering === null || binding === null) throw new Error('curated_provider_supply_registration_missing')
      const eligibility = await setCapabilitySupplyEligibilityCommand(ctx.db, {
        actor: { kind: 'system', ref: 'system:curated-provider-bootstrap' },
        context: {
          operationKey: `curated-provider:eligibility:${published.bindingId}`,
          correlationId: `curated-provider:${entry.businessSlug}`,
          reasonCode: 'source_owned_contract_and_transport_conformance',
          evidenceRefs: [...source.evidenceRefs],
        },
        eligibility: {
          offeringId: published.offeringId,
          bindingId: published.bindingId,
          contractRef: published.contractRef,
          decision: 'admit',
          expectedOfferingRegistrationHash: offering.registrationHash,
          expectedBindingRegistrationHash: binding.registrationHash,
          admissionEvidenceRefs: [...source.evidenceRefs],
          conformanceEvidenceRefs: ['source:tests:provider-conformance', ...source.evidenceRefs],
        },
      }, now + index + 100)
      if (eligibility.kind !== 'eligible') {
        throw new Error(`curated_provider_eligibility_${eligibility.kind}`)
      }

      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', published.publicationRef).eq('revision', 1)
        ))
        .unique()
      if (publication === null) throw new Error('curated_provider_publication_missing')
      publications.push({
        businessSlug: entry.businessSlug,
        capabilityId: published.contractRef.capabilityId,
        operationRef: publication.operationRef,
        publicationRef: publication.publicationRef,
        readiness: publication.credentialState === 'unavailable'
          ? 'unavailable'
          : publication.credentialState === 'ready' && publication.healthState === 'healthy'
            ? 'active'
            : 'pending',
      })
    }

    const searchContract = contracts.get('exa.search')
    const contentsContract = contracts.get('exa.contents')
    if (searchContract === undefined || contentsContract === undefined) {
      throw new Error('curated_exa_mapping_contract_missing')
    }
    const mapping = buildExaSearchContentsMapping(
      searchContract,
      contentsContract,
      createRegisteredOperationMappingRef,
    )
    const mappingEvidenceRefs = [...new Set(
      CURATED_PROVIDER_PUBLICATIONS
        .filter(({ businessSlug }) => businessSlug === EXA_BUSINESS_SLUG)
        .flatMap(({ publication }) => publication.evidenceRefs),
    )]
    const mappingResult = await registerCuratedMapping(ctx, {
      networkId: 'ae:public',
      mapping,
      registrationEvidenceRefs: mappingEvidenceRefs,
    })
    if (mappingResult.kind !== 'registered') {
      throw new Error(`curated_exa_mapping_${mappingResult.reason}`)
    }

    return {
      businessSlugs: [...PROVIDER_SLUGS],
      publications,
      mappingRef: mappingResult.mappingRef,
    }
  },
})
