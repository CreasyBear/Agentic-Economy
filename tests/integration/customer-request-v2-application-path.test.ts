import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT } from '@/modules/sandbox-supply/public'
import { sandboxWorkflowCapabilityContractDocument } from '@/modules/sandbox-supply/workflow-cohorts'
import { encodeCapabilityContractDocument } from '@/modules/capability-contract-registry/public'
import { registerCapabilityContractDocument } from '../../convex/capabilityContractDocuments'
import {
  registerCapabilityBindingCommand,
  registerCapabilityOfferingCommand,
  setCapabilitySupplyEligibility,
} from '../../convex/capabilitySupply'
import { createCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'
import { api, internal } from '../../convex/_generated/api'
import {
  admitSandboxV2Supply,
  registerSandboxBusinesses,
  registerSandboxV2SupplyRegistrations,
  seedSandboxCapabilityPublication,
} from '../../convex/devSeed'
import { DEV_SEED_BUSINESS_FIXTURES } from '@/modules/dev/public'
import { convexTestWithWorkers } from '../helpers/convex-fixtures'
const identity = { subject: 'customer-v2', issuer: 'https://identity.test' }
const principalId = `${identity.issuer}|${identity.subject}`

function modelResponse(content: unknown): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { role: 'assistant', content: JSON.stringify(content) }, finish_reason: 'stop' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('current V2 Customer Request application path', () => {
  beforeEach(() => vi.stubEnv('CLERK_JWT_ISSUER_DOMAIN', identity.issuer))

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('preserves the unsupported Request data disposition through the durable application projection', async () => {
    const backend = await convexTestWithWorkers()
    await seedSandboxV2Supply(backend)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'unsupported_request',
        reason: 'requested_result_not_available',
        prompt: '',
        selections: [],
      }) }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)

    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:privacy-disposition',
      requestId: 'request:v2:privacy-disposition',
      delegatedAgentId: 'agent:external:v2',
      customerJob: 'Book and pay for a guaranteed appointment. Private medical context is included.',
      routing: { networkId: 'ae:public' },
    })

    expect(submitted).toMatchObject({
      kind: 'request',
      state: 'unsupported',
      nextAction: 'revise_request',
      dataHandling: {
        requestStorage: 'saved_for_revision',
        businessSharing: 'not_shared',
        explanation: 'AE saved this revision so you can change it. No information from this revision was sent to a business.',
      },
      unsupportedRecovery: {
        reason: 'requested_result_not_available',
        preservedRequest: true,
        authorityCreatedForThisRevision: false,
        businessContactedForThisRevision: false,
        nextStep: {
          kind: 'change_request',
          summary: 'Change the outcome you want while keeping this Request and its history.',
        },
      },
    })
    await expect(customer.action(api.customerRequestApplication.resume, {
      requestRef: 'request:v2:privacy-disposition',
    })).resolves.toMatchObject({
      ...submitted,
      recovery: {
        state: 'restored',
        restoredAt: expect.any(Number),
        workRestarted: false,
      },
    })
  })

  it('uses eligible V2 supply, opaque interpretation and one durable exact aggregate', async () => {
    const backend = await convexTestWithWorkers()
    await seedSandboxV2Supply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const input = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (input === undefined) throw new Error('sandbox request input missing')
    const generate = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [{
          selectionKey: model.selectionKey,
          facts: [{ inputKey: input.key, value: 'Compare labelled sandbox options' }],
        }],
      }) }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', generate)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)

    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:1', requestId: 'request:v2:application',
      delegatedAgentId: 'agent:external:v2', customerJob: 'Compare labelled sandbox options',
      routing: { networkId: 'ae:public' },
    })
    expect(submitted).toMatchObject({
      kind: 'request', requestRef: 'request:v2:application', revision: 1,
      state: 'ready_to_compare', nextAction: 'prepare_options',
    })
    await backend.run(async (ctx) => {
      const shell = await ctx.db.query('customerRequestV2SubmissionShells')
        .withIndex('by_requestId', (query) => query.eq('requestId', 'request:v2:application')).unique()
      if (shell === null) throw new Error('submission shell missing')
      await ctx.db.delete(shell._id)
    })
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const replayedSubmit = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:1', requestId: 'request:v2:application',
      delegatedAgentId: 'agent:external:v2', customerJob: 'Compare labelled sandbox options',
      routing: { networkId: 'ae:public' },
    })
    expect(replayedSubmit).toEqual(submitted)
    expect(JSON.stringify(replayedSubmit)).toBe(JSON.stringify(submitted))
    expect(generate).toHaveBeenCalledTimes(1)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    await expect(customer.action(api.customerRequestApplication.resume, {
      requestRef: 'request:v2:application',
    })).resolves.toMatchObject({
      kind: 'request', requestRef: 'request:v2:application', revision: 1,
      state: 'routes_ready',
    })
    if (submitted.kind !== 'request') throw new Error('submitted request missing')
    const answered = submitted

    const decision = await customer.action(api.customerRequestApplication.compare, {
      requestRef: answered.requestRef, revision: answered.revision, idempotencyKey: 'prepare:v2:1',
    })
    expect(decision).toMatchObject({
      kind: 'request', requestRef: 'request:v2:application', revision: 1,
      state: 'routes_ready', nextAction: 'inspect_routes',
    })
    await expect(customer.action(api.customerRequestApplication.compare, {
      requestRef: answered.requestRef, revision: answered.revision, idempotencyKey: 'prepare:v2:1',
    })).resolves.toEqual(decision)
    if (decision.kind !== 'request') throw new Error('route decision missing')
    const historicalPreparation = await beginHistoricalPreparationProof(backend, {
      requestRef: decision.requestRef, revision: decision.revision, principalId, suffix: 'v2:1',
    })
    const review = { ...decision, preparationRef: historicalPreparation.preparationRef }
    const authorized = await customer.action(api.customerRequestApplication.authorizePreparation, {
      requestRef: review.requestRef, revision: review.revision,
      preparationRef: review.preparationRef, idempotencyKey: 'authorize:v2:1',
    })
    expect(authorized).toMatchObject({
      kind: 'request', requestRef: review.requestRef, revision: review.revision,
      state: 'needs_attention', nextAction: 'revise_request', preparationRef: review.preparationRef,
    })
    await expect(customer.action(api.customerRequestApplication.authorizePreparation, {
      requestRef: review.requestRef, revision: review.revision,
      preparationRef: review.preparationRef, idempotencyKey: 'authorize:v2:1',
    })).resolves.toEqual(authorized)
    await expect(customer.action(api.customerRequestApplication.compare, {
      requestRef: answered.requestRef, revision: answered.revision, idempotencyKey: 'prepare:v2:1',
    })).resolves.toEqual(decision)

    const modelRequest = JSON.stringify(generate.mock.calls[0])
    expect(modelRequest).not.toContain(model.contractRef.capabilityId)
    expect(modelRequest).not.toContain(model.contractRef.contractDigest)
    expect(modelRequest).not.toContain(input.inputPointer)
    const persisted = await backend.run(async (ctx) => ({
      heads: await ctx.db.query('customerRequestV2Heads').collect(),
      revisions: await ctx.db.query('customerRequestV2Revisions').collect(),
      preparations: await ctx.db.query('customerRequestV2ActionPreparations').collect(),
      preparationCommands: await ctx.db.query('customerRequestV2PreparationCommands').collect(),
      reviews: await ctx.db.query('customerRequestV2PreparationDisclosureReviews').collect(),
      approvals: await ctx.db.query('customerRequestV2PreparationApprovalEvidence').collect(),
      reservations: await ctx.db.query('customerRequestV2PreparationAuthorityReservations').collect(),
      egressCommands: await ctx.db.query('customerRequestV2PreparationEgressCommands').collect(),
      operations: await ctx.db.query('customerRequestV2PreparationEgressOperations').collect(),
      allocations: await ctx.db.query('customerRequestV2PreparationDisclosureAllocations').collect(),
      consumption: await ctx.db.query('customerRequestV2PreparationEgressConsumption').collect(),
      legacyHeads: await ctx.db.query('customerRequestHeads').collect(),
      legacyRequests: await ctx.db.query('customerRequests').collect(),
      legacyPreparations: await ctx.db.query('customerRequestPreparationCommands').collect(),
    }))
    const activeRevision = persisted.revisions.find((row) => row.aggregate.snapshot.revision === review.revision)
    if (activeRevision === undefined) throw new Error('active request revision missing')
    expect(persisted.heads).toMatchObject([{ requestId: 'request:v2:application', principalId }])
    expect(activeRevision.aggregate.plan.actions).toMatchObject([
      { contractRef: model.contractRef, selectionKey: model.selectionKey, semanticDigest: model.semanticDigest },
    ])
    expect(activeRevision.aggregate.plan.completionRequirements).toMatchObject([
      { contractRef: model.contractRef, evidenceId: 'option_summary', outputPointer: '/optionSummary', purpose: 'completion' },
    ])
    expect(persisted.preparations).toHaveLength(1)
    expect(persisted.preparations[0]?.preparation).toMatchObject({
      kind: 'ready_for_routing',
      lineage: {
        planRevisionId: activeRevision.aggregate.plan.planRevisionId,
        planDigest: activeRevision.aggregate.plan.planDigest,
        contractRef: model.contractRef, selectionKey: model.selectionKey, semanticDigest: model.semanticDigest,
      },
      authorityReservation: {
        authorityReference: persisted.approvals[0]?.approvalRef,
        approvalDigest: persisted.approvals[0]?.approvalDigest,
        reviewDigest: persisted.reviews[0]?.reviewDigest,
        verification: { kind: 'clerk_owner' },
      },
    })
    expect(persisted.preparationCommands).toHaveLength(2)
    expect(persisted.reviews).toHaveLength(1)
    expect(persisted.approvals).toHaveLength(1)
    expect(persisted.reservations).toHaveLength(1)
    expect(persisted.egressCommands).toHaveLength(1)
    expect(persisted.operations).toHaveLength(2)
    expect(persisted.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: 'not_released', authorityReference: persisted.reservations[0]?.reservationRef }),
    ]))
    expect(persisted.allocations).toHaveLength(2)
    expect(persisted.consumption).toMatchObject([{
      maximumRecipients: 2, maximumOperations: 2, maximumExposures: 2,
      consumedRecipients: 2, consumedOperations: 2, consumedExposures: 2,
    }])
    expect(JSON.stringify(persisted.allocations)).not.toContain('Compare labelled sandbox options')
    expect(persisted.approvals[0]).toMatchObject({
      preparationRef: review.preparationRef,
      reviewDigest: persisted.reviews[0]?.reviewDigest,
      authorityScopeDigest: persisted.preparations[0]?.preparation.authorityScope.authorityScopeDigest,
      commandDigest: persisted.preparationCommands[1]?.commandDigest,
      ownerId: identity.subject,
    })
    for (const row of [
      persisted.preparations[0], persisted.preparationCommands[0],
      persisted.reviews[0], persisted.approvals[0], persisted.reservations[0],
    ]) expect(row).toMatchObject({ lineage: {
      requestId: 'request:v2:application', requestRevision: 1,
      planRevisionId: activeRevision.aggregate.plan.planRevisionId,
      planDigest: activeRevision.aggregate.plan.planDigest,
      contractRef: model.contractRef, selectionKey: model.selectionKey, semanticDigest: model.semanticDigest,
    } })
    expect(persisted.legacyHeads).toEqual([])
    expect(persisted.legacyRequests).toEqual([])
    expect(persisted.legacyPreparations).toEqual([])
  })

  it('does not return an unchanged option after the customer reports that exact option cannot work', async () => {
    const backend = await convexTestWithWorkers()
    await seedSandboxV2Supply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const input = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (input === undefined) throw new Error('sandbox request input missing')
    const selected = {
      kind: 'capability_candidates',
      selections: [{
        selectionKey: model.selectionKey,
        facts: [{ inputKey: input.key, value: 'Find an option before the hard deadline.' }],
      }],
    }
    const replacementRequest = 'Find an option with a flexible deadline.'
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(modelResponse(selected))
      .mockResolvedValueOnce(modelResponse({
        ...selected,
        selections: [{
          selectionKey: model.selectionKey,
          facts: [{ inputKey: input.key, value: replacementRequest }],
        }],
      }))
      .mockRejectedValue(new Error('reported option feedback must not require model reinterpretation')))
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)
    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:reported-option-failure',
      requestId: 'request:v2:reported-option-failure',
      delegatedAgentId: 'agent:reported-option-failure',
      customerJob: 'Find an option before the hard deadline.',
      routing: { networkId: 'ae:public' },
    })
    if (submitted.kind !== 'request') throw new Error('reported-option Request missing')
    await observeSandboxPublications(backend)
    const decision = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef,
      revision: submitted.revision,
      idempotencyKey: 'prepare:v2:reported-option-failure',
    })
    if (decision.kind !== 'request' || decision.state !== 'routes_ready') {
      throw new Error(`reported-option route missing: ${JSON.stringify(decision)}`)
    }
    const rejectedRoute = decision.decision?.routes[0]
    if (rejectedRoute === undefined) throw new Error('reported-option route choice missing')
    const command = {
      requestRef: decision.requestRef,
      expectedRevision: decision.revision,
      idempotencyKey: 'refine:v2:reported-option-failure',
      message: 'This option cannot meet the hard deadline. Exclude it.',
      reportedRouteRef: rejectedRoute.routeRef,
    }

    const refined = await customer.action(api.customerRequestApplication.refine, command)

    expect(refined).toMatchObject({
      kind: 'request',
      requestRef: decision.requestRef,
      revision: 2,
      state: 'ready_to_compare',
      nextAction: 'prepare_options',
      summary: 'Find an option before the hard deadline.',
    })
    if (refined.kind !== 'request') throw new Error('reported-option refinement missing')
    await expect(customer.action(api.customerRequestApplication.refine, command)).resolves.toEqual(refined)
    const replacement = await customer.action(api.customerRequestApplication.compare, {
      requestRef: refined.requestRef,
      revision: refined.revision,
      idempotencyKey: 'prepare:v2:reported-option-replacement',
    })
    expect(replacement).toMatchObject({
      kind: 'request',
      state: 'routes_ready',
      revision: 2,
    })
    if (replacement.kind !== 'request') throw new Error('reported-option replacement missing')
    expect(replacement.confirmation).toBeUndefined()
    expect(replacement.decision?.routes).toHaveLength(1)
    expect(replacement.decision?.routes.map(({ routeRef }) => routeRef)).not.toContain(rejectedRoute.routeRef)
    expect(replacement.decision?.routes[0]?.businesses.map(({ businessRef }) => businessRef))
      .not.toEqual(rejectedRoute.businesses.map(({ businessRef }) => businessRef))
    await expect(customer.action(api.customerRequestApplication.refine, {
      requestRef: replacement.requestRef,
      expectedRevision: replacement.revision,
      idempotencyKey: 'refine:v2:reported-option-stale',
      message: 'The earlier option still cannot work.',
      reportedRouteRef: rejectedRoute.routeRef,
    })).resolves.toEqual({
      kind: 'refused',
      reason: 'invalid_amendment',
    })
    await expect(customer.action(api.customerRequestApplication.refine, {
      requestRef: replacement.requestRef,
      expectedRevision: replacement.revision,
      idempotencyKey: 'refine:v2:reported-option-foreign',
      message: 'This option cannot work.',
      reportedRouteRef: 'choice:foreign-generation:foreign-route',
    })).resolves.toEqual({
      kind: 'refused',
      reason: 'invalid_amendment',
    })
    const remainingRoute = replacement.decision?.routes[0]
    if (remainingRoute === undefined) throw new Error('reported-option remaining route missing')
    const noAlternative = await customer.action(api.customerRequestApplication.refine, {
      requestRef: replacement.requestRef,
      expectedRevision: replacement.revision,
      idempotencyKey: 'refine:v2:reported-option-no-alternative',
      message: 'This replacement also cannot meet the hard deadline.',
      reportedRouteRef: remainingRoute.routeRef,
    })
    expect(noAlternative).toMatchObject({
      kind: 'request',
      requestRef: replacement.requestRef,
      revision: 3,
      state: 'unsupported',
      nextAction: 'revise_request',
      unsupportedRecovery: {
        reason: 'reported_option_unavailable',
        preservedRequest: true,
        authorityCreatedForThisRevision: false,
        businessContactedForThisRevision: false,
      },
    })
    if (noAlternative.kind !== 'request') throw new Error('reported-option unsupported recovery missing')
    expect(noAlternative.confirmation).toBeUndefined()
    expect(noAlternative.decision).toBeUndefined()
    const persisted = await backend.run(async (ctx) => (
      await ctx.db.query('customerRequestV2Revisions')
        .withIndex('by_requestId_and_requestRevision', (query) => (
          query.eq('requestId', refined.requestRef).eq('requestRevision', 3)
        )).unique()
    ))
    expect(persisted?.aggregate.snapshot.routeExclusions).toMatchObject([
      {
        reportedRouteRef: rejectedRoute.routeRef,
        reason: command.message,
        recordedAtRevision: 2,
      },
      {
        reportedRouteRef: remainingRoute.routeRef,
        reason: 'This replacement also cannot meet the hard deadline.',
        recordedAtRevision: 3,
      },
    ])
    const recoveryCommand = {
      requestRef: noAlternative.requestRef,
      expectedRevision: noAlternative.revision,
      idempotencyKey: 'replace:v2:reported-option-recovery',
      message: replacementRequest,
      mode: 'replace' as const,
    }
    const recovered = await customer.action(api.customerRequestApplication.refine, recoveryCommand)
    expect(recovered).toMatchObject({
      kind: 'request',
      requestRef: noAlternative.requestRef,
      revision: 4,
      state: 'ready_to_compare',
      nextAction: 'prepare_options',
      summary: replacementRequest,
    })
    const recoveredRevision = await backend.run(async (ctx) => (
      await ctx.db.query('customerRequestV2Revisions')
        .withIndex('by_requestId_and_requestRevision', (query) => (
          query.eq('requestId', noAlternative.requestRef).eq('requestRevision', 4)
        )).unique()
    ))
    expect(recoveredRevision?.aggregate.snapshot.routeExclusions).toBeUndefined()
    await expect(customer.action(api.customerRequestApplication.refine, recoveryCommand)).resolves.toEqual(recovered)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('asks once for a registered procurement specification and continues the same Request after the answer', async () => {
    const backend = await convexTestWithWorkers()
    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    await observeSandboxPublications(backend, true)
    const currentSupply = await backend.query(internal.capabilitySupply.listIntegrated, {
      networkId: 'ae:public',
      limit: 64,
    })
    if (currentSupply.kind !== 'available') throw new Error('procurement supply unavailable')
    const procurementSupplies = currentSupply.supplies.filter(({ binding }) => (
      binding.bindingId === 'binding:sandbox-procurement-brief:http-json:v3'
    ))
    expect(procurementSupplies).toHaveLength(1)
    expect(procurementSupplies[0]?.publication).toMatchObject({
      readinessValidUntil: expect.any(Number),
    })
    const document = sandboxWorkflowCapabilityContractDocument('procurement-brief')
    const model = openCapabilityDecisionModel(defineCapabilityContract(document))
    const requestInput = model.inputs.find(({ inputPointer }) => inputPointer === '/request')
    const dimensionsInput = model.inputs.find(({ inputPointer }) => inputPointer === '/packageDimensions')
    if (requestInput === undefined || dimensionsInput === undefined) {
      throw new Error('procurement decision inputs missing')
    }
    const customerJob = 'Source 500 food-safe custom cartons within 21 days under AUD 4,000.'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [{
          selectionKey: model.selectionKey,
          facts: [{ inputKey: requestInput.key, value: customerJob }],
        }],
      }) }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)

    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:procurement-specification',
      requestId: 'request:v2:procurement-specification',
      delegatedAgentId: 'agent:procurement',
      customerJob,
      routing: { networkId: 'ae:public' },
    })
    expect(submitted).toMatchObject({
      kind: 'request',
      requestRef: 'request:v2:procurement-specification',
      revision: 1,
      state: 'needs_information',
      nextAction: 'provide_information',
      missingFields: [{
        label: 'Internal carton dimensions',
        explanation: 'This answer changes which options can be considered now.',
      }],
      clarification: {
        kind: 'contract_fact',
        prompt: 'What internal length, width, and height must each carton fit?',
      },
    })
    if (submitted.kind !== 'request' || submitted.clarification?.kind !== 'contract_fact') {
      throw new Error(`procurement clarification missing: ${JSON.stringify(submitted)}`)
    }

    const answered = await customer.action(api.customerRequestApplication.provideFacts, {
      requestRef: submitted.requestRef,
      expectedRevision: submitted.revision,
      idempotencyKey: 'fact:v2:procurement-dimensions',
      requirementKey: submitted.clarification.requirementKey,
      value: '300 × 200 × 150 mm internal',
    })
    expect(answered).toMatchObject({
      kind: 'request',
      requestRef: submitted.requestRef,
      revision: 2,
      state: 'ready_to_compare',
      nextAction: 'prepare_options',
      criteria: expect.arrayContaining([expect.objectContaining({
        label: 'Internal carton dimensions',
        value: '300 × 200 × 150 mm internal',
        basis: 'customer_provided',
      })]),
    })
    if (answered.kind !== 'request') throw new Error(`procurement answer failed: ${answered.reason}`)
    expect(answered.missingFields).toEqual([])
    expect(answered.clarification).toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(1)
    await expect(customer.action(api.customerRequestApplication.provideFacts, {
      requestRef: submitted.requestRef,
      expectedRevision: submitted.revision,
      idempotencyKey: 'fact:v2:procurement-dimensions',
      requirementKey: submitted.clarification.requirementKey,
      value: '300 × 200 × 150 mm internal',
    })).resolves.toEqual(answered)
  })

  it('starts a customer-confirmed route from the normally seeded registered supply', async () => {
    const backend = await convexTestWithWorkers()
    await seedSandboxV2Supply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const requestInput = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (requestInput === undefined) throw new Error('sandbox request input missing')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [{
          selectionKey: model.selectionKey,
          facts: [{ inputKey: requestInput.key, value: 'Compare labelled sandbox options' }],
        }],
      }) }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)
    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:seeded-run', requestId: 'request:v2:seeded-run',
      delegatedAgentId: 'agent:external:v2', customerJob: 'Compare labelled sandbox options',
      routing: { networkId: 'ae:public' },
    })
    if (submitted.kind !== 'request') throw new Error('seeded route request missing')
    const answered = submitted
    const compared = await customer.action(api.customerRequestApplication.compare, {
      requestRef: answered.requestRef, revision: answered.revision,
      idempotencyKey: 'compare:v2:seeded-run',
    })
    if (compared.kind !== 'request' || compared.decision?.routes[0] === undefined) {
      throw new Error(`seeded customer route missing: ${JSON.stringify(compared)}`)
    }
    const route = compared.decision.routes[0]
    const confirmed = await customer.action(api.customerRequestApplication.confirmRoute, {
      requestRef: compared.requestRef, revision: compared.revision, routeRef: route.routeRef,
      idempotencyKey: 'confirm:v2:seeded-run',
    })
    expect(confirmed).toMatchObject({ kind: 'request', state: 'route_confirmed' })
    await expect(customer.action(api.customerRequestApplication.runRoute, {
      requestRef: compared.requestRef, idempotencyKey: 'run:v2:seeded-run',
    })).resolves.toMatchObject({
      kind: 'request', state: 'in_progress', nextAction: 'wait',
      progress: { completed: 0, total: 1, current: { step: 1, state: 'queued' } },
    })
  })

  it('replays the exact submit view when registered preparation disclosure requires customer authority', async () => {
    const backend = await convexTestWithWorkers()
    const seeded = await backend.mutation(internal.devSeed.seedDevCatalog, {})
    const businessId = seeded.businessIdsBySlug['sandbox-option-one']
    if (businessId === undefined) throw new Error('disclosure business missing')
    const disclosureContract = {
      ...SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT,
      capabilityId: 'sandbox.disclosure.lookup',
      dataUse: [{
        ...SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT.dataUse[0],
        classification: 'personal' as const,
      }],
    }
    const model = openCapabilityDecisionModel(defineCapabilityContract(disclosureContract))
    await registerDisclosureSupply(backend, disclosureContract, businessId)
    const requestInput = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (requestInput === undefined) throw new Error('disclosure request input missing')
    const generate = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [{
          selectionKey: model.selectionKey,
          facts: [{ inputKey: requestInput.key, value: 'Compare a private request safely' }],
        }],
      }) }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', generate)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)
    const command = {
      compilationKey: 'submit:v2:disclosure', requestId: 'request:v2:disclosure',
      delegatedAgentId: 'agent:external:v2', customerJob: 'Compare a private request safely',
      routing: { networkId: 'ae:public' },
    }

    const submitted = await customer.action(api.customerRequestApplication.submit, command)
    expect(submitted).toMatchObject({
      kind: 'request', requestRef: 'request:v2:disclosure', revision: 1,
      state: 'needs_authorization', nextAction: 'review_disclosure',
      disclosureReview: {
        purpose: 'Return sandbox result', maximumRecipients: 1,
        categories: [{ label: 'What should the business look up?', classification: 'personal' }],
      },
    })
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const replayed = await customer.action(api.customerRequestApplication.submit, command)
    expect(replayed).toEqual(submitted)
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(submitted))
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('discards an invalid model shape and preserves the literal customer request without restatement', async () => {
    const backend = await convexTestWithWorkers()
    await seedSandboxV2Supply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const requestInput = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (requestInput === undefined) throw new Error('sandbox request input missing')
    const generate = vi.fn().mockImplementation(async () => modelResponse({
      kind: 'capability_candidates',
      selections: [{
        selectionKey: model.selectionKey,
        facts: [{ inputKey: requestInput.key, value: { criteria: 'cheapest labelled sandbox' } }],
      }],
    }))
    vi.stubGlobal('fetch', generate)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)

    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:retry', requestId: 'request:v2:retry',
      delegatedAgentId: 'agent:external:v2', customerJob: 'Find the cheapest labelled sandbox option.',
      routing: { networkId: 'ae:public' },
    })

    expect(submitted).toMatchObject({
      kind: 'request', requestRef: 'request:v2:retry', revision: 1,
      state: 'ready_to_compare', nextAction: 'prepare_options',
    })
    expect(generate).toHaveBeenCalledTimes(1)
    const persisted = await backend.run(async (ctx) => (
      await ctx.db.query('customerRequestV2Revisions')
        .withIndex('by_requestId_and_requestRevision', (query) => (
          query.eq('requestId', 'request:v2:retry').eq('requestRevision', 1)
        )).unique()
    ))
    expect(persisted?.aggregate.snapshot.facts).toMatchObject([{
      value: 'Find the cheapest labelled sandbox option.', source: { kind: 'customer' },
    }])
  })

  it('lets an external agent prepare but never promotes its API signature into customer authority', async () => {
    const backend = await convexTestWithWorkers()
    await seedSandboxV2Supply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const input = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (input === undefined) throw new Error('sandbox request input missing')
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(modelResponse({
        kind: 'capability_candidates',
        selections: [{ selectionKey: model.selectionKey, facts: [{ inputKey: input.key, value: 'Find an option' }] }],
      }))
      .mockResolvedValueOnce(modelResponse({
        kind: 'capability_candidates',
        canonicalStatements: [
          { source: 'prior', quote: 'Find an option' },
          { source: 'amendment', quote: 'Prefer the cheapest suitable option.' },
        ],
        selections: [{ selectionKey: model.selectionKey, facts: [{ inputKey: input.key, value: 'Find an option' }] }],
      })))
    const key = 'external-agent-service-key-that-is-long-enough'
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', key)
    const command = {
      compilationKey: 'submit:external:1', requestId: 'request:v2:external',
      delegatedAgentId: 'agent:external', customerJob: 'Find an option', routing: { networkId: 'ae:public' },
    }
    const serviceAuth = await createCustomerRequestServiceAssertion({
      key, operation: 'submit', command,
      principal: {
        principalId: 'principal:external', ownerId: 'owner:external', credentialId: 'credential:external',
        scopes: ['customer_requests:create'],
      },
      issuedAt: Date.now(),
    })

    const submitted = await backend.action(api.customerRequestApplication.submit, {
      ...command, serviceAuth: { ...serviceAuth, scopes: [...serviceAuth.scopes] },
    })
    expect(submitted).toMatchObject({ kind: 'request', requestRef: 'request:v2:external', revision: 1 })
    if (submitted.kind !== 'request') throw new Error('external request missing')
    if (submitted.state !== 'ready_to_compare') {
      throw new Error(`external submitted request not ready: ${JSON.stringify(submitted)}`)
    }
    await backend.run(async (ctx) => {
      const agent = await ctx.db.query('customerRequestAgentPrincipals')
        .withIndex('by_principalId', (query) => query.eq('principalId', 'principal:external')).unique()
      expect(agent?.ownerTokenIdentifier).toBe(`${identity.issuer}|owner:external`)
    })
    await observeSandboxPublications(backend)
    const refineCommand = {
      requestRef: submitted.requestRef, expectedRevision: submitted.revision,
      idempotencyKey: 'refine:external:1', message: 'Prefer the cheapest suitable option.',
    }
    const refineAuth = await createCustomerRequestServiceAssertion({
      key, operation: 'refine', command: refineCommand,
      principal: {
        principalId: 'principal:external:rotated', ownerId: 'owner:external', credentialId: 'credential:external:rotated',
        scopes: ['customer_requests:create'],
      },
      issuedAt: Date.now(),
    })
    const answered = await backend.action(api.customerRequestApplication.refine, {
      ...refineCommand, serviceAuth: { ...refineAuth, scopes: [...refineAuth.scopes] },
    })
    if (answered.kind !== 'request' || answered.state !== 'ready_to_compare') {
      throw new Error(`external refinement missing: ${JSON.stringify(answered)}`)
    }
    const wrongOwnerCommand = {
      requestRef: answered.requestRef, expectedRevision: answered.revision,
      idempotencyKey: 'refine:external:wrong-owner:1', message: 'Change the request.',
    }
    const wrongOwnerAuth = await createCustomerRequestServiceAssertion({
      key, operation: 'refine', command: wrongOwnerCommand,
      principal: {
        principalId: 'principal:external:wrong-owner', ownerId: 'owner:other', credentialId: 'credential:external:wrong-owner',
        scopes: ['customer_requests:create'],
      },
      issuedAt: Date.now(),
    })
    await expect(backend.action(api.customerRequestApplication.refine, {
      ...wrongOwnerCommand, serviceAuth: { ...wrongOwnerAuth, scopes: [...wrongOwnerAuth.scopes] },
    })).resolves.toEqual({ kind: 'refused', reason: 'request_not_found' })
    const prepareCommand = {
      requestRef: answered.requestRef, revision: answered.revision, idempotencyKey: 'prepare:external:1',
    }
    const prepareAuth = await createCustomerRequestServiceAssertion({
      key, operation: 'compare', command: prepareCommand,
      principal: {
        principalId: 'principal:external', ownerId: 'owner:external', credentialId: 'credential:external',
        scopes: ['customer_requests:create'],
      },
      issuedAt: Date.now(),
    })
    const decision = await backend.action(api.customerRequestApplication.compare, {
      ...prepareCommand, serviceAuth: { ...prepareAuth, scopes: [...prepareAuth.scopes] },
    })
    if (decision.kind !== 'request' || decision.state !== 'routes_ready') {
      throw new Error(`external route decision missing: ${JSON.stringify(decision)}`)
    }
    expect(decision).toMatchObject({ kind: 'request', state: 'routes_ready' })
    const historicalPreparation = await beginHistoricalPreparationProof(backend, {
      requestRef: decision.requestRef, revision: decision.revision,
      principalId: 'principal:external', suffix: 'external:1',
    })
    const review = { ...decision, preparationRef: historicalPreparation.preparationRef }
    const secondPrepareCommand = {
      requestRef: review.requestRef, revision: review.revision, idempotencyKey: 'prepare:external:2',
    }
    const secondPrepareAuth = await createCustomerRequestServiceAssertion({
      key, operation: 'compare', command: secondPrepareCommand,
      principal: {
        principalId: 'principal:external', ownerId: 'owner:external', credentialId: 'credential:external',
        scopes: ['customer_requests:create'],
      },
      issuedAt: Date.now(),
    })
    await expect(backend.action(api.customerRequestApplication.compare, {
      ...secondPrepareCommand, serviceAuth: { ...secondPrepareAuth, scopes: [...secondPrepareAuth.scopes] },
    })).resolves.toMatchObject({ kind: 'request', state: 'routes_ready' })
    const authorityRows = await backend.run(async (ctx) => ({
      approvals: await ctx.db.query('customerRequestV2PreparationApprovalEvidence').collect(),
      reservations: await ctx.db.query('customerRequestV2PreparationAuthorityReservations').collect(),
    }))
    expect(authorityRows).toEqual({ approvals: [], reservations: [] })

    const stranger = backend.withIdentity({ subject: 'owner:other', issuer: 'https://identity.test' })
    await expect(stranger.action(api.customerRequestApplication.authorizePreparation, {
      requestRef: review.requestRef, revision: review.revision,
      preparationRef: review.preparationRef, idempotencyKey: 'authorize:external:stranger:1',
    })).resolves.toEqual({ kind: 'refused', reason: 'request_not_found' })

    const owner = backend.withIdentity({ subject: 'owner:external', issuer: 'https://identity.test' })
    await expect(owner.action(api.customerRequestApplication.authorizePreparation, {
      requestRef: review.requestRef, revision: review.revision,
      preparationRef: review.preparationRef, idempotencyKey: 'authorize:external:owner:1',
    })).resolves.toMatchObject({ kind: 'request', state: 'needs_attention', nextAction: 'revise_request' })
    const approved = await backend.run(async (ctx) => ({
      approvals: await ctx.db.query('customerRequestV2PreparationApprovalEvidence').collect(),
      reservations: await ctx.db.query('customerRequestV2PreparationAuthorityReservations').collect(),
    }))
    expect(approved.approvals[0]).toMatchObject({ ownerId: 'owner:external', principalId: 'principal:external' })
    expect(approved.reservations).toHaveLength(1)
  })

  it('fails closed when registered supply drifts after disclosure review', async () => {
    const backend = await convexTestWithWorkers()
    await seedSandboxV2Supply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const input = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (input === undefined) throw new Error('sandbox request input missing')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [{
          selectionKey: model.selectionKey,
          facts: [{ inputKey: input.key, value: 'Find an option' }],
        }],
      }) }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)
    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:drift', requestId: 'request:v2:drift',
      delegatedAgentId: 'agent:drift', customerJob: 'Find an option', routing: { networkId: 'ae:public' },
    })
    if (submitted.kind !== 'request') throw new Error('submitted request missing')
    const answered = submitted
    const decision = await customer.action(api.customerRequestApplication.compare, {
      requestRef: answered.requestRef, revision: answered.revision, idempotencyKey: 'prepare:v2:drift',
    })
    if (decision.kind !== 'request' || decision.state !== 'routes_ready') throw new Error('route decision missing')
    const historicalPreparation = await beginHistoricalPreparationProof(backend, {
      requestRef: decision.requestRef, revision: decision.revision, principalId, suffix: 'v2:drift',
    })
    const review = { ...decision, preparationRef: historicalPreparation.preparationRef }

    await backend.run(async (ctx) => {
      const binding = (await ctx.db.query('capabilityTransportBindings').collect())[0]
      if (binding === undefined) throw new Error('binding missing')
      const offering = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', binding.offeringId)).unique()
      if (offering === null) throw new Error('offering missing')
      const result = await setCapabilitySupplyEligibility(ctx.db, {
        offeringId: offering.offeringId,
        bindingId: binding.bindingId,
        contractRef: {
          capabilityId: binding.capabilityId,
          version: binding.version,
          contractDigest: binding.contractDigest,
        },
        decision: 'revoke',
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: ['test:supply-drift'],
        conformanceEvidenceRefs: ['test:supply-drift'],
      }, 3_000)
      if (result.kind !== 'ineligible') throw new Error(`revoke failed: ${result.kind === 'refused' ? result.reason : result.kind}`)
    })

    await expect(customer.action(api.customerRequestApplication.resume, {
      requestRef: review.requestRef,
    })).resolves.toMatchObject({ kind: 'request', state: 'needs_attention' })

    await expect(customer.action(api.customerRequestApplication.authorizePreparation, {
      requestRef: review.requestRef,
      revision: review.revision,
      preparationRef: review.preparationRef,
      idempotencyKey: 'authorize:v2:drift',
    })).resolves.toMatchObject({ kind: 'request', state: 'needs_attention' })
    const stored = await backend.run(async (ctx) => ({
      preparations: await ctx.db.query('customerRequestV2ActionPreparations').collect(),
      reservations: await ctx.db.query('customerRequestV2PreparationAuthorityReservations').collect(),
    }))
    expect(stored.preparations[0]?.preparation.kind).toBe('needs_authority')
    expect(stored.reservations).toEqual([])
  })

  it('allocates before release, cannot reset cumulative limits, and never retries an interrupted dispatch', async () => {
    const backend = await convexTestWithWorkers()
    await seedSandboxV2Supply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const input = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (input === undefined) throw new Error('sandbox request input missing')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [{ selectionKey: model.selectionKey, facts: [{ inputKey: input.key, value: 'Protected request' }] }],
      }) }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)
    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:egress-state', requestId: 'request:v2:egress-state',
      delegatedAgentId: 'agent:egress-state', customerJob: 'Protected request', routing: { networkId: 'ae:public' },
    })
    if (submitted.kind !== 'request') throw new Error('submitted request missing')
    const answered = submitted
    const decision = await customer.action(api.customerRequestApplication.compare, {
      requestRef: answered.requestRef, revision: answered.revision, idempotencyKey: 'prepare:v2:egress-state',
    })
    if (decision.kind !== 'request' || decision.state !== 'routes_ready') throw new Error('route decision missing')
    const historicalPreparation = await beginHistoricalPreparationProof(backend, {
      requestRef: decision.requestRef, revision: decision.revision, principalId, suffix: 'v2:egress-state',
    })
    const review = { ...decision, preparationRef: historicalPreparation.preparationRef }

    await expect(backend.mutation(internal.customerRequestV2PreparationEgressState.allocate, {
      commandKey: 'egress:before-authority', commandDigest: 'sha256:' + '1'.repeat(64), principalId,
      preparationRef: review.preparationRef, now: 2_000,
    })).resolves.toEqual({ kind: 'needs_attention', reason: 'preparation_not_ready' })
    expect(await backend.run(async (ctx) => ctx.db.query('customerRequestV2PreparationEgressOperations').collect())).toEqual([])

    const aggregate = await backend.query(internal.customerRequestV2.getCurrentAggregate, { requestId: review.requestRef })
    if (aggregate.kind !== 'current' || aggregate.aggregate.plan.actions[0] === undefined) throw new Error('aggregate missing')
    const authorized = await backend.mutation(internal.customerRequestV2Preparation.prepare, {
      commandKey: 'authorize:internal:egress-state', commandDigest: 'sha256:' + '2'.repeat(64), principalId,
      requestId: review.requestRef, expectedRevision: review.revision,
      actionId: aggregate.aggregate.plan.actions[0].actionId, preparationRef: review.preparationRef,
      approvalActor: {
        kind: 'clerk_owner', requestPrincipalId: principalId, ownerId: identity.subject,
        credentialId: principalId, authenticationEvidenceRef: 'clerk:test:egress-state', approvedAt: 2_010,
      },
      now: 2_010,
    })
    if ((authorized.kind !== 'stored' && authorized.kind !== 'replayed')
      || authorized.preparation.kind !== 'ready_for_routing') throw new Error('authorization missing')
    const allocated = await backend.mutation(internal.customerRequestV2PreparationEgressState.allocate, {
      commandKey: 'egress:authorized:one', commandDigest: 'sha256:' + '3'.repeat(64), principalId,
      preparationRef: review.preparationRef, now: 2_020,
    })
    expect(allocated).toMatchObject({ kind: 'allocated', operationRefs: expect.arrayContaining([expect.any(String)]) })
    if (allocated.kind !== 'allocated' || allocated.operationRefs[0] === undefined
      || allocated.operationRefs[1] === undefined) throw new Error('allocation missing')
    const firstOperationRef = allocated.operationRefs[0]
    const secondOperationRef = allocated.operationRefs[1]
    const replayed = await backend.mutation(internal.customerRequestV2PreparationEgressState.allocate, {
      commandKey: 'egress:authorized:two', commandDigest: 'sha256:' + '4'.repeat(64), principalId,
      preparationRef: review.preparationRef, now: 2_030,
    })
    expect(replayed).toMatchObject({ kind: 'replayed', operationRefs: allocated.operationRefs })
    const durable = await backend.run(async (ctx) => ({
      operations: await ctx.db.query('customerRequestV2PreparationEgressOperations').collect(),
      consumption: await ctx.db.query('customerRequestV2PreparationEgressConsumption').collect(),
    }))
    expect(durable.operations).toHaveLength(2)
    expect(durable.consumption).toMatchObject([{
      consumedRecipients: 2, consumedOperations: 2, consumedExposures: 2,
    }])

    const originalPurpose = await backend.run(async (ctx) => {
      const allocation = (await ctx.db.query('customerRequestV2PreparationDisclosureAllocations')
        .withIndex('by_operationRef', (query) => query.eq('operationRef', firstOperationRef)).first())
      if (allocation === null) throw new Error('disclosure allocation missing')
      await ctx.db.patch(allocation._id, { purpose: 'tampered-purpose' })
      return { id: allocation._id, purpose: allocation.purpose }
    })
    await expect(backend.mutation(internal.customerRequestV2PreparationEgressState.beginDispatch, {
      operationRef: firstOperationRef, principalId, now: 2_035,
    })).rejects.toThrow('customer_request_v2_egress_allocation_integrity_failure')
    await backend.run(async (ctx) => await ctx.db.patch(originalPurpose.id, { purpose: originalPurpose.purpose }))

    const originalHead = await backend.run(async (ctx) => {
      const head = await ctx.db.query('customerRequestV2Heads')
        .withIndex('by_requestId', (query) => query.eq('requestId', review.requestRef)).unique()
      if (head === null) throw new Error('request head missing')
      await ctx.db.patch(head._id, {
        currentRevision: head.currentRevision + 1, currentAggregateDigest: 'sha256:' + '8'.repeat(64),
      })
      return { id: head._id, revision: head.currentRevision, aggregateDigest: head.currentAggregateDigest }
    })
    await expect(backend.mutation(internal.customerRequestV2PreparationEgressState.beginDispatch, {
      operationRef: secondOperationRef, principalId, now: 2_037,
    })).resolves.toEqual({ kind: 'terminal', state: 'not_released' })
    await backend.run(async (ctx) => await ctx.db.patch(originalHead.id, {
      currentRevision: originalHead.revision, currentAggregateDigest: originalHead.aggregateDigest,
    }))

    const dispatch = await backend.mutation(internal.customerRequestV2PreparationEgressState.beginDispatch, {
      operationRef: firstOperationRef, principalId, now: 2_040,
    })
    expect(dispatch).toMatchObject({ kind: 'dispatch', adapterId: 'http-json:v1' })
    if (dispatch.kind !== 'dispatch') throw new Error('dispatch missing')
    await expect(backend.mutation(internal.customerRequestV2PreparationEgressState.beginDispatch, {
      operationRef: firstOperationRef, principalId, now: 2_050,
    })).resolves.toEqual({ kind: 'in_flight' })
    await expect(customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:update-bypass', requestId: review.requestRef, expectedRevision: review.revision,
      delegatedAgentId: 'agent:update-bypass', customerJob: 'Replace the request', routing: { networkId: 'ae:public' },
    })).resolves.toEqual({ kind: 'conflict', requestRef: review.requestRef, reason: 'revision_changed' })
    await expect(customer.action(api.customerRequestApplication.refine, {
      requestRef: review.requestRef, expectedRevision: review.revision,
      idempotencyKey: 'refine:blocked-by-egress', message: 'Change the request while it is being sent',
    })).resolves.toMatchObject({ kind: 'request', state: 'needs_attention', nextAction: 'wait' })
    await expect(backend.mutation(internal.customerRequestV2PreparationEgressState.beginDispatch, {
      operationRef: firstOperationRef, principalId, now: 152_050,
    })).resolves.toEqual({ kind: 'terminal', state: 'uncertain' })
    await expect(backend.mutation(internal.customerRequestV2PreparedAction.prepare, {
      commandKey: 'prepared-action:uncertain', commandDigest: 'sha256:' + '5'.repeat(64), principalId,
      preparationRef: review.preparationRef,
      preparationMaterialDigest: await backend.query(
        internal.customerRequestV2PreparedAction.preparationMaterialDigest,
        { preparationRef: review.preparationRef, principalId },
      ),
      now: 152_060,
    })).resolves.toMatchObject({ kind: 'not_prepared', reason: 'disclosure_uncertain' })
    const reconciliationEvidence = {
      operationRef: firstOperationRef, disposition: 'not_released',
      providerEvidenceRef: 'provider-evidence:operation-observed', responseDigest: 'sha256:' + '9'.repeat(64),
    } as const
    await expect(backend.mutation(internal.customerRequestV2PreparationEgressState.reconcileUncertain, {
      ...reconciliationEvidence, evidenceDigest: canonicalDigest(reconciliationEvidence), observedAt: 2_070,
    })).resolves.toBe('not_released')
    await expect(backend.mutation(internal.customerRequestV2PreparationEgressState.beginDispatch, {
      operationRef: firstOperationRef, principalId, now: 2_080,
    })).resolves.toEqual({ kind: 'terminal', state: 'not_released' })
    await expect(backend.mutation(internal.customerRequestV2PreparedAction.prepare, {
      commandKey: 'prepared-action:not-released', commandDigest: 'sha256:' + '6'.repeat(64), principalId,
      preparationRef: review.preparationRef,
      preparationMaterialDigest: await backend.query(
        internal.customerRequestV2PreparedAction.preparationMaterialDigest,
        { preparationRef: review.preparationRef, principalId },
      ),
      now: 152_080,
    })).resolves.toMatchObject({ kind: 'not_prepared', reason: 'disclosure_not_released' })
    expect(await backend.run(async (ctx) => (
      ctx.db.query('customerRequestV2PreparationReconciliationObservations').collect()
    ))).toMatchObject([{
      operationRef: firstOperationRef, disposition: 'not_released',
      providerEvidenceRef: reconciliationEvidence.providerEvidenceRef,
      responseDigest: reconciliationEvidence.responseDigest,
      bindingId: expect.stringMatching(/^binding:/),
    }])
    await expect(customer.action(api.customerRequestApplication.resume, {
      requestRef: review.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'needs_attention', nextAction: 'revise_request',
      summary: 'AE did not send the request to the business. Check the business connection before trying again.',
    })
    const staleTerminalDigest = await backend.query(
      internal.customerRequestV2PreparedAction.preparationMaterialDigest,
      { preparationRef: review.preparationRef, principalId },
    )
    const lateOperation = await backend.run(async (ctx) => ctx.db.query('customerRequestV2PreparationEgressOperations')
      .withIndex('by_operationRef', (query) => query.eq('operationRef', firstOperationRef)).unique())
    if (lateOperation === null) throw new Error('late operation missing')
    const lateNow = Date.now()
    const lateEnvelope = {
      format: 'ae.provider-option:v1', operationRef: firstOperationRef, contractRef: model.contractRef,
      offeringId: lateOperation.offeringId, bindingId: lateOperation.bindingId,
      assertionRef: 'provider-assertion:late-release', assertedAt: lateNow, validUntil: lateNow + 60_000,
      output: { optionSummary: 'Late provider response' },
    }
    const lateBodyText = JSON.stringify(lateEnvelope)
    await expect(backend.mutation(internal.customerRequestV2PreparationEgressState.resolveDispatch, {
      operationRef: firstOperationRef, dispatchAttemptRef: dispatch.dispatchAttemptRef,
      state: 'released', evidenceRef: 'provider-evidence:late-release', now: lateNow,
      responseStatus: 200, responseContentType: 'application/json',
      responseBodyText: lateBodyText, responseBodyDigest: canonicalDigest(lateBodyText),
    })).resolves.toBe('released')
    await expect(backend.mutation(internal.customerRequestV2PreparedAction.prepare, {
      commandKey: 'prepared-action:stale-terminal-snapshot', commandDigest: 'sha256:' + 'a'.repeat(64),
      principalId, preparationRef: review.preparationRef, preparationMaterialDigest: staleTerminalDigest,
      now: lateNow,
    })).resolves.toEqual({ kind: 'conflict', reason: 'prepared_action_material_changed' })
    await expect(customer.action(api.customerRequestApplication.resume, {
      requestRef: review.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'options_ready',
      preparedAction: { selection: { unavailableCount: 1 } },
    })
    expect(await backend.run(async (ctx) => (
      ctx.db.query('customerRequestV2PreparationEgressOperations').collect()
    ))).toEqual(expect.arrayContaining([
      expect.objectContaining({ operationRef: firstOperationRef, state: 'released' }),
      expect.objectContaining({ operationRef: secondOperationRef, state: 'not_released' }),
    ]))
    expect(await backend.run(async (ctx) => (
      ctx.db.query('customerRequestV2PreparedActionRecoveries').collect()
    ))).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'disclosure_uncertain' }),
      expect.objectContaining({ reason: 'disclosure_not_released' }),
    ]))
  })

  it('retries the complete semantic proposal after bounded transient provider exhaustion', async () => {
    const backend = await convexTestWithWorkers()
    await seedSandboxV2Supply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const input = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (input === undefined) throw new Error('sandbox request input missing')
    const generate = vi.fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: JSON.stringify({
          kind: 'capability_candidates',
          selections: [{
            selectionKey: model.selectionKey,
            facts: [{ inputKey: input.key, value: 'Compare labelled sandbox options' }],
          }],
        }) }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', generate)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    await expect(backend.withIdentity(identity).action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:transient-recovery',
      requestId: 'request:v2:transient-recovery',
      delegatedAgentId: 'agent:external:v2',
      customerJob: 'Compare labelled sandbox options',
      routing: { networkId: 'ae:public' },
    })).resolves.toMatchObject({
      kind: 'request',
      requestRef: 'request:v2:transient-recovery',
      revision: 1,
      state: 'ready_to_compare',
      nextAction: 'prepare_options',
    })
    expect(generate).toHaveBeenCalledTimes(3)
  })

  it('preserves prepared option readback without creating legacy approval authority', async () => {
    const backend = await convexTestWithWorkers()
    await seedSandboxV2Supply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const input = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (input === undefined) throw new Error('sandbox request input missing')
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [{
          selectionKey: model.selectionKey,
          facts: [{ inputKey: input.key, value: 'Find the cheapest sandbox option' }],
        }],
      }) }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const serviceKey = 'external-agent-readback-key-that-is-long-enough'
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', serviceKey)
    const customer = backend.withIdentity(identity)
    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:prepared-action', requestId: 'request:v2:prepared-action',
      delegatedAgentId: 'agent:prepared-action', customerJob: 'Find the cheapest sandbox option',
      routing: { networkId: 'ae:public' },
    })
    if (submitted.kind !== 'request') throw new Error('submitted request missing')
    const answered = submitted
    const decision = await customer.action(api.customerRequestApplication.compare, {
      requestRef: answered.requestRef, revision: answered.revision,
      idempotencyKey: 'prepare:v2:prepared-action',
    })
    if (decision.kind !== 'request' || decision.state !== 'routes_ready') throw new Error('route decision missing')
    const historicalPreparation = await beginHistoricalPreparationProof(backend, {
      requestRef: decision.requestRef, revision: decision.revision, principalId, suffix: 'v2:prepared-action',
    })
    const review = { ...decision, preparationRef: historicalPreparation.preparationRef }
    const aggregate = await backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: review.requestRef,
    })
    if (aggregate.kind !== 'current' || aggregate.aggregate.plan.actions[0] === undefined) {
      throw new Error('aggregate missing')
    }
    expect(aggregate.aggregate.evaluation.decisionPreference).toMatchObject({
      objective: 'lowest_maximum_price', basis: 'extracted_from_request',
    })
    const authorized = await backend.mutation(internal.customerRequestV2Preparation.prepare, {
      commandKey: 'authorize:internal:prepared-action', commandDigest: 'sha256:' + '2'.repeat(64), principalId,
      requestId: review.requestRef, expectedRevision: review.revision,
      actionId: aggregate.aggregate.plan.actions[0].actionId, preparationRef: review.preparationRef,
      approvalActor: {
        kind: 'clerk_owner', requestPrincipalId: principalId, ownerId: identity.subject,
        credentialId: principalId, authenticationEvidenceRef: 'clerk:test:prepared-action', approvedAt: 2_010,
      },
      now: 2_010,
    })
    if ((authorized.kind !== 'stored' && authorized.kind !== 'replayed')
      || authorized.preparation.kind !== 'ready_for_routing') throw new Error('authorization missing')
    const allocated = await backend.mutation(internal.customerRequestV2PreparationEgressState.allocate, {
      commandKey: 'egress:prepared-action', commandDigest: 'sha256:' + '3'.repeat(64), principalId,
      preparationRef: review.preparationRef, now: 2_020,
    })
    if (allocated.kind !== 'allocated') throw new Error('allocation missing')
    const operations = await backend.run(async (ctx) => (
      ctx.db.query('customerRequestV2PreparationEgressOperations')
        .withIndex('by_preparationRef', (query) => query.eq('preparationRef', review.preparationRef!)).collect()
    ))
    const providerNow = Date.now()
    for (const operation of operations) {
      const begun = await backend.mutation(internal.customerRequestV2PreparationEgressState.beginDispatch, {
        operationRef: operation.operationRef, principalId, now: 2_030,
      })
      if (begun.kind !== 'dispatch') throw new Error('dispatch missing')
      const response = {
        format: 'ae.provider-option:v1', operationRef: operation.operationRef,
        contractRef: model.contractRef, offeringId: operation.offeringId, bindingId: operation.bindingId,
        assertionRef: `provider-assertion:${operation.bindingId}`,
        assertedAt: providerNow, validUntil: providerNow + 60_000,
        output: { optionSummary: `Validated result from ${operation.bindingId}` },
      }
      const responseBodyText = JSON.stringify(response)
      await backend.mutation(internal.customerRequestV2PreparationEgressState.resolveDispatch, {
        operationRef: operation.operationRef, dispatchAttemptRef: begun.dispatchAttemptRef,
        state: 'released', evidenceRef: `provider-response:${operation.bindingId}`,
        responseStatus: 200, responseContentType: 'application/json',
        responseBodyDigest: canonicalDigest(responseBodyText), responseBodyText, now: providerNow + 10,
      })
    }

    const command = {
      commandKey: 'prepared-action:one', commandDigest: 'sha256:' + '4'.repeat(64), principalId,
      preparationRef: review.preparationRef,
      preparationMaterialDigest: await backend.query(
        internal.customerRequestV2PreparedAction.preparationMaterialDigest,
        { preparationRef: review.preparationRef, principalId },
      ),
      now: providerNow + 20,
    }
    const prepared = await backend.mutation(internal.customerRequestV2PreparedAction.prepare, command)
    expect(prepared).toMatchObject({
      kind: 'prepared',
      preparedAction: {
        format: 'ae.prepared-action:v2', business: { name: 'Sandbox Option Two' },
        offering: { offeringId: 'offering:sandbox-option-two:reference-lookup:v3' },
        binding: { bindingId: 'binding:sandbox-option-two:http-json:v4' },
        price: { currency: 'AUD', maximumAmountMinor: 900 },
        comparison: { kind: 'lowest_maximum_price', candidateCount: 2 },
      },
    })
    await expect(backend.mutation(internal.customerRequestV2PreparedAction.prepare, command)).resolves.toEqual(prepared)
    const stored = await backend.run(async (ctx) => ({
      current: await ctx.db.query('customerRequestV2PreparedActions').collect(),
      legacy: await ctx.db.query('customerRequestPreparedActions').collect(),
    }))
    expect(stored.current).toHaveLength(1)
    expect(stored.legacy).toEqual([])
    if (prepared.kind !== 'prepared') throw new Error('prepared action missing')
    await expect(customer.action(api.customerRequestApplication.resume, {
      requestRef: review.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'options_ready',
      preparedAction: { businessName: 'Sandbox Option Two' },
    })
  })


  it('preserves accepted exact facts across a natural-language refinement', async () => {
    const backend = await convexTestWithWorkers()
    await seedSandboxV2Supply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const response = { kind: 'capability_candidates', selections: [{ selectionKey: model.selectionKey, facts: [] }] }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(modelResponse(response))
      .mockResolvedValueOnce(modelResponse({
        ...response,
        canonicalStatements: [
          { source: 'prior', quote: 'Find an option' },
          { source: 'amendment', quote: 'Prefer the clearest result.' },
        ],
      }))
      .mockResolvedValueOnce(modelResponse(response)))
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)
    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:refine', requestId: 'request:v2:refine', delegatedAgentId: 'agent:refine',
      customerJob: 'Find an option', routing: { networkId: 'ae:public' },
    })
    expect(submitted).toMatchObject({ kind: 'request', revision: 1, state: 'ready_to_compare' })
    if (submitted.kind !== 'request') throw new Error('submitted request missing')
    const refined = await customer.action(api.customerRequestApplication.refine, {
      requestRef: submitted.requestRef, expectedRevision: 1, idempotencyKey: 'refine:v2:1',
      message: 'Prefer the clearest result.',
    })
    if (refined.kind !== 'request' || refined.state !== 'ready_to_compare') {
      throw new Error(`refined request missing: ${JSON.stringify(refined)}`)
    }
    expect(refined).toMatchObject({ kind: 'request', revision: 2, state: 'ready_to_compare' })
    expect(refined.criteria).toContainEqual(expect.objectContaining({
      value: 'Find an option\nPrefer the clearest result.',
    }))
    const replaced = await customer.action(api.customerRequestApplication.refine, {
      requestRef: submitted.requestRef, expectedRevision: 2, idempotencyKey: 'replace:v2:2',
      message: 'Find lunch in Fremantle.', mode: 'replace',
    })
    if (replaced.kind !== 'request' || replaced.state !== 'ready_to_compare') {
      throw new Error(`replaced request missing: ${JSON.stringify(replaced)}`)
    }
    expect(replaced).toMatchObject({ kind: 'request', revision: 3, state: 'ready_to_compare' })
    expect(replaced.criteria).toContainEqual(expect.objectContaining({
      value: 'Find lunch in Fremantle.',
    }))
    expect(replaced.criteria).not.toContainEqual(expect.objectContaining({
      value: expect.stringContaining('Find an option'),
    }))
  })

  it('stores one canonical current Request when an amendment supersedes a material assertion', async () => {
    const backend = await convexTestWithWorkers()
    await seedSandboxV2Supply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const response = { kind: 'capability_candidates', selections: [{ selectionKey: model.selectionKey, facts: [] }] }
    const generate = vi.fn()
      .mockResolvedValueOnce(modelResponse(response))
      .mockResolvedValueOnce(modelResponse({
        ...response,
        canonicalStatements: [
          { source: 'prior', quote: 'Find an option.' },
          { source: 'prior', quote: 'Wheelchair accessibility is mandatory.' },
          { source: 'prior', quote: 'Passport validity is unknown.' },
          { source: 'amendment', quote: 'Arrival before 09:00 is now immovable.' },
        ],
        supersededStatements: [{
          priorQuote: 'Arrival before 08:00 is immovable.',
          amendmentQuote: 'Arrival before 09:00 is now immovable.',
        }],
      }))
    vi.stubGlobal('fetch', generate)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)
    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:canonical-amendment',
      requestId: 'request:v2:canonical-amendment',
      delegatedAgentId: 'agent:canonical-amendment',
      customerJob: 'Find an option. Arrival before 08:00 is immovable. '
        + 'Wheelchair accessibility is mandatory. Passport validity is unknown.',
      routing: { networkId: 'ae:public' },
    })
    if (submitted.kind !== 'request') throw new Error('submitted request missing')
    const command = {
      requestRef: submitted.requestRef,
      expectedRevision: submitted.revision,
      idempotencyKey: 'refine:v2:canonical-amendment',
      message: 'Arrival before 09:00 is now immovable.',
      replacesPriorStatement: 'Arrival before 08:00 is immovable.',
    }

    const refined = await customer.action(api.customerRequestApplication.refine, command)

    expect(refined).toMatchObject({
      kind: 'request',
      revision: 2,
      summary: 'Find an option.\nWheelchair accessibility is mandatory.\n'
        + 'Passport validity is unknown.\nArrival before 09:00 is now immovable.',
      criteria: expect.arrayContaining([
        expect.objectContaining({ label: 'Must preserve', value: 'Wheelchair accessibility is mandatory.' }),
        expect.objectContaining({ label: 'Known uncertainty', value: 'Passport validity is unknown.' }),
        expect.objectContaining({ label: 'Must preserve', value: 'Arrival before 09:00 is now immovable.' }),
      ]),
    })
    if (refined.kind !== 'request') throw new Error('refined request missing')
    expect(refined.criteria).not.toContainEqual(expect.objectContaining({
      value: 'Arrival before 08:00 is immovable.',
    }))
    await expect(customer.action(api.customerRequestApplication.refine, command)).resolves.toEqual(refined)
    await expect(customer.action(api.customerRequestApplication.refine, {
      requestRef: submitted.requestRef,
      expectedRevision: refined.revision,
      idempotencyKey: 'replace:v2:canonical-amendment:invalid-target',
      message: 'A complete replacement Request.',
      mode: 'replace',
      replacesPriorStatement: 'Arrival before 09:00 is now immovable.',
    })).resolves.toEqual({ kind: 'refused', reason: 'invalid_amendment' })
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('replays an exact committed refinement before rejecting its stale expected revision', async () => {
    const backend = await convexTestWithWorkers()
    await seedSandboxV2Supply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const requestInput = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (requestInput === undefined) throw new Error('sandbox request input missing')
    const generate = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: JSON.stringify({
          kind: 'capability_candidates',
          selections: [{
            selectionKey: model.selectionKey,
            facts: [{ inputKey: requestInput.key, value: 'Find an option' }],
          }],
        }) }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: JSON.stringify({
          kind: 'unsupported_request',
          reason: 'requested_result_not_available',
          canonicalStatements: [
            { source: 'prior', quote: 'Find an option' },
            { source: 'amendment', quote: 'Tighten the hard total budget to AUD 1.' },
          ],
        }) }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', generate)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)
    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:refine-retry',
      requestId: 'request:v2:refine-retry',
      delegatedAgentId: 'agent:refine-retry',
      customerJob: 'Find an option',
      routing: { networkId: 'ae:public' },
    })
    if (submitted.kind !== 'request') throw new Error('submitted request missing')
    const command = {
      requestRef: submitted.requestRef,
      expectedRevision: submitted.revision,
      idempotencyKey: 'refine:v2:bounded-retry',
      message: 'Tighten the hard total budget to AUD 1.',
    }

    const refined = await customer.action(api.customerRequestApplication.refine, command)

    expect(refined).toMatchObject({
      kind: 'request',
      requestRef: submitted.requestRef,
      revision: 2,
      state: 'unsupported',
    })
    await expect(customer.action(api.customerRequestApplication.refine, command)).resolves.toEqual(refined)
    await expect(customer.action(api.customerRequestApplication.refine, {
      ...command,
      message: 'Use the same key for a different change.',
    })).resolves.toEqual({
      kind: 'conflict',
      requestRef: submitted.requestRef,
      reason: 'idempotency_key_reused',
    })
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('treats an exact replacement as a no-op instead of compiling a new revision', async () => {
    const backend = await convexTestWithWorkers()
    await seedSandboxV2Supply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const response = { kind: 'capability_candidates', selections: [{ selectionKey: model.selectionKey, facts: [] }] }
    const generate = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify(response) }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', generate)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)
    const intent = 'Find an accessible transfer and hotel before noon.'
    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:exact-replacement',
      requestId: 'request:v2:exact-replacement',
      delegatedAgentId: 'agent:exact-replacement',
      customerJob: intent,
      routing: { networkId: 'ae:public' },
    })
    expect(submitted).toMatchObject({ kind: 'request', revision: 1, state: 'ready_to_compare' })
    if (submitted.kind !== 'request') throw new Error('submitted request missing')

    const repeated = await customer.action(api.customerRequestApplication.refine, {
      requestRef: 'request:v2:exact-replacement',
      expectedRevision: 1,
      idempotencyKey: 'replace:v2:exact-replacement:1',
      message: intent,
      mode: 'replace',
    })

    expect(repeated).toMatchObject({
      kind: 'request',
      requestRef: submitted.requestRef,
      revision: submitted.revision,
      routeGenerationRef: submitted.routeGenerationRef,
      summary: intent,
      state: 'routes_ready',
    })
    await expect(customer.action(api.customerRequestApplication.refine, {
      requestRef: 'request:v2:exact-replacement',
      expectedRevision: 1,
      idempotencyKey: 'replace:v2:exact-replacement:1',
      message: intent,
      mode: 'replace',
    })).resolves.toMatchObject({
      kind: 'request',
      revision: 1,
      routeGenerationRef: submitted.routeGenerationRef,
      state: 'routes_ready',
    })
    await expect(customer.action(api.customerRequestApplication.refine, {
      requestRef: 'request:v2:exact-replacement',
      expectedRevision: 1,
      idempotencyKey: 'replace:v2:exact-replacement:1',
      message: 'Use the same key for a different replacement.',
      mode: 'replace',
    })).resolves.toEqual({
      kind: 'conflict',
      requestRef: 'request:v2:exact-replacement',
      reason: 'idempotency_key_reused',
    })
    expect(generate).toHaveBeenCalledTimes(1)
  })
})

describe('durable Customer Request submission recovery', () => {
  beforeEach(() => vi.stubEnv('CLERK_JWT_ISSUER_DOMAIN', identity.issuer))

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('answers without a provider account, replays the command, and still reaches comparison with a model', async () => {
    const backend = await convexTestWithWorkers()
    await seedSandboxV2Supply(backend)
    const customer = backend.withIdentity(identity)
    const command = {
      compilationKey: 'submit:v2:interpreter-recovery',
      requestId: 'request:v2:interpreter-recovery',
      delegatedAgentId: 'agent:external:v2',
      customerJob: 'Compare labelled sandbox options for an accessible office relocation.',
      routing: { networkId: 'ae:public' },
    }

    // No OPENROUTER_API_KEY is configured. AE answers from the request text instead of saving an
    // uninterpretable Request and telling the customer to retry a permanently failing condition.
    const withoutProvider = await customer.action(api.customerRequestApplication.submit, command)
    expect(withoutProvider).toMatchObject({
      kind: 'request',
      requestRef: command.requestId,
      revision: 1,
      state: 'needs_information',
      nextAction: 'provide_information',
      interpretationBasis: 'keyword_match',
    })
    await expect(customer.action(api.customerRequestApplication.submit, command)).resolves.toEqual(withoutProvider)
    const resumed = await customer.action(api.customerRequestApplication.resume, {
      requestRef: command.requestId,
    })
    expect(resumed).toMatchObject({
      ...withoutProvider,
      recovery: {
        state: 'restored',
        restoredAt: expect.any(Number),
        workRestarted: false,
      },
    })
    await expect(customer.action(api.customerRequestApplication.submit, {
      ...command,
      customerJob: 'Changed payload under the same command key.',
    })).resolves.toEqual({
      kind: 'conflict',
      requestRef: command.requestId,
      reason: 'idempotency_key_reused',
    })

    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const input = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (input === undefined) throw new Error('sandbox request input missing')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [{
          selectionKey: model.selectionKey,
          facts: [{ inputKey: input.key, value: command.customerJob }],
        }],
      }) }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')

    // The already-committed command replays; a fresh one takes the model path to comparison.
    await expect(customer.action(api.customerRequestApplication.submit, {
      ...command,
      compilationKey: 'submit:v2:interpreter-recovery:model',
      requestId: 'request:v2:interpreter-recovery-model',
    })).resolves.toMatchObject({
      kind: 'request',
      requestRef: 'request:v2:interpreter-recovery-model',
      revision: 1,
      state: 'ready_to_compare',
      nextAction: 'prepare_options',
    })
  })
})

async function beginHistoricalPreparationProof(
  backend: ReturnType<typeof convexTest>,
  input: Readonly<{
    requestRef: string; revision: number; principalId: string; suffix: string
  }>,
) {
  const aggregate = await backend.query(internal.customerRequestV2.getCurrentAggregate, {
    requestId: input.requestRef,
  })
  const action = aggregate.kind === 'current' ? aggregate.aggregate.plan.actions[0] : undefined
  if (action === undefined) throw new Error('historical preparation action missing')
  const result = await backend.mutation(internal.customerRequestV2Preparation.prepare, {
    commandKey: `historical-preparation:${input.suffix}`,
    commandDigest: canonicalDigest(input),
    principalId: input.principalId,
    requestId: input.requestRef,
    expectedRevision: input.revision,
    actionId: action.actionId,
    now: Date.now(),
  })
  if ((result.kind !== 'stored' && result.kind !== 'replayed')
    || result.preparation.kind !== 'needs_authority') {
    throw new Error(`historical preparation proof unavailable: ${result.kind}`)
  }
  return result.preparation
}

async function registerDisclosureSupply(
  backend: ReturnType<typeof convexTest>,
  document: unknown,
  businessId: string,
) {
  await backend.run(async (ctx) => {
    const encoded = encodeCapabilityContractDocument(document)
    const contract = await registerCapabilityContractDocument(ctx.db, encoded.documentJson, 3_000)
    if (contract.kind !== 'registered') throw new Error(`disclosure contract registration failed: ${contract.reason}`)
    const actor = { kind: 'system' as const, ref: 'system:test' }
    const offering = await registerCapabilityOfferingCommand(ctx.db, {
      actor,
      context: {
        correlationId: 'test:disclosure-replay', operationKey: 'test:disclosure-offering',
        reasonCode: 'test_disclosure_replay', evidenceRefs: ['test:disclosure-contract'],
      },
      registration: {
        offeringId: 'offering:sandbox-disclosure:lookup', businessId,
        networkId: 'ae:public', contractRef: contract.ref,
        presentation: {
          label: 'Sandbox Disclosure Option',
          summary: 'Labelled sandbox supply for disclosure replay verification only.',
          price: { kind: 'fixed', currency: 'AUD', amountMinor: 500 },
          materialTerms: [{ termId: 'sandbox_only', label: 'Environment', value: 'Sandbox only.' }],
          commercialRelationship: {
            kind: 'none', summary: 'No commercial relationship.',
            influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
            evidenceRefs: ['test:commercial-neutrality'],
          },
        },
        searchTerms: ['private request comparison'],
        registrationEvidenceRefs: ['test:disclosure-contract'],
      },
    }, 3_001)
    if (offering.kind !== 'registered') throw new Error(`disclosure offering registration failed: ${offering.reason}`)
    const binding = await registerCapabilityBindingCommand(ctx.db, {
      actor,
      context: {
        correlationId: 'test:disclosure-replay', operationKey: 'test:disclosure-binding',
        reasonCode: 'test_disclosure_replay', evidenceRefs: ['test:disclosure-binding'],
      },
      registration: {
        bindingId: 'binding:sandbox-disclosure:http-json', offeringId: 'offering:sandbox-disclosure:lookup',
        networkId: 'ae:public', contractRef: contract.ref,
        endpointUrl: 'https://agentic-economy-phi.vercel.app/api/sandbox/capability?profile=one',
        credentialRef: 'env:AE_SANDBOX_PROVIDER_ONE_KEY',
        continuation: { kind: 'single_response', evidenceRefs: ['test:single-response'] },
        cancellation: { kind: 'unsupported', evidenceRefs: ['test:no-cancellation'] },
        adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
        registrationEvidenceRefs: ['test:disclosure-binding'],
      },
    }, 3_002)
    if (binding.kind !== 'registered') throw new Error(`disclosure binding registration failed: ${binding.reason}`)
    const eligibility = await setCapabilitySupplyEligibility(ctx.db, {
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      contractRef: contract.ref,
      decision: 'admit',
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['test:disclosure-business-reviewed'],
      conformanceEvidenceRefs: ['test:disclosure-binding-reviewed'],
    }, 3_003)
    if (eligibility.kind !== 'eligible') throw new Error(`disclosure eligibility failed: ${eligibility.kind === 'refused' ? eligibility.reason : eligibility.kind}`)
    await seedSandboxCapabilityPublication(ctx, {
      slug: 'sandbox-option-one',
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      contractRef: contract.ref,
      offeringRegistrationHash: offering.registrationHash,
      bindingRegistrationHash: binding.registrationHash,
    }, 3_004)
  })
  await observeSandboxPublications(backend)
}

async function seedSandboxV2Supply(backend: ReturnType<typeof convexTest>) {
  await backend.run(async (ctx) => {
    const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
      fixture.requestedSlug === 'sandbox-option-one' || fixture.requestedSlug === 'sandbox-option-two'
    ))
    await registerSandboxBusinesses(ctx.db, fixtures, 1_000)
    const registrations = await registerSandboxV2SupplyRegistrations(ctx.db, 2_000)
    await admitSandboxV2Supply(ctx.db, registrations, 2_500)
    await Promise.all(registrations.map((registration, index) => (
      seedSandboxCapabilityPublication(ctx, registration, 2_750 + index)
    )))
  })
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await backend.finishInProgressScheduledFunctions()
  await observeSandboxPublications(backend, true)
}

async function observeSandboxPublications(backend: ReturnType<typeof convexTest>, drainProbe = false) {
  const publications = await backend.run(async (ctx) => ctx.db.query('capabilityPublications').collect())
  const now = Date.now()
  for (const publication of publications) {
    if (drainProbe) await backend.action(internal.capabilitySupplyReadiness.probe, {
      publicationRef: publication.publicationRef, expectedRevision: publication.revision,
    })
    const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
      publicationRef: publication.publicationRef, expectedRevision: publication.revision,
      credentialState: 'ready', healthState: 'healthy', validUntil: now + 3_600_000,
      operationKey: `test:application-readiness:${publication.publicationRef}`,
      correlationId: 'test:application-readiness', reasonCode: 'test_readiness', evidenceRefs: ['test:readiness'],
    })
    if (observed.kind !== 'observed') throw new Error(`sandbox readiness failed: ${observed.reason}`)
  }
}
