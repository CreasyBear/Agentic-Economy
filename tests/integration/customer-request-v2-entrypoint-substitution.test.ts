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
import { openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import { decodeDurableCapabilityContract } from '@/modules/capability-contract-registry/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import { convexTestWithWorkers } from '../helpers/convex-fixtures'

const FRANKFURTER_CAPABILITY = 'frankfurter.single-rate'
type Backend = ReturnType<typeof convexTestWithWorkers>

type SubstitutionBusinessSpec = Readonly<{
  name: string
  slug: string
  price: number
  offeringId: string
  bindingId: string
  endpointUrl: string
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
  credentialRef: 'env:AE_SUBSTITUTION_THREE_KEY',
  credential: 'ae-substitution-three-test-key',
}

type SubstitutionRegistration = Readonly<{
  businessId: string
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
      expectedCost: { currency: 'AUD', amountMinor: 0 },
      maximumCost: { currency: 'AUD', amountMinor: 0 },
      expectedLatencyMs: 1,
      dataFields: [],
      disclosures: ['Readiness probe only.'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const backend = await convexTestWithWorkers()
    await seedFrankfurterContract(backend)
    const one = await registerSubstitutionBusiness(backend, SUBSTITUTION_ONE)
    const two = await registerSubstitutionBusiness(backend, SUBSTITUTION_TWO)

    const before = await prepareCustomerChoice(backend, 'request:substitution:registered', 'customer-substitution')
    expect(before).toMatchObject({
      state: 'options_ready',
      preparedAction: {
        businessName: 'Frankfurter Substitution Two',
        alternatives: [{ businessName: 'Frankfurter Substitution One' }],
      },
    })

    const revoked = await revokeRegistration(backend, two)
    expect(revoked).toBe('ineligible')

    const after = await prepareCustomerChoice(backend, 'request:substitution:registered-after', 'customer-substitution-after')
    expect(after).toMatchObject({
      state: 'options_ready',
      preparedAction: {
        businessName: 'Frankfurter Substitution One',
        selection: { alternativeCount: 0 },
        alternatives: [],
      },
    })
  })

  it('adds and removes a conformant business without changing the Request or caller contract', async () => {
    vi.stubEnv('AE_SITE_URL', 'https://substitution-ae.example.test')
    vi.stubEnv('AE_SUBSTITUTION_ONE_KEY', SUBSTITUTION_ONE.credential)
    vi.stubEnv('AE_SUBSTITUTION_TWO_KEY', SUBSTITUTION_TWO.credential)
    vi.stubEnv('AE_SUBSTITUTION_THREE_KEY', SUBSTITUTION_THREE.credential)
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    providerFetch.mockImplementation(async () => new UndiciResponse(JSON.stringify({
      kind: 'quoted',
      expectedCost: { currency: 'AUD', amountMinor: 0 },
      maximumCost: { currency: 'AUD', amountMinor: 0 },
      expectedLatencyMs: 1,
      dataFields: [],
      disclosures: ['Readiness probe only.'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const backend = await convexTestWithWorkers()
    await seedFrankfurterContract(backend)
    await registerSubstitutionBusiness(backend, SUBSTITUTION_ONE)
    const two = await registerSubstitutionBusiness(backend, SUBSTITUTION_TWO)
    const three = await registerSubstitutionBusiness(backend, SUBSTITUTION_THREE)

    const withThird = await prepareCustomerChoice(backend, 'request:substitution:three', 'customer-substitution')
    expect(withThird).toMatchObject({
      state: 'options_ready',
      preparedAction: {
        businessName: 'Frankfurter Substitution Three',
        price: { currency: 'USD', maximumAmountMinor: 500 },
        selection: { alternativeCount: 2 },
        alternatives: [
          { businessName: 'Frankfurter Substitution Two', price: { maximumAmountMinor: 900 } },
          { businessName: 'Frankfurter Substitution One', price: { maximumAmountMinor: 1_200 } },
        ],
      },
    })

    const revoked = await revokeRegistration(backend, three)
    expect(revoked).toBe('ineligible')

    const withoutThird = await prepareCustomerChoice(backend, 'request:substitution:two', 'customer-substitution-two')
    expect(withoutThird).toMatchObject({
      state: 'options_ready',
      preparedAction: {
        businessName: 'Frankfurter Substitution Two',
        price: { currency: 'USD', maximumAmountMinor: 900 },
        selection: { alternativeCount: 1 },
        alternatives: [{ businessName: 'Frankfurter Substitution One', price: { maximumAmountMinor: 1_200 } }],
      },
    })
  })
})

async function seedFrankfurterContract(backend: Backend) {
  await backend.mutation(internal.devSeed.seedDevCatalog, {})
  await readCuratedContract(backend, FRANKFURTER_CAPABILITY)
  // The curated seed admits the real Exa/Frankfurter bindings, but those carry
  // no egress credential (frankfurter uses `none`, exa uses an unstubbed key),
  // so they cannot be egressed. Revoke their eligibility so only the explicitly
  // registered substitution businesses below are routeable and egressed; they
  // all offer frankfurter.single-rate.
  await revokeCuratedSupply(backend)
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
        suburb: 'Adelaide',
        stateTerritory: 'SA',
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

  const owner = backend.withIdentity({
    subject: 'test-registration-owner', issuer: 'https://identity.test', tokenIdentifier: 'test-registration-owner',
  })
  const published = await owner.mutation(api.capabilitySupply.publishCapability, {
    businessId: registration.businessId,
    source: { kind: 'ae_envelope', documentJson },
    offering: {
      offeringId: spec.offeringId, networkId: 'ae:public',
      presentation: {
        label: spec.name, summary: `A deterministic ${FRANKFURTER_CAPABILITY} option for registration-only substitution proof.`,
        price: { kind: 'fixed', currency: 'USD', amountMinor: spec.price },
        materialTerms: [{ termId: 'verification_only', label: 'Environment', value: 'Verification only; not a real trading quote.' }],
        commercialRelationship: {
          kind: 'none', summary: 'AE verification has no commercial relationship.',
          influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
          evidenceRefs: ['test:substitution-commercial-neutrality'],
        },
      },
      searchTerms: ['frankfurter', 'exchange rate', 'substitution'],
      registrationEvidenceRefs: ['test:substitution-business-published'],
    },
    binding: {
      bindingId: spec.bindingId, endpointUrl: spec.endpointUrl,
      credentialRef: spec.credentialRef,
      continuation: { kind: 'single_response', evidenceRefs: ['test:substitution-single-response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['test:substitution-no-cancellation'] },
      adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
      registrationEvidenceRefs: ['test:substitution-binding-conformant'],
    },
    operationKey: `test:substitution:publication:${spec.slug}`,
    correlationId: `test:substitution:supply:${spec.slug}`,
    reasonCode: 'registration_only_substitution_proof',
    evidenceRefs: ['test:substitution-business-published'],
  })
  if (published.kind !== 'published') throw new Error(`substitution publication failed: ${published.reason}`)

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

async function prepareCustomerChoice(backend: Backend, requestId: string, subject = 'customer-substitution') {
  const callerIdentity = { subject, issuer: 'https://identity.test' }
  const callerPrincipalId = `${callerIdentity.issuer}|${callerIdentity.subject}`
  const { contract, contractRef: curatedContractRef } = await readCuratedContract(backend, FRANKFURTER_CAPABILITY)
  const model = openCapabilityDecisionModel(contract)
  const supply = await backend.query(internal.capabilitySupply.listIntegrated, {
    networkId: 'ae:public',
    limit: 16,
  })
  if (supply.kind !== 'available') throw new Error(`substitution supply unavailable: ${supply.reason}`)
  const frankfurter = supply.supplies.find(({ binding, publication }) => (
    publication !== undefined && binding.capabilityId === FRANKFURTER_CAPABILITY
  ))
  const publication = frankfurter?.publication
  if (publication === undefined) throw new Error('frankfurter publication operationRef missing')
  const facts = model.inputs.map((input) => ({
    inputKey: input.key,
    value: input.label === 'Quote currency' ? 'USD' : 'EUR',
  }))
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
    customerJob: 'Find the cheapest labelled substitution option',
    routing: { networkId: 'ae:public' },
  })
  if (submitted.kind !== 'request') throw new Error(`request submission failed: ${JSON.stringify(submitted)}`)
  const answered = submitted
  const decision = await customer.action(api.customerRequestApplication.compare, {
    requestRef: answered.requestRef,
    revision: answered.revision,
    idempotencyKey: `compare:${requestId}`,
  })
  if (decision.kind !== 'request' || decision.state !== 'routes_ready') throw new Error(`route decision missing: submitted=${JSON.stringify(submitted)} decision=${JSON.stringify(decision)}`)
  const aggregate = await backend.query(internal.customerRequestV2.getCurrentAggregate, { requestId })
  if (aggregate.kind !== 'current' || aggregate.aggregate.plan.actions[0] === undefined) throw new Error('request aggregate missing')
  const historical = await backend.mutation(internal.customerRequestV2Preparation.prepare, {
    commandKey: `historical-preparation:${requestId}`,
    commandDigest: canonicalDigest({ requestId, mode: 'historical_preparation_proof' }),
    principalId: callerPrincipalId,
    requestId,
    expectedRevision: decision.revision,
    actionId: aggregate.aggregate.plan.actions[0].actionId,
    now: Date.now(),
  })
  if (historical.kind !== 'stored' && historical.kind !== 'replayed') {
    throw new Error(`historical preparation proof missing: ${historical.kind}`)
  }
  let preparationRef = historical.preparation.preparationRef
  if (historical.preparation.kind === 'needs_authority') {
    // Zero-cost, disclosure-free supply (e.g. the curated Frankfurter capability)
    // routes without a separate owner-approval step; only step when the graph
    // actually demands authority.
    const review = { ...decision, preparationRef }
    const authorized = await backend.mutation(internal.customerRequestV2Preparation.prepare, {
      commandKey: `authorize:${requestId}`,
      commandDigest: canonicalDigest({ requestId, preparationRef: review.preparationRef }),
      principalId: callerPrincipalId,
      requestId,
      expectedRevision: review.revision,
      actionId: aggregate.aggregate.plan.actions[0].actionId,
      preparationRef: review.preparationRef,
      approvalActor: {
        kind: 'clerk_owner',
        requestPrincipalId: callerPrincipalId,
        ownerId: callerIdentity.subject,
        credentialId: callerPrincipalId,
        authenticationEvidenceRef: `clerk:test:${requestId}`,
        approvedAt: Date.now(),
      },
      now: Date.now(),
    })
    if (authorized.kind !== 'stored' && authorized.kind !== 'replayed') {
      throw new Error(`preparation authorization missing: ${authorized.kind}`)
    }
    preparationRef = authorized.preparation.preparationRef
  } else if (historical.preparation.kind !== 'ready_for_routing') {
    throw new Error(`historical preparation proof missing: kind=${historical.preparation.kind}`)
  }
  const fetchCountBefore = providerFetch.mock.calls.length
  providerFetch.mockImplementation(async (input, init) => {
    const endpoint = new URL(String(input))
    const body = JSON.parse(String(init?.body)) as {
      protocol: string
      operationRef: string
      contractRef: typeof curatedContractRef
      facts: unknown[]
    }
    const registered = registeredProviderFor(endpoint)
    expect(endpoint.protocol).toBe('https:')
    expect(body).toMatchObject({
      protocol: 'ae.preparation-egress:v1',
      contractRef: curatedContractRef,
    })
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${registered.credential}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Idempotency-Key': body.operationRef,
    })
    return new UndiciResponse(JSON.stringify({
      format: 'ae.provider-option:v1',
      operationRef: body.operationRef,
      contractRef: body.contractRef,
      offeringId: registered.offeringId,
      bindingId: registered.bindingId,
      assertionRef: `provider-assertion:${registered.bindingId}:${requestId}`,
      assertedAt: Date.now(),
      validUntil: Date.now() + 60_000,
      output: [{ date: '2026-08-04', base: 'EUR', quote: 'USD', rate: 1.0837 }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  const egress = await backend.action(internal.customerRequestV2PreparationEgress.run, {
    commandKey: `egress:${requestId}`,
    commandDigest: canonicalDigest({ requestId, preparationRef }),
    principalId: callerPrincipalId,
    preparationRef,
    now: Date.now(),
  })
  if (egress.kind !== 'completed' || egress.states.some(({ state }) => state !== 'released')) {
    throw new Error(`preparation egress failed: ${JSON.stringify(egress)}`)
  }
  expect(providerFetch.mock.calls.length - fetchCountBefore).toBe(egress.states.length)
  const resumed = await customer.action(api.customerRequestApplication.resume, { requestRef: requestId })
  if (resumed.kind !== 'request') throw new Error(`request resume failed: ${resumed.kind}`)
  if (resumed.state !== 'options_ready') {
    throw new Error(`request options not ready: ${JSON.stringify(resumed)}`)
  }
  return resumed
}

function registeredProviderFor(endpoint: URL) {
  const profile = endpoint.searchParams.get('profile')
  if (profile === 'one') return {
    offeringId: SUBSTITUTION_ONE.offeringId,
    bindingId: SUBSTITUTION_ONE.bindingId,
    credential: SUBSTITUTION_ONE.credential,
  }
  if (profile === 'two') return {
    offeringId: SUBSTITUTION_TWO.offeringId,
    bindingId: SUBSTITUTION_TWO.bindingId,
    credential: SUBSTITUTION_TWO.credential,
  }
  if (profile === 'three') return {
    offeringId: SUBSTITUTION_THREE.offeringId,
    bindingId: SUBSTITUTION_THREE.bindingId,
    credential: SUBSTITUTION_THREE.credential,
  }
  throw new Error(`unregistered provider endpoint: ${endpoint.href}`)
}
