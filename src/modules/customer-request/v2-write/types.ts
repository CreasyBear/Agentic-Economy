import type { CustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import type { CustomerRequestRoutePlanGeneration } from '@/modules/customer-request/route-plan-generation'

export type CommitAggregateArgs = Readonly<{
  commandKey: string
  commandDigest: string
  expectedRevision: number
  expectedRouteGeneration: number
  aggregate: CustomerRequestV2Aggregate
  routeGeneration?: CustomerRequestRoutePlanGeneration
}>

export type CommitAggregateResult =
  | Readonly<{ kind: 'stored'; requestId: string; revision: number }>
  | Readonly<{ kind: 'replayed'; requestId: string; revision: number }>
  | Readonly<{ kind: 'revision_conflict' }>
  | Readonly<{ kind: 'route_generation_conflict' }>
  | Readonly<{ kind: 'identity_conflict' }>
  | Readonly<{ kind: 'command_conflict' }>
  | Readonly<{ kind: 'aggregate_invalid' }>
  | Readonly<{ kind: 'context_stale' }>

export type GenerationRefreshRetryReason =
  | 'current_supply_unavailable'
  | 'interpreter_unavailable'
  | 'interpretation_unusable'
  | 'context_changed'

export type RefreshRoutePlanGenerationArgs = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  requestId: string
  expectedRequestRevision: number
  expectedGeneration: number
  expectedGenerationRef: string
  expectedDecisionCommandKey?: string
  candidateAggregate: CustomerRequestV2Aggregate
  candidateRouteGeneration?: CustomerRequestRoutePlanGeneration
}>

export type RecordRoutePlanGenerationRetryArgs = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  requestId: string
  expectedRequestRevision: number
  expectedGeneration: number
  expectedGenerationRef: string
  expectedDecisionCommandKey?: string
  reason: GenerationRefreshRetryReason
  recordedAt: number
}>

export type GenerationRefreshResult =
  | Readonly<{ kind: 'unchanged'; routeGeneration: CustomerRequestRoutePlanGeneration }>
  | Readonly<{ kind: 'superseded'; routeGeneration: CustomerRequestRoutePlanGeneration }>
  | Readonly<{ kind: 'needs_information'; aggregate: CustomerRequestV2Aggregate }>
  | Readonly<{ kind: 'unsupported'; aggregate: CustomerRequestV2Aggregate }>
  | Readonly<{ kind: 'retryable'; reason: GenerationRefreshRetryReason }>
  | Readonly<{ kind: 'request_conflict' }>
  | Readonly<{ kind: 'route_generation_conflict' }>
  | Readonly<{ kind: 'identity_conflict' }>
  | Readonly<{ kind: 'command_conflict' }>
  | Readonly<{ kind: 'candidate_invalid' }>
  | Readonly<{ kind: 'context_stale' }>

export type CommitCommandRow = Readonly<{
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
}>

export type GenerationCommandRow = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  requestId: string
  expectedRequestRevision: number
  expectedGeneration: number
  expectedGenerationRef: string
  expectedDecisionCommandKey?: string
  resultKind: 'unchanged' | 'superseded' | 'needs_information' | 'unsupported' | 'retryable'
  retryReason?: GenerationRefreshRetryReason
  resultAggregate?: CustomerRequestV2Aggregate
  resultingGeneration?: number
  resultingGenerationRef?: string
  resultingGenerationDigest?: string
  committedAt: number
}>

export type RequestHeadSnapshot = Readonly<{
  id: string
  requestId: string
  principalId: string
  delegatedAgentId: string
  currentRevision: number
  currentAggregateDigest: string
}>

export type RoutePlanHeadSnapshot = Readonly<{
  id: string
  requestId: string
  currentGeneration: number
  currentRequestRevision: number
  currentGenerationRef?: string
  currentGenerationDigest?: string
  currentDecisionCommandKey?: string
  currentDecisionCommandDigest?: string
}>

export type RevisionSnapshot = Readonly<{
  requestId: string
  requestRevision: number
  aggregate: CustomerRequestV2Aggregate
}>

export type GraphValidationStatus = 'current' | 'stale' | 'invalid'

export type MandateSupersedeInput = Readonly<{
  requestId: string
  nextRequestRevision: number
  nextGenerationRef?: string
  reason: 'request_revised' | 'route_generation_superseded'
}>

export type RoutePlanHeadPatch = Readonly<{
  currentGeneration?: number
  currentRequestRevision?: number
  currentGenerationRef?: string | null
  currentGenerationDigest?: string | null
  currentDecisionCommandKey?: string | null
  currentDecisionCommandDigest?: string | null
  updatedAt: number
}>
