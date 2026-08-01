import { projectNeedsAttention, projectNoCurrentBusiness } from '@/modules/customer-request/customer-projection'
import { customerRouteRef } from '@/modules/customer-request/route-plan-customer-projection'

import type { CustomerRequestActionResult } from '../action-result'
import { durableSubmissionShellView } from '../interpret-compile'
import {
  projectStoredPreparation,
  recoverUnresolvedEgress,
  resumePreparationEgress,
} from '../preparation-egress'
import {
  projectConfirmedRoute,
  projectStoredAggregate,
  projectStoredRouteRun,
  storedGenerationRepresentsAggregate,
} from '../route-plan-projection'
import type { CompareResumePorts, ResumeCustomerRequestInput } from './types'

export async function resumeCustomerRequest(
  input: ResumeCustomerRequestInput,
  ports: CompareResumePorts,
): Promise<CustomerRequestActionResult> {
  const current = await ports.loadCurrent(input.requestRef)
  if (current.kind === 'needs_attention') return projectNeedsAttention({
    requestRef: input.requestRef, revision: 0,
    summary: 'This earlier request used a retired contract format. Start a new request to continue.',
  })
  if (current.kind !== 'current') {
    const shell = await ports.getSubmissionShell({
      requestId: input.requestRef,
      principalId: input.principalId,
    })
    if (shell.kind !== 'found') return { kind: 'refused', reason: 'request_not_found' }
    // A shell means the Request was saved but never compiled. Offering "try again" is only
    // truthful if AE has something to plan over now, so the answer is re-derived from current
    // supply rather than repeating whatever failed at submission time.
    const graph = await ports.loadRequestGraph(shell.shell.networkId)
    return graph.kind === 'unavailable' && graph.reason === 'no_routeable_supply'
      ? projectNoCurrentBusiness({ requestRef: shell.shell.requestId, revision: 0 })
      : durableSubmissionShellView(shell.shell.requestId)
  }
  if (current.aggregate.snapshot.principalId !== input.principalId) {
    return { kind: 'refused', reason: 'request_not_found' }
  }
  const currentRun = await ports.getCurrentRouteRun({ requestId: input.requestRef })
  if (currentRun.kind === 'found') {
    return projectStoredRouteRun(current.aggregate, currentRun.run)
  }
  const currentMandate = await ports.getCurrentMandate({
    requestId: input.requestRef, principalId: input.principalId,
  })
  if (currentMandate.kind === 'active') {
    const preview = await ports.projectCurrentRoutePlans(current.aggregate)
    if (preview.kind === 'request' && preview.decision !== undefined) {
      const route = preview.decision.routes.find(({ routeRef }) => (
        routeRef === customerRouteRef(
          currentMandate.mandate.route.generationRef,
          currentMandate.mandate.route.routePlanId,
        )
      ))
      if (route !== undefined) {
        return projectConfirmedRoute(
          current.aggregate, route, currentMandate.mandate,
        )
      }
    }
  }
  if (current.aggregate.outcome !== 'plan_ready') {
    return projectStoredAggregate(current.aggregate, undefined)
  }
  if (current.routeGenerationRef !== undefined) {
    const routeReadback = await ports.getCurrentRoutePlanGeneration({
      requestId: current.aggregate.snapshot.requestId,
    })
    if (routeReadback.kind !== 'found') return projectNeedsAttention({
      requestRef: input.requestRef, revision: current.aggregate.snapshot.revision,
      summary: 'AE could not verify the current options. Try this request again.',
    })
    const generationRepresentsStoredPlan = storedGenerationRepresentsAggregate(
      routeReadback.routeGeneration, current.aggregate,
    )
    if (!generationRepresentsStoredPlan) {
      return await ports.projectCurrentRoutePlans(current.aggregate)
    }
  }
  const recoveryBlock = await recoverUnresolvedEgress(current.aggregate, ports)
  if (recoveryBlock !== undefined) return recoveryBlock
  if (current.aggregate.plan.actions.length === 1) {
    const action = current.aggregate.plan.actions[0]
    if (action !== undefined) {
      const preparation = await ports.resumePreparation({
        requestId: input.requestRef,
        requestRevision: current.aggregate.snapshot.revision,
        actionId: action.actionId,
        principalId: input.principalId,
      })
      if (preparation.kind === 'current') {
        if (preparation.preparation.kind === 'ready_for_routing') {
          const egress = await ports.egressStatus({
            preparationRef: preparation.preparation.preparationRef,
            principalId: input.principalId,
          })
          if (egress.operationCount > 0) {
            return await resumePreparationEgress(
              current.aggregate,
              preparation.preparation,
              ports,
            )
          }
        }
        return projectStoredPreparation(current.aggregate, preparation.preparation)
      }
      if (preparation.kind === 'stale') return projectNeedsAttention({
        requestRef: input.requestRef,
        revision: current.aggregate.snapshot.revision,
        summary: 'The registered options changed. Review this request again.',
      })
    }
  }
  return current.routeGenerationRef === undefined
    ? projectStoredAggregate(current.aggregate, undefined)
    : await ports.projectCurrentRoutePlans(current.aggregate)
}
