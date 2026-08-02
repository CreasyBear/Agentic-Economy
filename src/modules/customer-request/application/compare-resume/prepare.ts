import { canonicalDigest } from '@/modules/common/canonical-digest'
import { projectNeedsAttention } from '@/modules/customer-request/customer-projection'

import type { CustomerRequestActionResult } from '../action-result'
import {
  preparationResultView,
  runPreparationEgress,
} from '../preparation-egress'
import { hasTransientBindingUnavailable, routesAreCurrent } from './currency'
import { persistRetryableRouteRefresh, refreshCurrentRouteGeneration } from './refresh'
import type { CompareResumePorts, PrepareCompareInput } from './types'

export async function prepareCompare(
  input: PrepareCompareInput,
  ports: CompareResumePorts,
): Promise<CustomerRequestActionResult> {
  const current = await ports.loadCurrent(input.requestRef)
  if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== input.principalId) {
    return { kind: 'refused', reason: 'request_not_found' }
  }
  if (current.aggregate.snapshot.revision !== input.revision) return {
    kind: 'conflict', requestRef: input.requestRef, reason: 'revision_changed',
  }
  if (current.routeGenerationRef !== undefined) {
    const routeReadback = await ports.getCurrentRoutePlanGeneration({
      requestId: current.aggregate.snapshot.requestId,
    })
    if (routeReadback.kind !== 'found') return projectNeedsAttention({
      requestRef: input.requestRef,
      revision: input.revision,
      summary: 'AE could not verify the current options. Try this request again.',
    })
    const graph = await ports.loadRequestGraph(current.aggregate.snapshot.networkId)
    const now = Date.now()
    const caller = { principalId: input.principalId }
    const refreshArgs = {
      requestRef: input.requestRef,
      revision: input.revision,
      idempotencyKey: input.idempotencyKey,
    }
    if (!routesAreCurrent(routeReadback.routeGeneration, graph, now)) {
      if (graph.kind !== 'available') return await persistRetryableRouteRefresh(
        refreshArgs, caller, current, routeReadback.routeGeneration, 'current_supply_unavailable', ports,
      )
      if (hasTransientBindingUnavailable(routeReadback.routeGeneration, graph, now)) {
        return await persistRetryableRouteRefresh(
          refreshArgs, caller, current, routeReadback.routeGeneration, 'current_supply_unavailable', ports,
        )
      }
      return await refreshCurrentRouteGeneration(
        refreshArgs, caller, current, graph, routeReadback.routeGeneration, ports,
      )
    }
    return await ports.projectCurrentRoutePlans(current.aggregate)
  } else if (current.aggregate.plan.actions.length !== 1 || current.aggregate.plan.actions[0] === undefined) {
    return projectNeedsAttention({
      requestRef: input.requestRef,
      revision: input.revision,
      summary: 'AE could not verify the current options. Try this request again.',
    })
  }
  const action = current.aggregate.plan.actions[0]
  const result = await ports.prepareAction({
    commandKey: input.compareCommandKey,
    commandDigest: input.commandDigest,
    principalId: input.principalId,
    requestId: input.requestRef,
    expectedRevision: input.revision,
    actionId: action.actionId,
    now: Date.now(),
  })
  if ((result.kind === 'stored' || result.kind === 'replayed') && result.preparation.kind === 'ready_for_routing') {
    return await runPreparationEgress(
      current.aggregate,
      result.preparation,
      {
        principalId: input.principalId,
        commandKey: input.egressCommandKey,
        commandDigest: canonicalDigest({
          requestRef: input.requestRef,
          revision: input.revision,
          preparationRef: result.preparation.preparationRef,
          idempotencyKey: input.idempotencyKey,
        }),
      },
      ports,
    )
  }
  return preparationResultView(current.aggregate, result, input.requestRef, input.revision)
}
