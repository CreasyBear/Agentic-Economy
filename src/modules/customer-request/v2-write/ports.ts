import type { CustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import type { CustomerRequestRoutePlanGeneration } from '@/modules/customer-request/route-plan-generation'

import type {
  CommitCommandRow,
  GenerationCommandRow,
  GenerationRefreshResult,
  GraphValidationStatus,
  MandateSupersedeInput,
  RequestHeadSnapshot,
  RevisionSnapshot,
  RoutePlanHeadPatch,
  RoutePlanHeadSnapshot,
} from './types'

export type CustomerRequestV2WritePorts = Readonly<{
  loadCommitCommand: (commandKey: string) => Promise<CommitCommandRow | null>

  verifyCommitCommandReplay: (
    command: CommitCommandRow,
  ) => Promise<Readonly<{ kind: 'current'; aggregate: CustomerRequestV2Aggregate }>>

  validateAggregateAgainstCurrentCapabilityGraph: (
    aggregate: CustomerRequestV2Aggregate,
    routeGeneration: CustomerRequestRoutePlanGeneration | undefined,
  ) => Promise<GraphValidationStatus>

  loadRequestHead: (requestId: string) => Promise<RequestHeadSnapshot | null>

  loadRoutePlanHead: (requestId: string) => Promise<RoutePlanHeadSnapshot | null>

  loadRevision: (
    requestId: string,
    requestRevision: number,
  ) => Promise<RevisionSnapshot | null>

  loadGenerationByNumber: (
    requestId: string,
    generation: number,
  ) => Promise<Readonly<{ generation: number }> | null>

  loadExactRoutePlanGeneration: (
    requestId: string,
    generationRef: string,
  ) => Promise<
    | Readonly<{ kind: 'not_found' }>
    | Readonly<{ kind: 'found'; routeGeneration: CustomerRequestRoutePlanGeneration }>
  >

  supersedeCurrentRouteMandate: (input: MandateSupersedeInput) => Promise<void>

  insertRevision: (input: Readonly<{
    requestId: string
    requestRevision: number
    aggregate: CustomerRequestV2Aggregate
  }>) => Promise<void>

  insertRoutePlanGeneration: (input: Readonly<{
    requestId: string
    generation: number
    generationRef: string
    generationDigest: string
    requestRevision: number
    routeGeneration: CustomerRequestRoutePlanGeneration
    recordedAt: number
  }>) => Promise<void>

  insertRoutePlanHead: (input: Readonly<{
    requestId: string
    currentGeneration: number
    currentRequestRevision: number
    currentGenerationRef: string
    currentGenerationDigest: string
    createdAt: number
    updatedAt: number
  }>) => Promise<void>

  patchRoutePlanHead: (
    headId: string,
    patch: RoutePlanHeadPatch,
  ) => Promise<void>

  insertRequestHead: (input: Readonly<{
    requestId: string
    principalId: string
    delegatedAgentId: string
    currentRevision: number
    currentAggregateDigest: string
    createdAt: number
    updatedAt: number
  }>) => Promise<void>

  patchRequestHead: (input: Readonly<{
    headId: string
    currentRevision: number
    currentAggregateDigest: string
    updatedAt: number
  }>) => Promise<void>

  insertCommitCommand: (input: Readonly<{
    commandKey: string
    commandDigest: string
    principalId: string
    requestId: string
    expectedRevision: number
    resultingRevision: number
    aggregateDigest: string
    expectedRouteGeneration: number
    resultingRouteGenerationRef?: string
    committedAt: number
  }>) => Promise<void>

  loadGenerationCommand: (commandKey: string) => Promise<GenerationCommandRow | null>

  readGenerationRefreshCommandResult: (
    command: GenerationCommandRow,
  ) => Promise<GenerationRefreshResult>

  insertGenerationCommand: (input: Readonly<{
    commandKey: string
    commandDigest: string
    principalId: string
    requestId: string
    expectedRequestRevision: number
    expectedGeneration: number
    expectedGenerationRef: string
    expectedDecisionCommandKey?: string
    resultKind: 'unchanged' | 'superseded' | 'needs_information' | 'unsupported' | 'retryable'
    retryReason?: GenerationCommandRow['retryReason']
    resultAggregate?: CustomerRequestV2Aggregate
    resultingGeneration?: number
    resultingGenerationRef?: string
    resultingGenerationDigest?: string
    committedAt: number
  }>) => Promise<void>
}>
