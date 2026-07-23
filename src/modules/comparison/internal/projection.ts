import {
  validateOfferingComparisonEnvelope,
  type OfferingComparisonEnvelope,
} from '@/modules/catalog/public'

import type {
  CommonComparisonDimensionId,
  ComparisonCell,
  ComparisonDimensionId,
  ComparisonRow,
  ComparisonSelectionRef,
  ProjectComparisonProfileResult,
  ProjectedProfileDimension,
  ResolvedComparisonSelection,
} from './contract'
import { projectMachineDataV1 } from './profiles/machine-data-v1'
import { projectProfessionalServiceV1 } from './profiles/professional-service-v1'

const COMMON_DIMENSIONS: readonly CommonComparisonDimensionId[] = [
  'common:business_name',
  'common:offering_name',
  'common:offering_revision',
]

export function projectComparisonProfile(
  envelope: OfferingComparisonEnvelope,
  resolvedAt: number,
): ProjectComparisonProfileResult {
  const validated = validateOfferingComparisonEnvelope(envelope)
  if (validated.kind === 'invalid') {
    return { kind: 'refused', reason: 'invalid_comparison_profile' }
  }
  switch (validated.envelope.profile.profileId) {
    case 'professional_service:v1':
      return projectProfessionalServiceV1(validated.envelope.profile, resolvedAt)
    case 'machine_data:v1':
      return projectMachineDataV1(validated.envelope.profile, resolvedAt)
  }
}

export function projectComparisonRows(
  selections: readonly ResolvedComparisonSelection[],
): readonly ComparisonRow[] {
  const profiles = selections.map((selection) => (
    selection.offering.comparison === undefined
      ? undefined
      : projectComparisonProfile(selection.offering.comparison, selection.resolvedAt)
  ))
  const dimensions: ComparisonDimensionId[] = [...COMMON_DIMENSIONS]
  for (const profile of profiles) {
    if (profile?.kind !== 'projected') continue
    for (const dimension of profile.dimensions) {
      if (!dimensions.includes(dimension.dimensionId)) dimensions.push(dimension.dimensionId)
    }
  }

  return dimensions.map((dimensionId): ComparisonRow => ({
    dimensionId,
    cells: selections.map((selection, index) => {
      const selectionId = comparisonSelectionId(selection.selection)
      return {
        selectionId,
        factId: comparisonFactId(selection.selection, dimensionId),
        cell: COMMON_DIMENSIONS.includes(dimensionId as CommonComparisonDimensionId)
          ? commonCell(selection, dimensionId as CommonComparisonDimensionId)
          : profileCell(profiles[index], dimensionId),
      }
    }),
  }))
}

export function comparisonSelectionId(selection: ComparisonSelectionRef): string {
  return `selection:${[
    selection.businessId,
    selection.offeringRef,
    String(selection.offeringRevision),
  ].map(lengthPrefixed).join('')}`
}

export function comparisonFactId(
  selection: ComparisonSelectionRef,
  dimensionId: ComparisonDimensionId,
): string {
  return `fact:${comparisonSelectionId(selection)}:${dimensionId}`
}

function commonCell(
  selection: ResolvedComparisonSelection,
  dimensionId: CommonComparisonDimensionId,
): ComparisonCell {
  const source = { kind: 'business_supplied' as const }
  switch (dimensionId) {
    case 'common:business_name':
      return known(selection.business.name, source, selection.publication.publishedAt)
    case 'common:offering_name':
      return known(selection.offering.name, source, selection.publication.publishedAt)
    case 'common:offering_revision':
      return known(selection.offering.revision, source, selection.publication.publishedAt)
  }
}

function profileCell(
  profile: ProjectComparisonProfileResult | undefined,
  dimensionId: ComparisonDimensionId,
): ComparisonCell {
  if (profile?.kind !== 'projected') {
    return { kind: 'not_comparable', reason: 'profile_mismatch' }
  }
  const dimension = profile.dimensions.find(
    (candidate: ProjectedProfileDimension) => candidate.dimensionId === dimensionId,
  )
  return dimension?.cell ?? { kind: 'not_comparable', reason: 'profile_mismatch' }
}

function known(
  value: string | number,
  source: { kind: 'business_supplied' } | { kind: 'publicly_observed' },
  observedAt: number,
): ComparisonCell {
  return { kind: 'known', value, source, observedAt }
}

function lengthPrefixed(value: string): string {
  return `${value.length}:${value}`
}
