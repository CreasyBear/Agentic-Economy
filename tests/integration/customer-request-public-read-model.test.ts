import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]))
const identity = { subject: 'customer-1', issuer: 'https://identity.test' }
const principalId = `${identity.issuer}|${identity.subject}`

describe('production CustomerRequest read model', () => {
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
})

async function seedReadyRequest(backend: ReturnType<typeof convexTest>) {
  const request = {
    requestId: 'request:cold:1', principalId, delegatedAgentId: 'agent:external:1', intent: 'Find an available option',
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
