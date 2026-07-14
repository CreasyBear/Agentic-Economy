import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  CustomerRequestRoutePlan,
  CustomerRequestV2Aggregate,
  CustomerRequestV2PlanRevision,
} from './compiler'

export const CUSTOMER_REQUEST_ROUTE_PLAN_GENERATION_FORMAT = 'ae.route-plan-generation:v1' as const

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
  routes: readonly CustomerRequestRoutePlan[]
  createdAt: number
}>

type RoutePlanGenerationMaterial = Readonly<{
  format: typeof CUSTOMER_REQUEST_ROUTE_PLAN_GENERATION_FORMAT
  requestId: string
  requestRevision: number
  compiler: CustomerRequestRoutePlanGeneration['compiler']
  registrySnapshotDigest: string
  routes: readonly CustomerRequestRoutePlan[]
  authority: 'proposal_only'
  createdAt: number
}>

export function createCustomerRequestRoutePlanGeneration(
  input: CreateCustomerRequestRoutePlanGenerationInput,
): CustomerRequestRoutePlanGeneration {
  if (!Number.isSafeInteger(input.generation) || input.generation < 1 || input.routes.length === 0) {
    throw new Error('customer_request_route_plan_generation_invalid')
  }
  const material = routePlanGenerationDigestMaterial({
    format: CUSTOMER_REQUEST_ROUTE_PLAN_GENERATION_FORMAT,
    requestId: input.requestId,
    requestRevision: input.requestRevision,
    compiler: input.compiler,
    registrySnapshotDigest: input.registrySnapshotDigest,
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
      && route.edges.every(({ fromStep, toStep }) => actionRefs.has(fromStep) && actionRefs.has(toStep))
      && Number.isSafeInteger(route.expiresAt)
      && route.expiresAt > generation.createdAt
      && routePlanId === `route:${canonicalDigest(routeCore as StableHashValue)}`
      && routeDigest === canonicalDigest(routeMaterial as StableHashValue)
      && fallbacks.alternatives.every(({ alternativeRouteRef }) => (
        alternativeRouteRef !== routePlanId && routeRefs.has(alternativeRouteRef)
      ))
  })
}

export function writableCustomerRequestRoutePlanGeneration(
  generation: CustomerRequestRoutePlanGeneration,
) {
  return {
    ...generation,
    compiler: {
      ...generation.compiler,
      interpretationEvidence: { ...generation.compiler.interpretationEvidence },
    },
    routes: generation.routes.map((route) => ({
      ...route,
      steps: route.steps.map((step) => ({
        ...step,
        contractRef: { ...step.contractRef },
        resolvedInputs: step.resolvedInputs.map((fact) => ({
          ...fact,
          contractRef: { ...fact.contractRef },
          value: structuredClone(fact.value),
          source: { ...fact.source },
        })),
        deferredInputs: step.deferredInputs.map((mapping) => ({
          ...mapping, source: { ...mapping.source }, target: { ...mapping.target },
        })),
        price: { ...step.price },
        dataUse: step.dataUse.map((item) => ({
          ...item, recipient: { ...item.recipient }, purposes: [...item.purposes],
        })),
        effects: step.effects.map((effect) => ({ ...effect })),
        evidence: step.evidence.map((evidence) => ({ ...evidence })),
        recovery: { ...step.recovery },
      })),
      edges: route.edges.map((edge) => ({
        ...edge, source: { ...edge.source }, target: { ...edge.target },
      })),
      maximumTotalCost: { ...route.maximumTotalCost },
      uncertainty: [...route.uncertainty],
      fallbacks: {
        ordering: route.fallbacks.ordering,
        alternatives: route.fallbacks.alternatives.map((fallback) => ({ ...fallback })),
      },
      comparison: { ...route.comparison, ordering: { ...route.comparison.ordering } },
    })),
  }
}

function routePlanGenerationDigestMaterial(
  generation: RoutePlanGenerationMaterial,
): RoutePlanGenerationMaterial {
  return {
    format: generation.format,
    requestId: generation.requestId,
    requestRevision: generation.requestRevision,
    compiler: generation.compiler,
    registrySnapshotDigest: generation.registrySnapshotDigest,
    routes: generation.routes,
    authority: generation.authority,
    createdAt: generation.createdAt,
  }
}
