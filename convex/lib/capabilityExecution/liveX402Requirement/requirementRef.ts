import { makeFunctionReference } from 'convex/server'
import { degradeBackend } from '@/lib/observability/degrade-backend'

import type { JsonValue } from '@/modules/common/bounded-json'
import type { LiveX402Requirement } from '@/modules/capability-execution/live-x402-requirement'
import type { CallPrincipal } from '../callLifecycle/contracts'

export type LiveX402RequirementActionResult =
  | Readonly<{ kind: 'operation_not_found' }>
  | Readonly<{ kind: 'operation_unsupported' }>
  | Readonly<{ kind: 'not_required' }>
  | Readonly<{ kind: 'observed'; requirement: LiveX402Requirement }>
  | Readonly<{ kind: 'refused'; reason: string }>

export const inspectLiveX402RequirementRef = makeFunctionReference<
  'action',
  { toolRef: string; input: Record<string, JsonValue>; principal: CallPrincipal; callRef?: string; planNode?: { planRef: string; nodeId: string } },
  LiveX402RequirementActionResult
>('capabilityCallLiveX402:inspect')

export const bindPersistedManagedX402RequirementRef = makeFunctionReference<
  'action',
  { toolRef: string; input: Record<string, JsonValue> },
  LiveX402RequirementActionResult
>('capabilityCallLiveX402:bindPersistedManagedRequirement')

/** Names how a live requirement drifted from the quoted one; undefined when not price or payee. */
export function liveX402RequirementDrift(
  quotedJson: string,
  liveJson: string,
): 'price_changed' | 'payee_changed' | undefined {
  try {
    const quoted = (JSON.parse(quotedJson) as { requirement?: { amountUnits?: unknown; payTo?: unknown } }).requirement
    const live = (JSON.parse(liveJson) as { requirement?: { amountUnits?: unknown; payTo?: unknown } }).requirement
    if (quoted === undefined || live === undefined) return undefined
    if (quoted.payTo !== live.payTo) return 'payee_changed'
    if (quoted.amountUnits !== live.amountUnits) return 'price_changed'
    return undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'liveX402RequirementDrift', reason: 'invalid_response' })
  }
}
