export {
  ComparisonBriefSchemaVersion,
  ComparisonPriorityIds,
  ComparisonSchemaVersion,
  MAX_COMPARISON_PRIORITIES,
  MAX_COMPARISON_SELECTIONS,
} from './internal/contract'

export type {
  ComparisonCaveatId,
  ComparisonCell,
  ComparisonCellValue,
  ComparisonDecisionBrief,
  ComparisonDetailSectionId,
  ComparisonDimensionId,
  ComparisonFact,
  ComparisonFactSource,
  ComparisonOfferingReadPort,
  ComparisonOrdering,
  ComparisonOrderingReason,
  ComparisonPriceValue,
  ComparisonPriorityId,
  ComparisonReasonId,
  ComparisonRow,
  ComparisonSafeActionId,
  ComparisonSelectionRef,
  ComparisonSelectionRefusalReason,
  ComparisonUrlState,
  ComparisonUrlStateParseResult,
  ExactOfferingReference,
  ExactPublicOfferingReadResult,
  LiveOfferingAvailabilityResult,
  OfferingComparisonResult,
  ProjectComparisonProfileResult,
  ResolveComparisonSelectionsResult,
  ResolvedComparisonSelection,
} from './internal/contract'

export type { OfferingComparisonEnvelope } from '@/modules/catalog/public'

export {
  appendComparisonUrlState,
  parseComparisonUrlState,
  serializeComparisonUrlState,
} from './internal/url-state'
export { resolveComparisonSelections } from './internal/resolve'
export { compareOfferings } from './internal/compare'
export { buildComparisonBrief } from './internal/brief'
export {
  comparisonFactId,
  comparisonSelectionId,
  projectComparisonProfile,
  projectComparisonRows,
} from './internal/projection'
export {
  PublicDecisionCategoryIds,
  PublicDecisionOutcomeValues,
  WebsiteDecisionConstraintIds,
  WebsiteFunctionChoiceValues,
  deriveRegisteredConstraintEligibility,
  projectPublicDecisionSourceResult,
} from './internal/decision-support'
export type {
  PublicDecisionCategoryId,
  PublicDecisionOutcome,
  PublicDecisionPriceEvidence,
  PublicDecisionSourceResult,
  RegisteredConstraintDisposition,
  RegisteredConstraintEligibilityEvidence,
  WebsiteDecisionConstraintId,
  WebsiteFunctionChoice,
} from './internal/decision-support'
