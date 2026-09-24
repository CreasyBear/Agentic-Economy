import { v, type Validator } from 'convex/values'
import type { JsonValue } from '@/modules/capability-contract/public'

export const CONSEQUENCE_OPERATIONS = [
  'capabilityCalls:cancelBeforeClaim',
  'capabilityCalls:claimAutomaticReconciliationCandidate',
  'capabilityCalls:finishAutomaticReconciliation',
  'capabilityCallX402AuthorizationExpiry:queueExpiredX402Authorization',
  'capabilitySupply:recordCapabilityProbeResult',
  'facilitatorDiscovery:reconcile',
  'moneyTreasury:recordObservation',
  'moneyX402PaymentAttempts:reconcileX402PaymentAttempt',
] as const
export type ConsequenceOperation = typeof CONSEQUENCE_OPERATIONS[number]

export const consequenceOperationValue = v.union(...CONSEQUENCE_OPERATIONS.map((operation) => v.literal(operation)))

export const consequenceJsonScalarValue: Validator<null | boolean | number | string> = v.union(
  v.null(),
  v.boolean(),
  v.number(),
  v.string(),
)

export function consequenceJsonValueAtDepth(depth: number): Validator<JsonValue, 'required', string> {
  if (depth === 0) return consequenceJsonScalarValue
  const child = consequenceJsonValueAtDepth(depth - 1)
  return v.union(
    consequenceJsonScalarValue,
    v.array(child),
    v.record(v.string(), child),
  )
}

// Consequence operations retain their own exact registered-function validators.
// This shared boundary additionally rejects non-JSON payload/result shapes and
// caps nesting before dispatching through the declared operation switch below.
export const consequenceJsonValue = consequenceJsonValueAtDepth(12)
export const consequencePayloadValue = v.record(v.string(), consequenceJsonValue)

