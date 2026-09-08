import { toolCatalogSearchInputSchema, toolChoiceSearchOutputSchema } from '@/modules/registry/tool-choice-contracts'
import { TOOL_MARKET_SEARCH_PATH } from '@/modules/registry/tool-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { continuationCommand } from '../lib/continuation-command'
import { throwToolReadFailure } from '../lib/tool-read-failure'
/** Search current public Market Tools without a caller credential. */
export async function runSearchCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const query = args.join(' ').trim()
  if (!searchCommandDescriptor.inputSchema.safeParse({ query }).success) {
    throw new CliFailure('Search requires a capability phrase from 1 to 256 characters.', {
      kind: 'INVALID_ARGUMENT',
      code: 'search-query-too-long',
    })
  }

  const input = {
    query,
    ...(options.source === undefined ? {} : { source: options.source }),
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
    throw new CliFailure('The market returned an invalid tool search result.', {
      kind: 'UNAVAILABLE',
      code: 'tool-search-result-invalid',
    })
  }

  const result = parsedResult.data
  if (result.kind === 'unavailable') {
    throwToolReadFailure({
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
  const sourceContinuation = parsedInput.data.source === undefined ? [] : ['--source', parsedInput.data.source]
  const pagination = result.pagination
  const nextPageCommand = pagination?.hasMore === true && pagination.nextCursor !== undefined
    ? continuationCommand([
        'ae', 'search', result.query,
        ...(options.limit === undefined ? [] : ['--limit', options.limit]),
        ...sourceContinuation,
        ...filtersContinuation,
        '--cursor', pagination.nextCursor,
        ...originContinuation,
        ...outputContinuation,
        ...technicalContinuation,
      ])
    : undefined
  const nextActionCommand = result.kind === 'ok' && result.items.length > 0
    ? result.items.length === 1
      ? continuationCommand([
          'ae', 'describe', result.items[0]?.toolRef,
          ...originContinuation,
          ...outputContinuation,
          ...technicalContinuation,
        ])
      : continuationCommand([
          'ae', 'compare', ...result.items.slice(0, 4).map(({ toolRef }) => toolRef),
          ...originContinuation,
          ...outputContinuation,
          ...technicalContinuation,
        ])
    : undefined
  const browseCommand = continuationCommand([
    'ae', 'list',
    ...sourceContinuation,
    ...(options.limit === undefined ? [] : ['--limit', options.limit]),
    ...originContinuation,
    ...outputContinuation,
    ...technicalContinuation,
  ])
  const hasSearchFilters = options.filters !== undefined
  const exhausted = pagination?.hasMore !== true
  const requestCommand = result.kind === 'no_candidates' && exhausted && result.query.length > 0 && !hasSearchFilters
    ? continuationCommand([
        'ae', 'request', 'create', result.query,
        ...originContinuation,
        ...outputContinuation,
      ])
    : undefined
  const broadenSearchCommand = result.kind === 'no_candidates' && exhausted && result.query.length > 0 && hasSearchFilters
    ? continuationCommand([
        'ae', 'list',
        ...sourceContinuation,
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
    const jsonResult = result
    const nextCommand = result.kind === 'no_candidates'
      ? nextPageCommand ?? requestCommand ?? broadenSearchCommand
      : requestCommand ?? broadenSearchCommand ?? nextActionCommand
    printJson({
      ...jsonResult,
      ...(nextCommand === undefined
        ? {}
        : { nextCommand }),
      ...(nextPageCommand === undefined ? {} : { nextPageCommand }),
      ...(result.kind === 'no_candidates' ? { browseCommand } : {}),
      ...(nextHref === undefined ? {} : { nextHref }),
    })
    return
  }

  heading(`Market Tools for "${result.query}" (${outcome.durationMs}ms)`)
  if (result.kind === 'no_candidates') {
    line(pagination?.hasMore === true
      ? '  No matching Tools on this page.'
      : hasSearchFilters
        ? '  No current Tools match these filters.'
        : '  No current Tools match this job.')
    if (nextPageCommand !== undefined) line(`  More results: ${nextPageCommand}`)
    if (requestCommand !== undefined) line(`  Remember this missing job: ${requestCommand}`)
    if (broadenSearchCommand !== undefined) line(`  Browse matching filters: ${broadenSearchCommand}`)
    line(`  Browse all: ${browseCommand}`)
    line(`  Browser: ${nextHref}`)
    return
  }

  line(`  ${result.count} match${result.count === 1 ? '' : 'es'}`)
  for (const [index, tool] of result.items.entries()) {
    line(`  ${index + 1}. ${tool.provider.name} — ${tool.title}`)
    line(`     ref: ${tool.toolRef}`)
    line(
      `     ${tool.healthStatus} · ${tool.priceLabel}`,
    )
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
  actionId: 'registry.tools.search',
  path: TOOL_MARKET_SEARCH_PATH,
  inputSchema: toolCatalogSearchInputSchema,
  outputSchema: toolChoiceSearchOutputSchema,
  run: runSearchCommand,
} as const
