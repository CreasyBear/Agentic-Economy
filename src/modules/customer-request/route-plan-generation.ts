import { DirectedGraph } from 'graphology'
import { hasCycle } from 'graphology-dag'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  CustomerRequestRoutePlan,
  CustomerRequestV2Aggregate,
  CustomerRequestV2PlanRevision,
} from './compiler'

export const CUSTOMER_REQUEST_ROUTE_PLAN_GENERATION_FORMAT = 'ae.route-plan-generation:v1' as const

export type CustomerRequestRoutePlanDecisionSnapshot = Readonly<{
  requestSnapshotDigest: CustomerRequestV2Aggregate['snapshot']['snapshotDigest']
  factsDigest: CustomerRequestV2Aggregate['evaluation']['factsDigest']
  criteria: CustomerRequestV2Aggregate['evaluation']['criteria']
  completionRequirements: CustomerRequestV2Aggregate['evaluation']['completionRequirements']
  evaluationDigest: CustomerRequestV2Aggregate['evaluation']['evaluationDigest']
  planRevisionId: CustomerRequestV2Aggregate['plan']['planRevisionId']
  planDigest: CustomerRequestV2Aggregate['plan']['planDigest']
}>

export type CustomerRequestRoutePlanGeneration = Readonly<{
  format: typeof CUSTOMER_REQUEST_ROUTE_PLAN_GENERATION_FORMAT
  generationRef: string
  generation: number
  generationDigest: string
  requestId: string
  requestRevision: number
  compiler: Readonly<{
    compilerVersion: CustomerRequestV2PlanRevision['compilerVersion']
    interpreterId: string
    interpretationEvidence: CustomerRequestV2PlanRevision['interpretationEvidence']
    proposalDigest: string
  }>
  registrySnapshotDigest: string
  /** Optional only for immutable generations written before decision snapshots existed. */
  decisionSnapshot?: CustomerRequestRoutePlanDecisionSnapshot
  routes: readonly CustomerRequestRoutePlan[]
  authority: 'proposal_only'
  createdAt: number
}>

export type CreateCustomerRequestRoutePlanGenerationInput = Readonly<{
  generation: number
  requestId: string
  requestRevision: number
  compiler: CustomerRequestRoutePlanGeneration['compiler']
  registrySnapshotDigest: string
  decisionSnapshot: CustomerRequestRoutePlanDecisionSnapshot
  routes: readonly CustomerRequestRoutePlan[]
  createdAt: number
}>

type RoutePlanGenerationMaterial = Readonly<{
  format: typeof CUSTOMER_REQUEST_ROUTE_PLAN_GENERATION_FORMAT
  requestId: string
  requestRevision: number
  compiler: CustomerRequestRoutePlanGeneration['compiler']
  registrySnapshotDigest: string
  decisionSnapshot?: CustomerRequestRoutePlanDecisionSnapshot
  routes: readonly CustomerRequestRoutePlan[]
  authority: 'proposal_only'
  createdAt: number
}>

export function createCustomerRequestRoutePlanGeneration(
  input: CreateCustomerRequestRoutePlanGenerationInput,
): CustomerRequestRoutePlanGeneration {
  if (!Number.isSafeInteger(input.generation) || input.generation < 1 || input.routes.length === 0
    || !input.routes.every(routePlanGraphIsValid)) {
    throw new Error('customer_request_route_plan_generation_invalid')
  }
  const material = routePlanGenerationDigestMaterial({
    format: CUSTOMER_REQUEST_ROUTE_PLAN_GENERATION_FORMAT,
    requestId: input.requestId,
    requestRevision: input.requestRevision,
    compiler: input.compiler,
    registrySnapshotDigest: input.registrySnapshotDigest,
    decisionSnapshot: input.decisionSnapshot,
    routes: input.routes,
    authority: 'proposal_only',
    createdAt: input.createdAt,
  })
  const generationDigest = canonicalDigest(material as StableHashValue)
  const generationRef = `route-generation:${canonicalDigest({
    requestId: input.requestId,
    generation: input.generation,
    generationDigest,
  })}`
  return Object.freeze({
    ...material,
    generationRef,
    generation: input.generation,
    generationDigest,
  }) as CustomerRequestRoutePlanGeneration
}

export function routePlanGenerationIsInternallyConsistent(
  generation: CustomerRequestRoutePlanGeneration,
  expectedGeneration: number,
): boolean {
  if (generation.format !== CUSTOMER_REQUEST_ROUTE_PLAN_GENERATION_FORMAT
    || !Number.isSafeInteger(generation.generation)
    || generation.generation !== expectedGeneration + 1
    || !Number.isSafeInteger(generation.requestRevision)
    || generation.requestRevision < 1
    || !Number.isSafeInteger(generation.createdAt)
    || generation.createdAt < 0
    || generation.routes.length === 0
    || generation.authority !== 'proposal_only'
    || !routesAreInternallyConsistent(generation)) return false
  const generationDigest = canonicalDigest(routePlanGenerationDigestMaterial(generation) as StableHashValue)
  return generation.generationDigest === generationDigest
    && generation.generationRef === `route-generation:${canonicalDigest({
      requestId: generation.requestId,
      generation: generation.generation,
      generationDigest,
    })}`
}

export function routePlanGenerationMatchesAggregate(
  generation: CustomerRequestRoutePlanGeneration | undefined,
  aggregate: CustomerRequestV2Aggregate,
  expectedGeneration: number,
): boolean {
  if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) return false
  if (generation === undefined) return aggregate.outcome !== 'plan_ready'
  if (aggregate.outcome !== 'plan_ready'
    || !routePlanGenerationIsInternallyConsistent(generation, expectedGeneration)) return false
  return generation.requestId === aggregate.snapshot.requestId
    && generation.requestRevision === aggregate.snapshot.revision
    && generation.compiler.compilerVersion === aggregate.plan.compilerVersion
    && generation.compiler.interpreterId === aggregate.plan.interpreterId
    && generation.compiler.proposalDigest === aggregate.plan.proposalDigest
    && canonicalDigest(generation.compiler.interpretationEvidence as StableHashValue)
      === canonicalDigest(aggregate.plan.interpretationEvidence as StableHashValue)
    && generation.registrySnapshotDigest === aggregate.plan.registrySnapshotDigest
    && (generation.decisionSnapshot === undefined
      || canonicalDigest(generation.decisionSnapshot as StableHashValue)
        === canonicalDigest(routePlanGenerationDecisionSnapshot(aggregate) as StableHashValue))
    && generation.createdAt === aggregate.plan.createdAt
    && generation.routes.every((route) => route.steps.every((step) => {
      const action = aggregate.plan.actions.find(({ actionId }) => actionId === step.actionId)
      return action !== undefined
        && canonicalDigest(step.resolvedInputs as StableHashValue)
          === canonicalDigest(action.inputs as StableHashValue)
        && canonicalDigest(step.deferredInputs as StableHashValue)
          === canonicalDigest(action.inputMappings as StableHashValue)
    }))
}

/**
 * Historical generations may predate binding-owned cancellation metadata and
 * remain readable. Every generation admitted by current source must carry an
 * explicit posture on every step before it can be committed or authorized.
 */
export function routePlanGenerationOwnsCancellationPosture(
  generation: CustomerRequestRoutePlanGeneration,
): boolean {
  return generation.routes.every((route) => route.steps.every((step) => {
    const cancellation: unknown = (step as Readonly<{ cancellation?: unknown }>).cancellation
    if (!isRecord(cancellation)
      || (cancellation.kind !== 'unsupported' && cancellation.kind !== 'adapter_managed')
      || !Array.isArray(cancellation.evidenceRefs)
      || cancellation.evidenceRefs.length === 0) return false
    return cancellation.evidenceRefs.every((reference) => (
      typeof reference === 'string' && reference.trim().length > 0 && reference.length <= 500
    ))
  }))
}

export function routePlanGenerationDecisionSnapshot(
  aggregate: Pick<CustomerRequestV2Aggregate, 'snapshot' | 'evaluation' | 'plan'>,
): CustomerRequestRoutePlanDecisionSnapshot {
  return Object.freeze({
    requestSnapshotDigest: aggregate.snapshot.snapshotDigest,
    factsDigest: aggregate.evaluation.factsDigest,
    criteria: aggregate.evaluation.criteria,
    completionRequirements: aggregate.evaluation.completionRequirements,
    evaluationDigest: aggregate.evaluation.evaluationDigest,
    planRevisionId: aggregate.plan.planRevisionId,
    planDigest: aggregate.plan.planDigest,
  })
}

export function routePlanGenerationOwnsDecisionSnapshot(
  generation: CustomerRequestRoutePlanGeneration | undefined,
): generation is CustomerRequestRoutePlanGeneration & Readonly<{
  decisionSnapshot: CustomerRequestRoutePlanDecisionSnapshot
}> {
  return generation !== undefined && generation.decisionSnapshot !== undefined
}

export function routePlanGenerationMatchesRequest(
  generation: CustomerRequestRoutePlanGeneration,
  request: Readonly<{ requestId: string; revision: number }>,
  expectedGeneration: number,
): boolean {
  return routePlanGenerationIsInternallyConsistent(generation, expectedGeneration)
    && generation.requestId === request.requestId
    && generation.requestRevision === request.revision
}

export function routePlanGenerationMaterialDigest(
  generation: CustomerRequestRoutePlanGeneration,
): string {
  return canonicalDigest({
    format: generation.format,
    requestId: generation.requestId,
    requestRevision: generation.requestRevision,
    compilerVersion: generation.compiler.compilerVersion,
    registrySnapshotDigest: generation.registrySnapshotDigest,
    ...(generation.decisionSnapshot === undefined ? {} : {
      decisionSnapshot: {
        requestSnapshotDigest: generation.decisionSnapshot.requestSnapshotDigest,
        factsDigest: generation.decisionSnapshot.factsDigest,
        criteria: generation.decisionSnapshot.criteria,
        completionRequirements: generation.decisionSnapshot.completionRequirements,
        evaluationDigest: generation.decisionSnapshot.evaluationDigest,
      },
    }),
    routes: generation.routes,
    authority: generation.authority,
  } as StableHashValue)
}

function routesAreInternallyConsistent(generation: CustomerRequestRoutePlanGeneration): boolean {
  const routeRefs = new Set(generation.routes.map(({ routePlanId }) => routePlanId))
  if (routeRefs.size !== generation.routes.length) return false
  return generation.routes.every((route) => {
    const { routeDigest, ...routeMaterial } = route
    const { routePlanId, fallbacks, comparison, ...routeCoreWithoutComparison } = routeMaterial
    const { ordering: _ordering, ...baseComparison } = comparison
    const routeCore = { ...routeCoreWithoutComparison, comparison: baseComparison }
    const actionRefs = new Set(route.steps.map(({ actionId }) => actionId))
    return route.requestId === generation.requestId
      && route.requestRevision === generation.requestRevision
      && route.registrySnapshotDigest === generation.registrySnapshotDigest
      && route.authority === 'proposal_only'
      && route.steps.length > 0
      && route.maximumTotalCost.kind === 'known'
      && route.maximumTotalCost.currency.length > 0
      && Number.isSafeInteger(route.maximumTotalCost.amountMinor)
      && route.maximumTotalCost.amountMinor >= 0
      && actionRefs.size === route.steps.length
      && routePlanGraphIsValid(route)
      && Number.isSafeInteger(route.expiresAt)
      && route.expiresAt > generation.createdAt
      && routePlanId === `route:${canonicalDigest(routeCore as StableHashValue)}`
      && routeDigest === canonicalDigest(routeMaterial as StableHashValue)
      && fallbacks.alternatives.every(({ alternativeRouteRef }) => (
        alternativeRouteRef !== routePlanId && routeRefs.has(alternativeRouteRef)
      ))
  })
}

export function routePlanGraphIsValid(
  route: Readonly<{
    steps: readonly Readonly<{ actionId: string }>[]
    edges: readonly Readonly<{ fromStep: string; toStep: string }>[]
  }>,
): boolean {
  const actionIds = new Set(route.steps.map(({ actionId }) => actionId))
  if (actionIds.size !== route.steps.length) return false
  const stepGraph = new DirectedGraph()
  for (const actionId of actionIds) stepGraph.mergeNode(actionId)
  for (const { fromStep, toStep } of route.edges) {
    if (!actionIds.has(fromStep) || !actionIds.has(toStep) || fromStep === toStep) return false
    stepGraph.mergeDirectedEdge(fromStep, toStep)
  }
  return !hasCycle(stepGraph)
}

export function writableCustomerRequestRoutePlanGeneration(
  generation: CustomerRequestRoutePlanGeneration,
): DeepWritable<CustomerRequestRoutePlanGeneration> {
  return structuredClone(generation) as DeepWritable<CustomerRequestRoutePlanGeneration>
}

type DeepWritable<T> = T extends string | number | boolean | bigint | null | undefined
  ? T
  : T extends readonly (infer Item)[]
    ? DeepWritable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepWritable<T[Key]> }
      : T

function routePlanGenerationDigestMaterial(
  generation: RoutePlanGenerationMaterial,
): RoutePlanGenerationMaterial {
  return {
    format: generation.format,
    requestId: generation.requestId,
    requestRevision: generation.requestRevision,
    compiler: generation.compiler,
    registrySnapshotDigest: generation.registrySnapshotDigest,
    ...(generation.decisionSnapshot === undefined ? {} : { decisionSnapshot: generation.decisionSnapshot }),
    routes: generation.routes,
    authority: generation.authority,
    createdAt: generation.createdAt,
  }
}

