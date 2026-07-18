import type { CapabilityContractRef } from '@/modules/capability-contract/public'

import type { CustomerRequestActionResult } from '../action-result'
import type {
  CompareResumeAggregate,
  CompareResumePorts,
} from '../compare-resume/types'
import type { CompileCommitInput } from '../interpret-compile'

export type ProvideFactsAggregate = CompareResumeAggregate & Readonly<{
  evaluation: CompareResumeAggregate['evaluation'] & Readonly<{
    registrySnapshotDigest: string
    nextRequirement?: Readonly<
      | { kind: 'intent_direction'; prompt: string }
      | {
          kind: 'contract_fact'
          requirementKey: string
          customerLabel?: string
          customerPrompt?: string
          targets: readonly Readonly<{
            contractRef: CapabilityContractRef
            selectionKey: string
            inputKey: string
            inputPointer: string
            schemaIdentity: string
          }>[]
        }
    >
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
  aggregateDigest?: string
}>

export type ProvideFactsStoredResult = Readonly<
  | {
      kind: 'current'
      aggregate: ProvideFactsAggregate
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

export type ProvideFactsPorts = Readonly<{
  loadCurrent: (requestId: string) => Promise<ProvideFactsStoredResult>
  recoverUnresolvedEgress: (
    aggregate: ProvideFactsAggregate,
  ) => Promise<CustomerRequestActionResult | undefined>
  replayCommittedCommand: (input: Readonly<{
    commandKey: string
    commandDigest: string
    requestId: string
    principalId: string
  }>) => Promise<CustomerRequestActionResult | undefined>
  loadRequestGraph: CompareResumePorts['loadRequestGraph']
  loadCurrentRouteGenerationNumber: (
    current: Extract<ProvideFactsStoredResult, { kind: 'current' }>,
  ) => Promise<number | undefined>
  compileCommit: (input: CompileCommitInput) => Promise<CustomerRequestActionResult>
}>

export type ProvideFactsInput = Readonly<{
  requestRef: string
  expectedRevision: number
  idempotencyKey: string
  requirementKey: string
  value: unknown
  commandKey: string
  commandDigest: string
  principalId: string
}>

export type ProvideFactsResult = CustomerRequestActionResult
