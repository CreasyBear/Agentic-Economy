import { toolCatalogSearchInputSchema, toolChoiceSearchOutputSchema, type RegistryNextAction } from '@/modules/registry/tool-choice-contracts'
import { TOOL_MARKET_SEARCH_PATH } from '@/modules/registry/tool-entry'
import { SEARCH_QUERY_MAX_LENGTH } from '@/modules/common/search-query'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { continuationCommand } from '../lib/continuation-command'
/** Search current public Market Tools without a caller credential. */
export async function runSearchCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const query = args.join(' ').trim()
  if (!searchCommandDescriptor.inputSchema.safeParse({ query }).success) {
    // The shared search input schema bounds the phrase without naming a code,
    // so this reuses the source-owned token the catalogue already emits for a
    // rejected query instead of inventing a length-specific one.
    throw new CliFailure(`Search requires a capability phrase from 1 to ${SEARCH_QUERY_MAX_LENGTH} characters.`, {
      kind: 'INVALID_ARGUMENT',
      code: 'query_invalid',
    })
  }
  if (options.technical) {
    throw new CliFailure('Search returns compact results. Run ae describe <ToolRef> to inspect full Tool metadata.', {
      kind: 'INVALID_ARGUMENT',
      code: 'search-technical-unsupported',
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
  const originContinuation = options.baseUrlSource === undefined || options.baseUrlSource === 'hosted_default'
    ? []
    : ['--base-url', options.baseUrl]
  const outputContinuation = options.json ? ['--json'] : []
  const filtersContinuation = parsedInput.data.filters === undefined
    ? []
    : ['--filters', JSON.stringify(parsedInput.data.filters)]
  const sourceContinuation = parsedInput.data.source === undefined ? [] : ['--source', parsedInput.data.source]
  const limitContinuation = options.limit === undefined ? [] : ['--limit', String(parsedInput.data.limit)]
  const commonFlags = [...originContinuation, ...outputContinuation]
  const commandFor = (next: RegistryNextAction): string => {
    switch (next.action) {
      case 'describe':
        return continuationCommand(['ae', 'describe', next.args.toolRef, ...originContinuation, ...outputContinuation])
      case 'describe-external': {
        const detail = new URL('/api/v1/registry/detail', options.baseUrl)
        detail.searchParams.set('id', next.args.id)
        return continuationCommand(['curl', '--fail', detail.toString()])
      }
      case 'next-page':
        return continuationCommand([
          'ae', 'search', next.args.query, ...limitContinuation, ...sourceContinuation,
          ...filtersContinuation, '--cursor', next.args.cursor, ...commonFlags,
        ])
      case 'broaden':
        return continuationCommand(['ae', 'search', next.args.query, ...limitContinuation, ...commonFlags])
      case 'retry':
        return continuationCommand([
          'ae', 'search', next.args.query, ...limitContinuation, ...sourceContinuation,
          ...filtersContinuation, ...(parsedInput.data.cursor === undefined ? [] : ['--cursor', parsedInput.data.cursor]),
          ...commonFlags,
        ])
    }
  }
  const nextPage = result.next.find(action => action.action === 'next-page')
  const nextPageCommand = nextPage === undefined ? undefined : commandFor(nextPage)
  if (options.json) {
    printJson({ ...result, ...(nextPageCommand === undefined ? {} : { nextPageCommand }) })
    return
  }
  heading(`Market Tools for "${result.query}" (${outcome.durationMs}ms)`)
  if (result.recipient !== undefined) line(`  Ranking: ${result.recipient.label} (${result.recipient.host}) receives ${result.recipient.data}.`)
  line(`  ${result.kind} · scope: ${result.assessed.source}/${result.assessed.scope} · ${result.assessed.coverage} coverage (${result.assessed.examined} examined)`)
  if (result.kind === 'noMatch') line('  No suitable Tools found in the assessed sources.')
  if (result.kind === 'scoped') line('  Only assessed supply is shown; more Tools may exist.')
  if (result.kind === 'unavailable') line(`  Search unavailable: ${result.reason}`)
  for (const [index, tool] of result.results.entries()) {
    const accessLabel = {
      ae_callable: 'AE callable',
      setup_required: 'Connect to call',
      unavailable: 'Unavailable',
      external_listing: 'External listing (not AE callable)',
    }[tool.access]
    line(`  ${index + 1}. ${tool.title} · ${accessLabel}`)
    line(`     ref: ${tool.toolRef ?? tool.detailRef}`)
    line(`     ${tool.readiness} · ${tool.price.kind === 'indicative' ? tool.price.label : 'Price unavailable'}`)
    for (const action of tool.next) {
      line(`     ${action.action} ${JSON.stringify(action.args)} · ${commandFor(action)}`)
    }
  }
  for (const action of result.next) {
    line(`  Next: ${action.action} ${JSON.stringify(action.args)} · ${commandFor(action)}`)
  }
}

function parseSearchLimit(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    throw new CliFailure('Search limit must be an integer from 1 to 12.', {
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
