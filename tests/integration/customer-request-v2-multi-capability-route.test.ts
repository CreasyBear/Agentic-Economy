import type { WorkId } from '@convex-dev/workpool'
import type { TestConvex } from 'convex-test'
import { components } from '../../convex/_generated/api'
import { afterEach, describe, expect, it, vi } from 'vitest'

const routeProviderFetch = vi.hoisted(() => vi.fn<typeof import('undici').fetch>())
vi.mock('undici', async (importOriginal) => ({
  ...await importOriginal<typeof import('undici')>(),
  fetch: routeProviderFetch,
}))

import { Response as UndiciResponse } from 'undici'
import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { convexTestWithWorkers, ownerAdmin, publishedBusinessOwner, type ConvexFixtureAdmin } from '../helpers/convex-fixtures'
import { listRouteableCapabilitySupply } from '../../convex/capabilitySupply'
import { registeredEvaluationBindingsFromRouteableSupply } from '../../convex/customerRequestEvaluationBindings'
import { objectSchema } from '../fixtures/capability-contract-v2'
import { readCuratedContract } from '../helpers/curated-supply'
import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import {
  createRegisteredOperationMappingRef,
  type CapabilityPublicationBindingDraft,
  type CapabilityPublicationOfferingDraft,
  type RegisteredOperationMapping,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import { compileCustomerRequest, writableCustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import { writableCustomerRequestRoutePlanGeneration } from '@/modules/customer-request/route-plan-generation'
import { createCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'
import {
  aggregateIsInternallyConsistent,
  currentRoutePlanGenerationGraphStatus,
} from '../../convex/customerRequestV2'

type RouteTestBackend = TestConvex<typeof schema>
async function pauseWorkpool(backend: RouteTestBackend) {
  await backend.run(async (ctx) => {
    await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 })
  })
}

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

function routeServiceReferenceMapping(
  source: CapabilityDecisionModel,
  target: CapabilityDecisionModel,
): RegisteredOperationMapping {
  const output = source.evidence.find((candidate) => target.inputs.some((input) => (
    input.schemaIdentity === candidate.schemaIdentity
  )))
  const input = output === undefined
    ? undefined
    : target.inputs.find((candidate) => candidate.schemaIdentity === output.schemaIdentity)
  if (output === undefined || input === undefined) throw new Error('route mapping semantics missing')
  const material = {
    kind: 'field' as const,
    authority: 'registered_contract_semantics' as const,
    sourceContractRef: source.contractRef,
    targetContractRef: target.contractRef,
    sourceSchemaIdentity: output.schemaIdentity,
    targetSchemaIdentity: input.schemaIdentity,
    sourceOutputPointer: output.outputPointer,
    targetInputPointer: input.inputPointer,
  }
  return { ...material, mappingRef: createRegisteredOperationMappingRef(material) }
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const first = await publishAndActivate(backend, admin, 'resolver', upstreamDocument, 300)
    const second = await publishAndActivate(backend, admin, 'quoter', downstreamDocument, 700)
    await observeReady(backend, first, 'resolver-stable')
    await observeReady(backend, second, 'quoter-stable')
    const now = Date.now()
    const supply = await backend.run(async (ctx) => (
      await listRouteableCapabilitySupply(ctx.db, {
        networkId: 'ae:public', limit: 64, now,
      })
    ))
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
    const upstreamPublication = supply.supplies.find(({ binding }) => (
      binding.capabilityId === upstreamModel.contractRef.capabilityId
    ))?.publication
    const downstreamPublication = supply.supplies.find(({ binding }) => (
      binding.capabilityId === downstreamModel.contractRef.capabilityId
    ))?.publication
    if (upstreamPublication === undefined || downstreamPublication === undefined) {
      throw new Error('route publication lineage missing')
    }
    const result = compileCustomerRequest({
      requestId: 'request:multi-capability:1', expectedRevision: 0, expectedRouteGeneration: 0,
      principalId: 'principal:customer:1', delegatedAgentId: 'agent:customer:1',
      intent: 'Find the referenced service and prepare its quote', networkId: 'ae:public',
      proposal: { kind: 'capability_candidates', selections: [
        { operationRef: upstreamPublication.operationRef, selectionKey: upstreamModel.selectionKey, contractRef: upstreamModel.contractRef, facts: [fact] },
        { operationRef: downstreamPublication.operationRef, selectionKey: downstreamModel.selectionKey, contractRef: downstreamModel.contractRef, facts: [] },
      ] },
      interpreterId: 'interpreter:production-route-test',
      mappings: [routeServiceReferenceMapping(upstreamModel, downstreamModel)],
      bindings: registeredEvaluationBindingsFromRouteableSupply(supply, { includePublication: true }),
      models: [upstreamModel, downstreamModel], now,
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
      maximumTotalCost: { kind: 'known', amount: { currency: 'AUD', units: '1000', exponent: 2 } },
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
        { operationRef: upstreamPublication.operationRef, selectionKey: upstreamModel.selectionKey, contractRef: upstreamModel.contractRef, facts: [] },
        { operationRef: downstreamPublication.operationRef, selectionKey: downstreamModel.selectionKey, contractRef: downstreamModel.contractRef, facts: [] },
      ] },
      interpreterId: 'interpreter:production-route-test',
      mappings: [routeServiceReferenceMapping(upstreamModel, downstreamModel)],
      bindings: registeredEvaluationBindingsFromRouteableSupply(supply, { includePublication: true }),
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
      mappings: [routeServiceReferenceMapping(upstreamModel, downstreamModel)],
      bindings: registeredEvaluationBindingsFromRouteableSupply(supply, { includePublication: true }),
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
      maximumTotalSpend: route.maximumTotalCost.amount,
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
        step: expect.objectContaining({ maximumSpend: { currency: 'AUD', units: '300', exponent: 2 } }),
      }) }),
      expect.objectContaining({ kind: 'admitted', grant: expect.objectContaining({
        step: expect.objectContaining({ maximumSpend: { currency: 'AUD', units: '700', exponent: 2 } }),
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
      expect(reservations.map(({ reservedSpend }) => reservedSpend).sort((left, right) => left.units.localeCompare(right.units)))
        .toEqual([
          { currency: 'AUD', units: '300', exponent: 2 },
          { currency: 'AUD', units: '700', exponent: 2 },
        ])
      expect(reservations.reduce((total, row) => total + BigInt(row.reservedSpend.units), 0n)).toBe(1_000n)
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
      scopes: [
        'customer_requests:create',
        'customer_requests:bounded_mandate',
        'customer_requests:standing_authority',
      ],
    }
    const maximumTotalSpend = displayedRoute.maximumTotalCost.kind === 'known'
      ? displayedRoute.maximumTotalCost.amount
      : { currency: 'AUD', units: '0', exponent: 2 }
    const cumulativeSpend = {
      ...maximumTotalSpend,
      units: (BigInt(maximumTotalSpend.units) * 2n).toString(),
    }
    const permissionCommand = {
      requestRef: compared.requestRef,
      revision: compared.revision,
      routeRef: displayedRoute.routeRef,
      delegatedCredentialId: 'credential:repeat-permission',
      occurrences: 2,
      cumulativeSpend,
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
    if (permission.kind !== 'repeat_permission') throw new Error(`repeat permission failed: ${JSON.stringify(permission)}`)
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
        perUseSpend: maximumTotalSpend,
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'validated-chain')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'run:validated-chain',
    })

    const firstLease = await nextDispatch(backend)
    expect(firstLease).toMatchObject({
      kind: 'leased',
      dispatch: { position: 1 },
    })
    if (firstLease.kind !== 'leased') throw new Error('first route step was not leased')
    expect(JSON.parse(firstLease.dispatch.inputJson)).toEqual({
      request: 'Resolve a service reference and prepare its quote',
    })
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: firstLease.dispatch.dispatchRef,
      attemptRef: firstLease.dispatch.attemptRef,
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

    const secondLease = await nextDispatch(backend)
    expect(secondLease).toMatchObject({ kind: 'leased', dispatch: { position: 2 } })
    if (secondLease.kind !== 'leased') throw new Error('second route step was not leased')
    expect(JSON.parse(secondLease.dispatch.inputJson)).toEqual({ serviceReference: 'service:123' })
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: secondLease.dispatch.dispatchRef,
      attemptRef: secondLease.dispatch.attemptRef,
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
      expect(reservations.reduce((total, row) => total + BigInt(row.reservedSpend.units), 0n)).toBe(1_000n)
      expect(disclosures).toHaveLength(2)
      expect(new Set(disclosures.map(({ allocationRef }) => allocationRef)).size).toBe(2)
    })
  })
  it('persists dispatch lease identity and reads historical leased route rows', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'legacy-journal')

    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'run:legacy-journal',
    })

    const current = await backend.run(async (ctx) => {
      const attempt = await ctx.db.query('customerRequestRouteStepAttempts').first()
      const outbox = await ctx.db.query('customerRequestRouteDispatchOutbox').first()
      if (attempt === null || outbox === null) throw new Error('current route journal rows missing')
      return { attempt, outbox }
    })
    expect(current.attempt.state).toBe('queued')
    expect(current.outbox.state).toBe('pending')
    expect(current.outbox).toEqual(expect.objectContaining({
      leaseOwner: `customer-request-route-dispatch:${current.outbox.dispatchRef}`,
      leaseExpiresAt: current.outbox.createdAt + 30_000,
    }))
    await expect(admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'run:legacy-journal',
    })).resolves.toMatchObject({
      kind: 'request',
      progress: { current: { state: 'queued' } },
    })
    const replayed = await backend.run(async (ctx) => ctx.db.get(current.outbox._id))
    expect(replayed).toEqual(expect.objectContaining({
      dispatchRef: current.outbox.dispatchRef,
      dispatchDigest: current.outbox.dispatchDigest,
      leaseOwner: current.outbox.leaseOwner,
      leaseExpiresAt: current.outbox.leaseExpiresAt,
      createdAt: current.outbox.createdAt,
    }))

    await backend.run(async (ctx) => {
      await ctx.db.patch(current.outbox._id, {
        state: 'leased',
        leaseOwner: 'historical-worker',
        leaseExpiresAt: 60_000,
      })
    })

    await expect(backend.query(internal.customerRequestRouteExecution.getCurrent, {
      requestId: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'found',
      run: { currentState: 'leased' },
    })
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request',
      progress: { current: { state: 'leased' } },
      activity: {
        cancellation: {
          state: 'not_available',
          reason: 'business_step_leased',
        },
      },
    })


    await expect(admin.action(api.customerRequestApplication.exportRouteEvidence, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'evidence',
      steps: [{ step: 1, state: 'leased' }],
    })
    const legacy = await backend.run(async (ctx) => ({
      attempt: await ctx.db.get(current.attempt._id),
      outbox: await ctx.db.get(current.outbox._id),
    }))
    expect(legacy.attempt).toEqual(expect.objectContaining({ state: 'queued' }))
    expect(legacy.outbox).toEqual(expect.objectContaining({
      state: 'leased',
      leaseOwner: 'historical-worker',
      leaseExpiresAt: 60_000,
    }))
    await expect(backend.query(internal.customerRequestRouteExecution.openDispatch, {
      dispatchRef: current.outbox.dispatchRef,
    })).resolves.toEqual({ kind: 'unavailable' })
    await expect(backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: current.outbox.dispatchRef,
      attemptRef: current.attempt.attemptRef,
    })).resolves.toEqual({ kind: 'refused', reason: 'dispatch_not_current' })

    const malformedLease = { leaseExpiresAt: 60_000 }
    Reflect.set(malformedLease, 'leaseExpiresAt', 'not-a-number')
    await expect(backend.run(async (ctx) => (
      ctx.db.patch(current.outbox._id, malformedLease)
    ))).rejects.toThrow()
  })
  it('refuses a second run during a historical lease and reconciles its completion once', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'legacy-lease-recovery')

    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'run:legacy-lease-recovery:first',
    })
    const current = await backend.run(async (ctx) => {
      const attempt = await ctx.db.query('customerRequestRouteStepAttempts').first()
      const outbox = await ctx.db.query('customerRequestRouteDispatchOutbox').first()
      const run = await ctx.db.query('customerRequestRouteRuns').first()
      if (attempt === null || outbox === null || run === null) {
        throw new Error('current route journal rows missing')
      }
      return { attempt, outbox, run }
    })
    await backend.run(async (ctx) => {
      await ctx.db.patch(current.attempt._id, { state: 'leased' })
      await ctx.db.patch(current.outbox._id, {
        state: 'leased', leaseOwner: 'historical-worker', leaseExpiresAt: 60_000,
      })
    })

    await expect(admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'run:legacy-lease-recovery:second',
    })).resolves.toMatchObject({
      kind: 'request', state: 'needs_attention',
    })
    const beforeCompletion = await backend.run(async (ctx) => ({
      attempts: await ctx.db.query('customerRequestRouteStepAttempts').collect(),
      outbox: await ctx.db.query('customerRequestRouteDispatchOutbox').collect(),
      runs: await ctx.db.query('customerRequestRouteRuns').collect(),
      commands: await ctx.db.query('customerRequestRouteRunCommands').collect(),
    }))
    expect(beforeCompletion.attempts).toHaveLength(1)
    expect(beforeCompletion.outbox).toHaveLength(1)
    expect(beforeCompletion.runs).toHaveLength(1)
    expect(beforeCompletion.commands).toHaveLength(1)
    expect(beforeCompletion.attempts[0]).toEqual(expect.objectContaining({ state: 'leased' }))
    expect(beforeCompletion.outbox[0]).toEqual(expect.objectContaining({ state: 'leased' }))

    await backend.mutation(internal.customerRequestRouteExecution.completeRouteTransportWork, {
      workId: 'work:legacy-lease-recovery' as WorkId,
      context: { dispatchRef: current.outbox.dispatchRef },
      result: { kind: 'failed', error: 'historical lease completed without transport result' },
    })
    const afterCompletion = await backend.run(async (ctx) => ({
      attempt: await ctx.db.query('customerRequestRouteStepAttempts').first(),
      outbox: await ctx.db.query('customerRequestRouteDispatchOutbox').first(),
      run: await ctx.db.query('customerRequestRouteRuns').first(),
    }))
    expect(afterCompletion.attempt).toEqual(expect.objectContaining({
      state: 'failed', transportObservationJson: expect.any(String),
    }))
    expect(afterCompletion.outbox).toEqual(expect.objectContaining({ state: 'failed' }))
    expect(afterCompletion.run).toEqual(expect.objectContaining({
      state: 'failed', resultJson: expect.any(String),
    }))
    const settled = await admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })
    expect(settled).toMatchObject({
      kind: 'request', state: 'failed', nextAction: 'revise_request',
      action: { state: 'failed', resolution: 'not_sent', automaticRetry: false },
    })

    await backend.mutation(internal.customerRequestRouteExecution.completeRouteTransportWork, {
      workId: 'work:legacy-lease-recovery-replay' as WorkId,
      context: { dispatchRef: current.outbox.dispatchRef },
      result: { kind: 'success', returnValue: { kind: 'completed', disposition: 'refused' } },
    })
    await expect(backend.run(async (ctx) => ({
      attempt: await ctx.db.query('customerRequestRouteStepAttempts').first(),
      outbox: await ctx.db.query('customerRequestRouteDispatchOutbox').first(),
      run: await ctx.db.query('customerRequestRouteRuns').first(),
    }))).resolves.toEqual(afterCompletion)
  })



  it('runs a two-step Request through registered transports and resumes the customer result', async () => {
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'route-call-signing-secret-with-at-least-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
    vi.stubEnv('ROUTE_ADMISSION_RESOLVER_KEY', 'resolver-secret')
    vi.stubEnv('ROUTE_ADMISSION_QUOTER_KEY', 'quoter-secret')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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

  it('composes one ordinary-language composite Request from real curated heterogeneous operations', async () => {
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'route-call-signing-secret-with-at-least-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
    vi.stubEnv('EXA_API_KEY', 'test-exa-api-key')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    await seedCuratedHeterogeneousSupply(backend)

    const frankfurterModel = openCapabilityDecisionModel(await readCuratedContract(backend, 'frankfurter.single-rate'))
    const searchModel = openCapabilityDecisionModel(await readCuratedContract(backend, 'exa.search'))
    const contentsModel = openCapabilityDecisionModel(await readCuratedContract(backend, 'exa.contents'))
    const searchOperation = await publishedOperationForModel(backend, searchModel)
    const contentsOperation = await publishedOperationForModel(backend, contentsModel)
    const frankfurterOperation = await publishedOperationForModel(backend, frankfurterModel)
    const baseInput = frankfurterModel.inputs.find((input) => input.inputPointer === '/base')
    const quoteInput = frankfurterModel.inputs.find((input) => input.inputPointer === '/quote')
    const queryInput = searchModel.inputs.find((input) => input.inputPointer === '/query')
    const urlsInput = contentsModel.inputs.find((input) => input.inputPointer === '/urls')
    if (baseInput === undefined || quoteInput === undefined || queryInput === undefined || urlsInput === undefined) {
      throw new Error('curated composite inputs missing')
    }
    const customerJob = 'Research how fast an open agent can get a deterministic answer and quote the current EUR to USD ECB rate'
    const generate = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates',
        canonicalStatements: [],
        supersededStatements: [],
        selections: [
          {
            operationRef: searchOperation.operationRef,
            selectionKey: searchModel.selectionKey,
            facts: [{ inputKey: queryInput.key, value: 'open agent deterministic answer speed' }],
          },
          { operationRef: contentsOperation.operationRef, selectionKey: contentsModel.selectionKey, facts: [
            { inputKey: urlsInput.key, value: ['https://exa.example/source-1'] },
          ] },
          {
            operationRef: frankfurterOperation.operationRef,
            selectionKey: frankfurterModel.selectionKey,
            facts: [
              { inputKey: baseInput.key, value: 'EUR' },
              { inputKey: quoteInput.key, value: 'USD' },
            ],
          },
        ],
      }) }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', generate)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity({
      subject: 'customer-curated-composite', issuer: 'https://identity.example',
    })

    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:curated-composite', requestId: 'request:curated-composite',
      delegatedAgentId: 'agent:curated-composite', customerJob,
      routing: { networkId: 'ae:public' },
    })
    if (submitted.kind !== 'request') throw new Error(`curated submit failed: ${submitted.kind}`)
    const compared = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef, revision: submitted.revision,
      idempotencyKey: 'compare:curated-composite',
    })
    if (compared.kind !== 'request' || compared.decision?.routes[0] === undefined) {
      throw new Error(`curated comparison failed: ${JSON.stringify(compared)}`)
    }
    const displayed = compared.decision.routes[0]
    if (displayed.steps === undefined) throw new Error('curated displayed route steps missing')
    expect(displayed.businesses.map(({ name }) => name).sort()).toEqual([
      'Exa — web search and contents',
      'Frankfurter — ECB rates',
    ].sort())
    expect(displayed.steps.map(({ business }) => business.name).sort()).toEqual([
      'Exa — web search and contents',
      'Exa — web search and contents',
      'Frankfurter — ECB rates',
    ].sort())
    expect(displayed).toMatchObject({
      stepCount: 3,
      maximumTotalCost: { kind: 'known', amount: { currency: 'USD', units: '2', exponent: 2 } },
      result: {
        deliverables: ['ECB reference rate', 'Retrieved contents', 'Search results'],
        summary: 'Returns one current European Central Bank reference rate through the public Frankfurter v2 API. Retrieves bounded contents for URLs selected from a public Exa search result. Searches the public web through Exa and returns bounded result links for further inspection.',
      },
    })
    expect(JSON.stringify(compared)).not.toMatch(
      /capabilityId|bindingId|offeringId|publicationRef|contractDigest|transport|graph/u,
    )

    const confirmed = await customer.action(api.customerRequestApplication.confirmRoute, {
      requestRef: compared.requestRef, revision: compared.revision, routeRef: displayed.routeRef,
      idempotencyKey: 'confirm:curated-composite',
    })
    expect(confirmed).toMatchObject({ kind: 'request', state: 'route_confirmed' })
    if (confirmed.kind !== 'request' || confirmed.state !== 'route_confirmed') {
      throw new Error(`curated confirmation failed: ${JSON.stringify(confirmed)}`)
    }

    routeProviderFetch.mockReset()
    routeProviderFetch.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/search')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ query: expect.any(String) })
        return new UndiciResponse(JSON.stringify({
          results: [{ url: 'https://exa.example/source-1' }],
        }), {
          status: 200, headers: { 'Content-Type': 'application/json', 'Provider-Receipt': 'exa:search' },
        })
      }
      if (url.includes('/contents')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          urls: ['https://exa.example/source-1'],
        })
        return new UndiciResponse(JSON.stringify({
          results: [{ url: 'https://exa.example/source-1', text: 'bounded page text' }],
        }), {
          status: 200, headers: { 'Content-Type': 'application/json', 'Provider-Receipt': 'exa:contents' },
        })
      }
      if (url.includes('/rates')) {
        expect(url).toContain('base=EUR')
        expect(url).toContain('quotes=USD')
        return new UndiciResponse(JSON.stringify([{
          date: '2026-08-04', base: 'EUR', quote: 'USD', rate: 1.08,
        }]), {
          status: 200, headers: { 'Content-Type': 'application/json', 'Provider-Receipt': 'frankfurter:rate' },
        })
      }
      throw new Error(`unexpected curated transport url: ${url}`)
    })
    const started = await customer.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'run:curated-composite',
    })
    expect(started).toMatchObject({
      kind: 'request', state: 'in_progress',
      progress: { completed: 0, total: 3, current: { step: 1, state: 'queued' } },
    })
    for (let pass = 0; pass < 40; pass += 1) {
      const dispatchRef = await backend.run(async (ctx) => {
        const soonest = await ctx.db.query('customerRequestRouteDispatchOutbox')
          .withIndex('by_state_and_availableAt', (query) => (
            query.eq('state', 'pending').lt('availableAt', Date.now())
          )).first()
        if (soonest !== null) return soonest.dispatchRef
        const pending = (await ctx.db.query('customerRequestRouteDispatchOutbox').collect())
          .find(({ state }) => state === 'pending')
        return pending?.dispatchRef ?? null
      })
      if (dispatchRef !== null) {
        await backend.action(internal.customerRequestRouteTransportWorker.run, { dispatchRef })
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        await backend.finishInProgressScheduledFunctions()
        continue
      }
      const delivered = await backend.run(async (ctx) => (
        (await ctx.db.query('customerRequestRouteDispatchOutbox').collect()).filter(
          ({ state }) => state === 'delivered',
        ).length
      ))
      if (delivered >= 3) break
      await new Promise<void>((resolve) => setTimeout(resolve, 2))
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await backend.finishInProgressScheduledFunctions()
    const completed = await customer.action(api.customerRequestApplication.resume, {
      requestRef: compared.requestRef,
    })
    expect(completed).toMatchObject({
      kind: 'request', state: 'completed', nextAction: 'none',
      action: {
        state: 'completed',
        result: { results: [{ url: 'https://exa.example/source-1' }] },
      },
    })
    if (completed.kind !== 'request' || completed.businesses === undefined) {
      throw new Error('curated completed business projection missing')
    }
    expect(completed.businesses.map(({ name }) => name).sort()).toEqual([
      'Exa — web search and contents',
      'Frankfurter — ECB rates',
    ].sort())
    await backend.run(async (ctx) => {
      const run = await ctx.db.query('customerRequestRouteRuns')
        .withIndex('by_requestId', (query) => query.eq('requestId', compared.requestRef)).unique()
      if (run === null) throw new Error('curated route run missing')
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
    expect(routeProviderFetch).toHaveBeenCalledTimes(3)
  })

  it('records an interrupted released call as unknown and refuses unsafe replay', async () => {
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'route-call-signing-secret-with-at-least-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
    vi.stubEnv('ROUTE_ADMISSION_RESOLVER_KEY', 'resolver-secret')
    vi.stubEnv('ROUTE_ADMISSION_QUOTER_KEY', 'quoter-secret')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
    expect(routeProviderFetch).toHaveBeenCalledTimes(2)
  })

  it('records a definite released provider denial as failed and never retries it', async () => {
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'route-call-signing-secret-with-at-least-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
    vi.stubEnv('ROUTE_ADMISSION_RESOLVER_KEY', 'resolver-secret')
    vi.stubEnv('ROUTE_ADMISSION_QUOTER_KEY', 'quoter-secret')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
    expect(routeProviderFetch).toHaveBeenCalledTimes(2)
  })

  it('preserves a validated partial provider result without completing or retrying', async () => {
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'route-call-signing-secret-with-at-least-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
    vi.stubEnv('ROUTE_ADMISSION_RESOLVER_KEY', 'resolver-secret')
    vi.stubEnv('ROUTE_ADMISSION_QUOTER_KEY', 'quoter-secret')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
      steps: [
        {
          step: 1,
          state: 'completed',
          business: 'Route admission-resolver',
          providerOrigin: 'https://admission-resolver.example.test',
          outputDigest: canonicalDigest({ serviceReference: 'sandbox-service:partial' }),
        },
        {
          step: 2,
          state: 'outcome_unknown',
          business: 'Route admission-quoter',
          providerOrigin: 'https://admission-quoter.example.test',
          outputDigest: canonicalDigest({ quoteReference: 'sandbox-partial-quote:one' }),
        },
      ],
      result: {
        kind: 'partial_result',
        output: { quoteReference: 'sandbox-partial-quote:one' },
      },
    })
    expect(JSON.stringify(evidence)).not.toContain('sandbox-continuation:private')
    expect(routeProviderFetch).toHaveBeenCalledTimes(2)
  })

  it('never advances or retries when a released step has an invalid or unknown outcome', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'unknown-outcome')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:unknown-outcome',
    })
    const lease = await nextDispatch(backend)
    if (lease.kind !== 'leased') throw new Error('unknown-outcome route step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
    })
    const invalidOutputObservation = {
      transport: 'http' as const,
      disposition: 'succeeded' as const,
      releaseStarted: true,
      requestDigest: lease.dispatch.inputDigest,
      providerReceipt: 'receipt:invalid-output',
    }
    await expect(backend.mutation(internal.customerRequestRouteExecution.recordOutcome, {
      attemptRef: lease.dispatch.attemptRef,
      operationKeyDigest: lease.dispatch.operationKeyDigest,
      observationJson: JSON.stringify(invalidOutputObservation),
      outcome: { kind: 'succeeded', outputJson: JSON.stringify({ inventedSuccess: true }) },
    })).resolves.toMatchObject({
      kind: 'outcome_unknown',
      run: { completedSteps: 0, currentPosition: 1, currentState: 'outcome_unknown' },
    })
    await expect(backend.run(async (ctx) => {
      const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_attemptRef', (query) => query.eq('attemptRef', lease.dispatch.attemptRef))
        .unique()
      return attempt?.transportObservationDigest
    })).resolves.toBe(canonicalDigest(invalidOutputObservation))
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'outcome_unknown', nextAction: 'wait',
      action: { state: 'unknown', automaticRetry: false },
    })
  })

  it('records an unknown outcome when queued transport work terminates after release', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'transport-work-crash')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:transport-work-crash',
    })
    const lease = await nextDispatch(backend)
    if (lease.kind !== 'leased') throw new Error('transport-work-crash step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
    })
    await backend.mutation(internal.customerRequestRouteExecution.completeRouteTransportWork, {
      workId: 'work:transport-work-crash' as WorkId,
      context: { dispatchRef: lease.dispatch.dispatchRef },
      result: { kind: 'failed', error: 'provider connection terminated' },
    })
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'outcome_unknown', nextAction: 'wait',
      action: { state: 'unknown', automaticRetry: false },
    })
  })

  it('keeps a business-reported failure distinct from an unknown outcome', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'known-failure')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:known-failure',
    })
    const lease = await nextDispatch(backend)
    if (lease.kind !== 'leased') throw new Error('known-failure route step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
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
  })

  it('rechecks the exact registered binding at the release boundary', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'release-binding-recheck')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:release-binding-recheck',
    })
    const lease = await nextDispatch(backend)
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

    await expect(backend.query(internal.customerRequestRouteExecution.openDispatch, {
      dispatchRef: lease.dispatch.dispatchRef,
    })).resolves.toEqual({ kind: 'unavailable' })
    await expect(backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
    })).resolves.toEqual({ kind: 'refused', reason: 'dispatch_not_current' })
    await backend.mutation(internal.customerRequestRouteExecution.completeRouteTransportWork, {
      workId: 'work:release-binding-recheck' as WorkId,
      context: { dispatchRef: lease.dispatch.dispatchRef },
      result: { kind: 'success', returnValue: { kind: 'refused' } },
    })
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'failed', nextAction: 'revise_request',
      action: { state: 'failed', automaticRetry: false },
    })
  })

  it('stops a queued run idempotently before any business step is released', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
  })

  it('reports problems idempotently and exports customer-safe evidence from the same Request', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(4_000)
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'recovery-contract')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:recovery-contract',
    })

    await backend.run(async (ctx) => {
      const dispatch = await ctx.db.query('customerRequestRouteDispatchOutbox').first()
      if (dispatch === null) throw new Error('dispatch row missing')
      await ctx.db.patch(dispatch._id, {
        state: 'leased',
        operationKeyDigest: 'mismatched-operation-key',
      })
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const support = await supportAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'suspected-duplicate-effect')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:suspected-duplicate-effect',
    })

    await backend.run(async (ctx) => {
      const dispatch = await ctx.db.query('customerRequestRouteDispatchOutbox').first()
      if (dispatch === null) throw new Error('dispatch row missing')
      await ctx.db.patch(dispatch._id, {
        state: 'leased',
        operationKeyDigest: 'mismatched-operation-key',
      })
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
      reconstruction: {
        execution: {
          steps: [{ state: 'queued' }, { state: 'blocked' }],
        },
      },
    })
    await backend.run(async (ctx) => {
      expect(await ctx.db.query('customerRequestRouteProblemReports').collect()).toHaveLength(1)
    })
  })

  it('tracks an authenticated support question and customer reply without assigning remedy authority', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(5_000)
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
            limit: { currency: 'AUD', units: '1000', exponent: 2 },
            admitted: { currency: 'AUD', units: '300', exponent: 2 },
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const support = await supportAdmin(backend)
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'business-problem-claim')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef,
      idempotencyKey: 'run:business-problem-claim',
    })
    const firstLease = await nextDispatch(backend)
    if (firstLease.kind !== 'leased') throw new Error('business problem step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: firstLease.dispatch.dispatchRef,
      attemptRef: firstLease.dispatch.attemptRef,
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
    const unrelatedOwner = (await publishedBusinessOwner(
      backend,
      'unrelated-problem-claim',
      { slugPrefix: 'route-', identityPrefix: 'route_' },
    )).owner
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

    const sibling = await backend.run(async (ctx) => {
      const attempts = await ctx.db.query('customerRequestRouteStepAttempts').collect()
      const attempt = attempts.find((candidate) => candidate.position === 2)
      if (attempt === undefined) throw new Error('second route attempt missing')
      return { id: attempt._id, inputDigest: attempt.inputDigest }
    })
    await backend.run(async (ctx) => {
      await ctx.db.patch(sibling.id, { inputDigest: 'corrupt-sibling-input-digest' })
    })
    await expect(support.action(api.customerRequestApplication.exportRouteProblemForSupport, {
      reportRef: reported.reportRef,
    })).rejects.toThrow('customer_request_route_run_attempt_integrity_failure')
    await backend.run(async (ctx) => {
      await ctx.db.patch(sibling.id, { inputDigest: sibling.inputDigest })
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const confirmed = await confirmedTwoStepRoute(backend, admin, 'cancel-too-late')
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:cancel-too-late',
    })
    const lease = await nextDispatch(backend)
    if (lease.kind !== 'leased') throw new Error('cancel-too-late route step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
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

  it('stops unreleased downstream work when cancellation is requested during an in-flight step', async () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(40_000)
      .mockReturnValueOnce(40_100)
      .mockReturnValue(40_200)
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    await pauseWorkpool(backend)
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const confirmed = await confirmedTwoStepRoute(
      backend, admin, 'cancel-after-current', { adapterCancellation: true },
    )
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:cancel-after-current',
    })
    await pauseWorkpool(backend)
    const firstLease = await nextDispatch(backend)
    if (firstLease.kind !== 'leased') throw new Error('cancel-after-current route step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: firstLease.dispatch.dispatchRef,
      attemptRef: firstLease.dispatch.attemptRef,
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
    await pauseWorkpool(backend)
  })

  it('claims one adapter cancellation attempt and replays without scheduling another request', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(50_000)
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    await pauseWorkpool(backend)
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const confirmed = await confirmedTwoStepRoute(
      backend, admin, 'adapter-cancel-pending', { adapterCancellation: true },
    )
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:adapter-cancel-pending',
    })
    await pauseWorkpool(backend)
    const lease = await nextDispatch(backend)
    if (lease.kind !== 'leased') throw new Error('adapter cancellation step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
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

  it('records unknown when adapter cancellation work terminates without a resolution', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(55_000)
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    await pauseWorkpool(backend)
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const confirmed = await confirmedTwoStepRoute(
      backend, admin, 'adapter-cancel-work-incomplete', { adapterCancellation: true },
    )
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:adapter-cancel-work-incomplete',
    })
    await pauseWorkpool(backend)
    const lease = await nextDispatch(backend)
    if (lease.kind !== 'leased') throw new Error('adapter cancellation step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
    })
    await admin.action(api.customerRequestApplication.cancelRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'cancel:adapter-work-incomplete',
    })
    const cancellationRef = await backend.run(async (ctx) => {
      const attempt = await ctx.db.query('customerRequestRouteCancellationAttempts').first()
      if (attempt === null) throw new Error('cancellation attempt missing')
      return attempt.cancellationRef
    })
    await backend.mutation(internal.customerRequestRouteExecution.completeRouteCancellationWork, {
      workId: 'work:adapter-cancel-work-incomplete' as WorkId,
      context: { cancellationRef },
      result: { kind: 'failed', error: 'transport action terminated' },
    })
    await expect(admin.action(api.customerRequestApplication.resume, {
      requestRef: confirmed.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'in_progress',
      activity: {
        certainty: 'unknown',
        retry: 'blocked_until_reconciled',
        cancellation: { state: 'unknown' },
      },
    })
  })

  it('stops the current route when the exact adapter cancellation is accepted', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(60_000)
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    await pauseWorkpool(backend)
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const confirmed = await confirmedTwoStepRoute(
      backend, admin, 'adapter-cancel-accepted', { adapterCancellation: true },
    )
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:adapter-cancel-accepted',
    })
    await pauseWorkpool(backend)
    const lease = await nextDispatch(backend)
    if (lease.kind !== 'leased') throw new Error('adapter cancellation step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    await pauseWorkpool(backend)
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const confirmed = await confirmedTwoStepRoute(
      backend, admin, 'adapter-cancel-rejected', { adapterCancellation: true },
    )
    await admin.action(api.customerRequestApplication.runRoute, {
      requestRef: confirmed.requestRef, idempotencyKey: 'run:adapter-cancel-rejected',
    })
    await pauseWorkpool(backend)
    const lease = await nextDispatch(backend)
    if (lease.kind !== 'leased') throw new Error('adapter cancellation step was not leased')
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
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
    await backend.run(async (ctx) => {
      const commands = await ctx.db.query('customerRequestRouteCancellationCommands').take(10)
      expect(commands.filter(({ result }) => result === 'rejected')).toHaveLength(1)
    })
  })

  it('uses the same run, lease, validation, and completion machinery for one step', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
    const lease = await nextDispatch(backend)
    if (lease.kind !== 'leased') throw new Error('one-step route was not leased')
    expect(lease.dispatch.position).toBe(1)
    await backend.mutation(internal.customerRequestRouteExecution.markDispatched, {
      dispatchRef: lease.dispatch.dispatchRef,
      attemptRef: lease.dispatch.attemptRef,
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
      // Confirm and run are approve_each operations; create alone is inspect_only.
      scopes: ['customer_requests:create', 'customer_requests:approve_each'],
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
    const published = await publishAndActivate(backend, admin, 'single-resolver', upstreamDocument, 300)
    await backend.action(internal.capabilitySupplyReadiness.probe, {
      publicationRef: published.publicationRef, expectedRevision: published.revision,
    })
    await observeReady(backend, published, 'single-resolver-public')
    const model = openCapabilityDecisionModel(defineCapabilityContract(upstreamDocument))
    const operation = await publishedOperationForModel(backend, model)
    const requestInput = model.inputs.find((input) => input.inputPointer === '/request')
    if (requestInput === undefined) throw new Error('single route request input missing')
    const generate = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates',
        canonicalStatements: [],
        supersededStatements: [],
        selections: [{
          operationRef: operation.operationRef,
          selectionKey: model.selectionKey,
          facts: [{ inputKey: requestInput.key, value: 'Resolve this service reference' }],
        }],
      }) }, finish_reason: 'stop' }],
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const admin = await ownerAdmin(backend, 'user_route_admin')
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
    await expect(admin.mutation(api.capabilitySupply.registerMapping, {
      networkId: 'ae:public',
      mapping: routeServiceReferenceMapping(upstreamModel, downstreamModel),
      authorityMode: 'ae_curated_external',
      registrationEvidenceRefs: ['test:public-route-mapping'],
    })).resolves.toMatchObject({ kind: 'registered' })
    const upstreamOperation = await publishedOperationForModel(backend, upstreamModel)
    const downstreamOperation = await publishedOperationForModel(backend, downstreamModel)
    const requestInput = upstreamModel.inputs.find((input) => input.inputPointer === '/request')
    if (requestInput === undefined) throw new Error('upstream request input missing')
    const generate = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates',
        canonicalStatements: [],
        supersededStatements: [],
        selections: [
          { operationRef: upstreamOperation.operationRef, selectionKey: upstreamModel.selectionKey, facts: [{ inputKey: requestInput.key, value: 'Resolve this service and prepare its quote' }] },
          { operationRef: downstreamOperation.operationRef, selectionKey: downstreamModel.selectionKey, facts: [] },
        ],
      }) }, finish_reason: 'stop' }],
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
      systemInstructionVersion: 'customer-request-semantic:v12',
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
          maximumTotalCost: { kind: 'known', amount: { currency: 'AUD', units: '1000', exponent: 2 } },
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
    const refreshedUpstreamOperation = await publishedOperationForModel(backend, upstreamModel)
    generate.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates',
        canonicalStatements: [],
        supersededStatements: [],
        selections: [
          { operationRef: refreshedUpstreamOperation.operationRef, selectionKey: upstreamModel.selectionKey, facts: [{ inputKey: requestInput.key, value: 'Resolve this service and prepare its quote' }] },
          { operationRef: downstreamOperation.operationRef, selectionKey: downstreamModel.selectionKey, facts: [] },
        ],
      }) }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
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
        routes: [{ maximumTotalCost: { kind: 'known', amount: { currency: 'AUD', units: '1025', exponent: 2 } } }],
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
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates', canonicalStatements: [], supersededStatements: [], selections: [
        { operationRef: refreshedUpstreamOperation.operationRef, selectionKey: upstreamModel.selectionKey, facts: [
          { inputKey: requestInput.key, value: 'A conflicting request interpretation' },
        ] },
      ] }) }, finish_reason: 'stop' }],
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
    const upstreamV3Operation = await publishedOperationForModel(backend, upstreamV3Model)
    await expect(admin.mutation(api.capabilitySupply.registerMapping, {
      networkId: 'ae:public',
      mapping: routeServiceReferenceMapping(upstreamV3Model, downstreamModel),
      authorityMode: 'ae_curated_external',
      registrationEvidenceRefs: ['test:public-route-v3-mapping'],
    })).resolves.toMatchObject({ kind: 'registered' })
    generate.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates',
        canonicalStatements: [],
        supersededStatements: [],
        selections: [
          { operationRef: upstreamV3Operation.operationRef, selectionKey: upstreamV3Model.selectionKey, facts: [{ inputKey: upstreamV3RequestInput.key, value: 'Resolve this service and prepare its quote' }] },
          { operationRef: downstreamOperation.operationRef, selectionKey: downstreamModel.selectionKey, facts: [] },
        ],
      }) }, finish_reason: 'stop' }],
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
      maximumTotalCost: { kind: 'known', amount: { currency: 'AUD', units: '1050', exponent: 2 } },
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
    const validationOperation = await publishedOperationForModel(backend, validationModel)
    const validatedQuoteOperation = await publishedOperationForModel(backend, validatedQuoteModel)
    for (const [mapping, evidenceRef] of [
      [routeServiceReferenceMapping(upstreamV3Model, validationModel), 'test:public-route-validation-mapping'],
      [routeServiceReferenceMapping(validationModel, validatedQuoteModel), 'test:public-route-validated-quote-mapping'],
    ] as const) {
      await expect(admin.mutation(api.capabilitySupply.registerMapping, {
        networkId: 'ae:public', mapping, authorityMode: 'ae_curated_external',
        registrationEvidenceRefs: [evidenceRef],
      })).resolves.toMatchObject({ kind: 'registered' })
    }
    generate.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates',
        canonicalStatements: [],
        supersededStatements: [],
        selections: [
          { operationRef: upstreamV3Operation.operationRef, selectionKey: upstreamV3Model.selectionKey, facts: [{ inputKey: upstreamV3RequestInput.key, value: 'Resolve this service and prepare its quote' }] },
          { operationRef: validationOperation.operationRef, selectionKey: validationModel.selectionKey, facts: [] },
          { operationRef: validatedQuoteOperation.operationRef, selectionKey: validatedQuoteModel.selectionKey, facts: [] },
        ],
      }) }, finish_reason: 'stop' }],
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
      maximumTotalCost: { kind: 'known', amount: { currency: 'AUD', units: '950', exponent: 2 } },
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
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'needs_intent_direction', prompt: 'What result should the businesses produce?',
      }) }, finish_reason: 'stop' }],
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
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'unsupported_request',
        reason: 'requested_result_not_available',
        prompt: '',
        canonicalStatements: [],
        supersededStatements: [],
        selections: [],
      }) }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const unsupportedRefresh = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef, revision: submitted.revision,
      idempotencyKey: 'compare:multi-capability:unsupported-refresh',
    })
    expect(unsupportedRefresh).toMatchObject({
      kind: 'request', revision: 1, state: 'needs_information', nextAction: 'provide_information',
    })
    await expect(restartedCustomer.action(api.customerRequestApplication.resume, {
      requestRef: submitted.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', revision: 1, state: 'needs_information', nextAction: 'provide_information',
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


async function publishAndActivate(
  backend: RouteTestBackend, admin: ConvexFixtureAdmin,
  suffix: string, document: RouteCapabilityDocument, priceUnits: number,
  options: Readonly<{ adapterCancellation?: boolean }> = {},
) {
  const { businessId, owner } = await publishedBusinessOwner(
    backend,
    suffix,
    { slugPrefix: 'route-', identityPrefix: 'route_' },
  )
  const connectionRef = `connection:route:${suffix}`
  const providerRef = `provider:route:${suffix}`
  const credentialRef = document.capabilityId.includes('quote')
    ? 'env:ROUTE_ADMISSION_QUOTER_KEY'
    : 'env:ROUTE_ADMISSION_RESOLVER_KEY'
  const connection = await admin.mutation(internal.capabilityProviderConnections.create, {
    commandId: `create:route-connection:${suffix}`,
    connectionRef,
    businessId,
    providerRef,
    providerAccountRef: `account:route:${suffix}`,
    adapterId: 'http-json:v1',
    credentialRef,
    requestedScopes: [],
    grantedScopes: [],
    requestedResources: [],
    grantedResources: [],
    evidenceRefs: [`test:connection:${suffix}`],
    now: 1,
  })
  if (connection.kind !== 'applied') throw new Error(`provider connection refused: ${connection.kind}`)
  const offering = {
    offeringId: `offering:route:${suffix}`, networkId: 'ae:public',
    presentation: {
      label: document.name, summary: document.description,
      price: { kind: 'fixed' as const, amount: { currency: 'AUD', units: String(priceUnits), exponent: 2 } }, materialTerms: [],
      commercialRelationship: { kind: 'none' as const, summary: 'No commercial influence.', influencesEligibility: false, influencesInclusion: false, influencesOrder: false, evidenceRefs: ['test:commercial-neutrality'] },
    },
    searchTerms: ['service', 'quote'], registrationEvidenceRefs: [`test:publication:${suffix}`],
  } satisfies CapabilityPublicationOfferingDraft
  const binding = {
    bindingId: `binding:route:${suffix}`, endpointUrl: `https://${suffix}.example.test/capability`,
    authority: {
      kind: 'provider_connection',
      connectionRef,
      providerRef,
    },
    continuation: { kind: 'single_response' as const, evidenceRefs: ['test:single-response'] },
    cancellation: options.adapterCancellation
      ? { kind: 'adapter_managed' as const, evidenceRefs: ['test:adapter-cancellation'] }
      : { kind: 'unsupported' as const, evidenceRefs: ['test:no-cancellation'] },
    adapter: {
      adapterId: 'http-json:v1',
      config: {
        method: 'POST' as const, requestTimeoutMs: 5_000,
        credential: { kind: 'bearer' as const },
        ...(options.adapterCancellation
          ? { cancellation: { path: '/ae/cancel', requestTimeoutMs: 3_000 } }
          : {}),
      },
    }, registrationEvidenceRefs: [`test:binding:${suffix}`],
  } satisfies CapabilityPublicationBindingDraft
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
  backend: RouteTestBackend, publication: Readonly<{ publicationRef: string; revision: number }>, suffix: string,
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
  backend: RouteTestBackend,
  admin: ConvexFixtureAdmin,
  current: Awaited<ReturnType<typeof publishAndActivate>>,
  document: RouteCapabilityDocument,
  priceUnits: number,
  suffix: string,
) {
  const offering = {
    ...current.offering,
    offeringId: `offering:route:${suffix}`,
    presentation: {
      ...current.offering.presentation,
      label: document.name,
      summary: document.description,
      price: { kind: 'fixed' as const, amount: { currency: 'AUD', units: String(priceUnits), exponent: 2 } },
    },
    registrationEvidenceRefs: [`test:publication:${suffix}`],
  } satisfies CapabilityPublicationOfferingDraft
  const binding = {
    ...current.binding,
    bindingId: `binding:route:${suffix}`,
    endpointUrl: `https://${suffix}.example.test/capability`,
    registrationEvidenceRefs: [`test:binding:${suffix}`],
  } satisfies CapabilityPublicationBindingDraft
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

async function publishedOperationForModel(
  backend: RouteTestBackend,
  model: CapabilityDecisionModel,
) {
  const now = Date.now()
  const supply = await backend.run(async (ctx) => (
    await listRouteableCapabilitySupply(ctx.db, {
      networkId: 'ae:public', limit: 64, now,
    })
  ))
  if (supply.kind !== 'available') throw new Error(`supply unavailable: ${supply.reason}`)
  const publication = supply.supplies.find(({ binding }) => (
    binding.capabilityId === model.contractRef.capabilityId
  ))?.publication
  if (publication === undefined) throw new Error(`operation missing: ${model.contractRef.capabilityId}`)
  return publication
}

async function seedCuratedHeterogeneousSupply(backend: RouteTestBackend) {
  const seeded = await backend.mutation(internal.devSeed.seedDevCatalog, {})
  await finishImmediateReadinessProbe(backend)
  const intendedCapabilityIds: Record<string, true> = {
    'exa.search': true,
    'exa.contents': true,
    'frankfurter.single-rate': true,
  }
  const publications = await backend.run(async (ctx) => (
    (await ctx.db.query('capabilityPublications').collect()).filter(({ capabilityId, disposition }) => (
      disposition === 'current' && intendedCapabilityIds[capabilityId] === true
    ))
  ))
  const actualCapabilityIds = publications.map(({ capabilityId }) => capabilityId).sort()
  const expectedCapabilityIds = Object.keys(intendedCapabilityIds).sort()
  if (actualCapabilityIds.length !== expectedCapabilityIds.length
    || actualCapabilityIds.some((capabilityId, index) => capabilityId !== expectedCapabilityIds[index])) {
    throw new Error('curated heterogeneous fixture publication set mismatch')
  }
  for (const publication of publications) {
    await observeReady(backend, {
      publicationRef: publication.publicationRef,
      revision: publication.revision,
    }, `curated:${publication.bindingId}`)
  }
  return seeded
}

async function confirmedTwoStepRoute(
  backend: RouteTestBackend,
  admin: ConvexFixtureAdmin,
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
  backend: RouteTestBackend,
  admin: ConvexFixtureAdmin,
  options: Readonly<{ adapterCancellation?: boolean }> = {},
) {
  const first = await publishAndActivate(backend, admin, 'admission-resolver', upstreamDocument, 300, options)
  const second = await publishAndActivate(backend, admin, 'admission-quoter', downstreamDocument, 700)
  await observeReady(backend, first, 'admission-resolver-stable')
  await observeReady(backend, second, 'admission-quoter-stable')
  const now = Date.now()
  const supply = await backend.run(async (ctx) => (
    await listRouteableCapabilitySupply(ctx.db, {
      networkId: 'ae:public', limit: 64, now,
    })
  ))
  if (supply.kind !== 'available') throw new Error(`supply unavailable: ${supply.reason}`)
  const upstreamModel = openCapabilityDecisionModel(defineCapabilityContract(upstreamDocument))
  const downstreamModel = openCapabilityDecisionModel(defineCapabilityContract(downstreamDocument))
  const requestInput = upstreamModel.inputs.find((input) => input.inputPointer === '/request')
  if (requestInput === undefined) throw new Error('upstream request input missing')
  const upstreamPublication = supply.supplies.find(({ binding }) => (
    binding.capabilityId === upstreamModel.contractRef.capabilityId
  ))?.publication
  const downstreamPublication = supply.supplies.find(({ binding }) => (
    binding.capabilityId === downstreamModel.contractRef.capabilityId
  ))?.publication
  if (upstreamPublication === undefined || downstreamPublication === undefined) {
    throw new Error('two-step publication lineage missing')
  }
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
          operationRef: upstreamPublication.operationRef,
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
        {
          operationRef: downstreamPublication.operationRef,
          selectionKey: downstreamModel.selectionKey,
          contractRef: downstreamModel.contractRef,
          facts: [],
        },
      ],
    },
    interpreterId: 'interpreter:two-step-admission',
    mappings: [routeServiceReferenceMapping(upstreamModel, downstreamModel)],
    bindings: registeredEvaluationBindingsFromRouteableSupply(supply, { includePublication: true }),
    models: [upstreamModel, downstreamModel],
    now,
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
  backend: RouteTestBackend,
  admin: ConvexFixtureAdmin,
) {
  await publishAndActivate(backend, admin, 'one-step-resolver', upstreamDocument, 300)
  const now = Date.now()
  const supply = await backend.run(async (ctx) => (
    await listRouteableCapabilitySupply(ctx.db, {
      networkId: 'ae:public', limit: 64, now,
    })
  ))
  if (supply.kind !== 'available') throw new Error(`supply unavailable: ${supply.reason}`)
  const model = openCapabilityDecisionModel(defineCapabilityContract(upstreamDocument))
  const requestInput = model.inputs.find((input) => input.inputPointer === '/request')
  if (requestInput === undefined) throw new Error('one-step request input missing')
  const publication = supply.supplies[0]?.publication
  if (publication === undefined) throw new Error('one-step publication lineage missing')
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
        operationRef: publication.operationRef,
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
    mappings: [],
    bindings: supply.supplies.flatMap(({ offering, binding, publication }) => (
      publication === undefined ? [] : [{
        operationRef: publication.operationRef,
        admittedOperation: publication.admittedOperation,
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
    now,
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

async function finishImmediateReadinessProbe(backend: RouteTestBackend) {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await backend.finishInProgressScheduledFunctions()
}

async function nextDispatch(backend: RouteTestBackend) {
  return await backend.run(async (ctx) => {
    const dispatch = await ctx.db.query('customerRequestRouteDispatchOutbox')
      .withIndex('by_state_and_availableAt', (query) => (
        query.eq('state', 'pending').lte('availableAt', Date.now())
      )).first()
    if (dispatch === null) throw new Error('pending route dispatch missing')
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', dispatch.attemptRef)).unique()
    if (attempt === null) throw new Error('pending route attempt missing')
    return {
      kind: 'leased' as const,
      dispatch: {
        dispatchRef: dispatch.dispatchRef,
        attemptRef: dispatch.attemptRef,
        operationKeyDigest: dispatch.operationKeyDigest,
        inputJson: attempt.inputJson,
        inputDigest: attempt.inputDigest,
        position: attempt.position,
      },
    }
  })
}

async function finishScheduledRouteWorkers(backend: RouteTestBackend, passes: number) {
  for (let pass = 0; pass < passes; pass += 1) {
    const dispatchRef = await backend.run(async (ctx) => {
      const dispatch = await ctx.db.query('customerRequestRouteDispatchOutbox')
        .withIndex('by_state_and_availableAt', (query) => (
          query.eq('state', 'pending').lt('availableAt', Date.now())
        )).first()
      return dispatch?.dispatchRef ?? null
    })
    if (dispatchRef === null) return
    await backend.action(internal.customerRequestRouteTransportWorker.run, { dispatchRef })
  }
}


async function supportAdmin(backend: RouteTestBackend) {
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

async function reviewerAdmin(backend: RouteTestBackend) {
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

async function businessOwnerForAttempt(
  backend: RouteTestBackend,
  attemptRef: string,
) {
  const identity = await backend.run(async (ctx) => {
    const attempt = (await ctx.db.query('customerRequestRouteStepAttempts').take(20))
      .find((candidate) => candidate.attemptRef === attemptRef)
    if (attempt === undefined) throw new Error('attempt missing')
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
