import type {
  ComparisonCell,
  ComparisonDecisionBrief,
  ComparisonDimensionId,
  ComparisonSelectionRef,
  OfferingComparisonResult,
  ResolveComparisonSelectionsResult,
} from './contract'
import { comparisonSelectionId } from './projection'

export const PublicDecisionCategoryIds = [
  'website:v1',
  'machine_data:v1',
] as const

export type PublicDecisionCategoryId = (typeof PublicDecisionCategoryIds)[number]

export const WebsiteDecisionConstraintIds = [
  'website:v1:simple',
  'website:v1:small_startup',
  'website:v1:perth_local_preference',
  'website:v1:affordability_preference',
  'website:v1:indicative_price_requested',
] as const

export type WebsiteDecisionConstraintId =
  (typeof WebsiteDecisionConstraintIds)[number]

export const WebsiteFunctionChoiceValues = [
  'brochure_enquiries',
  'transactional',
  'im_not_sure',
] as const

export type WebsiteFunctionChoice =
  (typeof WebsiteFunctionChoiceValues)[number]

export const PublicDecisionOutcomeValues = [
  'no_registered_supply',
  'no_current_match',
  'one_plausible_option',
  'insufficient_evidence',
  'constraints_too_narrow',
  'usable_comparison',
  'unsupported_category',
] as const

export type PublicDecisionOutcome = (typeof PublicDecisionOutcomeValues)[number]

export type RegisteredConstraintDisposition =
  | Readonly<{ kind: 'satisfied'; factId: string }>
  | Readonly<{ kind: 'excluded'; factId: string }>
  | Readonly<{ kind: 'insufficient_evidence'; factId?: string }>

/**
 * Result supplied by the registered eligibility source. This contract carries
 * closed IDs and exact selection identities; prose and model judgements have
 * no destination here.
 */
export type RegisteredConstraintEligibilityEvidence = Readonly<{
  schemaVersion: 'registered-constraint-eligibility:v1'
  categoryId: PublicDecisionCategoryId
  registeredSupplyCount: number
  selections: readonly Readonly<{
    selection: ComparisonSelectionRef
    websiteFunction: Readonly<{
      choiceId: WebsiteFunctionChoice
      disposition: RegisteredConstraintDisposition
    }>
    constraints: readonly Readonly<{
      constraintId: WebsiteDecisionConstraintId
      disposition: RegisteredConstraintDisposition
    }>[]
  }>[]
}>

export type PublicDecisionPriceEvidence = Readonly<{
  evidenceClass: 'provider_published_price' | 'price_unavailable'
  value: string
}>

export type PublicDecisionSourceResult = Readonly<{
  outcome: PublicDecisionOutcome
  searchedRegisteredSupplyCount: number
  prices: readonly PublicDecisionPriceEvidence[]
  relaxableConstraintId?: Extract<
    WebsiteDecisionConstraintId,
    | 'website:v1:perth_local_preference'
    | 'website:v1:affordability_preference'
  >
}>

const RELAXABLE_CONSTRAINTS = new Set<WebsiteDecisionConstraintId>([
  'website:v1:perth_local_preference',
  'website:v1:affordability_preference',
])

/**
 * Derive only what the exact comparison facts can prove. Scope and locality
 * remain insufficient until a registered source provides closed eligibility
 * evidence; this function never interprets their free-text values.
 */
export function deriveRegisteredConstraintEligibility(input: Readonly<{
  categoryId: PublicDecisionCategoryId
  registeredSupplyCount: number
  resolution: ResolveComparisonSelectionsResult
  comparison: OfferingComparisonResult
  confirmedChoiceId: WebsiteFunctionChoice
  confirmedConstraintIds: readonly WebsiteDecisionConstraintId[]
}>): RegisteredConstraintEligibilityEvidence {
  const rows = new Map(input.comparison.rows.map((row) => [row.dimensionId, row]))
  return {
    schemaVersion: 'registered-constraint-eligibility:v1',
    categoryId: input.categoryId,
    registeredSupplyCount: input.registeredSupplyCount,
    selections: input.resolution.selections.map((selection) => ({
      selection: selection.selection,
      websiteFunction: {
        choiceId: input.confirmedChoiceId,
        disposition: { kind: 'insufficient_evidence' },
      },
      constraints: input.confirmedConstraintIds.map((constraintId) => ({
        constraintId,
        disposition: deriveConstraintDisposition(
          constraintId,
          comparisonSelectionId(selection.selection),
          rows,
        ),
      })),
    })),
  }
}

export function projectPublicDecisionSourceResult(input: Readonly<{
  requestedCategoryId: PublicDecisionCategoryId
  confirmedChoiceId: WebsiteFunctionChoice
  confirmedConstraintIds: readonly WebsiteDecisionConstraintId[]
  resolution: ResolveComparisonSelectionsResult
  comparison: OfferingComparisonResult
  brief: ComparisonDecisionBrief
  eligibility: RegisteredConstraintEligibilityEvidence
}>): PublicDecisionSourceResult {
  const prices = projectPriceEvidence(input.comparison)
  const base = {
    searchedRegisteredSupplyCount: input.eligibility.registeredSupplyCount,
    prices,
  }
  if (
    input.requestedCategoryId !== 'website:v1'
    || input.eligibility.categoryId !== input.requestedCategoryId
  ) {
    return { ...base, outcome: 'unsupported_category' }
  }
  if (input.eligibility.registeredSupplyCount === 0) {
    return { ...base, outcome: 'no_registered_supply' }
  }
  if (input.resolution.selections.length === 0) {
    return { ...base, outcome: 'no_current_match' }
  }
  if (!isEvidenceBoundToResolution(input.eligibility, input.resolution)) {
    return { ...base, outcome: 'insufficient_evidence' }
  }

  const required = new Set(input.confirmedConstraintIds)
  const facts = new Map(
    input.comparison.rows.flatMap((row) => (
      row.cells.map((cell) => [cell.factId, cell.cell] as const)
    )),
  )
  const selectionStates = input.eligibility.selections.map((candidate) => {
    const byConstraint = new Map(
      candidate.constraints.map((item) => [item.constraintId, item.disposition]),
    )
    const dispositions = [...required].map((constraintId) => byConstraint.get(constraintId))
    const functionDisposition = candidate.websiteFunction.choiceId === input.confirmedChoiceId
      ? candidate.websiteFunction.disposition
      : undefined
    return {
      selectionId: comparisonSelectionId(candidate.selection),
      insufficient: functionDisposition === undefined
        || functionDisposition.kind === 'insufficient_evidence'
        || !hasCurrentMaterialFact(functionDisposition, facts)
        || dispositions.some(
          (disposition) => disposition === undefined
            || disposition.kind === 'insufficient_evidence'
            || !hasCurrentMaterialFact(disposition, facts),
        ),
      excluded: functionDisposition?.kind === 'excluded'
        || dispositions.some((disposition) => disposition?.kind === 'excluded'),
    }
  })
  if (selectionStates.some((state) => state.insufficient)) {
    return { ...base, outcome: 'insufficient_evidence' }
  }

  const eligibleIds = selectionStates
    .filter((state) => !state.excluded)
    .map((state) => state.selectionId)
  if (eligibleIds.length === 0) {
    const relaxableConstraintId = firstRelaxableExcludedConstraint(
      input.eligibility,
      input.confirmedConstraintIds,
    )
    if (relaxableConstraintId === undefined) {
      return { ...base, outcome: 'no_current_match' }
    }
    return {
      ...base,
      outcome: 'constraints_too_narrow',
      relaxableConstraintId,
    }
  }
  if (eligibleIds.length === 1) {
    return { ...base, outcome: 'one_plausible_option' }
  }

  const comparedIds = input.comparison.selections.map(({ selection }) => (
    comparisonSelectionId(selection)
  ))
  if (!sameIds(eligibleIds, comparedIds)) {
    return { ...base, outcome: 'insufficient_evidence' }
  }
  if (
    input.comparison.ordering.kind !== 'ordered'
    || input.brief.posture !== 'ordered'
  ) {
    return { ...base, outcome: 'insufficient_evidence' }
  }
  return { ...base, outcome: 'usable_comparison' }
}

function hasCurrentMaterialFact(
  disposition: RegisteredConstraintDisposition,
  facts: ReadonlyMap<string, ComparisonCell>,
): boolean {
  if (disposition.kind === 'insufficient_evidence') return false
  return facts.get(disposition.factId)?.kind === 'known'
}

function deriveConstraintDisposition(
  constraintId: WebsiteDecisionConstraintId,
  selectionId: string,
  rows: ReadonlyMap<ComparisonDimensionId, OfferingComparisonResult['rows'][number]>,
): RegisteredConstraintDisposition {
  const dimensionId = materialDimensionForConstraint(constraintId)
  if (dimensionId === undefined) {
    return { kind: 'insufficient_evidence' }
  }
  const cell = rows
    .get(dimensionId)
    ?.cells.find((candidate) => candidate.selectionId === selectionId)
  if (cell === undefined) {
    return { kind: 'insufficient_evidence' }
  }
  return cellDisposition(cell.factId, cell.cell)
}

function materialDimensionForConstraint(
  constraintId: WebsiteDecisionConstraintId,
): ComparisonDimensionId | undefined {
  switch (constraintId) {
    case 'website:v1:affordability_preference':
    case 'website:v1:indicative_price_requested':
      return 'professional_service:v1:price_basis'
    case 'website:v1:simple':
    case 'website:v1:small_startup':
    case 'website:v1:perth_local_preference':
      return undefined
  }
}

function cellDisposition(
  factId: string,
  cell: ComparisonCell,
): RegisteredConstraintDisposition {
  if (cell.kind !== 'known') {
    return { kind: 'insufficient_evidence', factId }
  }
  return { kind: 'satisfied', factId }
}

function isEvidenceBoundToResolution(
  evidence: RegisteredConstraintEligibilityEvidence,
  resolution: ResolveComparisonSelectionsResult,
): boolean {
  return sameIds(
    evidence.selections.map(({ selection }) => comparisonSelectionId(selection)),
    resolution.selections.map(({ selection }) => comparisonSelectionId(selection)),
  )
}

function firstRelaxableExcludedConstraint(
  evidence: RegisteredConstraintEligibilityEvidence,
  confirmedConstraintIds: readonly WebsiteDecisionConstraintId[],
): PublicDecisionSourceResult['relaxableConstraintId'] {
  for (const constraintId of confirmedConstraintIds) {
    if (!RELAXABLE_CONSTRAINTS.has(constraintId)) continue
    const excluded = evidence.selections.every((candidate) => (
      candidate.constraints.find((item) => item.constraintId === constraintId)
        ?.disposition.kind === 'excluded'
    ))
    if (excluded) {
      return constraintId as PublicDecisionSourceResult['relaxableConstraintId']
    }
  }
  return undefined
}

function projectPriceEvidence(
  comparison: OfferingComparisonResult,
): readonly PublicDecisionPriceEvidence[] {
  const row = comparison.rows.find(
    (candidate) => candidate.dimensionId === 'professional_service:v1:price_basis',
  )
  if (row === undefined || row.cells.length === 0) {
    return [{ evidenceClass: 'price_unavailable', value: 'Not supplied' }]
  }
  return row.cells.slice(0, 4).map(({ cell }) => {
    if (
      cell.kind === 'known'
      && cell.source.kind === 'business_supplied'
      && isPrice(cell.value)
    ) {
      return {
        evidenceClass: 'provider_published_price' as const,
        value: cell.value.description,
      }
    }
    return {
      evidenceClass: 'price_unavailable' as const,
      value: 'Not supplied',
    }
  })
}

function isPrice(value: unknown): value is Readonly<{ description: string }> {
  return typeof value === 'object'
    && value !== null
    && 'description' in value
    && typeof value.description === 'string'
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index])
}
