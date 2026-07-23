import type { OfferingComparisonEnvelope } from '@/modules/catalog/public'

export const ComparisonSchemaVersion = 'offering-comparison:v1' as const
export const ComparisonBriefSchemaVersion = 'offering-comparison-brief:v1' as const
export const MAX_COMPARISON_SELECTIONS = 4
export const MAX_COMPARISON_PRIORITIES = 3

export const ComparisonPriorityIds = [
  'professional_service:v1:lowest_total_price',
  'machine_data:v1:lowest_request_price',
  'machine_data:v1:no_authentication_preferred',
  'machine_data:v1:graphql_preferred',
] as const

export type ComparisonPriorityId = (typeof ComparisonPriorityIds)[number]

export type ComparisonSelectionRef = Readonly<{
  businessId: string
  offeringRef: string
  offeringRevision: number
  /** Observation context only. Exact Offering identity is the other three fields. */
  projectionObservedAt: number
}>

export type ExactOfferingReference = Omit<
  ComparisonSelectionRef,
  'projectionObservedAt'
>

export type ComparisonUrlState = Readonly<{
  version: typeof ComparisonSchemaVersion
  selections: readonly ComparisonSelectionRef[]
  priorities: readonly ComparisonPriorityId[]
}>

export type ComparisonUrlStateParseResult =
  | Readonly<{ kind: 'accepted'; state: ComparisonUrlState }>
  | Readonly<{
      kind: 'refused'
      reason:
        | 'malformed_state'
        | 'unexpected_parameter'
        | 'selection_limit_exceeded'
        | 'priority_limit_exceeded'
        | 'duplicate_selection'
        | 'duplicate_priority'
        | 'unknown_priority'
    }>

export type ComparisonFactSource =
  | Readonly<{ kind: 'business_supplied' }>
  | Readonly<{ kind: 'publicly_observed'; referenceUrl?: string | undefined }>
  | Readonly<{ kind: 'ae_support'; actionId: string; actionVersion: string }>

export type ComparisonFact<T> =
  | Readonly<{
      kind: 'known'
      value: T
      source: ComparisonFactSource
      observedAt: number
      validUntil?: number | undefined
    }>
  | Readonly<{
      kind: 'unknown'
      explanation: string
      source: ComparisonFactSource
      observedAt: number
    }>
  | Readonly<{
      kind: 'not_supplied'
      source: ComparisonFactSource
      observedAt: number
    }>
  | Readonly<{
      kind: 'stale'
      lastKnown?: T | undefined
      source: ComparisonFactSource
      observedAt: number
      validUntil: number
    }>

export type ComparisonPriceValue = Readonly<{
  description: string
  currency?: string | undefined
  amountMinor?: number | undefined
  unit: 'total' | 'hour' | 'day' | 'month' | 'request' | 'unit'
}>

export type ComparisonCellValue =
  | string
  | number
  | ComparisonPriceValue

export type ComparisonCell =
  | ComparisonFact<ComparisonCellValue>
  | Readonly<{ kind: 'not_comparable'; reason: 'profile_mismatch' | 'unit_mismatch' }>

export type CommonComparisonDimensionId =
  | 'common:business_name'
  | 'common:offering_name'
  | 'common:offering_revision'

export type ProfileComparisonDimensionId =
  | 'professional_service:v1:scope_basis'
  | 'professional_service:v1:price_basis'
  | 'professional_service:v1:timing_basis'
  | 'professional_service:v1:service_area'
  | 'machine_data:v1:interface_format'
  | 'machine_data:v1:request_method'
  | 'machine_data:v1:authentication'
  | 'machine_data:v1:price_basis'
  | 'machine_data:v1:freshness_or_update_cadence'

export type ComparisonDimensionId =
  | CommonComparisonDimensionId
  | ProfileComparisonDimensionId

export type ProjectedProfileDimension = Readonly<{
  dimensionId: ProfileComparisonDimensionId
  comparisonKey?: string
  cell: ComparisonCell
}>

export type ProjectComparisonProfileResult =
  | Readonly<{
      kind: 'projected'
      profileId: OfferingComparisonEnvelope['profile']['profileId']
      dimensions: readonly ProjectedProfileDimension[]
    }>
  | Readonly<{ kind: 'refused'; reason: 'invalid_comparison_profile' }>

export type ExactPublicOfferingReadResult =
  | Readonly<{
      kind: 'resolved'
      business: Readonly<{
        businessId: string
        slug: string
        name: string
      }>
      offering: Readonly<{
        offeringRef: string
        revision: number
        name: string
        category: string
        summary: string
        comparison?: OfferingComparisonEnvelope
      }>
      publication: Readonly<{
        publishedAt: number
        withdrawnAt?: number
        safeDisplayDisposition: 'retain_safe_history'
      }>
      projectionDisposition: 'current' | 'partial' | 'stale'
    }>
  | Readonly<{
      kind: 'unavailable'
      reason:
        | 'never_public'
        | 'business_mismatch'
        | 'source_hash_mismatch'
        | 'revision_unavailable'
        | 'privacy_withdrawn'
        | 'safety_withdrawn'
        | 'ambiguous_history'
    }>

export type LiveOfferingAvailabilityResult =
  | Readonly<{
      kind: 'available'
      currentReference?: ExactOfferingReference
    }>
  | Readonly<{
      kind: 'unavailable'
      reason:
        | 'business_not_public'
        | 'business_suppressed'
        | 'offering_suppressed'
        | 'legacy_reference'
        | 'business_mismatch'
    }>

/**
 * Server-side dependency. The live gate must complete before the exact
 * historical read is called, so suppressed material cannot reach fact access.
 */
export type ComparisonOfferingReadPort = Readonly<{
  readLiveAvailability: (
    reference: ExactOfferingReference,
  ) => Promise<LiveOfferingAvailabilityResult>
  readExactPublicOffering: (
    reference: ExactOfferingReference,
  ) => Promise<ExactPublicOfferingReadResult>
}>

export type ComparisonSelectionRefusalReason =
  | 'business_not_public'
  | 'business_suppressed'
  | 'offering_suppressed'
  | 'legacy_reference'
  | 'business_mismatch'
  | 'never_public'
  | 'source_hash_mismatch'
  | 'revision_unavailable'
  | 'privacy_withdrawn'
  | 'safety_withdrawn'
  | 'ambiguous_history'
  | 'lineage_mismatch'
  | 'invalid_comparison_profile'

export type ResolvedComparisonSelection = Readonly<{
  selection: ComparisonSelectionRef
  business: Extract<ExactPublicOfferingReadResult, { kind: 'resolved' }>['business']
  offering: Extract<ExactPublicOfferingReadResult, { kind: 'resolved' }>['offering']
  publication: Extract<ExactPublicOfferingReadResult, { kind: 'resolved' }>['publication']
  projectionDisposition: 'current' | 'partial' | 'stale'
  newerCurrentReference?: ExactOfferingReference
  resolvedAt: number
}>

export type ResolveComparisonSelectionsResult = Readonly<{
  kind: 'resolved'
  disposition: 'current' | 'partial'
  selections: readonly ResolvedComparisonSelection[]
  refusals: readonly Readonly<{
    selection: ComparisonSelectionRef
    reason: ComparisonSelectionRefusalReason
  }>[]
}>

export type ComparisonRowCell = Readonly<{
  selectionId: string
  factId: string
  cell: ComparisonCell
}>

export type ComparisonRow = Readonly<{
  dimensionId: ComparisonDimensionId
  cells: readonly ComparisonRowCell[]
}>

export type ComparisonOrderingReason =
  | 'insufficient_selections'
  | 'no_priority'
  | 'missing_material_fact'
  | 'stale_fact'
  | 'not_comparable'
  | 'partial_projection'
  | 'unavailable_selection'
  | 'tie'

export type ComparisonOrdering =
  | Readonly<{
      kind: 'unranked'
      reason: ComparisonOrderingReason
      blockingFactIds?: readonly string[]
    }>
  | Readonly<{
      kind: 'ordered'
      rule: 'lexicographic_stated_priorities:v1'
      orderedSelectionIds: readonly string[]
      decisivePriorityIds: readonly ComparisonPriorityId[]
      decisiveFactIds: readonly string[]
      reasonIds: readonly ComparisonReasonId[]
    }>

export type ComparisonReasonId =
  | `reason:${ComparisonPriorityId}`
  | `reason:unranked:${ComparisonOrderingReason}`

export type OfferingComparisonResult = Readonly<{
  schemaVersion: typeof ComparisonSchemaVersion
  priorities: readonly ComparisonPriorityId[]
  selections: readonly ResolvedComparisonSelection[]
  rows: readonly ComparisonRow[]
  refusedSelectionCount: number
  ordering: ComparisonOrdering
}>

export type ComparisonCaveatId =
  | 'caveat:insufficient_selections'
  | 'caveat:no_priority'
  | 'caveat:missing_fact'
  | 'caveat:stale_fact'
  | 'caveat:not_comparable'
  | 'caveat:partial_projection'
  | 'caveat:unavailable_selection'
  | 'caveat:tie'
  | 'caveat:selection_refused'
  | 'caveat:newer_revision'
  | 'caveat:partial_projection'
  | 'caveat:published_information'

export type ComparisonDetailSectionId =
  | 'detail:options'
  | 'detail:comparison_facts'
  | 'detail:sources_and_freshness'

export type ComparisonSafeActionId =
  | 'action:view_offering'
  | 'action:change_priorities'

export type ComparisonDecisionBrief = Readonly<{
  schemaVersion: typeof ComparisonBriefSchemaVersion
  posture: 'ordered' | 'unranked'
  decisiveReasonIds: readonly ComparisonReasonId[]
  foregroundableFactIds: readonly string[]
  mandatoryCaveatIds: readonly ComparisonCaveatId[]
  detailSectionIds: readonly ComparisonDetailSectionId[]
  safeActionIds: readonly ComparisonSafeActionId[]
}>
