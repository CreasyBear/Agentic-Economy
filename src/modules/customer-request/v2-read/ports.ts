import type { CustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import type { CustomerRequestRoutePlanGeneration } from '@/modules/customer-request/route-plan-generation'

import type {
  GenerationCommandRow,
  GenerationRefreshResult,
  GetRoutePlanGenerationResult,
  RequestHeadSnapshot,
  RevisionSnapshot,
  RoutePlanHeadSnapshot,
} from './types'

export type CustomerRequestV2ReadPorts = Readonly<{
  loadRequestHead: (requestId: string) => Promise<RequestHeadSnapshot | null>

  loadRoutePlanHead: (requestId: string) => Promise<RoutePlanHeadSnapshot | null>

  loadRevision: (
    requestId: string,
    requestRevision: number,
  ) => Promise<RevisionSnapshot | null>

  loadExactRoutePlanGeneration: (
    requestId: string,
    generationRef: string,
  ) => Promise<GetRoutePlanGenerationResult>

  loadCurrentDecisionAggregate: (
    routeHead: RoutePlanHeadSnapshot,
    principalId: string,
  ) => Promise<Readonly<{ commandKey: string; aggregate: CustomerRequestV2Aggregate }>>

  loadGenerationCommand: (commandKey: string) => Promise<GenerationCommandRow | null>

  readGenerationRefreshCommandResult: (
    command: GenerationCommandRow,
  ) => Promise<GenerationRefreshResult>

  hasHistoricalRequest: (requestId: string) => Promise<boolean>
}>

export type { CustomerRequestRoutePlanGeneration }
