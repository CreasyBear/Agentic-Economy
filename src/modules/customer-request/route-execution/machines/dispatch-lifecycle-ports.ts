import type {
  AttemptRecordSnapshot,
  CancelMandateLoadResult,
  CancelSupplyLoadResult,
  DispatchPublicationSnapshot,
  DispatchRecordSnapshot,
  MarkDispatchedResult,
  RecordNotReleasedResult,
  RunProjection,
  RunRecordSnapshot,
} from './types'

export type DispatchLifecyclePorts = Readonly<{
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
    now: number
  }>) => Promise<CancelSupplyLoadResult>

  loadPublicationAtRevision: (
    publicationRef: string,
    revision: number,
  ) => Promise<DispatchPublicationSnapshot | null>

  loadRunByRef: (runRef: string) => Promise<RunRecordSnapshot | null>

  loadRunProjection: (runRef: string) => Promise<RunProjection | null>

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
}>


export type DispatchLifecycleOpenPorts = Pick<
  DispatchLifecyclePorts,
  | 'now'
  | 'loadDispatchByRef'
  | 'loadAttemptByRef'
  | 'loadRunByRef'
  | 'loadActiveMandateForPrincipal'
  | 'loadEligibleExactCapabilitySupply'
  | 'loadPublicationAtRevision'
>
