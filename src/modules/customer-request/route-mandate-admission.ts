import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import { routeMandateDigest, type RouteMandate, type RouteMandateStep } from './route-mandate'

export const ROUTE_STEP_GRANT_FORMAT = 'ae.route-step-grant:v1' as const

type RouteStepMaximumSpend = Readonly<{ currency: string; amountMinor: number }>

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
  const currency = input.maximumTotalSpend.currency
  if (!validMoney(currency, input.maximumTotalSpend.amountMinor)
    || !validMoney(input.requestedReservation.currency, input.requestedReservation.amountMinor)
    || input.requestedReservation.currency !== currency
    || input.priorReservations.some((reservation) => (
      !validMoney(reservation.currency, reservation.amountMinor) || reservation.currency !== currency
    ))) {
    return { kind: 'refused', reason: 'spend_reservation_invalid' }
  }
  let cumulative = 0
  for (const reservation of input.priorReservations) {
    cumulative += reservation.amountMinor
    if (!Number.isSafeInteger(cumulative)) {
      return { kind: 'refused', reason: 'spend_reservation_invalid' }
    }
  }
  cumulative += input.requestedReservation.amountMinor
  if (!Number.isSafeInteger(cumulative)) {
    return { kind: 'refused', reason: 'spend_reservation_invalid' }
  }
  if (cumulative > input.maximumTotalSpend.amountMinor) {
    return { kind: 'refused', reason: 'spend_limit_exceeded' }
  }
  return {
    kind: 'reserved',
    cumulativeReservedSpend: { currency, amountMinor: cumulative },
  }
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
    || maximumSpend.currency !== mandate.route.maximumTotalSpend.currency) {
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

export function routeStepGrantDigest(grant: RouteStepGrant): string {
  const { grantRef: _grantRef, grantDigest: _grantDigest, ...material } = grant
  return canonicalDigest(material as StableHashValue)
}

function maximumStepSpend(step: RouteMandateStep): RouteStepMaximumSpend | null {
  if (step.price.kind === 'fixed') {
    return validMoney(step.price.currency, step.price.amountMinor)
      ? { currency: step.price.currency, amountMinor: step.price.amountMinor }
      : null
  }
  if (step.price.kind === 'range') {
    return validMoney(step.price.currency, step.price.maximumAmountMinor)
      && Number.isSafeInteger(step.price.minimumAmountMinor)
      && step.price.minimumAmountMinor >= 0
      && step.price.minimumAmountMinor <= step.price.maximumAmountMinor
      ? { currency: step.price.currency, amountMinor: step.price.maximumAmountMinor }
      : null
  }
  return null
}

function validMoney(currency: string, amountMinor: number): boolean {
  return currency.trim().length > 0 && Number.isSafeInteger(amountMinor) && amountMinor >= 0
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreeze(nested)
  }
  return value
}
