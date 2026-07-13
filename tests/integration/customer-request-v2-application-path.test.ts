import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { defineCapabilityContract, openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT } from '@/modules/sandbox-supply/public'
import { setCapabilitySupplyEligibility } from '../../convex/capabilitySupply'
import { createCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'
import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]))
const identity = { subject: 'customer-v2', issuer: 'https://identity.test' }
const principalId = `${identity.issuer}|${identity.subject}`

describe('current V2 Customer Request application path', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('uses eligible V2 supply, opaque interpretation and one durable exact aggregate', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await admitSandboxSupply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const input = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (input === undefined) throw new Error('sandbox request input missing')
    const generate = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [{
          selectionKey: model.selectionKey,
          facts: [{ inputKey: input.key, value: 'Compare labelled sandbox options' }],
        }],
      }) } }],
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
    vi.stubEnv('OPENROUTER_API_KEY', '')
    await expect(customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:1', requestId: 'request:v2:application',
      delegatedAgentId: 'agent:external:v2', customerJob: 'Compare labelled sandbox options',
      routing: { networkId: 'ae:public' },
    })).resolves.toEqual(submitted)
    expect(generate).toHaveBeenCalledTimes(1)
    await expect(customer.action(api.customerRequestApplication.resume, {
      requestRef: 'request:v2:application',
    })).resolves.toMatchObject({
      kind: 'request', requestRef: 'request:v2:application', revision: 1,
      state: 'ready_to_compare',
    })

    const review = await customer.action(api.customerRequestApplication.compare, {
      requestRef: 'request:v2:application', revision: 1, idempotencyKey: 'prepare:v2:1',
    })
    expect(review).toMatchObject({
      kind: 'request', requestRef: 'request:v2:application', revision: 1,
      state: 'needs_authorization', nextAction: 'review_disclosure',
      preparationRef: expect.stringMatching(/^action-preparation:/),
      disclosureReview: { purpose: 'Return sandbox result', maximumRecipients: 2 },
    })
    await expect(customer.action(api.customerRequestApplication.compare, {
      requestRef: 'request:v2:application', revision: 1, idempotencyKey: 'prepare:v2:1',
    })).resolves.toEqual(review)
    if (review.kind !== 'request' || review.preparationRef === undefined) throw new Error('preparation review missing')
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
      requestRef: 'request:v2:application', revision: 1, idempotencyKey: 'prepare:v2:1',
    })).resolves.toEqual(review)

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
    expect(persisted.heads).toMatchObject([{ requestId: 'request:v2:application', principalId }])
    expect(persisted.revisions[0]?.aggregate.plan.actions).toMatchObject([
      { contractRef: model.contractRef, selectionKey: model.selectionKey, semanticDigest: model.semanticDigest },
    ])
    expect(persisted.revisions[0]?.aggregate.plan.completionRequirements).toMatchObject([
      { contractRef: model.contractRef, evidenceId: 'option_summary', outputPointer: '/optionSummary', purpose: 'completion' },
    ])
    expect(persisted.preparations).toHaveLength(1)
    expect(persisted.preparations[0]?.preparation).toMatchObject({
      kind: 'ready_for_routing',
      lineage: {
        planRevisionId: persisted.revisions[0]?.aggregate.plan.planRevisionId,
        planDigest: persisted.revisions[0]?.aggregate.plan.planDigest,
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
      planRevisionId: persisted.revisions[0]?.aggregate.plan.planRevisionId,
      planDigest: persisted.revisions[0]?.aggregate.plan.planDigest,
      contractRef: model.contractRef, selectionKey: model.selectionKey, semanticDigest: model.semanticDigest,
    } })
    expect(persisted.legacyHeads).toEqual([])
    expect(persisted.legacyRequests).toEqual([])
    expect(persisted.legacyPreparations).toEqual([])
  })

  it('lets an external agent prepare but never promotes its API signature into customer authority', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await admitSandboxSupply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const input = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (input === undefined) throw new Error('sandbox request input missing')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [{ selectionKey: model.selectionKey, facts: [{ inputKey: input.key, value: 'Find an option' }] }],
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
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
    const prepareCommand = {
      requestRef: 'request:v2:external', revision: 1, idempotencyKey: 'prepare:external:1',
    }
    const prepareAuth = await createCustomerRequestServiceAssertion({
      key, operation: 'compare', command: prepareCommand,
      principal: {
        principalId: 'principal:external', ownerId: 'owner:external', credentialId: 'credential:external',
        scopes: ['customer_requests:create'],
      },
      issuedAt: Date.now(),
    })
    const review = await backend.action(api.customerRequestApplication.compare, {
      ...prepareCommand, serviceAuth: { ...prepareAuth, scopes: [...prepareAuth.scopes] },
    })
    expect(review).toMatchObject({ kind: 'request', state: 'needs_authorization' })
    if (review.kind !== 'request' || review.preparationRef === undefined) throw new Error('external review missing')
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
    })).resolves.toMatchObject({ kind: 'request', state: 'needs_authorization' })
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
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await admitSandboxSupply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const input = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (input === undefined) throw new Error('sandbox request input missing')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [{
          selectionKey: model.selectionKey,
          facts: [{ inputKey: input.key, value: 'Find an option' }],
        }],
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)
    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:drift', requestId: 'request:v2:drift',
      delegatedAgentId: 'agent:drift', customerJob: 'Find an option', routing: { networkId: 'ae:public' },
    })
    if (submitted.kind !== 'request') throw new Error('request missing')
    const review = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef, revision: submitted.revision, idempotencyKey: 'prepare:v2:drift',
    })
    if (review.kind !== 'request' || review.preparationRef === undefined) throw new Error('review missing')

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
      if (result.kind !== 'ineligible') throw new Error(`revoke failed: ${result.reason}`)
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
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await admitSandboxSupply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const input = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (input === undefined) throw new Error('sandbox request input missing')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [{ selectionKey: model.selectionKey, facts: [{ inputKey: input.key, value: 'Protected request' }] }],
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)
    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:egress-state', requestId: 'request:v2:egress-state',
      delegatedAgentId: 'agent:egress-state', customerJob: 'Protected request', routing: { networkId: 'ae:public' },
    })
    if (submitted.kind !== 'request') throw new Error('request missing')
    const review = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef, revision: submitted.revision, idempotencyKey: 'prepare:v2:egress-state',
    })
    if (review.kind !== 'request' || review.preparationRef === undefined) throw new Error('review missing')

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
    })).resolves.toMatchObject({ kind: 'request', state: 'needs_attention', nextAction: 'revise_request' })
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

  it('persists and replays one exact V2 Prepared Action from validated released options', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await admitSandboxSupply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const input = model.inputs.find((candidate) => candidate.annotationId === 'request_context')
    if (input === undefined) throw new Error('sandbox request input missing')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [{
          selectionKey: model.selectionKey,
          facts: [{ inputKey: input.key, value: 'Find the cheapest sandbox option' }],
        }],
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)
    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:prepared-action', requestId: 'request:v2:prepared-action',
      delegatedAgentId: 'agent:prepared-action', customerJob: 'Find the cheapest sandbox option',
      routing: { networkId: 'ae:public' },
    })
    if (submitted.kind !== 'request') throw new Error('request missing')
    const review = await customer.action(api.customerRequestApplication.compare, {
      requestRef: submitted.requestRef, revision: submitted.revision,
      idempotencyKey: 'prepare:v2:prepared-action',
    })
    if (review.kind !== 'request' || review.preparationRef === undefined) throw new Error('preparation missing')
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
        offering: { offeringId: 'offering:sandbox-option-two:reference-lookup' },
        binding: { bindingId: 'binding:sandbox-option-two:http-json' },
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
    await expect(customer.action(api.customerRequestApplication.resume, {
      requestRef: review.requestRef,
    })).resolves.toMatchObject({
      kind: 'request', state: 'options_ready', nextAction: 'inspect_options',
      preparedAction: {
        actionRef: prepared.kind === 'prepared' ? prepared.preparedAction.preparedActionRef : '',
        businessName: 'Sandbox Option Two', offeringLabel: 'Sandbox Option Two',
        price: { currency: 'AUD', minimumAmountMinor: 900, maximumAmountMinor: 900 },
        materialTerms: [{ label: 'Environment', value: 'Sandbox only; not real supply.' }],
        cancellation: { kind: 'unsupported' }, validUntil: providerNow + 60_000,
        selection: { basis: 'lowest_maximum_price', alternativeCount: 1 },
        alternatives: [{
          businessName: 'Sandbox Option One', price: { currency: 'AUD', maximumAmountMinor: 1_200 },
        }],
      },
    })

    const selectedOperation = operations.find(({ offeringId }) => (
      offeringId === 'offering:sandbox-option-two:reference-lookup'
    ))
    if (selectedOperation === undefined) throw new Error('selected operation missing')
    await backend.run(async (ctx) => {
      const result = await setCapabilitySupplyEligibility(ctx.db, {
        offeringId: selectedOperation.offeringId, bindingId: selectedOperation.bindingId,
        contractRef: model.contractRef, decision: 'revoke',
        expectedOfferingRegistrationHash: selectedOperation.offeringRegistrationHash,
        expectedBindingRegistrationHash: selectedOperation.bindingRegistrationHash,
        admissionEvidenceRefs: ['test:prepared-action-stale'],
        conformanceEvidenceRefs: ['test:prepared-action-stale'],
      }, providerNow + 30)
      if (result.kind !== 'ineligible') throw new Error('supply revoke failed')
    })
    await expect(backend.mutation(internal.customerRequestV2PreparedAction.prepare, {
      commandKey: 'prepared-action:stale', commandDigest: 'sha256:' + '7'.repeat(64), principalId,
      preparationRef: review.preparationRef, preparationMaterialDigest: command.preparationMaterialDigest,
      now: providerNow + 40,
    })).resolves.toMatchObject({ kind: 'not_prepared', reason: 'capability_graph_changed' })
    await backend.run(async (ctx) => {
      const result = await setCapabilitySupplyEligibility(ctx.db, {
        offeringId: selectedOperation.offeringId, bindingId: selectedOperation.bindingId,
        contractRef: model.contractRef, decision: 'admit',
        expectedOfferingRegistrationHash: selectedOperation.offeringRegistrationHash,
        expectedBindingRegistrationHash: selectedOperation.bindingRegistrationHash,
        admissionEvidenceRefs: ['test:prepared-action-restored'],
        conformanceEvidenceRefs: ['test:prepared-action-restored'],
      }, providerNow + 50)
      if (result.kind !== 'eligible') throw new Error('supply restore failed')
    })

    await backend.run(async (ctx) => await ctx.db.patch(selectedOperation.businessId, { publicStatus: 'unpublished' }))
    await expect(backend.mutation(internal.customerRequestV2PreparedAction.prepare, {
      commandKey: 'prepared-action:business-unpublished', commandDigest: 'sha256:' + '6'.repeat(64), principalId,
      preparationRef: review.preparationRef, preparationMaterialDigest: command.preparationMaterialDigest,
      now: providerNow + 55,
    })).resolves.toMatchObject({ kind: 'not_prepared', reason: 'capability_graph_changed' })
    await backend.run(async (ctx) => await ctx.db.patch(selectedOperation.businessId, { publicStatus: 'published' }))

    const rewriteSelectedResponse = async (response: Record<string, unknown>) => {
      const responseBodyText = JSON.stringify(response)
      await backend.run(async (ctx) => await ctx.db.patch(selectedOperation._id, {
        responseBodyText, responseBodyDigest: canonicalDigest(responseBodyText),
      }))
    }
    const exactEnvelope: Record<string, unknown> = {
      format: 'ae.provider-option:v1', operationRef: selectedOperation.operationRef,
      contractRef: model.contractRef, offeringId: selectedOperation.offeringId,
      bindingId: selectedOperation.bindingId,
      assertionRef: `provider-assertion:${selectedOperation.bindingId}`,
      assertedAt: providerNow, validUntil: providerNow + 60_000,
      output: { optionSummary: `Validated result from ${selectedOperation.bindingId}` },
    }
    await rewriteSelectedResponse({ ...exactEnvelope, bindingId: 'binding:mismatched' })
    await expect(backend.mutation(internal.customerRequestV2PreparedAction.prepare, {
      commandKey: 'prepared-action:echo-mismatch', commandDigest: 'sha256:' + '8'.repeat(64), principalId,
      preparationRef: review.preparationRef,
      preparationMaterialDigest: await backend.query(
        internal.customerRequestV2PreparedAction.preparationMaterialDigest,
        { preparationRef: review.preparationRef, principalId },
      ),
      now: providerNow + 60,
    })).resolves.toEqual({ kind: 'conflict', reason: 'prepared_action_material_changed' })
    await rewriteSelectedResponse({ ...exactEnvelope, output: { unsupported: true } })
    await expect(backend.mutation(internal.customerRequestV2PreparedAction.prepare, {
      commandKey: 'prepared-action:invalid-output', commandDigest: 'sha256:' + '9'.repeat(64), principalId,
      preparationRef: review.preparationRef,
      preparationMaterialDigest: await backend.query(
        internal.customerRequestV2PreparedAction.preparationMaterialDigest,
        { preparationRef: review.preparationRef, principalId },
      ),
      now: providerNow + 70,
    })).resolves.toEqual({ kind: 'conflict', reason: 'prepared_action_material_changed' })
    await rewriteSelectedResponse({ ...exactEnvelope, output: { optionSummary: 'Changed valid provider material' } })
    await expect(backend.mutation(internal.customerRequestV2PreparedAction.prepare, {
      commandKey: 'prepared-action:material-changed', commandDigest: 'sha256:' + 'a'.repeat(64), principalId,
      preparationRef: review.preparationRef,
      preparationMaterialDigest: await backend.query(
        internal.customerRequestV2PreparedAction.preparationMaterialDigest,
        { preparationRef: review.preparationRef, principalId },
      ),
      now: providerNow + 80,
    })).resolves.toEqual({ kind: 'conflict', reason: 'prepared_action_material_changed' })
    await expect(backend.mutation(internal.customerRequestV2PreparedAction.prepare, {
      ...command,
      preparationMaterialDigest: await backend.query(
        internal.customerRequestV2PreparedAction.preparationMaterialDigest,
        { preparationRef: review.preparationRef, principalId },
      ),
      now: providerNow + 60_001,
    })).resolves.toMatchObject({ kind: 'not_prepared', reason: 'provider_assertion_expired' })
    expect(await backend.run(async (ctx) => (
      ctx.db.query('customerRequestV2PreparedActionRecoveries').collect()
    ))).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'capability_graph_changed' }),
      expect.objectContaining({ reason: 'provider_assertion_expired' }),
    ]))
  })

  it('preserves accepted exact facts across a natural-language refinement', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await admitSandboxSupply(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const responses = [
      { kind: 'capability_candidates', selections: [{ selectionKey: model.selectionKey, facts: [] }] },
      { kind: 'capability_candidates', selections: [{ selectionKey: model.selectionKey, facts: [] }] },
    ]
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(responses.shift()) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
    const customer = backend.withIdentity(identity)
    const submitted = await customer.action(api.customerRequestApplication.submit, {
      compilationKey: 'submit:v2:refine', requestId: 'request:v2:refine', delegatedAgentId: 'agent:refine',
      customerJob: 'Find an option', routing: { networkId: 'ae:public' },
    })
    if (submitted.kind !== 'request' || submitted.clarification?.kind !== 'contract_fact') {
      throw new Error('expected a contract fact clarification')
    }
    const answered = await customer.action(api.customerRequestApplication.provideFacts, {
      requestRef: submitted.requestRef, expectedRevision: submitted.revision, idempotencyKey: 'facts:v2:refine',
      requirementKey: submitted.clarification.requirementKey, value: 'Compare sandbox options',
    })
    expect(answered).toMatchObject({ kind: 'request', revision: 2, state: 'ready_to_compare' })
    const refined = await customer.action(api.customerRequestApplication.refine, {
      requestRef: submitted.requestRef, expectedRevision: 2, idempotencyKey: 'refine:v2:1',
      message: 'Prefer the clearest result.',
    })
    expect(refined).toMatchObject({ kind: 'request', revision: 3, state: 'ready_to_compare' })
    if (refined.kind !== 'request') throw new Error('refined request missing')
    expect(refined.criteria).toContainEqual(expect.objectContaining({ value: 'Compare sandbox options' }))
  })
})

async function admitSandboxSupply(backend: ReturnType<typeof convexTest>) {
  await backend.run(async (ctx) => {
    const offerings = await ctx.db.query('capabilityOfferings').collect()
    const bindings = await ctx.db.query('capabilityTransportBindings').collect()
    for (const binding of bindings) {
      const offering = offerings.find((candidate) => candidate.offeringId === binding.offeringId)
      if (offering === undefined) throw new Error('sandbox offering missing')
      const result = await setCapabilitySupplyEligibility(ctx.db, {
        offeringId: offering.offeringId,
        bindingId: binding.bindingId,
        contractRef: {
          capabilityId: binding.capabilityId,
          version: binding.version,
          contractDigest: binding.contractDigest,
        },
        decision: 'admit',
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: ['test:business-and-contract-reviewed'],
        conformanceEvidenceRefs: ['test:adapter-contract-reviewed'],
      }, 2_000)
      if (result.kind !== 'eligible') throw new Error(`sandbox admission failed: ${result.reason}`)
    }
  })
}
