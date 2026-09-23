import type { DecisionGatewayOptions, DecisionGatewayUsage, DecisionTier, JevUnavailableError } from './contracts'

/** Provider counters are evidence: absent/invalid differs from an observed zero. */
export function observedInferenceUsage(input: unknown, output: unknown): DecisionGatewayUsage {
  const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
  return { inputTokens: count(input), outputTokens: count(output), estimatedCostAud: null }
}

// Provider model metadata must not admit an arbitrary object/body into logs.
export function observedInferenceModel(value: unknown, fallback: string): Readonly<{ model: string; modelSource: 'provider' | 'requested' }> {
  return typeof value === 'string' && value.length <= 200 && /^[a-zA-Z0-9~_./:-]+$/.test(value) ? { model: value, modelSource: 'provider' } : { model: fallback, modelSource: 'requested' }
}

/** Console is the existing server/Convex log sink. Never accept request state or raw errors. */
export function recordInferenceAttempt(event: Readonly<{
  tier: DecisionTier
  purpose: DecisionGatewayOptions['purpose']
  model: string
  modelSource: 'provider' | 'requested'
  outcome: 'completed' | 'failed'
  reason?: JevUnavailableError['reason'] | 'invalid_request' | 'unexpected'
  outboundAttempts: number
  durationMs: number
  usage: DecisionGatewayUsage
}>): void {
  try {
    console.info('[ae.inference]', JSON.stringify({
      tier: event.tier, purpose: event.purpose ?? 'unspecified', model: event.model, modelSource: event.modelSource,
      outcome: event.outcome, reason: event.reason, outboundAttempts: event.outboundAttempts,
      durationMs: event.durationMs, usage: event.usage,
    }))
  } catch (cause) {
    // Observability cannot turn a usable inference result into a failure.
    void cause
  }
}
