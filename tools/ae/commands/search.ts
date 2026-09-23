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
    // The shared search input schema bounds the phrase without naming a code,
    // so this reuses the source-owned token the catalogue already emits for a
    // rejected query instead of inventing a length-specific one.
    throw new CliFailure('Search requires a capability phrase from 1 to 256 characters.', {
      kind: 'INVALID_ARGUMENT',
      code: 'query_invalid',
    })
  }

  const input = {
    query,
    ...(options.source === undefined ? {} : { source: options.source }),
    ...(options.technical ? { detail: 'full' } : {}),
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
      reason: result.reason === 'capacity_exceeded' ? 'source_capacity_exceeded' : 'source_unavailable',
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
  const nextPage = result.next.find(action => action.action === 'next-page')
  const nextPageCommand = nextPage?.action === 'next-page'
    ? continuationCommand([
        'ae', 'search', nextPage.args.query,
        ...(options.limit === undefined ? [] : ['--limit', options.limit]),
        ...sourceContinuation,
        ...filtersContinuation,
        '--cursor', nextPage.args.cursor,
        ...originContinuation,
        ...outputContinuation,
        ...technicalContinuation,
      ])
    : undefined
  if (options.json) {
    printJson({ ...result, ...(nextPageCommand === undefined ? {} : { nextPageCommand }) })
    return
  }
  heading(`Market Tools for "${result.query}" (${outcome.durationMs}ms)`)
  if (result.kind === 'noMatch') {
    line(`  No suitable Tools on this ${result.scope === 'page' ? 'page' : 'search'}.`)
    if (result.partialResults) line('  Supply coverage is incomplete.')
    for (const tool of result.nearMisses) line(`  Near miss: ${tool.title} (${tool.toolRef})`)
    if (nextPageCommand !== undefined) line(`  More results: ${nextPageCommand}`)
    return
  }
  if (result.kind === 'degraded') line(`  Unverified matches: ${result.reason}`)
  else line(`  ${result.recommendation.text}`)
  for (const [index, tool] of result.results.entries()) {
    line(`  ${index + 1}. ${tool.title}`)
    line(`     ref: ${tool.toolRef}`)
    line(`     ${tool.readiness} · ${tool.price.label}`)
  }
  if (nextPageCommand !== undefined) line(`  More results: ${nextPageCommand}`)
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
