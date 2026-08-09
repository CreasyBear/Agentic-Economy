import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { deepFreeze } from '@/modules/common/deep-freeze'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { addExactAmounts, compareExactAmounts, exactAmountSchema } from '@/modules/money/public'
import type { ExactAmount } from '@/modules/money/public'

import { routeMandateDigest, type RouteMandate, type RouteMandateStep } from './route-mandate'

export const ROUTE_STEP_GRANT_FORMAT = 'ae.route-step-grant:v1' as const

type RouteStepMaximumSpend = ExactAmount

export type RouteStepAuthority = Readonly<{
  authorityDigest: string
  mandateRef: string
  mandateDigest: string
  principalId: string
  request: RouteMandate['request']
  route: Readonly<{
    generationRef: string
    generationDigest: string
    routePlanId: string
    routeDigest: string
  }>
  step: Readonly<{
    position: number
    operationRef: RouteMandateStep['operationRef']
    admittedOperation: RouteMandateStep['admittedOperation']
    actionId: string
    candidateRef: string
    businessId: string
    offeringId: string
    bindingId: string
    contractRef: RouteMandateStep['contractRef']
    offeringRegistrationHash: string
    bindingRegistrationHash: string
    publicationRef: string
    publicationRevision: number
    inputScopeDigest: string
    maximumSpend: RouteStepMaximumSpend
    dataScope: RouteMandateStep['dataScope']
    effects: RouteMandateStep['effects']
    evidence: RouteMandateStep['evidence']
    cancellation: RouteMandateStep['cancellation']
    recovery: RouteMandateStep['recovery']
  }>
  fallbackUse: Readonly<{ kind: 'primary_route' }>
  operationKeyDigest: string
  admittedAt: number
  expiresAt: number
}>

export type RouteStepGrant = Readonly<
  RouteStepAuthority & {
    format: typeof ROUTE_STEP_GRANT_FORMAT
    grantRef: string
    grantDigest: string
    admission: Readonly<{ reservationRef: string; reservationDigest: string }>
  }
>

export type DeriveRouteStepAuthorityResult = Readonly<
  | { kind: 'derived'; authority: RouteStepAuthority }
  | {
      kind: 'refused'
      reason:
        | 'mandate_integrity_invalid'
        | 'mandate_expired'
        | 'route_selection_mismatch'
        | 'step_selection_mismatch'
        | 'step_spend_unresolved'
    }
>

export type ReserveRouteStepSpendResult = Readonly<
  | { kind: 'reserved'; cumulativeReservedSpend: RouteStepMaximumSpend }
  | { kind: 'refused'; reason: 'spend_limit_exceeded' | 'spend_reservation_invalid' }
>

export function reserveRouteStepSpend(input: Readonly<{
  maximumTotalSpend: RouteStepMaximumSpend
  priorReservations: readonly RouteStepMaximumSpend[]
  requestedReservation: RouteStepMaximumSpend
}>): ReserveRouteStepSpendResult {
  if (!exactAmountSchema.safeParse(input.maximumTotalSpend).success
    || !exactAmountSchema.safeParse(input.requestedReservation).success
    || input.priorReservations.some((reservation) => !exactAmountSchema.safeParse(reservation).success)) {
    return { kind: 'refused', reason: 'spend_reservation_invalid' }
  }
  let cumulative = input.requestedReservation
  for (const reservation of input.priorReservations) {
    const next = addExactAmounts(cumulative, reservation)
    if (next === undefined) return { kind: 'refused', reason: 'spend_reservation_invalid' }
    cumulative = next
  }
  const comparison = compareExactAmounts(cumulative, input.maximumTotalSpend)
  if (comparison === undefined) return { kind: 'refused', reason: 'spend_reservation_invalid' }
  if (comparison > 0) return { kind: 'refused', reason: 'spend_limit_exceeded' }
  return { kind: 'reserved', cumulativeReservedSpend: cumulative }
}

/**
 * Attenuates an already-authenticated, current RouteMandate to one exact step.
 * The caller supplies selectors only; every material authority field is derived
 * from the mandate.
 */
export function deriveRouteStepAuthority(input: Readonly<{
  mandate: RouteMandate
  expectedMandateDigest: string
  expectedGenerationRef: string
  expectedRoutePlanId: string
  expectedRouteDigest: string
  stepPosition: number
  expectedActionId: string
  expectedCapabilityId: string
  expectedCapabilityVersion: number
  expectedCapabilityContractDigest: string
  operationKeyDigest: string
  now: number
}>): DeriveRouteStepAuthorityResult {
  const mandate = input.mandate
  if (!isCanonicalDigest(input.expectedMandateDigest)
    || !isCanonicalDigest(input.operationKeyDigest)
    || mandate.mandateDigest !== input.expectedMandateDigest
    || mandate.mandateRef !== `route-mandate:v1:${mandate.mandateDigest}`
    || routeMandateDigest(mandate) !== mandate.mandateDigest) {
    return { kind: 'refused', reason: 'mandate_integrity_invalid' }
  }
  if (!Number.isSafeInteger(input.now) || input.now < mandate.issuedAt || input.now >= mandate.expiresAt) {
    return { kind: 'refused', reason: 'mandate_expired' }
  }
  if (mandate.route.generationRef !== input.expectedGenerationRef
    || mandate.route.routePlanId !== input.expectedRoutePlanId
    || mandate.route.routeDigest !== input.expectedRouteDigest) {
    return { kind: 'refused', reason: 'route_selection_mismatch' }
  }
  const step = mandate.route.steps.find((candidate) => candidate.position === input.stepPosition)
  if (step === undefined
    || step.actionId !== input.expectedActionId
    || step.contractRef.capabilityId !== input.expectedCapabilityId
    || step.contractRef.version !== input.expectedCapabilityVersion
    || step.contractRef.contractDigest !== input.expectedCapabilityContractDigest) {
    return { kind: 'refused', reason: 'step_selection_mismatch' }
  }
  const maximumSpend = maximumStepSpend(step)
  if (maximumSpend === null
    || compareExactAmounts(maximumSpend, mandate.route.maximumTotalSpend) === undefined) {
    return { kind: 'refused', reason: 'step_spend_unresolved' }
  }
  const material: Omit<RouteStepAuthority, 'authorityDigest'> = {
    mandateRef: mandate.mandateRef,
    mandateDigest: mandate.mandateDigest,
    principalId: mandate.principal.principalId,
    request: { ...mandate.request },
    route: {
      generationRef: mandate.route.generationRef,
      generationDigest: mandate.route.generationDigest,
      routePlanId: mandate.route.routePlanId,
      routeDigest: mandate.route.routeDigest,
    },
    step: {
      position: step.position,
      operationRef: step.operationRef,
      admittedOperation: step.admittedOperation,
      actionId: step.actionId,
      candidateRef: step.candidateRef,
      businessId: step.businessId,
      offeringId: step.offeringId,
      bindingId: step.bindingId,
      contractRef: { ...step.contractRef },
      offeringRegistrationHash: step.offeringRegistrationHash,
      bindingRegistrationHash: step.bindingRegistrationHash,
      publicationRef: step.publicationRef,
      publicationRevision: step.publicationRevision,
      inputScopeDigest: step.inputScopeDigest,
      maximumSpend,
      dataScope: step.dataScope.map((scope) => ({
        ...scope,
        recipient: { ...scope.recipient },
        purposes: [...scope.purposes],
      })),
      effects: step.effects.map((effect) => ({ ...effect })),
      evidence: step.evidence.map((evidence) => ({ ...evidence })),
      cancellation: { ...step.cancellation, evidenceRefs: [...step.cancellation.evidenceRefs] },
      recovery: { ...step.recovery },
    },
    fallbackUse: { kind: 'primary_route' },
    operationKeyDigest: input.operationKeyDigest,
    admittedAt: input.now,
    expiresAt: mandate.expiresAt,
  }
  const authorityDigest = canonicalDigest(material as StableHashValue)
  return deepFreeze({
    kind: 'derived',
    authority: {
      ...material,
      authorityDigest,
    },
  })
}

export function bindRouteStepGrantToReservation(input: Readonly<{
  authority: RouteStepAuthority
  reservationRef: string
  reservationDigest: string
}>): RouteStepGrant {
  if (routeStepAuthorityDigest(input.authority) !== input.authority.authorityDigest
    || input.reservationRef !== `route-step-reservation:v1:${input.reservationDigest}`
    || !isCanonicalDigest(input.reservationDigest)) {
    throw new Error('route_step_grant_reservation_invalid')
  }
  const material: Omit<RouteStepGrant, 'grantRef' | 'grantDigest'> = {
    ...input.authority,
    format: ROUTE_STEP_GRANT_FORMAT,
    admission: {
      reservationRef: input.reservationRef,
      reservationDigest: input.reservationDigest,
    },
  }
  const grantDigest = canonicalDigest(material as StableHashValue)
  return deepFreeze({
    ...material,
    grantRef: `route-step-grant:v1:${grantDigest}`,
    grantDigest,
  })
}

export function routeStepAuthorityDigest(authority: RouteStepAuthority): string {
  const { authorityDigest: _authorityDigest, ...material } = authority
  return canonicalDigest(material as StableHashValue)
}

export function routeStepGrantDigest<T extends Readonly<{ grantRef: string; grantDigest: string }>>(grant: T): string {
  const { grantRef: _grantRef, grantDigest: _grantDigest, ...material } = grant
  return canonicalDigest(material as StableHashValue)
}

function maximumStepSpend(step: RouteMandateStep): RouteStepMaximumSpend | null {
  if (step.price.kind === 'fixed') {
    return exactAmountSchema.safeParse(step.price.amount).success ? step.price.amount : null
  }
  if (step.price.kind === 'range') {
    if (!exactAmountSchema.safeParse(step.price.minimum).success
      || !exactAmountSchema.safeParse(step.price.maximum).success) return null
    const comparison = compareExactAmounts(step.price.minimum, step.price.maximum)
    return comparison !== undefined && comparison <= 0 ? step.price.maximum : null
  }
  return null
}

