import { v, type Infer } from 'convex/values'

import {
  isBoundedJsonValue,
  openCapabilityDecisionModel,
  sameCapabilityContractRef,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  discoverRequestEvaluationCandidates,
  evaluateCustomerRequestSnapshot,
  evaluateIntentDirectionRequestSnapshot,
  requestRegistrySnapshotDigest,
  type RegisteredEvaluationBinding,
} from '@/modules/customer-request/evaluation'
import { customerRequestV2AggregateValue } from '@/modules/customer-request/runtime'
import { deriveCustomerDecisionPreference } from '@/modules/customer-request/semantic-interpreter'

import { internalMutation, internalQuery } from './_generated/server'
import { listEligibleCapabilitySupply } from './capabilitySupply'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'

type Aggregate = Infer<typeof customerRequestV2AggregateValue>
const MAX_AGGREGATE_BYTES = 700_000

const commitResult = v.union(
  v.object({ kind: v.literal('stored'), requestId: v.string(), revision: v.number() }),
  v.object({ kind: v.literal('replayed'), requestId: v.string(), revision: v.number() }),
  v.object({ kind: v.literal('revision_conflict') }),
  v.object({ kind: v.literal('identity_conflict') }),
  v.object({ kind: v.literal('command_conflict') }),
  v.object({ kind: v.literal('aggregate_invalid') }),
  v.object({ kind: v.literal('context_stale') }),
)

const currentAggregateResult = v.union(
  v.object({ kind: v.literal('current'), aggregate: customerRequestV2AggregateValue }),
  v.object({
    kind: v.literal('needs_attention'), requestId: v.string(),
    reason: v.literal('historical_request_resubmit_required'), resumable: v.literal(false),
  }),
  v.object({ kind: v.literal('not_found') }),
)
const commandReplayResult = v.union(
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('conflict') }),
  v.object({ kind: v.literal('replayed'), aggregate: customerRequestV2AggregateValue }),
)

export const commitAggregate = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), expectedRevision: v.number(),
    aggregate: customerRequestV2AggregateValue,
  },
  returns: commitResult,
  handler: async (ctx, args) => {
    if (!aggregateIsInternallyConsistent(args.aggregate, args.expectedRevision)) {
      return { kind: 'aggregate_invalid' as const }
    }
    const snapshot = args.aggregate.snapshot
    const prior = await ctx.db.query('customerRequestV2Commands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
    if (prior !== null) {
      return prior.commandDigest === args.commandDigest
        && prior.aggregateDigest === args.aggregate.aggregateDigest
        && prior.requestId === snapshot.requestId
        ? { kind: 'replayed' as const, requestId: prior.requestId, revision: prior.resultingRevision }
        : { kind: 'command_conflict' as const }
    }
    const context = await validateAggregateAgainstCurrentCapabilityGraph(ctx.db, args.aggregate)
    if (context === 'stale') return { kind: 'context_stale' as const }
    if (context === 'invalid') return { kind: 'aggregate_invalid' as const }
    const head = await ctx.db.query('customerRequestV2Heads')
      .withIndex('by_requestId', (query) => query.eq('requestId', snapshot.requestId)).unique()
    if ((head?.currentRevision ?? 0) !== args.expectedRevision) return { kind: 'revision_conflict' as const }
    if (head !== null && (head.principalId !== snapshot.principalId
      || head.delegatedAgentId !== snapshot.delegatedAgentId)) return { kind: 'identity_conflict' as const }
    const existingRevision = await ctx.db.query('customerRequestV2Revisions')
      .withIndex('by_requestId_and_requestRevision', (query) => (
        query.eq('requestId', snapshot.requestId).eq('requestRevision', snapshot.revision)
      )).unique()
    if (existingRevision !== null) return { kind: 'revision_conflict' as const }

    await ctx.db.insert('customerRequestV2Revisions', {
      requestId: snapshot.requestId, requestRevision: snapshot.revision, aggregate: writableAggregate(args.aggregate),
    })
    if (head === null) {
      await ctx.db.insert('customerRequestV2Heads', {
        requestId: snapshot.requestId,
        principalId: snapshot.principalId,
        delegatedAgentId: snapshot.delegatedAgentId,
        currentRevision: snapshot.revision,
        currentAggregateDigest: args.aggregate.aggregateDigest,
        createdAt: snapshot.recordedAt,
        updatedAt: snapshot.recordedAt,
      })
    } else {
      await ctx.db.patch(head._id, {
        currentRevision: snapshot.revision,
        currentAggregateDigest: args.aggregate.aggregateDigest,
        updatedAt: snapshot.recordedAt,
      })
    }
    await ctx.db.insert('customerRequestV2Commands', {
      commandKey: args.commandKey,
      commandDigest: args.commandDigest,
      principalId: snapshot.principalId,
      requestId: snapshot.requestId,
      expectedRevision: args.expectedRevision,
      resultingRevision: snapshot.revision,
      aggregateDigest: args.aggregate.aggregateDigest,
      committedAt: snapshot.recordedAt,
    })
    return { kind: 'stored' as const, requestId: snapshot.requestId, revision: snapshot.revision }
  },
})

export const getCurrentAggregate = internalQuery({
  args: { requestId: v.string() },
  returns: currentAggregateResult,
  handler: async (ctx, args) => {
    const head = await ctx.db.query('customerRequestV2Heads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (head !== null) {
      const revision = await ctx.db.query('customerRequestV2Revisions')
        .withIndex('by_requestId_and_requestRevision', (query) => (
          query.eq('requestId', args.requestId).eq('requestRevision', head.currentRevision)
        )).unique()
      if (revision === null || revision.aggregate.aggregateDigest !== head.currentAggregateDigest
        || !aggregateIsInternallyConsistent(revision.aggregate, head.currentRevision - 1)) {
        throw new Error('customer_request_v2_aggregate_integrity_failure')
      }
      return { kind: 'current' as const, aggregate: revision.aggregate }
    }
    const historicalSnapshot = await ctx.db.query('customerRequestHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    const historicalRequest = historicalSnapshot === null
      ? await ctx.db.query('customerRequests').withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
      : null
    return historicalSnapshot !== null || historicalRequest !== null
      ? {
          kind: 'needs_attention' as const,
          requestId: args.requestId,
          reason: 'historical_request_resubmit_required' as const,
          resumable: false as const,
        }
      : { kind: 'not_found' as const }
  },
})

export const getCommandReplay = internalQuery({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), requestId: v.string(),
  },
  returns: commandReplayResult,
  handler: async (ctx, args) => {
    const command = await ctx.db.query('customerRequestV2Commands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
    if (command === null) return { kind: 'not_found' as const }
    if (command.commandDigest !== args.commandDigest || command.principalId !== args.principalId
      || command.requestId !== args.requestId) return { kind: 'conflict' as const }
    const revision = await ctx.db.query('customerRequestV2Revisions')
      .withIndex('by_requestId_and_requestRevision', (query) => (
        query.eq('requestId', command.requestId).eq('requestRevision', command.resultingRevision)
      )).unique()
    if (revision === null || revision.aggregate.aggregateDigest !== command.aggregateDigest
      || !aggregateIsInternallyConsistent(revision.aggregate, command.resultingRevision - 1)) {
      throw new Error('customer_request_v2_command_integrity_failure')
    }
    return { kind: 'replayed' as const, aggregate: revision.aggregate }
  },
})

export function aggregateIsInternallyConsistent(aggregate: Aggregate, expectedRevision: number): boolean {
  const { aggregateDigest: _aggregateDigest, ...material } = aggregate
  const outcome = aggregate.evaluation.posture === 'unsupported'
    ? 'unsupported'
    : aggregate.evaluation.posture === 'needs_information' ? 'needs_information' : 'plan_ready'
  return aggregate.aggregateVersion === 2
    && aggregateByteLengthWithinLimit(aggregate)
    && aggregate.snapshot.revision === expectedRevision + 1
    && aggregate.evaluation.requestId === aggregate.snapshot.requestId
    && aggregate.evaluation.requestRevision === aggregate.snapshot.revision
    && aggregate.plan.requestId === aggregate.snapshot.requestId
    && aggregate.plan.requestRevision === aggregate.snapshot.revision
    && aggregate.plan.registrySnapshotDigest === aggregate.evaluation.registrySnapshotDigest
    && aggregate.outcome === outcome
    && aggregate.snapshot.facts.length <= 128
    && aggregate.evaluation.facts.length <= 128
    && aggregate.plan.actions.length <= 64
    && aggregate.evaluation.candidates.length <= 256
    && aggregate.snapshot.facts.every(({ value }) => isBoundedJsonValue(value))
    && aggregate.evaluation.facts.every(({ value }) => isBoundedJsonValue(value))
    && aggregate.evaluation.criteria.every(({ value }) => isBoundedJsonValue(value))
    && canonicalDigest(aggregate.snapshot.facts as StableHashValue) === aggregate.evaluation.factsDigest
    && canonicalDigest(aggregate.snapshot.facts as StableHashValue) === canonicalDigest(aggregate.evaluation.facts as StableHashValue)
    && canonicalDigest({
      requestId: aggregate.snapshot.requestId,
      revision: aggregate.snapshot.revision,
      principalId: aggregate.snapshot.principalId,
      delegatedAgentId: aggregate.snapshot.delegatedAgentId,
      intent: aggregate.snapshot.intent,
      networkId: aggregate.snapshot.networkId,
      facts: aggregate.snapshot.facts,
    } as StableHashValue) === aggregate.snapshot.snapshotDigest
    && planAuthorityIsConsistent(aggregate)
    && completionAuthorityIsConsistent(aggregate)
    && canonicalDigest(material as StableHashValue) === aggregate.aggregateDigest
}

async function validateAggregateAgainstCurrentCapabilityGraph(
  db: Parameters<typeof listEligibleCapabilitySupply>[0], aggregate: Aggregate,
): Promise<'current' | 'stale' | 'invalid'> {
  const currentSupply = await listEligibleCapabilitySupply(db, {
    networkId: aggregate.snapshot.networkId,
    limit: 64,
  })
  if (currentSupply.kind !== 'available') return 'stale'
  const bindings: RegisteredEvaluationBinding[] = currentSupply.supplies.map(({ offering, binding }) => ({
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
  }))
  if (requestRegistrySnapshotDigest(bindings) !== aggregate.evaluation.registrySnapshotDigest) return 'stale'
  const models = new Map<string, CapabilityDecisionModel>()
  for (const binding of bindings) {
    const key = exactRefKey(binding.contractRef)
    if (models.has(key)) continue
    const stored = await getActiveExactCapabilityContract(db, binding.contractRef)
    if (stored.kind !== 'found') return 'stale'
    let model: CapabilityDecisionModel
    try {
      model = openCapabilityDecisionModel(encodeCapabilityContractDocumentJson(stored.documentJson).contract)
    } catch {
      return 'stale'
    }
    if (!sameCapabilityContractRef(model.contractRef, binding.contractRef)) return 'stale'
    models.set(key, model)
  }
  const facts = rebindAggregateFacts(aggregate.snapshot.facts, models)
  if (facts === undefined) return 'invalid'
  const resolveModel = (ref: Aggregate['plan']['actions'][number]['contractRef']) => models.get(exactRefKey(ref))
  const actions = aggregate.plan.actions.flatMap((action, ordinal) => {
    const model = resolveModel(action.contractRef)
    if (model === undefined || model.selectionKey !== action.selectionKey || model.semanticDigest !== action.semanticDigest) return []
    const actionMaterial = {
      requestId: aggregate.snapshot.requestId,
      requestRevision: aggregate.snapshot.revision,
      ordinal,
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      semanticDigest: model.semanticDigest,
    }
    return [{
      actionId: `action:${canonicalDigest(actionMaterial)}`,
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      semanticDigest: model.semanticDigest,
      dependsOn: [],
      inputs: facts.filter((fact) => fact.selectionKey === model.selectionKey
        && sameCapabilityContractRef(fact.contractRef, model.contractRef)),
    }]
  })
  if (actions.length !== aggregate.plan.actions.length
    || canonicalDigest(actions as StableHashValue) !== canonicalDigest(aggregate.plan.actions as StableHashValue)) return 'invalid'
  const evaluation = aggregate.plan.actions.length === 0 && aggregate.evaluation.nextRequirement?.kind === 'intent_direction'
    ? evaluateIntentDirectionRequestSnapshot({
        requestId: aggregate.snapshot.requestId,
        requestRevision: aggregate.snapshot.revision,
        intent: aggregate.snapshot.intent,
        facts,
        registrySnapshotDigest: aggregate.evaluation.registrySnapshotDigest,
        prompt: aggregate.evaluation.nextRequirement.prompt,
      })
    : evaluateCustomerRequestSnapshot({
        requestId: aggregate.snapshot.requestId,
        requestRevision: aggregate.snapshot.revision,
        intent: aggregate.snapshot.intent,
        facts,
        registrySnapshotDigest: aggregate.evaluation.registrySnapshotDigest,
        ...(() => {
          const preference = deriveCustomerDecisionPreference(aggregate.snapshot.intent)
          return preference === undefined ? {} : { decisionPreference: preference }
        })(),
        candidates: discoverRequestEvaluationCandidates({
          selectedCapabilities: actions.map(({ selectionKey, contractRef }) => ({ selectionKey, contractRef })),
          bindings,
          resolveModel,
        }),
        proposedActions: actions,
        resolveModel,
      })
  if (evaluation.candidates.some((candidate) => candidate.viability.kind === 'incompatible')) return 'invalid'
  return canonicalDigest(evaluation as StableHashValue) === canonicalDigest(aggregate.evaluation as StableHashValue)
    ? 'current'
    : 'invalid'
}

function rebindAggregateFacts(
  storedFacts: Aggregate['snapshot']['facts'], models: ReadonlyMap<string, CapabilityDecisionModel>,
) {
  const facts = storedFacts.flatMap((fact) => {
    const model = models.get(exactRefKey(fact.contractRef))
    const input = model?.inputs.find((candidate) => candidate.key === fact.inputKey
      && candidate.inputPointer === fact.inputPointer && candidate.schemaIdentity === fact.schemaIdentity)
    if (model === undefined || input === undefined || model.selectionKey !== fact.selectionKey
      || !isBoundedJsonValue(fact.value)) return []
    return [{
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      inputKey: input.key,
      inputPointer: input.inputPointer,
      schemaIdentity: input.schemaIdentity,
      value: fact.value,
      source: fact.source,
    }]
  })
  return facts.length === storedFacts.length ? facts : undefined
}

function planAuthorityIsConsistent(aggregate: Aggregate): boolean {
  const expectedActions = aggregate.plan.actions.map((action, ordinal) => {
    const actionMaterial = {
      requestId: aggregate.snapshot.requestId,
      requestRevision: aggregate.snapshot.revision,
      ordinal,
      contractRef: action.contractRef,
      selectionKey: action.selectionKey,
      semanticDigest: action.semanticDigest,
    }
    const inputs = aggregate.snapshot.facts.filter((fact) => fact.selectionKey === action.selectionKey
      && sameCapabilityContractRef(fact.contractRef, action.contractRef))
    return {
      actionId: `action:${canonicalDigest(actionMaterial)}`,
      contractRef: action.contractRef,
      selectionKey: action.selectionKey,
      semanticDigest: action.semanticDigest,
      dependsOn: [],
      inputs,
    }
  })
  if (canonicalDigest(expectedActions as StableHashValue) !== canonicalDigest(aggregate.plan.actions as StableHashValue)) {
    return false
  }
  const proposalDigest = canonicalDigest({
    interpreterId: aggregate.plan.interpreterId,
    selected: aggregate.plan.actions.map(({ selectionKey, contractRef }) => ({ selectionKey, contractRef })),
    facts: aggregate.snapshot.facts,
  })
  const planMaterial = {
    requestId: aggregate.snapshot.requestId,
    requestRevision: aggregate.snapshot.revision,
    proposedByAgentId: aggregate.snapshot.delegatedAgentId,
    interpreterId: aggregate.plan.interpreterId,
    proposalDigest,
    registrySnapshotDigest: aggregate.evaluation.registrySnapshotDigest,
    actions: aggregate.plan.actions,
    completionRequirements: aggregate.evaluation.completionRequirements,
  }
  const planDigest = canonicalDigest(planMaterial)
  return aggregate.plan.proposedByAgentId === aggregate.snapshot.delegatedAgentId
    && aggregate.plan.proposalDigest === proposalDigest
    && aggregate.plan.planDigest === planDigest
    && aggregate.plan.planRevisionId === `plan:${planDigest}`
    && aggregate.plan.createdAt === aggregate.snapshot.recordedAt
}

function completionAuthorityIsConsistent(aggregate: Aggregate): boolean {
  if (canonicalDigest(aggregate.plan.completionRequirements as StableHashValue)
    !== canonicalDigest(aggregate.evaluation.completionRequirements as StableHashValue)) return false
  return aggregate.plan.completionRequirements.every((requirement) => {
    const action = aggregate.plan.actions.find(({ actionId }) => actionId === requirement.actionId)
    return action !== undefined
      && canonicalDigest(action.contractRef) === canonicalDigest(requirement.contractRef)
  })
}

function aggregateByteLengthWithinLimit(aggregate: Aggregate): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(aggregate)).byteLength <= MAX_AGGREGATE_BYTES
  } catch {
    return false
  }
}

function exactRefKey(ref: Readonly<{ capabilityId: string; version: number; contractDigest: string }>): string {
  return `${ref.capabilityId}\u0000${ref.version}\u0000${ref.contractDigest}`
}

function writableAggregate(aggregate: Aggregate): Aggregate {
  return structuredClone(aggregate)
}
