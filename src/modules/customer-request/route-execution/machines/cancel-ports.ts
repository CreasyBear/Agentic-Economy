import type { CancelDisposition, CancelMode } from '../journal/decisions'

import type {
  AttemptRecordSnapshot,
  CancelMandateLoadResult,
  CancelResult,
  CancelSupplyLoadResult,
  CancellationAttemptSnapshot,
  CancellationObservation,
  DispatchRecordSnapshot,
  PriorCancelCommand,
  RunHeadSnapshot,
  RunProjection,
  RunRecordSnapshot,
} from './types'

export type CancelCommandCommitInput = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  requestId: string
  runRef: string
  mode: CancelMode
  result: CancelDisposition
  boundaryChangedAt: number
  now: number
}>

export type CancelMutationPorts = Readonly<{
  now: () => number

  loadPriorCancelCommand: (commandKey: string) => Promise<PriorCancelCommand | null>

  loadRunProjection: (runRef: string) => Promise<RunProjection | null>

  loadRunHead: (requestId: string) => Promise<RunHeadSnapshot | null>

  loadRunByRef: (runRef: string) => Promise<RunRecordSnapshot | null>

  loadAttemptAtPosition: (
    runRef: string,
    position: number,
  ) => Promise<AttemptRecordSnapshot | null>

  loadAttemptByRef: (attemptRef: string) => Promise<AttemptRecordSnapshot | null>

  loadDispatchByAttemptRef: (
    attemptRef: string,
  ) => Promise<DispatchRecordSnapshot | null>

  loadCancellationAttempt: (
    cancellationRef: string,
  ) => Promise<CancellationAttemptSnapshot | null>

  loadActiveMandateForCancellation: (
    requestId: string,
    principalId: string,
    now: number,
  ) => Promise<CancelMandateLoadResult>

  loadEligibleExactCapabilitySupply: (input: Readonly<{
    networkId: string
    businessId: string
    offeringId: string
    bindingId: string
    contractRef: Readonly<{
      capabilityId: string
      version: number
      contractDigest: string
    }>
    expectedOfferingRegistrationHash: string
    expectedBindingRegistrationHash: string
  }>) => Promise<CancelSupplyLoadResult>

  commitCancelCommandReplay: (
    runRef: string,
    priorResult: PriorCancelCommand['result'],
  ) => Promise<CancelResult>

  commitPreReleaseCancel: (input: CancelCommandCommitInput & Readonly<{
    attemptRef: string
  }>) => Promise<CancelResult>

  commitPendingAdapterCancellation: (input: CancelCommandCommitInput & Readonly<{
    attemptRef: string
    operationKeyDigest: string
    cancellationRef: string
  }>) => Promise<CancelResult>

  commitCancelDispositionOnly: (
    input: CancelCommandCommitInput,
  ) => Promise<CancelResult>

  commitCancellationObservation: (input: Readonly<{
    cancellationRef: string
    state: 'accepted' | 'rejected' | 'unknown'
    observation: CancellationObservation
    now: number
  }>) => Promise<void>

  resolveCancellationCommand: (
    runRef: string,
    result: 'cancelled' | 'rejected',
  ) => Promise<void>

  commitAcceptedCancellation: (input: Readonly<{
    runRef: string
    attemptRef: string
    position: number
    now: number
  }>) => Promise<void>

  queueNextStepAfterRejectedCancel: (
    runRef: string,
    position: number,
    now: number,
  ) => Promise<boolean>

  markUnknownAfterRejectedCancel: (
    runRef: string,
    attemptRef: string,
    now: number,
  ) => Promise<void>
}>

export type CancelOpenPorts = Readonly<{
  now: () => number
  loadCancellationAttempt: CancelMutationPorts['loadCancellationAttempt']
  loadAttemptByRef: CancelMutationPorts['loadAttemptByRef']
  loadActiveMandateForCancellation: CancelMutationPorts['loadActiveMandateForCancellation']
  loadEligibleExactCapabilitySupply: CancelMutationPorts['loadEligibleExactCapabilitySupply']
}>
