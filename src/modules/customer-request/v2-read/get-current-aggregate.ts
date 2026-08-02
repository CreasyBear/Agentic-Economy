import { routePlanGenerationMatchesRequest } from '@/modules/customer-request/route-plan-generation'
import {
  aggregateIsInternallyConsistent,
} from '@/modules/customer-request/v2-write'

import type { CustomerRequestV2ReadPorts } from './ports'
import type {
  GetCurrentAggregateArgs,
  GetCurrentAggregateResult,
} from './types'

export async function getCurrentAggregate(
  args: GetCurrentAggregateArgs,
  ports: CustomerRequestV2ReadPorts,
): Promise<GetCurrentAggregateResult> {
  const head = await ports.loadRequestHead(args.requestId)
  if (head !== null) {
    const revision = await ports.loadRevision(args.requestId, head.currentRevision)
    if (revision === null) {
      throw new Error('customer_request_v2_aggregate_integrity_failure')
    }
    // Historical V2 revisions may embed route plans in the aggregate. Recognize
    // that shape before digest or current-row validation, but never return the
    // legacy document as a current aggregate.
    if (hasLegacyEmbeddedRoute(revision.aggregate)) {
      return {
        kind: 'resubmit_required',
        requestId: args.requestId,
        revision: head.currentRevision,
        principalId: head.principalId,
        reason: 'legacy_embedded_route',
      }
    }
    if (revision.aggregate.aggregateDigest !== head.currentAggregateDigest
      || !aggregateIsInternallyConsistent(
        revision.aggregate,
        head.currentRevision - 1,
      )) {
      throw new Error('customer_request_v2_aggregate_integrity_failure')
    }
    const routeHead = await ports.loadRoutePlanHead(args.requestId)
    if (routeHead !== null && routeHead.currentRequestRevision !== head.currentRevision) {
      throw new Error('customer_request_route_plan_head_integrity_failure')
    }
    if (routeHead !== null && (!Number.isSafeInteger(routeHead.currentGeneration)
      || routeHead.currentGeneration < 1
      || (routeHead.currentGenerationRef === undefined)
        !== (routeHead.currentGenerationDigest === undefined)
      || (routeHead.currentDecisionCommandKey === undefined)
        !== (routeHead.currentDecisionCommandDigest === undefined))) {
      throw new Error('customer_request_route_plan_head_integrity_failure')
    }
    const hasCurrentGeneration = routeHead?.currentGenerationRef !== undefined
    if (routeHead?.currentDecisionCommandKey === undefined
      && (revision.aggregate.outcome === 'plan_ready') !== hasCurrentGeneration) {
      throw new Error('customer_request_route_plan_head_integrity_failure')
    }
    if (routeHead?.currentGenerationRef !== undefined) {
      const currentGeneration = await ports.loadExactRoutePlanGeneration(
        args.requestId,
        routeHead.currentGenerationRef,
      )
      if (currentGeneration.kind !== 'found'
        || currentGeneration.routeGeneration.generation !== routeHead.currentGeneration
        || currentGeneration.routeGeneration.generationDigest !== routeHead.currentGenerationDigest
        || !routePlanGenerationMatchesRequest(
          currentGeneration.routeGeneration,
          revision.aggregate.snapshot,
          routeHead.currentGeneration - 1,
        )) {
        throw new Error('customer_request_route_plan_head_integrity_failure')
      }
    }
    const currentDecision = routeHead?.currentDecisionCommandKey === undefined
      ? undefined
      : await ports.loadCurrentDecisionAggregate(routeHead, head.principalId)
    return {
      kind: 'current' as const,
      aggregate: currentDecision?.aggregate ?? revision.aggregate,
      routeGenerationNumber: routeHead?.currentGeneration ?? 0,
      ...(routeHead?.currentGenerationRef === undefined
        ? {}
        : { routeGenerationRef: routeHead.currentGenerationRef }),
      ...(currentDecision === undefined
        ? {}
        : { currentDecisionCommandKey: currentDecision.commandKey }),
    }
  }
  return { kind: 'not_found' as const }
}

function hasLegacyEmbeddedRoute(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('plan' in value)) return false
  const plan = value.plan
  if (typeof plan !== 'object' || plan === null || !('routes' in plan)) return false
  return Array.isArray(plan.routes)
}
