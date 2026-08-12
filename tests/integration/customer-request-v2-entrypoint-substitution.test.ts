import { Response as UndiciResponse } from 'undici'
import { afterEach, describe, expect, it, vi } from 'vitest'

const providerFetch = vi.hoisted(() => vi.fn<typeof import('undici').fetch>())
vi.mock('undici', async (importOriginal) => ({
  ...await importOriginal<typeof import('undici')>(),
  fetch: providerFetch,
}))

import { claimBusinessCommand } from '../../convex/business'
import {
  setCapabilitySupplyEligibilityCommand,
} from '../../convex/capabilitySupply'
import { publishBusinessCatalogCommand } from '../../convex/catalog'
import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import type { CapabilityTransportAuthority } from '@/modules/capability-supply/public'
import { decodeDurableCapabilityContract } from '@/modules/capability-contract-registry/public'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  convexTestWithWorkers,
  prepareCapabilityPublicationMutation,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'

const FRANKFURTER_CAPABILITY = 'frankfurter.single-rate'
type Backend = ConvexFixtureBackend

type SubstitutionBusinessSpec = Readonly<{
  name: string
  slug: string
  price: number
  offeringId: string
  bindingId: string
  endpointUrl: string
  authority: CapabilityTransportAuthority
  credentialRef: string
  credential: string
}>

const SUBSTITUTION_ONE: SubstitutionBusinessSpec = {
  name: 'Frankfurter Substitution One',
  slug: 'frankfurter-substitution-one',
  price: 1_200,
  offeringId: 'offering:frankfurter-substitution:one:http-json:v1',
  bindingId: 'binding:frankfurter-substitution:one:http-json:v1',
  endpointUrl: 'https://substitution-one.example.test/capability?profile=one',
  authority: {
    kind: 'provider_connection',
    connectionRef: 'connection:ae-substitution-one',
    providerRef: 'provider:ae-substitution-one',
  },
  credentialRef: 'env:AE_SUBSTITUTION_ONE_KEY',
  credential: 'ae-substitution-one-test-key',
}

const SUBSTITUTION_TWO: SubstitutionBusinessSpec = {
  name: 'Frankfurter Substitution Two',
  slug: 'frankfurter-substitution-two',
  price: 900,
  offeringId: 'offering:frankfurter-substitution:two:http-json:v1',
  bindingId: 'binding:frankfurter-substitution:two:http-json:v1',
  endpointUrl: 'https://substitution-two.example.test/capability?profile=two',
  authority: {
    kind: 'provider_connection',
    connectionRef: 'connection:ae-substitution-two',
    providerRef: 'provider:ae-substitution-two',
  },
  credentialRef: 'env:AE_SUBSTITUTION_TWO_KEY',
  credential: 'ae-substitution-two-test-key',
}

const SUBSTITUTION_THREE: SubstitutionBusinessSpec = {
  name: 'Frankfurter Substitution Three',
  slug: 'frankfurter-substitution-three',
  price: 500,
  offeringId: 'offering:frankfurter-substitution:three:http-json:v1',
  bindingId: 'binding:frankfurter-substitution:three:http-json:v1',
  endpointUrl: 'https://substitution-three.example.test/capability?profile=three',
  authority: {
    kind: 'provider_connection',
    connectionRef: 'connection:ae-substitution-three',
    providerRef: 'provider:ae-substitution-three',
  },
  credentialRef: 'env:AE_SUBSTITUTION_THREE_KEY',
  credential: 'ae-substitution-three-test-key',
}

type SubstitutionRegistration = Readonly<{
  businessId: Id<'businesses'>
  contractRef: Readonly<{ capabilityId: string; version: number; contractDigest: string }>
  offeringId: string
  bindingId: string
  offeringRegistrationHash: string
  bindingRegistrationHash: string
  publicationRef: string
  expectedRevision: number
}>

describe('V2 Request registration-only business substitution', () => {
  afterEach(() => {
    providerFetch.mockReset()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('changes the customer options when only an admitted registration changes', async () => {
    vi.stubEnv('AE_SITE_URL', 'https://substitution-ae.example.test')
    vi.stubEnv('AE_SUBSTITUTION_ONE_KEY', SUBSTITUTION_ONE.credential)
    vi.stubEnv('AE_SUBSTITUTION_TWO_KEY', SUBSTITUTION_TWO.credential)
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    providerFetch.mockImplementation(async () => new UndiciResponse(JSON.stringify({
      kind: 'quoted',
      expectedCost: { currency: 'AUD', units: '0', exponent: 2 },
      maximumCost: { currency: 'AUD', units: '0', exponent: 2 },
      expectedLatencyMs: 1,
      dataFields: [],
      disclosures: ['Readiness probe only.'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  const backend = await convexTestWithWorkers()
    await seedFrankfurterContract(backend)
    const one = await registerSubstitutionBusiness(backend, SUBSTITUTION_ONE)
    const two = await registerSubstitutionBusiness(backend, SUBSTITUTION_TWO)

    const before = await compareCustomerChoice(backend, 'request:substitution:registered', 'customer-substitution')
    expect(before).toMatchObject({
      requestRef: 'request:substitution:registered',
      state: 'routes_ready',
      criteria: [
        { label: 'Base currency', value: 'EUR' },
        { label: 'Quote currency', value: 'USD' },
      ],
      decision: {
        outcome: { kind: 'routes_available', routeCount: 2 },
        routes: [
          {
            businesses: [{ name: 'Frankfurter Substitution Two' }],
            maximumTotalCost: { kind: 'known', amount: { currency: 'USD', units: '900', exponent: 2 } },
          },
          {
            businesses: [{ name: 'Frankfurter Substitution One' }],
            maximumTotalCost: { kind: 'known', amount: { currency: 'USD', units: '1200', exponent: 2 } },
          },
        ],
      },
    })
    expect(before.decision?.comparison).toMatchObject({
      kind: 'recommended',
      objective: 'lowest_maximum_price',
      routeRef: before.decision?.routes[0]?.routeRef,
    })

    const revoked = await revokeRegistration(backend, two)
    expect(revoked).toBe('ineligible')

    const after = await compareCustomerChoice(
      backend,
      'request:substitution:registered-after',
      'customer-substitution-after',
    )
    expect(after).toMatchObject({
      requestRef: 'request:substitution:registered-after',
      state: 'routes_ready',
      decision: {
        outcome: { kind: 'routes_available', routeCount: 1 },
        routes: [{
          businesses: [{ name: 'Frankfurter Substitution One' }],
          maximumTotalCost: { kind: 'known', amount: { currency: 'USD', units: '1200', exponent: 2 } },
        }],
      },
    })
    expect(after.decision?.routes).toHaveLength(1)
  })

  it('adds and removes a conformant business without changing the Request or caller contract', async () => {
    vi.stubEnv('AE_SITE_URL', 'https://substitution-ae.example.test')
    vi.stubEnv('AE_SUBSTITUTION_ONE_KEY', SUBSTITUTION_ONE.credential)
    vi.stubEnv('AE_SUBSTITUTION_TWO_KEY', SUBSTITUTION_TWO.credential)
    vi.stubEnv('AE_SUBSTITUTION_THREE_KEY', SUBSTITUTION_THREE.credential)
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    providerFetch.mockImplementation(async () => new UndiciResponse(JSON.stringify({
      kind: 'quoted',
      expectedCost: { currency: 'AUD', units: '0', exponent: 2 },
      maximumCost: { currency: 'AUD', units: '0', exponent: 2 },
      expectedLatencyMs: 1,
      dataFields: [],
      disclosures: ['Readiness probe only.'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const backend = await convexTestWithWorkers()
    await seedFrankfurterContract(backend)
    await registerSubstitutionBusiness(backend, SUBSTITUTION_ONE)
    const two = await registerSubstitutionBusiness(backend, SUBSTITUTION_TWO)
    const three = await registerSubstitutionBusiness(backend, SUBSTITUTION_THREE)

    const withThird = await compareCustomerChoice(backend, 'request:substitution:three', 'customer-substitution')
    expect(withThird).toMatchObject({
      requestRef: 'request:substitution:three',
      state: 'routes_ready',
      decision: {
        outcome: { kind: 'routes_available', routeCount: 3 },
        routes: [
          {
            businesses: [{ name: 'Frankfurter Substitution Three' }],
            maximumTotalCost: { kind: 'known', amount: { currency: 'USD', units: '500', exponent: 2 } },
          },
          {
            businesses: [{ name: 'Frankfurter Substitution Two' }],
            maximumTotalCost: { kind: 'known', amount: { currency: 'USD', units: '900', exponent: 2 } },
          },
          {
            businesses: [{ name: 'Frankfurter Substitution One' }],
            maximumTotalCost: { kind: 'known', amount: { currency: 'USD', units: '1200', exponent: 2 } },
          },
        ],
      },
    })
    expect(withThird.decision?.comparison).toMatchObject({
      kind: 'recommended',
      objective: 'lowest_maximum_price',
      routeRef: withThird.decision?.routes[0]?.routeRef,
    })

    const revoked = await revokeRegistration(backend, three)
    expect(revoked).toBe('ineligible')

    const withoutThird = await compareCustomerChoice(backend, 'request:substitution:two', 'customer-substitution-two')
    expect(withoutThird).toMatchObject({
      requestRef: 'request:substitution:two',
      state: 'routes_ready',
      decision: {
        outcome: { kind: 'routes_available', routeCount: 2 },
        routes: [
          {
            businesses: [{ name: 'Frankfurter Substitution Two' }],
            maximumTotalCost: { kind: 'known', amount: { currency: 'USD', units: '900', exponent: 2 } },
          },
          {
            businesses: [{ name: 'Frankfurter Substitution One' }],
            maximumTotalCost: { kind: 'known', amount: { currency: 'USD', units: '1200', exponent: 2 } },
          },
        ],
      },
    })
    expect(withoutThird.decision?.routes).toHaveLength(2)
    expect(withoutThird.decision?.comparison).toMatchObject({
      kind: 'recommended',
      objective: 'lowest_maximum_price',
      routeRef: withoutThird.decision?.routes[0]?.routeRef,
    })
  })
})


async function seedFrankfurterContract(backend: Backend) {
  await backend.mutation(internal.devSeed.seedDevCatalog, {})
  await backend.finishInProgressScheduledFunctions()
  await readCuratedContract(backend, FRANKFURTER_CAPABILITY)
  // The curated seed admits the real Exa/Frankfurter bindings, but those carry
  // no egress credential (frankfurter uses `none`, exa uses an unstubbed key),
  // so they cannot be egressed. Revoke their eligibility so only the explicitly
  // registered substitution businesses below are routeable and egressed; they
  // all offer frankfurter.single-rate.
  await revokeCuratedSupply(backend)
  await backend.finishInProgressScheduledFunctions()
}

async function revokeCuratedSupply(backend: Backend) {
  await backend.run(async (ctx) => {
    const bindings = await ctx.db.query('capabilityTransportBindings').collect()
    for (const binding of bindings) {
      const offering = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', binding.offeringId))
        .unique()
      if (offering === null) continue
      const contractRef = {
        capabilityId: binding.capabilityId,
        version: binding.version,
        contractDigest: binding.contractDigest,
      }
      const result = await setCapabilitySupplyEligibilityCommand(ctx.db, {
        actor: { kind: 'system', ref: 'system:test-registration-owner' },
        context: {
          operationKey: `test:substitution:revoke-curated:${binding.bindingId}`,
          correlationId: 'test:substitution:curated-supply',
          reasonCode: 'registration_only_substitution_proof',
          evidenceRefs: ['test:curated-supply-revoked'],
        },
        eligibility: {
          offeringId: offering.offeringId,
          bindingId: binding.bindingId,
          contractRef,
          decision: 'revoke',
          expectedOfferingRegistrationHash: offering.registrationHash,
          expectedBindingRegistrationHash: binding.registrationHash,
          admissionEvidenceRefs: ['test:curated-supply-revoked'],
          conformanceEvidenceRefs: ['test:curated-supply-revoked'],
        },
      }, Date.now())
      if (result.kind !== 'ineligible') {
        throw new Error(`curated supply revoke failed: ${result.kind !== 'refused' ? result.kind : result.reason}`)
      }
    }
  })
}

async function readCuratedContract(backend: Backend, capabilityId: string) {
  const row = await backend.run(async (ctx) => (
    await ctx.db.query('capabilityContractDocuments')
      .withIndex('by_status_and_capabilityId_and_version', (query) => (
        query.eq('status', 'active').eq('capabilityId', capabilityId)
      ))
      .order('desc')
      .first()
  ))
  if (row === null) throw new Error(`curated contract missing: ${capabilityId}`)
  const { _id: _rowId, _creationTime: _rowCreationTime, ...contractRow } = row
  const decoded = decodeDurableCapabilityContract({
    ref: {
      capabilityId: contractRow.capabilityId,
      version: contractRow.version,
      contractDigest: contractRow.contractDigest,
    },
    documentJson: contractRow.documentJson,
    status: contractRow.status,
    registeredAt: contractRow.registeredAt,
  })
  if (decoded.kind !== 'found') throw new Error(`curated contract unavailable: ${capabilityId}`)
  return {
    contract: decoded.contract,
    contractRef: {
      capabilityId: contractRow.capabilityId,
      version: contractRow.version,
      contractDigest: contractRow.contractDigest,
    },
    documentJson: contractRow.documentJson,
  }
}
async function createSubstitutionProviderConnection(
  backend: Backend,
  businessId: Id<'businesses'>,
  spec: SubstitutionBusinessSpec,
) {
  if (spec.authority.kind !== 'provider_connection') {
    throw new Error(`substitution provider connection authority missing: ${spec.slug}`)
  }
  const result = await backend.mutation(internal.capabilityProviderConnections.create, {
    commandId: `test:substitution:connection:${spec.slug}`,
    connectionRef: spec.authority.connectionRef,
    businessId,
    providerRef: spec.authority.providerRef,
    providerAccountRef: `account:${spec.slug}`,
    adapterId: 'http-json:v1',
    credentialRef: spec.credentialRef,
    requestedScopes: [`capability:${FRANKFURTER_CAPABILITY}`],
    grantedScopes: [`capability:${FRANKFURTER_CAPABILITY}`],
    requestedResources: [`endpoint:${spec.endpointUrl}`],
    grantedResources: [`endpoint:${spec.endpointUrl}`],
    evidenceRefs: [`test:provider-connection:${spec.slug}`],
    now: Date.now(),
  })
  if (result.kind !== 'applied') throw new Error(`provider_connection_fixture_${result.kind}`)
}

async function declareSubstitutionAccessPath(
  backend: Backend,
  businessId: Id<'businesses'>,
  spec: SubstitutionBusinessSpec,
) {
  return await backend.run(async (ctx) => {
    const offerings = await ctx.db.query('businessOfferings')
      .withIndex('by_businessId_and_status', (query) => (
        query.eq('businessId', businessId).eq('status', 'published')
      ))
      .collect()
    const offering = offerings[0]
    if (offering === undefined) throw new Error(`substitution offering missing: ${spec.slug}`)
    const revision = await ctx.db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => (
        query.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision)
      ))
      .unique()
    if (revision === null) throw new Error(`substitution offering revision missing: ${spec.slug}`)
    const accessPathRef = `access:${spec.slug}:external`
    const descriptor = {
      kind: 'external_operation' as const,
      name: spec.name,
      summary: `A deterministic ${FRANKFURTER_CAPABILITY} operation for registration-only substitution proof.`,
      url: spec.endpointUrl,
      method: 'POST' as const,
      provenance: 'business_declared' as const,
    }
    const accessPathSourceHash = canonicalDigest({
      accessPathRef,
      offeringSourceHash: revision.sourceHash,
      descriptor,
    })
    const now = Date.now()
    await ctx.db.insert('offeringAccessPaths', {
      accessPathRef,
      businessId,
      offeringRef: offering.offeringRef,
      offeringRevision: revision.revision,
      offeringSourceHash: revision.sourceHash,
      status: 'published',
      descriptor,
      sourceHash: accessPathSourceHash,
      createdAt: now,
      updatedAt: now,
    })
    return {
      kind: 'catalog_offering' as const,
      offeringRef: offering.offeringRef,
      offeringRevision: revision.revision,
      offeringSourceHash: revision.sourceHash,
      declaredAccessPathRef: accessPathRef,
      accessPathSourceHash,
    }
  })
}


async function registerSubstitutionBusiness(
  backend: Backend,
  spec: SubstitutionBusinessSpec,
): Promise<SubstitutionRegistration> {
  const { contractRef, documentJson } = await readCuratedContract(backend, FRANKFURTER_CAPABILITY)
  const registration = await backend.run(async (ctx) => {
    const now = Date.now()
    const actor = {
      kind: 'authenticated_owner' as const,
      clerkUserId: 'test-registration-owner',
      displayName: 'Registration Test Owner',
    }
    const claim = await claimBusinessCommand(ctx.db, {
      actor,
      facts: {
        name: spec.name,
        category: 'AE verification capability provider',
        businessContext: {
          kind: 'programmable_provider',
          website: 'https://provider.example',
          providerIdentifier: `provider:${spec.slug}`,
        },
        requestedSlug: spec.slug,
        ownerMessage: 'Clearly labelled verification business for registration-only substitution proof.',
        sourceRefs: [{
          label: 'AE registration proof',
          evidenceRef: `private:evidence:test:${spec.slug}`,
        }],
      },
      operationKey: `test:substitution:claim:${spec.slug}`,
      correlationId: `test:substitution:claim:${spec.slug}`,
    }, now)
    if (claim.kind !== 'ok') throw new Error(`substitution claim failed: ${claim.code}`)
    const published = await publishBusinessCatalogCommand(ctx.db, {
      actor,
      claimId: claim.claim.claimId,
      operationKey: `test:substitution:catalog:${spec.slug}`,
      correlationId: `test:substitution:catalog:${spec.slug}`,
      services: [{
        name: `Prepare a ${spec.name} option`,
        category: 'AE verification capability provider',
        summary: 'Returns a deterministic option through the production capability protocol.',
        serviceArea: 'Online',
        hoursOrUnknown: 'Always available for verification',
        firstRequest: {
          mode: 'inquiry_available',
          publicChannel: 'ae_status_only',
          publicDisclosure: 'Verification only. No real external service is supplied.',
        },
      }],
    }, now + 1)
    if (published.kind !== 'ok') throw new Error(`substitution publish failed: ${published.code}`)
    const business = await ctx.db.query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', spec.slug))
      .unique()
    if (business === null) throw new Error(`${spec.slug} business missing`)
    return { businessId: business._id }
  })
  await createSubstitutionProviderConnection(backend, registration.businessId, spec)
  const catalogOrigin = await declareSubstitutionAccessPath(backend, registration.businessId, spec)

  const owner = backend.withIdentity({
    subject: 'test-registration-owner', issuer: 'https://identity.test', tokenIdentifier: 'test-registration-owner',
  })
  const input = {
    businessId: registration.businessId,
    source: { kind: 'ae_envelope' as const, documentJson },
    offering: {
      offeringId: spec.offeringId, networkId: 'ae:public', origin: catalogOrigin,
      presentation: {
        label: spec.name, summary: `A deterministic ${FRANKFURTER_CAPABILITY} option for registration-only substitution proof.`,
        price: { kind: 'fixed' as const, amount: { currency: 'USD' as const, units: String(spec.price), exponent: 2 } },
        materialTerms: [{ termId: 'verification_only', label: 'Environment', value: 'Verification only; not a real trading quote.' }],
        commercialRelationship: {
          kind: 'none' as const, summary: 'AE verification has no commercial relationship.',
          influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
          evidenceRefs: ['test:substitution-commercial-neutrality'],
        },
      },
      searchTerms: ['frankfurter', 'exchange rate', 'substitution'],
      registrationEvidenceRefs: ['test:substitution-business-published'],
    },
    binding: {
      bindingId: spec.bindingId, endpointUrl: spec.endpointUrl,
      authority: spec.authority,
      continuation: { kind: 'single_response' as const, evidenceRefs: ['test:substitution-single-response'] },
      cancellation: { kind: 'unsupported' as const, evidenceRefs: ['test:substitution-no-cancellation'] },
      adapter: { adapterId: 'http-json:v1', config: { method: 'POST' as const, requestTimeoutMs: 5_000 } },
      registrationEvidenceRefs: ['test:substitution-binding-conformant'],
    },
    operationKey: `test:substitution:publication:${spec.slug}`,
    correlationId: `test:substitution:supply:${spec.slug}`,
    reasonCode: 'registration_only_substitution_proof',
    evidenceRefs: ['test:substitution-business-published'],
  }
  const prepared = await prepareCapabilityPublicationMutation(backend, input)
  const published = await owner.mutation(
    api.capabilitySupply.publishPreparedCapability,
    await withSourceWrite('catalog_publish', prepared),
  )
  if ('reason' in published) throw new Error(`substitution publication failed: ${published.reason}`)

  const hashes = await backend.run(async (ctx) => {
    const commandContext = {
      correlationId: `test:substitution:supply:${spec.slug}`,
      reasonCode: 'registration_only_substitution_proof',
      evidenceRefs: ['test:substitution-business-published'],
    }
    const offering = await ctx.db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', spec.offeringId)).unique()
    const binding = await ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', spec.bindingId)).unique()
    if (offering === null || binding === null) throw new Error(`${spec.slug} published supply missing`)
    const eligibility = await setCapabilitySupplyEligibilityCommand(ctx.db, {
      actor: { kind: 'system', ref: 'system:test-registration-owner' },
      context: { ...commandContext, operationKey: `test:substitution:eligibility:${spec.slug}` },
      eligibility: {
        offeringId: spec.offeringId,
        bindingId: spec.bindingId,
        contractRef,
        decision: 'admit',
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: ['test:substitution-business-published'],
        conformanceEvidenceRefs: ['test:substitution-binding-conformant'],
      },
    }, Date.now())
    if (eligibility.kind !== 'eligible') throw new Error(`substitution eligibility failed: ${eligibility.kind}`)
    return { offering: offering.registrationHash, binding: binding.registrationHash }
  })
  // convex-test registers scheduled actions on the next event-loop turn; fake timers cannot drive its internal scheduler.
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await backend.finishInProgressScheduledFunctions()
  const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: published.publicationRef, expectedRevision: 1,
    credentialState: 'ready', healthState: 'healthy', validUntil: Date.now() + 300_000,
    operationKey: `test:substitution:readiness:${spec.slug}`, correlationId: `test:substitution:supply:${spec.slug}`,
    reasonCode: 'registration_only_substitution_proof', evidenceRefs: ['test:substitution-business-ready'],
  })
  if (observed.kind !== 'observed') throw new Error(`substitution readiness failed: ${observed.reason}`)
  return {
    businessId: registration.businessId,
    contractRef,
    offeringId: spec.offeringId,
    bindingId: spec.bindingId,
    offeringRegistrationHash: hashes.offering,
    bindingRegistrationHash: hashes.binding,
    publicationRef: published.publicationRef,
    expectedRevision: 1,
  }
}

async function revokeRegistration(backend: Backend, registration: SubstitutionRegistration): Promise<string> {
  const result = await backend.run(async (ctx) => {
    const revoked = await setCapabilitySupplyEligibilityCommand(ctx.db, {
      actor: { kind: 'system', ref: 'system:test-registration-owner' },
      context: {
        operationKey: `test:substitution:revoke:${registration.bindingId}`,
        correlationId: `test:substitution:revoke:${registration.bindingId}`,
        reasonCode: 'registration_only_substitution_proof',
        evidenceRefs: ['test:substitution-business-removed'],
      },
      eligibility: {
        offeringId: registration.offeringId,
        bindingId: registration.bindingId,
        contractRef: registration.contractRef,
        decision: 'revoke',
        expectedOfferingRegistrationHash: registration.offeringRegistrationHash,
        expectedBindingRegistrationHash: registration.bindingRegistrationHash,
        admissionEvidenceRefs: ['test:substitution-business-removed'],
        conformanceEvidenceRefs: ['test:substitution-business-removed'],
      },
    }, Date.now())
    if (revoked.kind !== 'ineligible') throw new Error(`substitution revoke failed: ${revoked.kind}`)
    return revoked.kind
  })
  return result
}

async function compareCustomerChoice(backend: Backend, requestId: string, subject = 'customer-substitution') {
  const callerIdentity = { subject, issuer: 'https://identity.test' }
  const { contract } = await readCuratedContract(backend, FRANKFURTER_CAPABILITY)
  const model = openCapabilityDecisionModel(contract)
  await backend.finishInProgressScheduledFunctions()
  const supply = await backend.query(internal.capabilitySupply.listIntegrated, {
    networkId: 'ae:public',
    limit: 16,
    now: Date.now(),
  })
  if (supply.kind !== 'available') throw new Error(`substitution supply unavailable: ${supply.reason}`)
  const frankfurter = supply.supplies.find((entry: (typeof supply.supplies)[number]) => (
    entry.publication !== undefined && entry.binding.capabilityId === FRANKFURTER_CAPABILITY
  ))
  const publication = frankfurter?.publication
  if (publication === undefined) throw new Error('frankfurter publication operationRef missing')
  const baseInput = model.inputs.find(({ label }) => label === 'Base currency')
  const quoteInput = model.inputs.find(({ label }) => label === 'Quote currency')
  if (baseInput === undefined || quoteInput === undefined) {
    throw new Error('frankfurter decision inputs missing')
  }
  const facts = [
    { inputKey: baseInput.key, value: 'EUR' },
    { inputKey: quoteInput.key, value: 'USD' },
  ]
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    choices: [{ message: { role: 'assistant', content: JSON.stringify({
      kind: 'capability_candidates',
      canonicalStatements: [],
      supersededStatements: [],
      selections: [{
        operationRef: publication.operationRef,
        selectionKey: model.selectionKey,
        facts,
      }],
    }) }, finish_reason: 'stop' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
  vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
  const customer = backend.withIdentity(callerIdentity)
  const submitted = await customer.action(api.customerRequestApplication.submit, {
    compilationKey: `submit:${requestId}`,
    requestId,
    delegatedAgentId: 'agent:substitution-proof',
    customerJob: 'Find the cheapest labelled EUR to USD substitution option',
    routing: { networkId: 'ae:public' },
  })
  if (submitted.kind !== 'request') throw new Error(`request submission failed: ${submitted.kind}`)
  if (submitted.state !== 'ready_to_compare') throw new Error(`request submission state failed: ${submitted.state}`)
  const decision = await customer.action(api.customerRequestApplication.compare, {
    requestRef: submitted.requestRef,
    revision: submitted.revision,
    idempotencyKey: `compare:${requestId}`,
  })
  if (decision.kind !== 'request') throw new Error(`route decision missing: ${decision.kind}`)
  if (decision.state !== 'routes_ready') throw new Error(`route decision state missing: ${decision.state}`)
  return decision
}
