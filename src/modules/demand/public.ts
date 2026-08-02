/**
 * Public seam for the demand module. Routes, sibling modules and Convex
 * functions consume demand contracts from here; `internal/` stays private to
 * this module.
 */
export {
  addFactObservations,
  detectRequiredFacts,
  evaluateSearchGaps,
  mergeFactCounts,
  rankFactCounts,
  SearchGapFactValues,
  SearchGapSurfaceValues,
  toSearchGapCandidateV2,
} from './internal/search-gap'

export type {
  FactObservation,
  SearchGapCandidate,
  SearchGapFact,
  SearchGapFactCount,
  SearchGapSurface,
} from './internal/search-gap'
