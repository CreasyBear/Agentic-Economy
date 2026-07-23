import type {
  ComparisonCell,
  ComparisonOrderingReason,
  ComparisonPriceValue,
  ComparisonPriorityId,
  ComparisonRow,
  ComparisonRowCell,
  OfferingComparisonResult,
  ResolvedComparisonSelection,
} from './contract'
import {
  comparisonSelectionId,
  projectComparisonRows,
} from './projection'

type OrderingValue = Readonly<{
  ordinal: number
  comparisonGroup: string
}>

type PrioritySpecification =
  | Readonly<{
      kind: 'price'
      dimensionId:
        | 'professional_service:v1:price_basis'
        | 'machine_data:v1:price_basis'
      unit: 'total' | 'request'
    }>
  | Readonly<{
      kind: 'explicit_preference'
      dimensionId:
        | 'machine_data:v1:authentication'
        | 'machine_data:v1:interface_format'
      preferred: string
    }>

const PRIORITY_DIMENSION: Readonly<Record<ComparisonPriorityId, PrioritySpecification>> = {
  'professional_service:v1:lowest_total_price': {
    kind: 'price',
    dimensionId: 'professional_service:v1:price_basis',
    unit: 'total',
  },
  'machine_data:v1:lowest_request_price': {
    kind: 'price',
    dimensionId: 'machine_data:v1:price_basis',
    unit: 'request',
  },
  'machine_data:v1:no_authentication_preferred': {
    kind: 'explicit_preference',
    dimensionId: 'machine_data:v1:authentication',
    preferred: 'none',
  },
  'machine_data:v1:graphql_preferred': {
    kind: 'explicit_preference',
    dimensionId: 'machine_data:v1:interface_format',
    preferred: 'graphql',
  },
}

export function compareOfferings(input: Readonly<{
  selections: readonly ResolvedComparisonSelection[]
  priorities: readonly ComparisonPriorityId[]
  refusedSelectionCount?: number
}>): OfferingComparisonResult {
  const rows = projectComparisonRows(input.selections)
  const base = {
    schemaVersion: 'offering-comparison:v1' as const,
    priorities: input.priorities,
    selections: input.selections,
    rows,
    refusedSelectionCount: input.refusedSelectionCount ?? 0,
  }
  if (input.selections.length < 2) {
    return {
      ...base,
      ordering: { kind: 'unranked', reason: 'insufficient_selections' },
    }
  }
  if (input.priorities.length === 0) {
    return { ...base, ordering: { kind: 'unranked', reason: 'no_priority' } }
  }
  if ((input.refusedSelectionCount ?? 0) > 0) {
    return unranked(base, 'unavailable_selection')
  }
  if (input.selections.some(({ projectionDisposition }) => projectionDisposition === 'stale')) {
    return unranked(base, 'stale_fact')
  }
  if (input.selections.some(({ projectionDisposition }) => projectionDisposition === 'partial')) {
    return unranked(base, 'partial_projection')
  }

  const priorityRows: Array<Readonly<{
    priority: ComparisonPriorityId
    row: ComparisonRow
    values: ReadonlyMap<string, OrderingValue>
  }>> = []
  let decisiveRows: typeof priorityRows | undefined
  let ordered: ResolvedComparisonSelection[] = []
  for (const priority of input.priorities) {
    const specification = PRIORITY_DIMENSION[priority]
    const row = rows.find((candidate) => candidate.dimensionId === specification.dimensionId)
    if (row === undefined) {
      return unranked(base, 'not_comparable')
    }
    const values = new Map<string, OrderingValue>()
    for (const cell of row.cells) {
      const refusal = orderingRefusal(cell.cell, specification)
      if (refusal !== undefined) {
        return unranked(base, refusal, row.cells.map((candidate) => candidate.factId))
      }
      values.set(cell.selectionId, orderingValue(cell.cell, specification)!)
    }
    if (!sameComparisonGroup([...values.values()])) {
      return unranked(
        base,
        'not_comparable',
        row.cells.map((candidate) => candidate.factId),
      )
    }
    priorityRows.push({ priority, row, values })
    const candidateOrder = [...input.selections].sort((left, right) => (
      compareSelections(left, right, priorityRows)
    ))
    if (hasUniqueSequence(candidateOrder, priorityRows)) {
      decisiveRows = [...priorityRows]
      ordered = candidateOrder
      break
    }
  }
  if (decisiveRows === undefined) {
    return unranked(
      base,
      'tie',
      priorityRows.flatMap(({ row }) => row.cells.map((cell) => cell.factId)),
    )
  }

  return {
    ...base,
    ordering: {
      kind: 'ordered',
      rule: 'lexicographic_stated_priorities:v1',
      orderedSelectionIds: ordered.map(({ selection }) => comparisonSelectionId(selection)),
      decisivePriorityIds: decisiveRows.map(({ priority }) => priority),
      decisiveFactIds: decisiveRows.flatMap(({ row }) => (
        ordered.map(({ selection }) => {
          const id = comparisonSelectionId(selection)
          return row.cells.find((cell) => cell.selectionId === id)!.factId
        })
      )),
      reasonIds: decisiveRows.map(({ priority }) => `reason:${priority}` as const),
    },
  }
}

function unranked(
  base: Omit<OfferingComparisonResult, 'ordering'>,
  reason: ComparisonOrderingReason,
  blockingFactIds?: readonly string[],
): OfferingComparisonResult {
  return {
    ...base,
    ordering: {
      kind: 'unranked',
      reason,
      ...(blockingFactIds === undefined ? {} : { blockingFactIds }),
    },
  }
}

function orderingRefusal(
  cell: ComparisonCell,
  specification: PrioritySpecification,
): ComparisonOrderingReason | undefined {
  if (cell.kind === 'not_comparable') return 'not_comparable'
  if (cell.kind === 'stale') return 'stale_fact'
  if (cell.kind === 'unknown' || cell.kind === 'not_supplied') {
    return 'missing_material_fact'
  }
  if (specification.kind === 'price') {
    if (!isPriceValue(cell.value)) return 'not_comparable'
    if (
      cell.value.unit !== specification.unit
      || cell.value.amountMinor === undefined
      || cell.value.currency === undefined
    ) {
      return 'not_comparable'
    }
  } else if (typeof cell.value !== 'string') {
    return 'not_comparable'
  }
  return undefined
}

function orderingValue(
  cell: ComparisonCell,
  specification: PrioritySpecification,
): OrderingValue | undefined {
  if (cell.kind !== 'known') return undefined
  if (specification.kind === 'explicit_preference') {
    if (typeof cell.value !== 'string') return undefined
    return {
      ordinal: cell.value === specification.preferred ? 0 : 1,
      comparisonGroup: `${specification.dimensionId}:${specification.preferred}`,
    }
  }
  if (!isPriceValue(cell.value)) return undefined
  if (
    cell.value.amountMinor === undefined
    || cell.value.currency === undefined
    || cell.value.unit !== specification.unit
  ) return undefined
  return {
    ordinal: cell.value.amountMinor,
    comparisonGroup: `${cell.value.currency}:${specification.unit}`,
  }
}

function compareSelections(
  left: ResolvedComparisonSelection,
  right: ResolvedComparisonSelection,
  priorities: readonly Readonly<{
    values: ReadonlyMap<string, OrderingValue>
  }>[],
): number {
  const leftId = comparisonSelectionId(left.selection)
  const rightId = comparisonSelectionId(right.selection)
  for (const priority of priorities) {
    const leftValue = priority.values.get(leftId)!
    const rightValue = priority.values.get(rightId)!
    const difference = leftValue.ordinal - rightValue.ordinal
    if (difference !== 0) return difference
  }
  return 0
}

function hasUniqueSequence(
  ordered: readonly ResolvedComparisonSelection[],
  priorities: readonly Readonly<{
    values: ReadonlyMap<string, OrderingValue>
  }>[],
): boolean {
  for (let index = 1; index < ordered.length; index += 1) {
    if (compareSelections(ordered[index - 1]!, ordered[index]!, priorities) === 0) {
      return false
    }
  }
  return true
}

function sameComparisonGroup(values: readonly OrderingValue[]): boolean {
  return new Set(values.map((value) => value.comparisonGroup)).size === 1
}

function isPriceValue(input: unknown): input is ComparisonPriceValue {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false
  const value = input as Partial<ComparisonPriceValue>
  return typeof value.description === 'string'
    && typeof value.unit === 'string'
}
