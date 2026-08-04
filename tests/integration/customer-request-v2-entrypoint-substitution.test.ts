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
import { defineCapabilityContract, openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import { SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT } from '@/modules/sandbox-supply/public'
import { convexTestWithWorkers } from '../helpers/convex-fixtures'
type Backend = ReturnType<typeof convexTestWithWorkers>
const identity = { subject: 'customer-substitution', issuer: 'https://identity.test' }
const principalId = `${identity.issuer}|${identity.subject}`

describe('V2 Request registration-only business substitution', () => {
  afterEach(() => {
    providerFetch.mockReset()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('changes the customer options when only an admitted registration changes', async () => {
    vi.stubEnv('AE_SITE_URL', 'https://sandbox-ae.example.test')
    vi.stubEnv('AE_SANDBOX_PROVIDER_KEY', 'sandbox-provider-test-key')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    providerFetch.mockImplementation(async () => new UndiciResponse(JSON.stringify({
      kind: 'quoted',
      expectedCost: { currency: 'AUD', amountMinor: 0 },
      maximumCost: { currency: 'AUD', amountMinor: 0 },
      expectedLatencyMs: 1,
      dataFields: [],
      disclosures: ['Sandbox readiness probe only.'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const backend = await convexTestWithWorkers()
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await observeAllPublishedSupplyReady(backend)

    const before = await prepareCustomerChoice(backend, 'request:substitution:registered')
    expect(before).toMatchObject({
      state: 'options_ready',
      preparedAction: {
        businessName: 'Sandbox Option Two',
        alternatives: [{ businessName: 'Sandbox Option One' }],
      },
    })

    const revokeCommand = {
      profile: 'two',
      decision: 'revoke',
      operationKey: 'test:substitution:registration-only:revoke-two',
    } as const
    const revoked = await backend.mutation(internal.devSeed.setSandboxOptionEligibility, revokeCommand)
    expect(revoked).toMatchObject({ kind: 'ineligible' })
    await expect(backend.mutation(internal.devSeed.setSandboxOptionEligibility, revokeCommand))
      .resolves.toEqual(revoked)

    const after = await prepareCustomerChoice(backend, 'request:substitution:registered-after')
    expect(after).toMatchObject({
      state: 'options_ready',
      preparedAction: {
        businessName: 'Sandbox Option One',
        selection: { alternativeCount: 0 },
        alternatives: [],
      },
    })
  })

  it('adds and removes a conformant business without changing the Request or caller contract', async () => {
    vi.stubEnv('AE_SITE_URL', 'https://sandbox-ae.example.test')
    vi.stubEnv('AE_SANDBOX_PROVIDER_KEY', 'sandbox-provider-test-key')
    vi.stubEnv('AE_SANDBOX_PROVIDER_THREE_KEY', 'sandbox-provider-three-test-key')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    providerFetch.mockImplementation(async () => new UndiciResponse(JSON.stringify({
      kind: 'quoted',
      expectedCost: { currency: 'AUD', amountMinor: 0 },
      maximumCost: { currency: 'AUD', amountMinor: 0 },
      expectedLatencyMs: 1,
      dataFields: [],
      disclosures: ['Sandbox readiness probe only.'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const backend = await convexTestWithWorkers()
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    const third = await registerThirdSandboxBusiness(backend)
    await observeAllPublishedSupplyReady(backend)

    const withThird = await prepareCustomerChoice(backend, 'request:substitution:three')
    expect(withThird).toMatchObject({
      state: 'options_ready',
      preparedAction: {
        businessName: 'Sandbox Option Three',
        price: { currency: 'AUD', maximumAmountMinor: 500 },
        selection: { alternativeCount: 2 },
        alternatives: [
          { businessName: 'Sandbox Option Two', price: { maximumAmountMinor: 900 } },
          { businessName: 'Sandbox Option One', price: { maximumAmountMinor: 1_200 } },
        ],
      },
    })

    await backend.run(async (ctx) => {
      const revoked = await setCapabilitySupplyEligibilityCommand(ctx.db, {
        actor: { kind: 'system', ref: 'system:test-registration-owner' },
        context: {
          operationKey: 'test:substitution:revoke:three',
          correlationId: 'test:substitution:revoke:three',
          reasonCode: 'registration_only_substitution_proof',
          evidenceRefs: ['test:third-business-removed'],
        },
        eligibility: {
          offeringId: third.offeringId,
          bindingId: third.bindingId,
          contractRef: third.contractRef,
          decision: 'revoke',
          expectedOfferingRegistrationHash: third.offeringRegistrationHash,
          expectedBindingRegistrationHash: third.bindingRegistrationHash,
          admissionEvidenceRefs: ['test:third-business-removed'],
          conformanceEvidenceRefs: ['test:third-business-removed'],
        },
      }, Date.now())
      if (revoked.kind !== 'ineligible') throw new Error(`third business revoke failed: ${revoked.kind}`)
    })

    const withoutThird = await prepareCustomerChoice(backend, 'request:substitution:two')
    expect(withoutThird).toMatchObject({
      state: 'options_ready',
      preparedAction: {
        businessName: 'Sandbox Option Two',
        price: { currency: 'AUD', maximumAmountMinor: 900 },
        selection: { alternativeCount: 1 },
        alternatives: [{ businessName: 'Sandbox Option One', price: { maximumAmountMinor: 1_200 } }],
      },
    })
  })
})

async function registerThirdSandboxBusiness(backend: Backend) {
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
        name: 'Sandbox Option Three',
        category: 'Sandbox capability provider',
        suburb: 'Adelaide',
        stateTerritory: 'SA',
        requestedSlug: 'sandbox-option-three',
        ownerMessage: 'Clearly labelled non-production business for registration substitution proof.',
        sourceRefs: [{
          label: 'AE sandbox registration proof',
          evidenceRef: 'private:evidence:test:sandbox-option-three',
        }],
      },
      operationKey: 'test:substitution:claim:three',
      correlationId: 'test:substitution:claim:three',
    }, now)
    if (claim.kind !== 'ok') throw new Error(`third business claim failed: ${claim.code}`)
    const published = await publishBusinessCatalogCommand(ctx.db, {
      actor,
      claimId: claim.claim.claimId,
      operationKey: 'test:substitution:catalog:three',
      correlationId: 'test:substitution:catalog:three',
      services: [{
        name: 'Prepare a sandbox option',
        category: 'Sandbox capability provider',
        summary: 'Returns a third deterministic option through the production capability protocol.',
        serviceArea: 'Online',
        hoursOrUnknown: 'Always available for verification',
        firstRequest: {
          mode: 'inquiry_available',
          publicChannel: 'ae_status_only',
          publicDisclosure: 'Sandbox only. No real service is supplied.',
        },
      }],
    }, now + 1)
    if (published.kind !== 'ok') throw new Error(`third business publish failed: ${published.code}`)

    const contract = await ctx.db.query('capabilityContractDocuments')
      .withIndex('by_capabilityId_and_version', (query) => query
        .eq('capabilityId', SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT.capabilityId)
        .eq('version', SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT.version))
      .unique()
    if (contract === null) throw new Error('sandbox contract missing')
    const contractRef = {
      capabilityId: contract.capabilityId,
      version: contract.version,
      contractDigest: contract.contractDigest,
    }
    const business = await ctx.db.query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', 'sandbox-option-three'))
      .unique()
    if (business === null) throw new Error('third business missing')
    return { businessId: business._id, contractRef }
  })
  const offeringId = 'offering:sandbox-option-three:reference-lookup'
  const bindingId = 'binding:sandbox-option-three:http-json'
  const owner = backend.withIdentity({
    subject: 'test-registration-owner', issuer: 'https://identity.test', tokenIdentifier: 'test-registration-owner',
  })
  const published = await owner.mutation(api.capabilitySupply.publishCapability, {
    businessId: registration.businessId,
    source: { kind: 'ae_envelope', documentJson: JSON.stringify(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT) },
    offering: {
      offeringId, networkId: 'ae:public',
      presentation: {
        label: 'Sandbox Option Three', summary: 'Labelled sandbox supply for registration-only substitution proof.',
        price: { kind: 'fixed', currency: 'AUD', amountMinor: 500 },
        materialTerms: [{ termId: 'sandbox_only', label: 'Environment', value: 'Sandbox only; not real supply.' }],
        commercialRelationship: {
          kind: 'none', summary: 'Sandbox verification has no commercial relationship.',
          influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
          evidenceRefs: ['test:sandbox-commercial-neutrality'],
        },
      },
      searchTerms: ['sandbox', 'option', 'reference lookup'],
      registrationEvidenceRefs: ['test:third-business-published'],
    },
    binding: {
      bindingId, endpointUrl: 'https://sandbox-three.example.test/capability',
      credentialRef: 'env:AE_SANDBOX_PROVIDER_THREE_KEY',
      continuation: { kind: 'single_response', evidenceRefs: ['test:sandbox-single-response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['test:sandbox-no-cancellation'] },
      adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
      registrationEvidenceRefs: ['test:third-binding-conformant'],
    },
    operationKey: 'test:substitution:publication:three',
    correlationId: 'test:substitution:supply:three',
    reasonCode: 'registration_only_substitution_proof',
    evidenceRefs: ['test:third-business-published'],
  })
  if (published.kind !== 'published') throw new Error(`third publication failed: ${published.reason}`)
  const hashes = await backend.run(async (ctx) => {
    const commandContext = {
      correlationId: 'test:substitution:supply:three',
      reasonCode: 'registration_only_substitution_proof',
      evidenceRefs: ['test:third-business-published'],
    }
    const offering = await ctx.db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', offeringId)).unique()
    const binding = await ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', bindingId)).unique()
    if (offering === null || binding === null) throw new Error('third published supply missing')
    const eligibility = await setCapabilitySupplyEligibilityCommand(ctx.db, {
      actor: { kind: 'system', ref: 'system:test-registration-owner' },
      context: { ...commandContext, operationKey: 'test:substitution:eligibility:three' },
      eligibility: {
        offeringId,
        bindingId,
        contractRef: registration.contractRef,
        decision: 'admit',
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: ['test:third-business-published'],
        conformanceEvidenceRefs: ['test:third-binding-conformant'],
      },
    }, Date.now())
    if (eligibility.kind !== 'eligible') throw new Error(`third eligibility failed: ${eligibility.kind}`)
    return { offering: offering.registrationHash, binding: binding.registrationHash }
  })
  const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: published.publicationRef, expectedRevision: 1,
    credentialState: 'ready', healthState: 'healthy', validUntil: Date.now() + 300_000,
    operationKey: 'test:substitution:readiness:three', correlationId: 'test:substitution:supply:three',
    reasonCode: 'registration_only_substitution_proof', evidenceRefs: ['test:third-business-ready'],
  })
  if (observed.kind !== 'observed') throw new Error(`third readiness failed: ${observed.reason}`)
  return {
    offeringId, bindingId, contractRef: registration.contractRef,
    offeringRegistrationHash: hashes.offering,
    bindingRegistrationHash: hashes.binding,
  }
}

async function prepareCustomerChoice(backend: Backend, requestId: string) {
  const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
  const input = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
  if (input === undefined) throw new Error('sandbox request input missing')
  const supply = await backend.query(internal.capabilitySupply.listIntegrated, {
    networkId: 'ae:public',
    limit: 16,
  })
  if (supply.kind !== 'available') throw new Error(`sandbox supply unavailable: ${supply.reason}`)
  const publication = supply.supplies.find(({ binding }) => (
    binding.capabilityId === model.contractRef.capabilityId
      && binding.version === model.contractRef.version
      && binding.contractDigest === model.contractRef.contractDigest
  ))?.publication
  if (publication === undefined) throw new Error('sandbox publication operationRef missing')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    choices: [{ message: { role: 'assistant', content: JSON.stringify({
      kind: 'capability_candidates',
      canonicalStatements: [],
      supersededStatements: [],
      selections: [{
        operationRef: publication.operationRef,
        selectionKey: model.selectionKey,
        facts: [{ inputKey: input.key, value: 'Find the cheapest labelled sandbox option' }],
      }],
    }) }, finish_reason: 'stop' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
  vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
  const customer = backend.withIdentity(identity)
  const submitted = await customer.action(api.customerRequestApplication.submit, {
    compilationKey: `submit:${requestId}`,
    requestId,
    delegatedAgentId: 'agent:substitution-proof',
    customerJob: 'Find the cheapest labelled sandbox option',
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
    principalId,
    requestId,
    expectedRevision: decision.revision,
    actionId: aggregate.aggregate.plan.actions[0].actionId,
    now: Date.now(),
  })
  if ((historical.kind !== 'stored' && historical.kind !== 'replayed')
    || historical.preparation.kind !== 'needs_authority') throw new Error('historical preparation proof missing')
  const review = { ...decision, preparationRef: historical.preparation.preparationRef }
  const authorized = await backend.mutation(internal.customerRequestV2Preparation.prepare, {
    commandKey: `authorize:${requestId}`,
    commandDigest: canonicalDigest({ requestId, preparationRef: review.preparationRef }),
    principalId,
    requestId,
    expectedRevision: review.revision,
    actionId: aggregate.aggregate.plan.actions[0].actionId,
    preparationRef: review.preparationRef,
    approvalActor: {
      kind: 'clerk_owner',
      requestPrincipalId: principalId,
      ownerId: identity.subject,
      credentialId: principalId,
      authenticationEvidenceRef: `clerk:test:${requestId}`,
      approvedAt: Date.now(),
    },
    now: Date.now(),
  })
  if ((authorized.kind !== 'stored' && authorized.kind !== 'replayed') || authorized.preparation.kind !== 'ready_for_routing') {
    throw new Error('preparation authorization missing')
  }
  const fetchCountBefore = providerFetch.mock.calls.length
  providerFetch.mockImplementation(async (input, init) => {
    const endpoint = new URL(String(input))
    const body = JSON.parse(String(init?.body)) as {
      protocol: string
      operationRef: string
      contractRef: typeof model.contractRef
      facts: unknown[]
    }
    const registered = registeredProviderFor(endpoint)
    expect(endpoint.protocol).toBe('https:')
    expect(body).toMatchObject({
      protocol: 'ae.preparation-egress:v1',
      contractRef: model.contractRef,
    })
    expect(body.facts.length).toBeGreaterThan(0)
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
      output: { optionSummary: `Validated result from ${registered.bindingId}` },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  const egress = await backend.action(internal.customerRequestV2PreparationEgress.run, {
    commandKey: `egress:${requestId}`,
    commandDigest: canonicalDigest({ requestId, preparationRef: review.preparationRef }),
    principalId,
    preparationRef: review.preparationRef,
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

async function observeAllPublishedSupplyReady(backend: Backend) {
  const publications = await backend.run(async (ctx) => (
    await ctx.db.query('capabilityPublications').collect()
  ))
  for (const publication of publications) {
    const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
      publicationRef: publication.publicationRef, expectedRevision: publication.revision,
      credentialState: 'ready', healthState: 'healthy', validUntil: Date.now() + 300_000,
      operationKey: `test:substitution:readiness:${publication.publicationRef}`,
      correlationId: 'test:substitution:published-supply',
      reasonCode: 'registration_only_substitution_proof', evidenceRefs: ['test:published-supply-ready'],
    })
    if (observed.kind !== 'observed') throw new Error(`published supply readiness failed: ${observed.reason}`)
  }
  const supply = await backend.query(internal.capabilitySupply.listIntegrated, { networkId: 'ae:public', limit: 16 })
  if (supply.kind !== 'available') throw new Error(`published supply unavailable: ${supply.reason}`)
  if (supply.supplies.some((item) => item.publication === undefined)) {
    throw new Error(`published supply not active: ${JSON.stringify(supply.supplies.map((item) => item.binding.bindingId))}`)
  }
}

function registeredProviderFor(endpoint: URL) {
  const profile = endpoint.searchParams.get('profile')
  if (profile === 'one') return {
    offeringId: 'offering:sandbox-option-one:reference-lookup:v4',
    bindingId: 'binding:sandbox-option-one:http-json:v5',
    credential: 'sandbox-provider-test-key',
  }
  if (profile === 'two') return {
    offeringId: 'offering:sandbox-option-two:reference-lookup:v4',
    bindingId: 'binding:sandbox-option-two:http-json:v5',
    credential: 'sandbox-provider-test-key',
  }
  if (endpoint.hostname === 'sandbox-three.example.test') return {
    offeringId: 'offering:sandbox-option-three:reference-lookup',
    bindingId: 'binding:sandbox-option-three:http-json',
    credential: 'sandbox-provider-three-test-key',
  }
  throw new Error(`unregistered provider endpoint: ${endpoint.href}`)
}
