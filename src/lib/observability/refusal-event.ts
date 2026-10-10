import { canonicalDigest } from '@/modules/common/canonical-digest'
import { captureServerEvent } from './posthog.server'

/** Stable, bounded identifier shape shared with the gateway telemetry projection. */
export const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u

const STAGES = new Set(['pre_admission', 'execution', 'recovery'])
const OUTCOMES = new Set(['completed', 'pending', 'needs_authority', 'refused', 'failed', 'unknown', 'reconciliation_required', 'cancelled', 'reconciled'])
const RESULT_KINDS = new Set(['match', 'scoped', 'noMatch', 'unavailable'])

type Scalar = string | number | boolean | null

function bounded(value: string | undefined, allowed: Set<string>): string | undefined {
  return value !== undefined && allowed.has(value) ? value : undefined
}

function count(value: number): number | undefined {
  return Number.isInteger(value) && value >= 0 && value <= 1_000_000 ? value : undefined
}

function drop(properties: Record<string, Scalar | undefined>): Record<string, Scalar> {
  return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined)) as Record<string, Scalar>
}

/** Stable distinct id: a digest of the principal, never a raw or per-request id. Unauthenticated
 * events share one 'anonymous' id, so they are event counts, not user counts. */
function distinctId(actor: string | undefined): string {
  return canonicalDigest({ format: 'ae.refusal:v1', value: actor ?? 'anonymous' })
}

/** Server-side wall or refusal. Bounded scalars only; every failure is silent. */
export function recordRefusal(input: {
  surface: 'http' | 'mcp'
  code: string
  operation?: string | undefined
  stage?: string | undefined
  retryable?: boolean | undefined
  outcome?: string | undefined
  actor?: string | undefined
}): void {
  try {
    if (!IDENTIFIER_PATTERN.test(input.code)) return
    captureServerEvent(distinctId(input.actor), 'ae_refusal', drop({
      surface: input.surface,
      code: input.code,
      operation: input.operation !== undefined && IDENTIFIER_PATTERN.test(input.operation) ? input.operation : undefined,
      stage: bounded(input.stage, STAGES),
      retryable: input.retryable,
      outcome: bounded(input.outcome, OUTCOMES),
      $process_person_profile: false,
    }))
  } catch {
    /* Diagnostics must never alter refusal responses. */
  }
}

/** Search outcome for the MCP market read. Counts only; no query or result content. Unique-user
 * math holds for authenticated searches; anonymous searches count as events only. */
export function recordSearchOutcome(input: {
  surface: 'mcp'
  actor?: string | undefined
  resultKind: string
  resultCount: number
  callableCount: number
  externalListingCount: number
}): void {
  try {
    const resultKind = bounded(input.resultKind, RESULT_KINDS)
    const resultCount = count(input.resultCount)
    const callableCount = count(input.callableCount)
    const externalListingCount = count(input.externalListingCount)
    if (resultKind === undefined || resultCount === undefined || callableCount === undefined || externalListingCount === undefined) return
    captureServerEvent(distinctId(input.actor), 'ae_search_outcome', {
      surface: input.surface,
      resultKind,
      resultCount,
      callableCount,
      externalListingCount,
      zeroCallable: resultCount > 0 && callableCount === 0,
      $process_person_profile: false,
    })
  } catch {
    /* Diagnostics must never alter search responses. */
  }
}
