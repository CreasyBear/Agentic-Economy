import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  projectCustomerCriteria,
  projectNeedsAttention,
} from '@/modules/customer-request/customer-projection'

import type { CustomerRequestActionResult } from '../action-result'
import {
  preparedActionFailureSummary,
  projectEgressCustomerState,
  projectPreparedAction,
} from './project'
import type {
  PreparationEgressAggregate,
  PreparationEgressCommand,
  PreparationEgressPorts,
  ReadyForRoutingPreparation,
} from './types'

function preparedActionCommandKey(
  principalId: string,
  requestRef: string,
  callerKey: string,
): string {
  return `prepared-action:${canonicalDigest({ principalId, requestRef, callerKey })}`
}

export async function runPreparationEgress(
  aggregate: PreparationEgressAggregate,
  preparation: ReadyForRoutingPreparation,
  command: PreparationEgressCommand,
  ports: Pick<PreparationEgressPorts, 'runEgress' | 'preparationMaterialDigest' | 'preparePreparedAction'>,
): Promise<CustomerRequestActionResult> {
  const result = await ports.runEgress({
    ...command,
    preparationRef: preparation.preparationRef,
    now: Date.now(),
  })
  if (result.kind !== 'completed') {
    return projectNeedsAttention({
      requestRef: aggregate.snapshot.requestId,
      revision: aggregate.snapshot.revision,
      summary: result.kind === 'conflict'
        ? 'This preparation command was already used for a different request.'
        : 'The registered options or permission changed. Review this request again.',
    })
  }
  if (result.states === undefined) {
    return projectNeedsAttention({
      requestRef: aggregate.snapshot.requestId,
      revision: aggregate.snapshot.revision,
      summary: 'AE could not read the business response state. Review this request again.',
    })
  }
  if (result.states.some(({ state }) => state === 'uncertain' || state === 'in_flight')) {
    return projectEgressCustomerState(aggregate, preparation, result.states)
  }
  return resolvePreparedAction(aggregate, preparation, ports)
}

export async function resumePreparationEgress(
  aggregate: PreparationEgressAggregate,
  preparation: ReadyForRoutingPreparation,
  ports: Pick<PreparationEgressPorts, 'resumeEgress' | 'preparationMaterialDigest' | 'preparePreparedAction'>,
): Promise<CustomerRequestActionResult> {
  const resumed = await ports.resumeEgress({
    preparationRef: preparation.preparationRef,
    principalId: aggregate.snapshot.principalId,
  })
  if (resumed.kind !== 'completed' || resumed.states === undefined) {
    return projectNeedsAttention({
      requestRef: aggregate.snapshot.requestId,
      revision: aggregate.snapshot.revision,
      summary: 'The registered options or permission changed. Review this request again.',
    })
  }
  if (resumed.states.some(({ state }) => state === 'uncertain' || state === 'in_flight')) {
    return projectEgressCustomerState(aggregate, preparation, resumed.states)
  }
  return resolvePreparedAction(aggregate, preparation, ports)
}

export async function resolvePreparedAction(
  aggregate: PreparationEgressAggregate,
  preparation: ReadyForRoutingPreparation,
  ports: Pick<PreparationEgressPorts, 'preparationMaterialDigest' | 'preparePreparedAction'>,
): Promise<CustomerRequestActionResult> {
  const preparationMaterialDigest = await ports.preparationMaterialDigest({
    preparationRef: preparation.preparationRef,
    principalId: aggregate.snapshot.principalId,
  })
  const commandMaterial = {
    requestRef: aggregate.snapshot.requestId,
    requestRevision: aggregate.snapshot.revision,
    preparationRef: preparation.preparationRef,
    preparationDigest: preparation.preparationDigest,
    preparationMaterialDigest,
  }
  const result = await ports.preparePreparedAction({
    commandKey: preparedActionCommandKey(
      aggregate.snapshot.principalId,
      aggregate.snapshot.requestId,
      `${preparation.preparationRef}:${preparationMaterialDigest}`,
    ),
    commandDigest: canonicalDigest(commandMaterial),
    principalId: aggregate.snapshot.principalId,
    preparationRef: preparation.preparationRef,
    preparationMaterialDigest,
    now: Date.now(),
  })
  if (result.kind === 'prepared') {
    return projectPreparedAction(aggregate, preparation, result.preparedAction)
  }
  const base = {
    kind: 'request' as const,
    requestRef: aggregate.snapshot.requestId,
    revision: aggregate.snapshot.revision,
    missingFields: [],
    criteria: [...projectCustomerCriteria(aggregate.evaluation.criteria)],
    preparationRef: preparation.preparationRef,
    options: [],
  }
  if (result.kind === 'conflict') {
    return {
      ...base,
      state: 'needs_attention',
      nextAction: 'revise_request',
      summary: 'A business option changed after it was prepared. Review the request before choosing.',
    }
  }
  if (result.reason === 'options_pending' || result.reason === 'disclosure_uncertain') {
    return {
      ...base,
      state: 'preparing_options',
      nextAction: 'wait',
      summary: 'AE is still checking the businesses already contacted. It will not send the request again.',
    }
  }
  if (
    result.reason === 'selection_required'
    || result.reason === 'comparison_unavailable'
    || result.reason === 'commercial_influence_blocks_selection'
  ) {
    return {
      ...base,
      state: 'needs_attention',
      nextAction: 'revise_request',
      summary: 'AE received options but cannot choose between them from the customer’s stated priorities.',
    }
  }
  return {
    ...base,
    state: 'needs_attention',
    nextAction: 'revise_request',
    summary: preparedActionFailureSummary(result.reason),
  }
}

export async function recoverUnresolvedEgress(
  aggregate: PreparationEgressAggregate,
  ports: Pick<PreparationEgressPorts, 'resumeRequestEgress'>,
): Promise<CustomerRequestActionResult | undefined> {
  const recovered = await ports.resumeRequestEgress({
    requestId: aggregate.snapshot.requestId,
    principalId: aggregate.snapshot.principalId,
  })
  const base = {
    kind: 'request' as const,
    requestRef: aggregate.snapshot.requestId,
    revision: aggregate.snapshot.revision,
    state: 'needs_attention' as const,
    missingFields: [],
    criteria: projectCustomerCriteria(aggregate.evaluation.criteria),
    options: [],
  }
  if (recovered.kind === 'needs_attention') {
    return {
      ...base,
      nextAction: 'wait',
      summary: 'AE cannot safely continue while checking an earlier business contact.',
    }
  }
  const states = recovered.states ?? []
  if (states.some(({ state }) => state === 'uncertain' || state === 'in_flight')) {
    return {
      ...base,
      nextAction: 'wait',
      summary: 'AE is still checking whether a business received this request. It will not send it again while checking.',
    }
  }
  if (states.some(({ requestRevision }) => requestRevision !== aggregate.snapshot.revision)) {
    return {
      ...base,
      nextAction: 'revise_request',
      summary: 'AE recovered an earlier business contact. Review the current request before continuing.',
    }
  }
  return undefined
}
