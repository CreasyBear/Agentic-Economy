import {
  operationSearchInputSchema,
  operationSearchOutputSchema,
} from '@/modules/capability-supply/public'
import { OPERATION_MARKET_SEARCH_PATH } from '@/modules/registry/operation-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import {
  formatOperationAuthentication,
  formatOperationAvailability,
  formatOperationInputs,
  formatOperationTotalPrice,
  formatOperationVerification,
  operationLabel,
} from '../lib/operation-format'
import { throwOperationReadFailure } from '../lib/operation-read-failure'
/** Search current public Market Operations without a caller credential. */
export async function runSearchCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const query = args.join(' ').trim()
  if (query.length === 0) {
    throw new CliFailure('Usage: ae search "<job>"', {
      kind: 'INVALID_ARGUMENT',
      code: 'search-usage',
    })
  }
  if (!searchCommandDescriptor.inputSchema.safeParse({ query }).success) {
    throw new CliFailure('Search query must be 200 characters or fewer.', {
      kind: 'INVALID_ARGUMENT',
      code: 'search-query-too-long',
    })
  }

  const input = {
    query,
    ...(options.limit === undefined ? {} : { limit: parseSearchLimit(options.limit) }),
    ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
    ...(options.filters === undefined ? {} : { filters: parseSearchFilters(options.filters) }),
  }
  const parsedInput = searchCommandDescriptor.inputSchema.safeParse(input)
  if (!parsedInput.success) {
    throw new CliFailure('Search options are invalid.', {
      kind: 'INVALID_ARGUMENT',
      code: 'search-input',
    })
  }

  const path = searchCommandDescriptor.path
  const outcome = await callJson(options.baseUrl, path, {
    method: 'POST',
    body: JSON.stringify(parsedInput.data),
  })
  const parsedResult = searchCommandDescriptor.outputSchema.safeParse(requireOk(outcome, path))
  if (!parsedResult.success) {
    throw new CliFailure('The market returned an invalid operation search result.', {
      kind: 'UNAVAILABLE',
      code: 'operation-search-result-invalid',
    })
  }

  const result = parsedResult.data
  if (result.kind === 'unavailable') {
    throwOperationReadFailure({
      reason: result.reason,
      cursorProvided: parsedInput.data.cursor !== undefined,
    })
  }
  if (options.json) {
    printJson(result)
    return
  }

  heading(`Market Operations for "${result.query}" (${outcome.durationMs}ms)`)
  if (result.kind === 'no_candidates') {
    line('  No matching Operations.')
    return
  }

  line(`  ${result.matchedCount} match${result.matchedCount === 1 ? '' : 'es'}`)
  for (const [index, operation] of result.items.entries()) {
    line(`  ${index + 1}. ${operationLabel(operation)}`)
    line(`     ${operation.summary}`)
    line(`     ref: ${operation.operationRef}`)
    line(
      `     ${formatOperationAvailability(operation.availability)} · `
      + `total ${formatOperationTotalPrice(operation)} · `
      + `${formatOperationAuthentication(operation)}`,
    )
    line(`     last verified: ${formatOperationVerification(operation)}`)
    line(`     inputs: ${formatOperationInputs(operation)}`)
  }
  line(
    result.pagination.hasMore
      ? `  More results: rerun with --cursor ${result.pagination.nextCursor ?? '<cursor>'}`
      : '  End of results.',
  )
}

function parseSearchLimit(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
    throw new CliFailure('Search limit must be an integer from 1 to 20.', {
      kind: 'INVALID_ARGUMENT',
      code: 'search-limit-invalid',
    })
  }
  return parsed
}

function parseSearchFilters(value: string | Record<string, unknown>): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new CliFailure('Search filters must be valid JSON.', {
      kind: 'INVALID_ARGUMENT',
      code: 'search-filters-invalid',
    })
  }
}

export const searchCommandDescriptor = {
  command: 'search',
  actionId: 'registry.operations.search',
  path: OPERATION_MARKET_SEARCH_PATH,
  inputSchema: operationSearchInputSchema,
  outputSchema: operationSearchOutputSchema,
  run: runSearchCommand,
} as const
