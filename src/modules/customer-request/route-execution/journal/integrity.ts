import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'
import { parseRouteTransportObservationJson } from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'

export type RouteRunIdentitySnapshot = Readonly<{
  runRef: string
  principalId: string
  requestId: string
  requestRevision: number
  mandateRef: string
  mandateDigest: string
  generationRef: string
  routePlanId: string
  routeDigest: string
  businesses?: readonly Readonly<{ businessRef: string; name: string }>[]
  totalSteps: number
  createdAt: number
}>

export type RouteAttemptIntegritySnapshot = Readonly<{
  runRef: string
  requestId: string
  mandateRef: string
  actionId: string
  position: number
  operationKeyDigest: string
  grant: Readonly<{ grantDigest: string }>
  inputDigest: string
  createdAt: number
  attemptDigest: string
  attemptRef: string
  inputJson: string
  outputJson?: string
  outputDigest?: string
  transportObservationJson?: string
  transportObservationDigest?: string
}>

export type RouteDispatchIntegritySnapshot = Readonly<{
  runRef: string
  attemptRef: string
  operationKeyDigest: string
  createdAt: number
  dispatchDigest: string
  dispatchRef: string
}>

export function routeRunIdentityDigest(run: RouteRunIdentitySnapshot): string {
  return canonicalDigest({
    runRef: run.runRef,
    principalId: run.principalId,
    requestId: run.requestId,
    requestRevision: run.requestRevision,
    mandateRef: run.mandateRef,
    mandateDigest: run.mandateDigest,
    generationRef: run.generationRef,
    routePlanId: run.routePlanId,
    routeDigest: run.routeDigest,
    ...(run.businesses === undefined ? {} : {
      businesses: run.businesses.map((business) => ({ ...business })),
    }),
    totalSteps: run.totalSteps,
    createdAt: run.createdAt,
  })
}

export function routeAttemptIntegrityValid(attempt: RouteAttemptIntegritySnapshot): boolean {
  const attemptDigest = canonicalDigest({
    runRef: attempt.runRef,
    requestId: attempt.requestId,
    mandateRef: attempt.mandateRef,
    actionId: attempt.actionId,
    position: attempt.position,
    operationKeyDigest: attempt.operationKeyDigest,
    grantDigest: attempt.grant.grantDigest,
    inputDigest: attempt.inputDigest,
    createdAt: attempt.createdAt,
  })
  const input = parseBoundedJson(attempt.inputJson)
  const output = attempt.outputJson === undefined ? undefined : parseBoundedJson(attempt.outputJson)
  const observation = attempt.transportObservationJson === undefined
    ? undefined
    : parseRouteTransportObservationJson(attempt.transportObservationJson)
  return attempt.attemptDigest === attemptDigest
    && attempt.attemptRef === `route-step-attempt:v1:${attemptDigest}`
    && input !== undefined
    && canonicalDigest(input) === attempt.inputDigest
    && (attempt.outputJson === undefined
      ? attempt.outputDigest === undefined
      : output !== undefined && canonicalDigest(output) === attempt.outputDigest)
    && (attempt.transportObservationJson === undefined
      ? attempt.transportObservationDigest === undefined
      : observation !== undefined && canonicalDigest(observation) === attempt.transportObservationDigest)
}

export function routeDispatchIntegrityValid(dispatch: RouteDispatchIntegritySnapshot): boolean {
  const digest = canonicalDigest({
    runRef: dispatch.runRef,
    attemptRef: dispatch.attemptRef,
    operationKeyDigest: dispatch.operationKeyDigest,
    availableAt: dispatch.createdAt,
    createdAt: dispatch.createdAt,
  })
  return dispatch.dispatchDigest === digest
    && dispatch.dispatchRef === `route-dispatch:v1:${digest}`
}

function parseBoundedJson(value: string): JsonValue | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return isBoundedJsonValue(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}
