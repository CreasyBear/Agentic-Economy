import { degradeBackend } from '@/lib/observability/degrade-backend'
import { executeDecisionGateway } from '@/modules/decision-engine/public'
import type { RouteTransportObservation } from '@/modules/capability-supply/route-transport-runtime'
import type { ContractOutputValidation } from '../../../../convex/capabilityCallProjection'

/**
 * Native System One Output Adjudication Seam.
 * Intercepts raw provider responses in the call worker before financial settlement.
 * Evaluates suspicious error tokens against the calibrated Decision Gateway.
 * If stealth provider failure is detected with high confidence (>=75%), invalidates output
 * so that chargeSettlementOutcome returns 'not_released' and Formance holds are returned to the buyer.
 */
export async function adjudicatePayloadOutput(
  outputValidation: ContractOutputValidation,
  observation: RouteTransportObservation,
  callRef: string,
  toolRef: string,
): Promise<ContractOutputValidation> {
  if (!outputValidation.valid || observation.outputJson === undefined) {
    return outputValidation
  }

  try {
    const raw = observation.outputJson.toLowerCase()
    // Fast path: if no suspicious tokens, output is accepted immediately without AI overhead
    if (
      !raw.includes('error') &&
      !raw.includes('timeout') &&
      !raw.includes('failed') &&
      !raw.includes('etimeout') &&
      !raw.includes('econnreset') &&
      !raw.includes('econnrefused') &&
      !raw.includes('500') &&
      !raw.includes('502') &&
      !raw.includes('503') &&
      !raw.includes('504') &&
      !raw.includes('exception') &&
      !raw.includes('rate limit')
    ) {
      return outputValidation
    }

    let parsedPayload: Record<string, unknown>
    try {
      parsedPayload = JSON.parse(observation.outputJson) as Record<string, unknown>
    } catch {
      parsedPayload = { raw: observation.outputJson }
    }

    const decision = await executeDecisionGateway({
      state: {
        callRef,
        toolRef,
        receivedPayload: parsedPayload,
      },
      questions: {
        isFailure: {
          type: 'noul',
          instructions:
            'Evaluate if the received payload indicates an unhandled upstream failure, error code, timeout, empty dataset, or server fault rather than a successful response.',
        },
        faultParty: {
          type: 'choice',
          instructions: 'Who is responsible for this failure state?',
          criteria: {
            upstream_provider: 'Provider failed with timeout, gateway error, or server exception.',
            buyer_input: 'The buyer supplied invalid or unparseable inputs.',
            none: 'The payload represents a completely healthy and successful delivery.',
          },
        },
      },
    })

    const isFailureAns = decision.answers.isFailure
    const faultAns = decision.answers.faultParty
    const isFailure = isFailureAns?.type === 'noul' && isFailureAns.noul >= 0.70
    const fault = faultAns?.type === 'choice' ? faultAns.choice : 'none'
    const confidence = faultAns?.type === 'choice' ? faultAns.confidence : 0.80

    if (isFailure && fault === 'upstream_provider' && confidence >= 0.75) {
      return { valid: false }
    }
  } catch (cause) {
    degradeBackend(cause, undefined, { site: 'adjudicatePayloadOutput', reason: 'source_unavailable' })
  }

  return outputValidation
}
