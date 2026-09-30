// Keep the local deadline and abort signal on one budget, as catalog presentation previously did.
import type { DecisionGatewayOptions } from '@/modules/decision-engine/public'
import { env } from '../../_generated/server'

export function jevDecisionOptions(budgetMs: number): DecisionGatewayOptions {
  const deadlineAt = Date.now() + budgetMs
  return {
    deadlineAt,
    signal: AbortSignal.timeout(budgetMs),
    disableJev: env.AE_JEV_DISCOVERY_ENABLED === 'false',
    ...(env.OPENROUTER_API_KEY === undefined ? {} : { openrouterApiKey: env.OPENROUTER_API_KEY }),
  }
}
