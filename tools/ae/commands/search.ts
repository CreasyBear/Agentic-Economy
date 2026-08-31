import {
  operationSearchInputSchema,
} from '@/modules/capability-supply/public'
import { operationChoiceSearchOutputSchema } from '@/modules/registry/operation-choice-contracts'
import { OPERATION_MARKET_SEARCH_PATH } from '@/modules/registry/operation-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { continuationCommand } from '../lib/continuation-command'
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
  const originContinuation = options.baseUrlSource === undefined || options.baseUrlSource === 'hosted_default'
    ? []
    : ['--base-url', options.baseUrl]
  const outputContinuation = options.json ? ['--json'] : []
  const technicalContinuation = options.technical ? ['--technical'] : []
  const filtersContinuation = options.filters === undefined
    ? []
    : ['--filters', JSON.stringify(parsedInput.data.filters)]
  const nextPageCommand = result.kind === 'ok' && result.pagination.hasMore && result.pagination.nextCursor !== undefined
    ? continuationCommand([
        'ae', 'search', result.query,
        ...(options.limit === undefined ? [] : ['--limit', options.limit]),
        ...filtersContinuation,
        '--cursor', result.pagination.nextCursor,
        ...originContinuation,
        ...outputContinuation,
        ...technicalContinuation,
      ])
    : undefined
  const nextActionCommand = result.kind === 'ok' && result.items.length > 0
    ? result.items.length === 1
      ? continuationCommand([
          'ae', 'inspect', result.items[0]?.operationRef,
          ...originContinuation,
          ...outputContinuation,
          ...technicalContinuation,
        ])
      : continuationCommand([
          'ae', 'compare', ...result.items.slice(0, 4).map(({ operationRef }) => operationRef),
          ...originContinuation,
          ...outputContinuation,
          ...technicalContinuation,
        ])
    : undefined
  const browseCommand = continuationCommand([
    'ae', 'search',
    ...(options.limit === undefined ? [] : ['--limit', options.limit]),
    ...originContinuation,
    ...outputContinuation,
    ...technicalContinuation,
  ])
  const hasSearchFilters = options.filters !== undefined
  const requestCommand = result.kind === 'no_candidates' && result.query.length > 0 && !hasSearchFilters
    ? continuationCommand([
        'ae', 'request', 'create', result.query,
        ...originContinuation,
        ...outputContinuation,
      ])
    : undefined
  const broadenSearchCommand = result.kind === 'no_candidates' && result.query.length > 0 && hasSearchFilters
    ? continuationCommand([
        'ae', 'search',
        ...(options.limit === undefined ? [] : ['--limit', options.limit]),
        ...filtersContinuation,
        ...originContinuation,
        ...outputContinuation,
        ...technicalContinuation,
      ])
    : undefined
  const nextHref = result.kind === 'no_candidates'
    ? new URL('/market', options.baseUrl).toString()
    : undefined
  if (options.json) {
    const jsonResult = result.kind !== 'ok' || options.technical
      ? result
      : {
          ...result,
          items: result.items.map(({ navigation: _navigation, ...item }) => item),
        }
    printJson({
      ...jsonResult,
      ...(nextActionCommand === undefined && requestCommand === undefined && broadenSearchCommand === undefined
        ? {}
        : { nextCommand: requestCommand ?? broadenSearchCommand ?? nextActionCommand }),
      ...(nextPageCommand === undefined ? {} : { nextPageCommand }),
      ...(result.kind === 'no_candidates' ? { browseCommand } : {}),
      ...(nextHref === undefined ? {} : { nextHref }),
    })
    return
  }

  heading(result.query.length === 0
    ? `Current Market Operations (${outcome.durationMs}ms)`
    : `Market Operations for "${result.query}" (${outcome.durationMs}ms)`)
  if (result.kind === 'no_candidates') {
    line(hasSearchFilters
      ? '  No current Operations match these filters.'
      : '  No current Operations match this job.')
    if (requestCommand !== undefined) line(`  Remember this missing job: ${requestCommand}`)
    if (broadenSearchCommand !== undefined) line(`  Browse matching filters: ${broadenSearchCommand}`)
    line(`  Browse all: ${browseCommand}`)
    line(`  Browser: ${nextHref}`)
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
  if (nextActionCommand !== undefined) line(`  Next: ${nextActionCommand}`)
  line(result.pagination.hasMore
    ? `  More results: ${nextPageCommand ?? 'ae search --cursor <cursor>'}`
    : '  End of results.')
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
  outputSchema: operationChoiceSearchOutputSchema,
  run: runSearchCommand,
} as const
