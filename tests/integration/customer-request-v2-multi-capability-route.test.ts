import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { defineCapabilityContract, openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { compileCustomerRequest, writableCustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import { writableCustomerRequestRoutePlanGeneration } from '@/modules/customer-request/route-plan-generation'
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
  dataUse: [{ effectId: 'service_reference_release', inputPointer: '/serviceReference', classification: 'public' as const, phase: 'preparation' as const, recipient: { kind: 'named_recipient' as const, recipientId: 'carrier-network' }, purposes: ['prepare_service_quote'] }],
  effects: [{ effectId: 'service_reference_release', class: 'data_release' as const, authority: 'explicit' as const, reversibility: 'irreversible' as const }],
  evidence: [{ evidenceId: 'quote_reference', outputPointer: '/quoteReference', purpose: 'completion' as const }],
  lifecycle: { idempotency: 'required' as const, recovery: 'reconcile_required' as const },
}

const validationDocument = {
  contractFormat: 'ae.capability-contract:v2' as const,
  capabilityId: 'route.reference.validate', version: 1,
  name: 'Validate a service reference',
  description: 'Validate a governed service reference before it is quoted.',
  inputSchema: objectSchema({ serviceReference: { type: 'string', minLength: 1 } }, ['serviceReference']),
  outputSchema: objectSchema({ validatedReference: { type: 'string', minLength: 1 } }, ['validatedReference']),
  customerAnnotations: [
    { annotationId: 'service_reference_input', semanticIdentity: 'ae.service-reference:v1', document: 'input' as const, pointer: '/serviceReference', label: 'Service reference', role: 'constraint' as const, inference: 'customer_required' as const },
    { annotationId: 'validated_reference_output', semanticIdentity: 'ae.validated-service-reference:v1', document: 'output' as const, pointer: '/validatedReference', label: 'Validated reference', role: 'completion_evidence' as const },
  ],
  dataUse: [{ effectId: 'validate_reference_release', inputPointer: '/serviceReference', classification: 'public' as const, phase: 'preparation' as const, recipient: { kind: 'candidate_binding' as const }, purposes: ['validate_service_reference'] }],
  effects: [{ effectId: 'validate_reference_release', class: 'data_release' as const, authority: 'mandate_or_explicit' as const, reversibility: 'irreversible' as const }],
  evidence: [{ evidenceId: 'validated_reference', outputPointer: '/validatedReference', purpose: 'completion' as const }],
  lifecycle: { idempotency: 'required' as const, recovery: 'retry_safe' as const },
}

const validatedQuoteDocument = {
  contractFormat: 'ae.capability-contract:v2' as const,
  capabilityId: 'route.validated.quote', version: 1,
  name: 'Quote a validated service',
  description: 'Prepare a quote from one validated service reference.',
  inputSchema: objectSchema({ validatedReference: { type: 'string', minLength: 1 } }, ['validatedReference']),
  outputSchema: objectSchema({ quoteReference: { type: 'string', minLength: 1 } }, ['quoteReference']),
  customerAnnotations: [
    { annotationId: 'validated_reference_input', semanticIdentity: 'ae.validated-service-reference:v1', document: 'input' as const, pointer: '/validatedReference', label: 'Validated reference', role: 'constraint' as const, inference: 'customer_required' as const },
    { annotationId: 'quote_reference', document: 'output' as const, pointer: '/quoteReference', label: 'Quote reference', role: 'completion_evidence' as const },
  ],
  dataUse: [{ effectId: 'validated_reference_release', inputPointer: '/validatedReference', classification: 'public' as const, phase: 'preparation' as const, recipient: { kind: 'named_recipient' as const, recipientId: 'validated-quote-network' }, purposes: ['prepare_validated_quote'] }],
  effects: [{ effectId: 'validated_reference_release', class: 'data_release' as const, authority: 'explicit' as const, reversibility: 'irreversible' as const }],
  evidence: [{ evidenceId: 'quote_reference', outputPointer: '/quoteReference', purpose: 'completion' as const }],
  lifecycle: { idempotency: 'required' as const, recovery: 'reconcile_required' as const },
}

type RouteCapabilityDocument =
  | typeof upstreamDocument
  | typeof downstreamDocument
  | typeof validationDocument
  | typeof validatedQuoteDocument
  | (Omit<typeof upstreamDocument, 'version'> & Readonly<{ version: number }>)

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
      requestId: 'request:multi-capability:1', expectedRevision: 0, expectedRouteGeneration: 0,
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
    expect(result).toHaveProperty('routeGeneration')
    expect(result.aggregate.plan).not.toHaveProperty('routes')
    if (result.routeGeneration === undefined) throw new Error('route generation missing')
    const aggregate = writableCustomerRequestV2Aggregate(result.aggregate)
    expect(aggregateIsInternallyConsistent(aggregate, 0)).toBe(true)
    const command = {
      commandKey: 'command:multi-capability:1', commandDigest: canonicalDigest({ request: 'multi-capability:1' }),
      expectedRevision: 0, expectedRouteGeneration: 0, aggregate,
      routeGeneration: writableCustomerRequestRoutePlanGeneration(result.routeGeneration),
    }
    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, command))
      .resolves.toEqual({ kind: 'stored', requestId: 'request:multi-capability:1', revision: 1 })
    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, command))
      .resolves.toEqual({ kind: 'replayed', requestId: 'request:multi-capability:1', revision: 1 })

    const readback = await backend.query(internal.customerRequestV2.getCurrentAggregate, { requestId: 'request:multi-capability:1' })
    if (readback.kind !== 'current') throw new Error(`aggregate readback failed: ${readback.kind}`)
    expect(readback.routeGenerationRef).toBe(result.routeGeneration.generationRef)
    const historical = await backend.query(internal.customerRequestV2.getRoutePlanGeneration, {
      requestId: 'request:multi-capability:1', generationRef: result.routeGeneration.generationRef,
    })
    if (historical.kind !== 'found') throw new Error('durable route generation missing')
    expect(historical.routeGeneration).toEqual(writableCustomerRequestRoutePlanGeneration(result.routeGeneration))
    expect(historical.routeGeneration.decisionSnapshot).toEqual({
      requestSnapshotDigest: aggregate.snapshot.snapshotDigest,
      factsDigest: aggregate.evaluation.factsDigest,
      criteria: aggregate.evaluation.criteria,
      completionRequirements: aggregate.evaluation.completionRequirements,
      evaluationDigest: aggregate.evaluation.evaluationDigest,
      planRevisionId: aggregate.plan.planRevisionId,
      planDigest: aggregate.plan.planDigest,
    })
    const route = historical.routeGeneration.routes[0]
    expect(route).toMatchObject({
      requestRevision: 1, authority: 'proposal_only',
      maximumTotalCost: { kind: 'known', currency: 'AUD', amountMinor: 1_000 },
      comparison: { fit: 'all_steps_viable', completeness: 'complete', dataExposureCount: 2, irreversibleEffectCount: 2, evidenceRequirementCount: 2, trust: 'registered_live_supply' },
      uncertainty: [], fallbacks: { ordering: 'unranked', alternatives: [] },
    })
    expect(route?.steps).toHaveLength(2)
    expect(route?.steps.map((step) => ({
      capabilityId: step.contractRef.capabilityId, version: step.contractRef.version,
      publicationRef: step.publicationRef, publicationRevision: step.publicationRevision,
      resolvedInputCount: step.resolvedInputs.length, deferredInputCount: step.deferredInputs.length,
      dataUse: step.dataUse, effects: step.effects, evidence: step.evidence, recovery: step.recovery,
    }))).toEqual([
      expect.objectContaining({ capabilityId: upstreamDocument.capabilityId, version: 2, publicationRef: first.publicationRef, publicationRevision: first.revision, resolvedInputCount: 1, deferredInputCount: 0, recovery: { idempotency: 'required', recovery: 'retry_safe' } }),
      expect.objectContaining({ capabilityId: downstreamDocument.capabilityId, version: 1, publicationRef: second.publicationRef, publicationRevision: second.revision, resolvedInputCount: 0, deferredInputCount: 1, recovery: { idempotency: 'required', recovery: 'reconcile_required' } }),
    ])
    expect(route?.edges).toEqual([expect.objectContaining({
      semanticIdentity: 'ae.service-reference:v1', authority: 'registered_contract_semantics',
      source: expect.objectContaining({ annotationId: 'service_reference_output', evidenceId: 'service_reference', outputPointer: '/serviceReference' }),
      target: expect.objectContaining({ annotationId: 'service_reference_input', inputPointer: '/serviceReference' }),
    })])
    expect(route?.steps.flatMap((step) => step.dataUse.map((item) => ({ recipient: item.recipient.kind, purposes: item.purposes })))).toEqual([
      { recipient: 'candidate_binding', purposes: ['resolve_service_reference'] },
      { recipient: 'named_recipient', purposes: ['prepare_service_quote'] },
    ])
    expect(JSON.stringify(route)).not.toContain('grant')
    expect(JSON.stringify(route)).not.toContain('execute')

    const stale = compileCustomerRequest({
      requestId: 'request:multi-capability:1', expectedRevision: 1, expectedRouteGeneration: 0,
      principalId: 'principal:customer:1', delegatedAgentId: 'agent:customer:1',
      intent: 'Find the referenced service and prepare its quote', networkId: 'ae:public',
      priorFacts: result.aggregate.snapshot.facts,
      proposal: { kind: 'capability_candidates', selections: [
        { selectionKey: upstreamModel.selectionKey, contractRef: upstreamModel.contractRef, facts: [] },
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
      models: [upstreamModel, downstreamModel], now: Date.now() + 1,
    })
    if (stale.kind !== 'compiled' || stale.routeGeneration === undefined) throw new Error('stale generation setup failed')
    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:multi-capability:stale-generation',
      commandDigest: canonicalDigest({ request: 'multi-capability:stale-generation' }),
      expectedRevision: 1,
      expectedRouteGeneration: 0,
      aggregate: writableCustomerRequestV2Aggregate(stale.aggregate),
      routeGeneration: writableCustomerRequestRoutePlanGeneration(stale.routeGeneration),
    })).resolves.toEqual({ kind: 'route_generation_conflict' })
    await expect(backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: 'request:multi-capability:1',
    })).resolves.toMatchObject({
      kind: 'current', aggregate: { snapshot: { revision: 1 } },
      routeGenerationRef: result.routeGeneration.generationRef,
    })
    await expect(backend.query(internal.customerRequestV2.getRoutePlanGeneration, {
      requestId: 'request:multi-capability:1', generationRef: stale.routeGeneration.generationRef,
    })).resolves.toEqual({ kind: 'not_found' })

    const needsInformation = compileCustomerRequest({
      requestId: 'request:multi-capability:1', expectedRevision: 1, expectedRouteGeneration: 1,
      principalId: 'principal:customer:1', delegatedAgentId: 'agent:customer:1',
      intent: 'Help me decide what service I need', networkId: 'ae:public',
      priorFacts: result.aggregate.snapshot.facts,
      proposal: {
        kind: 'needs_intent_direction',
        prompt: 'What result should the businesses help you produce?',
      },
      interpreterId: 'interpreter:production-route-test',
      bindings: supply.supplies.flatMap(({ offering, binding, publication }) => publication === undefined ? [] : [{
        businessId: String(offering.businessId), offeringId: offering.offeringId, bindingId: binding.bindingId,
        contractRef: { capabilityId: binding.capabilityId, version: binding.version, contractDigest: binding.contractDigest },
        offeringRegistrationHash: offering.registrationHash, bindingRegistrationHash: binding.registrationHash,
        publicationRef: publication.publicationRef, publicationRevision: publication.revision,
        readinessValidUntil: publication.readinessValidUntil, price: offering.presentation.price,
      }]),
      models: [upstreamModel, downstreamModel], now: Date.now() + 2,
    })
    if (needsInformation.kind !== 'compiled') throw new Error('needs-information generation setup failed')
    expect(needsInformation).not.toHaveProperty('routeGeneration')
    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:multi-capability:needs-information',
      commandDigest: canonicalDigest({ request: 'multi-capability:needs-information' }),
      expectedRevision: 1,
      expectedRouteGeneration: 1,
      aggregate: writableCustomerRequestV2Aggregate(needsInformation.aggregate),
    })).resolves.toEqual({ kind: 'stored', requestId: 'request:multi-capability:1', revision: 2 })
    const withoutCurrentRoute = await backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: 'request:multi-capability:1',
    })
    expect(withoutCurrentRoute).toMatchObject({
      kind: 'current', aggregate: { snapshot: { revision: 2 } }, routeGenerationNumber: 1,
    })
    expect(withoutCurrentRoute).not.toHaveProperty('routeGenerationRef')
    await expect(backend.query(internal.customerRequestV2.getRoutePlanGeneration, {
      requestId: 'request:multi-capability:1', generationRef: result.routeGeneration.generationRef,
    })).resolves.toMatchObject({
      kind: 'found', routeGeneration: { generation: 1, requestRevision: 1 },
    })
  })

  it('refreshes an expired one-step generation before any preparation record can be created', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const published = await publishAndActivate(backend, admin, 'single-resolver', upstreamDocument, 300)
    await backend.action(internal.capabilitySupplyReadiness.probe, {
      publicationRef: published.publicationRef, expectedRevision: published.revision,
    })
    await observeReady(backend, published, 'single-resolver-public')
    const model = openCapabilityDecisionModel(defineCapabilityContract(upstreamDocument))
    const requestInput = model.inputs.find((input) => input.inputPointer === '/request')
    if (requestInput === undefined) throw new Error('single route request input missing')
    const generate = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [{
          selectionKey: model.selectionKey,
          facts: [{ inputKey: requestInput.key, value: 'Resolve this service reference' }],
        }],
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', generate)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity({ subject: 'customer-single-route', issuer: 'https://identity.example' })
    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:single-route', requestId: 'request:single-route',
      delegatedAgentId: 'agent:single-route', customerJob: 'Resolve this service reference',
      routing: { networkId: 'ae:public' },
    })
    if (submitted.kind !== 'request' || submitted.routeGenerationRef === undefined) {
      throw new Error(`single route submission failed: ${JSON.stringify(submitted)}`)
    }
    const first = await backend.query(internal.customerRequestV2.getRoutePlanGeneration, {
      requestId: submitted.requestRef, generationRef: submitted.routeGenerationRef,
    })
    if (first.kind !== 'found' || first.routeGeneration.routes[0] === undefined) {
      throw new Error('single route generation missing')
    }
    const clock = vi.spyOn(Date, 'now').mockReturnValue(first.routeGeneration.routes[0].expiresAt + 1)
    await expect(customer.action(api.customerRequestApplication.resume, {
      requestRef: submitted.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'needs_attention', nextAction: 'retry',
      decision: {
        generationRef: submitted.routeGenerationRef,
        outcome: { kind: 'routes_expired' }, routes: [{ availability: 'expired' }],
      },
    })
    await observeReady(backend, published, 'single-resolver-renewed')
    const compared = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef, revision: submitted.revision,
      idempotencyKey: 'compare:single-route-renewed',
    })
    expect(compared).toMatchObject({
      kind: 'request', revision: 1, state: 'routes_ready', nextAction: 'inspect_routes',
      routeGenerationRef: expect.any(String),
    })
    if (compared.kind !== 'request') throw new Error('single route refresh failed')
    expect(compared.routeGenerationRef).not.toBe(submitted.routeGenerationRef)
    const persisted = await backend.run(async (ctx) => ({
      generations: await ctx.db.query('customerRequestV2RoutePlanGenerations').collect(),
      preparations: await ctx.db.query('customerRequestV2ActionPreparations').collect(),
    }))
    expect(persisted.generations.map(({ generation, requestRevision }) => ({ generation, requestRevision })))
      .toEqual([{ generation: 1, requestRevision: 1 }, { generation: 2, requestRevision: 1 }])
    expect(persisted.preparations).toEqual([])
    await expect(customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef, revision: submitted.revision,
      idempotencyKey: 'compare:single-route-renewed-again',
    })).resolves.toMatchObject({
      kind: 'request', revision: 1, state: 'routes_ready', nextAction: 'inspect_routes',
      routeGenerationRef: compared.routeGenerationRef,
    })
    const afterSecondCompare = await backend.run(async (ctx) => (
      await ctx.db.query('customerRequestV2ActionPreparations').collect()
    ))
    expect(afterSecondCompare).toEqual([])
    await expect(customer.action(api.customerRequestApplication.resume, {
      requestRef: submitted.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', revision: 1, state: 'routes_ready', nextAction: 'inspect_routes',
      routeGenerationRef: compared.routeGenerationRef,
    })
    clock.mockRestore()
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
      state: 'ready_to_compare', nextAction: 'prepare_options', routeGenerationRef: expect.any(String),
    })
    if (submitted.kind !== 'request') throw new Error(`public submit failed: ${submitted.kind}`)
    expect(generate).toHaveBeenCalledTimes(1)

    const persisted = await backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: 'request:multi-capability:public',
    })
    if (persisted.kind !== 'current') throw new Error(`public submit aggregate missing: ${persisted.kind}`)
    if (persisted.routeGenerationRef === undefined) throw new Error('public submit generation reference missing')
    const routeReadback = await backend.query(internal.customerRequestV2.getRoutePlanGeneration, {
      requestId: 'request:multi-capability:public', generationRef: persisted.routeGenerationRef,
    })
    if (routeReadback.kind !== 'found') throw new Error('public submit route generation missing')
    const route = routeReadback.routeGeneration.routes[0]
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
      routeGenerationRef: persisted.routeGenerationRef,
      decision: {
        generationRef: persisted.routeGenerationRef,
        requestRevision: 1,
        outcome: { kind: 'routes_available', routeCount: 1 },
        routes: [{
          result: {
            summary: downstreamDocument.description,
            deliverables: ['Quote reference'],
          },
          businesses: [{ name: 'Route resolver' }, { name: 'Route quoter' }],
          stepCount: 2,
          maximumTotalCost: { kind: 'known', currency: 'AUD', amountMinor: 1_000 },
          dataUse: { recipients: expect.arrayContaining([
            expect.objectContaining({ name: 'Route resolver', purposes: ['resolve_service_reference'] }),
            expect.objectContaining({ name: 'Carrier network', purposes: ['prepare_service_quote'] }),
          ]) },
          effects: [{ kind: 'information_shared', reversibility: 'irreversible' }],
          evidence: [
            { label: 'Service reference', purpose: 'completion' },
            { label: 'Quote reference', purpose: 'completion' },
          ],
          fallback: { available: false, alternatives: [] },
          recovery: [
            { step: 1, businessName: 'Route resolver', posture: 'retry_safe' },
            { step: 2, businessName: 'Route quoter', posture: 'reconcile_required' },
          ],
        }],
        changes: { kind: 'initial' },
        nextBoundary: { kind: 'confirmation', authorityCreated: false },
      },
    })
    if (compared.kind !== 'request') throw new Error('route decision missing')
    expect(JSON.stringify(compared.decision)).not.toMatch(/capabilityId|bindingId|offeringId|publicationRef|transport|graph/u)

    const firstGenerationRef = persisted.routeGenerationRef
    const expiredClock = vi.spyOn(Date, 'now').mockReturnValue(route.expiresAt + 1)
    await observeReady(backend, first, 'public-resolver-refreshed')
    await observeReady(backend, second, 'public-quoter-refreshed')
    const refreshedComparison = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef,
      revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:expired',
    })
    expect(refreshedComparison).toMatchObject({
      kind: 'request', requestRef: submitted.requestRef, revision: submitted.revision,
      state: 'routes_ready', nextAction: 'inspect_routes', routeGenerationRef: expect.any(String),
    })
    if (refreshedComparison.kind !== 'request' || refreshedComparison.routeGenerationRef === undefined) {
      throw new Error('refreshed generation reference missing')
    }
    expect(refreshedComparison.routeGenerationRef).not.toBe(firstGenerationRef)
    const refreshedGenerationRef = refreshedComparison.routeGenerationRef
    await expect(customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef,
      revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:expired',
    })).resolves.toMatchObject({
      kind: 'request', revision: submitted.revision, routeGenerationRef: refreshedGenerationRef,
    })
    const generationsAfterReplay = await backend.run(async (ctx) => (
      await ctx.db.query('customerRequestV2RoutePlanGenerations').collect()
    ))
    expect(generationsAfterReplay.map(({ generation, requestRevision }) => ({ generation, requestRevision })))
      .toEqual([{ generation: 1, requestRevision: 1 }, { generation: 2, requestRevision: 1 }])
    const refreshSideEffects = await backend.run(async (ctx) => ({
      preparations: await ctx.db.query('customerRequestV2ActionPreparations').collect(),
      approvals: await ctx.db.query('customerRequestV2ApprovalGrants').collect(),
      attempts: await ctx.db.query('customerRequestV2ActionAttempts').collect(),
      providerReleases: await ctx.db.query('customerRequestV2ActionAttemptReleases').collect(),
    }))
    expect(refreshSideEffects).toEqual({ preparations: [], approvals: [], attempts: [], providerReleases: [] })
    expiredClock.mockRestore()

    const priceOnly = await refreshAndActivate(
      backend, admin, first, upstreamDocument, 325, 'resolver-price-refresh',
    )
    const priceClock = vi.spyOn(Date, 'now').mockReturnValue(route.expiresAt + 2)
    await observeReady(backend, second, 'price-quoter')
    const priceRefresh = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef,
      revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:price-only',
    })
    expect(priceRefresh).toMatchObject({
      kind: 'request', revision: 1, state: 'routes_ready', nextAction: 'inspect_routes',
      routeGenerationRef: expect.any(String),
    })
    if (priceRefresh.kind !== 'request' || priceRefresh.routeGenerationRef === undefined) {
      throw new Error('price-only generation missing')
    }
    expect(priceRefresh.decision?.changes).toMatchObject({
      kind: 'changed', previousGenerationRef: refreshedGenerationRef,
      items: expect.arrayContaining([expect.objectContaining({ kind: 'maximum_cost' })]),
    })
    if (priceRefresh.decision?.changes.kind !== 'changed') throw new Error('price-only delta missing')
    expect(priceRefresh.decision.changes.items.map(({ kind }) => kind)).not.toContain('businesses')
    const priceGeneration = await backend.query(internal.customerRequestV2.getRoutePlanGeneration, {
      requestId: submitted.requestRef, generationRef: priceRefresh.routeGenerationRef,
    })
    expect(priceGeneration).toMatchObject({
      kind: 'found',
      routeGeneration: {
        generation: 3,
        routes: [{ maximumTotalCost: { kind: 'known', currency: 'AUD', amountMinor: 1_025 } }],
      },
    })
    if (priceGeneration.kind !== 'found' || priceGeneration.routeGeneration.routes[0] === undefined) {
      throw new Error('price-only route missing')
    }
    priceClock.mockRestore()

    const unsafeClock = vi.spyOn(Date, 'now').mockReturnValue(
      priceGeneration.routeGeneration.routes[0].expiresAt + 1,
    )
    await observeReady(backend, priceOnly, 'unsafe-resolver')
    await observeReady(backend, second, 'unsafe-quoter')
    generate.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ kind: 'capability_candidates', selections: [
        { selectionKey: upstreamModel.selectionKey, facts: [
          { inputKey: requestInput.key, value: 'A conflicting request interpretation' },
        ] },
      ] }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const unsafeRefresh = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef, revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:unsafe-refresh',
    })
    expect(unsafeRefresh).toMatchObject({ kind: 'request', state: 'needs_attention', nextAction: 'retry' })
    await expect(customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef, revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:unsafe-refresh',
    })).resolves.toEqual(unsafeRefresh)
    unsafeClock.mockRestore()

    const upstreamV3Document = { ...upstreamDocument, version: 3 }
    const upstreamV3 = await refreshAndActivate(
      backend, admin, priceOnly, upstreamV3Document, 350, 'resolver-v3',
    )
    const upstreamV3Model = openCapabilityDecisionModel(defineCapabilityContract(upstreamV3Document))
    const upstreamV3RequestInput = upstreamV3Model.inputs.find((input) => input.inputPointer === '/request')
    if (upstreamV3RequestInput === undefined) throw new Error('v3 upstream request input missing')
    generate.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [
          { selectionKey: upstreamV3Model.selectionKey, facts: [{ inputKey: upstreamV3RequestInput.key, value: 'Resolve this service and prepare its quote' }] },
          { selectionKey: downstreamModel.selectionKey, facts: [] },
        ],
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const contractRefresh = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef,
      revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:contract-refresh',
    })
    expect(contractRefresh).toMatchObject({
      kind: 'request', revision: 1, state: 'routes_ready', nextAction: 'inspect_routes',
      routeGenerationRef: expect.any(String),
    })
    if (contractRefresh.kind !== 'request' || contractRefresh.routeGenerationRef === undefined) {
      throw new Error('contract refresh generation missing')
    }
    expect(contractRefresh.routeGenerationRef).not.toBe(refreshedGenerationRef)
    const contractGeneration = await backend.query(internal.customerRequestV2.getRoutePlanGeneration, {
      requestId: submitted.requestRef, generationRef: contractRefresh.routeGenerationRef,
    })
    if (contractGeneration.kind !== 'found') throw new Error('contract refresh generation readback missing')
    expect(contractGeneration.routeGeneration).toMatchObject({ generation: 4, requestRevision: 1 })
    expect(contractGeneration.routeGeneration.routes[0]).toMatchObject({
      maximumTotalCost: { kind: 'known', currency: 'AUD', amountMinor: 1_050 },
      steps: [
        { contractRef: { capabilityId: upstreamDocument.capabilityId, version: 3 } },
        { contractRef: { capabilityId: downstreamDocument.capabilityId, version: 1 } },
      ],
    })

    const contractRoute = contractGeneration.routeGeneration.routes[0]
    if (contractRoute === undefined) throw new Error('contract refresh route missing')
    const routeShapeClock = vi.spyOn(Date, 'now').mockReturnValue(contractRoute.expiresAt + 1)
    await observeReady(backend, upstreamV3, 'shape-resolver')
    await observeReady(backend, second, 'shape-quoter')
    const validator = await publishAndActivate(backend, admin, 'validator', validationDocument, 100)
    const validatedQuoter = await publishAndActivate(backend, admin, 'validated-quoter', validatedQuoteDocument, 500)
    const validationModel = openCapabilityDecisionModel(defineCapabilityContract(validationDocument))
    const validatedQuoteModel = openCapabilityDecisionModel(defineCapabilityContract(validatedQuoteDocument))
    generate.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [
          { selectionKey: upstreamV3Model.selectionKey, facts: [{ inputKey: upstreamV3RequestInput.key, value: 'Resolve this service and prepare its quote' }] },
          { selectionKey: validationModel.selectionKey, facts: [] },
          { selectionKey: validatedQuoteModel.selectionKey, facts: [] },
        ],
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const routeShapeRefresh = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef,
      revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:route-shape-refresh',
    })
    expect(routeShapeRefresh).toMatchObject({
      kind: 'request', revision: 1, state: 'routes_ready', nextAction: 'inspect_routes',
      routeGenerationRef: expect.any(String),
    })
    if (routeShapeRefresh.kind !== 'request' || routeShapeRefresh.routeGenerationRef === undefined) {
      throw new Error('route-shape generation missing')
    }
    const shapeGeneration = await backend.query(internal.customerRequestV2.getRoutePlanGeneration, {
      requestId: submitted.requestRef, generationRef: routeShapeRefresh.routeGenerationRef,
    })
    if (shapeGeneration.kind !== 'found') throw new Error('route-shape generation readback missing')
    expect(shapeGeneration.routeGeneration).toMatchObject({ generation: 5, requestRevision: 1 })
    if (shapeGeneration.routeGeneration.decisionSnapshot === undefined) {
      throw new Error('route-shape decision snapshot missing')
    }
    expect(routeShapeRefresh.criteria).toEqual(
      shapeGeneration.routeGeneration.decisionSnapshot.criteria
        .map(({ label, value, basis }) => ({ label, value, basis })),
    )
    expect(shapeGeneration.routeGeneration.routes[0]).toMatchObject({
      maximumTotalCost: { kind: 'known', currency: 'AUD', amountMinor: 950 },
      steps: [
        { contractRef: { capabilityId: upstreamDocument.capabilityId } },
        { contractRef: { capabilityId: validationDocument.capabilityId }, publicationRef: validator.publicationRef },
        { contractRef: { capabilityId: validatedQuoteDocument.capabilityId }, publicationRef: validatedQuoter.publicationRef },
      ],
      edges: [{}, {}],
    })
    routeShapeClock.mockRestore()

    const shapeRoute = shapeGeneration.routeGeneration.routes[0]
    if (shapeRoute === undefined) throw new Error('shape route missing')
    const typedOutcomeClock = vi.spyOn(Date, 'now').mockReturnValue(shapeRoute.expiresAt + 1)
    await observeReady(backend, upstreamV3, 'typed-resolver')
    await observeReady(backend, validator, 'typed-validator')
    await observeReady(backend, validatedQuoter, 'typed-validated-quoter')
    generate.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        kind: 'needs_intent_direction', prompt: 'What result should the businesses produce?',
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const needsInformationRefresh = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef, revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:needs-information-refresh',
    })
    expect(needsInformationRefresh).toMatchObject({
      kind: 'request', revision: 1, state: 'needs_information', nextAction: 'provide_information',
      clarification: { kind: 'intent_direction' },
    })
    await expect(customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef, revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:needs-information-refresh',
    })).resolves.toMatchObject({
      kind: 'request', revision: 1, state: 'needs_information', nextAction: 'provide_information',
    })
    const restartedCustomer = backend.withIdentity({
      subject: 'customer-route-submit', issuer: 'https://identity.example',
    })
    await expect(restartedCustomer.action(api.customerRequestApplication.resume, {
      requestRef: submitted.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', revision: 1, state: 'needs_information', nextAction: 'provide_information',
    })
    expect(generate).toHaveBeenCalledTimes(7)
    generate.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ kind: 'capability_candidates', selections: [] }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const unsupportedRefresh = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef, revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:unsupported-refresh',
    })
    expect(unsupportedRefresh).toMatchObject({
      kind: 'request', revision: 1, state: 'unsupported', nextAction: 'revise_request',
    })
    await expect(restartedCustomer.action(api.customerRequestApplication.resume, {
      requestRef: submitted.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', revision: 1, state: 'unsupported', nextAction: 'revise_request',
    })

    typedOutcomeClock.mockRestore()

    await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
      publicationRef: upstreamV3.publicationRef, expectedRevision: upstreamV3.revision,
      credentialState: 'unavailable', healthState: 'unhealthy', validUntil: Date.now() + 300_000,
      ...operationContext('readiness-degraded'),
    })
    const degradedComparison = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef,
      revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:degraded',
    })
    expect(degradedComparison).toMatchObject({
      kind: 'request', state: 'needs_attention', nextAction: 'retry',
    })
    await expect(customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef,
      revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:degraded',
    })).resolves.toEqual(degradedComparison)
    expect(generate).toHaveBeenCalledTimes(8)
    const refreshCommands = await backend.run(async (ctx) => (
      await ctx.db.query('customerRequestV2RoutePlanGenerationCommands').collect()
    ))
    expect(refreshCommands).toContainEqual(expect.objectContaining({
      resultKind: 'retryable', retryReason: 'current_supply_unavailable',
    }))
    const currentAfterRefreshes = await backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: submitted.requestRef,
    })
    expect(currentAfterRefreshes).toMatchObject({
      kind: 'current', aggregate: { snapshot: { revision: 1 } },
      routeGenerationNumber: 5, routeGenerationRef: routeShapeRefresh.routeGenerationRef,
    })
    const completeHistory = await backend.run(async (ctx) => (
      await ctx.db.query('customerRequestV2RoutePlanGenerations').collect()
    ))
    expect(completeHistory.map(({ generation, requestRevision }) => ({ generation, requestRevision })))
      .toEqual([
        { generation: 1, requestRevision: 1 },
        { generation: 2, requestRevision: 1 },
        { generation: 3, requestRevision: 1 },
        { generation: 4, requestRevision: 1 },
        { generation: 5, requestRevision: 1 },
      ])
  })
})

function objectSchema(properties: Record<string, object>, required: string[]) {
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties, required, additionalProperties: false }
}

async function publishAndActivate(
  backend: ReturnType<typeof convexTest>, admin: Awaited<ReturnType<typeof ownerAdmin>>,
  suffix: string, document: RouteCapabilityDocument, amountMinor: number,
) {
  const { businessId, owner } = await publishedBusinessOwner(backend, suffix)
  const offering = {
    offeringId: `offering:route:${suffix}`, networkId: 'ae:public',
    presentation: {
      label: document.name, summary: document.description,
      price: { kind: 'fixed' as const, currency: 'AUD', amountMinor }, materialTerms: [],
      commercialRelationship: { kind: 'none' as const, summary: 'No commercial influence.', influencesEligibility: false, influencesInclusion: false, influencesOrder: false, evidenceRefs: ['test:commercial-neutrality'] },
    },
    searchTerms: ['service', 'quote'], registrationEvidenceRefs: [`test:publication:${suffix}`],
  }
  const binding = {
    bindingId: `binding:route:${suffix}`, endpointUrl: `https://${suffix}.example.test/capability`, credentialRef: `env:ROUTE_${suffix.toUpperCase().replaceAll('-', '_')}_KEY`,
    continuation: { kind: 'single_response' as const, evidenceRefs: ['test:single-response'] }, cancellation: { kind: 'unsupported' as const, evidenceRefs: ['test:no-cancellation'] },
    adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } }, registrationEvidenceRefs: [`test:binding:${suffix}`],
  }
  const published = await owner.mutation(api.capabilitySupply.publishCapability, {
    businessId, source: { kind: 'ae_envelope', documentJson: JSON.stringify(document) },
    offering, binding,
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
  return { publicationRef: published.publicationRef, revision: 1, businessId, owner, offering, binding }
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

async function refreshAndActivate(
  backend: ReturnType<typeof convexTest>,
  admin: Awaited<ReturnType<typeof ownerAdmin>>,
  current: Awaited<ReturnType<typeof publishAndActivate>>,
  document: RouteCapabilityDocument,
  amountMinor: number,
  suffix: string,
) {
  const offering = {
    ...current.offering,
    offeringId: `offering:route:${suffix}`,
    presentation: {
      ...current.offering.presentation,
      label: document.name,
      summary: document.description,
      price: { kind: 'fixed' as const, currency: 'AUD', amountMinor },
    },
    registrationEvidenceRefs: [`test:publication:${suffix}`],
  }
  const binding = {
    ...current.binding,
    bindingId: `binding:route:${suffix}`,
    endpointUrl: `https://${suffix}.example.test/capability`,
    registrationEvidenceRefs: [`test:binding:${suffix}`],
  }
  const refreshed = await current.owner.mutation(api.capabilitySupply.refreshCapability, {
    publicationRef: current.publicationRef,
    expectedRevision: current.revision,
    source: { kind: 'ae_envelope', documentJson: JSON.stringify(document) },
    offering,
    binding,
    ...operationContext(`refresh:${suffix}`),
  })
  if (refreshed.kind !== 'refreshed' || refreshed.disposition !== 'current') {
    throw new Error(`capability refresh failed: ${refreshed.kind}`)
  }
  const contractRef = defineCapabilityContract(document).ref
  const hashes = await backend.run(async (ctx) => {
    const storedOffering = (await ctx.db.query('capabilityOfferings').take(64))
      .find((row) => row.offeringId === offering.offeringId)
    const storedBinding = (await ctx.db.query('capabilityTransportBindings').take(64))
      .find((row) => row.bindingId === binding.bindingId)
    if (storedOffering === undefined || storedBinding === undefined) throw new Error('refreshed supply missing')
    return { offering: storedOffering.registrationHash, binding: storedBinding.registrationHash }
  })
  const eligible = await admin.mutation(api.capabilitySupply.setEligibility, {
    offeringId: offering.offeringId, bindingId: binding.bindingId, contractRef, decision: 'admit',
    expectedOfferingRegistrationHash: hashes.offering, expectedBindingRegistrationHash: hashes.binding,
    admissionEvidenceRefs: ['test:admission-reviewed'], conformanceEvidenceRefs: ['test:adapter-reviewed'],
    ...operationContext(`admit:${suffix}`),
  })
  if (eligible.kind !== 'eligible') throw new Error(`refreshed eligibility failed: ${eligible.kind}`)
  await observeReady(backend, { publicationRef: refreshed.publicationRef, revision: refreshed.revision }, suffix)
  return {
    ...current,
    publicationRef: refreshed.publicationRef,
    revision: refreshed.revision,
    offering,
    binding,
  }
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
