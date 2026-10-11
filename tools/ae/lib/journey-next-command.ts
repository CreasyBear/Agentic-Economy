import { validateJourneyNext } from '@/modules/actions/contract'
import type { ContinuationOptions } from './continuation-command'
import { cliContinuation } from './continuation-command'

/** Derive runnable local instructions only from origin-validated journey actions. */
export function journeyNextCommand(candidate: unknown, options: ContinuationOptions): string | undefined {
  const next = validateJourneyNext([candidate], { origin: options.baseUrl })[0]
  if (next === undefined) return undefined
  switch (next.action) {
    case 'journey.status': return cliContinuation(options, ['ae', 'status', next.args.ref.ref])
    case 'call.status': return cliContinuation(options, ['ae', 'status', next.args.callRef])
    case 'registry.tools.describe': return cliContinuation(options, ['ae', 'describe', next.args.toolRef])
    default: return undefined
  }
}

const FUND_REFUSAL_PATTERN = /^(insufficient_|funding_amount_out_of_range$)/
/** A top-up is already in flight or unresolved: starting another risks double funding. */
const FUNDING_WAIT_PATTERN = /^(funding_pending|funding_outcome_unknown|credit_topup_pending|credit_topup_outcome_unknown|credit_restoration_pending)$/

/** Fallback when a refusal carries no validated `next`: shortfall codes go to fund, in-flight funding to account, the rest to Call status. */
export function refusalNextCommand(code: string, callRef: string | undefined, options: ContinuationOptions): string | undefined {
  if (FUNDING_WAIT_PATTERN.test(code)) return cliContinuation(options, ['ae', 'account'])
  if (FUND_REFUSAL_PATTERN.test(code)) return cliContinuation(options, ['ae', 'fund'])
  return callRef === undefined || callRef.length === 0 ? undefined : cliContinuation(options, ['ae', 'status', callRef])
}
