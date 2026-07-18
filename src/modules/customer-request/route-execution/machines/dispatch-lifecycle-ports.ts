import type {
  AttemptRecordSnapshot,
  CancelMandateLoadResult,
  CancelSupplyLoadResult,
  DispatchPublicationSnapshot,
  DispatchRecordSnapshot,
  MarkAcceptedResult,
  MarkDispatchedResult,
  RecordNotReleasedResult,
  RecoverExpiredDispatchResult,
  RunProjection,
  RunRecordSnapshot,
} from './types'

export type DispatchLifecycleOpenPorts = Readonly<{
  now: () => number

  loadDispatchByRef: (dispatchRef: string) => Promise<DispatchRecordSnapshot | null>

  loadAttemptByRef: (attemptRef: string) => Promise<AttemptRecordSnapshot | null>

  loadActiveMandateForPrincipal: (
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

  loadPublicationAtRevision: (
    publicationRef: string,
    revision: number,
  ) => Promise<DispatchPublicationSnapshot | null>
}>

export type DispatchLifecyclePorts = Readonly<{
  now: () => number

  loadDispatchByRef: DispatchLifecycleOpenPorts['loadDispatchByRef']

  loadAttemptByRef: DispatchLifecycleOpenPorts['loadAttemptByRef']

  loadActiveMandateForPrincipal: DispatchLifecycleOpenPorts['loadActiveMandateForPrincipal']

  loadEligibleExactCapabilitySupply: DispatchLifecycleOpenPorts['loadEligibleExactCapabilitySupply']

  loadPublicationAtRevision: DispatchLifecycleOpenPorts['loadPublicationAtRevision']

  loadRunByRef: (runRef: string) => Promise<RunRecordSnapshot | null>

  loadRunProjection: (runRef: string) => Promise<RunProjection | null>

  commitDispatchRequeued: (input: Readonly<{
    dispatchRef: string
    attemptRef: string
    now: number
  }>) => Promise<Extract<RecoverExpiredDispatchResult, { kind: 'requeued' }>>

  commitDispatchOutcomeUnknown: (input: Readonly<{
    dispatchRef: string
    attemptRef: string
    runRef: string
    now: number
  }>) => Promise<Extract<RecoverExpiredDispatchResult, { kind: 'outcome_unknown' }>>

  commitMarkDispatched: (input: Readonly<{
    dispatchRef: string
    attemptRef: string
    runRef: string
    now: number
  }>) => Promise<Extract<MarkDispatchedResult, { kind: 'recorded' }>>

  commitNotReleasedFailed: (input: Readonly<{
    dispatchRef: string
    attemptRef: string
    runRef: string
    observationJson: string
    observationDigest: string
    resultJson: string
    resultDigest: string
    now: number
  }>) => Promise<Extract<RecordNotReleasedResult, { kind: 'failed' }>>

  commitMarkAccepted: (input: Readonly<{
    attemptRef: string
    now: number
  }>) => Promise<Extract<MarkAcceptedResult, { kind: 'recorded' }>>
}>
