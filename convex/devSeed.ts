import { internalMutation } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'

import {
  buildDevSeedCatalogState,
  DEV_SEED_BUSINESS_FIXTURES,
  DEV_SEED_OWNER_CLERK_USER_ID,
  type DevSeedBusinessFixture,
} from '../src/modules/dev/public'
import { persistDevSeedCatalogState } from './devSeedStore'
import { runtimeDb } from './source_state'
import { claimBusinessCommand } from './business'
import { publishBusinessCatalogCommand } from './catalog'
import { registerCapabilityContractDocument } from './capabilityContractDocuments'
import {
  registerCapabilityBindingCommand,
  registerCapabilityOfferingCommand,
  setCapabilitySupplyEligibilityCommand,
} from './capabilitySupply'
import { encodeCapabilityContractDocument } from '@/modules/capability-contract-registry/public'
import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  SANDBOX_PROVIDER_PROFILES,
  SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT,
  SANDBOX_V2_LEGACY_CAPABILITY_CONTRACT_DOCUMENT,
  SANDBOX_V2_PRIOR_CAPABILITY_CONTRACT_DOCUMENT,
} from '@/modules/sandbox-supply/public'

export const seedDevCatalog = internalMutation({
  args: {},
  returns: v.object({
    seededSlugs: v.array(v.string()),
    ownerClerkUserId: v.string(),
    ownerId: v.string(),
    supportRecordId: v.string(),
    businessIdsBySlug: v.record(v.string(), v.string()),
    sandboxV2Bindings: v.array(v.string()),
    sandboxCapabilityPublicationRef: v.string(),
  }),
  handler: async (ctx) => {
    const seedStartedAt = Date.now()
    const ordinaryFixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => !isSandboxFixture(fixture))
    const sandboxFixtures = DEV_SEED_BUSINESS_FIXTURES.filter(isSandboxFixture)
    const bundle = buildDevSeedCatalogState(ordinaryFixtures)
    const db = runtimeDb(ctx.db)
    const result = await persistDevSeedCatalogState(db, bundle)
    const sandboxBusinesses = await registerSandboxBusinesses(db, sandboxFixtures, seedStartedAt)
    const sandboxRegistrations = await registerSandboxV2SupplyRegistrations(ctx.db, seedStartedAt + 2_000)
    const sandboxV2Bindings = await admitSandboxV2Supply(ctx.db, sandboxRegistrations, seedStartedAt + 2_500)
    const sandboxCapabilityPublicationRefs = []
    for (const [index, registration] of sandboxRegistrations.entries()) {
      const publicationRef = await seedSandboxCapabilityPublication(
        ctx.db, registration, seedStartedAt + 2_750 + index,
      )
      sandboxCapabilityPublicationRefs.push(publicationRef)
      await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
        publicationRef, expectedRevision: 1,
      })
    }
    const sandboxCapabilityPublicationRef = sandboxCapabilityPublicationRefs[0]
    if (sandboxCapabilityPublicationRef === undefined) {
      throw new Error('sandbox_capability_publication_registration_missing')
    }
    await retireSupersededSandboxV2Supply(ctx.db, sandboxRegistrations, seedStartedAt + 3_000)
    return {
      ...result,
      seededSlugs: [...result.seededSlugs, ...sandboxBusinesses.seededSlugs],
      businessIdsBySlug: { ...result.businessIdsBySlug, ...sandboxBusinesses.businessIdsBySlug },
      sandboxV2Bindings,
      sandboxCapabilityPublicationRef,
    }
  },
})

export const seedTestCapabilityPublication = internalMutation({
  args: {},
  returns: v.object({ publicationRef: v.string(), credentialRef: v.string() }),
  handler: async (ctx) => {
    const profile = SANDBOX_PROVIDER_PROFILES.one
    const [business, initialOffering, initialBinding] = await Promise.all([
      ctx.db.query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', profile.slug))
        .unique(),
      ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', profile.offeringId))
        .unique(),
      ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', profile.v3BindingId))
        .unique(),
    ])
    let offering = initialOffering
    let binding = initialBinding
    if (business !== null && (offering === null || binding === null)) {
      const registrations = await registerSandboxV2SupplyRegistrations(ctx.db, Date.now())
      await admitSandboxV2Supply(ctx.db, registrations, Date.now() + 500)
      ;[offering, binding] = await Promise.all([
        ctx.db.query('capabilityOfferings')
          .withIndex('by_offeringId', (query) => query.eq('offeringId', profile.offeringId))
          .unique(),
        ctx.db.query('capabilityTransportBindings')
          .withIndex('by_bindingId', (query) => query.eq('bindingId', profile.v3BindingId))
          .unique(),
      ])
    }
    if (business === null || offering === null || binding === null || offering.businessId !== business._id) {
      throw new Error('sandbox_capability_publication_supply_missing')
    }
    const publicationRef = await seedSandboxCapabilityPublication(ctx.db, {
      slug: profile.slug,
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      contractRef: {
        capabilityId: offering.capabilityId,
        version: offering.version,
        contractDigest: offering.contractDigest,
      },
      offeringRegistrationHash: offering.registrationHash,
      bindingRegistrationHash: binding.registrationHash,
    }, Date.now())
    await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
      publicationRef, expectedRevision: 1,
    })
    return { publicationRef, credentialRef: binding.credentialRef }
  },
})

function isSandboxFixture(fixture: DevSeedBusinessFixture): boolean {
  return fixture.requestedSlug === 'sandbox-option-one' || fixture.requestedSlug === 'sandbox-option-two'
}

export async function seedSandboxCapabilityPublication(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  registration: SandboxV2SupplyRegistration | undefined,
  observedAt: number,
): Promise<string> {
  if (registration === undefined) throw new Error('sandbox_capability_publication_registration_missing')
  const business = await db.query('businesses')
    .withIndex('by_slug', (query) => query.eq('slug', registration.slug))
    .unique()
  if (business === null) throw new Error('sandbox_capability_publication_business_missing')
  const existing = await db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', registration.offeringId).eq('revision', 1)
    ))
    .unique()
  const sourceDigest = canonicalDigest({
    kind: 'seeded_sandbox_capability',
    offeringId: registration.offeringId,
    bindingId: registration.bindingId,
  })
  if (existing !== null) {
    if (
      existing.businessId !== business._id
      || existing.sourceDigest !== sourceDigest
      || existing.offeringId !== registration.offeringId
      || existing.bindingId !== registration.bindingId
      || existing.contractDigest !== registration.contractRef.contractDigest
    ) throw new Error('sandbox_capability_publication_identity_mismatch')
    await db.patch(existing._id, {
      credentialState: 'unobserved', healthState: 'unobserved', readinessEvidenceRefs: [],
      readinessObservedAt: undefined, readinessValidUntil: undefined, updatedAt: observedAt,
    })
    return existing.publicationRef
  }
  await db.insert('capabilityPublications', {
    publicationRef: registration.offeringId,
    revision: 1,
    businessId: business._id,
    networkId: 'ae:public',
    sourceKind: 'ae_envelope',
    sourceDigest,
    ...registration.contractRef,
    offeringId: registration.offeringId,
    bindingId: registration.bindingId,
    disposition: 'current',
    credentialState: 'unobserved',
    healthState: 'unobserved',
    readinessEvidenceRefs: [],
    registrationEvidenceRefs: ['seed:sandbox-labelled-business'],
    createdAt: observedAt,
    updatedAt: observedAt,
  })
  return registration.offeringId
}

export async function registerSandboxBusinesses(
  db: ReturnType<typeof runtimeDb>,
  fixtures: readonly DevSeedBusinessFixture[],
  registeredAt: number,
): Promise<{ seededSlugs: string[]; businessIdsBySlug: Record<string, string> }> {
  const businessIdsBySlug: Record<string, string> = {}
  for (const [index, fixture] of fixtures.entries()) {
    const now = registeredAt + index * 1_000
    const actor = {
      kind: 'authenticated_owner' as const,
      clerkUserId: DEV_SEED_OWNER_CLERK_USER_ID,
      displayName: 'Dev Seed Owner',
    }
    const claim = await claimBusinessCommand(db, {
      actor,
      facts: {
        name: fixture.businessName,
        category: fixture.category,
        suburb: fixture.suburb,
        stateTerritory: fixture.stateTerritory,
        requestedSlug: fixture.requestedSlug,
        ...(fixture.publishedPhone === undefined ? {} : { publishedPhone: fixture.publishedPhone }),
        ownerMessage: fixture.ownerMessage,
        sourceRefs: [{
          label: fixture.sourceLabel,
          evidenceRef: `private:evidence:dev-seed:${fixture.requestedSlug}`,
          sourceHash: `hash:dev-seed:${fixture.requestedSlug}`,
        }],
      },
      operationKey: `seed:claim:${fixture.requestedSlug}`,
      correlationId: `seed:claim:${fixture.requestedSlug}`,
    }, now)
    if (claim.kind !== 'ok') throw new Error(`sandbox_business_claim_${claim.code}`)

    const published = await publishBusinessCatalogCommand(db, {
      actor,
      claimId: claim.claim.claimId,
      operationKey: `seed:catalog:${fixture.requestedSlug}`,
      correlationId: `seed:catalog:${fixture.requestedSlug}`,
      services: [{
        name: fixture.serviceName,
        category: fixture.serviceCategory,
        summary: fixture.serviceSummary,
        serviceArea: fixture.serviceArea,
        hoursOrUnknown: fixture.hoursOrUnknown,
        firstRequest: fixture.firstRequestMode === 'not_available_yet'
          ? {
              mode: fixture.firstRequestMode,
              publicChannel: 'not_available',
              noContactReason: fixture.noContactReason || 'Sandbox contact is unavailable.',
            }
          : {
              mode: fixture.firstRequestMode,
              publicChannel: 'ae_status_only',
              publicDisclosure: fixture.publicDisclosure,
            },
      }],
    }, now + 500)
    if (published.kind !== 'ok') throw new Error(`sandbox_business_publish_${published.code}`)
    businessIdsBySlug[fixture.requestedSlug] = published.business.businessId
  }
  return { seededSlugs: fixtures.map((fixture) => fixture.requestedSlug), businessIdsBySlug }
}

export type SandboxV2SupplyRegistration = {
  slug: string
  offeringId: string
  bindingId: string
  contractRef: CapabilityContractRef
  offeringRegistrationHash: string
  bindingRegistrationHash: string
}

export async function registerSandboxV2SupplyRegistrations(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  registeredAt: number,
): Promise<SandboxV2SupplyRegistration[]> {
  const encoded = encodeCapabilityContractDocument(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT)
  const contract = await registerCapabilityContractDocument(db, encoded.documentJson, registeredAt)
  if (contract.kind !== 'registered') throw new Error(`sandbox_v2_contract_registration_${contract.reason}`)
  const siteUrl = process.env.AE_SITE_URL?.trim() || 'https://agentic-economy-phi.vercel.app'
  const registered: SandboxV2SupplyRegistration[] = []
  for (const [profileKey, profile] of Object.entries(SANDBOX_PROVIDER_PROFILES)) {
    const business = await db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', profile.slug)).unique()
    if (business === null) throw new Error(`sandbox_v2_business_missing_${profile.slug}`)
    const commandContext = {
      correlationId: `seed:capability-supply:${profile.slug}`,
      reasonCode: 'labelled_sandbox_source_registration',
      evidenceRefs: ['seed:sandbox-labelled-business'],
    }
    const offering = await registerCapabilityOfferingCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: { ...commandContext, operationKey: `seed:capability-offering:${profile.offeringId}` },
      registration: {
        offeringId: profile.offeringId,
        businessId: business._id,
        networkId: 'ae:public',
        contractRef: contract.ref,
        presentation: {
          label: profile.label,
          summary: 'Labelled sandbox supply for source and contract verification only.',
          price: { kind: 'fixed', currency: 'AUD', amountMinor: profile.amountMinor },
          materialTerms: [{ termId: 'sandbox_only', label: 'Environment', value: 'Sandbox only; not real supply.' }],
          commercialRelationship: {
            kind: 'none',
            summary: 'Sandbox verification has no payment, sponsorship, rebate, or ownership relationship.',
            influencesEligibility: false,
            influencesInclusion: false,
            influencesOrder: false,
            evidenceRefs: ['seed:sandbox-commercial-neutrality'],
          },
        },
        searchTerms: [...profile.queryTerms],
        registrationEvidenceRefs: ['seed:sandbox-labelled-business'],
      },
    }, registeredAt)
    if (offering.kind !== 'registered') throw new Error(`sandbox_v2_offering_registration_${offering.reason}`)
    const binding = await registerCapabilityBindingCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: { ...commandContext, operationKey: `seed:capability-binding:${profile.v3BindingId}` },
      registration: {
        bindingId: profile.v3BindingId,
        offeringId: profile.offeringId,
        networkId: 'ae:public',
        contractRef: contract.ref,
        endpointUrl: new URL(`/api/sandbox/capability?profile=${profileKey}&binding=v4`, siteUrl).href,
        credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
        continuation: { kind: 'single_response', evidenceRefs: ['seed:sandbox-single-response'] },
        cancellation: { kind: 'unsupported', evidenceRefs: ['seed:sandbox-no-cancellation'] },
        adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
        registrationEvidenceRefs: ['seed:production-v2-registration-path'],
      },
    }, registeredAt)
    if (binding.kind !== 'registered') throw new Error(`sandbox_v2_binding_registration_${binding.reason}`)
    registered.push({
      slug: profile.slug,
      offeringId: profile.offeringId,
      bindingId: binding.bindingId,
      contractRef: contract.ref,
      offeringRegistrationHash: offering.registrationHash,
      bindingRegistrationHash: binding.registrationHash,
    })
  }
  return registered
}

export async function admitSandboxV2Supply(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  registrations: readonly SandboxV2SupplyRegistration[],
  admittedAt: number,
): Promise<string[]> {
  const admitted: string[] = []
  for (const registration of registrations) {
    const eligibility = await setCapabilitySupplyEligibilityCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: {
        correlationId: `seed:capability-supply:${registration.slug}`,
        operationKey: `seed:capability-eligibility:${registration.bindingId}`,
        reasonCode: 'labelled_sandbox_source_registration',
        evidenceRefs: ['seed:sandbox-labelled-business'],
      },
      eligibility: {
        offeringId: registration.offeringId,
        bindingId: registration.bindingId,
        contractRef: registration.contractRef,
        decision: 'admit',
        expectedOfferingRegistrationHash: registration.offeringRegistrationHash,
        expectedBindingRegistrationHash: registration.bindingRegistrationHash,
        admissionEvidenceRefs: ['seed:sandbox-business-published', 'seed:sandbox-contract-reviewed'],
        conformanceEvidenceRefs: ['seed:sandbox-http-json-conformance'],
      },
    }, admittedAt)
    if (eligibility.kind !== 'eligible') throw new Error(`sandbox_v2_eligibility_${eligibility.kind}`)
    admitted.push(registration.bindingId)
  }
  return admitted
}

export async function retireSupersededSandboxV2Supply(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  registrations: readonly SandboxV2SupplyRegistration[],
  retiredAt: number,
): Promise<string[]> {
  const retired: string[] = []
  const siteUrl = process.env.AE_SITE_URL?.trim() || 'https://agentic-economy-phi.vercel.app'
  const legacyContractRef = encodeCapabilityContractDocument(SANDBOX_V2_LEGACY_CAPABILITY_CONTRACT_DOCUMENT).contract.ref
  const priorContractRef = encodeCapabilityContractDocument(SANDBOX_V2_PRIOR_CAPABILITY_CONTRACT_DOCUMENT).contract.ref
  for (const [profileKey, profile] of Object.entries(SANDBOX_PROVIDER_PROFILES)) {
    const corrected = registrations.find((registration) => registration.slug === profile.slug)
    if (corrected === undefined) throw new Error(`sandbox_v2_corrected_registration_missing_${profile.slug}`)
    const offering = await db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', profile.priorOfferingId))
      .unique()
    const business = await db.query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', profile.slug))
      .unique()
    const legacyBindings = [
      {
        bindingId: profile.legacyV2BindingId,
        endpointUrl: new URL(`/api/sandbox/capability?profile=${profileKey}`, siteUrl).href,
        credentialRef: `env:AE_SANDBOX_PROVIDER_${profileKey.toUpperCase()}_KEY`,
      },
      {
        bindingId: profile.priorV2BindingId,
        endpointUrl: new URL(`/api/sandbox/capability?profile=${profileKey}&binding=v2`, siteUrl).href,
        credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
      },
    ]
    for (const expected of legacyBindings) {
      const binding = await db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', expected.bindingId))
        .unique()
      if (binding === null) continue
      if (
        offering === null
        || business === null
        || offering.businessId !== business._id
        || binding.offeringId !== profile.priorOfferingId
        || binding.networkId !== 'ae:public'
        || binding.capabilityId !== legacyContractRef.capabilityId
        || binding.version !== legacyContractRef.version
        || binding.contractDigest !== legacyContractRef.contractDigest
        || offering.capabilityId !== legacyContractRef.capabilityId
        || offering.version !== legacyContractRef.version
        || offering.contractDigest !== legacyContractRef.contractDigest
        || binding.endpointUrl !== expected.endpointUrl
        || binding.credentialRef !== expected.credentialRef
        || binding.adapterId !== 'http-json:v1'
        || binding.configJson !== '{"method":"POST","requestTimeoutMs":5000}'
        || binding.configDigest !== canonicalDigest({ method: 'POST', requestTimeoutMs: 5_000 })
        || binding.continuation.kind !== 'single_response'
        || binding.continuation.evidenceRefs.length !== 1
        || binding.continuation.evidenceRefs[0] !== 'seed:sandbox-single-response'
        || binding.cancellation.kind !== 'unsupported'
        || binding.cancellation.evidenceRefs.length !== 1
        || binding.cancellation.evidenceRefs[0] !== 'seed:sandbox-no-cancellation'
        || binding.registrationEvidenceRefs.length !== 1
        || binding.registrationEvidenceRefs[0] !== 'seed:production-v2-registration-path'
      ) throw new Error(`sandbox_v2_legacy_binding_identity_mismatch_${expected.bindingId}`)
      const isOriginalLegacyBinding = expected.bindingId === profile.legacyV2BindingId
      const retirementEvidenceRef = isOriginalLegacyBinding
        ? 'seed:sandbox-shared-provider-credential'
        : 'seed:sandbox-capability-contract-upgraded'
      const result = await setCapabilitySupplyEligibilityCommand(db, {
        actor: { kind: 'system', ref: 'system:dev-seed' },
        context: {
          operationKey: `seed:capability-binding-retire:${expected.bindingId}`,
          correlationId: `seed:capability-supply:${profile.slug}`,
          reasonCode: 'labelled_sandbox_binding_replaced',
          evidenceRefs: [retirementEvidenceRef],
        },
        eligibility: {
          offeringId: offering.offeringId,
          bindingId: binding.bindingId,
          contractRef: legacyContractRef,
          decision: 'revoke',
          expectedOfferingRegistrationHash: offering.registrationHash,
          expectedBindingRegistrationHash: binding.registrationHash,
          admissionEvidenceRefs: [retirementEvidenceRef],
          conformanceEvidenceRefs: [retirementEvidenceRef],
        },
      }, retiredAt)
      if (result.kind !== 'ineligible') {
        throw new Error(`sandbox_v2_legacy_binding_retirement_${result.kind}`)
      }
      retired.push(binding.bindingId)
    }
    const priorOffering = await db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', profile.priorV2OfferingId))
      .unique()
    const priorBinding = await db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', profile.v2BindingId))
      .unique()
    if (priorOffering === null && priorBinding === null) continue
    if (
      priorOffering === null
      || priorBinding === null
      || business === null
      || priorOffering.businessId !== business._id
      || priorBinding.offeringId !== profile.priorV2OfferingId
      || priorBinding.networkId !== 'ae:public'
      || priorBinding.capabilityId !== priorContractRef.capabilityId
      || priorBinding.version !== priorContractRef.version
      || priorBinding.contractDigest !== priorContractRef.contractDigest
      || priorOffering.capabilityId !== priorContractRef.capabilityId
      || priorOffering.version !== priorContractRef.version
      || priorOffering.contractDigest !== priorContractRef.contractDigest
      || priorBinding.endpointUrl !== new URL(`/api/sandbox/capability?profile=${profileKey}&binding=v3`, siteUrl).href
      || priorBinding.credentialRef !== 'env:AE_SANDBOX_PROVIDER_KEY'
      || priorBinding.adapterId !== 'http-json:v1'
      || priorBinding.configJson !== '{"method":"POST","requestTimeoutMs":5000}'
      || priorBinding.configDigest !== canonicalDigest({ method: 'POST', requestTimeoutMs: 5_000 })
      || priorBinding.continuation.kind !== 'single_response'
      || priorBinding.continuation.evidenceRefs.length !== 1
      || priorBinding.continuation.evidenceRefs[0] !== 'seed:sandbox-single-response'
      || priorBinding.cancellation.kind !== 'unsupported'
      || priorBinding.cancellation.evidenceRefs.length !== 1
      || priorBinding.cancellation.evidenceRefs[0] !== 'seed:sandbox-no-cancellation'
      || priorBinding.registrationEvidenceRefs.length !== 1
      || priorBinding.registrationEvidenceRefs[0] !== 'seed:production-v2-registration-path'
    ) throw new Error(`sandbox_v2_prior_binding_identity_mismatch_${profile.v2BindingId}`)
    const priorResult = await setCapabilitySupplyEligibilityCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: {
        operationKey: `seed:capability-binding-retire:${profile.v2BindingId}`,
        correlationId: `seed:capability-supply:${profile.slug}`,
        reasonCode: 'labelled_sandbox_contract_replaced',
        evidenceRefs: ['seed:sandbox-capability-contract-upgraded'],
      },
      eligibility: {
        offeringId: priorOffering.offeringId,
        bindingId: priorBinding.bindingId,
        contractRef: priorContractRef,
        decision: 'revoke',
        expectedOfferingRegistrationHash: priorOffering.registrationHash,
        expectedBindingRegistrationHash: priorBinding.registrationHash,
        admissionEvidenceRefs: ['seed:sandbox-capability-contract-upgraded'],
        conformanceEvidenceRefs: ['seed:sandbox-capability-contract-upgraded'],
      },
    }, retiredAt)
    if (priorResult.kind !== 'ineligible') {
      throw new Error(`sandbox_v2_prior_binding_retirement_${priorResult.kind}`)
    }
    retired.push(priorBinding.bindingId)
  }
  return retired
}
