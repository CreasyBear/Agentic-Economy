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
  compileRoutePlans,
  composeRequestActions,
  type CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import {
  discoverRequestEvaluationCandidates,
  evaluateCustomerRequestSnapshot,
  evaluateIntentDirectionRequestSnapshot,
  requestRegistrySnapshotDigest,
  type RegisteredEvaluationBinding,
} from '@/modules/customer-request/evaluation'
import {
  deriveCustomerDecisionPreference,
  deriveCustomerMaterialConstraints,
  deriveCustomerMaximumTotalCostCriterion,
  deriveCustomerMaximumResponseTimeCriterion,
  deriveCustomerProviderDataSharingCriterion,
} from '@/modules/customer-request/semantic-interpreter'
import type { CustomerRequestRoutePlanGeneration } from '@/modules/customer-request/route-plan-generation'
import {
  type CustomerRequestV2WritePorts,
  type CommitCommandRow,
  type GenerationCommandRow,
  type GraphValidationStatus,
  type RequestHeadSnapshot,
  type RoutePlanHeadSnapshot,
} from '@/modules/customer-request/v2-write'
import {
  customerRequestV2AggregateValue,
  routePlanGenerationV2Value,
} from '@/modules/customer-request/runtime'
import type { Infer } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { listRouteableCapabilitySupply } from './capabilitySupply'
import {
  getActiveExactCapabilityContract,
} from './capabilityContractDocuments'
import { supersedeCurrentRouteMandate } from './customerRequestRouteMandateLifecycle'
import {
  readExactRoutePlanGeneration,
  readGenerationRefreshCommandResult,
  readVerifiedCommandReplay,
} from './customerRequestV2ReadPorts'

type Aggregate = Infer<typeof customerRequestV2AggregateValue>
type RouteGeneration = Infer<typeof routePlanGenerationV2Value>

export function customerRequestV2WritePorts(ctx: MutationCtx): CustomerRequestV2WritePorts {
  return {
    loadCommitCommand: async (commandKey) => {
      const prior = await ctx.db.query('customerRequestV2Commands')
        .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
      return prior === null ? null : toCommitCommandRow(prior)
    },

    verifyCommitCommandReplay: async (command) => {
      const verified = await readVerifiedCommandReplay(ctx.db, command)
      if (verified.kind !== 'current') {
        throw new Error('customer_request_v2_command_integrity_failure')
      }
      return {
        kind: 'current' as const,
        aggregate: domainAggregate(verified.aggregate),
      }
    },

    validateAggregateAgainstCurrentCapabilityGraph: async (aggregate, routeGeneration) => (
      await validateAggregateAgainstCurrentCapabilityGraph(
        ctx.db,
        aggregate as unknown as Aggregate,
        routeGeneration as unknown as RouteGeneration | undefined,
      )
    ),

    loadRequestHead: async (requestId) => {
      const head = await ctx.db.query('customerRequestV2Heads')
        .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
      return head === null ? null : toRequestHead(head)
    },

    loadRoutePlanHead: async (requestId) => {
      const head = await ctx.db.query('customerRequestV2RoutePlanHeads')
        .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
      return head === null ? null : toRoutePlanHead(head)
    },

    loadRevision: async (requestId, requestRevision) => {
      const revision = await ctx.db.query('customerRequestV2Revisions')
        .withIndex('by_requestId_and_requestRevision', (query) => (
          query.eq('requestId', requestId).eq('requestRevision', requestRevision)
        )).unique()
      if (revision === null) return null
      return {
        requestId: revision.requestId,
        requestRevision: revision.requestRevision,
        aggregate: domainAggregate(revision.aggregate),
      }
    },

    loadGenerationByNumber: async (requestId, generation) => {
      const row = await ctx.db.query('customerRequestV2RoutePlanGenerations')
        .withIndex('by_requestId_and_generation', (query) => (
          query.eq('requestId', requestId).eq('generation', generation)
        )).unique()
      return row === null ? null : { generation: row.generation }
    },

    loadExactRoutePlanGeneration: async (requestId, generationRef) => {
      const result = await readExactRoutePlanGeneration(ctx.db, requestId, generationRef)
      if (result.kind === 'not_found') return result
      return {
        kind: 'found' as const,
        routeGeneration: domainRouteGeneration(result.routeGeneration),
      }
    },

    supersedeCurrentRouteMandate: async (input) => {
      await supersedeCurrentRouteMandate(ctx.db, input)
    },

    insertRevision: async (input) => {
      await ctx.db.insert('customerRequestV2Revisions', {
        requestId: input.requestId,
        requestRevision: input.requestRevision,
        aggregate: writableAggregate(input.aggregate as unknown as Aggregate),
      })
    },

    insertRoutePlanGeneration: async (input) => {
      await ctx.db.insert('customerRequestV2RoutePlanGenerations', {
        requestId: input.requestId,
        generation: input.generation,
        generationRef: input.generationRef,
        generationDigest: input.generationDigest,
        requestRevision: input.requestRevision,
        routeGeneration: writableRouteGeneration(input.routeGeneration as unknown as RouteGeneration),
        recordedAt: input.recordedAt,
      })
    },

    insertRoutePlanHead: async (input) => {
      await ctx.db.insert('customerRequestV2RoutePlanHeads', input)
    },

    patchRoutePlanHead: async (headId, patch) => {
      const next: Record<string, unknown> = { updatedAt: patch.updatedAt }
      if (patch.currentGeneration !== undefined) next.currentGeneration = patch.currentGeneration
      if (patch.currentRequestRevision !== undefined) {
        next.currentRequestRevision = patch.currentRequestRevision
      }
      if (patch.currentGenerationRef !== undefined) {
        next.currentGenerationRef = patch.currentGenerationRef === null
          ? undefined
          : patch.currentGenerationRef
      }
      if (patch.currentGenerationDigest !== undefined) {
        next.currentGenerationDigest = patch.currentGenerationDigest === null
          ? undefined
          : patch.currentGenerationDigest
      }
      if (patch.currentDecisionCommandKey !== undefined) {
        next.currentDecisionCommandKey = patch.currentDecisionCommandKey === null
          ? undefined
          : patch.currentDecisionCommandKey
      }
      if (patch.currentDecisionCommandDigest !== undefined) {
        next.currentDecisionCommandDigest = patch.currentDecisionCommandDigest === null
          ? undefined
          : patch.currentDecisionCommandDigest
      }
      await ctx.db.patch(headId as Id<'customerRequestV2RoutePlanHeads'>, next)
    },

    insertRequestHead: async (input) => {
      await ctx.db.insert('customerRequestV2Heads', input)
    },

    patchRequestHead: async (input) => {
      await ctx.db.patch(input.headId as Id<'customerRequestV2Heads'>, {
        currentRevision: input.currentRevision,
        currentAggregateDigest: input.currentAggregateDigest,
        updatedAt: input.updatedAt,
      })
    },

    insertCommitCommand: async (input) => {
      await ctx.db.insert('customerRequestV2Commands', {
        commandKey: input.commandKey,
        commandDigest: input.commandDigest,
        principalId: input.principalId,
        requestId: input.requestId,
        expectedRevision: input.expectedRevision,
        resultingRevision: input.resultingRevision,
        aggregateDigest: input.aggregateDigest,
        expectedRouteGeneration: input.expectedRouteGeneration,
        ...(input.resultingRouteGenerationRef === undefined
          ? {}
          : { resultingRouteGenerationRef: input.resultingRouteGenerationRef }),
        committedAt: input.committedAt,
      })
    },

    loadGenerationCommand: async (commandKey) => {
      const command = await ctx.db.query('customerRequestV2RoutePlanGenerationCommands')
        .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
      return command === null ? null : toGenerationCommandRow(command)
    },

    readGenerationRefreshCommandResult: async (command) => (
      await readGenerationRefreshCommandResult(ctx.db, {
        requestId: command.requestId,
        resultKind: command.resultKind,
        ...(command.retryReason === undefined ? {} : { retryReason: command.retryReason }),
        ...(command.resultAggregate === undefined
          ? {}
          : { resultAggregate: command.resultAggregate as unknown as Aggregate }),
        ...(command.resultingGeneration === undefined
          ? {}
          : { resultingGeneration: command.resultingGeneration }),
        ...(command.resultingGenerationRef === undefined
          ? {}
          : { resultingGenerationRef: command.resultingGenerationRef }),
        ...(command.resultingGenerationDigest === undefined
          ? {}
          : { resultingGenerationDigest: command.resultingGenerationDigest }),
      })
    ),

    insertGenerationCommand: async (input) => {
      await ctx.db.insert('customerRequestV2RoutePlanGenerationCommands', {
        commandKey: input.commandKey,
        commandDigest: input.commandDigest,
        principalId: input.principalId,
        requestId: input.requestId,
        expectedRequestRevision: input.expectedRequestRevision,
        expectedGeneration: input.expectedGeneration,
        expectedGenerationRef: input.expectedGenerationRef,
        ...(input.expectedDecisionCommandKey === undefined
          ? {}
          : { expectedDecisionCommandKey: input.expectedDecisionCommandKey }),
        resultKind: input.resultKind,
        ...(input.retryReason === undefined ? {} : { retryReason: input.retryReason }),
        ...(input.resultAggregate === undefined
          ? {}
          : { resultAggregate: writableAggregate(input.resultAggregate as unknown as Aggregate) }),
        ...(input.resultingGeneration === undefined
          ? {}
          : { resultingGeneration: input.resultingGeneration }),
        ...(input.resultingGenerationRef === undefined
          ? {}
          : { resultingGenerationRef: input.resultingGenerationRef }),
        ...(input.resultingGenerationDigest === undefined
          ? {}
          : { resultingGenerationDigest: input.resultingGenerationDigest }),
        committedAt: input.committedAt,
      })
    },
  }
}

async function validateAggregateAgainstCurrentCapabilityGraph(
  db: Parameters<typeof listRouteableCapabilitySupply>[0],
  aggregate: Aggregate,
  routeGeneration: RouteGeneration | undefined,
): Promise<GraphValidationStatus> {
  const currentSupply = await listRouteableCapabilitySupply(db, {
    networkId: aggregate.snapshot.networkId,
    limit: 64,
  })
  if (currentSupply.kind !== 'available') return 'stale'
  const bindings = registeredEvaluationBindingsFromEligibleSupply(currentSupply)
  if (requestRegistrySnapshotDigest(bindings) !== aggregate.evaluation.registrySnapshotDigest) {
    return 'stale'
  }
  const models = new Map<string, CapabilityDecisionModel>()
  for (const binding of bindings) {
    const key = exactRefKey(binding.contractRef)
    if (models.has(key)) continue
    const stored = await getActiveExactCapabilityContract(db, binding.contractRef)
    if (stored.kind !== 'found') return 'stale'
    let model: CapabilityDecisionModel
    try {
      model = openCapabilityDecisionModel(
        encodeCapabilityContractDocumentJson(stored.documentJson).contract,
      )
    } catch {
      return 'stale'
    }
    if (!sameCapabilityContractRef(model.contractRef, binding.contractRef)) return 'stale'
    models.set(key, model)
  }
  const facts = rebindAggregateFacts(aggregate.snapshot.facts, models)
  if (facts === undefined) return 'invalid'
  const resolveModel = (ref: Aggregate['plan']['actions'][number]['contractRef']) => (
    models.get(exactRefKey(ref))
  )
  const baseActions = [...aggregate.plan.actions]
    .sort((left, right) => left.selectionKey.localeCompare(right.selectionKey))
    .flatMap((action, ordinal) => {
      const model = resolveModel(action.contractRef)
      if (model === undefined || model.selectionKey !== action.selectionKey
        || model.semanticDigest !== action.semanticDigest) {
        return []
      }
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
        inputMappings: [],
      }]
    })
  const actions = composeRequestActions(baseActions, models)
  if (actions === undefined) return 'invalid'
  if (actions.length !== aggregate.plan.actions.length
    || canonicalDigest(actions as StableHashValue)
      !== canonicalDigest(aggregate.plan.actions as StableHashValue)) {
    return 'invalid'
  }
  const evaluation = aggregate.plan.actions.length === 0
    && aggregate.evaluation.nextRequirement?.kind === 'intent_direction'
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
        ...(() => {
          const criteria = [
            ...deriveCustomerMaterialConstraints(aggregate.snapshot.intent),
            deriveCustomerMaximumTotalCostCriterion(aggregate.snapshot.intent),
            deriveCustomerMaximumResponseTimeCriterion(aggregate.snapshot.intent),
            deriveCustomerProviderDataSharingCriterion(aggregate.snapshot.intent),
          ].filter((criterion): criterion is NonNullable<typeof criterion> => criterion !== undefined)
          return criteria.length === 0 ? {} : { derivedCriteria: criteria }
        })(),
        candidates: discoverRequestEvaluationCandidates({
          selectedCapabilities: actions.map(({ selectionKey, contractRef }) => ({
            selectionKey, contractRef,
          })),
          bindings,
          resolveModel,
        }),
        proposedActions: actions,
        resolveModel,
      })
  if (evaluation.candidates.some((candidate) => candidate.viability.kind === 'incompatible')) {
    return 'invalid'
  }
  const storedEvaluation = domainAggregate(aggregate).evaluation
  if (!evaluationMatchesConservativeReadinessSnapshot(evaluation, storedEvaluation)) {
    return 'invalid'
  }
  const routes = compileRoutePlans({
    requestId: aggregate.snapshot.requestId,
    requestRevision: aggregate.snapshot.revision,
    registrySnapshotDigest: aggregate.evaluation.registrySnapshotDigest,
    actions,
    candidates: storedEvaluation.candidates,
    now: aggregate.snapshot.recordedAt,
    models,
    ...(evaluation.decisionPreference === undefined
      ? {}
      : { objective: evaluation.decisionPreference.objective }),
    ...(evaluation.decisionPreference === undefined ? {} : {
      objectiveEvidenceRef: evaluation.decisionPreference.evidenceRef,
    }),
    ...(() => {
      const criterion = deriveCustomerMaximumTotalCostCriterion(aggregate.snapshot.intent)
      return criterion === undefined ? {} : {
        maximumTotalCost: criterion.value,
      }
    })(),
    customerFactRequiresEvidence: deriveCustomerMaterialConstraints(aggregate.snapshot.intent)
      .some(({ impact }) => impact === 'uncertainty'),
    ...(aggregate.snapshot.routeExclusions === undefined ? {} : {
      excludedChoiceSignatures: aggregate.snapshot.routeExclusions.map(
        ({ choiceSignature }) => choiceSignature,
      ),
    }),
  })
  const unknownCostFailsClosed = routeGeneration === undefined
    && aggregate.outcome === 'unsupported'
    && routes !== undefined
    && routes.length > 0
    && routes.some((route) => route.maximumTotalCost.kind !== 'known')
  if (routes === undefined) return 'invalid'
  if (!unknownCostFailsClosed
    && canonicalDigest(routes as StableHashValue)
      !== canonicalDigest(routeGeneration?.routes ?? [] as StableHashValue)) {
    return 'invalid'
  }
  return 'current'
}

type AvailableEligibleCapabilitySupply = Extract<
  Awaited<ReturnType<typeof listRouteableCapabilitySupply>>,
  { kind: 'available' }
>

function registeredEvaluationBindingsFromEligibleSupply(
  supply: AvailableEligibleCapabilitySupply,
): RegisteredEvaluationBinding[] {
  return supply.supplies.map(({ offering, binding, publication }) => ({
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
    price: offering.presentation.price,
    commercialRelationship: {
      ...offering.presentation.commercialRelationship,
      evidenceRefs: [...offering.presentation.commercialRelationship.evidenceRefs],
    },
    cancellation: { ...binding.cancellation, evidenceRefs: [...binding.cancellation.evidenceRefs] },
    ...(publication === undefined ? {} : {
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      readinessValidUntil: publication.readinessValidUntil,
    }),
  }))
}

function evaluationMatchesConservativeReadinessSnapshot(
  current: CustomerRequestV2Aggregate['evaluation'],
  stored: CustomerRequestV2Aggregate['evaluation'],
): boolean {
  if (current.candidates.length !== stored.candidates.length) return false
  const storedCandidates = new Map(stored.candidates.map((candidate) => [
    candidate.candidateRef,
    candidate,
  ]))
  const normalizedCandidates = current.candidates.flatMap((candidate) => {
    const prior = storedCandidates.get(candidate.candidateRef)
    if (prior === undefined) return []
    const currentReadiness = candidate.readinessValidUntil
    const storedReadiness = prior.readinessValidUntil
    if ((currentReadiness === undefined) !== (storedReadiness === undefined)
      || (currentReadiness !== undefined && storedReadiness !== undefined
        && currentReadiness < storedReadiness)) {
      return []
    }
    return [{
      ...candidate,
      ...(storedReadiness === undefined
        ? {}
        : { readinessValidUntil: storedReadiness }),
    }]
  })
  if (normalizedCandidates.length !== current.candidates.length) return false
  const { evaluationDigest: _currentDigest, candidates: _currentCandidates, ...currentMaterial } = current
  const { evaluationDigest: _storedDigest, candidates: _storedCandidates, ...storedMaterial } = stored
  return canonicalDigest({
    ...currentMaterial,
    candidates: normalizedCandidates,
  } as StableHashValue) === canonicalDigest({
    ...storedMaterial,
    candidates: stored.candidates,
  } as StableHashValue)
}

function rebindAggregateFacts(
  storedFacts: Aggregate['snapshot']['facts'],
  models: ReadonlyMap<string, CapabilityDecisionModel>,
) {
  const facts = storedFacts.flatMap((fact) => {
    const model = models.get(exactRefKey(fact.contractRef))
    const input = model?.inputs.find((candidate) => candidate.key === fact.inputKey
      && candidate.inputPointer === fact.inputPointer
      && candidate.schemaIdentity === fact.schemaIdentity)
    if (model === undefined || input === undefined || model.selectionKey !== fact.selectionKey
      || !isBoundedJsonValue(fact.value)) {
      return []
    }
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

function toCommitCommandRow(row: Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  requestId: string
  expectedRevision: number
  resultingRevision: number
  aggregateDigest: string
  expectedRouteGeneration?: number
  resultingRouteGenerationRef?: string
  noEffect?: boolean
  committedAt: number
}>): CommitCommandRow {
  return {
    commandKey: row.commandKey,
    commandDigest: row.commandDigest,
    principalId: row.principalId,
    requestId: row.requestId,
    expectedRevision: row.expectedRevision,
    resultingRevision: row.resultingRevision,
    aggregateDigest: row.aggregateDigest,
    ...(row.expectedRouteGeneration === undefined
      ? {}
      : { expectedRouteGeneration: row.expectedRouteGeneration }),
    ...(row.resultingRouteGenerationRef === undefined
      ? {}
      : { resultingRouteGenerationRef: row.resultingRouteGenerationRef }),
    ...(row.noEffect === undefined ? {} : { noEffect: row.noEffect }),
    committedAt: row.committedAt,
  }
}

function toGenerationCommandRow(row: Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  requestId: string
  expectedRequestRevision: number
  expectedGeneration: number
  expectedGenerationRef: string
  expectedDecisionCommandKey?: string
  resultKind: GenerationCommandRow['resultKind']
  retryReason?: GenerationCommandRow['retryReason']
  resultAggregate?: Aggregate
  resultingGeneration?: number
  resultingGenerationRef?: string
  resultingGenerationDigest?: string
  committedAt: number
}>): GenerationCommandRow {
  return {
    commandKey: row.commandKey,
    commandDigest: row.commandDigest,
    principalId: row.principalId,
    requestId: row.requestId,
    expectedRequestRevision: row.expectedRequestRevision,
    expectedGeneration: row.expectedGeneration,
    expectedGenerationRef: row.expectedGenerationRef,
    ...(row.expectedDecisionCommandKey === undefined
      ? {}
      : { expectedDecisionCommandKey: row.expectedDecisionCommandKey }),
    resultKind: row.resultKind,
    ...(row.retryReason === undefined ? {} : { retryReason: row.retryReason }),
    ...(row.resultAggregate === undefined
      ? {}
      : { resultAggregate: domainAggregate(row.resultAggregate) }),
    ...(row.resultingGeneration === undefined
      ? {}
      : { resultingGeneration: row.resultingGeneration }),
    ...(row.resultingGenerationRef === undefined
      ? {}
      : { resultingGenerationRef: row.resultingGenerationRef }),
    ...(row.resultingGenerationDigest === undefined
      ? {}
      : { resultingGenerationDigest: row.resultingGenerationDigest }),
    committedAt: row.committedAt,
  }
}

function toRequestHead(head: Readonly<{
  _id: Id<'customerRequestV2Heads'>
  requestId: string
  principalId: string
  delegatedAgentId: string
  currentRevision: number
  currentAggregateDigest: string
}>): RequestHeadSnapshot {
  return {
    id: head._id,
    requestId: head.requestId,
    principalId: head.principalId,
    delegatedAgentId: head.delegatedAgentId,
    currentRevision: head.currentRevision,
    currentAggregateDigest: head.currentAggregateDigest,
  }
}

function toRoutePlanHead(head: Readonly<{
  _id: Id<'customerRequestV2RoutePlanHeads'>
  requestId: string
  currentGeneration: number
  currentRequestRevision: number
  currentGenerationRef?: string
  currentGenerationDigest?: string
  currentDecisionCommandKey?: string
  currentDecisionCommandDigest?: string
}>): RoutePlanHeadSnapshot {
  return {
    id: head._id,
    requestId: head.requestId,
    currentGeneration: head.currentGeneration,
    currentRequestRevision: head.currentRequestRevision,
    ...(head.currentGenerationRef === undefined
      ? {}
      : { currentGenerationRef: head.currentGenerationRef }),
    ...(head.currentGenerationDigest === undefined
      ? {}
      : { currentGenerationDigest: head.currentGenerationDigest }),
    ...(head.currentDecisionCommandKey === undefined
      ? {}
      : { currentDecisionCommandKey: head.currentDecisionCommandKey }),
    ...(head.currentDecisionCommandDigest === undefined
      ? {}
      : { currentDecisionCommandDigest: head.currentDecisionCommandDigest }),
  }
}

function writableRouteGeneration(generation: RouteGeneration): RouteGeneration {
  return structuredClone(generation)
}

function domainRouteGeneration(value: RouteGeneration): CustomerRequestRoutePlanGeneration
function domainRouteGeneration(value: undefined): undefined
function domainRouteGeneration(value: unknown): CustomerRequestRoutePlanGeneration | undefined
function domainRouteGeneration(value: unknown): CustomerRequestRoutePlanGeneration | undefined {
  return value as CustomerRequestRoutePlanGeneration | undefined
}

function domainAggregate(value: unknown): CustomerRequestV2Aggregate {
  return value as CustomerRequestV2Aggregate
}

function writableAggregate(aggregate: Aggregate): Aggregate {
  return structuredClone(aggregate)
}

function exactRefKey(ref: Readonly<{
  capabilityId: string
  version: number
  contractDigest: string
}>): string {
  return `${ref.capabilityId}\u0000${ref.version}\u0000${ref.contractDigest}`
}
