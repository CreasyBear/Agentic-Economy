import { convexTest } from 'convex-test'
import { Response as UndiciResponse } from 'undici'
import { afterEach, describe, expect, it, vi } from 'vitest'

const routeProviderFetch = vi.hoisted(() => vi.fn<typeof import('undici').fetch>())
vi.mock('undici', async (importOriginal) => ({
  ...await importOriginal<typeof import('undici')>(),
  fetch: routeProviderFetch,
}))

import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { defineCapabilityContract, openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import { compileCustomerRequest, writableCustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import { writableCustomerRequestRoutePlanGeneration } from '@/modules/customer-request/route-plan-generation'
import { createCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'
import {
  SANDBOX_ROUTE_PROVIDER_PROFILES,
  SANDBOX_ROUTE_QUOTE_CAPABILITY_CONTRACT_DOCUMENT,
  SANDBOX_ROUTE_RESOLVE_CAPABILITY_CONTRACT_DOCUMENT,
} from '@/modules/sandbox-supply/public'
import {
  aggregateIsInternallyConsistent,
  currentRoutePlanGenerationGraphStatus,
} from '../../convex/customerRequestV2'

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
    routeProviderFetch.mockReset()
    vi.restoreAllMocks()
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
        commercialRelationship: offering.presentation.commercialRelationship,
        cancellation: binding.cancellation,
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
      comparison: {
        fit: 'all_steps_viable', completeness: 'complete', hardConstraints: 'not_evaluated',
        dataExposureCount: 2, irreversibleEffectCount: 2, evidenceRequirementCount: 2,
        duration: 'not_declared', recovery: 'reconcile_required',
        freshnessValidUntil: expect.any(Number), outcomeSignature: expect.stringMatching(/^sha256:/u),
        trust: 'registered_current_option',
      },
      uncertainty: [], fallbacks: { ordering: 'unranked', alternatives: [] },
    })
    expect(route?.steps).toHaveLength(2)
    expect(route?.steps.map((step) => ({
      capabilityId: step.contractRef.capabilityId, version: step.contractRef.version,
      publicationRef: step.publicationRef, publicationRevision: step.publicationRevision,
      resolvedInputCount: step.resolvedInputs.length, deferredInputCount: step.deferredInputs.length,
      dataUse: step.dataUse, effects: step.effects, evidence: step.evidence, recovery: step.recovery,
      commercialRelationship: step.commercialRelationship,
    }))).toEqual([
      expect.objectContaining({ capabilityId: upstreamDocument.capabilityId, version: 2, publicationRef: first.publicationRef, publicationRevision: first.revision, resolvedInputCount: 1, deferredInputCount: 0, recovery: { idempotency: 'required', recovery: 'retry_safe' }, commercialRelationship: expect.objectContaining({ kind: 'none', influencesOrder: false }) }),
      expect.objectContaining({ capabilityId: downstreamDocument.capabilityId, version: 1, publicationRef: second.publicationRef, publicationRevision: second.revision, resolvedInputCount: 0, deferredInputCount: 1, recovery: { idempotency: 'required', recovery: 'reconcile_required' }, commercialRelationship: expect.objectContaining({ kind: 'none', influencesOrder: false }) }),
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
        commercialRelationship: offering.presentation.commercialRelationship,
        cancellation: binding.cancellation,
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
        commercialRelationship: offering.presentation.commercialRelationship,
        cancellation: binding.cancellation,
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

  it('admits both steps against one cumulative mandate ceiling and refuses reuse after revocation', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const current = await committedTwoStepAdmissionRoute(backend, admin)
    const route = current.routeGeneration.routes[0]
    if (route === undefined || route.maximumTotalCost.kind !== 'known') {
      throw new Error('two-step route fixture missing')
    }
    const issued = await admin.mutation(internal.customerRequestRouteMandate.issue, {
      requestId: current.aggregate.snapshot.requestId,
      expectedRequestRevision: current.aggregate.snapshot.revision,
      expectedGenerationRef: current.routeGeneration.generationRef,
      selectedRoutePlanId: route.routePlanId,
      maximumTotalSpend: {
        currency: route.maximumTotalCost.currency,
        amountMinor: route.maximumTotalCost.amountMinor,
      },
      expiresAt: Math.min(route.expiresAt, Date.now() + 60_000),
      idempotencyKey: 'confirm:two-step-admission',
    })
    if (issued.kind !== 'issued') throw new Error(`two-step mandate failed: ${JSON.stringify(issued)}`)
    expect(issued.mandate.route.steps).toHaveLength(2)
    const [firstStep, secondStep] = issued.mandate.route.steps
    if (firstStep === undefined || secondStep === undefined) throw new Error('mandate steps missing')
    const commandFor = (step: typeof firstStep, idempotencyKey: string) => ({
      requestId: current.aggregate.snapshot.requestId,
      mandateRef: issued.mandate.mandateRef,
      expectedMandateDigest: issued.mandate.mandateDigest,
      expectedGenerationRef: current.routeGeneration.generationRef,
      expectedRoutePlanId: route.routePlanId,
      expectedRouteDigest: route.routeDigest,
      stepPosition: step.position,
      expectedActionId: step.actionId,
      expectedCapabilityId: step.contractRef.capabilityId,
      expectedCapabilityVersion: step.contractRef.version,
      expectedCapabilityContractDigest: step.contractRef.contractDigest,
      idempotencyKey,
    })
    const firstCommand = commandFor(firstStep, 'admit:two-step:first')
    const secondCommand = commandFor(secondStep, 'admit:two-step:second')
    await expect(admin.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: current.aggregate.snapshot.requestId,
    })).resolves.toMatchObject({ kind: 'active' })
    await expect(backend.run((ctx) => currentRoutePlanGenerationGraphStatus(
      ctx.db,
      current.aggregate.snapshot.requestId,
      current.routeGeneration.generationRef,
    ))).resolves.toBe('current')
    const first = await admin.mutation(internal.customerRequestRouteMandateAdmission.admitStep, firstCommand)
    const second = await admin.mutation(internal.customerRequestRouteMandateAdmission.admitStep, secondCommand)
    expect([first, second]).toEqual([
      expect.objectContaining({ kind: 'admitted', grant: expect.objectContaining({
        step: expect.objectContaining({ maximumSpend: { currency: 'AUD', amountMinor: 300 } }),
      }) }),
      expect.objectContaining({ kind: 'admitted', grant: expect.objectContaining({
        step: expect.objectContaining({ maximumSpend: { currency: 'AUD', amountMinor: 700 } }),
      }) }),
    ])
    await expect(admin.mutation(
      internal.customerRequestRouteMandateAdmission.admitStep,
      firstCommand,
    )).resolves.toEqual({ ...first, kind: 'replayed' })
    await expect(admin.mutation(
      internal.customerRequestRouteMandateAdmission.admitStep,
      commandFor(secondStep, 'admit:two-step:second-reuse'),
    )).resolves.toEqual({ kind: 'refused', reason: 'step_already_reserved' })
    await backend.run(async (ctx) => {
      const reservations = await ctx.db.query('customerRequestRouteStepReservations').collect()
      expect(reservations.map(({ reservedSpend }) => reservedSpend.amountMinor).sort((a, b) => a - b))
        .toEqual([300, 700])
      expect(reservations.reduce((total, row) => total + row.reservedSpend.amountMinor, 0)).toBe(1_000)
      expect(await ctx.db.query('customerRequestRouteDataReservations').collect()).toHaveLength(2)
      expect(await ctx.db.query('customerRequestRouteStepAdmissionCommands').collect()).toHaveLength(2)
    })
    await admin.mutation(internal.customerRequestRouteMandate.revoke, {
      requestId: current.aggregate.snapshot.requestId,
      mandateRef: issued.mandate.mandateRef,
      idempotencyKey: 'revoke:two-step-admission',
    })
    await expect(admin.mutation(
      internal.customerRequestRouteMandateAdmission.admitStep,
      firstCommand,
    )).resolves.toEqual({ kind: 'refused', reason: 'mandate_not_current' })
    await backend.run(async (ctx) => {
      expect(await ctx.db.query('customerRequestRouteStepReservations').collect()).toHaveLength(2)
      expect(await ctx.db.query('customerRequestRouteStepAdmissionCommands').collect()).toHaveLength(2)
    })
  })

  it('confirms the displayed option through one customer command without releasing a step', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const current = await committedTwoStepAdmissionRoute(backend, admin)
    const compared = await admin.action(api.customerRequestApplication.compare, {
      requestRef: current.aggregate.snapshot.requestId,
      revision: current.aggregate.snapshot.revision,
      idempotencyKey: 'compare:two-step-confirmation',
    })
    if (compared.kind !== 'request' || compared.decision?.routes[0] === undefined) {
      throw new Error(`customer route missing: ${JSON.stringify(compared)}`)
    }
    const displayedRoute = compared.decision.routes[0]

    const confirmed = await admin.action(api.customerRequestApplication.confirmRoute, {
      requestRef: compared.requestRef,
      revision: compared.revision,
      routeRef: displayedRoute.routeRef,
      idempotencyKey: 'confirm:two-step-customer',
    })

    expect(confirmed).toMatchObject({
      kind: 'request', requestRef: compared.requestRef, revision: compared.revision,
      state: 'route_confirmed', nextAction: 'inspect_confirmation',
      routeGenerationRef: compared.routeGenerationRef,
      confirmation: {
        confirmationRef: expect.any(String),
        confirmedAt: expect.any(Number),
        validUntil: displayedRoute.validUntil,
        route: displayedRoute,
      },
    })
    expect(JSON.stringify(confirmed)).not.toMatch(/mandate|capabilityId|bindingId|offeringId|publicationRef|transport|graph/u)
    await expect(admin.action(api.customerRequestApplication.confirmRoute, {
      requestRef: compared.requestRef,
      revision: compared.revision,
      routeRef: displayedRoute.routeRef,
      idempotencyKey: 'confirm:two-step-customer',
    })).resolves.toEqual(confirmed)
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: compared.requestRef,
    })).resolves.toMatchObject({
      ...confirmed,
      recovery: {
        state: 'restored',
        restoredAt: expect.any(Number),
        workRestarted: false,
      },
    })
    await expect(admin.action(api.customerRequestApplication.confirmRoute, {
      requestRef: compared.requestRef,
      revision: compared.revision,
      routeRef: displayedRoute.routeRef,
      idempotencyKey: 'confirm:two-step-customer-changed',
    })).resolves.toEqual({
      kind: 'conflict', requestRef: compared.requestRef, reason: 'options_changed',
    })
    await expect(admin.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: compared.requestRef,
    })).resolves.toMatchObject({ kind: 'active' })
    await backend.run(async (ctx) => {
      expect(await ctx.db.query('customerRequestRouteStepReservations').collect()).toEqual([])
      expect(await ctx.db.query('customerRequestRouteDataReservations').collect()).toEqual([])
    })
  })

  it('lets the customer create bounded repeat permission for the displayed low-risk option', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const current = await committedTwoStepAdmissionRoute(backend, admin)
    const compared = await admin.action(api.customerRequestApplication.compare, {
      requestRef: current.aggregate.snapshot.requestId,
      revision: current.aggregate.snapshot.revision,
      idempotencyKey: 'compare:repeat-permission',
    })
    if (compared.kind !== 'request' || compared.decision?.routes[0] === undefined) {
      throw new Error(`customer route missing: ${JSON.stringify(compared)}`)
    }
    const displayedRoute = compared.decision.routes[0]
    const servicePrincipal = {
      principalId: current.aggregate.snapshot.principalId,
      ownerId: 'user_route_admin',
      credentialId: 'credential:repeat-permission',
      scopes: ['customer_requests:create', 'customer_requests:standing_authority'],
    }
    const permissionCommand = {
      requestRef: compared.requestRef,
      revision: compared.revision,
      routeRef: displayedRoute.routeRef,
      delegatedCredentialId: 'credential:repeat-permission',
      occurrences: 2,
      cumulativeSpend: {
        currency: displayedRoute.maximumTotalCost.kind === 'known'
          ? displayedRoute.maximumTotalCost.currency
          : 'AUD',
        amountMinor: displayedRoute.maximumTotalCost.kind === 'known'
          ? displayedRoute.maximumTotalCost.amountMinor * 2
          : 0,
      },
      validUntil: Math.min(displayedRoute.validUntil, 5_000),
      idempotencyKey: 'allow-repeat:customer',
    }
    const serviceKey = 'repeat-permission-service-key-long-enough'
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', serviceKey)
    vi.stubEnv('CLERK_JWT_ISSUER_DOMAIN', 'https://identity.example')
    const serviceAuth = await createCustomerRequestServiceAssertion({
      key: serviceKey,
      operation: 'allow_repeat',
      command: permissionCommand,
      principal: servicePrincipal,
      issuedAt: 1_000,
    })
    const permission = await backend.action(api.customerRequestApplication.allowRepeatRoute, {
      ...permissionCommand,
      serviceAuth: { ...serviceAuth, scopes: [...serviceAuth.scopes] },
    })
    await expect(admin.action(api.customerRequestApplication.listRepeatPermissionAssistants, {
      requestRef: compared.requestRef,
    })).resolves.toEqual({
      kind: 'connected_assistants',
      requestRef: compared.requestRef,
      assistants: [{
        assistantRef: 'credential:repeat-permission',
        label: 'Connected assistant 1',
        lastUsedAt: 1_000,
      }],
      permissions: [permission],
    })

    expect(permission, JSON.stringify(permission)).toMatchObject({
      kind: 'repeat_permission',
      status: 'active',
      permissionRef: expect.stringMatching(/^repeat-permission:sha256:/u),
      requestRef: compared.requestRef,
      revision: compared.revision,
      routeRef: displayedRoute.routeRef,
      delegatedCredentialId: 'credential:repeat-permission',
      limits: {
        perUseSpend: {
          currency: displayedRoute.maximumTotalCost.kind === 'known'
            ? displayedRoute.maximumTotalCost.currency
            : 'AUD',
          amountMinor: displayedRoute.maximumTotalCost.kind === 'known'
            ? displayedRoute.maximumTotalCost.amountMinor
            : 0,
        },
        occurrences: 2,
      },
      fallback: 'ask_for_confirmation',
      validUntil: permissionCommand.validUntil,
    })
    expect(JSON.stringify(permission)).not.toMatch(
      /policyRef|policyDigest|mandate|capabilityId|bindingId|offeringId|graph/u,
    )
    if (permission.kind !== 'repeat_permission') {
      throw new Error(`repeat permission failed: ${JSON.stringify(permission)}`)
    }
    await expect(admin.action(api.customerRequestApplication.listRepeatPermissionAssistants, {
      requestRef: compared.requestRef,
    })).resolves.toMatchObject({
      kind: 'connected_assistants',
      permissions: [permission],
    })
    await expect(admin.action(api.customerRequestApplication.allowRepeatRoute, {
      ...permissionCommand,
      cumulativeSpend: permission.limits.cumulativeSpend,
    })).resolves.toEqual(permission)
    const useCommand = {
      requestRef: compared.requestRef,
      revision: compared.revision,
      routeRef: displayedRoute.routeRef,
      permissionRef: permission.permissionRef,
      delegatedCredentialId: permission.delegatedCredentialId,
      idempotencyKey: 'use-repeat:customer',
    }
    const useAuth = await createCustomerRequestServiceAssertion({
      key: serviceKey,
      operation: 'use_repeat',
      command: useCommand,
      principal: servicePrincipal,
      issuedAt: 1_000,
    })
    const confirmed = await backend.action(api.customerRequestApplication.useRepeatRoute, {
      ...useCommand,
      serviceAuth: { ...useAuth, scopes: [...useAuth.scopes] },
    })
    expect(confirmed).toMatchObject({
      kind: 'request',
      requestRef: compared.requestRef,
      revision: compared.revision,
      state: 'route_confirmed',
      confirmation: { route: displayedRoute },
    })
    expect(JSON.stringify(confirmed)).not.toMatch(
      /policyRef|policyDigest|mandate|capabilityId|bindingId|offeringId|graph/u,
    )
    await expect(backend.action(api.customerRequestApplication.useRepeatRoute, {
      ...useCommand,
      serviceAuth: { ...useAuth, scopes: [...useAuth.scopes] },
    })).resolves.toEqual(confirmed)
    vi.spyOn(Date, 'now').mockReturnValue(permission.validUntil + 1)
    const expiredUseCommand = {
      ...useCommand,
      idempotencyKey: 'use-repeat:expired',
    }
    const expiredUseAuth = await createCustomerRequestServiceAssertion({
      key: serviceKey,
      operation: 'use_repeat',
      command: expiredUseCommand,
      principal: servicePrincipal,
      issuedAt: permission.validUntil + 1,
    })
    const expiredUse = await backend.action(api.customerRequestApplication.useRepeatRoute, {
      ...expiredUseCommand,
      serviceAuth: { ...expiredUseAuth, scopes: [...expiredUseAuth.scopes] },
    })
    expect(expiredUse).toMatchObject({
      kind: 'request',
      state: 'needs_attention',
      summary: 'Repeat permission expired. Confirm the current choice before continuing.',
    })
    expect(JSON.stringify(expiredUse)).not.toMatch(
      /policy|mandate|generation|capability|binding|offering|graph/u,
    )
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const inspectCommand = {
      requestRef: compared.requestRef,
      permissionRef: permission.permissionRef,
      routeRef: displayedRoute.routeRef,
    }
    const inspectAuth = await createCustomerRequestServiceAssertion({
      key: serviceKey,
      operation: 'inspect_repeat',
      command: inspectCommand,
      principal: servicePrincipal,
      issuedAt: 1_000,
    })
    await expect(backend.action(api.customerRequestApplication.inspectRepeatRoute, {
      ...inspectCommand,
      serviceAuth: { ...inspectAuth, scopes: [...inspectAuth.scopes] },
    })).resolves.toEqual(permission)
    const revokeCommand = {
      requestRef: compared.requestRef,
      permissionRef: permission.permissionRef,
      routeRef: displayedRoute.routeRef,
      idempotencyKey: 'revoke-repeat:customer',
    }
    const revokeAuth = await createCustomerRequestServiceAssertion({
      key: serviceKey,
      operation: 'revoke_repeat',
      command: revokeCommand,
      principal: servicePrincipal,
      issuedAt: 1_000,
    })
    const withdrawn = await backend.action(api.customerRequestApplication.revokeRepeatRoute, {
      ...revokeCommand,
      serviceAuth: { ...revokeAuth, scopes: [...revokeAuth.scopes] },
    })
    expect(withdrawn).toMatchObject({
      ...permission,
      status: 'withdrawn',
      withdrawnAt: 1_000,
    })
    await expect(admin.action(api.customerRequestApplication.revokeRepeatRoute, {
      ...revokeCommand,
    })).resolves.toEqual(withdrawn)
    await expect(admin.action(api.customerRequestApplication.inspectRepeatRoute, {
      requestRef: compared.requestRef,
      permissionRef: permission.permissionRef,
      routeRef: displayedRoute.routeRef,
    })).resolves.toEqual(withdrawn)
    await expect(admin.action(api.customerRequestApplication.listRepeatPermissionAssistants, {
      requestRef: compared.requestRef,
    })).resolves.toMatchObject({
      kind: 'connected_assistants',
      permissions: [withdrawn],
    })
    const withdrawnUseCommand = {
      requestRef: compared.requestRef,
      revision: compared.revision,
      routeRef: displayedRoute.routeRef,
      permissionRef: permission.permissionRef,
      delegatedCredentialId: permission.delegatedCredentialId,
      idempotencyKey: 'use-repeat:after-withdrawal',
    }
    const withdrawnUseAuth = await createCustomerRequestServiceAssertion({
      key: serviceKey,
      operation: 'use_repeat',
      command: withdrawnUseCommand,
      principal: servicePrincipal,
      issuedAt: 1_000,
    })
    await expect(backend.action(api.customerRequestApplication.useRepeatRoute, {
      ...withdrawnUseCommand,
      serviceAuth: { ...withdrawnUseAuth, scopes: [...withdrawnUseAuth.scopes] },
    })).resolves.toMatchObject({
      kind: 'request',
      state: 'needs_attention',
      summary: 'Repeat permission was withdrawn. Ask for confirmation before continuing.',
    })
  })

  it('starts the confirmed choice through one customer command and replays one durable run', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const current = await committedTwoStepAdmissionRoute(backend, admin)
    const compared = await admin.action(api.customerRequestApplication.compare, {
      requestRef: current.aggregate.snapshot.requestId,
      revision: current.aggregate.snapshot.revision,
      idempotencyKey: 'compare:two-step-run',
    })
    if (compared.kind !== 'request' || compared.decision?.routes[0] === undefined) {
      throw new Error(`customer route missing: ${JSON.stringify(compared)}`)
    }
    const confirmed = await admin.action(api.customerRequestApplication.confirmRoute, {
      requestRef: compared.requestRef,
      revision: compared.revision,
      routeRef: compared.decision.routes[0].routeRef,
      idempotencyKey: 'confirm:two-step-run',
    })
    if (confirmed.kind !== 'request' || confirmed.state !== 'route_confirmed') {
      throw new Error(`route confirmation missing: ${JSON.stringify(confirmed)}`)
    }

    const first = await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'run:two-step-customer',
    })

    expect(first).toMatchObject({
      kind: 'request', requestRef: confirmed.requestRef, revision: confirmed.revision,
      state: 'in_progress', nextAction: 'wait',
      progress: {
        completed: 0, total: 2,
        current: { step: 1, state: 'queued' },
      },
    })
    expect(JSON.stringify(first)).not.toMatch(/mandate|capabilityId|bindingId|offeringId|publicationRef|transport|graph/u)
    await expect(admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'run:two-step-customer',
    })).resolves.toEqual(first)
  })

  it('fails safely instead of leaving a run queued when call signing is unavailable', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'signing-unavailable')

    await expect(admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'run:signing-unavailable',
    })).resolves.toMatchObject({
      kind: 'request', state: 'in_progress',
      progress: { current: { step: 1, state: 'queued' } },
    })

    await finishScheduledRouteWorkers(backend, 1)

    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'failed', nextAction: 'revise_request',
      summary: 'AE could not safely contact the business. Nothing was sent.',
      action: {
        state: 'failed', resolution: 'not_sent', automaticRetry: false,
        result: { reason: 'business_contact_not_started' },
      },
    })
    expect(routeProviderFetch).not.toHaveBeenCalled()
  })

  it('chains only validated evidence into the next step and completes the same durable run', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'validated-chain')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'run:validated-chain',
    })

    const firstLease = await backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:one', leaseDurationMs: 10_000,
    })
    expect(firstLease).toMatchObject({
      kind: 'leased',
      dispatch: { position: 1 },
    })
    if (firstLease.kind !== 'leased') throw new Error('first route step was not leased')
    expect(JSON.parse(firstLease.dispatch.inputJson)).toEqual({
      request: 'Resolve a service reference and prepare its quote',
    })
    await expect(backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:two', leaseDurationMs: 10_000,
    })).resolves.toEqual({ kind: 'none' })
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: firstLease.dispatch.dispatchRef,
      attemptRef: firstLease.dispatch.attemptRef,
      workerId: 'worker:one',
    })
    await backend.mutation(internal.customerRequestRouteExecution.markAccepted, {
      attemptRef: firstLease.dispatch.attemptRef,
      operationKeyDigest: firstLease.dispatch.operationKeyDigest,
    })
    const advanced = await backend.mutation(internal.customerRequestRouteExecution.recordOutcome, {
      attemptRef: firstLease.dispatch.attemptRef,
      operationKeyDigest: firstLease.dispatch.operationKeyDigest,
      outcome: { kind: 'succeeded', outputJson: JSON.stringify({ serviceReference: 'service:123' }) },
    })
    expect(advanced).toMatchObject({
      kind: 'advanced', run: { completedSteps: 1, currentPosition: 2, currentState: 'queued' },
    })
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request',
      state: 'in_progress',
      businesses: [{ name: 'Route admission-resolver' }, { name: 'Route admission-quoter' }],
      progress: {
        completed: 1,
        total: 2,
        current: { step: 2, state: 'queued' },
        dependencies: {
          completed: [{ step: 1, business: 'Route admission-resolver' }],
          blocked: [],
        },
      },
    })

    const secondLease = await backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:two', leaseDurationMs: 10_000,
    })
    expect(secondLease).toMatchObject({ kind: 'leased', dispatch: { position: 2 } })
    if (secondLease.kind !== 'leased') throw new Error('second route step was not leased')
    expect(JSON.parse(secondLease.dispatch.inputJson)).toEqual({ serviceReference: 'service:123' })
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: secondLease.dispatch.dispatchRef,
      attemptRef: secondLease.dispatch.attemptRef,
      workerId: 'worker:two',
    })
    await backend.mutation(internal.customerRequestRouteExecution.markAccepted, {
      attemptRef: secondLease.dispatch.attemptRef,
      operationKeyDigest: secondLease.dispatch.operationKeyDigest,
    })
    await expect(backend.mutation(internal.customerRequestRouteExecution.recordOutcome, {
      attemptRef: secondLease.dispatch.attemptRef,
      operationKeyDigest: secondLease.dispatch.operationKeyDigest,
      outcome: { kind: 'succeeded', outputJson: JSON.stringify({ quoteReference: 'quote:123' }) },
    })).resolves.toMatchObject({ kind: 'completed' })
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'completed', nextAction: 'none',
      action: { state: 'completed', result: { quoteReference: 'quote:123' } },
    })
    await backend.run(async (ctx) => {
      const reservations = await ctx.db.query('customerRequestRouteStepReservations').collect()
      const disclosures = await ctx.db.query('customerRequestRouteDataReservations').collect()
      expect(reservations.reduce((total, row) => total + row.reservedSpend.amountMinor, 0)).toBe(1_000)
      expect(disclosures).toHaveLength(2)
      expect(new Set(disclosures.map(({ allocationRef }) => allocationRef)).size).toBe(2)
    })
  })

  it('runs a two-step Request through registered transports and resumes the customer result', async () => {
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'route-call-signing-secret-with-at-least-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
    vi.stubEnv('ROUTE_ADMISSION_RESOLVER_KEY', 'resolver-secret')
    vi.stubEnv('ROUTE_ADMISSION_QUOTER_KEY', 'quoter-secret')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'transport-worker')
    routeProviderFetch.mockReset()
    routeProviderFetch.mockImplementationOnce(async (_input, init) => {
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer resolver-secret',
          'AE-Call-Key-Id': 'route-calls:test',
          'AE-Call-Signature': expect.stringMatching(/^hmac-sha256:[0-9a-f]{64}$/),
          'Idempotency-Key': expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        })
        return new UndiciResponse(JSON.stringify({ serviceReference: 'service:worker' }), {
          status: 200, headers: { 'Content-Type': 'application/json', 'Provider-Receipt': 'provider:first' },
        })
      })
      .mockImplementationOnce(async (_input, init) => {
        expect(init?.headers).toMatchObject({ Authorization: 'Bearer quoter-secret' })
        expect(JSON.parse(String(init?.body))).toEqual({ serviceReference: 'service:worker' })
        return new UndiciResponse(JSON.stringify({ quoteReference: 'quote:worker' }), {
          status: 200, headers: { 'Content-Type': 'application/json', 'Provider-Receipt': 'provider:second' },
        })
      })
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:transport-worker',
    })
    await backend.run(async (ctx) => {
      const validUntil = Date.now() + 30_000
      const attempts = await ctx.db.query('customerRequestRouteStepAttempts').collect()
      expect(attempts).toHaveLength(1)
      expect(attempts[0]?.grant.expiresAt).toBeGreaterThan(validUntil)
      const publications = await ctx.db.query('capabilityPublications').collect()
      for (const publication of publications) {
        if (publication.disposition === 'current') {
          await ctx.db.patch(publication._id, { readinessValidUntil: validUntil })
        }
      }
    })

    await finishScheduledRouteWorkers(backend, 2)

    const routeState = await backend.run(async (ctx) => ({
      runs: await ctx.db.query('customerRequestRouteRuns').collect(),
      attempts: await ctx.db.query('customerRequestRouteStepAttempts').collect(),
      outbox: await ctx.db.query('customerRequestRouteDispatchOutbox').collect(),
    }))
    expect({
      calls: routeProviderFetch.mock.calls.length,
      runStates: routeState.runs.map(({ state }) => state),
      attemptStates: routeState.attempts.map(({ state, transportObservationJson }) => ({ state, transportObservationJson })),
      outboxStates: routeState.outbox.map(({ state }) => state),
    }).toMatchObject({
      calls: 2,
      runStates: ['completed'],
      attemptStates: [{ state: 'succeeded' }, { state: 'succeeded' }],
      outboxStates: ['delivered', 'delivered'],
    })

    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'completed', nextAction: 'none',
      action: { state: 'completed', result: { quoteReference: 'quote:worker' } },
    })
    const observations = await backend.run(async (ctx) => (
      await ctx.db.query('customerRequestRouteStepAttempts').collect()
    ))
    expect(observations.map(({ transportObservationJson }) => (
      transportObservationJson === undefined ? undefined : JSON.parse(transportObservationJson)
    ))).toMatchObject([
      { transport: 'http', disposition: 'succeeded', providerReceipt: 'provider:first' },
      { transport: 'http', disposition: 'succeeded', providerReceipt: 'provider:second' },
    ])
    expect(routeProviderFetch).toHaveBeenCalledTimes(2)
  })

  it('uses source-owned sandbox registrations for one ordinary-language composite Request', async () => {
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'route-call-signing-secret-with-at-least-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
    vi.stubEnv('AE_SANDBOX_PROVIDER_KEY', 'sandbox-provider-secret')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const backend = convexTest(schema, modules)
    const seeded = await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    await finishImmediateReadinessProbe(backend)
    for (const [index, publicationRef] of seeded.sandboxRoutePublicationRefs.entries()) {
      await observeReady(backend, { publicationRef, revision: 1 }, `source-route-${index + 1}`)
    }

    const resolverModel = openCapabilityDecisionModel(defineCapabilityContract(
      SANDBOX_ROUTE_RESOLVE_CAPABILITY_CONTRACT_DOCUMENT,
    ))
    const quoterModel = openCapabilityDecisionModel(defineCapabilityContract(
      SANDBOX_ROUTE_QUOTE_CAPABILITY_CONTRACT_DOCUMENT,
    ))
    const requestInput = resolverModel.inputs.find((input) => input.inputPointer === '/request')
    if (requestInput === undefined) throw new Error('source-owned resolver request input missing')
    const customerJob = 'Resolve a labelled sandbox service and prepare its quote'
    const generate = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [
          {
            selectionKey: resolverModel.selectionKey,
            facts: [{ inputKey: requestInput.key, value: customerJob }],
          },
          { selectionKey: quoterModel.selectionKey, facts: [] },
        ],
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', generate)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity({
      subject: 'customer-source-owned-route', issuer: 'https://identity.example',
    })

    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:source-owned-route', requestId: 'request:source-owned-route',
      delegatedAgentId: 'agent:source-owned-route', customerJob,
      routing: { networkId: 'ae:public' },
    })
    if (submitted.kind !== 'request') throw new Error(`source-owned submit failed: ${submitted.kind}`)
    const compared = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef, revision: submitted.revision,
      idempotencyKey: 'compare:source-owned-route',
    })
    if (compared.kind !== 'request' || compared.decision?.routes[0] === undefined) {
      throw new Error(`source-owned comparison failed: ${JSON.stringify(compared)}`)
    }
    const displayed = compared.decision.routes[0]
    expect(displayed).toMatchObject({
      businesses: [
        { name: SANDBOX_ROUTE_PROVIDER_PROFILES.resolver.label },
        { name: SANDBOX_ROUTE_PROVIDER_PROFILES.quoter.label },
      ],
      stepCount: 2,
      maximumTotalCost: { kind: 'known', currency: 'AUD', amountMinor: 1_000 },
      result: {
        summary: SANDBOX_ROUTE_QUOTE_CAPABILITY_CONTRACT_DOCUMENT.description,
        deliverables: ['Quote reference'],
      },
    })
    expect(JSON.stringify(compared)).not.toMatch(
      /capabilityId|bindingId|offeringId|publicationRef|contractDigest|transport|graph/u,
    )

    const confirmed = await customer.action(api.customerRequestApplication.confirmRoute, {
      requestRef: compared.requestRef, revision: compared.revision, routeRef: displayed.routeRef,
      idempotencyKey: 'confirm:source-owned-route',
    })
    expect(confirmed).toMatchObject({ kind: 'request', state: 'route_confirmed' })
    if (confirmed.kind !== 'request' || confirmed.state !== 'route_confirmed') {
      throw new Error(`source-owned confirmation failed: ${JSON.stringify(confirmed)}`)
    }

    routeProviderFetch.mockReset()
    routeProviderFetch
      .mockImplementationOnce(async (input, init) => {
        expect(input.toString()).toContain('/api/sandbox/providers/route-resolver')
        expect(init?.headers).toMatchObject({ Authorization: 'Bearer sandbox-provider-secret' })
        expect(JSON.parse(String(init?.body))).toEqual({ request: customerJob })
        return new UndiciResponse(JSON.stringify({ serviceReference: 'sandbox-service:source-owned' }), {
          status: 200, headers: { 'Content-Type': 'application/json', 'Provider-Receipt': 'sandbox:resolver' },
        })
      })
      .mockImplementationOnce(async (input, init) => {
        expect(input.toString()).toContain('/api/sandbox/providers/route-quoter')
        expect(JSON.parse(String(init?.body))).toEqual({ serviceReference: 'sandbox-service:source-owned' })
        return new UndiciResponse(JSON.stringify({ quoteReference: 'sandbox-quote:source-owned' }), {
          status: 200, headers: { 'Content-Type': 'application/json', 'Provider-Receipt': 'sandbox:quoter' },
        })
      })
    const started = await customer.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'run:source-owned-route',
    })
    expect(started).toMatchObject({
      kind: 'request', state: 'in_progress',
      progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
    })
    await finishScheduledRouteWorkers(backend, 2)
    const completed = await customer.action(api.customerRequestApplication.resume, {
      requestRef: compared.requestRef,
    })
    expect(completed).toMatchObject({
      kind: 'request', state: 'completed', nextAction: 'none',
      businesses: [
        { name: 'Sandbox Route Resolver' },
        { name: 'Sandbox Route Quoter' },
      ],
      action: { state: 'completed', result: { quoteReference: 'sandbox-quote:source-owned' } },
    })
    await backend.run(async (ctx) => {
      const run = await ctx.db.query('customerRequestRouteRuns')
        .withIndex('by_requestId', (query) => query.eq('requestId', compared.requestRef)).unique()
      if (run === null) throw new Error('source-owned route run missing')
      await ctx.db.patch(run._id, {
        businesses: undefined,
        runDigest: canonicalDigest({
          runRef: run.runRef,
          principalId: run.principalId,
          requestId: run.requestId,
          requestRevision: run.requestRevision,
          mandateRef: run.mandateRef,
          mandateDigest: run.mandateDigest,
          generationRef: run.generationRef,
          routePlanId: run.routePlanId,
          routeDigest: run.routeDigest,
          totalSteps: run.totalSteps,
          createdAt: run.createdAt,
        }),
      })
    })
    await expect(customer.action(api.customerRequestApplication.resume, {
      requestRef: compared.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'needs_attention', nextAction: 'retry',
      summary: 'AE could not verify which businesses handled this earlier run. The result has not been changed.',
    })
    expect(routeProviderFetch).toHaveBeenCalledTimes(2)
  })

  it('records an interrupted released call as unknown and refuses unsafe replay', async () => {
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'route-call-signing-secret-with-at-least-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
    vi.stubEnv('ROUTE_ADMISSION_RESOLVER_KEY', 'resolver-secret')
    vi.stubEnv('ROUTE_ADMISSION_QUOTER_KEY', 'quoter-secret')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'transport-interrupted')
    routeProviderFetch.mockReset()
    routeProviderFetch
      .mockResolvedValueOnce(new UndiciResponse(JSON.stringify({ serviceReference: 'sandbox-service:interrupted' }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Provider-Receipt': 'sandbox:resolver' },
      }))
      .mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'))
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:transport-interrupted',
    })

    await finishScheduledRouteWorkers(backend, 2)
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'outcome_unknown', nextAction: 'wait',
      action: { state: 'unknown', automaticRetry: false },
      progress: { completed: 1, total: 2, current: { step: 2, state: 'needs_attention' } },
    })
    await expect(backend.action(internal.customerRequestRouteTransportWorker.runNext, {
      workerId: 'worker:transport:unsafe-retry',
    })).resolves.toEqual({ kind: 'none' })
    expect(routeProviderFetch).toHaveBeenCalledTimes(2)
  })

  it('records a definite released provider denial as failed and never retries it', async () => {
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'route-call-signing-secret-with-at-least-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
    vi.stubEnv('ROUTE_ADMISSION_RESOLVER_KEY', 'resolver-secret')
    vi.stubEnv('ROUTE_ADMISSION_QUOTER_KEY', 'quoter-secret')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'transport-provider-denial')
    routeProviderFetch.mockReset()
    routeProviderFetch
      .mockResolvedValueOnce(new UndiciResponse(JSON.stringify({ serviceReference: 'sandbox-service:denied' }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Provider-Receipt': 'sandbox:resolver' },
      }))
      .mockResolvedValueOnce(new UndiciResponse(JSON.stringify({
        kind: 'refused', reason: 'sandbox_provider_declined',
      }), {
        status: 409, headers: {
          'Content-Type': 'application/json', 'Provider-Receipt': 'sandbox:quoter-denial',
        },
      }))
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:transport-provider-denial',
    })

    await finishScheduledRouteWorkers(backend, 2)
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'failed', nextAction: 'revise_request',
      action: {
        state: 'failed', resolution: 'reconciled', automaticRetry: false,
        result: { reason: 'business_reported_failure' },
      },
      progress: { completed: 1, total: 2, current: { step: 2, state: 'needs_attention' } },
    })
    await expect(admin.action(api.customerRequestApplication.exportRouteEvidence, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'evidence', state: 'failed',
      steps: [{ step: 1, state: 'completed' }, { step: 2, state: 'failed' }],
      result: { reason: 'business_reported_failure' },
    })
    await expect(backend.action(internal.customerRequestRouteTransportWorker.runNext, {
      workerId: 'worker:transport:denial-retry',
    })).resolves.toEqual({ kind: 'none' })
    expect(routeProviderFetch).toHaveBeenCalledTimes(2)
  })

  it('preserves a validated partial provider result without completing or retrying', async () => {
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'route-call-signing-secret-with-at-least-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
    vi.stubEnv('ROUTE_ADMISSION_RESOLVER_KEY', 'resolver-secret')
    vi.stubEnv('ROUTE_ADMISSION_QUOTER_KEY', 'quoter-secret')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'transport-partial-result')
    routeProviderFetch.mockReset()
    routeProviderFetch
      .mockResolvedValueOnce(new UndiciResponse(JSON.stringify({ serviceReference: 'sandbox-service:partial' }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Provider-Receipt': 'sandbox:resolver' },
      }))
      .mockResolvedValueOnce(new UndiciResponse(JSON.stringify({ quoteReference: 'sandbox-partial-quote:one' }), {
        status: 200, headers: {
          'Content-Type': 'application/json',
          'Provider-Receipt': 'sandbox:quoter-partial',
          'Continuation-Token': 'sandbox-continuation:private',
        },
      }))
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:transport-partial-result',
    })

    await finishScheduledRouteWorkers(backend, 2)
    const resumed = await admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })
    expect(resumed).toMatchObject({
      kind: 'request', state: 'outcome_unknown', nextAction: 'wait',
      action: {
        state: 'unknown', automaticRetry: false,
        result: {
          kind: 'partial_result',
          output: { quoteReference: 'sandbox-partial-quote:one' },
        },
      },
      progress: { completed: 1, total: 2, current: { step: 2, state: 'needs_attention' } },
    })
    expect(JSON.stringify(resumed)).not.toContain('sandbox-continuation:private')
    const evidence = await admin.action(api.customerRequestApplication.exportRouteEvidence, {
      requestRef: confirmed.requestRef,
    })
    expect(evidence).toMatchObject({
      kind: 'evidence', state: 'outcome_unknown',
      steps: [{ step: 1, state: 'completed' }, { step: 2, state: 'outcome_unknown' }],
      result: {
        kind: 'partial_result',
        output: { quoteReference: 'sandbox-partial-quote:one' },
      },
    })
    expect(JSON.stringify(evidence)).not.toContain('sandbox-continuation:private')
    await expect(backend.action(internal.customerRequestRouteTransportWorker.runNext, {
      workerId: 'worker:transport:partial-retry',
    })).resolves.toEqual({ kind: 'none' })
    expect(routeProviderFetch).toHaveBeenCalledTimes(2)
  })

  it('never advances or retries when a released step has an invalid or unknown outcome', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'unknown-outcome')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:unknown-outcome',
    })
    const lease = await backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:unknown', leaseDurationMs: 10_000,
    })
    if (lease.kind !== 'leased') throw new Error('unknown-outcome route step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
      workerId: 'worker:unknown',
    })
    await backend.mutation(internal.customerRequestRouteExecution.markAccepted, {
      attemptRef: lease.dispatch.attemptRef,
      operationKeyDigest: lease.dispatch.operationKeyDigest,
    })
    await expect(backend.mutation(internal.customerRequestRouteExecution.recordOutcome, {
      attemptRef: lease.dispatch.attemptRef,
      operationKeyDigest: lease.dispatch.operationKeyDigest,
      outcome: { kind: 'succeeded', outputJson: JSON.stringify({ inventedSuccess: true }) },
    })).resolves.toMatchObject({
      kind: 'outcome_unknown',
      run: { completedSteps: 0, currentPosition: 1, currentState: 'outcome_unknown' },
    })
    await expect(backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:retry', leaseDurationMs: 10_000,
    })).resolves.toEqual({ kind: 'none' })
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'outcome_unknown', nextAction: 'wait',
      action: { state: 'unknown', automaticRetry: false },
    })
  })

  it('keeps a business-reported failure distinct from an unknown outcome', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'known-failure')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:known-failure',
    })
    const lease = await backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:known-failure', leaseDurationMs: 10_000,
    })
    if (lease.kind !== 'leased') throw new Error('known-failure route step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
      workerId: 'worker:known-failure',
    })
    await expect(backend.mutation(internal.customerRequestRouteExecution.recordOutcome, {
      attemptRef: lease.dispatch.attemptRef,
      operationKeyDigest: lease.dispatch.operationKeyDigest,
      outcome: { kind: 'failed' },
    })).resolves.toMatchObject({
      kind: 'failed', run: { state: 'failed', currentState: 'failed', completedSteps: 0 },
    })
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'failed', nextAction: 'revise_request',
      action: { state: 'failed', automaticRetry: false },
    })
    await expect(backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:after-known-failure', leaseDurationMs: 10_000,
    })).resolves.toEqual({ kind: 'none' })
  })

  it('requeues a lease crash before release and marks a post-release crash unknown', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'lease-recovery')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:lease-recovery',
    })
    const first = await backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:crashed-before-release', leaseDurationMs: 1_000,
    })
    if (first.kind !== 'leased') throw new Error('recovery route step was not leased')
    vi.spyOn(Date, 'now').mockReturnValue(11_001)
    await expect(backend.mutation(internal.customerRequestRouteExecution.recoverExpiredDispatch, {
      dispatchRef: first.dispatch.dispatchRef,
    })).resolves.toEqual({ kind: 'requeued' })
    const second = await backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:replacement', leaseDurationMs: 1_000,
    })
    expect(second).toMatchObject({
      kind: 'leased', dispatch: {
        attemptRef: first.dispatch.attemptRef,
        operationKeyDigest: first.dispatch.operationKeyDigest,
      },
    })
    if (second.kind !== 'leased') throw new Error('requeued route step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: second.dispatch.dispatchRef,
      attemptRef: second.dispatch.attemptRef,
      workerId: 'worker:replacement',
    })
    vi.spyOn(Date, 'now').mockReturnValue(12_002)
    await expect(backend.mutation(internal.customerRequestRouteExecution.recoverExpiredDispatch, {
      dispatchRef: second.dispatch.dispatchRef,
    })).resolves.toEqual({ kind: 'outcome_unknown' })
    await expect(backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:blind-retry', leaseDurationMs: 1_000,
    })).resolves.toEqual({ kind: 'none' })
  })

  it('terminalizes expired unreleased authority instead of poisoning the shared dispatch queue', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'expired-dispatch')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:expired-dispatch',
    })
    const expiresAt = await backend.run(async (ctx) => {
      const attempts = await ctx.db.query('customerRequestRouteStepAttempts').collect()
      expect(attempts).toHaveLength(1)
      return attempts[0]?.grant.expiresAt
    })
    if (expiresAt === undefined) throw new Error('expired dispatch grant missing')
    vi.spyOn(Date, 'now').mockReturnValue(expiresAt + 1)

    await expect(backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:after-authority-expiry', leaseDurationMs: 10_000,
    })).resolves.toEqual({ kind: 'none' })
    await backend.run(async (ctx) => {
      const runs = await ctx.db.query('customerRequestRouteRuns').collect()
      const attempts = await ctx.db.query('customerRequestRouteStepAttempts').collect()
      const outbox = await ctx.db.query('customerRequestRouteDispatchOutbox').collect()
      expect(runs).toHaveLength(1)
      expect(attempts).toHaveLength(1)
      expect(outbox).toHaveLength(1)
      expect(runs[0]).toMatchObject({
        state: 'failed', resultJson: JSON.stringify({ reason: 'authority_expired_before_release' }),
      })
      expect(attempts[0]?.state).toBe('failed')
      expect(outbox[0]?.state).toBe('failed')
    })
  })

  it('rechecks the exact registered binding at the release boundary', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'release-binding-recheck')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:release-binding-recheck',
    })
    const lease = await backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:binding-recheck', leaseDurationMs: 10_000,
    })
    if (lease.kind !== 'leased') throw new Error('binding recheck step was not leased')
    const supply = await backend.run(async (ctx) => {
      const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_attemptRef', (query) => query.eq('attemptRef', lease.dispatch.attemptRef)).unique()
      if (attempt === null) throw new Error('binding recheck attempt missing')
      const offering = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', attempt.grant.step.offeringId)).unique()
      const binding = await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', attempt.grant.step.bindingId)).unique()
      if (offering === null || binding === null) throw new Error('binding recheck supply missing')
      return { attempt, offering, binding }
    })
    await expect(admin.mutation(api.capabilitySupply.setEligibility, {
      offeringId: supply.offering.offeringId,
      bindingId: supply.binding.bindingId,
      contractRef: supply.attempt.grant.step.contractRef,
      decision: 'revoke',
      expectedOfferingRegistrationHash: supply.offering.registrationHash,
      expectedBindingRegistrationHash: supply.binding.registrationHash,
      admissionEvidenceRefs: ['test:release-recheck-revoked'],
      conformanceEvidenceRefs: ['test:release-recheck-revoked'],
      ...operationContext('release-binding-recheck-revoke'),
    })).resolves.toMatchObject({ kind: 'ineligible' })

    await expect(backend.query(internal.customerRequestRouteExecution.openLeasedDispatch, {
      dispatchRef: lease.dispatch.dispatchRef, workerId: 'worker:binding-recheck',
    })).resolves.toEqual({ kind: 'unavailable' })
    await expect(backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
      workerId: 'worker:binding-recheck',
    })).resolves.toEqual({ kind: 'refused', reason: 'lease_not_current' })
  })

  it('stops a queued run idempotently before any business step is released', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'cancel-before-release')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:cancel-before-release',
    })
    const cancelled = await admin.action(api.customerRequestApplication.cancelRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'cancel:before-release',
    })
    expect(cancelled).toMatchObject({
      kind: 'request', state: 'cancelled', nextAction: 'revise_request',
      activity: { cancellation: { state: 'stopped', stoppedAt: 10_000 } },
    })
    await expect(admin.action(api.customerRequestApplication.cancelRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'cancel:before-release',
    })).resolves.toEqual(cancelled)
    await expect(backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:after-cancel', leaseDurationMs: 1_000,
    })).resolves.toEqual({ kind: 'none' })
  })

  it('reports problems idempotently and exports customer-safe evidence from the same Request', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(4_000)
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'recovery-contract')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:recovery-contract',
    })

    const command = {
      requestRef: confirmed.requestRef, idempotencyKey: 'problem:recovery-contract',
      category: 'incorrect_result' as const, summary: 'The returned result does not match the confirmed choice.',
      affectedStep: 1,
      evidenceReceiptRefs: [] as string[],
      visibility: 'customer_and_ae_only' as const,
    }
    const reported = await admin.action(api.customerRequestApplication.reportRouteProblem, command)
    expect(reported).toMatchObject({
      kind: 'problem_reported', requestRef: confirmed.requestRef, state: 'received', reportedAt: 4_000,
      problem: {
        category: 'incorrect_result',
        claimSource: 'customer',
        causality: 'unknown',
        resolution: 'not_adjudicated',
        nextAction: 'await_status_update',
        nextActor: 'ae',
        nextUpdateDueAt: 86_404_000,
        decisionAuthority: 'not_assigned',
        visibility: 'customer_and_ae_only',
        evidence: [],
        affected: { step: 1 },
      },
    })
    await expect(admin.action(api.customerRequestApplication.reportRouteProblem, command)).resolves.toEqual(reported)
    await expect(admin.action(api.customerRequestApplication.reportRouteProblem, {
      ...command, summary: 'A different report under the same key.',
    })).resolves.toEqual({
      kind: 'conflict', requestRef: confirmed.requestRef, reason: 'idempotency_key_reused',
    })

    const exported = await admin.action(api.customerRequestApplication.exportRouteEvidence, {
      requestRef: confirmed.requestRef,
    })
    expect(exported).toMatchObject({
      kind: 'evidence', requestRef: confirmed.requestRef, state: 'queued', generatedAt: 4_000,
      steps: [{ step: 1, state: 'queued', evidence: [] }],
      problems: [{
        reportRef: reported.kind === 'problem_reported' ? reported.reportRef : '',
        state: 'received',
        category: 'incorrect_result',
        summary: 'The returned result does not match the confirmed choice.',
        claimSource: 'customer',
        causality: 'unknown',
        resolution: 'not_adjudicated',
        nextAction: 'await_status_update',
        nextActor: 'ae',
        nextUpdateDueAt: 86_404_000,
        decisionAuthority: 'not_assigned',
        visibility: 'customer_and_ae_only',
        evidence: [],
        reportedAt: 4_000,
        affected: { step: 1 },
      }],
    })
    vi.spyOn(Date, 'now').mockReturnValue(86_404_001)
    await expect(admin.action(api.customerRequestApplication.exportRouteEvidence, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'evidence',
      generatedAt: 86_404_001,
      problems: [{
        state: 'update_due',
        nextAction: 'check_status',
        nextActor: 'ae',
        nextUpdateDueAt: 86_404_000,
        decisionAuthority: 'not_assigned',
      }],
    })
    expect(JSON.stringify(exported)).not.toMatch(/transport|mandate|capability|binding|operationKey|inputJson/u)
    await backend.run(async (ctx) => {
      expect(await ctx.db.query('customerRequestRouteProblemReports').collect()).toHaveLength(1)
    })
  })

  it('records a suspected duplicate charge or effect without adjudicating whether it occurred', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(4_500)
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const support = await supportAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'suspected-duplicate-effect')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:suspected-duplicate-effect',
    })

    const command = {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'problem:suspected-duplicate-effect',
      category: 'duplicate_charge_or_effect' as const,
      summary: 'I received two provider notifications and may have been charged or affected twice.',
      affectedStep: 1,
      evidenceReceiptRefs: [] as string[],
      visibility: 'share_with_affected_business' as const,
    }
    const reported = await admin.action(api.customerRequestApplication.reportRouteProblem, command)
    expect(reported).toMatchObject({
      kind: 'problem_reported',
      requestRef: confirmed.requestRef,
      problem: {
        category: 'duplicate_charge_or_effect',
        claimSource: 'customer',
        causality: 'unknown',
        resolution: 'not_adjudicated',
        decisionAuthority: 'not_assigned',
        visibility: 'share_with_affected_business',
        affected: { step: 1 },
      },
    })
    await expect(admin.action(
      api.customerRequestApplication.reportRouteProblem,
      command,
    )).resolves.toEqual(reported)
    await expect(admin.action(api.customerRequestApplication.reportRouteProblem, {
      ...command,
      summary: 'Changed duplicate-effect claim under the same key.',
    })).resolves.toEqual({
      kind: 'conflict',
      requestRef: confirmed.requestRef,
      reason: 'idempotency_key_reused',
    })

    await expect(admin.action(api.customerRequestApplication.exportRouteEvidence, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'evidence',
      problems: [{
        category: 'duplicate_charge_or_effect',
        summary: 'I received two provider notifications and may have been charged or affected twice.',
        claimSource: 'customer',
        causality: 'unknown',
        resolution: 'not_adjudicated',
        decisionAuthority: 'not_assigned',
        claims: [{
          claimSource: 'customer',
          causalityPosition: 'reported_problem',
        }],
      }],
    })
    if (reported.kind !== 'problem_reported') throw new Error('duplicate-effect report was not accepted')
    const attemptRef = reported.problem.affected.attemptRef
    if (attemptRef === undefined) throw new Error('duplicate-effect report did not bind an exact attempt')
    const affectedOwner = await businessOwnerForAttempt(backend, attemptRef)
    await expect(affectedOwner.action(api.customerRequestApplication.readRouteProblemForBusiness, {
      reportRef: reported.reportRef,
    })).resolves.toMatchObject({
      kind: 'business_problem',
      reportRef: reported.reportRef,
      category: 'duplicate_charge_or_effect',
      customerStatement: 'I received two provider notifications and may have been charged or affected twice.',
      causality: 'unknown',
      resolution: 'not_adjudicated',
      decisionAuthority: 'not_assigned',
    })
    await expect(support.action(api.customerRequestApplication.exportRouteProblemForSupport, {
      reportRef: reported.reportRef,
    })).resolves.toMatchObject({
      kind: 'problem_export',
      reportRef: reported.reportRef,
      category: 'duplicate_charge_or_effect',
      claimSource: 'customer',
      causality: 'unknown',
      resolution: 'not_adjudicated',
      decisionAuthority: 'not_assigned',
    })
    await backend.run(async (ctx) => {
      expect(await ctx.db.query('customerRequestRouteProblemReports').collect()).toHaveLength(1)
    })
  })

  it('tracks an authenticated support question and customer reply without assigning remedy authority', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(5_000)
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const support = await supportAdmin(backend)
    const reviewer = await reviewerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'problem-status-loop')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:problem-status-loop',
    })
    const reported = await admin.action(api.customerRequestApplication.reportRouteProblem, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'problem:status-loop',
      category: 'incorrect_result',
      summary: 'The first result does not match the confirmed constraint.',
      affectedStep: 1,
      evidenceReceiptRefs: [],
      visibility: 'customer_and_ae_only',
    })
    if (reported.kind !== 'problem_reported') throw new Error('problem report was not accepted')

    await expect(support.action(api.customerRequestApplication.listRouteProblemsForSupport, {
      limit: 10,
    })).resolves.toMatchObject({
      kind: 'allowed',
      rows: [{
        reportRef: reported.reportRef,
        requestRef: confirmed.requestRef,
        version: 0,
        state: 'received',
        nextActor: 'ae',
      }],
    })
    await expect(backend.action(api.customerRequestApplication.exportRouteProblemForSupport, {
      reportRef: reported.reportRef,
    })).resolves.toEqual({
      kind: 'denied',
      reason: 'missing_membership',
    })
    const supportExport = await support.action(
      api.customerRequestApplication.exportRouteProblemForSupport,
      { reportRef: reported.reportRef },
    )
    expect(supportExport).toMatchObject({
      kind: 'problem_export',
      reportRef: reported.reportRef,
      requestRef: confirmed.requestRef,
      version: 0,
      state: 'received',
      category: 'incorrect_result',
      summary: 'The first result does not match the confirmed constraint.',
      claimSource: 'customer',
      causality: 'unknown',
      resolution: 'not_adjudicated',
      nextActor: 'ae',
      decisionAuthority: 'not_assigned',
      visibility: 'customer_and_ae_only',
      affected: { step: 1 },
      evidence: [],
      history: [{
        version: 0,
        state: 'received',
        source: 'customer',
        message: 'The first result does not match the confirmed constraint.',
        recordedAt: 5_000,
      }],
      reconstruction: {
        request: {
          revision: 1,
          ordinaryRequest: 'Resolve a service reference and prepare its quote',
        },
        choice: {
          businesses: ['Route admission-resolver', 'Route admission-quoter'],
          selectedBecause: [
            'All 2 registered steps can provide the requested result.',
            'The confirmed option stays within AUD 10.00.',
          ],
          confirmedAt: 5_000,
          validUntil: expect.any(Number),
        },
        authority: {
          state: 'current',
          source: 'customer_confirmation',
          spend: {
            limit: { currency: 'AUD', amountMinor: 1_000 },
            admitted: { currency: 'AUD', amountMinor: 300 },
          },
          dataSharing: expect.arrayContaining([
            expect.objectContaining({
              classification: 'public',
              recipient: 'Route admission-resolver',
              purposes: ['resolve_service_reference'],
              releaseState: 'authorized',
            }),
            expect.objectContaining({
              classification: 'public',
              recipient: 'Carrier network',
              purposes: ['prepare_service_quote'],
              releaseState: 'authorized',
            }),
          ]),
          effects: expect.arrayContaining([
            expect.objectContaining({
              class: 'data_release', reversibility: 'irreversible', releaseState: 'authorized',
            }),
          ]),
        },
        execution: {
          state: 'queued',
          completedSteps: 0,
          totalSteps: 2,
          duplicateRisk: 'protected_by_required_idempotency',
          steps: [
            expect.objectContaining({
              step: 1,
              business: 'Route admission-resolver',
              state: 'queued',
            }),
            expect.objectContaining({
              step: 2,
              business: 'Route admission-quoter',
              state: 'blocked',
            }),
          ],
        },
        recovery: {
          nextActor: 'ae',
          nextAction: 'await_status_update',
          retry: 'not_needed',
        },
      },
    })
    expect(JSON.stringify(supportExport)).not.toMatch(
      /principalId|runRef|mandateRef|attemptRef|commandKey|commandDigest|binding|transport|credential/u,
    )
    await expect(reviewer.action(api.customerRequestApplication.updateRouteProblemStatus, {
      reportRef: reported.reportRef,
      expectedVersion: 0,
      idempotencyKey: 'reviewer:status-loop',
      state: 'investigating',
      publicMessage: 'A reviewer must not write support status.',
    })).resolves.toEqual({ kind: 'refused', reason: 'authority_denied' })
    now.mockReturnValue(6_000)
    const supportUpdate = await support.action(api.customerRequestApplication.updateRouteProblemStatus, {
      reportRef: reported.reportRef,
      expectedVersion: 0,
      idempotencyKey: 'support:status-loop',
      state: 'waiting_for_customer',
      publicMessage: 'Please identify the constraint that the result did not meet.',
    })
    expect(supportUpdate).toMatchObject({
      kind: 'problem_status_updated',
      version: 1,
      state: 'waiting_for_customer',
      nextActor: 'customer',
    })
    await expect(support.action(api.customerRequestApplication.updateRouteProblemStatus, {
      reportRef: reported.reportRef,
      expectedVersion: 0,
      idempotencyKey: 'support:status-loop',
      state: 'waiting_for_customer',
      publicMessage: 'Please identify the constraint that the result did not meet.',
    })).resolves.toEqual(supportUpdate)
    await expect(support.action(api.customerRequestApplication.updateRouteProblemStatus, {
      reportRef: reported.reportRef,
      expectedVersion: 0,
      idempotencyKey: 'support:status-loop',
      state: 'investigating',
      publicMessage: 'Changed replay.',
    })).resolves.toEqual({
      kind: 'conflict',
      reportRef: reported.reportRef,
      reason: 'idempotency_key_reused',
    })
    await expect(support.action(api.customerRequestApplication.updateRouteProblemStatus, {
      reportRef: reported.reportRef,
      expectedVersion: 0,
      idempotencyKey: 'support:stale-status-loop',
      state: 'investigating',
      publicMessage: 'This command was based on an older version.',
    })).resolves.toEqual({
      kind: 'conflict',
      reportRef: reported.reportRef,
      reason: 'stale_version',
    })

    now.mockReturnValue(7_000)
    const replied = await admin.action(api.customerRequestApplication.replyRouteProblem, {
      requestRef: confirmed.requestRef,
      reportRef: reported.reportRef,
      expectedVersion: 1,
      idempotencyKey: 'customer:status-loop',
      message: 'The result exceeded the confirmed maximum by 25 dollars.',
    })
    expect(replied).toMatchObject({
      kind: 'problem_reply_recorded',
      reportRef: reported.reportRef,
      version: 2,
      state: 'investigating',
      nextActor: 'ae',
      nextAction: 'await_status_update',
      decisionAuthority: 'not_assigned',
    })
    await expect(admin.action(api.customerRequestApplication.replyRouteProblem, {
      requestRef: confirmed.requestRef,
      reportRef: reported.reportRef,
      expectedVersion: 1,
      idempotencyKey: 'customer:status-loop',
      message: 'The result exceeded the confirmed maximum by 25 dollars.',
    })).resolves.toEqual(replied)

    const exported = await admin.action(api.customerRequestApplication.exportRouteEvidence, {
      requestRef: confirmed.requestRef,
    })
    expect(exported).toMatchObject({
      kind: 'evidence',
      problems: [{
        reportRef: reported.reportRef,
        version: 2,
        state: 'investigating',
        nextActor: 'ae',
        nextAction: 'await_status_update',
        decisionAuthority: 'not_assigned',
        history: [
          {
            version: 0,
            state: 'received',
            source: 'customer',
            message: 'The first result does not match the confirmed constraint.',
            recordedAt: 5_000,
          },
          {
            version: 1,
            state: 'waiting_for_customer',
            source: 'ae_support',
            message: 'Please identify the constraint that the result did not meet.',
            recordedAt: 6_000,
          },
          {
            version: 2,
            state: 'investigating',
            source: 'customer',
            message: 'The result exceeded the confirmed maximum by 25 dollars.',
            recordedAt: 7_000,
          },
        ],
      }],
    })
  })

  it('records an affected business claim without turning it into causality or remedy authority', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(8_000)
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const support = await supportAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'business-problem-claim')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'run:business-problem-claim',
    })
    const firstLease = await backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:business-problem-claim',
      leaseDurationMs: 10_000,
    })
    if (firstLease.kind !== 'leased') throw new Error('business problem step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: firstLease.dispatch.dispatchRef,
      attemptRef: firstLease.dispatch.attemptRef,
      workerId: 'worker:business-problem-claim',
    })
    await backend.mutation(internal.customerRequestRouteExecution.markAccepted, {
      attemptRef: firstLease.dispatch.attemptRef,
      operationKeyDigest: firstLease.dispatch.operationKeyDigest,
    })
    await backend.mutation(internal.customerRequestRouteExecution.recordOutcome, {
      attemptRef: firstLease.dispatch.attemptRef,
      operationKeyDigest: firstLease.dispatch.operationKeyDigest,
      outcome: { kind: 'succeeded', outputJson: JSON.stringify({ serviceReference: 'service:business-claim' }) },
    })
    const evidenceBeforeReport = await admin.action(api.customerRequestApplication.exportRouteEvidence, {
      requestRef: confirmed.requestRef,
    })
    if (evidenceBeforeReport.kind !== 'evidence' || evidenceBeforeReport.steps[0]?.evidence[0] === undefined) {
      throw new Error('business problem evidence was not recorded')
    }
    const receiptRef = evidenceBeforeReport.steps[0].evidence[0].receiptRef
    const reported = await admin.action(api.customerRequestApplication.reportRouteProblem, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'problem:business-problem-claim',
      category: 'incorrect_result',
      summary: 'The first business result did not satisfy the confirmed request.',
      affectedStep: 1,
      evidenceReceiptRefs: [receiptRef],
      visibility: 'share_with_affected_business',
    })
    if (reported.kind !== 'problem_reported') throw new Error('business problem report was not accepted')

    const affectedOwner = await businessOwnerForAttempt(backend, firstLease.dispatch.attemptRef)
    const unrelatedOwner = (await publishedBusinessOwner(backend, 'unrelated-problem-claim')).owner
    const command = {
      reportRef: reported.reportRef,
      idempotencyKey: 'business-claim:first',
      causalityPosition: 'uncertain' as const,
      statement: 'Our recorded output is authentic, but it does not establish which step caused the final mismatch.',
      evidenceReceiptRefs: [receiptRef],
    }
    await expect(unrelatedOwner.action(
      api.customerRequestApplication.readRouteProblemForBusiness,
      { reportRef: reported.reportRef },
    )).resolves.toEqual({ kind: 'refused', reason: 'authority_denied' })
    await expect(affectedOwner.action(
      api.customerRequestApplication.readRouteProblemForBusiness,
      { reportRef: reported.reportRef },
    )).resolves.toMatchObject({
      kind: 'business_problem',
      reportRef: reported.reportRef,
      category: 'incorrect_result',
      customerStatement: 'The first business result did not satisfy the confirmed request.',
      causality: 'unknown',
      resolution: 'not_adjudicated',
      decisionAuthority: 'not_assigned',
      evidence: [{ receiptRef }],
      availableEvidence: [{ receiptRef }],
      businessClaims: [],
    })
    await expect(unrelatedOwner.action(
      api.customerRequestApplication.recordRouteProblemBusinessReport,
      command,
    )).resolves.toEqual({ kind: 'refused', reason: 'authority_denied' })
    await expect(affectedOwner.action(
      api.customerRequestApplication.recordRouteProblemBusinessReport,
      { ...command, idempotencyKey: 'business-claim:invented-evidence', evidenceReceiptRefs: ['evidence:invented'] },
    )).resolves.toEqual({ kind: 'refused', reason: 'evidence_not_found' })

    now.mockReturnValue(9_000)
    const recorded = await affectedOwner.action(
      api.customerRequestApplication.recordRouteProblemBusinessReport,
      command,
    )
    expect(recorded).toMatchObject({
      kind: 'business_report_recorded',
      reportRef: reported.reportRef,
      causalityPosition: 'uncertain',
      claimSource: 'business',
      causality: 'unknown',
      resolution: 'not_adjudicated',
      decisionAuthority: 'not_assigned',
      evidence: [{ receiptRef }],
      recordedAt: 9_000,
    })
    await expect(affectedOwner.action(
      api.customerRequestApplication.recordRouteProblemBusinessReport,
      command,
    )).resolves.toEqual(recorded)
    await expect(affectedOwner.action(
      api.customerRequestApplication.recordRouteProblemBusinessReport,
      { ...command, statement: 'Changed replay.' },
    )).resolves.toEqual({ kind: 'conflict', reason: 'idempotency_key_reused' })

    const customerExport = await admin.action(api.customerRequestApplication.exportRouteEvidence, {
      requestRef: confirmed.requestRef,
    })
    expect(customerExport).toMatchObject({
      kind: 'evidence',
      problems: [{
        reportRef: reported.reportRef,
        causality: 'unknown',
        resolution: 'not_adjudicated',
        claims: [
          {
            claimSource: 'customer',
            causalityPosition: 'reported_problem',
            statement: 'The first business result did not satisfy the confirmed request.',
            evidence: [{ receiptRef }],
          },
          {
            claimSource: 'business',
            causalityPosition: 'uncertain',
            statement: 'Our recorded output is authentic, but it does not establish which step caused the final mismatch.',
            evidence: [{ receiptRef }],
            recordedAt: 9_000,
          },
        ],
      }],
    })
    await expect(support.action(api.customerRequestApplication.exportRouteProblemForSupport, {
      reportRef: reported.reportRef,
    })).resolves.toMatchObject({
      kind: 'problem_export',
      causality: 'unknown',
      resolution: 'not_adjudicated',
      claims: [
        { claimSource: 'customer', causalityPosition: 'reported_problem' },
        { claimSource: 'business', causalityPosition: 'uncertain' },
      ],
    })

    const privateReport = await admin.action(api.customerRequestApplication.reportRouteProblem, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'problem:private-business-problem-claim',
      category: 'incorrect_result',
      summary: 'Keep this report between the customer and AE.',
      affectedStep: 1,
      evidenceReceiptRefs: [receiptRef],
      visibility: 'customer_and_ae_only',
    })
    if (privateReport.kind !== 'problem_reported') throw new Error('private report was not accepted')
    await expect(affectedOwner.action(
      api.customerRequestApplication.readRouteProblemForBusiness,
      { reportRef: privateReport.reportRef },
    )).resolves.toEqual({ kind: 'refused', reason: 'sharing_not_authorized' })
    await expect(affectedOwner.action(
      api.customerRequestApplication.recordRouteProblemBusinessReport,
      { ...command, reportRef: privateReport.reportRef, idempotencyKey: 'business-claim:private' },
    )).resolves.toEqual({ kind: 'refused', reason: 'sharing_not_authorized' })
  })

  it('refuses a problem report that names another step evidence receipt', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(4_100)
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'problem-evidence-scope')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:problem-evidence-scope',
    })

    await expect(admin.action(api.customerRequestApplication.reportRouteProblem, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'problem:evidence-scope',
      category: 'incorrect_result',
      summary: 'The first step appears wrong.',
      affectedStep: 1,
      evidenceReceiptRefs: ['evidence:receipt-from-another-step'],
      visibility: 'customer_and_ae_only',
    })).resolves.toMatchObject({
      kind: 'refused',
      reason: 'evidence_not_found',
    })
  })

  it('replays an unchanged historical problem command after privacy fields are introduced', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(4_200)
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'legacy-problem-replay')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:legacy-problem-replay',
    })
    const idempotencyKey = 'problem:legacy-replay'
    const category = 'incorrect_result' as const
    const summary = 'The result is wrong.'
    await backend.run(async (ctx) => {
      const head = await ctx.db.query('customerRequestRouteRunHeads')
        .withIndex('by_requestId', (query) => query.eq('requestId', confirmed.requestRef)).unique()
      if (head === null) throw new Error('missing run head')
      const commandKey = `route-problem:v1:${canonicalDigest({
        principalId: head.principalId, requestId: confirmed.requestRef, idempotencyKey,
      })}`
      await ctx.db.insert('customerRequestRouteProblemReports', {
        reportRef: 'problem:legacy', commandKey,
        commandDigest: canonicalDigest({
          requestId: confirmed.requestRef, principalId: head.principalId,
          idempotencyKey, category, summary,
        }),
        principalId: head.principalId, requestId: confirmed.requestRef,
        runRef: head.currentRunRef, category, summary, createdAt: 4_100,
      })
    })

    await expect(admin.action(api.customerRequestApplication.reportRouteProblem, {
      requestRef: confirmed.requestRef, idempotencyKey, category, summary,
    })).resolves.toMatchObject({
      kind: 'problem_reported', reportRef: 'problem:legacy', reportedAt: 4_100,
      problem: { visibility: 'customer_and_ae_only', evidence: [] },
    })
  })

  it('refuses to report cancellation after a business step was released', async () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(20_000)
      .mockReturnValueOnce(20_100)
      .mockReturnValue(20_200)
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'cancel-too-late')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:cancel-too-late',
    })
    const lease = await backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:cancel-too-late', leaseDurationMs: 10_000,
    })
    if (lease.kind !== 'leased') throw new Error('cancel-too-late route step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
      workerId: 'worker:cancel-too-late',
    })
    const result = await admin.action(api.customerRequestApplication.cancelRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'cancel:too-late',
    })
    expect(result).toMatchObject({
      kind: 'request', state: 'in_progress', nextAction: 'wait',
      progress: { current: { state: 'contacting' } },
      activity: {
        cancellation: {
          state: 'not_available',
          reason: 'business_step_released',
          changedAt: 20_200,
          requestedAt: 20_200,
        },
      },
    })
    expect(result).not.toMatchObject({ state: 'cancelled' })
    vi.mocked(Date.now).mockReturnValue(30_000)
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      activity: {
        cancellation: {
          state: 'not_available',
          changedAt: 20_200,
          requestedAt: 20_200,
        },
      },
    })
  })

  it('keeps a leased step distinct from actual business contact', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'step-ready-distinction')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:step-ready-distinction',
    })
    const lease = await backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:step-ready-distinction', leaseDurationMs: 10_000,
    })
    if (lease.kind !== 'leased') throw new Error('step-ready route step was not leased')

    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      progress: { current: { step: 1, state: 'ready_to_contact' } },
      activity: {
        actor: 'ae',
        certainty: 'confirmed',
        cancellation: { state: 'available' },
      },
    })

    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
      workerId: 'worker:step-ready-distinction',
    })
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      progress: { current: { step: 1, state: 'contacting' } },
      activity: {
        actor: 'ae',
        certainty: 'pending',
        cancellation: { state: 'not_available', reason: 'business_step_released' },
      },
    })
  })

  it('stops unreleased downstream work when cancellation is requested during an in-flight step', async () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(40_000)
      .mockReturnValueOnce(40_100)
      .mockReturnValue(40_200)
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(
      backend, admin, 'cancel-after-current', { adapterCancellation: true },
    )
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:cancel-after-current',
    })
    const firstLease = await backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:cancel-after-current', leaseDurationMs: 10_000,
    })
    if (firstLease.kind !== 'leased') throw new Error('cancel-after-current route step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: firstLease.dispatch.dispatchRef,
      attemptRef: firstLease.dispatch.attemptRef,
      workerId: 'worker:cancel-after-current',
    })
    await backend.mutation(internal.customerRequestRouteExecution.markAccepted, {
      attemptRef: firstLease.dispatch.attemptRef,
      operationKeyDigest: firstLease.dispatch.operationKeyDigest,
    })

    await expect(admin.action(api.customerRequestApplication.cancelRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'cancel:after-current',
      mode: 'after_current_step',
    })).resolves.toMatchObject({
      kind: 'request', state: 'in_progress',
      activity: {
        cancellation: {
          state: 'not_available',
          reason: 'business_step_released',
          requestedAt: 40_200,
        },
      },
    })
    await expect(admin.action(api.customerRequestApplication.cancelRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'cancel:after-current',
      mode: 'current_and_downstream',
    })).resolves.toMatchObject({
      kind: 'conflict', reason: 'idempotency_key_reused',
    })

    await expect(backend.mutation(internal.customerRequestRouteExecution.recordOutcome, {
      attemptRef: firstLease.dispatch.attemptRef,
      operationKeyDigest: firstLease.dispatch.operationKeyDigest,
      outcome: { kind: 'succeeded', outputJson: JSON.stringify({ serviceReference: 'service:stopped' }) },
    })).resolves.toMatchObject({
      kind: 'cancelled',
      run: { state: 'cancelled', completedSteps: 1, currentPosition: 1 },
    })
    await expect(backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:must-not-release-second', leaseDurationMs: 10_000,
    })).resolves.toEqual({ kind: 'none' })
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'cancelled', nextAction: 'revise_request',
      progress: { completed: 1, total: 2 },
      activity: { cancellation: { state: 'stopped' } },
    })
    await expect(admin.action(api.customerRequestApplication.cancelRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'cancel:after-current',
      mode: 'after_current_step',
    })).resolves.toMatchObject({
      kind: 'request', state: 'cancelled', progress: { completed: 1, total: 2 },
    })
    await expect(admin.action(api.customerRequestApplication.exportRouteEvidence, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'evidence', state: 'cancelled',
      steps: [{ step: 1, state: 'completed' }],
    })
    await backend.run(async (ctx) => {
      const attempts = await ctx.db.query('customerRequestRouteStepAttempts').collect()
      const runs = await ctx.db.query('customerRequestRouteRuns').collect()
      const disclosures = await ctx.db.query('customerRequestRouteDataReservations').collect()
      expect(attempts).toHaveLength(1)
      expect(attempts[0]).toMatchObject({ position: 1, state: 'succeeded' })
      expect(disclosures).toHaveLength(1)
      expect(disclosures[0]).toMatchObject({
        recipient: { kind: 'registered_binding', bindingId: 'binding:route:admission-resolver' },
      })
      expect(runs).toHaveLength(1)
      expect(runs[0]).toMatchObject({
        state: 'cancelled', completedSteps: 1, currentPosition: 1,
      })
      const cancellations = await ctx.db.query('customerRequestRouteCancellationCommands').collect()
      expect(cancellations).toHaveLength(1)
      expect(cancellations[0]).toMatchObject({ result: 'too_late', committedAt: 40_200 })
      expect(await ctx.db.query('customerRequestRouteCancellationAttempts').collect()).toHaveLength(0)
    })
  })

  it('claims one adapter cancellation attempt and replays without scheduling another request', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(50_000)
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(
      backend, admin, 'adapter-cancel-pending', { adapterCancellation: true },
    )
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:adapter-cancel-pending',
    })
    const lease = await backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:adapter-cancel-pending', leaseDurationMs: 10_000,
    })
    if (lease.kind !== 'leased') throw new Error('adapter cancellation step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
      workerId: 'worker:adapter-cancel-pending',
    })
    await backend.mutation(internal.customerRequestRouteExecution.markAccepted, {
      attemptRef: lease.dispatch.attemptRef,
      operationKeyDigest: lease.dispatch.operationKeyDigest,
    })

    const first = await admin.action(api.customerRequestApplication.cancelRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'cancel:adapter-pending',
    })
    await backend.run(async (ctx) => {
      const command = await ctx.db.query('customerRequestRouteCancellationCommands').unique()
      if (command === null) throw new Error('cancellation command missing')
      await ctx.db.replace(command._id, {
        commandKey: command.commandKey,
        commandDigest: canonicalDigest({
          requestId: command.requestId,
          principalId: command.principalId,
          idempotencyKey: 'cancel:adapter-pending',
        }),
        principalId: command.principalId,
        requestId: command.requestId,
        runRef: command.runRef,
        result: command.result,
        ...(command.boundaryChangedAt === undefined
          ? {}
          : { boundaryChangedAt: command.boundaryChangedAt }),
        committedAt: command.committedAt,
      })
    })
    const replay = await admin.action(api.customerRequestApplication.cancelRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'cancel:adapter-pending',
    })
    expect(first).toMatchObject({
      kind: 'request', state: 'in_progress',
      activity: {
        cancellation: {
          state: 'pending',
          requestedAt: 50_000,
          nextCheckAt: 80_000,
        },
      },
    })
    expect(replay).toEqual(first)
    await backend.run(async (ctx) => {
      const attempts = await ctx.db.query('customerRequestRouteCancellationAttempts').take(10)
      const commands = await ctx.db.query('customerRequestRouteCancellationCommands').take(10)
      expect(attempts).toHaveLength(1)
      expect(attempts[0]).toMatchObject({
        attemptRef: lease.dispatch.attemptRef,
        operationKeyDigest: lease.dispatch.operationKeyDigest,
        state: 'pending',
        requestedAt: 50_000,
      })
      expect(commands.filter(({ result }) => result === 'pending')).toHaveLength(1)
    })
    const cancellationRef = await backend.run(async (ctx) => {
      const attempt = await ctx.db.query('customerRequestRouteCancellationAttempts').first()
      if (attempt === null) throw new Error('cancellation attempt missing')
      return attempt.cancellationRef
    })
    await expect(backend.mutation(internal.customerRequestRouteExecution.recordOutcome, {
      attemptRef: lease.dispatch.attemptRef,
      operationKeyDigest: lease.dispatch.operationKeyDigest,
      outcome: {
        kind: 'succeeded',
        outputJson: JSON.stringify({ serviceReference: 'service:cancel-pending' }),
      },
    })).resolves.toMatchObject({
      kind: 'replayed',
      run: {
        state: 'running',
        completedSteps: 1,
        currentPosition: 1,
        currentState: 'succeeded',
        cancellationAttempt: { state: 'pending' },
      },
    })
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request',
      state: 'in_progress',
      progress: {
        completed: 1,
        total: 2,
        current: { step: 1, state: 'completed' },
      },
      activity: {
        actor: 'ae',
        certainty: 'confirmed',
        cancellation: { state: 'pending' },
      },
    })
    await expect(backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:must-not-release-while-cancel-pending',
      leaseDurationMs: 10_000,
    })).resolves.toEqual({ kind: 'none' })
    const unknown = await backend.mutation(
      internal.customerRequestRouteExecution.resolveCancellationAttempt,
      {
        cancellationRef,
        observation: {
          disposition: 'unknown',
          requestDigest: 'sha256:cancellation-request',
          failureCode: 'network_timeout',
        },
      },
    )
    const replayedUnknown = await backend.mutation(
      internal.customerRequestRouteExecution.resolveCancellationAttempt,
      {
        cancellationRef,
        observation: {
          disposition: 'accepted',
          requestDigest: 'sha256:changed-replay',
        },
      },
    )
    expect(unknown).toMatchObject({
      kind: 'recorded',
      run: {
        state: 'running',
        completedSteps: 1,
        cancellationAttempt: {
          state: 'unknown',
          requestedAt: 50_000,
          observedAt: 50_000,
          nextCheckAt: 80_000,
        },
      },
    })
    expect(replayedUnknown).toMatchObject({
      kind: 'replayed',
      run: { state: 'running', cancellationAttempt: { state: 'unknown' } },
    })
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'in_progress',
      activity: {
        actor: 'ae',
        certainty: 'unknown',
        retry: 'blocked_until_reconciled',
        cancellation: { state: 'unknown' },
        safeNextAction: 'wait_for_evidence',
      },
    })
  })

  it('stops the current route when the exact adapter cancellation is accepted', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(60_000)
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(
      backend, admin, 'adapter-cancel-accepted', { adapterCancellation: true },
    )
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:adapter-cancel-accepted',
    })
    const lease = await backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:adapter-cancel-accepted', leaseDurationMs: 10_000,
    })
    if (lease.kind !== 'leased') throw new Error('adapter cancellation step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
      workerId: 'worker:adapter-cancel-accepted',
    })
    await admin.action(api.customerRequestApplication.cancelRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'cancel:adapter-accepted',
    })
    const cancellationRef = await backend.run(async (ctx) => {
      const attempt = await ctx.db.query('customerRequestRouteCancellationAttempts').first()
      if (attempt === null) throw new Error('cancellation attempt missing')
      return attempt.cancellationRef
    })
    await expect(backend.mutation(
      internal.customerRequestRouteExecution.resolveCancellationAttempt,
      {
        cancellationRef,
        observation: {
          disposition: 'accepted',
          requestDigest: 'sha256:cancellation-request',
          responseDigest: 'sha256:cancellation-response',
          providerReference: 'provider-cancel:accepted',
        },
      },
    )).resolves.toMatchObject({
      kind: 'recorded',
      run: { state: 'cancelled', currentState: 'cancelled', completedSteps: 0 },
    })
    await expect(backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:must-not-release-after-provider-cancel', leaseDurationMs: 10_000,
    })).resolves.toEqual({ kind: 'none' })
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'cancelled',
      progress: { completed: 0, total: 2 },
      activity: { cancellation: { state: 'stopped' } },
    })
  })

  it('continues exactly once after a provider rejects cancellation', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(70_000)
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(
      backend, admin, 'adapter-cancel-rejected', { adapterCancellation: true },
    )
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:adapter-cancel-rejected',
    })
    const lease = await backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:adapter-cancel-rejected', leaseDurationMs: 10_000,
    })
    if (lease.kind !== 'leased') throw new Error('adapter cancellation step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
      workerId: 'worker:adapter-cancel-rejected',
    })
    await admin.action(api.customerRequestApplication.cancelRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'cancel:adapter-rejected',
    })
    await backend.mutation(internal.customerRequestRouteExecution.recordOutcome, {
      attemptRef: lease.dispatch.attemptRef,
      operationKeyDigest: lease.dispatch.operationKeyDigest,
      outcome: {
        kind: 'succeeded',
        outputJson: JSON.stringify({ serviceReference: 'service:cancel-rejected' }),
      },
    })
    const cancellationRef = await backend.run(async (ctx) => {
      const attempt = await ctx.db.query('customerRequestRouteCancellationAttempts').first()
      if (attempt === null) throw new Error('cancellation attempt missing')
      return attempt.cancellationRef
    })
    await expect(backend.mutation(
      internal.customerRequestRouteExecution.resolveCancellationAttempt,
      {
        cancellationRef,
        observation: {
          disposition: 'rejected',
          requestDigest: 'sha256:cancellation-request',
          responseDigest: 'sha256:cancellation-response',
          reason: 'work_already_completed',
        },
      },
    )).resolves.toMatchObject({
      kind: 'recorded',
      run: {
        state: 'running',
        completedSteps: 1,
        currentPosition: 2,
        currentState: 'queued',
      },
    })
    await expect(backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:continue-after-cancel-rejection', leaseDurationMs: 10_000,
    })).resolves.toMatchObject({
      kind: 'leased',
      dispatch: { position: 2 },
    })
    await backend.run(async (ctx) => {
      const commands = await ctx.db.query('customerRequestRouteCancellationCommands').take(10)
      expect(commands.filter(({ result }) => result === 'rejected')).toHaveLength(1)
    })
  })

  it('uses the same run, lease, validation, and completion machinery for one step', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const current = await committedOneStepAdmissionRoute(backend, admin)
    const compared = await admin.action(api.customerRequestApplication.compare, {
      requestRef: current.aggregate.snapshot.requestId,
      revision: current.aggregate.snapshot.revision,
      idempotencyKey: 'compare:one-step-run',
    })
    if (compared.kind !== 'request' || compared.decision?.routes[0] === undefined) {
      throw new Error('one-step customer route missing')
    }
    await admin.action(api.customerRequestApplication.confirmRoute, {
      requestRef: compared.requestRef,
      revision: compared.revision,
      routeRef: compared.decision.routes[0].routeRef,
      idempotencyKey: 'confirm:one-step-run',
    })
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: compared.requestRef,
      idempotencyKey: 'run:one-step-run',
    })
    const lease = await backend.mutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
      workerId: 'worker:one-step', leaseDurationMs: 10_000,
    })
    if (lease.kind !== 'leased') throw new Error('one-step route was not leased')
    expect(lease.dispatch.position).toBe(1)
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
      workerId: 'worker:one-step',
    })
    await expect(backend.mutation(internal.customerRequestRouteExecution.recordOutcome, {
      attemptRef: lease.dispatch.attemptRef,
      operationKeyDigest: lease.dispatch.operationKeyDigest,
      outcome: { kind: 'succeeded', outputJson: JSON.stringify({ serviceReference: 'service:one-step' }) },
    })).resolves.toMatchObject({
      kind: 'completed', run: { totalSteps: 1, completedSteps: 1, currentPosition: 1 },
    })
  })

  it('keeps prior runs as history and resumes only the newly confirmed replacement', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'replacement-run')
    if (confirmed.confirmation === undefined) throw new Error('replacement confirmation missing')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:replacement:one',
    })
    const currentMandate = await admin.query(internal.customerRequestRouteMandate.getCurrent, {
      requestId: confirmed.requestRef,
    })
    if (currentMandate.kind !== 'active') throw new Error('replacement current mandate missing')
    await admin.mutation(internal.customerRequestRouteMandate.revoke, {
      requestId: confirmed.requestRef,
      mandateRef: currentMandate.mandate.mandateRef,
      idempotencyKey: 'revoke:replacement:one',
    })
    const replacement = await admin.action(api.customerRequestApplication.confirmRoute, {
      requestRef: confirmed.requestRef,
      revision: confirmed.revision,
      routeRef: confirmed.confirmation.route.routeRef,
      idempotencyKey: 'confirm:replacement:two',
    })
    expect(replacement).toMatchObject({ kind: 'request', state: 'route_confirmed' })
    const restarted = await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:replacement:two',
    })
    expect(restarted).toMatchObject({
      kind: 'request', state: 'in_progress', progress: { current: { step: 1, state: 'queued' } },
    })
    await backend.run(async (ctx) => {
      const runs = await ctx.db.query('customerRequestRouteRuns').collect()
      const head = await ctx.db.query('customerRequestRouteRunHeads').unique()
      const outbox = await ctx.db.query('customerRequestRouteDispatchOutbox').collect()
      expect(runs).toHaveLength(2)
      expect(runs.map(({ state }) => state).sort()).toEqual(['cancelled', 'queued'])
      expect(head?.currentRunRef).toBe(runs.find(({ state }) => state === 'queued')?.runRef)
      expect(outbox.map(({ state }) => state).sort()).toEqual(['cancelled', 'pending'])
    })
  })

  it('lets an external agent confirm and resume the same displayed option with command-bound authority', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend)
    const current = await committedTwoStepAdmissionRoute(backend, admin)
    const compared = await admin.action(api.customerRequestApplication.compare, {
      requestRef: current.aggregate.snapshot.requestId,
      revision: current.aggregate.snapshot.revision,
      idempotencyKey: 'compare:two-step-agent-confirmation',
    })
    if (compared.kind !== 'request' || compared.decision?.routes[0] === undefined) {
      throw new Error('external confirmation preview missing')
    }
    const principal = {
      principalId: current.aggregate.snapshot.principalId,
      ownerId: 'owner:external-confirmation',
      credentialId: 'credential:external-confirmation',
      scopes: ['customer_requests:create'],
    }
    const key = 'external-confirmation-key-that-is-long-enough'
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', key)
    vi.stubEnv('CLERK_JWT_ISSUER_DOMAIN', 'https://identity.example')
    const command = {
      requestRef: compared.requestRef,
      revision: compared.revision,
      routeRef: compared.decision.routes[0].routeRef,
      idempotencyKey: 'confirm:two-step-agent',
    }
    const serviceAuth = await createCustomerRequestServiceAssertion({
      key, operation: 'confirm', command, principal, issuedAt: Date.now(),
    })
    await expect(backend.action(api.customerRequestApplication.confirmRoute, {
      ...command,
      routeRef: `${command.routeRef}:tampered`,
      serviceAuth: { ...serviceAuth, scopes: [...serviceAuth.scopes] },
    })).resolves.toEqual({ kind: 'refused', reason: 'authentication_required' })
    const confirmed = await backend.action(api.customerRequestApplication.confirmRoute, {
      ...command, serviceAuth: { ...serviceAuth, scopes: [...serviceAuth.scopes] },
    })
    expect(confirmed).toMatchObject({
      kind: 'request', state: 'route_confirmed', nextAction: 'inspect_confirmation',
      confirmation: { route: { routeRef: command.routeRef } },
    })
    const resumeCommand = { requestRef: compared.requestRef }
    const resumeAuth = await createCustomerRequestServiceAssertion({
      key, operation: 'resume', command: resumeCommand, principal, issuedAt: Date.now(),
    })
    const agentResumed = await backend.action(api.customerRequestApplication.resume, {
      ...resumeCommand, serviceAuth: { ...resumeAuth, scopes: [...resumeAuth.scopes] },
    })
    expect(agentResumed).toMatchObject({
      ...confirmed,
      recovery: {
        state: 'restored',
        restoredAt: expect.any(Number),
        workRestarted: false,
      },
    })
    const owner = backend.withIdentity({
      subject: principal.ownerId,
      issuer: 'https://identity.example',
      tokenIdentifier: `https://identity.example|${principal.ownerId}`,
    })
    await expect(owner.action(api.customerRequestApplication.resume, resumeCommand)).resolves.toMatchObject({
      ...confirmed,
      recovery: {
        state: 'restored',
        restoredAt: expect.any(Number),
        workRestarted: false,
      },
    })
    const runCommand = {
      requestRef: compared.requestRef,
      idempotencyKey: 'run:two-step-agent',
    }
    const runAuth = await createCustomerRequestServiceAssertion({
      key, operation: 'run', command: runCommand, principal, issuedAt: Date.now(),
    })
    await expect(backend.action(api.customerRequestApplication.runRoute, {
      ...runCommand, serviceAuth: { ...runAuth, scopes: [...runAuth.scopes] },
    })).resolves.toMatchObject({
      kind: 'request', state: 'in_progress', nextAction: 'wait',
      progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
    })
    await backend.run(async (ctx) => {
      expect(await ctx.db.query('customerRequestRouteStepReservations').collect()).toHaveLength(1)
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
    const preview = await customer.action(api.customerRequestApplication.resume, {
      requestRef: submitted.requestRef,
    })
    if (preview.kind !== 'request' || preview.decision?.routes[0] === undefined) {
      throw new Error('single route customer preview missing')
    }
    const clock = vi.spyOn(Date, 'now').mockReturnValue(first.routeGeneration.routes[0].expiresAt + 1)
    await expect(customer.action(api.customerRequestApplication.confirmRoute, {
      requestRef: submitted.requestRef,
      revision: submitted.revision,
      routeRef: preview.decision.routes[0].routeRef,
      idempotencyKey: 'confirm:single-route-expired',
    })).resolves.toMatchObject({
      kind: 'request', state: 'needs_attention', nextAction: 'retry',
      decision: { outcome: { kind: 'routes_expired' }, routes: [{ availability: 'expired' }] },
    })
    await expect(customer.action(api.customerRequestApplication.resume, {
      requestRef: submitted.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'needs_attention', nextAction: 'retry',
      recovery: {
        state: 'restored',
        reason: 'choice_expired',
        restoredAt: expect.any(Number),
        workRestarted: false,
      },
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
      systemInstructionVersion: 'customer-request-semantic:v9',
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
          quoteDigest: expect.any(String),
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
    const projectedQuoteDigest = compared.decision?.routes[0]?.quoteDigest
    expect(projectedQuoteDigest).toBeTruthy()
    expect(projectedQuoteDigest).not.toContain(route.routePlanId)
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
    const refreshedChoiceRef = refreshedComparison.decision?.routes[0]?.routeRef
    if (refreshedChoiceRef === undefined) throw new Error('refreshed customer choice missing')
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
    await expect(customer.action(api.customerRequestApplication.confirmRoute, {
      requestRef: submitted.requestRef,
      revision: submitted.revision,
      routeRef: refreshedChoiceRef,
      idempotencyKey: 'confirm:stale-price-choice',
    })).resolves.toMatchObject({
      kind: 'request', state: 'routes_ready', routeGenerationRef: priceRefresh.routeGenerationRef,
      decision: {
        changes: { kind: 'changed', items: expect.arrayContaining([expect.objectContaining({ kind: 'maximum_cost' })]) },
        nextBoundary: { kind: 'confirmation', authorityCreated: false },
      },
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
    const sourceOwnedRefresh = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef, revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:unsafe-refresh',
    })
    expect(sourceOwnedRefresh).toMatchObject({
      kind: 'request', state: 'routes_ready', nextAction: 'inspect_routes',
    })
    await expect(customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef, revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:unsafe-refresh',
    })).resolves.toEqual(sourceOwnedRefresh)
    await expect(backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: submitted.requestRef,
    })).resolves.toMatchObject({
      kind: 'current',
      aggregate: {
        snapshot: {
          intent: 'Resolve this service and prepare its quote',
          facts: expect.arrayContaining([expect.objectContaining({
            value: 'Resolve this service and prepare its quote',
            source: expect.objectContaining({ kind: 'customer' }),
          })]),
        },
      },
    })
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
    expect(contractGeneration.routeGeneration).toMatchObject({ generation: 5, requestRevision: 1 })
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
    expect(shapeGeneration.routeGeneration).toMatchObject({ generation: 6, requestRevision: 1 })
    if (shapeGeneration.routeGeneration.decisionSnapshot === undefined) {
      throw new Error('route-shape decision snapshot missing')
    }
    expect(routeShapeRefresh.criteria).toEqual(
      shapeGeneration.routeGeneration.decisionSnapshot.criteria
        .map(({ label, value, basis }) => ({
          label, value, basis, impact: 'eligibility_and_comparison',
        })),
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
      routeGenerationNumber: 6, routeGenerationRef: routeShapeRefresh.routeGenerationRef,
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
        { generation: 6, requestRevision: 1 },
      ])
  })
})

function objectSchema(properties: Record<string, object>, required: string[]) {
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties, required, additionalProperties: false }
}

async function publishAndActivate(
  backend: ReturnType<typeof convexTest>, admin: Awaited<ReturnType<typeof ownerAdmin>>,
  suffix: string, document: RouteCapabilityDocument, amountMinor: number,
  options: Readonly<{ adapterCancellation?: boolean }> = {},
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
    continuation: { kind: 'single_response' as const, evidenceRefs: ['test:single-response'] },
    cancellation: options.adapterCancellation
      ? { kind: 'adapter_managed' as const, evidenceRefs: ['test:adapter-cancellation'] }
      : { kind: 'unsupported' as const, evidenceRefs: ['test:no-cancellation'] },
    adapter: {
      adapterId: 'http-json:v1',
      config: {
        method: 'POST', requestTimeoutMs: 5_000,
        ...(options.adapterCancellation
          ? { cancellation: { path: '/ae/cancel', requestTimeoutMs: 3_000 } }
          : {}),
      },
    }, registrationEvidenceRefs: [`test:binding:${suffix}`],
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
  await finishImmediateReadinessProbe(backend)
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
  await finishImmediateReadinessProbe(backend)
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

async function confirmedTwoStepRoute(
  backend: ReturnType<typeof convexTest>,
  admin: Awaited<ReturnType<typeof ownerAdmin>>,
  suffix: string,
  options: Readonly<{ adapterCancellation?: boolean }> = {},
) {
  const current = await committedTwoStepAdmissionRoute(backend, admin, options)
  const compared = await admin.action(api.customerRequestApplication.compare, {
    requestRef: current.aggregate.snapshot.requestId,
    revision: current.aggregate.snapshot.revision,
    idempotencyKey: `compare:${suffix}`,
  })
  if (compared.kind !== 'request' || compared.decision?.routes[0] === undefined) {
    throw new Error(`customer route missing: ${JSON.stringify(compared)}`)
  }
  const confirmed = await admin.action(api.customerRequestApplication.confirmRoute, {
    requestRef: compared.requestRef,
    revision: compared.revision,
    routeRef: compared.decision.routes[0].routeRef,
    idempotencyKey: `confirm:${suffix}`,
  })
  if (confirmed.kind !== 'request' || confirmed.state !== 'route_confirmed') {
    throw new Error(`route confirmation missing: ${JSON.stringify(confirmed)}`)
  }
  return confirmed
}

async function committedTwoStepAdmissionRoute(
  backend: ReturnType<typeof convexTest>,
  admin: Awaited<ReturnType<typeof ownerAdmin>>,
  options: Readonly<{ adapterCancellation?: boolean }> = {},
) {
  await publishAndActivate(backend, admin, 'admission-resolver', upstreamDocument, 300, options)
  await publishAndActivate(backend, admin, 'admission-quoter', downstreamDocument, 700)
  const supply = await backend.query(internal.capabilitySupply.listEligible, {
    networkId: 'ae:public', limit: 16,
  })
  if (supply.kind !== 'available') throw new Error(`supply unavailable: ${supply.reason}`)
  const upstreamModel = openCapabilityDecisionModel(defineCapabilityContract(upstreamDocument))
  const downstreamModel = openCapabilityDecisionModel(defineCapabilityContract(downstreamDocument))
  const requestInput = upstreamModel.inputs.find((input) => input.inputPointer === '/request')
  if (requestInput === undefined) throw new Error('upstream request input missing')
  const requestId = 'request:two-step-admission'
  const compiled = compileCustomerRequest({
    requestId,
    expectedRevision: 0,
    expectedRouteGeneration: 0,
    principalId: 'token_route_admin',
    delegatedAgentId: 'agent:two-step-admission',
    intent: 'Resolve a service reference and prepare its quote',
    networkId: 'ae:public',
    proposal: {
      kind: 'capability_candidates',
      selections: [
        {
          selectionKey: upstreamModel.selectionKey,
          contractRef: upstreamModel.contractRef,
          facts: [{
            contractRef: upstreamModel.contractRef,
            selectionKey: upstreamModel.selectionKey,
            inputKey: requestInput.key,
            inputPointer: requestInput.inputPointer,
            schemaIdentity: requestInput.schemaIdentity,
            value: 'Resolve a service reference and prepare its quote',
            source: { kind: 'customer', assertionRef: 'customer:two-step-admission' },
          }],
        },
        { selectionKey: downstreamModel.selectionKey, contractRef: downstreamModel.contractRef, facts: [] },
      ],
    },
    interpreterId: 'interpreter:two-step-admission',
    bindings: supply.supplies.flatMap(({ offering, binding, publication }) => (
      publication === undefined ? [] : [{
        businessId: String(offering.businessId),
        offeringId: offering.offeringId,
        bindingId: binding.bindingId,
        contractRef: {
          capabilityId: binding.capabilityId,
          version: binding.version,
          contractDigest: binding.contractDigest,
        },
        offeringRegistrationHash: offering.registrationHash,
        bindingRegistrationHash: binding.registrationHash,
        publicationRef: publication.publicationRef,
        publicationRevision: publication.revision,
        readinessValidUntil: publication.readinessValidUntil,
        price: offering.presentation.price,
        commercialRelationship: offering.presentation.commercialRelationship,
        cancellation: binding.cancellation,
      }]
    )),
    models: [upstreamModel, downstreamModel],
    now: Date.now(),
  })
  if (compiled.kind !== 'compiled' || compiled.routeGeneration === undefined) {
    throw new Error(`two-step compile failed: ${compiled.kind === 'compiled' ? 'generation_missing' : compiled.reason}`)
  }
  const aggregate = writableCustomerRequestV2Aggregate(compiled.aggregate)
  const routeGeneration = writableCustomerRequestRoutePlanGeneration(compiled.routeGeneration)
  const committed = await backend.mutation(internal.customerRequestV2.commitAggregate, {
    commandKey: 'command:two-step-admission',
    commandDigest: canonicalDigest({ requestId }),
    expectedRevision: 0,
    expectedRouteGeneration: 0,
    aggregate,
    routeGeneration,
  })
  if (committed.kind !== 'stored') throw new Error(`two-step commit failed: ${committed.kind}`)
  return { aggregate, routeGeneration }
}

async function committedOneStepAdmissionRoute(
  backend: ReturnType<typeof convexTest>,
  admin: Awaited<ReturnType<typeof ownerAdmin>>,
) {
  await publishAndActivate(backend, admin, 'one-step-resolver', upstreamDocument, 300)
  const supply = await backend.query(internal.capabilitySupply.listEligible, {
    networkId: 'ae:public', limit: 16,
  })
  if (supply.kind !== 'available') throw new Error(`supply unavailable: ${supply.reason}`)
  const model = openCapabilityDecisionModel(defineCapabilityContract(upstreamDocument))
  const requestInput = model.inputs.find((input) => input.inputPointer === '/request')
  if (requestInput === undefined) throw new Error('one-step request input missing')
  const requestId = 'request:one-step-admission'
  const compiled = compileCustomerRequest({
    requestId,
    expectedRevision: 0,
    expectedRouteGeneration: 0,
    principalId: 'token_route_admin',
    delegatedAgentId: 'agent:one-step-admission',
    intent: 'Resolve one service reference',
    networkId: 'ae:public',
    proposal: {
      kind: 'capability_candidates',
      selections: [{
        selectionKey: model.selectionKey,
        contractRef: model.contractRef,
        facts: [{
          contractRef: model.contractRef,
          selectionKey: model.selectionKey,
          inputKey: requestInput.key,
          inputPointer: requestInput.inputPointer,
          schemaIdentity: requestInput.schemaIdentity,
          value: 'Resolve one service reference',
          source: { kind: 'customer', assertionRef: 'customer:one-step-admission' },
        }],
      }],
    },
    interpreterId: 'interpreter:one-step-admission',
    bindings: supply.supplies.flatMap(({ offering, binding, publication }) => (
      publication === undefined ? [] : [{
        businessId: String(offering.businessId),
        offeringId: offering.offeringId,
        bindingId: binding.bindingId,
        contractRef: {
          capabilityId: binding.capabilityId,
          version: binding.version,
          contractDigest: binding.contractDigest,
        },
        offeringRegistrationHash: offering.registrationHash,
        bindingRegistrationHash: binding.registrationHash,
        publicationRef: publication.publicationRef,
        publicationRevision: publication.revision,
        readinessValidUntil: publication.readinessValidUntil,
        price: offering.presentation.price,
        commercialRelationship: offering.presentation.commercialRelationship,
        cancellation: binding.cancellation,
      }]
    )),
    models: [model],
    now: Date.now(),
  })
  if (compiled.kind !== 'compiled' || compiled.routeGeneration === undefined) {
    throw new Error(`one-step compile failed: ${compiled.kind === 'compiled' ? 'generation_missing' : compiled.reason}`)
  }
  const aggregate = writableCustomerRequestV2Aggregate(compiled.aggregate)
  const routeGeneration = writableCustomerRequestRoutePlanGeneration(compiled.routeGeneration)
  const committed = await backend.mutation(internal.customerRequestV2.commitAggregate, {
    commandKey: 'command:one-step-admission',
    commandDigest: canonicalDigest({ requestId }),
    expectedRevision: 0,
    expectedRouteGeneration: 0,
    aggregate,
    routeGeneration,
  })
  if (committed.kind !== 'stored') throw new Error(`one-step commit failed: ${committed.kind}`)
  return { aggregate, routeGeneration }
}

function operationContext(suffix: string) {
  return { operationKey: `op:route:${suffix}`, correlationId: `corr:route:${suffix}`, reasonCode: 'test_multi_capability_route', evidenceRefs: ['test:issue-143'] }
}

async function finishImmediateReadinessProbe(backend: ReturnType<typeof convexTest>) {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await backend.finishInProgressScheduledFunctions()
}

async function finishScheduledRouteWorkers(backend: ReturnType<typeof convexTest>, passes: number) {
  for (let pass = 0; pass < passes; pass += 1) {
    await backend.action(internal.customerRequestRouteTransportWorker.runNext, {
      workerId: `worker:integration:${pass}`,
    })
  }
}

async function ownerAdmin(backend: ReturnType<typeof convexTest>) {
  const identity = { subject: 'user_route_admin', issuer: 'https://identity.example', tokenIdentifier: 'token_route_admin' }
  await backend.run(async (ctx) => { await ctx.db.insert('adminMemberships', { clerkUserId: identity.subject, tokenIdentifier: identity.tokenIdentifier, role: 'owner_admin', state: 'active', grantedBy: 'test_bootstrap', grantedAt: 1 }) })
  return backend.withIdentity(identity)
}

async function supportAdmin(backend: ReturnType<typeof convexTest>) {
  const identity = { subject: 'user_route_support', issuer: 'https://identity.example', tokenIdentifier: 'token_route_support' }
  await backend.run(async (ctx) => {
    await ctx.db.insert('adminMemberships', {
      clerkUserId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      role: 'support',
      state: 'active',
      grantedBy: 'test_bootstrap',
      grantedAt: 1,
    })
  })
  return backend.withIdentity(identity)
}

async function reviewerAdmin(backend: ReturnType<typeof convexTest>) {
  const identity = { subject: 'user_route_reviewer', issuer: 'https://identity.example', tokenIdentifier: 'token_route_reviewer' }
  await backend.run(async (ctx) => {
    await ctx.db.insert('adminMemberships', {
      clerkUserId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      role: 'reviewer',
      state: 'active',
      grantedBy: 'test_bootstrap',
      grantedAt: 1,
    })
  })
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

async function businessOwnerForAttempt(
  backend: ReturnType<typeof convexTest>,
  attemptRef: string,
) {
  const identity = await backend.run(async (ctx) => {
    const attempt = (await ctx.db.query('customerRequestRouteStepAttempts').take(20))
      .find((candidate) => candidate.attemptRef === attemptRef)
    if (attempt === null) throw new Error('attempt missing')
    const business = await ctx.db.get(attempt.grant.step.businessId as Id<'businesses'>)
    if (business === null) throw new Error('attempt business missing')
    const owner = await ctx.db.get(business.ownerId)
    if (owner === null) throw new Error('attempt business owner missing')
    return {
      subject: owner.clerkUserId,
      issuer: 'https://identity.example',
      tokenIdentifier: `token_business_problem_${owner.clerkUserId}`,
    }
  })
  return backend.withIdentity(identity)
}
