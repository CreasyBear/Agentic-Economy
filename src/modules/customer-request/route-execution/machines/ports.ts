import type { JsonValue } from '@/modules/capability-contract/public'
import type { RouteMandate } from '@/modules/customer-request/route-mandate'
import type { RouteStepGrant } from '@/modules/customer-request/route-mandate-admission'

import type {
  AttemptRecordSnapshot,
  DispatchRecordSnapshot,
  LeaseResult,
  MandateLoadResult,
  OutcomeResult,
  PriorRunCommand,
  RouteBusinessSnapshot,
  RunHeadSnapshot,
  RunProjection,
  RunRecordSnapshot,
  StartResult,
  StepAdmissionResult,
  ValidatedAttemptOutput,
} from './types'

export type JournalMutationPorts = Readonly<{
  now: () => number

  loadActiveMandateForPrincipal: (
    requestId: string,
    principalId: string,
    now: number,
  ) => Promise<MandateLoadResult>

  loadPriorRunCommand: (commandKey: string) => Promise<PriorRunCommand | null>

  loadRunProjection: (runRef: string) => Promise<RunProjection | null>

  loadRunHead: (requestId: string) => Promise<RunHeadSnapshot | null>

  loadRunByMandateRef: (mandateRef: string) => Promise<RunRecordSnapshot | null>

  loadRunByRunRef: (runRef: string) => Promise<RunRecordSnapshot | null>

  loadAttemptAtPosition: (
    runRef: string,
    position: number,
  ) => Promise<AttemptRecordSnapshot | null>

  loadAttemptByRef: (attemptRef: string) => Promise<AttemptRecordSnapshot | null>

  loadDispatchByAttemptRef: (
    attemptRef: string,
  ) => Promise<DispatchRecordSnapshot | null>

  snapshotRouteBusinesses: (
    steps: readonly Readonly<{ businessId: string }>[],
  ) => Promise<RouteBusinessSnapshot[] | undefined>

  materializeStepInput: (request: Readonly<{
    requestId: string
    generationRef: string
    routePlanId: string
    routeDigest: string
    position: number
    actionId: string
    contractRef: Readonly<{ capabilityId: string; version: number; contractDigest: string }>
    upstreamOutputs: ReadonlyMap<string, JsonValue>
  }>) => Promise<JsonValue | null>

  admitRouteStep: (input: Readonly<{
    requestId: string
    mandateRef: string
    expectedMandateDigest: string
    expectedGenerationRef: string
    expectedRoutePlanId: string
    expectedRouteDigest: string
    stepPosition: number
    expectedActionId: string
    expectedCapabilityId: string
    expectedCapabilityVersion: number
    expectedCapabilityContractDigest: string
    idempotencyKey: string
    principalId: string
  }>) => Promise<StepAdmissionResult>

  commitCommandReplay: (runRef: string) => Promise<StartResult>

  commitResumedRun: (input: Readonly<{
    requestId: string
    principalId: string
    mandateRef: string
    runRef: string
    runCreatedAt: number
    commandKey: string
    commandDigest: string
    now: number
    headMissing: boolean
  }>) => Promise<StartResult>

  cancelPriorUnreleasedRun: (input: Readonly<{
    runRef: string
    attemptRef: string
    now: number
  }>) => Promise<void>

  commitStartedRun: (input: Readonly<{
    requestId: string
    principalId: string
    mandate: RouteMandate
    runRef: string
    runDigest: string
    runMaterial: Readonly<{
      principalId: string
      requestId: string
      requestRevision: number
      mandateRef: string
      mandateDigest: string
      generationRef: string
      routePlanId: string
      routeDigest: string
      businesses: readonly RouteBusinessSnapshot[]
      state: 'queued'
      totalSteps: number
      completedSteps: number
      currentPosition: number
      createdAt: number
      updatedAt: number
    }>
    attemptRef: string
    attemptDigest: string
    actionId: string
    position: number
    grant: RouteStepGrant
    input: JsonValue
    inputDigest: string
    dispatchRef: string
    dispatchDigest: string
    commandKey: string
    commandDigest: string
    now: number
    head: RunHeadSnapshot | null
  }>) => Promise<StartResult>

  scanPendingDispatches: (now: number) => Promise<readonly DispatchRecordSnapshot[]>

  failExpiredUnreleasedAttempt: (input: Readonly<{
    dispatchRef: string
    attemptRef: string
    now: number
  }>) => Promise<void>

  grantDispatchLease: (input: Readonly<{
    dispatchRef: string
    attemptRef: string
    workerId: string
    leaseExpiresAt: number
    leaseDurationMs: number
    now: number
  }>) => Promise<LeaseResult>

  scheduleExpiredDispatchCleanup: (now: number) => Promise<void>

  validateAttemptOutput: (
    attemptRef: string,
    output: unknown,
  ) => Promise<ValidatedAttemptOutput | null>

  commitPartialOutcome: (input: Readonly<{
    attemptRef: string
    runRef: string
    now: number
    observationPatch: Readonly<{
      transportObservationJson?: string
      transportObservationDigest?: string
    }>
    validated: ValidatedAttemptOutput | null
  }>) => Promise<OutcomeResult>

  commitUnknownOutcome: (input: Readonly<{
    attemptRef: string
    runRef: string
    now: number
    observationPatch: Readonly<{
      transportObservationJson?: string
      transportObservationDigest?: string
    }>
  }>) => Promise<OutcomeResult>

  commitFailedOutcome: (input: Readonly<{
    attemptRef: string
    runRef: string
    now: number
    observationPatch: Readonly<{
      transportObservationJson?: string
      transportObservationDigest?: string
    }>
  }>) => Promise<OutcomeResult>

  commitSucceededOutcome: (input: Readonly<{
    attemptRef: string
    runRef: string
    now: number
    validated: ValidatedAttemptOutput
    observationPatch: Readonly<{
      transportObservationJson?: string
      transportObservationDigest?: string
    }>
  }>) => Promise<OutcomeResult>

  loadSucceededReplay: (input: Readonly<{
    attemptRef: string
    runRef: string
    runState: RunRecordSnapshot['state']
  }>) => Promise<OutcomeResult>
}>
