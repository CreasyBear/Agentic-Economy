import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { CustomerRequestRoutePlanGeneration } from './route-plan-generation'
import {
  routeMandateAuthorityScopeDigest,
  type RouteMandateAuthorization,
} from './route-mandate'

export const STANDING_ROUTE_POLICY_FORMAT = 'ae.standing-route-policy:v1' as const

type Money = Readonly<{ currency: string; amountMinor: number }>
type CapabilityContractRef = CustomerRequestRoutePlanGeneration['routes'][number]['steps'][number]['contractRef']

export type StandingRoutePolicy = Readonly<{
  format: typeof STANDING_ROUTE_POLICY_FORMAT
  policyRef: string
  policyDigest: string
  principalId: string
  delegatedCredentialId: string
  generationRef: string
  generationDigest: string
  routes: readonly Readonly<{ routePlanId: string; routeDigest: string }>[]
  capabilityContracts: readonly CapabilityContractRef[]
  allowedEffectClasses: readonly 'data_release'[]
  limits: Readonly<{
    perUseSpend: Money
    cumulativeSpend: Money
    perUseDataAllocations: number
    cumulativeDataAllocations: number
    occurrences: number
  }>
  fallback: Readonly<{ kind: 'explicit_confirmation_required' }>
  validFrom: number
  validUntil: number
  revokedAt?: number
}>

export type StandingRouteAuthorityUse = Readonly<{
  authorityUseRef: string
  authorityUseDigest: string
  standingPolicyRef: string
  standingPolicyDigest: string
  generationRef: string
  routePlanId: string
  routeDigest: string
  occurrence: number
  maximumSpend: Money
  dataAllocations: number
  usedAt: number
  mandateExpiresAt: number
}>

export type EvaluateStandingRouteAuthorityResult = Readonly<
  | {
      kind: 'authorized'
      authorization: Extract<RouteMandateAuthorization, { kind: 'standing_low_risk' }>
      use: StandingRouteAuthorityUse
    }
  | {
      kind: 'refused'
      reason:
        | 'policy_integrity_invalid'
        | 'principal_mismatch'
        | 'credential_mismatch'
        | 'policy_not_yet_valid'
        | 'policy_expired'
        | 'policy_revoked'
        | 'generation_changed'
        | 'route_not_allowed'
        | 'capability_not_allowed'
        | 'consequential_effect_requires_confirmation'
        | 'spend_limit_exceeded'
        | 'data_limit_exceeded'
        | 'occurrence_limit_exceeded'
        | 'mandate_expiry_invalid'
        | 'prior_use_invalid'
    }
>

export function standingRoutePolicyDigest(
  policy: Omit<StandingRoutePolicy, 'policyRef' | 'policyDigest'>,
): string {
  return canonicalDigest(policy as StableHashValue)
}

export function evaluateStandingRouteAuthority(input: Readonly<{
  policy: StandingRoutePolicy
  generation: CustomerRequestRoutePlanGeneration
  selectedRoutePlanId: string
  authenticatedPrincipalId: string
  delegatedCredentialId: string
  priorUses: readonly StandingRouteAuthorityUse[]
  now: number
  mandateExpiresAt: number
}>): EvaluateStandingRouteAuthorityResult {
  const policy = input.policy
  const { policyRef: _policyRef, policyDigest: _policyDigest, ...policyMaterial } = policy
  if (policy.format !== STANDING_ROUTE_POLICY_FORMAT
    || !isCanonicalDigest(policy.policyDigest)
    || standingRoutePolicyDigest(policyMaterial) !== policy.policyDigest
    || policy.policyRef !== `standing-route-policy:v1:${policy.policyDigest}`) {
    return { kind: 'refused', reason: 'policy_integrity_invalid' }
  }
  if (policy.principalId !== input.authenticatedPrincipalId) {
    return { kind: 'refused', reason: 'principal_mismatch' }
  }
  if (policy.delegatedCredentialId !== input.delegatedCredentialId) {
    return { kind: 'refused', reason: 'credential_mismatch' }
  }
  if (!validTime(input.now) || input.now < policy.validFrom) {
    return { kind: 'refused', reason: 'policy_not_yet_valid' }
  }
  if (input.now >= policy.validUntil) return { kind: 'refused', reason: 'policy_expired' }
  if (policy.revokedAt !== undefined && input.now >= policy.revokedAt) {
    return { kind: 'refused', reason: 'policy_revoked' }
  }
  if (policy.generationRef !== input.generation.generationRef
    || policy.generationDigest !== input.generation.generationDigest) {
    return { kind: 'refused', reason: 'generation_changed' }
  }
  const route = input.generation.routes.find(({ routePlanId }) => routePlanId === input.selectedRoutePlanId)
  const allowedRoute = policy.routes.find(({ routePlanId }) => routePlanId === input.selectedRoutePlanId)
  if (route === undefined || allowedRoute === undefined || allowedRoute.routeDigest !== route.routeDigest) {
    return { kind: 'refused', reason: 'route_not_allowed' }
  }
  const allowedContracts = new Set(policy.capabilityContracts.map(contractKey))
  if (route.steps.some(({ contractRef }) => !allowedContracts.has(contractKey(contractRef)))) {
    return { kind: 'refused', reason: 'capability_not_allowed' }
  }
  if (route.steps.some(({ effects }) => effects.some(({ class: effectClass }) => (
    effectClass !== 'data_release' || !policy.allowedEffectClasses.includes(effectClass)
  )))) {
    return { kind: 'refused', reason: 'consequential_effect_requires_confirmation' }
  }
  if (route.maximumTotalCost.kind !== 'known'
    || !sameCurrency(route.maximumTotalCost, policy.limits.perUseSpend)
    || !sameCurrency(route.maximumTotalCost, policy.limits.cumulativeSpend)
    || route.maximumTotalCost.amountMinor > policy.limits.perUseSpend.amountMinor) {
    return { kind: 'refused', reason: 'spend_limit_exceeded' }
  }
  const dataAllocations = route.steps.reduce((total, { dataUse }) => total + dataUse.length, 0)
  if (!validCount(dataAllocations)
    || dataAllocations > policy.limits.perUseDataAllocations) {
    return { kind: 'refused', reason: 'data_limit_exceeded' }
  }
  if (!input.priorUses.every((use) => validPriorUse(use, policy))) {
    return { kind: 'refused', reason: 'prior_use_invalid' }
  }
  if (input.priorUses.length >= policy.limits.occurrences) {
    return { kind: 'refused', reason: 'occurrence_limit_exceeded' }
  }
  const cumulativeSpend = input.priorUses.reduce(
    (total, use) => total + use.maximumSpend.amountMinor,
    route.maximumTotalCost.amountMinor,
  )
  if (!Number.isSafeInteger(cumulativeSpend)
    || cumulativeSpend > policy.limits.cumulativeSpend.amountMinor) {
    return { kind: 'refused', reason: 'spend_limit_exceeded' }
  }
  const cumulativeData = input.priorUses.reduce(
    (total, use) => total + use.dataAllocations,
    dataAllocations,
  )
  if (!Number.isSafeInteger(cumulativeData)
    || cumulativeData > policy.limits.cumulativeDataAllocations) {
    return { kind: 'refused', reason: 'data_limit_exceeded' }
  }
  if (!validTime(input.mandateExpiresAt)
    || input.mandateExpiresAt <= input.now
    || input.mandateExpiresAt > policy.validUntil
    || input.mandateExpiresAt > route.expiresAt) {
    return { kind: 'refused', reason: 'mandate_expiry_invalid' }
  }

  const occurrence = input.priorUses.length + 1
  const useMaterial = {
    standingPolicyRef: policy.policyRef,
    standingPolicyDigest: policy.policyDigest,
    generationRef: input.generation.generationRef,
    routePlanId: route.routePlanId,
    routeDigest: route.routeDigest,
    occurrence,
    maximumSpend: {
      currency: route.maximumTotalCost.currency,
      amountMinor: route.maximumTotalCost.amountMinor,
    },
    dataAllocations,
    usedAt: input.now,
    mandateExpiresAt: input.mandateExpiresAt,
  }
  const authorityUseDigest = canonicalDigest(useMaterial as StableHashValue)
  const use = {
    ...useMaterial,
    authorityUseRef: `standing-authority-use:v1:${authorityUseDigest}`,
    authorityUseDigest,
  }
  return {
    kind: 'authorized',
    authorization: {
      kind: 'standing_low_risk',
      standingPolicyRef: policy.policyRef,
      standingPolicyDigest: policy.policyDigest,
      authorityUseRef: use.authorityUseRef,
      authorityScopeDigest: routeMandateAuthorityScopeDigest({
        generation: input.generation,
        selectedRoutePlanId: route.routePlanId,
        principalId: policy.principalId,
        authorizationKind: 'standing_low_risk',
        maximumTotalSpend: use.maximumSpend,
        issuedAt: input.now,
        expiresAt: input.mandateExpiresAt,
      }),
    },
    use,
  }
}

function validPriorUse(use: StandingRouteAuthorityUse, policy: StandingRoutePolicy): boolean {
  const { authorityUseRef: _ref, authorityUseDigest: _digest, ...material } = use
  return isCanonicalDigest(use.authorityUseDigest)
    && use.authorityUseRef === `standing-authority-use:v1:${use.authorityUseDigest}`
    && canonicalDigest(material as StableHashValue) === use.authorityUseDigest
    && use.standingPolicyRef === policy.policyRef
    && use.standingPolicyDigest === policy.policyDigest
    && sameCurrency(use.maximumSpend, policy.limits.cumulativeSpend)
    && validCount(use.dataAllocations)
    && validCount(use.occurrence)
}

function contractKey(contract: CapabilityContractRef): string {
  return `${contract.capabilityId}:${contract.version}:${contract.contractDigest}`
}

function sameCurrency(left: Money, right: Money): boolean {
  return left.currency === right.currency
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}
