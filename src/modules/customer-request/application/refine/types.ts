import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import type { CustomerReportedRouteExclusion } from '@/modules/customer-request/compiler'

import type { CustomerRequestActionResult } from '../action-result'
import type {
  CompareResumeAggregate,
  CompareResumePorts,
} from '../compare-resume/types'
import type {
  CompileCommitInput,
  InterpretCompileCommitInput,
} from '../interpret-compile'

export type RefineAggregate = CompareResumeAggregate & Readonly<{
  snapshot: CompareResumeAggregate['snapshot'] & Readonly<{
    routeExclusions?: readonly CustomerReportedRouteExclusion[]
  }>
  plan: Readonly<{
    actions: readonly Readonly<{
      actionId: string
      selectionKey: string
      semanticDigest: string
      contractRef: CapabilityContractRef
    }>[]
    planRevisionId: string
    planDigest: string
    createdAt: number
    registrySnapshotDigest: string
    compilerVersion: string
    interpreterId: string
    proposalDigest: string
  }>
  aggregateDigest: string
}>

export type RefineStoredResult = Readonly<
  | {
      kind: 'current'
      aggregate: RefineAggregate
      routeGenerationNumber: number
      routeGenerationRef?: string
      currentDecisionCommandKey?: string
    }
  | {
      kind: 'needs_attention'
      requestId: string
      reason: 'historical_request_resubmit_required'
      resumable: false
    }
  | { kind: 'not_found' }
>

export type RefineRouteGeneration = Readonly<{
  generationRef: string
  generation: number
  routes: readonly Readonly<{
    routePlanId: string
    steps: readonly Readonly<{
      businessId: string
      offeringId: string
      bindingId: string
      contractRef: CapabilityContractRef
      offeringRegistrationHash: string
      bindingRegistrationHash: string
    }>[]
  }>[]
}>

export type RecordNoopCommandResult = Readonly<
  | { kind: 'stored' | 'replayed' }
  | {
      kind:
        | 'command_conflict'
        | 'revision_conflict'
        | 'identity_conflict'
        | 'route_generation_conflict'
    }
>

export type RefineCustomerRequestPorts = Readonly<{
  loadCurrent: (requestId: string) => Promise<RefineStoredResult>
  recoverUnresolvedEgress: (
    aggregate: RefineAggregate,
  ) => Promise<CustomerRequestActionResult | undefined>
  resumeRequest: (input: Readonly<{
    requestRef: string
    principalId: string
  }>) => Promise<CustomerRequestActionResult>
  replayCommittedCommand: (input: Readonly<{
    commandKey: string
    commandDigest: string
    requestId: string
    principalId: string
    noEffectReplay?: () => Promise<CustomerRequestActionResult>
  }>) => Promise<CustomerRequestActionResult | undefined>
  recordNoopCommand: (input: Readonly<{
    commandKey: string
    commandDigest: string
    principalId: string
    requestId: string
    expectedRevision: number
    expectedRouteGeneration: number
    aggregateDigest: string
    routeGenerationRef?: string
    committedAt: number
  }>) => Promise<RecordNoopCommandResult>
  loadCurrentRouteGenerationNumber: (
    current: Extract<RefineStoredResult, { kind: 'current' }>,
  ) => Promise<number | undefined>
  loadCurrentRouteGeneration: (
    current: Extract<RefineStoredResult, { kind: 'current' }>,
  ) => Promise<RefineRouteGeneration | undefined>
  loadRequestGraph: CompareResumePorts['loadRequestGraph']
  compileCommit: (input: CompileCommitInput) => Promise<CustomerRequestActionResult>
  interpretCompileCommit: (
    input: InterpretCompileCommitInput,
  ) => Promise<CustomerRequestActionResult>
}>

export type RefineCustomerRequestInput = Readonly<{
  requestRef: string
  expectedRevision: number
  idempotencyKey: string
  message: string
  mode?: 'append' | 'replace'
  replacesPriorStatement?: string
  reportedRouteRef?: string
  commandKey: string
  commandDigest: string
  principalId: string
}>

export type RefineCustomerRequestResult = CustomerRequestActionResult
