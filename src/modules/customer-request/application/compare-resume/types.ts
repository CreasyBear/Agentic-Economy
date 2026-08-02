import type {
  CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import type { CustomerRequestRoutePlanGeneration } from '@/modules/customer-request/route-plan-generation'
import type { CustomerRequestActionResult } from '../action-result'
import type { ProposeThenCompileInterpreter } from '../interpret-compile'
import type { RequestGraph, RequestGraphUnavailable } from '../interpret-compile/types'
import type {
  PreparationEgressPorts,
  PreparationMutationResult,
  StoredPreparation,
} from '../preparation-egress/types'
import type { ProjectableCustomerRequestAggregate } from '../route-plan-projection'
import type { StoredRouteRunProjection } from '../route-plan-projection/project-run'

/** Structural aggregate for compare/resume — accepts domain and Convex Infer aggregates. */
export type CompareResumeAggregate = ProjectableCustomerRequestAggregate & Readonly<{
  snapshot: ProjectableCustomerRequestAggregate['snapshot'] & Readonly<{
    principalId: string
    networkId: string
    delegatedAgentId: string
    facts: readonly unknown[]
    snapshotDigest: string
  }>
  evaluation: ProjectableCustomerRequestAggregate['evaluation'] & Readonly<{
    factsDigest: string
    evaluationDigest: string
  }>
  plan: Readonly<{
    actions: readonly Readonly<{ actionId: string }>[]
    planRevisionId: string
    planDigest: string
    createdAt: number
    registrySnapshotDigest: string
    compilerVersion: string
    interpreterId: string
    proposalDigest: string
  }>
  aggregateDigest?: string
}>

export type CompareResumeRouteGeneration = Readonly<{
  generationRef: string
  generation: number
  createdAt: number
  registrySnapshotDigest: string
  compiler: Readonly<{
    compilerVersion: string
    interpreterId: string
    proposalDigest: string
  }>
  decisionSnapshot?: Readonly<{
    requestSnapshotDigest: string
    factsDigest: string
    evaluationDigest: string
    planRevisionId: string
    planDigest: string
  }>
  routes: readonly Readonly<{
    expiresAt: number
    steps: readonly Readonly<{
      businessId: string
      offeringId: string
      bindingId: string
      contractRef: Readonly<{ capabilityId: string; version: number; contractDigest?: string }>
      offeringRegistrationHash: string
      bindingRegistrationHash: string
      publicationRef: string
      publicationRevision: number
      price: unknown
    }>[]
  }>[]
}>

export type StoredAggregateResult = Readonly<
  | {
      kind: 'current'
      aggregate: CompareResumeAggregate
      routeGenerationNumber: number
      routeGenerationRef?: string
      currentDecisionCommandKey?: string
    }
  | { kind: 'not_found' }
>

export type GenerationRefreshResult = Readonly<
  | { kind: 'unchanged'; routeGeneration: CompareResumeRouteGeneration }
  | { kind: 'superseded'; routeGeneration: CompareResumeRouteGeneration }
  | { kind: 'needs_information'; aggregate: CompareResumeAggregate }
  | { kind: 'unsupported'; aggregate: CompareResumeAggregate }
  | {
      kind: 'retryable'
      reason:
        | 'current_supply_unavailable'
        | 'interpreter_unavailable'
        | 'interpretation_unusable'
        | 'context_changed'
    }
  | {
      kind:
        | 'request_conflict'
        | 'route_generation_conflict'
        | 'identity_conflict'
        | 'command_conflict'
        | 'candidate_invalid'
        | 'context_stale'
    }
>

export type GenerationRefreshReplayResult =
  | GenerationRefreshResult
  | Readonly<{ kind: 'not_found' }>

export type RouteRefreshRetryReason = Extract<
  GenerationRefreshResult,
  { kind: 'retryable' }
>['reason']

export type PreparationResumeResult = Readonly<
  | { kind: 'current'; preparation: StoredPreparation }
  | { kind: 'not_found' | 'stale' }
>

export type CompareResumeMandate = Readonly<{
  mandateRef: string
  route: Readonly<{
    generationRef: string
    routePlanId: string
  }>
  request: Readonly<{ requestRevision: number }>
  issuedAt: number
  expiresAt: number
}>

export type CompareResumePorts = PreparationEgressPorts & Readonly<{
  loadCurrent: (requestId: string) => Promise<StoredAggregateResult>
  getSubmissionShell: (input: Readonly<{
    requestId: string
    principalId: string
  }>) => Promise<Readonly<
    | { kind: 'found'; shell: Readonly<{ requestId: string; networkId: string }> }
    | { kind: 'not_found' }
  >>
  getCurrentRouteRun: (input: Readonly<{
    requestId: string
  }>) => Promise<Readonly<
    | { kind: 'found'; run: StoredRouteRunProjection }
    | { kind: 'not_found' }
  >>
  getCurrentMandate: (input: Readonly<{
    requestId: string
    principalId: string
  }>) => Promise<Readonly<
    | { kind: 'active'; mandate: CompareResumeMandate }
    | { kind: 'not_found' | 'expired' | 'consumed' }
  >>
  getCurrentRoutePlanGeneration: (input: Readonly<{
    requestId: string
  }>) => Promise<Readonly<
    | { kind: 'found'; routeGeneration: CompareResumeRouteGeneration }
    | { kind: 'not_found' }
  >>
  projectCurrentRoutePlans: (
    aggregate: CompareResumeAggregate,
  ) => Promise<CustomerRequestActionResult>
  resumePreparation: (input: Readonly<{
    requestId: string
    requestRevision: number
    actionId: string
    principalId: string
  }>) => Promise<PreparationResumeResult>
  egressStatus: (input: Readonly<{
    preparationRef: string
    principalId: string
  }>) => Promise<Readonly<{
    operationCount: number
    states: ReadonlyArray<Readonly<{
      operationRef: string
      state: 'allocated' | 'dispatching' | 'released' | 'not_released' | 'uncertain'
    }>>
  }>>
  prepareAction: (input: Readonly<{
    commandKey: string
    commandDigest: string
    principalId: string
    requestId: string
    expectedRevision: number
    actionId: string
    now: number
  }>) => Promise<PreparationMutationResult>
  loadRequestGraph: (
    networkId: string,
  ) => Promise<RequestGraph | RequestGraphUnavailable>
  getRoutePlanGenerationRefreshReplay: (input: Readonly<{
    commandKey: string
    commandDigest: string
    principalId: string
    requestId: string
  }>) => Promise<GenerationRefreshReplayResult>
  refreshRoutePlanGeneration: (input: Readonly<{
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
  }>) => Promise<GenerationRefreshResult>
  recordRoutePlanGenerationRetry: (input: Readonly<{
    commandKey: string
    commandDigest: string
    principalId: string
    requestId: string
    expectedRequestRevision: number
    expectedGeneration: number
    expectedGenerationRef: string
    expectedDecisionCommandKey?: string
    reason: RouteRefreshRetryReason
    recordedAt: number
  }>) => Promise<GenerationRefreshResult>
  createInterpreter: () => ProposeThenCompileInterpreter | undefined
}>

export type PrepareCompareInput = Readonly<{
  requestRef: string
  revision: number
  idempotencyKey: string
  principalId: string
  compareCommandKey: string
  egressCommandKey: string
  /** Digest of the compare command (requestRef/revision/idempotencyKey). */
  commandDigest: string
}>

export type ResumeCustomerRequestInput = Readonly<{
  requestRef: string
  principalId: string
}>
