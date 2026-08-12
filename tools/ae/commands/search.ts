import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { operationSearchInputSchema } from '@/modules/capability-supply/public'
import { OPERATION_MARKET_SEARCH_PATH } from '@/modules/registry/operation-entry'

/** Search current public Market Operations without a caller credential. */
export async function runSearchCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const query = args.join(' ').trim()
  if (query.length === 0) {
    throw new CliFailure('Usage: npm run -s ae -- search "<job>"', {
      kind: 'INVALID_ARGUMENT',
      code: 'search-usage',
    })
  }
  if (!operationSearchInputSchema.safeParse({ query }).success) {
    throw new CliFailure('Search query must be 200 characters or fewer.', {
      kind: 'INVALID_ARGUMENT',
      code: 'search-query-too-long',
    })
  }

  const path = OPERATION_MARKET_SEARCH_PATH
  const outcome = await callJson(options.baseUrl, path, {
    method: 'POST',
    body: JSON.stringify({ query }),
  })
  const body = requireOk(outcome, path)

  if (options.json) {
    printJson(body)
    return
  }

  heading(`Market Operations for "${query}" (${outcome.durationMs}ms)`)
  if (body !== undefined) line(JSON.stringify(body, undefined, 2))
}
