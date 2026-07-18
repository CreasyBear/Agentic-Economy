import type { CustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import type { CustomerRequestRoutePlanGeneration } from '@/modules/customer-request/route-plan-generation'
import type {
  GenerationCommandRow,
  GenerationRefreshResult,
  RequestHeadSnapshot,
  RoutePlanHeadSnapshot,
  RevisionSnapshot,
} from '@/modules/customer-request/v2-write'

export type GetCurrentAggregateArgs = Readonly<{
  requestId: string
}>

export type GetCurrentAggregateResult =
  | Readonly<{
    kind: 'current'
    aggregate: CustomerRequestV2Aggregate
    routeGenerationNumber: number
    routeGenerationRef?: string
    currentDecisionCommandKey?: string
  }>
  | Readonly<{
    kind: 'needs_attention'
    requestId: string
    reason: 'historical_request_resubmit_required'
    resumable: false
  }>
  | Readonly<{ kind: 'not_found' }>

export type GetRoutePlanGenerationArgs = Readonly<{
  requestId: string
  generationRef: string
}>

export type GetRoutePlanGenerationResult =
  | Readonly<{ kind: 'found'; routeGeneration: CustomerRequestRoutePlanGeneration }>
  | Readonly<{ kind: 'not_found' }>

export type GetRoutePlanGenerationRefreshReplayArgs = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  requestId: string
}>

export type GetRoutePlanGenerationRefreshReplayResult =
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'command_conflict' }>
  | GenerationRefreshResult

export type {
  GenerationCommandRow,
  GenerationRefreshResult,
  RequestHeadSnapshot,
  RoutePlanHeadSnapshot,
  RevisionSnapshot,
}
