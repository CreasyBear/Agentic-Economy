import type { ActionTimingSink } from '@/modules/common/action'
import { currentRequestCorrelationId } from '@/lib/server/request-correlation'

export type GatewayPricingClass = 'free' | 'paid' | 'unknown'
export type GatewayOutcome =
  | 'completed'
  | 'pending'
  | 'needs_authority'
  | 'refused'
  | 'failed'
  | 'unknown'
  | 'reconciliation_required'
  | 'cancelled'
  | 'reconciled'
export type GatewayApprovalState = 'none' | 'explicit' | 'mandate' | 'required'

export type GatewayTelemetryEvent = Readonly<{
  correlationId?: string
  credentialId?: string
  principalId?: string
  applicationRef?: string
  invocationRef?: string
  operationRef?: string
  pricing?: GatewayPricingClass
  costUnits?: string
  durationMs: number
  outcome: GatewayOutcome
  refusalCode?: string
  retryable?: boolean
  unknown?: boolean
  approval?: GatewayApprovalState
  rateLimited?: boolean
  concurrencyLimited?: boolean
}>


const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const COST_UNITS_PATTERN = /^\d+(?:\.\d{0,18})?$/u
const MAX_COST_UNITS_LENGTH = 96
const MAX_DURATION_MS = 86_400_000

/**
 * Extend the existing bounded action timing sink with gateway dimensions.
 * Only allowlisted scalar fields are emitted; input/output/provider content is
 * never accepted by this projection and no new telemetry store is introduced.
 */
export function recordGatewayTelemetry(
  sink: ActionTimingSink | undefined,
  event: GatewayTelemetryEvent,
): void {
  if (sink === undefined) return
  const correlationId = event.correlationId ?? currentRequestCorrelationId()
  const durationMs = Number.isFinite(event.durationMs)
    ? Math.min(MAX_DURATION_MS, Math.max(0, Math.round(event.durationMs)))
    : 0
  const metadata: Record<string, string | number | boolean | null> = {
    count: 1,
    durationMs,
    outcome: event.outcome,
    ...(correlationId !== undefined && IDENTIFIER_PATTERN.test(correlationId) ? { correlationId } : {}),
    ...(event.credentialId !== undefined && IDENTIFIER_PATTERN.test(event.credentialId)
      ? { credentialId: event.credentialId }
      : {}),
    ...(event.principalId !== undefined && IDENTIFIER_PATTERN.test(event.principalId)
      ? { principalId: event.principalId }
      : {}),
    ...(event.applicationRef !== undefined && IDENTIFIER_PATTERN.test(event.applicationRef)
      ? { applicationRef: event.applicationRef }
      : {}),
    ...(event.invocationRef !== undefined && IDENTIFIER_PATTERN.test(event.invocationRef)
      ? { invocationRef: event.invocationRef }
      : {}),
    ...(event.operationRef !== undefined && IDENTIFIER_PATTERN.test(event.operationRef)
      ? { operationRef: event.operationRef }
      : {}),
    ...(event.pricing === undefined ? {} : { pricing: event.pricing }),
    ...(event.costUnits !== undefined && COST_UNITS_PATTERN.test(event.costUnits) && event.costUnits.length <= MAX_COST_UNITS_LENGTH
      ? { costUnits: event.costUnits }
      : {}),
    ...(event.refusalCode !== undefined && IDENTIFIER_PATTERN.test(event.refusalCode)
      ? { refusalCode: event.refusalCode }
      : {}),
    ...(event.retryable === undefined ? {} : { retryable: event.retryable }),
    ...(event.unknown === undefined ? {} : { unknown: event.unknown }),
    ...(event.approval === undefined ? {} : { approval: event.approval }),
    ...(event.rateLimited === undefined ? {} : { rateLimited: event.rateLimited }),
    ...(event.concurrencyLimited === undefined ? {} : { concurrencyLimited: event.concurrencyLimited }),
  }
  sink.record('gateway.operation', durationMs, metadata)
}
