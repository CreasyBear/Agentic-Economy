import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { defineCapabilityContract, openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { compileCustomerRequest, writableCustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import { aggregateIsInternallyConsistent } from '../../convex/customerRequestV2'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [
  path.replace('../../convex/', './'), load,
]))

const upstreamDocument = {
  contractFormat: 'ae.capability-contract:v2' as const,
  capabilityId: 'route.reference.resolve', version: 2,
  name: 'Resolve a service reference',
  description: 'Resolve a customer request into one governed service reference.',
  inputSchema: objectSchema({ request: { type: 'string', minLength: 1 } }, ['request']),
  outputSchema: objectSchema({ serviceReference: { type: 'string', minLength: 1 } }, ['serviceReference']),
  customerAnnotations: [
    { annotationId: 'request', document: 'input' as const, pointer: '/request', label: 'Request', role: 'request' as const, inference: 'allowed' as const },
    { annotationId: 'service_reference_output', semanticIdentity: 'ae.service-reference:v1', document: 'output' as const, pointer: '/serviceReference', label: 'Service reference', role: 'completion_evidence' as const },
  ],
  dataUse: [{ effectId: 'resolve_request_release', inputPointer: '/request', classification: 'public' as const, phase: 'preparation' as const, recipient: { kind: 'candidate_binding' as const }, purposes: ['resolve_service_reference'] }],
  effects: [{ effectId: 'resolve_request_release', class: 'data_release' as const, authority: 'mandate_or_explicit' as const, reversibility: 'irreversible' as const }],
  evidence: [{ evidenceId: 'service_reference', outputPointer: '/serviceReference', purpose: 'completion' as const }],
  lifecycle: { idempotency: 'required' as const, recovery: 'retry_safe' as const },
}

const downstreamDocument = {
  contractFormat: 'ae.capability-contract:v2' as const,
  capabilityId: 'route.service.quote', version: 1,
  name: 'Quote a resolved service',
  description: 'Prepare a quote for one governed service reference.',
  inputSchema: objectSchema({ serviceReference: { type: 'string', minLength: 1 } }, ['serviceReference']),
  outputSchema: objectSchema({ quoteReference: { type: 'string', minLength: 1 } }, ['quoteReference']),
  customerAnnotations: [
    { annotationId: 'service_reference_input', semanticIdentity: 'ae.service-reference:v1', document: 'input' as const, pointer: '/serviceReference', label: 'Service reference', role: 'constraint' as const, inference: 'customer_required' as const },
    { annotationId: 'quote_reference', document: 'output' as const, pointer: '/quoteReference', label: 'Quote reference', role: 'completion_evidence' as const },
  ],
  dataUse: [{ effectId: 'service_reference_release', inputPointer: '/serviceReference', classification: 'public' as const, phase: 'preparation' as const, recipient: { kind: 'selected_binding' as const }, purposes: ['prepare_service_quote'] }],
  effects: [{ effectId: 'service_reference_release', class: 'data_release' as const, authority: 'explicit' as const, reversibility: 'irreversible' as const }],
  evidence: [{ evidenceId: 'quote_reference', outputPointer: '/quoteReference', purpose: 'completion' as const }],
  lifecycle: { idempotency: 'required' as const, recovery: 'reconcile_required' as const },
}

describe('Customer Request V2 multi-capability RoutePlan production path', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('registers live supply, compiles one governed two-step DAG, commits atomically, and reads it back', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const first = await publishAndActivate(backend, admin, 'resolver', upstreamDocument, 300)
    const second = await publishAndActivate(backend, admin, 'quoter', downstreamDocument, 700)
    const supply = await backend.query(internal.capabilitySupply.listEligible, { networkId: 'ae:public', limit: 16 })
    if (supply.kind !== 'available') throw new Error(`supply unavailable: ${supply.reason}`)
    const upstreamModel = openCapabilityDecisionModel(defineCapabilityContract(upstreamDocument))
    const downstreamModel = openCapabilityDecisionModel(defineCapabilityContract(downstreamDocument))
    const requestInput = upstreamModel.inputs.find((input) => input.inputPointer === '/request')
    if (requestInput === undefined) throw new Error('upstream request input missing')
    const fact = {
      contractRef: upstreamModel.contractRef, selectionKey: upstreamModel.selectionKey,
      inputKey: requestInput.key, inputPointer: requestInput.inputPointer, schemaIdentity: requestInput.schemaIdentity,
      value: 'Find the referenced service and prepare its quote',
      source: { kind: 'customer' as const, assertionRef: 'customer:request-message' },
    }
    const result = compileCustomerRequest({
      requestId: 'request:multi-capability:1', expectedRevision: 0,
      principalId: 'principal:customer:1', delegatedAgentId: 'agent:customer:1',
      intent: 'Find the referenced service and prepare its quote', networkId: 'ae:public',
      proposal: { kind: 'capability_candidates', selections: [
        { selectionKey: upstreamModel.selectionKey, contractRef: upstreamModel.contractRef, facts: [fact] },
        { selectionKey: downstreamModel.selectionKey, contractRef: downstreamModel.contractRef, facts: [] },
      ] },
      interpreterId: 'interpreter:production-route-test',
      bindings: supply.supplies.flatMap(({ offering, binding, publication }) => publication === undefined ? [] : [{
        businessId: String(offering.businessId), offeringId: offering.offeringId, bindingId: binding.bindingId,
        contractRef: { capabilityId: binding.capabilityId, version: binding.version, contractDigest: binding.contractDigest },
        offeringRegistrationHash: offering.registrationHash, bindingRegistrationHash: binding.registrationHash,
        publicationRef: publication.publicationRef, publicationRevision: publication.revision,
        readinessValidUntil: publication.readinessValidUntil, price: offering.presentation.price,
      }]),
      models: [upstreamModel, downstreamModel], now: Date.now(),
    })
    if (result.kind !== 'compiled') throw new Error(`compile refused: ${result.reason}`)
    const aggregate = writableCustomerRequestV2Aggregate(result.aggregate)
    expect(aggregateIsInternallyConsistent(aggregate, 0)).toBe(true)
    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:multi-capability:1', commandDigest: canonicalDigest({ request: 'multi-capability:1' }),
      expectedRevision: 0, aggregate,
    })).resolves.toEqual({ kind: 'stored', requestId: 'request:multi-capability:1', revision: 1 })

    const readback = await backend.query(internal.customerRequestV2.getCurrentAggregate, { requestId: 'request:multi-capability:1' })
    if (readback.kind !== 'current') throw new Error(`aggregate readback failed: ${readback.kind}`)
    const route = readback.aggregate.plan.routes[0]
    expect(route).toMatchObject({
      requestRevision: 1, authority: 'proposal_only',
      maximumTotalCost: { kind: 'known', currency: 'AUD', amountMinor: 1_000 },
      comparison: { fit: 'all_steps_viable', completeness: 'complete', dataExposureCount: 2, irreversibleEffectCount: 2, evidenceRequirementCount: 2, trust: 'registered_live_supply' },
      uncertainty: [], fallbacks: [],
    })
    expect(route?.steps).toHaveLength(2)
    expect(route?.steps.map((step) => ({
      capabilityId: step.contractRef.capabilityId, version: step.contractRef.version,
      publicationRef: step.publicationRef, publicationRevision: step.publicationRevision,
      dataUse: step.dataUse, effects: step.effects, evidence: step.evidence, recovery: step.recovery,
    }))).toEqual([
      expect.objectContaining({ capabilityId: upstreamDocument.capabilityId, version: 2, publicationRef: first.publicationRef, publicationRevision: first.revision, recovery: { idempotency: 'required', recovery: 'retry_safe' } }),
      expect.objectContaining({ capabilityId: downstreamDocument.capabilityId, version: 1, publicationRef: second.publicationRef, publicationRevision: second.revision, recovery: { idempotency: 'required', recovery: 'reconcile_required' } }),
    ])
    expect(route?.edges).toEqual([expect.objectContaining({
      semanticIdentity: 'ae.service-reference:v1', authority: 'registered_contract_semantics',
      source: expect.objectContaining({ annotationId: 'service_reference_output', evidenceId: 'service_reference', outputPointer: '/serviceReference' }),
      target: expect.objectContaining({ annotationId: 'service_reference_input', inputPointer: '/serviceReference' }),
    })])
    expect(route?.steps.flatMap((step) => step.dataUse.map((item) => ({ recipient: item.recipient.kind, purposes: item.purposes })))).toEqual([
      { recipient: 'candidate_binding', purposes: ['resolve_service_reference'] },
      { recipient: 'selected_binding', purposes: ['prepare_service_quote'] },
    ])
    expect(JSON.stringify(route)).not.toContain('grant')
    expect(JSON.stringify(route)).not.toContain('execute')
  })

  it('compiles and persists the governed DAG through the authenticated public submit action', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const first = await publishAndActivate(backend, admin, 'resolver', upstreamDocument, 300)
    const second = await publishAndActivate(backend, admin, 'quoter', downstreamDocument, 700)
    for (const publication of [first, second]) {
      await backend.action(internal.capabilitySupplyReadiness.probe, {
        publicationRef: publication.publicationRef, expectedRevision: publication.revision,
      })
    }
    await observeReady(backend, first, 'public-resolver')
    await observeReady(backend, second, 'public-quoter')
    const upstreamModel = openCapabilityDecisionModel(defineCapabilityContract(upstreamDocument))
    const downstreamModel = openCapabilityDecisionModel(defineCapabilityContract(downstreamDocument))
    const requestInput = upstreamModel.inputs.find((input) => input.inputPointer === '/request')
    if (requestInput === undefined) throw new Error('upstream request input missing')
    const generate = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [
          { selectionKey: upstreamModel.selectionKey, facts: [{ inputKey: requestInput.key, value: 'Resolve this service and prepare its quote' }] },
          { selectionKey: downstreamModel.selectionKey, facts: [] },
        ],
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', generate)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity({ subject: 'customer-route-submit', issuer: 'https://identity.example' })

    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:multi-capability:public', requestId: 'request:multi-capability:public',
      delegatedAgentId: 'agent:customer:public', customerJob: 'Resolve this service and prepare its quote',
      routing: { networkId: 'ae:public' },
    })
    expect(submitted).toMatchObject({
      kind: 'request', requestRef: 'request:multi-capability:public', revision: 1,
      state: 'ready_to_compare', nextAction: 'prepare_options',
    })
    if (submitted.kind !== 'request') throw new Error(`public submit failed: ${submitted.kind}`)
    expect(generate).toHaveBeenCalledTimes(1)

    const persisted = await backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: 'request:multi-capability:public',
    })
    if (persisted.kind !== 'current') throw new Error(`public submit aggregate missing: ${persisted.kind}`)
    const route = persisted.aggregate.plan.routes[0]
    if (route === undefined) throw new Error('public submit route missing')
    expect(persisted.aggregate.plan.interpretationEvidence).toMatchObject({
      kind: 'model_output',
      systemInstructionVersion: 'customer-request-semantic:v3',
    })
    expect(route).toMatchObject({ authority: 'proposal_only', requestRevision: 1 })
    expect(route.steps.map((step) => ({
      capabilityId: step.contractRef.capabilityId,
      publicationRef: step.publicationRef,
      publicationRevision: step.publicationRevision,
    }))).toEqual([
      { capabilityId: upstreamDocument.capabilityId, publicationRef: first.publicationRef, publicationRevision: first.revision },
      { capabilityId: downstreamDocument.capabilityId, publicationRef: second.publicationRef, publicationRevision: second.revision },
    ])
    expect(route.edges).toEqual([expect.objectContaining({
      semanticIdentity: 'ae.service-reference:v1', authority: 'registered_contract_semantics',
      fromStep: route.steps[0]?.actionId, toStep: route.steps[1]?.actionId,
    })])

    const compared = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef,
      revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:public',
    })
    expect(compared).toMatchObject({
      kind: 'request', requestRef: submitted.requestRef, revision: submitted.revision,
      state: 'routes_ready', nextAction: 'inspect_routes',
      routes: [{ authority: 'proposal_only', stepCount: 2 }],
    })

    const refined = await customer.action(api.customerRequestApplication.refine, {
      requestRef: submitted.requestRef,
      expectedRevision: submitted.revision,
      idempotencyKey: 'refine:multi-capability:public',
      message: 'Show me the current options again.',
    })
    expect(refined).toMatchObject({
      kind: 'request', requestRef: submitted.requestRef, revision: 2,
      state: 'ready_to_compare', nextAction: 'prepare_options',
    })
    expect(generate).toHaveBeenCalledTimes(2)

    const staleComparison = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef,
      revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:stale',
    })
    expect(staleComparison).toEqual({
      kind: 'conflict', requestRef: submitted.requestRef, reason: 'revision_changed',
    })

    const revised = await backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: submitted.requestRef,
    })
    if (revised.kind !== 'current') throw new Error(`revised aggregate missing: ${revised.kind}`)
    expect(revised.aggregate.snapshot.revision).toBe(2)
    expect(revised.aggregate.plan.routes[0]).toMatchObject({ requestRevision: 2 })
    expect(revised.aggregate.plan.routes[0]?.routePlanId).not.toBe(route.routePlanId)
  })
})

function objectSchema(properties: Record<string, object>, required: string[]) {
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties, required, additionalProperties: false }
}

async function publishAndActivate(
  backend: ReturnType<typeof convexTest>, admin: Awaited<ReturnType<typeof ownerAdmin>>,
  suffix: string, document: typeof upstreamDocument | typeof downstreamDocument, amountMinor: number,
) {
  const { businessId, owner } = await publishedBusinessOwner(backend, suffix)
  const published = await owner.mutation(api.capabilitySupply.publishCapability, {
    businessId, source: { kind: 'ae_envelope', documentJson: JSON.stringify(document) },
    offering: {
      offeringId: `offering:route:${suffix}`, networkId: 'ae:public',
      presentation: {
        label: document.name, summary: document.description,
        price: { kind: 'fixed', currency: 'AUD', amountMinor }, materialTerms: [],
        commercialRelationship: { kind: 'none', summary: 'No commercial influence.', influencesEligibility: false, influencesInclusion: false, influencesOrder: false, evidenceRefs: ['test:commercial-neutrality'] },
      },
      searchTerms: ['service', 'quote'], registrationEvidenceRefs: [`test:publication:${suffix}`],
    },
    binding: {
      bindingId: `binding:route:${suffix}`, endpointUrl: `https://${suffix}.example.test/capability`, credentialRef: `env:ROUTE_${suffix.toUpperCase()}_KEY`,
      continuation: { kind: 'single_response', evidenceRefs: ['test:single-response'] }, cancellation: { kind: 'unsupported', evidenceRefs: ['test:no-cancellation'] },
      adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } }, registrationEvidenceRefs: [`test:binding:${suffix}`],
    },
    ...operationContext(`publish:${suffix}`),
  })
  if (published.kind !== 'published') throw new Error(`publication refused: ${published.reason}`)
  const hashes = await backend.run(async (ctx) => {
    const offering = (await ctx.db.query('capabilityOfferings').take(10))
      .find((row) => row.offeringId === published.offeringId)
    const binding = (await ctx.db.query('capabilityTransportBindings').take(10))
      .find((row) => row.bindingId === published.bindingId)
    if (offering === undefined || binding === undefined) throw new Error('published supply missing')
    return { offering: offering.registrationHash, binding: binding.registrationHash }
  })
  const eligible = await admin.mutation(api.capabilitySupply.setEligibility, {
    offeringId: published.offeringId, bindingId: published.bindingId, contractRef: published.contractRef, decision: 'admit',
    expectedOfferingRegistrationHash: hashes.offering, expectedBindingRegistrationHash: hashes.binding,
    admissionEvidenceRefs: ['test:admission-reviewed'], conformanceEvidenceRefs: ['test:adapter-reviewed'],
    ...operationContext(`admit:${suffix}`),
  })
  if (eligible.kind !== 'eligible') throw new Error(`eligibility refused: ${eligible.kind}`)
  const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: published.publicationRef, expectedRevision: 1,
    credentialState: 'ready', healthState: 'healthy', validUntil: Date.now() + 300_000,
    ...operationContext(`observe:${suffix}`),
  })
  if (observed.kind !== 'observed') throw new Error(`readiness refused: ${observed.reason}`)
  return { publicationRef: published.publicationRef, revision: 1 }
}

async function observeReady(
  backend: ReturnType<typeof convexTest>, publication: Readonly<{ publicationRef: string; revision: number }>, suffix: string,
) {
  const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: publication.publicationRef, expectedRevision: publication.revision,
    credentialState: 'ready', healthState: 'healthy', validUntil: Date.now() + 300_000,
    ...operationContext(`observe:${suffix}`),
  })
  if (observed.kind !== 'observed') throw new Error(`readiness refused: ${observed.reason}`)
}

function operationContext(suffix: string) {
  return { operationKey: `op:route:${suffix}`, correlationId: `corr:route:${suffix}`, reasonCode: 'test_multi_capability_route', evidenceRefs: ['test:issue-143'] }
}

async function ownerAdmin(backend: ReturnType<typeof convexTest>) {
  const identity = { subject: 'user_route_admin', issuer: 'https://identity.example', tokenIdentifier: 'token_route_admin' }
  await backend.run(async (ctx) => { await ctx.db.insert('adminMemberships', { clerkUserId: identity.subject, tokenIdentifier: identity.tokenIdentifier, role: 'owner_admin', state: 'active', grantedBy: 'test_bootstrap', grantedAt: 1 }) })
  return backend.withIdentity(identity)
}

async function publishedBusinessOwner(backend: ReturnType<typeof convexTest>, slug: string) {
  const identity = { subject: `user_route_${slug}`, issuer: 'https://identity.example', tokenIdentifier: `token_route_${slug}` }
  const businessId = await backend.run(async (ctx) => {
    const ownerId = await ctx.db.insert('owners', { clerkUserId: identity.subject, createdAt: 1, updatedAt: 1 })
    return await ctx.db.insert('businesses', { ownerId, slug: `route-${slug}`, name: `Route ${slug}`, normalizedName: `route ${slug}`, category: 'professional services', suburb: 'Perth', stateTerritory: 'WA', publicStatus: 'published', trustTier: 'listed', claimStatus: 'published', sourceHash: `source:route:${slug}`, createdAt: 1, updatedAt: 1 })
  }) as Id<'businesses'>
  return { businessId, owner: backend.withIdentity(identity) }
}
