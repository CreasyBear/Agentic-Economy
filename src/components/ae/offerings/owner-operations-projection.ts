import type {
  OwnerOperationsInventoryResult,
  OwnerOperationsInventoryRow,
  OwnerOperationsLifecycleResult,
  OwnerOperationsLifecycleRow,
} from './owner-operations.functions'
import type { SupplierContinuation } from '@/components/ae/supply/supplier-continuation'

export type OwnerOperationAvailability = 'available' | 'unavailable' | 'unknown'

export type OwnerOperationsProjectionRow = OwnerOperationsInventoryRow & Readonly<{
  lifecycleLabel: string
  availability: OwnerOperationAvailability
  blocker?: string
  continuation: SupplierContinuation
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

  const lifecycleByRef = new Map(
    lifecycle.kind === 'available'
      ? lifecycle.value.map((row) => [row.offeringRef, row] as const)
      : [],
  )
  const inventoryRefs = new Set(inventory.operations.map((row) => row.offeringRef))
  const supplyOnly = lifecycle.kind === 'available'
    ? lifecycle.value.filter((row) => !inventoryRefs.has(row.offeringRef)).length
    : 0

  const rows = inventory.operations.map((row) => projectRow(row, lifecycleByRef.get(row.offeringRef), lifecycle.kind))
  const blockers = rows.flatMap((row) => row.blocker === undefined ? [] : [row.blocker])
  const missingSupply = lifecycle.kind === 'not_applicable'
    ? inventory.operations.length
    : rows.filter((row) => row.lifecyclePending === true).length
  return {
    kind: 'available',
    rows,
    attentionCount: blockers.length,
    ...(blockers[0] === undefined ? {} : { firstBlocker: blockers[0] }),
    inconsistencyCount: supplyOnly + missingSupply,
  }
}

function projectRow(
  definition: OwnerOperationsInventoryRow,
  supply: OwnerOperationsLifecycleRow | undefined,
  lifecycleKind: OwnerOperationsLifecycleResult['kind'],
): OwnerOperationsProjectionRow {
  const edit: SupplierContinuation = {
    kind: 'navigate',
    label: 'Edit Operation',
    href: `/owner/offerings/${encodeURIComponent(definition.offeringRef)}`,
  }
  if (supply === undefined) {
    if (lifecycleKind === 'not_applicable') {
      return {
        ...definition,
        lifecycleLabel: 'Preparation required',
        availability: 'unknown',
        blocker: 'This Operation has not entered the supplier lifecycle.',
        continuation: edit,
      }
    }
    if (lifecycleKind === 'unavailable') {
      return {
        ...definition,
        lifecycleLabel: 'Status unavailable',
        availability: 'unknown',
        blocker: 'Lifecycle status is temporarily unavailable.',
        continuation: edit,
      }
    }
    return {
      ...definition,
      lifecycleLabel: 'Updating',
      availability: 'unknown',
      blocker: 'Supply facts are still catching up.',
      continuation: edit,
      lifecyclePending: true,
    }
  }
  if (supply.revision !== definition.currentRevision) {
    return {
      ...definition,
      lifecycleLabel: 'Updating',
      availability: 'unknown',
      blocker: 'The published lifecycle is for an earlier revision.',
      continuation: edit,
      lifecyclePending: true,
    }
  }

  const continuation = supply.continuation
  if (definition.status === 'retired' || supply.publicationState === 'superseded') {
    return projected(definition, 'Retired', 'unavailable', continuation)
  }
  if (supply.publicationState === 'incompatible' || supply.lifecycleState === 'incompatible') {
    return projected(definition, 'Incompatible', 'unavailable', continuation, 'This Operation no longer matches its published contract.')
  }
  if (supply.publicationState === 'withdrawn' || supply.lifecycleState === 'withdrawn') {
    return projected(definition, 'Withdrawn', 'unavailable', continuation, 'This Operation is withdrawn from the market.')
  }
  if (definition.status === 'paused') {
    return projected(definition, 'Paused', 'unavailable', continuation, 'This Operation is paused.')
  }
  if (definition.status === 'draft' || supply.currentStep === 'describe') {
    return projected(definition, 'Draft', 'unavailable', continuation, 'Finish describing this Operation.')
  }
  if (isAuthorityOrCredentialFailure(supply)) {
    return projected(definition, 'Connection needs attention', 'unavailable', continuation, 'Provider authority or credentials need attention.')
  }
  if (supply.currentStep === 'admission') {
    return projected(definition, 'Setup required', 'unavailable', continuation, 'Connect and admit a provider source.')
  }
  if (supply.readinessState === 'not_started') {
    return projected(definition, 'Readiness not started', 'unknown', continuation, 'Readiness has not been checked.')
  }
  if (supply.readinessState === 'in_progress') {
    return projected(definition, 'Checking readiness', 'unknown', continuation)
  }
  if (
    supply.readinessState === 'refused'
    || supply.readinessState === 'stale'
    || (!supply.liveAvailable && supply.liveReason !== undefined)
  ) {
    return projected(definition, 'Not ready', 'unavailable', continuation, 'Readiness must be restored before this Operation is available.')
  }
  if (
    definition.status === 'published'
    && supply.publicationState === 'current'
    && supply.lifecycleState === 'active'
    && supply.readinessOutcome === 'healthy'
    && supply.liveAvailable
  ) {
    return projected(definition, 'Published', 'available', continuation)
  }
  return projected(definition, 'Status unavailable', 'unknown', edit, 'AE could not confirm the current lifecycle state.')
}

function projected(
  row: OwnerOperationsInventoryRow,
  lifecycleLabel: string,
  availability: OwnerOperationAvailability,
  continuation: SupplierContinuation,
  blocker?: string,
): OwnerOperationsProjectionRow {
  return { ...row, lifecycleLabel, availability, continuation, ...(blocker === undefined ? {} : { blocker }) }
}

function isAuthorityOrCredentialFailure(row: OwnerOperationsLifecycleRow): boolean {
  return row.actionableReason === 'authority_stale'
    || row.actionableReason === 'credential_unavailable'
    || row.actionableReason === 'credential_rejected'
    || row.readinessOutcome === 'credential_unavailable'
    || row.readinessOutcome === 'credential_rejected'
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
