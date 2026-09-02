import { makeFunctionReference } from 'convex/server'

import type { JsonValue } from '@/modules/common/bounded-json'
import type { LiveX402Requirement } from '@/modules/capability-execution/live-x402-requirement'

export type LiveX402RequirementActionResult =
  | Readonly<{ kind: 'operation_not_found' }>
  | Readonly<{ kind: 'operation_unsupported' }>
  | Readonly<{ kind: 'not_required' }>
  | Readonly<{ kind: 'observed'; requirement: LiveX402Requirement }>
  | Readonly<{ kind: 'refused' }>

export const inspectLiveX402RequirementRef = makeFunctionReference<
  'action',
  { operationRef: string; input: Record<string, JsonValue> },
  LiveX402RequirementActionResult
>('capabilityOperationLiveX402:inspect')
