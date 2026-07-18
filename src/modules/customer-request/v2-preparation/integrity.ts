import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { CustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import type { DurableActionPreparation } from '@/modules/customer-request/action-preparation'

export function aggregateIntegrityValid(aggregate: CustomerRequestV2Aggregate): boolean {
  const { aggregateDigest: _aggregateDigest, ...material } = aggregate
  return aggregate.aggregateVersion === 2
    && aggregate.snapshot.requestId === aggregate.plan.requestId
    && aggregate.snapshot.revision === aggregate.plan.requestRevision
    && canonicalDigest(material as StableHashValue) === aggregate.aggregateDigest
}

export function preparationIntegrityValid(preparation: DurableActionPreparation): boolean {
  const { preparationDigest, ...material } = preparation
  return canonicalDigest(material as StableHashValue) === preparationDigest
}

export function samePreparationProjectionIdentity(
  left: DurableActionPreparation,
  right: DurableActionPreparation,
): boolean {
  return canonicalDigest(projectionIdentity(left) as StableHashValue)
    === canonicalDigest(projectionIdentity(right) as StableHashValue)
}

function projectionIdentity(preparation: DurableActionPreparation) {
  const projectedKind = preparation.kind === 'ready_for_routing' && preparation.authorityReservation !== undefined
    ? 'needs_authority'
    : preparation.kind
  return {
    preparationRef: preparation.preparationRef,
    lineage: preparation.lineage,
    projectedInputDigest: preparation.projectedInputDigest,
    authorityScopeDigest: preparation.authorityScope.authorityScopeDigest,
    reviewDigest: preparation.disclosureReview.reviewDigest,
    kind: projectedKind,
    ...(preparation.kind === 'needs_information' ? { missing: preparation.missing } : {}),
  }
}
