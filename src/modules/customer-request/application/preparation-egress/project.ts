import {
  projectCustomerCriteria,
  projectNeedsAttention,
} from '@/modules/customer-request/customer-projection'
import type { PreparedActionV2 } from '@/modules/customer-request/prepared-action-v2'

import type { CustomerRequestActionResult } from '../action-result'
import type {
  EgressReleaseState,
  PreparationEgressAggregate,
  PreparationMutationResult,
  PreparedActionRecoveryReason,
  ReadyForRoutingPreparation,
  StoredPreparation,
} from './types'

export function customerPurposeLabel(value: string): string {
  const words = value.replace(/[_-]+/g, ' ').trim()
  return `${words.at(0)?.toUpperCase() ?? ''}${words.slice(1)}`
}

export function preparedActionFailureSummary(
  reason: PreparedActionRecoveryReason,
): string {
  switch (reason) {
    case 'options_pending':
    case 'disclosure_uncertain':
      return 'AE is still checking the businesses already contacted. It will not send the request again.'
    case 'disclosure_not_released':
      return 'AE did not send the request to the business. Check the business connection before trying again.'
    case 'provider_response_invalid':
      return 'A business returned an incomplete response. Refresh the request before choosing.'
    case 'provider_echo_mismatch':
      return 'A business response did not match the option requested. Refresh before choosing.'
    case 'provider_assertion_expired':
      return 'The available business options expired. Refresh the request before choosing.'
    case 'provider_evidence_invalid':
      return 'A business response was missing the evidence needed to compare it safely.'
    case 'commercial_terms_unavailable':
      return 'A business option was missing the price or terms needed for a safe choice.'
    case 'selection_required':
    case 'comparison_unavailable':
    case 'commercial_influence_blocks_selection':
      return 'AE received options but cannot choose between them from the customer’s stated priorities.'
    case 'prepared_action_too_large':
      return 'The business responses were too large to compare safely. Narrow the request and try again.'
    case 'capability_authority_changed':
    case 'capability_graph_changed':
      return 'The available business options changed. Refresh the request before choosing.'
    default: {
      const exhaustive: never = reason
      return exhaustive
    }
  }
}

export function projectPreparedAction(
  aggregate: PreparationEgressAggregate,
  preparation: ReadyForRoutingPreparation,
  action: PreparedActionV2,
): CustomerRequestActionResult {
  return {
    kind: 'request',
    requestRef: aggregate.snapshot.requestId,
    revision: aggregate.snapshot.revision,
    state: 'options_ready',
    summary: `${action.business.name} can provide ${action.offering.label}.`,
    nextAction: 'inspect_options',
    missingFields: [],
    criteria: [...projectCustomerCriteria(aggregate.evaluation.criteria)],
    preparationRef: preparation.preparationRef,
    options: [],
    preparedAction: {
      actionRef: action.preparedActionRef,
      businessName: action.business.name,
      offeringLabel: action.offering.label,
      summary: action.offering.summary,
      price: {
        minimum: action.price.minimum,
        maximum: action.price.maximum,
      },
      materialTerms: action.materialTerms.map(({ label, value }) => ({ label, value })),
      cancellation: { kind: action.cancellation.kind === 'adapter_managed' ? 'available' : 'unsupported' },
      validUntil: action.expiresAt,
      selection: {
        basis: action.comparison.kind,
        alternativeCount: action.alternatives.length,
        unavailableCount: action.fallbacks.length,
        commercialInfluence: action.comparison.kind === 'lowest_maximum_price'
          ? action.comparison.commercialInfluence
          : action.commercialRelationship.kind === 'none' ? 'none' : 'disclosed',
      },
      dataUse: {
        categories: preparation.disclosureReview.categories.map(({ label, classification }) => ({
          label, classification,
        })),
        purposes: [...preparation.disclosureReview.purposes],
      },
      effects: preparation.disclosureReview.effectRequirements.map(({ class: effectClass, reversibility }) => ({
        class: effectClass, reversibility,
      })),
      alternatives: action.alternatives.map((alternative) => ({
        businessName: alternative.business.name,
        price: {
          minimum: alternative.price.minimum,
          maximum: alternative.price.maximum,
        },
        validUntil: alternative.expiresAt,
      })),
    },
  }
}

export function projectEgressCustomerState(
  aggregate: PreparationEgressAggregate,
  preparation: ReadyForRoutingPreparation,
  states: readonly Readonly<{ state: EgressReleaseState }>[],
): CustomerRequestActionResult {
  const base = {
    kind: 'request' as const,
    requestRef: aggregate.snapshot.requestId,
    revision: aggregate.snapshot.revision,
    missingFields: [],
    criteria: projectCustomerCriteria(aggregate.evaluation.criteria),
    preparationRef: preparation.preparationRef,
    options: [],
  }
  if (states.some(({ state }) => state === 'uncertain')) {
    return {
      ...base,
      state: 'needs_attention',
      nextAction: 'wait',
      summary: 'AE cannot yet confirm whether every business received the request. It will not send it again while checking.',
    }
  }
  if (states.some(({ state }) => state === 'in_flight')) {
    return {
      ...base,
      state: 'preparing_options',
      nextAction: 'wait',
      summary: 'AE is waiting for businesses that are already processing the request.',
    }
  }
  if (states.length > 0 && states.every(({ state }) => state === 'not_released')) {
    return {
      ...base,
      state: 'needs_attention',
      nextAction: 'revise_request',
      summary: 'No business received the request. Review the available businesses before trying another route.',
    }
  }
  return {
    ...base,
    state: 'preparing_options',
    summary: aggregate.snapshot.intent,
    nextAction: 'wait',
  }
}

export function preparationResultView(
  aggregate: PreparationEgressAggregate,
  result: PreparationMutationResult,
  requestRef: string,
  revision: number,
): CustomerRequestActionResult {
  if (result.kind === 'conflict') {
    return {
      kind: 'conflict',
      requestRef,
      reason: result.reason === 'revision_changed' ? 'revision_changed' : 'idempotency_key_reused',
    }
  }
  if (result.kind === 'needs_attention') {
    return projectNeedsAttention({
      requestRef,
      revision,
      summary: result.reason === 'preparation_recipient_unsupported'
        ? 'AE cannot safely compare these options before you choose which business may receive your information.'
        : 'The registered options changed. Review this request again.',
    })
  }
  if (result.kind === 'refused') {
    if (result.reason === 'request_not_found') return { kind: 'refused', reason: 'request_not_found' }
    return projectNeedsAttention({
      requestRef,
      revision,
      summary: result.reason === 'authority_reference_invalid' || result.reason === 'authority_invalid'
        ? 'That permission no longer matches this request. Review the disclosure again.'
        : 'This request cannot be prepared from its current action.',
    })
  }
  return projectStoredPreparation(aggregate, result.preparation)
}

export function projectStoredPreparation(
  aggregate: PreparationEgressAggregate,
  preparation: StoredPreparation,
): CustomerRequestActionResult {
  const criteria = projectCustomerCriteria(aggregate.evaluation.criteria)
  const base = {
    kind: 'request' as const,
    requestRef: aggregate.snapshot.requestId,
    revision: aggregate.snapshot.revision,
    summary: aggregate.snapshot.intent,
    criteria,
    preparationRef: preparation.preparationRef,
    options: [],
  }
  if (preparation.kind === 'needs_information') {
    return {
      ...base,
      state: 'needs_information',
      nextAction: 'provide_information',
      missingFields: preparation.missing.map((item) => ({
        field: item.inputKey,
        label: item.label,
        explanation: 'This answer is needed before AE can prepare matching options.',
      })),
    }
  }
  const disclosureReview = {
    purpose: customerPurposeLabel(preparation.disclosureReview.purposes[0] ?? 'prepare_options'),
    maximumRecipients: preparation.disclosureReview.limits.maximumRecipients,
    categories: preparation.disclosureReview.categories.map(({ label, classification }) => ({
      label, classification,
    })),
  }
  if (preparation.kind === 'needs_authority') {
    return {
      ...base,
      state: 'needs_authorization',
      nextAction: 'review_disclosure',
      missingFields: [],
      disclosureReview,
    }
  }
  return {
    ...base,
    state: 'ready_to_compare',
    nextAction: 'prepare_options',
    missingFields: [],
    disclosureReview,
  }
}
