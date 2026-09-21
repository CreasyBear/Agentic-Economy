import { degradeBackend } from '@/lib/observability/degrade-backend'
import type {
  DecisionGatewayOptions,
  DecisionGatewayRequest,
  DecisionGatewayResponse,
  DecisionTier,
} from './contracts'
import { JevUnavailableError } from './contracts'
import { observedInferenceUsage } from './inference-observation'
import { callDeterministicRuleEngine } from './deterministic-fallback'
import { callJevSystemOne } from './jev-client'
import { callSecondaryLlmAdapter } from './secondary-llm-adapter'

export async function executeDecisionGateway(
  request: DecisionGatewayRequest,
  options: DecisionGatewayOptions = {},
): Promise<DecisionGatewayResponse> {
  const attemptedTiers: DecisionTier[] = []
  const startedAt = Date.now()
  if (options.purpose === 'discovery') return callJevSystemOne(request, options)

  // -------------------------------------------------------------------------
  // TIER 1: TypeSafe AI Jev System One (<350ms)
  // -------------------------------------------------------------------------
  if (options.disableJev !== true) {
    attemptedTiers.push('jev_system_one')
    try {
      const jevResult = await callJevSystemOne(request, options)
      return {
        ...jevResult,
        usage: attemptedTiers.length > 1 ? observedInferenceUsage(null, null) : jevResult.usage,
        durationMs: Date.now() - startedAt,
        attemptedTiers,
      }
    } catch (cause) {
      if (!(cause instanceof JevUnavailableError) || cause.reason === 'cancelled') throw cause
      degradeBackend(cause, undefined, {
        site: 'executeDecisionGateway:jev_system_one',
        reason: cause.reason === 'timeout' ? 'timeout' : 'source_unavailable',
      })
    }
  }

  // -------------------------------------------------------------------------
  // TIER 2: Secondary Structured LLM Adapter (<1200ms)
  // -------------------------------------------------------------------------
  if (options.disableSecondaryLlm !== true) {
    attemptedTiers.push('secondary_llm_adapter')
    try {
      const secondaryResult = await callSecondaryLlmAdapter(request, options)
      return {
        ...secondaryResult,
        usage: attemptedTiers.length > 1 ? observedInferenceUsage(null, null) : secondaryResult.usage,
        durationMs: Date.now() - startedAt,
        attemptedTiers,
      }
    } catch (cause) {
      degradeBackend(cause, undefined, {
        site: 'executeDecisionGateway:secondary_llm_adapter',
        reason: 'invalid_response',
      })
    }
  }

  // -------------------------------------------------------------------------
  // TIER 3: Deterministic Rule Engine (0ms, offline)
  // -------------------------------------------------------------------------
  attemptedTiers.push('deterministic_rule_engine')
  try {
    const deterministicResult = callDeterministicRuleEngine(request)
    return {
      ...deterministicResult,
      usage: attemptedTiers.length > 1 ? observedInferenceUsage(null, null) : deterministicResult.usage,
      durationMs: Date.now() - startedAt,
      attemptedTiers,
    }
  } catch (cause) {
    degradeBackend(cause, undefined, {
      site: 'executeDecisionGateway:deterministic_rule_engine',
      reason: 'invalid_response',
    })
  }

  // -------------------------------------------------------------------------
  // TIER 4: Safe Refusal
  // -------------------------------------------------------------------------
  attemptedTiers.push('safe_refusal')
  return {
    tier: 'safe_refusal',
    model: 'none',
    answers: {},
    usage: observedInferenceUsage(null, null),
    durationMs: Date.now() - startedAt,
    attemptedTiers,
  }
}
