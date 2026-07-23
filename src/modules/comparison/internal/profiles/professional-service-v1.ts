import type { OfferingComparisonEnvelope } from '@/modules/catalog/public'

import type {
  ComparisonCell,
  ComparisonFact,
  ComparisonPriceValue,
  ProjectComparisonProfileResult,
} from '../contract'

type ProfessionalProfile = Extract<
  OfferingComparisonEnvelope['profile'],
  { profileId: 'professional_service:v1' }
>

export function projectProfessionalServiceV1(
  profile: ProfessionalProfile,
  resolvedAt: number,
): ProjectComparisonProfileResult {
  return {
    kind: 'projected',
    profileId: profile.profileId,
    dimensions: [
      {
        dimensionId: 'professional_service:v1:scope_basis',
        cell: currentCell(profile.scopeBasis, resolvedAt),
      },
      {
        dimensionId: 'professional_service:v1:price_basis',
        ...optionalComparisonKey(
          priceKey('professional_service:v1', profile.priceBasis),
        ),
        cell: currentCell(profile.priceBasis, resolvedAt),
      },
      {
        dimensionId: 'professional_service:v1:timing_basis',
        cell: currentCell(profile.timingBasis, resolvedAt),
      },
      {
        dimensionId: 'professional_service:v1:service_area',
        cell: currentCell(profile.serviceArea, resolvedAt),
      },
    ],
  }
}

function currentCell<T>(
  fact: ComparisonFact<T>,
  resolvedAt: number,
): ComparisonCell {
  if (
    fact.kind === 'known'
    && fact.validUntil !== undefined
    && fact.validUntil < resolvedAt
  ) {
    return {
      kind: 'stale',
      lastKnown: fact.value as never,
      source: fact.source,
      observedAt: fact.observedAt,
      validUntil: fact.validUntil,
    }
  }
  return fact as ComparisonCell
}

function priceKey(
  profileId: string,
  fact: ComparisonFact<ComparisonPriceValue>,
): string | undefined {
  if (fact.kind !== 'known') return undefined
  return `${profileId}:price:${fact.value.currency ?? 'unspecified'}:${fact.value.unit}`
}

function optionalComparisonKey(
  comparisonKey: string | undefined,
): Readonly<{ comparisonKey?: string }> {
  return comparisonKey === undefined ? {} : { comparisonKey }
}
