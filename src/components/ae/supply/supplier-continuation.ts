import { suggestContinuation, type SuggestedContinuation } from '@/modules/market/suggested-continuation'
import type { OwnerSupplyOfferingReadback } from '@/modules/capability-supply/supply-funnel.functions'

export type SupplierContinuation = SuggestedContinuation & Readonly<{ href: string }>

type PublicationState = NonNullable<OwnerSupplyOfferingReadback['publication']>['state']
type LifecycleState = OwnerSupplyOfferingReadback['lifecycle']['state']
type ReadinessState = OwnerSupplyOfferingReadback['stepStates']['readiness']
type ReadinessOutcome = OwnerSupplyOfferingReadback['readiness']['outcome']
type AuthorityKind = NonNullable<OwnerSupplyOfferingReadback['authority']>['kind']

const publicationStates = {
  current: 'current',
  withdrawn: 'withdrawn',
  superseded: 'superseded',
  incompatible: 'incompatible',
} as const satisfies Record<PublicationState, PublicationState>

const lifecycleStates = {
  inactive: 'inactive',
  active: 'active',
  withdrawn: 'withdrawn',
  incompatible: 'incompatible',
} as const satisfies Record<LifecycleState, LifecycleState>

const readinessStates = {
  not_started: 'not_started',
  in_progress: 'in_progress',
  completed: 'completed',
  refused: 'refused',
  stale: 'stale',
} as const satisfies Record<ReadinessState, ReadinessState>

const readinessOutcomes = {
  unobserved: 'unobserved',
  healthy: 'healthy',
  credential_unavailable: 'credential_unavailable',
  credential_rejected: 'credential_rejected',
  target_not_public: 'target_not_public',
  transport_unreachable: 'transport_unreachable',
  http_redirect: 'http_redirect',
  http_4xx: 'http_4xx',
  http_5xx: 'http_5xx',
  response_content_type_invalid: 'response_content_type_invalid',
  response_too_large: 'response_too_large',
  response_invalid: 'response_invalid',
} as const satisfies Record<ReadinessOutcome, ReadinessOutcome>

const authorityKinds = {
  public_upstream: 'public_upstream',
  provider_connection: 'provider_connection',
} as const satisfies Record<AuthorityKind, AuthorityKind>

export function supplierContinuationForOffering(
  offering: OwnerSupplyOfferingReadback,
): SupplierContinuation {
  const detailHref = `/owner/supply/${encodeURIComponent(offering.offeringRef)}`
  const publicationState = offering.publication === undefined
    ? undefined
    : publicationStates[offering.publication.state]
  const lifecycleState = lifecycleStates[offering.lifecycle.state]
  const readinessState = readinessStates[offering.stepStates.readiness]
  const readinessOutcome = readinessOutcomes[offering.readiness.outcome]
  const authorityKind = offering.authority === undefined
    ? undefined
    : authorityKinds[offering.authority.kind]
  const liveState = offering.live.available
    ? 'available'
    : offering.live.reason === undefined
      ? 'unavailable_unconfirmed'
      : 'unavailable_confirmed'
  const credentialNeedsAttention =
    readinessOutcome === 'credential_unavailable'
    || readinessOutcome === 'credential_rejected'
    || offering.actionableReason === 'credential_unavailable'
    || offering.actionableReason === 'credential_rejected'
  const authorityStale = offering.actionableReason === 'authority_stale'

  if (offering.status === 'retired' || publicationState === 'superseded') {
    return { label: 'Review earnings', kind: 'navigate', href: '/owner/offerings#earnings' }
  }
  if (publicationState === 'incompatible' || lifecycleState === 'incompatible') {
    return withBrowserDestination(
      suggestContinuation({ subject: 'supplier', state: 'incompatible', offeringRef: offering.offeringRef }),
      `${detailHref}#incompatibility`,
    )
  }
  if (publicationState === 'withdrawn' || lifecycleState === 'withdrawn') {
    return withBrowserDestination(
      suggestContinuation({ subject: 'supplier', state: 'withdrawn', offeringRef: offering.offeringRef }),
      `${detailHref}#publication-maintenance`,
    )
  }
  if (offering.currentStep === 'describe') {
    return withBrowserDestination(
      suggestContinuation({ subject: 'supplier', state: 'draft', offeringRef: offering.offeringRef }),
    )
  }
  if (authorityStale) {
    if (authorityKind !== 'provider_connection') {
      return { label: 'Re-admit provider authority', kind: 'navigate', href: `${detailHref}#provider` }
    }
    return {
      label: 'Manage connections',
      kind: 'navigate',
      href: '/owner/offerings#supplier-connections',
    }
  }
  if (credentialNeedsAttention) {
    return { label: 'Choose replacement connection', kind: 'navigate', href: `${detailHref}#credential-recovery` }
  }
  if (offering.currentStep === 'admission') {
    return withBrowserDestination(
      suggestContinuation({ subject: 'connection', state: 'missing', actor: 'supplier' }),
      `${detailHref}#provider`,
    )
  }
  if (readinessState === 'in_progress') {
    return { label: 'View status', kind: 'navigate', href: `${detailHref}#readiness` }
  }
  if (liveState === 'available' && offering.publication?.operationRef !== undefined) {
    return withBrowserDestination(suggestContinuation({
      subject: 'supplier',
      state: 'current',
      offeringRef: offering.offeringRef,
      operationRef: offering.publication.operationRef,
    }))
  }
  if (offering.currentStep === 'readiness' || liveState !== 'available') {
    return withBrowserDestination(
      suggestContinuation({ subject: 'supplier', state: 'unready', offeringRef: offering.offeringRef }),
      `${detailHref}#readiness`,
    )
  }
  return { label: 'Review earnings', kind: 'navigate', href: '/owner/offerings#earnings' }
}

function withBrowserDestination(
  continuation: SuggestedContinuation,
  href = continuation.href,
): SupplierContinuation {
  if (href === undefined) throw new Error('supplier_continuation_href_missing')
  return { ...continuation, href }
}
