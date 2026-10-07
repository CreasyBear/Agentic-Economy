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
