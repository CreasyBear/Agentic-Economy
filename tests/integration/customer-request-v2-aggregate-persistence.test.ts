import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { defineCapabilityContract, openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { compileCustomerRequest, writableCustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import { evaluateCustomerRequestSnapshot } from '@/modules/customer-request/evaluation'
import { SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT } from '@/modules/sandbox-supply/public'
import { setCapabilitySupplyEligibility } from '../../convex/capabilitySupply'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]))

describe('atomic V2 Customer Request aggregate persistence', () => {
  it('commits snapshot, evaluation, exact plan authority and idempotency receipt together', async () => {
    const backend = convexTest(schema, modules)
    const aggregate = await compiledAggregate(backend)
    const command = {
      commandKey: 'command:v2:submit', commandDigest: 'sha256:' + 'a'.repeat(64), expectedRevision: 0, aggregate,
    }

    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, command))
      .resolves.toEqual({ kind: 'stored', requestId: 'request:v2:persist', revision: 1 })
    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, command))
      .resolves.toEqual({ kind: 'replayed', requestId: 'request:v2:persist', revision: 1 })

    const current = await backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: 'request:v2:persist',
    })
    expect(current).toMatchObject({
      kind: 'current',
      aggregate: {
        aggregateVersion: 2,
        snapshot: { revision: 1 },
        plan: {
          actions: [{ contractRef: aggregate.plan.actions[0]?.contractRef }],
          completionRequirements: [{
            contractRef: aggregate.plan.actions[0]?.contractRef,
            evidenceId: 'option_summary', outputPointer: '/optionSummary', purpose: 'completion',
          }],
        },
      },
    })
    const persisted = await backend.run(async (ctx) => ({
      heads: await ctx.db.query('customerRequestV2Heads').collect(),
      revisions: await ctx.db.query('customerRequestV2Revisions').collect(),
      commands: await ctx.db.query('customerRequestV2Commands').collect(),
    }))
    expect(persisted).toMatchObject({ heads: [{}], revisions: [{}], commands: [{}] })
  })

  it('writes nothing on revision, identity, or idempotency conflict', async () => {
    const backend = convexTest(schema, modules)
    const aggregate = await compiledAggregate(backend)
    const first = {
      commandKey: 'command:v2:submit', commandDigest: 'sha256:' + 'a'.repeat(64), expectedRevision: 0, aggregate,
    }
    await backend.mutation(internal.customerRequestV2.commitAggregate, first)

    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      ...first, commandDigest: 'sha256:' + 'b'.repeat(64),
    })).resolves.toEqual({ kind: 'command_conflict' })
    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      ...first, commandKey: 'command:v2:stale', commandDigest: 'sha256:' + 'c'.repeat(64),
    })).resolves.toEqual({ kind: 'revision_conflict' })

    const persisted = await backend.run(async (ctx) => ({
      revisions: await ctx.db.query('customerRequestV2Revisions').collect(),
      commands: await ctx.db.query('customerRequestV2Commands').collect(),
    }))
    expect(persisted.revisions).toHaveLength(1)
    expect(persisted.commands).toHaveLength(1)
  })

  it('writes nothing when the registered capability graph changes before commit', async () => {
    const backend = convexTest(schema, modules)
    const aggregate = await compiledAggregate(backend)
    await revokeFirstSupply(backend)

    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:stale-graph', commandDigest: 'sha256:' + 'd'.repeat(64),
      expectedRevision: 0, aggregate,
    })).resolves.toEqual({ kind: 'context_stale' })
    await expect(v2Rows(backend)).resolves.toEqual({ heads: [], revisions: [], commands: [] })
  })

  it('writes nothing when a caller recomputes the digest over forged semantic authority', async () => {
    const backend = convexTest(schema, modules)
    const aggregate = await compiledAggregate(backend)
    const forged = structuredClone(aggregate)
    forged.outcome = 'unsupported'
    const { aggregateDigest: _discarded, ...forgedMaterial } = forged
    forged.aggregateDigest = canonicalDigest(forgedMaterial)

    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:forged', commandDigest: 'sha256:' + 'e'.repeat(64),
      expectedRevision: 0, aggregate: forged,
    })).resolves.toEqual({ kind: 'aggregate_invalid' })
    await expect(v2Rows(backend)).resolves.toEqual({ heads: [], revisions: [], commands: [] })
  })

  it('reopens the exact contract and rejects invented completion evidence even when every caller digest is recomputed', async () => {
    const backend = convexTest(schema, modules)
    const aggregate = await compiledAggregate(backend)
    const forged = structuredClone(aggregate)
    for (const requirement of forged.evaluation.completionRequirements) requirement.evidenceId = 'invented_evidence'
    for (const requirement of forged.plan.completionRequirements) requirement.evidenceId = 'invented_evidence'
    const { evaluationDigest: _oldEvaluationDigest, ...evaluationMaterial } = forged.evaluation
    forged.evaluation.evaluationDigest = canonicalDigest({ ...evaluationMaterial, intent: forged.snapshot.intent })
    const {
      planRevisionId: _oldPlanRevisionId,
      planDigest: _oldPlanDigest,
      createdAt: _oldCreatedAt,
      ...planMaterial
    } = forged.plan
    forged.plan.planDigest = canonicalDigest(planMaterial)
    forged.plan.planRevisionId = `plan:${forged.plan.planDigest}`
    const { aggregateDigest: _oldAggregateDigest, ...aggregateMaterial } = forged
    forged.aggregateDigest = canonicalDigest(aggregateMaterial)

    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:invented-evidence', commandDigest: 'sha256:' + 'f'.repeat(64),
      expectedRevision: 0, aggregate: forged,
    })).resolves.toEqual({ kind: 'aggregate_invalid' })
    await expect(v2Rows(backend)).resolves.toEqual({ heads: [], revisions: [], commands: [] })
  })

  it('rejects a fully re-digested aggregate whose structured input violates the exact contract schema', async () => {
    const backend = convexTest(schema, modules)
    const aggregate = await compiledAggregate(backend)
    const model = openCapabilityDecisionModel(defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT))
    const facts = aggregate.snapshot.facts.map((fact) => ({ ...fact, value: 42 }))
    const actions = aggregate.plan.actions.map((action) => ({ ...action, inputs: facts }))
    const evaluation = evaluateCustomerRequestSnapshot({
      requestId: aggregate.snapshot.requestId,
      requestRevision: aggregate.snapshot.revision,
      intent: aggregate.snapshot.intent,
      facts,
      registrySnapshotDigest: aggregate.evaluation.registrySnapshotDigest,
      candidates: aggregate.evaluation.candidates.map((candidate) => ({
        businessId: candidate.businessId, offeringId: candidate.offeringId, bindingId: candidate.bindingId,
        model, offeringRegistrationHash: candidate.offeringRegistrationHash,
        bindingRegistrationHash: candidate.bindingRegistrationHash,
      })),
      proposedActions: actions,
      resolveModel: () => model,
    })
    expect(evaluation.candidates.some((candidate) => candidate.viability.kind === 'incompatible')).toBe(true)
    const snapshotMaterial = {
      requestId: aggregate.snapshot.requestId, revision: aggregate.snapshot.revision,
      principalId: aggregate.snapshot.principalId, delegatedAgentId: aggregate.snapshot.delegatedAgentId,
      intent: aggregate.snapshot.intent, networkId: aggregate.snapshot.networkId, facts,
    }
    const snapshot = { ...aggregate.snapshot, facts, snapshotDigest: canonicalDigest(snapshotMaterial) }
    const proposalDigest = canonicalDigest({
      interpreterId: aggregate.plan.interpreterId,
      selected: actions.map(({ selectionKey, contractRef }) => ({ selectionKey, contractRef })),
      facts,
    })
    const planMaterial = {
      requestId: aggregate.plan.requestId, requestRevision: aggregate.plan.requestRevision,
      proposedByAgentId: aggregate.plan.proposedByAgentId, interpreterId: aggregate.plan.interpreterId,
      proposalDigest, registrySnapshotDigest: aggregate.plan.registrySnapshotDigest,
      actions, completionRequirements: evaluation.completionRequirements,
    }
    const planDigest = canonicalDigest(planMaterial)
    const plan = {
      ...aggregate.plan, ...planMaterial, planDigest, planRevisionId: `plan:${planDigest}`,
    }
    const aggregateMaterial = {
      aggregateVersion: 2 as const, snapshot, evaluation, plan, outcome: 'plan_ready' as const,
    }
    const forged = writableCustomerRequestV2Aggregate({
      ...aggregateMaterial, aggregateDigest: canonicalDigest(aggregateMaterial),
    })

    await expect(backend.mutation(internal.customerRequestV2.commitAggregate, {
      commandKey: 'command:v2:wrong-type', commandDigest: 'sha256:' + '9'.repeat(64),
      expectedRevision: 0, aggregate: forged,
    })).resolves.toEqual({ kind: 'aggregate_invalid' })
    await expect(v2Rows(backend)).resolves.toEqual({ heads: [], revisions: [], commands: [] })
  })

  it('returns typed resubmission for historical nonterminal work without converting it', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      await ctx.db.insert('customerRequestHeads', {
        requestId: 'request:v1:historical', principalId: 'principal:v1', delegatedAgentId: 'agent:v1',
        currentRevision: 1, createdAt: 1, updatedAt: 1,
      })
    })

    await expect(backend.query(internal.customerRequestV2.getCurrentAggregate, {
      requestId: 'request:v1:historical',
    })).resolves.toEqual({
      kind: 'needs_attention', requestId: 'request:v1:historical',
      reason: 'historical_request_resubmit_required', resumable: false,
    })
    await expect(backend.mutation(internal.customerRequestV2Preparation.prepare, {
      commandKey: 'prepare:v1:historical', commandDigest: 'sha256:' + '8'.repeat(64),
      principalId: 'principal:v1', requestId: 'request:v1:historical', expectedRevision: 1,
      actionId: 'action:v1:historical', now: 2,
    })).resolves.toEqual({
      kind: 'needs_attention', reason: 'historical_request_resubmit_required',
    })
    const v2Rows = await backend.run(async (ctx) => ({
      heads: await ctx.db.query('customerRequestV2Heads').collect(),
      revisions: await ctx.db.query('customerRequestV2Revisions').collect(),
      commands: await ctx.db.query('customerRequestV2Commands').collect(),
      preparations: await ctx.db.query('customerRequestV2ActionPreparations').collect(),
      preparationCommands: await ctx.db.query('customerRequestV2PreparationCommands').collect(),
    }))
    expect(v2Rows).toEqual({ heads: [], revisions: [], commands: [], preparations: [], preparationCommands: [] })
  })
})

async function compiledAggregate(backend: ReturnType<typeof convexTest>) {
  await backend.mutation(internal.devSeed.seedDevCatalog, {})
  await admitSandboxSupply(backend)
  const supply = await backend.query(internal.capabilitySupply.listEligible, { networkId: 'ae:public', limit: 64 })
  if (supply.kind !== 'available') throw new Error(`eligible supply unavailable: ${supply.reason}`)
  const contract = defineCapabilityContract(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT)
  const model = openCapabilityDecisionModel(contract)
  const input = model.inputs[0]
  if (input === undefined) throw new Error('test input missing')
  const fact = {
    contractRef: model.contractRef, selectionKey: model.selectionKey,
    inputKey: input.key, inputPointer: input.inputPointer, schemaIdentity: input.schemaIdentity,
    value: 'Find a match', source: { kind: 'agent_inference' as const, inferenceRef: 'inference:test' },
  }
  const result = compileCustomerRequest({
    requestId: 'request:v2:persist', expectedRevision: 0,
    principalId: 'principal:v2', delegatedAgentId: 'agent:v2', intent: 'Find a match', networkId: 'ae:public',
    proposal: {
      kind: 'capability_candidates',
      selections: [{ selectionKey: model.selectionKey, contractRef: model.contractRef, facts: [fact] }],
    },
    interpreterId: 'interpreter:test',
    bindings: supply.supplies.map(({ offering, binding }) => ({
      businessId: String(offering.businessId), offeringId: offering.offeringId, bindingId: binding.bindingId,
      contractRef: model.contractRef, offeringRegistrationHash: offering.registrationHash,
      bindingRegistrationHash: binding.registrationHash,
    })),
    models: [model], now: 1_000,
  })
  if (result.kind !== 'compiled') throw new Error(`compile failed: ${result.reason}`)
  return writableCustomerRequestV2Aggregate(result.aggregate)
}

async function admitSandboxSupply(backend: ReturnType<typeof convexTest>) {
  await backend.run(async (ctx) => {
    const offerings = await ctx.db.query('capabilityOfferings').collect()
    const bindings = await ctx.db.query('capabilityTransportBindings').collect()
    for (const binding of bindings) {
      const offering = offerings.find((candidate) => candidate.offeringId === binding.offeringId)
      if (offering === undefined) throw new Error('sandbox offering missing')
      const result = await setCapabilitySupplyEligibility(ctx.db, {
        offeringId: offering.offeringId, bindingId: binding.bindingId,
        contractRef: { capabilityId: binding.capabilityId, version: binding.version, contractDigest: binding.contractDigest },
        decision: 'admit', expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: ['test:business-reviewed'], conformanceEvidenceRefs: ['test:adapter-reviewed'],
      }, 2_000)
      if (result.kind !== 'eligible') throw new Error(`sandbox admission failed: ${result.reason}`)
    }
  })
}

async function revokeFirstSupply(backend: ReturnType<typeof convexTest>) {
  await backend.run(async (ctx) => {
    const binding = await ctx.db.query('capabilityTransportBindings').first()
    if (binding === null) throw new Error('sandbox binding missing')
    const offering = (await ctx.db.query('capabilityOfferings').collect())
      .find((candidate) => candidate.offeringId === binding.offeringId) ?? null
    if (offering === null) throw new Error('sandbox offering missing')
    const result = await setCapabilitySupplyEligibility(ctx.db, {
      offeringId: offering.offeringId, bindingId: binding.bindingId,
      contractRef: { capabilityId: binding.capabilityId, version: binding.version, contractDigest: binding.contractDigest },
      decision: 'revoke', expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['test:revoked'], conformanceEvidenceRefs: ['test:revoked'],
    }, 3_000)
    if (result.kind !== 'ineligible') throw new Error(`sandbox revocation failed: ${result.reason}`)
  })
}

async function v2Rows(backend: ReturnType<typeof convexTest>) {
  return await backend.run(async (ctx) => ({
    heads: await ctx.db.query('customerRequestV2Heads').collect(),
    revisions: await ctx.db.query('customerRequestV2Revisions').collect(),
    commands: await ctx.db.query('customerRequestV2Commands').collect(),
  }))
}
