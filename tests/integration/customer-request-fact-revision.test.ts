import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]))
const identity = { subject: 'customer-facts', issuer: 'https://identity.test' }

describe('Customer Request fact revision', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  it('accepts only the kernel-selected fact and reevaluates without creating a Plan', async () => {
    stubSemanticInterpreter('parcel.rate:v1')
    const backend = convexTest(schema, modules)
    await seedParcelRateSupply(backend)
    const customer = backend.withIdentity(identity)
    const eligible = await backend.query(internal.routingKernelBindings.listEligible, { networkId: 'ae:public' })
    expect(eligible.filter((binding) => binding.capabilityContractId === 'parcel.rate:v1')).toHaveLength(2)
    const contracts = await backend.query(internal.customerRequestCapabilityContracts.listActiveInternal, {})
    expect(contracts.some((contract) => contract.capabilityContractId === 'parcel.rate:v1')).toBe(true)

    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:parcel:1', requestId: 'request:parcel:1', delegatedAgentId: 'agent:customer:1',
      customerJob: 'Compare parcel rates',
      knownFacts: { origin_postcode: '6000', destination_postcode: '2000' },
      routing: { networkId: 'ae:public' },
    })
    const evaluatedCandidates = await backend.run(async (ctx) => await ctx.db.query('customerRequestEvaluationCandidates').collect())
    expect(evaluatedCandidates).toHaveLength(2)
    expect(submitted).toMatchObject({
      state: 'needs_information', revision: 1,
      missingFields: [{ field: 'weight_grams', label: 'Parcel weight' }],
    })

    const revised = await customer.action(api.customerRequestApplication.provideFacts, {
      requestRef: 'request:parcel:1', expectedRevision: 1, idempotencyKey: 'facts:weight:1',
      facts: { weight_grams: 1_250 },
    })
    expect(revised).toMatchObject({ state: 'ready_to_compare', revision: 2, missingFields: [] })
    await expect(customer.action(api.customerRequestApplication.resume, { requestRef: 'request:parcel:1' }))
      .resolves.toEqual(revised)

    const durable = await backend.run(async (ctx) => ({
      snapshots: await ctx.db.query('customerRequestSnapshots').collect(),
      evaluations: await ctx.db.query('customerRequestEvaluations').collect(),
      plans: await ctx.db.query('customerRequestPlanRevisions').collect(),
    }))
    expect(durable.snapshots.map((snapshot) => snapshot.revision)).toEqual([1, 2])
    expect(durable.evaluations.map((evaluation) => evaluation.requestRevision)).toEqual([1, 2])
    expect(durable.plans).toEqual([])
  })

  it('turns natural language into registered candidates and durable evaluation facts without creating a Plan', async () => {
    stubSemanticInterpreter('parcel.rate:v1', {
      origin_postcode: '6000', destination_postcode: '2000', weight_grams: 1_250,
    })
    const backend = convexTest(schema, modules)
    await seedParcelRateSupply(backend)
    const customer = backend.withIdentity(identity)

    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:parcel:natural:1', requestId: 'request:parcel:natural:1', delegatedAgentId: 'agent:customer:1',
      customerJob: 'Compare delivery prices for a 1250 gram parcel from 6000 to 2000.',
      knownFacts: {}, routing: { networkId: 'ae:public' },
    })

    expect(submitted).toMatchObject({ state: 'ready_to_compare', revision: 1, missingFields: [] })
    const durable = await backend.run(async (ctx) => ({
      evaluations: await ctx.db.query('customerRequestEvaluations').collect(),
      candidates: await ctx.db.query('customerRequestEvaluationCandidates').collect(),
      plans: await ctx.db.query('customerRequestPlanRevisions').collect(),
    }))
    expect(durable.evaluations[0]?.facts).toMatchObject({
      origin_postcode: { value: '6000', source: { kind: 'agent_inference' } },
      destination_postcode: { value: '2000', source: { kind: 'agent_inference' } },
      weight_grams: { value: 1_250, source: { kind: 'agent_inference' } },
    })
    expect(durable.candidates).toHaveLength(2)
    expect(durable.plans).toEqual([])
  })

  it('keeps a committed request recoverable when semantic interpretation is temporarily unavailable', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('provider unavailable')))
    const backend = convexTest(schema, modules)
    await seedParcelRateSupply(backend)
    const customer = backend.withIdentity(identity)

    await expect(customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:parcel:recovery:1', requestId: 'request:parcel:recovery:1', delegatedAgentId: 'agent:customer:1',
      customerJob: 'Compare parcel rates',
      knownFacts: { origin_postcode: '6000', destination_postcode: '2000', weight_grams: 1_250 },
      routing: { networkId: 'ae:public' },
    })).resolves.toEqual({ kind: 'refused', reason: 'interpreter_unavailable' })
    await expect(backend.run(async (ctx) => await ctx.db.query('customerRequestSnapshots').collect()))
      .resolves.toHaveLength(1)

    stubSemanticInterpreter('parcel.rate:v1')
    await expect(customer.action(api.customerRequestApplication.resume, { requestRef: 'request:parcel:recovery:1' }))
      .resolves.toMatchObject({ state: 'ready_to_compare', revision: 1 })
  })
})

function stubSemanticInterpreter(
  capabilityContractId: string,
  facts: Readonly<Record<string, string | number | boolean>> = {},
) {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      candidateCapabilityContractIds: [capabilityContractId],
      facts: Object.entries(facts).map(([field, value]) => ({ capabilityContractId, field, value })),
    }) } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
}

async function seedParcelRateSupply(backend: ReturnType<typeof convexTest>) {
  await backend.mutation(internal.devSeed.seedDevCatalog, {})
  const contractRegistration = await backend.mutation(internal.customerRequestCapabilityContracts.registerInternal, {
    registeredAt: 1_000,
    contract: {
      capabilityContractId: 'parcel.rate:v1', name: 'Compare parcel rates', operation: 'quote',
      input: {
        origin_postcode: input('Origin postcode'),
        destination_postcode: input('Destination postcode'),
        weight_grams: { ...input('Parcel weight'), valueType: 'integer' as const },
      },
      output: {
        total_price: { ...input('Total price', false), valueType: 'money_minor', evidenceRole: 'provider_offer' },
      },
      consequence: { commitment: 'none', spend: 'quoted', reversibility: 'not_applicable', approval: 'explicit' },
    },
  })
  if (contractRegistration.kind !== 'registered') throw new Error(`contract_registration_${contractRegistration.reason}`)
  const businesses = await backend.run(async (ctx) => await ctx.db.query('businesses').collect())
  const targets = businesses.filter((business) => ['sandbox-option-one', 'sandbox-option-two'].includes(business.slug))
  for (const [index, business] of targets.entries()) {
    await backend.mutation(internal.routingKernelBindings.registerInternal, {
      registeredAt: 1_001 + index,
      registration: {
        bindingId: `parcel.rate.sandbox.${index + 1}:v1`, businessId: business._id,
        nodeId: `sandbox:parcel:${index + 1}`, networkId: 'ae:public', capabilityContractId: 'parcel.rate:v1',
        operation: 'quote', admission: 'admitted', conformance: 'conformant',
        admissionEvidenceRefs: ['test:labelled-sandbox'], conformanceEvidenceRefs: ['test:contract-conformance'],
        queryTerms: ['parcel rate'], adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'public_query' },
        adapterFeatureEvidenceRefs: ['test:public-query'], endpointUrl: `https://provider-${index + 1}.example.test/quote`,
        credentialRef: 'env:PARCEL_TEST_KEY',
      },
    })
  }
}

function input(customerLabel: string, required = true) {
  return { valueType: 'string' as const, customerLabel, required, decisionRelevance: 'option_selection' as const }
}
