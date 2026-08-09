import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { deepFreeze } from '@/modules/common/deep-freeze'
import { sameStringList } from '@/modules/common/same-string-list'
import { compareExactAmounts, exactAmountSchema } from '@/modules/money/public'
import type { ExactAmount } from '@/modules/money/public'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { CustomerRequestRoutePlan } from './compiler'
import {
  routePlanGenerationIsInternallyConsistent,
  routePlanGenerationOwnsCancellationPosture,
  type CustomerRequestRoutePlanGeneration,
} from './route-plan-generation'

export const ROUTE_MANDATE_FORMAT = 'ae.route-mandate:v1' as const

export type RouteMandatePrincipal = Readonly<{
  principalId: string
  authenticationEvidenceRef: string
}>

export type RouteMandateAuthorization = Readonly<
  | {
      kind: 'explicit'
      authorizationEvidenceRef: string
      authorizationEvidenceDigest: string
      authorityScopeDigest: string
    }
  | {
      kind: 'standing_low_risk'
      standingPolicyRef: string
      standingPolicyDigest: string
      authorityUseRef: string
      authorityScopeDigest: string
    }
>

type RouteStep = CustomerRequestRoutePlan['steps'][number]
type RouteMandateRecipient = Readonly<
  | { kind: 'registered_binding'; businessId: string; bindingId: string }
  | { kind: 'named_recipient'; recipientId: string }
>
type RouteMandateDataScope = Readonly<{
  effectId: string
  inputPointer: string
  classification: RouteStep['dataUse'][number]['classification']
  phase: RouteStep['dataUse'][number]['phase']
  recipient: RouteMandateRecipient
  purposes: readonly string[]
}>

export type RouteMandateStep = Readonly<{
  position: number
  operationRef: RouteStep['operationRef']
  admittedOperation: RouteStep['admittedOperation']
  actionId: string
  candidateRef: string
  businessId: string
  offeringId: string
  bindingId: string
  contractRef: RouteStep['contractRef']
  offeringRegistrationHash: string
  bindingRegistrationHash: string
  publicationRef: string
  publicationRevision: number
  inputScopeDigest: string
  price: RouteStep['price']
  dataScope: readonly RouteMandateDataScope[]
  effects: RouteStep['effects']
  evidence: RouteStep['evidence']
  cancellation: RouteStep['cancellation']
  recovery: RouteStep['recovery']
}>

export type RouteMandate = Readonly<{
  format: typeof ROUTE_MANDATE_FORMAT
  mandateRef: string
  mandateDigest: string
  principal: RouteMandatePrincipal
  authorization: RouteMandateAuthorization
  request: Readonly<{ requestId: string; requestRevision: number }>
  route: Readonly<{
    generationRef: string
    generation: number
    generationDigest: string
    registrySnapshotDigest: string
    routePlanId: string
    routeDigest: string
    stepGraphDigest: string
    steps: readonly RouteMandateStep[]
    maximumTotalSpend: ExactAmount
    dataScopeDigest: string
    effectScopeDigest: string
    evidenceScopeDigest: string
    routeExpiresAt: number
    fallback: Readonly<{
      kind: 'new_mandate_required'
      alternatives: readonly Readonly<{ routePlanId: string; routeDigest: string }>[]
    }>
  }>
  issuedAt: number
  expiresAt: number
}>

export type CompileRouteMandateResult = Readonly<
  | { kind: 'compiled'; mandate: RouteMandate }
  | {
      kind: 'refused'
      reason:
        | 'mandate_material_invalid'
        | 'route_generation_invalid'
        | 'selected_route_not_found'
        | 'route_cost_unresolved'
        | 'spend_scope_mismatch'
        | 'authority_scope_mismatch'
        | 'route_expired'
        | 'expiry_scope_invalid'
    }
>

export type VerifyRouteMandateResult = Readonly<
  | { kind: 'verified'; mandate: RouteMandate }
  | {
      kind: 'refused'
      reason:
        | 'mandate_integrity_invalid'
        | 'route_generation_invalid'
        | 'route_generation_mismatch'
        | 'selected_route_mismatch'
        | 'principal_mismatch'
        | 'authority_context_mismatch'
        | 'authority_scope_mismatch'
        | 'mandate_not_yet_valid'
        | 'mandate_expired'
    }
>

/**
 * Compiles already-verified authority evidence into exact route-bound mandate
 * material. Authentication, policy verification and issuance belong to the
 * caller and the durable issuance boundary, not this pure contract function.
 */
export function compileRouteMandate(input: Readonly<{
  generation: CustomerRequestRoutePlanGeneration
  selectedRoutePlanId: string
  principal: RouteMandatePrincipal
  authorization: RouteMandateAuthorization
  maximumTotalSpend: ExactAmount
  expiresAt: number
  now: number
}>): CompileRouteMandateResult {
  if (!validTime(input.now) || !validTime(input.expiresAt)
    || !validIdentifier(input.selectedRoutePlanId)
    || !validPrincipal(input.principal)
    || !validAuthorization(input.authorization)
    || !validExactAmount(input.maximumTotalSpend)) {
    return { kind: 'refused', reason: 'mandate_material_invalid' }
  }
  if (!routeGenerationIsMandateEligibleProposal(input.generation)) {
    return { kind: 'refused', reason: 'route_generation_invalid' }
  }
  const route = input.generation.routes.find(({ routePlanId }) => routePlanId === input.selectedRoutePlanId)
  if (route === undefined) return { kind: 'refused', reason: 'selected_route_not_found' }
  if (route.maximumTotalCost.kind !== 'known') {
    return { kind: 'refused', reason: 'route_cost_unresolved' }
  }
  if (compareExactAmounts(route.maximumTotalCost.amount, input.maximumTotalSpend) !== 0) {
    return { kind: 'refused', reason: 'spend_scope_mismatch' }
  }
  if (route.expiresAt <= input.now) return { kind: 'refused', reason: 'route_expired' }
  if (input.expiresAt <= input.now || input.expiresAt > route.expiresAt) {
    return { kind: 'refused', reason: 'expiry_scope_invalid' }
  }
  if (input.authorization.authorityScopeDigest !== routeMandateAuthorityScopeDigest({
    generation: input.generation,
    selectedRoutePlanId: input.selectedRoutePlanId,
    principalId: input.principal.principalId,
    authorizationKind: input.authorization.kind,
    maximumTotalSpend: input.maximumTotalSpend,
    issuedAt: input.now,
    expiresAt: input.expiresAt,
  })) return { kind: 'refused', reason: 'authority_scope_mismatch' }

  const material: Omit<RouteMandate, 'mandateRef' | 'mandateDigest'> = {
    format: ROUTE_MANDATE_FORMAT,
    principal: { ...input.principal },
    authorization: { ...input.authorization },
    request: {
      requestId: input.generation.requestId,
      requestRevision: input.generation.requestRevision,
    },
    route: routeAuthorityMaterial(input.generation, route),
    issuedAt: input.now,
    expiresAt: input.expiresAt,
  }
  const mandateDigest = canonicalDigest(material as StableHashValue)
  const mandate: RouteMandate = {
    ...material,
    mandateRef: `route-mandate:v1:${mandateDigest}`,
    mandateDigest,
  }
  return deepFreeze({ kind: 'compiled', mandate })
}

export function routeMandateDigest(mandate: RouteMandate): string {
  const { mandateRef: _mandateRef, mandateDigest: _mandateDigest, ...material } = mandate
  return canonicalDigest(material as StableHashValue)
}

export function routeMandateAuthorityScopeDigest(input: Readonly<{
  generation: CustomerRequestRoutePlanGeneration
  selectedRoutePlanId: string
  principalId: string
  authorizationKind: RouteMandateAuthorization['kind']
  maximumTotalSpend: ExactAmount
  issuedAt: number
  expiresAt: number
}>): string {
  if (!routeGenerationIsMandateEligibleProposal(input.generation)) {
    throw new Error('route_mandate_authority_scope_invalid')
  }
  const route = input.generation.routes.find(({ routePlanId }) => routePlanId === input.selectedRoutePlanId)
  if (route === undefined
    || route.maximumTotalCost.kind !== 'known'
    || compareExactAmounts(route.maximumTotalCost.amount, input.maximumTotalSpend) !== 0
    || !validIdentifier(input.principalId)
    || (input.authorizationKind !== 'explicit' && input.authorizationKind !== 'standing_low_risk')
    || !validTime(input.issuedAt)
    || !validTime(input.expiresAt)
    || input.expiresAt <= input.issuedAt
    || input.expiresAt > route.expiresAt) {
    throw new Error('route_mandate_authority_scope_invalid')
  }
  return canonicalDigest({
    format: ROUTE_MANDATE_FORMAT,
    principalId: input.principalId,
    authorizationKind: input.authorizationKind,
    route: routeAuthorityMaterial(input.generation, route),
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  } as StableHashValue)
}

export function verifyRouteMandate(input: Readonly<{
  mandate: RouteMandate
  generation: CustomerRequestRoutePlanGeneration
  expectedPrincipal: RouteMandatePrincipal
  expectedAuthorization: RouteMandateAuthorization
  now: number
}>): VerifyRouteMandateResult {
  const mandate = input.mandate
  if (!validTime(input.now) || !validMandateEnvelope(mandate)
    || mandate.format !== ROUTE_MANDATE_FORMAT
    || !isCanonicalDigest(mandate.mandateDigest)
    || routeMandateDigest(mandate) !== mandate.mandateDigest
    || mandate.mandateRef !== `route-mandate:v1:${mandate.mandateDigest}`) {
    return { kind: 'refused', reason: 'mandate_integrity_invalid' }
  }
  if (!routeGenerationIsMandateEligibleProposal(input.generation)) {
    return { kind: 'refused', reason: 'route_generation_invalid' }
  }
  if (mandate.route.generationRef !== input.generation.generationRef
    || mandate.route.generation !== input.generation.generation
    || mandate.route.generationDigest !== input.generation.generationDigest
    || mandate.request.requestId !== input.generation.requestId
    || mandate.request.requestRevision !== input.generation.requestRevision) {
    return { kind: 'refused', reason: 'route_generation_mismatch' }
  }
  if (!validPrincipal(input.expectedPrincipal)
    || mandate.principal.principalId !== input.expectedPrincipal.principalId) {
    return { kind: 'refused', reason: 'principal_mismatch' }
  }
  if (!validAuthorization(input.expectedAuthorization)
    || mandate.principal.authenticationEvidenceRef !== input.expectedPrincipal.authenticationEvidenceRef
    || canonicalDigest(mandate.authorization as StableHashValue)
      !== canonicalDigest(input.expectedAuthorization as StableHashValue)) {
    return { kind: 'refused', reason: 'authority_context_mismatch' }
  }
  const route = input.generation.routes.find(({ routePlanId }) => routePlanId === mandate.route.routePlanId)
  if (route === undefined
    || canonicalDigest(routeAuthorityMaterial(input.generation, route) as StableHashValue)
      !== canonicalDigest(mandate.route as StableHashValue)) {
    return { kind: 'refused', reason: 'selected_route_mismatch' }
  }
  let expectedScopeDigest: string
  try {
    expectedScopeDigest = routeMandateAuthorityScopeDigest({
      generation: input.generation,
      selectedRoutePlanId: mandate.route.routePlanId,
      principalId: mandate.principal.principalId,
      authorizationKind: mandate.authorization.kind,
      maximumTotalSpend: mandate.route.maximumTotalSpend,
      issuedAt: mandate.issuedAt,
      expiresAt: mandate.expiresAt,
    })
  } catch {
    return { kind: 'refused', reason: 'authority_scope_mismatch' }
  }
  if (mandate.authorization.authorityScopeDigest !== expectedScopeDigest) {
    return { kind: 'refused', reason: 'authority_scope_mismatch' }
  }
  if (mandate.issuedAt > input.now) {
    return { kind: 'refused', reason: 'mandate_not_yet_valid' }
  }
  if (mandate.expiresAt <= input.now || mandate.expiresAt > route.expiresAt) {
    return { kind: 'refused', reason: 'mandate_expired' }
  }
  return deepFreeze({ kind: 'verified', mandate })
}

function routeAuthorityMaterial(
  generation: CustomerRequestRoutePlanGeneration,
  route: CustomerRequestRoutePlan,
): RouteMandate['route'] {
  if (route.maximumTotalCost.kind !== 'known') {
    throw new Error('route_mandate_exact_spend_required')
  }
  const steps = route.steps.map((step, index): RouteMandateStep => ({
    position: index + 1,
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
    inputScopeDigest: canonicalDigest({
      resolvedInputs: step.resolvedInputs,
      deferredInputs: step.deferredInputs,
    } as StableHashValue),
    price: { ...step.price },
    dataScope: step.dataUse.map((declaration) => ({
      effectId: declaration.effectId,
      inputPointer: declaration.inputPointer,
      classification: declaration.classification,
      phase: declaration.phase,
      recipient: declaration.recipient.kind === 'named_recipient'
        ? { kind: 'named_recipient' as const, recipientId: declaration.recipient.recipientId }
        : {
            kind: 'registered_binding' as const,
            businessId: step.businessId,
            bindingId: step.bindingId,
          },
      purposes: [...declaration.purposes],
    })),
    effects: step.effects.map((effect) => ({ ...effect })),
    evidence: step.evidence.map((evidence) => ({ ...evidence })),
    cancellation: {
      ...step.cancellation,
      evidenceRefs: [...step.cancellation.evidenceRefs],
    },
    recovery: { ...step.recovery },
  }))
  const dataScope = steps.flatMap((step) => step.dataScope.map((scope) => ({
    step: step.position,
    actionId: step.actionId,
    ...scope,
  })))
  const effectScope = steps.flatMap((step) => step.effects.map((effect) => ({
    step: step.position,
    actionId: step.actionId,
    ...effect,
  })))
  const evidenceScope = steps.flatMap((step) => step.evidence.map((evidence) => ({
    step: step.position,
    actionId: step.actionId,
    ...evidence,
  })))
  return {
    generationRef: generation.generationRef,
    generation: generation.generation,
    generationDigest: generation.generationDigest,
    registrySnapshotDigest: generation.registrySnapshotDigest,
    routePlanId: route.routePlanId,
    routeDigest: route.routeDigest,
    stepGraphDigest: canonicalDigest({
      orderedActionIds: route.steps.map(({ actionId }) => actionId),
      edges: route.edges,
    } as StableHashValue),
    steps,
    maximumTotalSpend: route.maximumTotalCost.amount,
    dataScopeDigest: canonicalDigest(dataScope as StableHashValue),
    effectScopeDigest: canonicalDigest(effectScope as StableHashValue),
    evidenceScopeDigest: canonicalDigest(evidenceScope as StableHashValue),
    routeExpiresAt: route.expiresAt,
    fallback: {
      kind: 'new_mandate_required',
      alternatives: route.fallbacks.alternatives.map(({ alternativeRouteRef }) => {
        const alternative = generation.routes.find(({ routePlanId }) => routePlanId === alternativeRouteRef)
        if (alternative === undefined) throw new Error('route_mandate_fallback_route_missing')
        return { routePlanId: alternative.routePlanId, routeDigest: alternative.routeDigest }
      }),
    },
  }
}

function routeGenerationIsMandateEligibleProposal(generation: CustomerRequestRoutePlanGeneration): boolean {
  try {
    return isRecord(generation)
      && generation.decisionSnapshot !== undefined
      && Number.isSafeInteger(generation.generation)
      && Number(generation.generation) > 0
      && routePlanGenerationOwnsCancellationPosture(generation)
      && routePlanGenerationIsInternallyConsistent(generation, generation.generation - 1)
  } catch {
    return false
  }
}

function validMandateEnvelope(value: unknown): value is RouteMandate {
  if (!isRecordWithExactKeys(value, [
    'format', 'mandateRef', 'mandateDigest', 'principal', 'authorization',
    'request', 'route', 'issuedAt', 'expiresAt',
  ]) || !validPrincipal(value.principal) || !validAuthorization(value.authorization)
    || !isRecordWithExactKeys(value.request, ['requestId', 'requestRevision'])
    || !validIdentifier(value.request.requestId)
    || !Number.isSafeInteger(value.request.requestRevision) || Number(value.request.requestRevision) < 1
    || !isRecord(value.route) || !validIdentifier(value.route.generationRef)
    || !Number.isSafeInteger(value.route.generation) || Number(value.route.generation) < 1
    || !isCanonicalDigest(String(value.route.generationDigest ?? ''))
    || !validIdentifier(value.route.routePlanId) || !isCanonicalDigest(String(value.route.routeDigest ?? ''))
    || !Array.isArray(value.route.steps) || !validExactAmount(value.route.maximumTotalSpend)
    || !validTime(value.issuedAt) || !validTime(value.expiresAt)
    || !validIdentifier(value.mandateRef) || !isCanonicalDigest(String(value.mandateDigest ?? ''))) return false
  return true
}

function validPrincipal(principal: unknown): principal is RouteMandatePrincipal {
  return isRecordWithExactKeys(principal, ['principalId', 'authenticationEvidenceRef'])
    && validIdentifier(principal.principalId)
    && validIdentifier(principal.authenticationEvidenceRef)
}

function validAuthorization(authorization: unknown): authorization is RouteMandateAuthorization {
  if (!isRecord(authorization)) return false
  if (authorization.kind === 'explicit') {
    return hasExactKeys(authorization, [
      'kind', 'authorizationEvidenceRef', 'authorizationEvidenceDigest', 'authorityScopeDigest',
    ]) && validIdentifier(authorization.authorizationEvidenceRef)
      && isDigest(authorization.authorizationEvidenceDigest)
      && isDigest(authorization.authorityScopeDigest)
  }
  if (authorization.kind !== 'standing_low_risk'
    || !hasExactKeys(authorization, [
      'kind', 'standingPolicyRef', 'standingPolicyDigest', 'authorityUseRef', 'authorityScopeDigest',
    ])) return false
  return validIdentifier(authorization.standingPolicyRef)
    && isDigest(authorization.standingPolicyDigest)
    && validIdentifier(authorization.authorityUseRef)
    && isDigest(authorization.authorityScopeDigest)
}

function validExactAmount(value: unknown): value is ExactAmount {
  return exactAmountSchema.safeParse(value).success
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 500
}

function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && isCanonicalDigest(value)
}


function isRecordWithExactKeys<const Keys extends readonly string[]>(
  value: unknown,
  keys: Keys,
): value is Record<Keys[number], unknown> {
  return isRecord(value) && hasExactKeys(value, keys)
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return sameStringList(actual, expected)
}

