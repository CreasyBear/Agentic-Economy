import type { OfferingComparisonEnvelope } from '@/modules/catalog/public'

import type {
  ComparisonCell,
  ComparisonFact,
  ComparisonPriceValue,
  ProjectComparisonProfileResult,
} from '../contract'

type MachineProfile = Extract<
  OfferingComparisonEnvelope['profile'],
  { profileId: 'machine_data:v1' }
>

export function projectMachineDataV1(
  profile: MachineProfile,
  resolvedAt: number,
): ProjectComparisonProfileResult {
  return {
    kind: 'projected',
    profileId: profile.profileId,
    dimensions: [
      {
        dimensionId: 'machine_data:v1:interface_format',
        cell: currentCell(profile.interfaceFormat, resolvedAt),
      },
      {
        dimensionId: 'machine_data:v1:request_method',
        cell: currentCell(profile.requestMethod, resolvedAt),
      },
      {
        dimensionId: 'machine_data:v1:authentication',
        cell: currentCell(profile.authentication, resolvedAt),
      },
      {
        dimensionId: 'machine_data:v1:price_basis',
        ...optionalComparisonKey(priceKey('machine_data:v1', profile.priceBasis)),
        cell: currentCell(profile.priceBasis, resolvedAt),
      },
      {
        dimensionId: 'machine_data:v1:freshness_or_update_cadence',
        cell: currentCell(profile.freshnessOrUpdateCadence, resolvedAt),
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
