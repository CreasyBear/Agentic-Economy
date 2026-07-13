import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'
import {
  handleAgentCustomerRequestGet,
  handleAgentCustomerRequestMessagePost,
  handleAgentCustomerRequestPost,
} from '@/lib/server/customer-request-agent-api'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]))
const identity = { subject: 'customer-1', issuer: 'https://identity.test' }
const principalId = `${identity.issuer}|${identity.subject}`

describe('production CustomerRequest read model', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  it('resumes a cold Request through ready, preparing and unranked-options states using only its opaque reference', async () => {
    const backend = convexTest(schema, modules)
    await seedReadyRequest(backend)
    const customer = backend.withIdentity(identity)

    await expect(customer.action(api.customerRequestApplication.resume, { requestRef: 'request:cold:1' })).resolves.toMatchObject({
      kind: 'request', requestRef: 'request:cold:1', revision: 1,
      state: 'ready_to_compare', nextAction: 'prepare_options', options: [],
    })

    await backend.mutation(internal.customerRequests.claimPreparation, {
      preparationKey: 'internal:prepare:1', preparationScope: 'internal:scope:1', commandDigest: 'digest:command',
      requestId: 'request:cold:1', requestRevision: 1, planRevisionId: 'plan:cold:1', actionId: 'action:cold:1',
      claimedAt: 2_000, leaseExpiresAt: 32_000, claimToken: 'claim:1', routingRequestId: 'route:1',
    })
    await expect(customer.action(api.customerRequestApplication.resume, { requestRef: 'request:cold:1' })).resolves.toMatchObject({
      state: 'preparing_options', nextAction: 'wait', options: [],
    })

    await backend.mutation(internal.customerRequests.completeOptions, {
      preparationScope: 'internal:scope:1', claimToken: 'claim:1', completedAt: 3_000,
      candidateSet: {
        inspectionRef: 'internal:set:1', attempts: [], candidates: [{
          optionRef: 'option:public:1', business: { name: 'Registered Test Business' },
          expectedCost: { currency: 'AUD', amountMinor: 900 }, maximumCost: { currency: 'AUD', amountMinor: 1_000 },
          expectedLatencyMs: 100, priceComponents: [{ label: 'Service', amountMinor: 900 }],
          comparableOutputs: [{ label: 'Result', value: 'Available' }], materialTerms: ['Test terms'],
          cancellation: { kind: 'unsupported', summary: 'No commitment exists.' },
          expiresAt: Date.now() + 60_000, inspectionRef: 'internal:evidence:1',
        }],
      },
    })
    const ready = await customer.action(api.customerRequestApplication.resume, { requestRef: 'request:cold:1' })
    expect(ready).toMatchObject({
      state: 'options_ready', nextAction: 'inspect_options',
      options: [{ optionRef: 'option:public:1', business: { name: 'Registered Test Business' } }],
      optionSet: {
        cardinality: 'single', optionCount: 1,
        ordering: { kind: 'not_applicable', commercialInfluence: 'unknown' },
        coverage: { evaluated: 1, optionsReceived: 1 },
        options: [{
          optionRef: 'option:public:1',
          provenance: { kind: 'provider_assertion', validUntil: expect.any(Number) },
        }],
      },
    })
    expect(JSON.stringify(ready)).not.toMatch(/internal:set|internal:evidence|bindingId|capabilityContractId|planRevisionId|digest|attempts/)
  })

  it('authorizes fact updates before interpreter availability and does not enumerate foreign Requests', async () => {
    const backend = convexTest(schema, modules)
    await seedReadyRequest(backend)
    const stranger = backend.withIdentity({ subject: 'stranger', issuer: identity.issuer })
    await expect(stranger.action(api.customerRequestApplication.provideFacts, {
      requestRef: 'request:cold:1', expectedRevision: 1, idempotencyKey: 'facts:1', facts: { destination: 'Perth' },
    })).resolves.toEqual({ kind: 'refused', reason: 'request_not_found' })
    await expect(stranger.action(api.customerRequestApplication.resume, { requestRef: 'request:missing' }))
      .resolves.toEqual({ kind: 'refused', reason: 'request_not_found' })
  })

  it('accepts only a command-bound service assertion and persists the API-key principal separately from its owner', async () => {
    const backend = convexTest(schema, modules)
    const serviceKey = 'convex-agent-gateway-key-with-at-least-32-bytes'
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', serviceKey)
    await seedReadyRequest(backend, 'clerk_api_key:ak_agent_1')
    const principal = {
      principalId: 'clerk_api_key:ak_agent_1', ownerId: 'user_owner_1', credentialId: 'ak_agent_1',
      scopes: ['customer_requests:create'],
    }
    const serviceAuth = await createCustomerRequestServiceAssertion({
      key: serviceKey, operation: 'resume', command: { requestRef: 'request:cold:1' }, principal, issuedAt: Date.now(),
    })
    await expect(backend.action(api.customerRequestApplication.resume, {
      requestRef: 'request:cold:1', serviceAuth: { ...serviceAuth, scopes: [...serviceAuth.scopes] },
    })).resolves.toMatchObject({ state: 'ready_to_compare', requestRef: 'request:cold:1' })
    const recorded = await backend.run(async (ctx) => await ctx.db.query('customerRequestAgentPrincipals').collect())
    expect(recorded).toMatchObject([{
      principalId: 'clerk_api_key:ak_agent_1', ownerId: 'user_owner_1', credentialId: 'ak_agent_1',
      scopes: ['customer_requests:create'],
    }])

    const siblingKey = await createCustomerRequestServiceAssertion({
      key: serviceKey, operation: 'resume', command: { requestRef: 'request:cold:1' },
      principal: { ...principal, principalId: 'clerk_api_key:ak_agent_2', credentialId: 'ak_agent_2' }, issuedAt: Date.now(),
    })
    await expect(backend.action(api.customerRequestApplication.resume, {
      requestRef: 'request:cold:1', serviceAuth: { ...siblingKey, scopes: [...siblingKey.scopes] },
    })).resolves.toEqual({ kind: 'refused', reason: 'request_not_found' })

    await expect(backend.action(api.customerRequestApplication.resume, {
      requestRef: 'request:cold:1', serviceAuth: { ...serviceAuth, scopes: [...serviceAuth.scopes], credentialId: 'ak_tampered' },
    })).resolves.toEqual({ kind: 'refused', reason: 'authentication_required' })
  })

  it('carries a cold API-key agent through the production HTTP adapter into the real Convex application', async () => {
    const backend = convexTest(schema, modules)
    const serviceKey = 'convex-agent-gateway-key-with-at-least-32-bytes'
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', serviceKey)
    await seedReadyRequest(backend, 'clerk_api_key:ak_cold_1')
    const response = await handleAgentCustomerRequestGet('request:cold:1', {
      authenticate: async () => ({
        isAuthenticated: true, tokenType: 'api_key', id: 'ak_cold_1', subject: 'user_owner_1',
        userId: 'user_owner_1', orgId: null, scopes: ['customer_requests:create'],
      }),
      env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey }, now: Date.now,
      callAction: async (name, args) => {
        expect(name).toBe('customerRequestApplication:resume')
        return await backend.action(api.customerRequestApplication.resume, args as never)
      },
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'request', requestRef: 'request:cold:1', state: 'ready_to_compare', nextAction: 'prepare_options',
    })
  })

  it('submits, replays, and resumes from a cold API-key client through the registered kernel evaluation', async () => {
    const backend = convexTest(schema, modules)
    const serviceKey = 'convex-agent-gateway-key-with-at-least-32-bytes'
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', serviceKey)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        candidateCapabilityContractIds: ['sandbox.option.quote:v1'], facts: [],
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    const authenticate = async () => ({
      isAuthenticated: true as const, tokenType: 'api_key' as const, id: 'ak_cold_submit', subject: 'user_owner_1',
      userId: 'user_owner_1', orgId: null, scopes: ['customer_requests:create'],
    })
    const callAction = async (name: string, args: Record<string, unknown>) => {
      if (name === 'customerRequestApplication:submit') return await backend.action(api.customerRequestApplication.submit, args as never)
      if (name === 'customerRequestApplication:resume') return await backend.action(api.customerRequestApplication.resume, args as never)
      throw new Error(`unexpected_action_${name}`)
    }
    const body = {
      idempotencyKey: 'submit:cold:1', requestRef: 'request:cold:agent:1', agentRef: 'ignored-by-admission',
      request: 'Compare the connected sandbox options.',
    }
    const first = await handleAgentCustomerRequestPost(agentRequest(body), {
      authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey }, now: Date.now,
    })
    const replay = await handleAgentCustomerRequestPost(agentRequest(body), {
      authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey }, now: Date.now,
    })
    expect(first.status).toBe(200)
    expect(replay.status).toBe(200)
    const firstBody = await first.json()
    expect(await replay.json()).toEqual(firstBody)
    expect(firstBody).toMatchObject({
      requestRef: 'request:cold:agent:1', state: 'ready_to_compare', nextAction: 'prepare_options',
    })
    const resumed = await handleAgentCustomerRequestGet('request:cold:agent:1', {
      authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey }, now: Date.now,
    })
    expect(resumed.status).toBe(200)
    await expect(resumed.json()).resolves.toEqual(firstBody)
    const durable = await backend.run(async (ctx) => ({
      head: await ctx.db.query('customerRequestHeads').withIndex('by_requestId', (query) => query
        .eq('requestId', 'request:cold:agent:1')).unique(),
      snapshots: await ctx.db.query('customerRequestSnapshots').collect(),
      evaluations: await ctx.db.query('customerRequestEvaluations').collect(),
      candidates: await ctx.db.query('customerRequestEvaluationCandidates').collect(),
      plans: await ctx.db.query('customerRequestPlanRevisions').collect(),
    }))
    expect(durable.head).toMatchObject({
      principalId: 'clerk_api_key:ak_cold_submit', delegatedAgentId: 'clerk_api_key:ak_cold_submit', currentRevision: 1,
    })
    expect(durable.snapshots).toHaveLength(1)
    expect(durable.evaluations).toHaveLength(1)
    expect(durable.candidates).toHaveLength(2)
    expect(durable.plans).toEqual([])
    const evaluation = durable.evaluations[0]
    if (evaluation === undefined) throw new Error('evaluation_missing')
    await backend.mutation(internal.customerRequests.putRequestEvaluationPreparation, {
      preparation: {
        preparationKey: 'evaluation-options:test:1', requestId: 'request:cold:agent:1', requestRevision: 1,
        evaluationId: evaluation.evaluationId, evaluationDigest: evaluation.evaluationDigest,
        status: 'options_prepared', updatedAt: Date.now(),
        candidateSet: {
          inspectionRef: 'internal:evaluation-options:1', attempts: [],
          candidates: [{
            optionRef: 'option:public:evaluation:1', business: { name: 'Sandbox Option One' },
            expectedCost: { currency: 'AUD', amountMinor: 1_200 }, maximumCost: { currency: 'AUD', amountMinor: 1_200 },
            expectedLatencyMs: 120, priceComponents: [{ label: 'Sandbox amount', amountMinor: 1_200 }],
            comparableOutputs: [{ label: 'Option', value: 'Sandbox Option One' }],
            materialTerms: ['Verification only'], cancellation: { kind: 'unsupported', summary: 'No effect exists.' },
            expiresAt: Date.now() + 60_000, inspectionRef: 'internal:evidence:evaluation:1',
          }],
        },
      },
    })
    const options = await handleAgentCustomerRequestGet('request:cold:agent:1', {
      authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey }, now: Date.now,
    })
    await expect(options.json()).resolves.toMatchObject({
      state: 'options_ready', nextAction: 'inspect_options',
      options: [{ optionRef: 'option:public:evaluation:1', business: { name: 'Sandbox Option One' } }],
      optionSet: {
        cardinality: 'single', optionCount: 1,
        ordering: { kind: 'not_applicable', commercialInfluence: 'unknown' },
      },
    })
  })

  it('keeps a sparse place anchor as one durable Request and asks for intent direction', async () => {
    const backend = convexTest(schema, modules)
    const serviceKey = 'convex-agent-gateway-key-with-at-least-32-bytes'
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', serviceKey)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        kind: 'needs_intent_direction',
        prompt: 'What are you looking for there?',
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    const response = await handleAgentCustomerRequestPost(agentRequest({
      idempotencyKey: 'submit:place:1', requestRef: 'request:place:1', agentRef: 'ignored-by-admission',
      request: 'Fremantle',
    }), {
      authenticate: async () => ({
        isAuthenticated: true as const, tokenType: 'api_key' as const, id: 'ak_place', subject: 'user_owner_1',
        userId: 'user_owner_1', orgId: null, scopes: ['customer_requests:create'],
      }),
      callAction: async (name, args) => {
        expect(name).toBe('customerRequestApplication:submit')
        return await backend.action(api.customerRequestApplication.submit, args as never)
      },
      env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey }, now: Date.now,
    })

    expect(response.status).toBe(200)
    const view = await response.json()
    expect(view).toMatchObject({
      kind: 'request', requestRef: 'request:place:1', revision: 1,
      state: 'needs_information', nextAction: 'provide_information',
      clarification: {
        kind: 'intent_direction',
        prompt: 'What are you looking for there?',
        answerKind: 'natural_language',
      },
    })
    expect(JSON.stringify(view)).not.toMatch(/capabilityContractId|bindingId|planRevision|candidateCapability/)
  })

  it('accepts a natural-language answer and advances the same durable Request', async () => {
    const backend = convexTest(schema, modules)
    const serviceKey = 'convex-agent-gateway-key-with-at-least-32-bytes'
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', serviceKey)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        kind: 'needs_intent_direction', prompt: 'What are you looking for there?',
      }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        kind: 'capability_candidates', candidateCapabilityContractIds: ['sandbox.option.quote:v1'],
        facts: [{ capabilityContractId: 'sandbox.option.quote:v1', field: 'requestContext', value: 'Somewhere relaxed for lunch.' }],
      }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    const authenticate = async () => ({
      isAuthenticated: true as const, tokenType: 'api_key' as const, id: 'ak_place_refine', subject: 'user_owner_1',
      userId: 'user_owner_1', orgId: null, scopes: ['customer_requests:create'],
    })
    const callAction = async (name: string, args: Record<string, unknown>) => {
      if (name === 'customerRequestApplication:submit') return await backend.action(api.customerRequestApplication.submit, args as never)
      if (name === 'customerRequestApplication:refine') return await backend.action(api.customerRequestApplication.refine, args as never)
      throw new Error(`unexpected_action_${name}`)
    }
    const options = { authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey }, now: Date.now }
    const submitted = await handleAgentCustomerRequestPost(agentRequest({
      idempotencyKey: 'submit:place:refine:1', requestRef: 'request:place:refine:1', agentRef: 'ignored-by-admission',
      request: 'Fremantle',
    }), options)
    expect(submitted.status).toBe(200)

    const messageBody = JSON.stringify({ idempotencyKey: 'message:place:1', expectedRevision: 1, message: 'Somewhere relaxed for lunch.' })
    const messageRequest = new Request('https://ae.test/api/v1/requests/request:place:refine:1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: messageBody,
    })
    const refined = await handleAgentCustomerRequestMessagePost(messageRequest, 'request:place:refine:1', options)
    expect(refined.status).toBe(200)
    const refinedView = await refined.json()
    expect(refinedView).toMatchObject({
      kind: 'request', requestRef: 'request:place:refine:1', revision: 2,
      state: 'ready_to_compare', nextAction: 'prepare_options',
      criteria: [{ label: 'Request details', value: 'Somewhere relaxed for lunch.', basis: 'extracted_from_request' }],
    })
    const replay = await handleAgentCustomerRequestMessagePost(
      new Request(messageRequest.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: messageBody }),
      'request:place:refine:1', options,
    )
    expect(replay.status).toBe(200)
    await expect(replay.json()).resolves.toEqual(refinedView)
    const durable = await backend.run(async (ctx) => ({
      head: await ctx.db.query('customerRequestHeads').withIndex('by_requestId', (query) => query
        .eq('requestId', 'request:place:refine:1')).unique(),
      snapshots: await ctx.db.query('customerRequestSnapshots').withIndex('by_requestId_and_revision', (query) => query
        .eq('requestId', 'request:place:refine:1')).collect(),
    }))
    expect(durable.head?.currentRevision).toBe(2)
    expect(durable.snapshots).toHaveLength(2)
    expect(durable.snapshots[0]?.intent).toBe('Fremantle')
    expect(durable.snapshots[1]?.intent).toContain('Somewhere relaxed for lunch.')
    expect(JSON.stringify(refinedView)).not.toMatch(/requestContext|criterionDigest|capabilityContractId/)
  })

  it('records one bounded customer permission before protected preparation can become ready', async () => {
    const backend = convexTest(schema, modules)
    const customer = backend.withIdentity(identity)
    const contract = {
      capabilityContractId: 'protected.compare:v1', name: 'Protected comparison', operation: 'quote' as const,
      preparation: { purpose: 'protected_comparison', customerLabel: 'Compare protected options' },
      input: { area: {
        valueType: 'string' as const, customerLabel: 'Area', required: true, decisionRelevance: 'option_selection' as const,
        disclosure: {
          classification: 'personal' as const, phase: 'preparation' as const,
          recipient: 'candidate_provider' as const, purposes: ['protected_comparison'],
        },
      } },
      output: { result: {
        valueType: 'string' as const, customerLabel: 'Result', required: true,
        decisionRelevance: 'option_selection' as const, evidenceRole: 'provider_offer' as const,
      } },
      consequence: { commitment: 'none' as const, spend: 'quoted' as const, reversibility: 'not_applicable' as const, approval: 'explicit' as const },
    }
    await backend.mutation(internal.customerRequestCapabilityContracts.registerInternal, { contract, registeredAt: 1_000 })
    const snapshotMaterial = {
      requestId: 'request:protected:1', revision: 1, principalId, delegatedAgentId: principalId,
      intent: 'Compare options in Fremantle', networkId: 'ae:public',
      facts: { area: { value: 'Fremantle', source: { kind: 'customer' as const, assertionRef: 'assertion:area' } } },
    }
    await backend.mutation(internal.customerRequests.commitRequestSnapshot, {
      commandKey: 'submit:protected:1', commandDigest: 'digest:submit:protected:1', expectedRevision: 0,
      snapshot: { ...snapshotMaterial, snapshotDigest: 'digest:snapshot:protected:1', recordedAt: 1_000 },
    })
    await backend.mutation(internal.customerRequests.putRequestEvaluation, {
      evaluation: {
        evaluationId: 'evaluation:protected:1', requestId: 'request:protected:1', requestRevision: 1,
        registrySnapshotDigest: 'registry:protected:1', factsDigest: 'facts:protected:1', facts: snapshotMaterial.facts,
        criteria: [{
          field: 'area', label: 'Area', value: 'Fremantle', basis: 'customer_provided' as const,
          criterionDigest: 'criterion:area:1',
        }],
        preparationDisclosure: {
          purposeLabel: 'Compare protected options', maximumRecipients: 1,
          categories: [{ field: 'area', label: 'Area', classification: 'personal' as const }],
        },
        posture: 'progress_available' as const, evaluationDigest: 'digest:evaluation:protected:1', evaluatedAt: 1_000,
      },
      candidates: [{
        candidateRef: 'candidate:protected:1', businessId: 'business:protected:1', bindingId: 'binding:protected:1',
        capabilityContractId: contract.capabilityContractId, viability: { kind: 'viable' as const },
      }],
    })

    await expect(customer.action(api.customerRequestApplication.resume, { requestRef: 'request:protected:1' }))
      .resolves.toMatchObject({ state: 'needs_authorization', nextAction: 'review_disclosure' })
    const command = { requestRef: 'request:protected:1', revision: 1, idempotencyKey: 'authorize:protected:1' }
    await expect(customer.action(api.customerRequestApplication.authorizePreparation, command))
      .resolves.toMatchObject({ state: 'ready_to_compare', nextAction: 'prepare_options' })
    await expect(customer.action(api.customerRequestApplication.authorizePreparation, command))
      .resolves.toMatchObject({ state: 'ready_to_compare', nextAction: 'prepare_options' })
    const authorities = await backend.run(async (ctx) => await ctx.db.query('customerRequestPreparationAuthorities').collect())
    expect(authorities).toHaveLength(1)
    expect(authorities[0]).toMatchObject({
      principalId, requestId: 'request:protected:1', requestRevision: 1, mode: 'single_use',
      permittedFields: ['area'], permittedRecipientBindingIds: ['binding:protected:1'], maximumRecipients: 1, maximumOperations: 1,
    })
  })
})

async function seedReadyRequest(backend: ReturnType<typeof convexTest>, requestPrincipalId = principalId) {
  const request = {
    requestId: 'request:cold:1', principalId: requestPrincipalId, delegatedAgentId: 'agent:external:1', intent: 'Find an available option',
    revision: 1, compilationState: 'plan_ready' as const,
    understanding: {
      outcome: 'Find an available option', hardConstraints: [], preferences: [],
      substitutions: { allowed: false, boundaries: [] }, completionCriterion: 'An option is available',
      completionRequirement: { evidenceRole: 'provider_offer' as const, valueType: 'string' as const },
    },
    knownFacts: {}, routing: { networkId: 'ae:public', currency: 'AUD', maximumSpendMinor: 2_000, optimizeFor: 'cost' as const },
    createdAt: 1_000,
  }
  const planRevision = {
    planRevisionId: 'plan:cold:1', requestId: request.requestId, requestRevision: 1, proposedByAgentId: request.delegatedAgentId,
    proposalProvenance: { kind: 'direct_structured' as const, proposalDigest: 'digest:proposal' }, createdAt: 1_000,
    completionEvidence: [{ actionId: 'action:cold:1', field: 'result', role: 'provider_offer' as const }],
    actions: [{ actionId: 'action:cold:1', capabilityContractId: 'capability:test:v1', dependsOn: [], input: {} }],
  }
  await backend.mutation(internal.customerRequests.commitCompilation, {
    compilationKey: 'internal:compile:1', commandDigest: 'digest:compile', expectedRevision: 0,
    request, planRevision, outcome: { kind: 'plan_ready' },
  })
}

function agentRequest(body: unknown): Request {
  return new Request('https://ae.test/api/v1/requests', {
    method: 'POST', headers: { Authorization: 'Bearer ak_test', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
