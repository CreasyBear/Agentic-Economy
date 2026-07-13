import { convexTest } from 'convex-test'
import { Response as UndiciResponse } from 'undici'
import { afterEach, describe, expect, it, vi } from 'vitest'

const providerFetch = vi.hoisted(() => vi.fn<typeof import('undici').fetch>())
vi.mock('undici', async (importOriginal) => ({
  ...await importOriginal<typeof import('undici')>(),
  fetch: providerFetch,
}))

import { claimBusinessCommand } from '../../convex/business'
import {
  registerCapabilityBindingCommand,
  registerCapabilityOfferingCommand,
  setCapabilitySupplyEligibilityCommand,
} from '../../convex/capabilitySupply'
import { publishBusinessCatalogCommand } from '../../convex/catalog'
import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { runtimeDb, runtimeWriter } from '../../convex/source_state'
import { defineCapabilityContract, openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import { SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT } from '@/modules/sandbox-supply/public'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]))
const createBackend = () => convexTest(schema, modules)
type Backend = ReturnType<typeof createBackend>
const identity = { subject: 'customer-substitution', issuer: 'https://identity.test' }
const principalId = `${identity.issuer}|${identity.subject}`

describe('V2 Request registration-only business substitution', () => {
  afterEach(() => {
    providerFetch.mockReset()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('adds and removes a conformant business without changing the Request or caller contract', async () => {
    vi.stubEnv('AE_SITE_URL', 'https://sandbox-ae.example.test')
    vi.stubEnv('AE_SANDBOX_PROVIDER_ONE_KEY', 'sandbox-provider-one-test-key')
    vi.stubEnv('AE_SANDBOX_PROVIDER_TWO_KEY', 'sandbox-provider-two-test-key')
    vi.stubEnv('AE_SANDBOX_PROVIDER_THREE_KEY', 'sandbox-provider-three-test-key')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const backend = createBackend()
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    const third = await registerThirdSandboxBusiness(backend)

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
  return await backend.run(async (ctx) => {
    const now = Date.now()
    const actor = {
      kind: 'authenticated_owner' as const,
      clerkUserId: 'test-registration-owner',
      displayName: 'Registration Test Owner',
    }
    const claim = await claimBusinessCommand(runtimeWriter(ctx.db), {
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
    const published = await publishBusinessCatalogCommand(runtimeDb(ctx.db), {
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

    const contract = await ctx.db.query('capabilityContractDocuments').unique()
    if (contract === null) throw new Error('sandbox contract missing')
    const contractRef = {
      capabilityId: contract.capabilityId,
      version: contract.version,
      contractDigest: contract.contractDigest,
    }
    const offeringId = 'offering:sandbox-option-three:reference-lookup'
    const bindingId = 'binding:sandbox-option-three:http-json'
    const commandContext = {
      correlationId: 'test:substitution:supply:three',
      reasonCode: 'registration_only_substitution_proof',
      evidenceRefs: ['test:third-business-published'],
    }
    const offering = await registerCapabilityOfferingCommand(ctx.db, {
      actor: { kind: 'system', ref: 'system:test-registration-owner' },
      context: { ...commandContext, operationKey: 'test:substitution:offering:three' },
      registration: {
        offeringId,
        businessId: published.business.businessId,
        networkId: 'ae:public',
        contractRef,
        presentation: {
          label: 'Sandbox Option Three',
          summary: 'Labelled sandbox supply for registration-only substitution proof.',
          price: { kind: 'fixed', currency: 'AUD', amountMinor: 500 },
          materialTerms: [{ termId: 'sandbox_only', label: 'Environment', value: 'Sandbox only; not real supply.' }],
          commercialRelationship: {
            kind: 'none',
            summary: 'Sandbox verification has no commercial relationship.',
            influencesEligibility: false,
            influencesInclusion: false,
            influencesOrder: false,
            evidenceRefs: ['test:sandbox-commercial-neutrality'],
          },
        },
        searchTerms: ['sandbox', 'option', 'reference lookup'],
        registrationEvidenceRefs: ['test:third-business-published'],
      },
    }, now + 2)
    if (offering.kind !== 'registered') throw new Error(`third offering failed: ${offering.reason}`)
    const binding = await registerCapabilityBindingCommand(ctx.db, {
      actor: { kind: 'system', ref: 'system:test-registration-owner' },
      context: { ...commandContext, operationKey: 'test:substitution:binding:three' },
      registration: {
        bindingId,
        offeringId,
        networkId: 'ae:public',
        contractRef,
        endpointUrl: 'https://sandbox-three.example.test/capability',
        credentialRef: 'env:AE_SANDBOX_PROVIDER_THREE_KEY',
        continuation: { kind: 'single_response', evidenceRefs: ['test:sandbox-single-response'] },
        cancellation: { kind: 'unsupported', evidenceRefs: ['test:sandbox-no-cancellation'] },
        adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
        registrationEvidenceRefs: ['test:third-binding-conformant'],
      },
    }, now + 3)
    if (binding.kind !== 'registered') throw new Error(`third binding failed: ${binding.reason}`)
    const eligibility = await setCapabilitySupplyEligibilityCommand(ctx.db, {
      actor: { kind: 'system', ref: 'system:test-registration-owner' },
      context: { ...commandContext, operationKey: 'test:substitution:eligibility:three' },
      eligibility: {
        offeringId,
        bindingId,
        contractRef,
        decision: 'admit',
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: ['test:third-business-published'],
        conformanceEvidenceRefs: ['test:third-binding-conformant'],
      },
    }, now + 4)
    if (eligibility.kind !== 'eligible') throw new Error(`third eligibility failed: ${eligibility.kind}`)
    return {
      offeringId,
      bindingId,
      contractRef,
      offeringRegistrationHash: offering.registrationHash,
      bindingRegistrationHash: binding.registrationHash,
    }
  })
}

async function prepareCustomerChoice(backend: Backend, requestId: string) {
  const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
  const input = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
  if (input === undefined) throw new Error('sandbox request input missing')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      kind: 'capability_candidates',
      selections: [{
        selectionKey: model.selectionKey,
        facts: [{ inputKey: input.key, value: 'Find the cheapest labelled sandbox option' }],
      }],
    }) } }],
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
  if (submitted.kind !== 'request') throw new Error(`request submit failed: ${submitted.kind}`)
  const review = await customer.action(api.customerRequestApplication.compare, {
    requestRef: submitted.requestRef,
    revision: submitted.revision,
    idempotencyKey: `compare:${requestId}`,
  })
  if (review.kind !== 'request' || review.preparationRef === undefined) throw new Error('preparation review missing')
  const aggregate = await backend.query(internal.customerRequestV2.getCurrentAggregate, { requestId })
  if (aggregate.kind !== 'current' || aggregate.aggregate.plan.actions[0] === undefined) throw new Error('request aggregate missing')
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

function registeredProviderFor(endpoint: URL) {
  const profile = endpoint.searchParams.get('profile')
  if (profile === 'one') return {
    offeringId: 'offering:sandbox-option-one:reference-lookup',
    bindingId: 'binding:sandbox-option-one:http-json',
    credential: 'sandbox-provider-one-test-key',
  }
  if (profile === 'two') return {
    offeringId: 'offering:sandbox-option-two:reference-lookup',
    bindingId: 'binding:sandbox-option-two:http-json',
    credential: 'sandbox-provider-two-test-key',
  }
  if (endpoint.hostname === 'sandbox-three.example.test') return {
    offeringId: 'offering:sandbox-option-three:reference-lookup',
    bindingId: 'binding:sandbox-option-three:http-json',
    credential: 'sandbox-provider-three-test-key',
  }
  throw new Error(`unregistered provider endpoint: ${endpoint.href}`)
}
