import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]))

describe('durable Customer Request evaluation', () => {
  it('persists and replays an incomplete Request before any Plan exists', async () => {
    const backend = convexTest(schema, modules)
    const snapshot = {
      requestId: 'request:incomplete:1', revision: 1,
      principalId: 'principal:customer:1', delegatedAgentId: 'agent:customer:1',
      intent: 'Compare ways to send this parcel', networkId: 'ae:public',
      facts: {
        origin_postcode: { value: '6000', source: { kind: 'customer' as const, assertionRef: 'assertion:origin' } },
        destination_postcode: { value: '2000', source: { kind: 'customer' as const, assertionRef: 'assertion:destination' } },
      },
      snapshotDigest: 'sha256:' + '1'.repeat(64), recordedAt: 1_000,
    }
    const command = {
      commandKey: 'principal:customer:1:submit:request:incomplete:1',
      commandDigest: 'sha256:' + '2'.repeat(64), expectedRevision: 0, snapshot,
    }

    await expect(backend.mutation(internal.customerRequests.commitRequestSnapshot, command))
      .resolves.toEqual({ kind: 'stored' })
    await expect(backend.mutation(internal.customerRequests.commitRequestSnapshot, command))
      .resolves.toEqual({ kind: 'replayed', requestId: snapshot.requestId, revision: 1 })

    await expect(backend.mutation(internal.customerRequests.putRequestEvaluation, {
      evaluation: {
        evaluationId: 'evaluation:incomplete:1', requestId: snapshot.requestId, requestRevision: 1,
        registrySnapshotDigest: 'sha256:' + '3'.repeat(64), factsDigest: 'sha256:' + '4'.repeat(64),
        posture: 'needs_information' as const,
        nextRequirement: {
          field: 'weight_grams', customerLabel: 'Parcel weight',
          affectedCandidates: ['candidate:binding:parcel-one', 'candidate:binding:parcel-two'],
          probesEnabled: ['candidate:binding:parcel-one', 'candidate:binding:parcel-two'],
          requirementDigest: 'sha256:' + '5'.repeat(64),
        },
        evaluationDigest: 'sha256:' + '6'.repeat(64), evaluatedAt: 1_001,
      },
      candidates: [
        blockedCandidate('candidate:binding:parcel-one', 'sandbox-parcel-one', 'binding:parcel-one'),
        blockedCandidate('candidate:binding:parcel-two', 'sandbox-parcel-two', 'binding:parcel-two'),
      ],
    })).resolves.toEqual({ kind: 'stored' })

    await expect(backend.query(internal.customerRequests.getCurrentRequestEvaluation, {
      requestId: snapshot.requestId,
    })).resolves.toMatchObject({
      snapshot: { requestId: snapshot.requestId, revision: 1, intent: snapshot.intent },
      evaluation: {
        evaluationId: 'evaluation:incomplete:1', posture: 'needs_information',
        nextRequirement: { field: 'weight_grams' },
      },
      candidates: [
        { candidateRef: 'candidate:binding:parcel-one', viability: { kind: 'blocked_on_information' } },
        { candidateRef: 'candidate:binding:parcel-two', viability: { kind: 'blocked_on_information' } },
      ],
    })
    const plans = await backend.run(async (ctx) => await ctx.db.query('customerRequestPlanRevisions').collect())
    expect(plans).toEqual([])
  })
})

function blockedCandidate(candidateRef: string, businessId: string, bindingId: string) {
  return {
    candidateRef, businessId, bindingId, capabilityContractId: 'parcel.rate:v1',
    viability: { kind: 'blocked_on_information' as const, fields: ['weight_grams'] },
  }
}
