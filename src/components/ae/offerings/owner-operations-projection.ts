import type {
  OwnerOperationsInventoryResult,
  OwnerOperationsInventoryRow,
  OwnerOperationsLifecycleResult,
  OwnerOperationsLifecycleRow,
} from './owner-operations.functions'
import {
  supplierOperationReasonPresentation,
} from '@/modules/capability-supply/supplier-operation-status'

export type OwnerOperationAvailability = 'available' | 'unavailable' | 'unknown'

export type OwnerOperationsProjectionRow = OwnerOperationsInventoryRow & Readonly<{
  lifecycleLabel: string
  availability: OwnerOperationAvailability
  blocker?: string
  continuation: Readonly<{ kind: 'navigate'; label: string; href: string }>
  lifecyclePending?: boolean
}>

export type OwnerOperationsProjection =
  | Readonly<{
      kind: 'available'
      rows: readonly OwnerOperationsProjectionRow[]
      attentionCount: number
      firstBlocker?: string
      inconsistencyCount: number
    }>
  | Readonly<{
      kind: 'conflict'
      reason: 'duplicate_definition' | 'duplicate_supply' | 'multiple_suppliers' | 'business_mismatch'
    }>

export function projectOwnerOperations(
  inventory: Extract<OwnerOperationsInventoryResult, { kind: 'available' }>,
  lifecycle: OwnerOperationsLifecycleResult,
): OwnerOperationsProjection {
  if (hasDuplicate(inventory.operations, (row) => row.offeringRef)) {
    return { kind: 'conflict', reason: 'duplicate_definition' }
  }
  if (lifecycle.kind === 'conflict') return lifecycle
  if (lifecycle.kind === 'available' && hasDuplicate(lifecycle.value, (row) => row.offeringRef)) {
    return { kind: 'conflict', reason: 'duplicate_supply' }
  }
  const statusByOffering = new Map(
    lifecycle.kind === 'available'
      ? lifecycle.value.map((row) => [row.offeringRef, row] as const)
      : [],
  )
  const rows = inventory.operations.map((row) => projectRow(row, statusByOffering.get(row.offeringRef), lifecycle.kind))
  const blockers = rows.flatMap((row) => row.blocker === undefined ? [] : [row.blocker])
  return {
    kind: 'available',
    rows,
    attentionCount: blockers.length,
    ...(blockers[0] === undefined ? {} : { firstBlocker: blockers[0] }),
    inconsistencyCount: rows.filter((row) => row.lifecyclePending === true).length,
  }
}

function projectRow(
  definition: OwnerOperationsInventoryRow,
  lifecycle: OwnerOperationsLifecycleRow | undefined,
  lifecycleKind: OwnerOperationsLifecycleResult['kind'],
): OwnerOperationsProjectionRow {
  const detail = {
    kind: 'navigate' as const,
    label: 'View status',
    href: `/owner/supply/${encodeURIComponent(definition.offeringRef)}`,
  }
  if (lifecycle === undefined) {
    return {
      ...definition,
      lifecycleLabel: lifecycleKind === 'unavailable' ? 'Status unavailable' : 'Updating',
      availability: 'unknown',
      blocker: lifecycleKind === 'unavailable'
        ? 'Lifecycle status is temporarily unavailable.'
        : 'The canonical Operation status is still catching up.',
      continuation: detail,
      ...(lifecycleKind === 'unavailable' ? {} : { lifecyclePending: true }),
    }
  }
  const status = lifecycle.status
  if (status.revision !== undefined && status.revision !== definition.currentRevision) {
    return {
      ...definition,
      lifecycleLabel: 'Updating',
      availability: 'unknown',
      blocker: 'The canonical status belongs to an earlier Operation revision.',
      continuation: detail,
      lifecyclePending: true,
    }
  }
  const firstReason = status.reasonCodes[0]
  const blocker = firstReason === undefined
    ? undefined
    : supplierOperationReasonPresentation(firstReason).description
  const continuation = status.ownerHandoff === undefined
    ? detail
    : {
        kind: 'navigate' as const,
        label: status.ownerHandoff.ctaLabel,
        href: status.ownerHandoff.cta,
      }
  return {
    ...definition,
    lifecycleLabel: status.state,
    availability: status.routeability.available ? 'available' : 'unavailable',
    ...(blocker === undefined ? {} : { blocker }),
    continuation,
  }
}

function hasDuplicate<T>(items: readonly T[], key: (item: T) => string): boolean {
  const seen = new Set<string>()
  for (const item of items) {
    const value = key(item)
    if (seen.has(value)) return true
    seen.add(value)
  }
  return false
}
