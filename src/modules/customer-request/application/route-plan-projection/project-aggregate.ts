import type { CustomerRoutePlan } from '@/modules/customer-request/agent-contract'
import {
  projectCustomerCriteria,
  projectRequestEvaluation,
  projectRouteConfirmed,
} from '@/modules/customer-request/customer-projection'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { CustomerRequestActionResult } from '../action-result'
import type { ProjectableCustomerRequestAggregate } from './projectable-aggregate'

export function projectStoredAggregate(
  aggregate: ProjectableCustomerRequestAggregate,
  routeGenerationRef?: string,
): CustomerRequestActionResult {
  return projectRequestEvaluation({
    snapshot: aggregate.snapshot,
    evaluation: aggregate.evaluation,
    outcome: aggregate.outcome,
    actionCount: aggregate.plan.actions.length,
    reportedOptionFailure: (aggregate.snapshot.routeExclusions?.length ?? 0) > 0,
    ...(routeGenerationRef === undefined ? {} : { routeGenerationRef }),
  })
}

export function projectConfirmedRoute(
  aggregate: ProjectableCustomerRequestAggregate,
  route: CustomerRoutePlan,
  mandate: Readonly<{
    mandateRef: string
    route: Readonly<{ generationRef: string }>
    request: Readonly<{ requestRevision: number }>
    issuedAt: number
    expiresAt: number
  }>,
): CustomerRequestActionResult {
  return projectRouteConfirmed({
    requestRef: aggregate.snapshot.requestId,
    revision: aggregate.snapshot.revision,
    criteria: projectCustomerCriteria(aggregate.evaluation.criteria),
    confirmation: {
      confirmationRef: `confirmation:${canonicalDigest({ authorityRef: mandate.mandateRef })}`,
      generationRef: mandate.route.generationRef,
      requestRevision: mandate.request.requestRevision,
      confirmedAt: mandate.issuedAt,
      validUntil: mandate.expiresAt,
      route,
    },
  })
}
