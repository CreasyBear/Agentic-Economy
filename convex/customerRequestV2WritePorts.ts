import {
  isBoundedJsonValue,
  openCapabilityDecisionModel,
  sameCapabilityContractRef,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import {
  createRegisteredOperationMappingRef,
  type RegisteredOperationMapping,
} from '@/modules/capability-supply/public'
import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  composeRequestActions,
  compileRoutePlans,
  writableCustomerRequestV2Aggregate,
  type CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import {
  discoverRequestEvaluationCandidates,
  evaluateCustomerRequestSnapshot,
  evaluateIntentDirectionRequestSnapshot,
  requestRegistrySnapshotDigest,
} from '@/modules/customer-request/evaluation'
import {
  deriveCustomerDecisionPreference,
  deriveCustomerMaterialConstraints,
  deriveCustomerMaximumTotalCostCriterion,
  deriveCustomerMaximumResponseTimeCriterion,
  deriveCustomerProviderDataSharingCriterion,
} from '@/modules/customer-request/semantic-interpreter'
import {
  writableCustomerRequestRoutePlanGeneration,
} from '@/modules/customer-request/route-plan-generation'
import {
  type CustomerRequestV2WritePorts,
  type CommitCommandRow,
  type GraphValidationStatus,
} from '@/modules/customer-request/v2-write'
import {
  customerRequestV2AggregateValue,
  routePlanGenerationV2Value,
} from '@/modules/customer-request/runtime'
import { exactContractRefKey } from '@/modules/customer-request/contract-ref-key'
import type { Infer } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { listRouteableCapabilitySupply } from './capabilitySupply'
import {
  getActiveExactCapabilityContract,
} from './capabilityContractDocuments'
import { supersedeCurrentRouteMandate } from './customerRequestRouteMandateLifecycle'
import { registeredEvaluationBindingsFromRouteableSupply } from './customerRequestEvaluationBindings'
import {
  customerRequestV2ReadPorts,
  asDomainAggregate,
  readVerifiedCommandReplay,
} from './customerRequestV2ReadPorts'

type Aggregate = Infer<typeof customerRequestV2AggregateValue>
type RouteGeneration = Infer<typeof routePlanGenerationV2Value>

export function customerRequestV2WritePorts(ctx: MutationCtx): CustomerRequestV2WritePorts {
  return {
    ...customerRequestV2ReadPorts(ctx),
    loadCommitCommand: async (commandKey) => {
      const prior = await ctx.db.query('customerRequestV2Commands')
        .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
      return prior === null ? null : toCommitCommandRow(prior)
    },

    verifyCommitCommandReplay: async (command) => {
      const verified = await readVerifiedCommandReplay(ctx.db, command)
      return {
        kind: 'current' as const,
        aggregate: asDomainAggregate(verified.aggregate),
      }
    },

    validateAggregateAgainstCurrentCapabilityGraph: async (aggregate, routeGeneration) => (
      await validateAggregateAgainstCurrentCapabilityGraph(
        ctx.db,
        writableCustomerRequestV2Aggregate(aggregate),
        routeGeneration === undefined
          ? undefined
          : writableCustomerRequestRoutePlanGeneration(routeGeneration),
      )
    ),


    loadGenerationByNumber: async (requestId, generation) => {
      const row = await ctx.db.query('customerRequestV2RoutePlanGenerations')
        .withIndex('by_requestId_and_generation', (query) => (
          query.eq('requestId', requestId).eq('generation', generation)
        )).unique()
      return row === null ? null : { generation: row.generation }
    },


    supersedeCurrentRouteMandate: async (input) => {
      await supersedeCurrentRouteMandate(ctx.db, input)
    },

    insertRevision: async (input) => {
      await ctx.db.insert('customerRequestV2Revisions', {
        requestId: input.requestId,
        requestRevision: input.requestRevision,
        aggregate: writableCustomerRequestV2Aggregate(input.aggregate),
      })
    },

    insertRoutePlanGeneration: async (input) => {
      await ctx.db.insert('customerRequestV2RoutePlanGenerations', {
        requestId: input.requestId,
        generation: input.generation,
        generationRef: input.generationRef,
        generationDigest: input.generationDigest,
        requestRevision: input.requestRevision,
        routeGeneration: writableCustomerRequestRoutePlanGeneration(input.routeGeneration),
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
          : { resultAggregate: writableCustomerRequestV2Aggregate(input.resultAggregate) }),
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
  const bindings = registeredEvaluationBindingsFromRouteableSupply(
    currentSupply,
    { includePublication: true },
  )
  if (requestRegistrySnapshotDigest(bindings) !== aggregate.evaluation.registrySnapshotDigest) {
    return 'stale'
  }
  const models = new Map<string, CapabilityDecisionModel>()
  for (const binding of bindings) {
    const key = exactContractRefKey(binding.contractRef)
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
  const domain = asDomainAggregate(aggregate)
  const resolveModel = (ref: Aggregate['plan']['actions'][number]['contractRef']) => (
    models.get(exactContractRefKey(ref))
  )
  const storedActions = [...domain.plan.actions]
    .sort((left, right) => left.selectionKey.localeCompare(right.selectionKey))
  const baseActions = storedActions
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
        operationRef: action.operationRef,
        contractRef: model.contractRef,
        selectionKey: model.selectionKey,
        semanticDigest: model.semanticDigest,
      }
      return [{
        actionId: `action:${canonicalDigest(actionMaterial)}`,
        operationRef: action.operationRef,
        contractRef: model.contractRef,
        selectionKey: model.selectionKey,
        semanticDigest: model.semanticDigest,
        dependsOn: [...action.dependsOn],
        inputs: facts.filter((fact) => fact.selectionKey === model.selectionKey
          && sameCapabilityContractRef(fact.contractRef, model.contractRef)),
        mappingRefs: [...action.mappingRefs],
        inputMappings: action.inputMappings,
      }]
    })
  const registeredMappings = registeredMappingsFromActions(storedActions, models)
  if (registeredMappings === undefined) return 'invalid'
  const actions = composeRequestActions(baseActions, models, registeredMappings)
  if (actions === undefined) return 'invalid'
  if (actions.length !== aggregate.plan.actions.length
    || canonicalDigest(actions)
      !== canonicalDigest(aggregate.plan.actions)) {
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
          selectedCapabilities: actions.map(({ operationRef, selectionKey, contractRef }) => ({
            operationRef, selectionKey, contractRef,
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
  const storedEvaluation = asDomainAggregate(aggregate).evaluation
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
    && canonicalDigest(routes)
      !== canonicalDigest(routeGeneration?.routes ?? [])) {
    return 'invalid'
  }
  return 'current'
}

type RegisteredOperationMappingMaterial =
  | Omit<Extract<RegisteredOperationMapping, { kind: 'identity' | 'field' }>, 'mappingRef'>
  | Omit<Extract<RegisteredOperationMapping, { kind: 'array_project' }>, 'mappingRef'>
  | Omit<Extract<RegisteredOperationMapping, { kind: 'registered_transform' }>, 'mappingRef'>

function registeredMappingsFromActions(
  actions: readonly CustomerRequestV2Aggregate['plan']['actions'][number][],
  models: ReadonlyMap<string, CapabilityDecisionModel>,
): readonly RegisteredOperationMapping[] | undefined {
  const actionsById = new Map(actions.map((action) => [action.actionId, action]))
  const mappings: RegisteredOperationMapping[] = []
  for (const targetAction of actions) {
    const targetModel = models.get(exactContractRefKey(targetAction.contractRef))
    if (targetModel === undefined) return undefined
    for (const inputMapping of targetAction.inputMappings) {
      const sourceAction = actionsById.get(inputMapping.source.actionId)
      const sourceModel = sourceAction === undefined
        ? undefined
        : models.get(exactContractRefKey(sourceAction.contractRef))
      const sourceEvidence = sourceModel?.evidence.find((evidence) => (
        evidence.annotationId === inputMapping.source.annotationId
        && evidence.evidenceId === inputMapping.source.evidenceId
        && evidence.outputPointer === inputMapping.source.outputPointer
      ))
      const targetInput = targetModel.inputs.find((input) => (
        input.annotationId === inputMapping.target.annotationId
        && input.key === inputMapping.target.inputKey
        && input.inputPointer === inputMapping.target.inputPointer
        && input.schemaIdentity === inputMapping.schemaIdentity
        && input.semanticIdentity === inputMapping.semanticIdentity
      ))
      if (
        sourceAction === undefined
        || sourceModel === undefined
        || sourceEvidence === undefined
        || targetInput === undefined
        || sourceEvidence.semanticIdentity !== inputMapping.semanticIdentity
      ) return undefined
      const common = {
        sourceContractRef: sourceModel.contractRef,
        targetContractRef: targetModel.contractRef,
        sourceSchemaIdentity: sourceEvidence.schemaIdentity,
        targetSchemaIdentity: inputMapping.schemaIdentity,
        authority: 'registered_contract_semantics' as const,
      }
      let mapping: RegisteredOperationMappingMaterial
      if (inputMapping.kind === 'array_project') {
        if (
          inputMapping.sourceArrayPointer === undefined
          || inputMapping.sourceItemPointer === undefined
          || inputMapping.targetArrayPointer === undefined
          || inputMapping.minItems === undefined
          || inputMapping.maxItems === undefined
        ) return undefined
        mapping = {
          ...common,
          kind: 'array_project',
          sourceArrayPointer: inputMapping.sourceArrayPointer,
          sourceItemPointer: inputMapping.sourceItemPointer,
          targetArrayPointer: inputMapping.targetArrayPointer,
          minItems: inputMapping.minItems,
          maxItems: inputMapping.maxItems,
        }
      } else if (inputMapping.kind === 'registered_transform') {
        if (
          inputMapping.transformRef === undefined
          || inputMapping.transformVersion === undefined
          || inputMapping.inputCardinalityMax === undefined
          || inputMapping.outputCardinalityMax === undefined
        ) return undefined
        mapping = {
          ...common,
          kind: 'registered_transform',
          transformRef: inputMapping.transformRef,
          transformVersion: inputMapping.transformVersion,
          sourceOutputPointer: inputMapping.source.outputPointer,
          targetInputPointer: inputMapping.target.inputPointer,
          inputCardinalityMax: inputMapping.inputCardinalityMax,
          outputCardinalityMax: inputMapping.outputCardinalityMax,
        }
      } else {
        mapping = {
          ...common,
          kind: inputMapping.kind,
          sourceOutputPointer: inputMapping.source.outputPointer,
          targetInputPointer: inputMapping.target.inputPointer,
        }
      }
      if (createRegisteredOperationMappingRef(mapping) !== inputMapping.mappingRef) return undefined
      mappings.push({ ...mapping, mappingRef: inputMapping.mappingRef })
    }
  }
  return Object.freeze(mappings)
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
      admittedOperation: {
        ...candidate.admittedOperation,
        readinessValidUntil: prior.admittedOperation.readinessValidUntil,
        qualificationDigest: prior.admittedOperation.qualificationDigest,
      },
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
  }) === canonicalDigest({
    ...storedMaterial,
    candidates: stored.candidates,
  })
}

function rebindAggregateFacts(
  storedFacts: Aggregate['snapshot']['facts'],
  models: ReadonlyMap<string, CapabilityDecisionModel>,
) {
  const facts = storedFacts.flatMap((fact) => {
    const model = models.get(exactContractRefKey(fact.contractRef))
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




