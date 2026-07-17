import type { DurableActionPreparation } from '@/modules/customer-request/action-preparation'
import type { PreparedActionV2 } from '@/modules/customer-request/prepared-action-v2'
import type { JsonValue } from '@/modules/capability-contract/public'
import type { CustomerCriterion } from '@/modules/customer-request/customer-projection'

/** Structural aggregate for preparation egress — accepts domain and Convex Infer aggregates. */
export type PreparationEgressAggregate = Readonly<{
  snapshot: Readonly<{
    requestId: string
    revision: number
    intent: string
    principalId: string
  }>
  evaluation: Readonly<{
    criteria: readonly Readonly<{
      inputKey?: string
      label: string
      value: JsonValue
      basis: 'customer_provided' | 'extracted_from_request'
      impact?: CustomerCriterion['impact']
    }>[]
  }>
}>

export type StoredPreparation = DurableActionPreparation

export type ReadyForRoutingPreparation = Extract<StoredPreparation, { kind: 'ready_for_routing' }>

export type PreparationMutationResult = Readonly<
  | { kind: 'stored' | 'replayed'; preparation: StoredPreparation }
  | { kind: 'conflict'; reason: 'revision_changed' | 'idempotency_key_reused' }
  | {
      kind: 'needs_attention'
      reason:
        | 'capability_graph_changed'
        | 'historical_request_resubmit_required'
        | 'preparation_recipient_unsupported'
    }
  | {
      kind: 'refused'
      reason:
        | 'request_not_found'
        | 'action_not_found'
        | 'request_not_ready'
        | 'authority_reference_invalid'
        | 'authority_invalid'
    }
>

export type PreparedActionRecoveryReason =
  | 'options_pending'
  | 'disclosure_not_released'
  | 'disclosure_uncertain'
  | 'provider_response_invalid'
  | 'provider_echo_mismatch'
  | 'provider_assertion_expired'
  | 'provider_evidence_invalid'
  | 'commercial_terms_unavailable'
  | 'selection_required'
  | 'comparison_unavailable'
  | 'commercial_influence_blocks_selection'
  | 'prepared_action_too_large'
  | 'capability_authority_changed'
  | 'capability_graph_changed'

export type PreparedActionMutationResult = Readonly<
  | { kind: 'prepared'; preparedAction: PreparedActionV2 }
  | { kind: 'not_prepared'; reason: PreparedActionRecoveryReason; recoveryRef: string }
  | { kind: 'conflict'; reason: 'idempotency_key_reused' | 'prepared_action_material_changed' }
>

export type EgressReleaseState = 'released' | 'not_released' | 'uncertain' | 'in_flight'

export type EgressRunResult = Readonly<{
  kind: 'completed' | 'conflict' | 'needs_attention'
  states?: readonly Readonly<{
    operationRef: string
    state: EgressReleaseState
  }>[]
}>

export type EgressResumeResult = Readonly<{
  kind: 'completed' | 'needs_attention'
  states?: readonly Readonly<{
    operationRef: string
    state: EgressReleaseState
  }>[]
}>

export type ResumeRequestEgressResult = Readonly<{
  kind: 'completed' | 'needs_attention'
  states?: readonly Readonly<{
    operationRef: string
    requestRevision: number
    state: EgressReleaseState
  }>[]
  operations?: readonly Readonly<{ operationRef: string; requestRevision: number }>[]
}>

export type PreparationEgressCommand = Readonly<{
  principalId: string
  commandKey: string
  commandDigest: string
}>

export type PreparationEgressPorts = Readonly<{
  runEgress: (input: Readonly<{
    principalId: string
    commandKey: string
    commandDigest: string
    preparationRef: string
    now: number
  }>) => Promise<EgressRunResult>
  resumeEgress: (input: Readonly<{
    preparationRef: string
    principalId: string
  }>) => Promise<EgressResumeResult>
  resumeRequestEgress: (input: Readonly<{
    requestId: string
    principalId: string
  }>) => Promise<ResumeRequestEgressResult>
  preparationMaterialDigest: (input: Readonly<{
    preparationRef: string
    principalId: string
  }>) => Promise<string>
  preparePreparedAction: (input: Readonly<{
    commandKey: string
    commandDigest: string
    principalId: string
    preparationRef: string
    preparationMaterialDigest: string
    now: number
  }>) => Promise<PreparedActionMutationResult>
}>
