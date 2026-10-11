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

const FUNDING_REFUSAL_PATTERN = /^(insufficient_|funding_|balance_|credit_)/

/** Fallback when a refusal carries no validated `next`: funding codes go to fund, the rest to Call status. */
export function refusalNextCommand(code: string, callRef: string | undefined, options: ContinuationOptions): string | undefined {
  if (FUNDING_REFUSAL_PATTERN.test(code)) return cliContinuation(options, ['ae', 'fund'])
  return callRef === undefined || callRef.length === 0 ? undefined : cliContinuation(options, ['ae', 'status', callRef])
}
