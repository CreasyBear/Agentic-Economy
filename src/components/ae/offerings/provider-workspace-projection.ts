import type {
  ProviderWorkspaceInventoryResult,
  ProviderWorkspaceInventoryRow,
  ProviderWorkspaceLifecycleResult,
  ProviderWorkspaceLifecycleRow,
} from './provider-workspace.functions'
import {
  providerToolReasonPresentation,
} from '@/modules/capability-supply/provider-tool-status'
import type { OwnerOfferingSummary } from './AeOwnerOfferings'
import type { OfferingRef } from '@/modules/common/ids'

export type OwnerToolAvailability = 'available' | 'unavailable' | 'unknown'

export type ProviderWorkspaceProjectionRow = ProviderWorkspaceInventoryRow & Readonly<{
  lifecycleLabel: string
  availability: OwnerToolAvailability
  blocker?: string
  continuation: Readonly<{ kind: 'navigate'; label: string; href: string }>
  lifecyclePending?: boolean
}>

export type ProviderWorkspaceProjection =
  | Readonly<{
      kind: 'available'
      rows: readonly ProviderWorkspaceProjectionRow[]
      attentionCount: number
      firstBlocker?: string
      inconsistencyCount: number
    }>
  | Readonly<{
      kind: 'conflict'
      reason: 'duplicate_definition' | 'duplicate_supply' | 'multiple_providers' | 'business_mismatch'
    }>

export function projectProviderWorkspace(
  inventory: Extract<ProviderWorkspaceInventoryResult, { kind: 'available' }>,
  lifecycle: ProviderWorkspaceLifecycleResult,
): ProviderWorkspaceProjection {
  if (hasDuplicate(inventory.tools, (row) => row.offeringRef)) {
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
  const rows = inventory.tools.map((row) => projectRow(row, statusByOffering.get(row.offeringRef), lifecycle.kind))
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
  definition: ProviderWorkspaceInventoryRow,
  lifecycle: ProviderWorkspaceLifecycleRow | undefined,
  lifecycleKind: ProviderWorkspaceLifecycleResult['kind'],
): ProviderWorkspaceProjectionRow {
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
        : 'The canonical Tool status is still catching up.',
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
      blocker: 'The canonical status belongs to an earlier Tool revision.',
      continuation: detail,
      lifecyclePending: true,
    }
  }
  const firstReason = status.reasonCodes[0]
  const blocker = firstReason === undefined
    ? undefined
    : providerToolReasonPresentation(firstReason).description
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

export function toOfferingSummary(row: ProviderWorkspaceProjectionRow): OwnerOfferingSummary {
  return {
    offering: {
      offeringRef: row.offeringRef as OfferingRef,
      revision: row.currentRevision,
      name: row.name,
      category: row.category,
      summary: row.summary,
    },
    status: row.status,
    accessPathCount: row.accessPathCount,
    lifecycleLabel: row.lifecycleLabel,
    availability: row.availability,
    ...(row.blocker === undefined ? {} : { blocker: row.blocker }),
    continuation: row.continuation,
    ...(row.lifecyclePending === undefined ? {} : { lifecyclePending: row.lifecyclePending }),
  }
}

export function offboardingBlocker(code: string): string {
  if (code === 'calls_remain') return 'Outstanding Calls must finish or be reconciled.'
  if (code === 'obligations_remain') return 'Provider obligations must be resolved.'
  if (code === 'payout_resolution_required') return 'A payout requires attention before retirement can finish.'
  if (code === 'connections_remain' || code === 'provider_cleanup_pending') return 'Provider connection cleanup must be confirmed.'
  if (code === 'routeable_tools_remain') return 'One or more Tools are still accepting new work.'
  if (code === 'retention_policy_unbound') return 'The retained-record policy must be confirmed.'
  return 'AE could not prove the next retirement gate. Review current Tools and try again.'
}

export function offboardingError(reason: string): string {
  if (reason === 'retention_policy_unavailable') return 'The retained-record policy is not configured. No Provider state changed.'
  if (reason === 'offboarding_already_active') return 'Provider offboarding is already active. Reload its current status.'
  if (reason === 'revision_conflict') return 'The offboarding case changed. Reload its current status before resuming.'
  if (reason === 'routeability_freeze_accepted') return 'New work is already frozen. Offboarding can now be resumed or corrected, but not cancelled.'
  if (reason === 'authorization_denied') return 'Sign in again and complete the required verification. No Provider state changed.'
  return 'AE could not confirm Provider offboarding. Reload status before trying again.'
}

export function providerIdentityError(code: string): string {
  if (code === 'slug_taken') return 'That provider name is already in use. Choose a more specific name.'
  if (code === 'multiple_businesses') return 'This account has more than one provider identity. Resolve that conflict before continuing.'
  if (code === 'unauthenticated') return 'Sign in again before creating a provider workspace.'
  if (code === 'invalid_business') return 'Check the provider name and HTTPS website.'
  return 'The provider workspace could not be created. Try again.'
}

/** Moves keyboard/scroll focus onto a section's heading, so async panels reveal themselves accessibly. */
export function focusSection(id: string): void {
  const section = document.getElementById(id)
  const target = section?.querySelector<HTMLElement>('h2') ?? section
  if (target === null || target === undefined) return
  target.setAttribute('tabindex', '-1')
  target.scrollIntoView({ block: 'start' })
  target.focus()
}
