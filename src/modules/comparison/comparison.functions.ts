import {
  callPublicSourceQuery,
  sourceQuery,
} from '@/lib/server/convex-source'
import { validateOfferingComparisonEnvelope } from '@/modules/catalog/public'
import { configuredLocalE2EComparisonRead } from './internal/local-e2e-read-port'
import { compareOfferings } from './internal/compare'
import { resolveComparisonSelections } from './internal/resolve'
import type {
  ComparisonOfferingReadPort,
  ComparisonPriorityId,
  ComparisonSelectionRef,
  ExactOfferingReference,
  ExactPublicOfferingReadResult,
  LiveOfferingAvailabilityResult,
  OfferingComparisonResult,
} from './internal/contract'

type ReadArgs = Readonly<{
  businessId: string
  offeringRef: string
  revision: number
}>

const readPublicComparisonOfferingReferenceQuery = sourceQuery<
  ReadArgs,
  unknown
>('catalog:readPublicComparisonOfferingReference')

const unavailableReasons = [
  'business_not_public',
  'business_suppressed',
  'offering_suppressed',
  'legacy_reference',
  'business_mismatch',
  'never_public',
  'source_hash_mismatch',
  'revision_unavailable',
  'privacy_withdrawn',
  'safety_withdrawn',
  'ambiguous_history',
] as const

type UnavailableReason = (typeof unavailableReasons)[number]

export type PublicComparisonOfferingTransportResult =
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
        comparison?: NonNullable<
          Extract<ExactPublicOfferingReadResult, { kind: 'resolved' }>['offering']['comparison']
        >
      }>
      publication: Readonly<{
        publishedAt: number
        withdrawnAt?: number
        safeDisplayDisposition: 'retain_safe_history'
      }>
      projectionDisposition: 'current' | 'partial' | 'stale'
      currentReference?: ExactOfferingReference
    }>
  | Readonly<{
      kind: 'unavailable'
      reason: UnavailableReason
    }>

export function createComparisonOfferingReadPort(options: Readonly<{
  read?: (args: ReadArgs) => Promise<unknown>
}> = {}): ComparisonOfferingReadPort {
  const read = options.read
    ?? configuredLocalE2EComparisonRead()
    ?? ((args: ReadArgs) => callPublicSourceQuery(
      readPublicComparisonOfferingReferenceQuery,
      args,
    ))
  const reads = new Map<string, Promise<PublicComparisonOfferingTransportResult>>()

  function load(reference: ExactOfferingReference) {
    const key = exactKey(reference)
    const existing = reads.get(key)
    if (existing !== undefined) return existing
    const pending = read({
      businessId: reference.businessId,
      offeringRef: reference.offeringRef,
      revision: reference.offeringRevision,
    }).then(decodeTransport)
    reads.set(key, pending)
    return pending
  }

  return {
    async readLiveAvailability(reference): Promise<LiveOfferingAvailabilityResult> {
      const result = await load(reference)
      if (result.kind === 'resolved') {
        return {
          kind: 'available',
          ...(result.currentReference === undefined
            ? {}
            : { currentReference: result.currentReference }),
        }
      }
      return isLiveUnavailableReason(result.reason)
        ? { kind: 'unavailable', reason: result.reason }
        : { kind: 'available' }
    },
    async readExactPublicOffering(reference): Promise<ExactPublicOfferingReadResult> {
      const result = await load(reference)
      if (result.kind === 'unavailable') {
        return isExactUnavailableReason(result.reason)
          ? { kind: 'unavailable', reason: result.reason }
          : { kind: 'unavailable', reason: 'revision_unavailable' }
      }
      return {
        kind: 'resolved',
        business: result.business,
        offering: result.offering,
        publication: result.publication,
        projectionDisposition: result.projectionDisposition,
      }
    },
  }
}

/**
 * Public inspect-only comparison application seam.
 *
 * Callers provide exact public references and stated closed priorities. The
 * server always re-resolves live eligibility and the exact historical
 * publication before the pure comparator sees a selection.
 */
export async function comparePublicOfferingSelections(input: Readonly<{
  selections: readonly ComparisonSelectionRef[]
  priorities: readonly ComparisonPriorityId[]
  resolvedAt?: number
  port?: ComparisonOfferingReadPort
}>): Promise<OfferingComparisonResult> {
  const resolution = await resolveComparisonSelections({
    state: {
      version: 'offering-comparison:v1',
      selections: input.selections,
      priorities: input.priorities,
    },
    resolvedAt: input.resolvedAt ?? Date.now(),
    port: input.port ?? createComparisonOfferingReadPort(),
  })
  return compareOfferings({
    selections: resolution.selections,
    priorities: input.priorities,
    refusedSelectionCount: resolution.refusals.length,
  })
}

function decodeTransport(input: unknown): PublicComparisonOfferingTransportResult {
  if (!isPlainObject(input) || containsSourceHash(input)) {
    return malformed()
  }
  if (
    hasExactKeys(input, ['kind', 'reason'])
    && input.kind === 'unavailable'
    && isUnavailableReason(input.reason)
  ) {
    return { kind: 'unavailable', reason: input.reason }
  }
  if (
    input.kind !== 'resolved'
    || !hasOnlyKeys(input, [
      'kind',
      'business',
      'offering',
      'publication',
      'projectionDisposition',
      'currentReference',
    ])
    || !isBusiness(input.business)
    || !isOffering(input.offering)
    || !isPublication(input.publication)
    || !isProjectionDisposition(input.projectionDisposition)
    || (
      input.currentReference !== undefined
      && !isExactReference(input.currentReference)
    )
  ) {
    return malformed()
  }
  const comparison = input.offering.comparison === undefined
    ? undefined
    : validateOfferingComparisonEnvelope(input.offering.comparison)
  if (comparison?.kind === 'invalid') return malformed()

  return {
    kind: 'resolved',
    business: input.business,
    offering: {
      offeringRef: input.offering.offeringRef,
      revision: input.offering.revision,
      name: input.offering.name,
      category: input.offering.category,
      summary: input.offering.summary,
      ...(comparison === undefined ? {} : { comparison: comparison.envelope }),
    },
    publication: input.publication,
    projectionDisposition: input.projectionDisposition,
    ...(input.currentReference === undefined
      ? {}
      : { currentReference: input.currentReference }),
  }
}

function isBusiness(input: unknown): input is Extract<
  PublicComparisonOfferingTransportResult,
  { kind: 'resolved' }
>['business'] {
  return isPlainObject(input)
    && hasExactKeys(input, ['businessId', 'slug', 'name'])
    && isNonEmptyString(input.businessId)
    && isNonEmptyString(input.slug)
    && isNonEmptyString(input.name)
}

function isOffering(input: unknown): input is Readonly<{
  offeringRef: string
  revision: number
  name: string
  category: string
  summary: string
  comparison?: unknown
}> {
  return isPlainObject(input)
    && hasOnlyKeys(input, [
      'offeringRef',
      'revision',
      'name',
      'category',
      'summary',
      'comparison',
    ])
    && isNonEmptyString(input.offeringRef)
    && Number.isSafeInteger(input.revision)
    && Number(input.revision) > 0
    && isNonEmptyString(input.name)
    && isNonEmptyString(input.category)
    && isNonEmptyString(input.summary)
}

function isPublication(input: unknown): input is Extract<
  PublicComparisonOfferingTransportResult,
  { kind: 'resolved' }
>['publication'] {
  return isPlainObject(input)
    && hasOnlyKeys(input, [
      'publishedAt',
      'withdrawnAt',
      'safeDisplayDisposition',
    ])
    && Number.isFinite(input.publishedAt)
    && (
      input.withdrawnAt === undefined
      || Number.isFinite(input.withdrawnAt)
    )
    && input.safeDisplayDisposition === 'retain_safe_history'
}

function isExactReference(input: unknown): input is ExactOfferingReference {
  return isPlainObject(input)
    && hasExactKeys(input, [
      'businessId',
      'offeringRef',
      'offeringRevision',
    ])
    && isNonEmptyString(input.businessId)
    && isNonEmptyString(input.offeringRef)
    && Number.isSafeInteger(input.offeringRevision)
    && Number(input.offeringRevision) > 0
}

function isProjectionDisposition(
  input: unknown,
): input is 'current' | 'partial' | 'stale' {
  return input === 'current' || input === 'partial' || input === 'stale'
}

function isUnavailableReason(input: unknown): input is UnavailableReason {
  return typeof input === 'string'
    && (unavailableReasons as readonly string[]).includes(input)
}

function isLiveUnavailableReason(
  reason: UnavailableReason,
): reason is Extract<LiveOfferingAvailabilityResult, { kind: 'unavailable' }>['reason'] {
  return reason === 'business_not_public'
    || reason === 'business_suppressed'
    || reason === 'offering_suppressed'
    || reason === 'legacy_reference'
    || reason === 'business_mismatch'
}

function isExactUnavailableReason(
  reason: UnavailableReason,
): reason is Extract<ExactPublicOfferingReadResult, { kind: 'unavailable' }>['reason'] {
  return reason === 'never_public'
    || reason === 'business_mismatch'
    || reason === 'source_hash_mismatch'
    || reason === 'revision_unavailable'
    || reason === 'privacy_withdrawn'
    || reason === 'safety_withdrawn'
    || reason === 'ambiguous_history'
}

function malformed(): PublicComparisonOfferingTransportResult {
  return { kind: 'unavailable', reason: 'revision_unavailable' }
}

function exactKey(reference: ExactOfferingReference): string {
  return [
    reference.businessId,
    reference.offeringRef,
    String(reference.offeringRevision),
  ].map((value) => `${value.length}:${value}`).join('')
}

function containsSourceHash(input: unknown): boolean {
  if (Array.isArray(input)) return input.some(containsSourceHash)
  if (!isPlainObject(input)) return false
  return Object.entries(input).some(
    ([key, value]) => key.toLowerCase().includes('sourcehash')
      || containsSourceHash(value),
  )
}

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

function hasExactKeys(
  input: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(input).length === keys.length && hasOnlyKeys(input, keys)
}

function hasOnlyKeys(
  input: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(input).every((key) => keys.includes(key))
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === 'string' && input.trim().length > 0
}
