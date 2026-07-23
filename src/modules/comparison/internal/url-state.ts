import {
  ComparisonPriorityIds,
  ComparisonSchemaVersion,
  MAX_COMPARISON_PRIORITIES,
  MAX_COMPARISON_SELECTIONS,
  type ComparisonPriorityId,
  type ComparisonSelectionRef,
  type ComparisonUrlState,
  type ComparisonUrlStateParseResult,
} from './contract'

const MAX_BUSINESS_ID_LENGTH = 300
const MAX_OFFERING_REF_LENGTH = 300
const ALLOWED_PARAMETERS = new Set(['selection', 'priority'])

export function parseComparisonUrlState(
  input: string | URLSearchParams,
): ComparisonUrlStateParseResult {
  const params = input instanceof URLSearchParams
    ? new URLSearchParams(input)
    : new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)

  for (const key of params.keys()) {
    if (!ALLOWED_PARAMETERS.has(key)) {
      return { kind: 'refused', reason: 'unexpected_parameter' }
    }
  }

  const encodedSelections = params.getAll('selection')
  const encodedPriorities = params.getAll('priority')
  if (encodedSelections.length > MAX_COMPARISON_SELECTIONS) {
    return { kind: 'refused', reason: 'selection_limit_exceeded' }
  }
  if (encodedPriorities.length > MAX_COMPARISON_PRIORITIES) {
    return { kind: 'refused', reason: 'priority_limit_exceeded' }
  }

  const selections: ComparisonSelectionRef[] = []
  for (const encoded of encodedSelections) {
    const parsed = parseSelection(encoded)
    if (parsed === undefined) return { kind: 'refused', reason: 'malformed_state' }
    selections.push(parsed)
  }
  const selectionKeys = selections.map(exactSelectionKey)
  if (new Set(selectionKeys).size !== selectionKeys.length) {
    return { kind: 'refused', reason: 'duplicate_selection' }
  }

  const priorities: ComparisonPriorityId[] = []
  for (const priority of encodedPriorities) {
    if (!isPriorityId(priority)) {
      return { kind: 'refused', reason: 'unknown_priority' }
    }
    priorities.push(priority)
  }
  if (new Set(priorities).size !== priorities.length) {
    return { kind: 'refused', reason: 'duplicate_priority' }
  }

  return {
    kind: 'accepted',
    state: {
      version: ComparisonSchemaVersion,
      selections,
      priorities,
    },
  }
}

export function serializeComparisonUrlState(
  input: Readonly<{
    selections: readonly ComparisonSelectionRef[]
    priorities: readonly ComparisonPriorityId[]
  }> | ComparisonUrlState,
): string {
  const params = new URLSearchParams()
  for (const selection of input.selections) {
    params.append('selection', JSON.stringify({
      businessId: selection.businessId,
      offeringRef: selection.offeringRef,
      offeringRevision: selection.offeringRevision,
      projectionObservedAt: selection.projectionObservedAt,
    }))
  }
  for (const priority of input.priorities) params.append('priority', priority)
  return `?${params.toString()}`
}

function parseSelection(encoded: string): ComparisonSelectionRef | undefined {
  let value: unknown
  try {
    value = JSON.parse(encoded)
  } catch {
    return undefined
  }
  if (!isPlainObject(value)) return undefined
  if (
    !hasExactKeys(value, [
      'businessId',
      'offeringRef',
      'offeringRevision',
      'projectionObservedAt',
    ])
    || !isBoundedIdentifier(value.businessId, MAX_BUSINESS_ID_LENGTH)
    || !isBoundedIdentifier(value.offeringRef, MAX_OFFERING_REF_LENGTH)
    || !Number.isSafeInteger(value.offeringRevision)
    || Number(value.offeringRevision) <= 0
    || !Number.isSafeInteger(value.projectionObservedAt)
    || Number(value.projectionObservedAt) < 0
  ) {
    return undefined
  }
  return {
    businessId: value.businessId,
    offeringRef: value.offeringRef,
    offeringRevision: Number(value.offeringRevision),
    projectionObservedAt: Number(value.projectionObservedAt),
  }
}

function exactSelectionKey(selection: ComparisonSelectionRef): string {
  return `${selection.businessId}\u0000${selection.offeringRef}\u0000${selection.offeringRevision}`
}

function isPriorityId(input: string): input is ComparisonPriorityId {
  return (ComparisonPriorityIds as readonly string[]).includes(input)
}

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

function hasExactKeys(
  input: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(input).sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index])
}

function isBoundedIdentifier(input: unknown, maximum: number): input is string {
  return typeof input === 'string'
    && input.length > 0
    && input.length <= maximum
    && input.trim() === input
}
