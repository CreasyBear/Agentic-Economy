import { validateJourneyNext } from '@/modules/actions/contract'
import type { ContinuationOptions } from './continuation-command'
import { cliContinuation } from './continuation-command'

/** Derive runnable local instructions only from origin-validated journey actions. */
export function journeyNextCommand(candidate: unknown, options: ContinuationOptions): string | undefined {
  const next = validateJourneyNext([candidate], { origin: options.baseUrl })[0]
  if (next === undefined) return undefined
  switch (next.action) {
    case 'status': return cliContinuation(options, ['ae', 'status', next.args.ref.ref])
    case 'wait': return cliContinuation(options, ['ae', 'wait', next.args.callRef])
    case 'fund': return cliContinuation(options, ['ae', 'fund'])
    case 'describe': return cliContinuation(options, ['ae', 'describe', next.args.toolRef])
    case 'connect': return next.args.via === 'cli' ? cliContinuation(options, ['ae', 'connect']) : undefined
    default: return undefined
  }
}
