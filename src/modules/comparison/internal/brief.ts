import type {
  ComparisonCaveatId,
  ComparisonDecisionBrief,
  ComparisonOrderingReason,
  OfferingComparisonResult,
} from './contract'

const DETAIL_SECTIONS = [
  'detail:options',
  'detail:comparison_facts',
  'detail:sources_and_freshness',
] as const

const SAFE_ACTIONS = [
  'action:view_offering',
  'action:change_priorities',
] as const

export function buildComparisonBrief(
  comparison: OfferingComparisonResult,
): ComparisonDecisionBrief {
  const ordering = comparison.ordering
  const foregroundableFactIds = ordering.kind === 'ordered'
    ? ordering.decisiveFactIds.slice(0, 3)
    : (
        ordering.blockingFactIds
        ?? comparison.rows
          .filter((row) => !row.dimensionId.startsWith('common:'))
          .flatMap((row) => row.cells.map((cell) => cell.factId))
      ).slice(0, 3)

  return {
    schemaVersion: 'offering-comparison-brief:v1',
    posture: ordering.kind,
    decisiveReasonIds: ordering.kind === 'ordered'
      ? ordering.reasonIds
      : [`reason:unranked:${ordering.reason}`],
    foregroundableFactIds,
    mandatoryCaveatIds: caveats(comparison),
    detailSectionIds: DETAIL_SECTIONS,
    safeActionIds: SAFE_ACTIONS,
  }
}

function caveats(
  comparison: OfferingComparisonResult,
): readonly ComparisonCaveatId[] {
  const result: ComparisonCaveatId[] = []
  if (comparison.ordering.kind === 'unranked') {
    result.push(caveatForReason(comparison.ordering.reason))
  }
  if (comparison.refusedSelectionCount > 0) {
    result.push('caveat:selection_refused')
  }
  if (comparison.selections.some((selection) => selection.newerCurrentReference !== undefined)) {
    result.push('caveat:newer_revision')
  }
  if (comparison.selections.some((selection) => selection.projectionDisposition !== 'current')) {
    result.push('caveat:partial_projection')
  }
  result.push('caveat:published_information')
  return result
}

function caveatForReason(reason: ComparisonOrderingReason): ComparisonCaveatId {
  switch (reason) {
    case 'insufficient_selections':
      return 'caveat:insufficient_selections'
    case 'no_priority':
      return 'caveat:no_priority'
    case 'missing_material_fact':
      return 'caveat:missing_fact'
    case 'stale_fact':
      return 'caveat:stale_fact'
    case 'not_comparable':
      return 'caveat:not_comparable'
    case 'partial_projection':
      return 'caveat:partial_projection'
    case 'unavailable_selection':
      return 'caveat:unavailable_selection'
    case 'tie':
      return 'caveat:tie'
  }
}
