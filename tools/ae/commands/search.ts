import { randomUUID } from 'node:crypto'

import { toolCatalogSearchInputSchema, toolChoiceSearchOutputSchema, type RegistryNextAction } from '@/modules/registry/tool-choice-contracts'
import { TOOL_MARKET_SEARCH_PATH } from '@/modules/registry/tool-entry'
import { SEARCH_QUERY_MAX_LENGTH } from '@/modules/common/search-query'
import { parseCallableRef } from '@/modules/common/tool-ref'
import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import { formatSearchSignals } from '@/modules/registry/search-signals'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { resolveAgentAccessCredential } from '../lib/config'
import { requireAgentAccessKey } from './status'
import { continuationCommand } from '../lib/continuation-command'
/** Search remains public; a selected exact-origin Agent connection adds a save affordance. */
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
  const selectedCredential = resolveAgentAccessCredential(options.baseUrl)
  const apiKey = selectedCredential === undefined ? undefined : requireAgentAccessKey('search', options)
  const outcome = await callJson(options.baseUrl, path, {
    method: 'POST',
    ...(apiKey === undefined ? {} : { headers: { Authorization: `Bearer ${apiKey}` } }),
    body: JSON.stringify(parsedInput.data),
  })
  const parsedResult = searchCommandDescriptor.outputSchema.safeParse(requireOk(outcome, path))
  if (!parsedResult.success) {
    throw new CliFailure('The market returned an invalid tool search result.', {
      kind: 'UNAVAILABLE',
      code: 'tool-search-result-invalid',
      detail: parsedResult.error.issues.slice(0, 3).map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    })
  }

  const result = parsedResult.data
  const originContinuation = options.baseUrlSource === undefined || options.baseUrlSource === 'hosted_default'
    ? []
    : ['--base-url', options.baseUrl]
  const outputContinuation = options.json ? ['--json'] : []
  const commonFlags = [...originContinuation, ...outputContinuation]
  const searchCommandFor = (next: Extract<RegistryNextAction, { action: 'registry.tools.search' }>): string => {
    const source = next.args.source ?? parsedInput.data.source
    const filters = next.args.filters ?? parsedInput.data.filters
    const limit = next.args.limit ?? parsedInput.data.limit
    const cursor = next.args.cursor
    return continuationCommand([
      'ae', 'search', next.args.query, '--limit', String(limit),
      ...(source === undefined ? [] : ['--source', source]),
      ...(filters === undefined ? [] : ['--filters', JSON.stringify(filters)]),
      ...(cursor === undefined ? [] : ['--cursor', cursor]), ...commonFlags,
    ])
  }
  const commandFor = (next: RegistryNextAction): string => {
    switch (next.action) {
      case 'registry.tools.describe':
        return continuationCommand(['ae', 'describe', next.args.toolRef, ...originContinuation, ...outputContinuation])
      case 'registry.tools.search':
        return searchCommandFor(next)
    }
  }
  const nextPage = result.pagination.hasMore ? result.next.find(action => action.action === 'registry.tools.search' && action.args.cursor !== undefined) : undefined
  const nextPageCommand = nextPage === undefined ? undefined : commandFor(nextPage)
  const saveNeedCommand = result.kind === 'noMatch' && result.saveNeed !== undefined
    ? continuationCommand([
        'ae', 'request', 'create', result.saveNeed.args.query,
        ...(result.saveNeed.args.source === undefined ? [] : ['--source', result.saveNeed.args.source]),
        ...(result.saveNeed.args.filters === undefined ? [] : ['--filters', JSON.stringify(result.saveNeed.args.filters)]),
        '--idempotency-key', options.idempotencyKey ?? randomUUID(), ...commonFlags,
      ])
    : undefined
  if (options.json) {
    printJson({ ...result, ...(nextPageCommand === undefined ? {} : { nextPageCommand }), ...(saveNeedCommand === undefined ? {} : { saveNeedCommand }) })
    return
  }
  heading(`Market Tools for "${result.query}" (${outcome.durationMs}ms)`)
  if (result.freshness !== undefined && result.freshness.state !== 'fresh') line(`  Catalogue may be out of date (${result.freshness.state}). Results can be incomplete.`)
  if (result.recipient !== undefined) line(`  Ranking: ${result.recipient.label} (${result.recipient.host}) receives ${result.recipient.data}.`)
  line(`  ${result.kind} · scope: ${result.assessed.source}/${result.assessed.scope} · ${result.assessed.coverage} coverage (${result.assessed.examined} examined)`)
  if (result.kind === 'noMatch') line('  No suitable Tools found in the assessed sources.')
  if (result.kind === 'scoped') line('  Only assessed supply is shown; more Tools may exist.')
  if (result.kind === 'unavailable') line(`  Search unavailable: ${result.reason}`)
  for (const [index, tool] of result.results.entries()) {
    const accessLabel = tool.access === 'ae_callable' ? 'AE callable'
      : tool.access === 'setup_required' ? 'Connect to call'
        : `Unavailable: ${REASON_COPY[tool.reason ?? 'fallback'] ?? REASON_COPY_FALLBACK}`
    line(`  ${index + 1}. ${tool.title} · ${accessLabel}`)
    line(`     ref: ${tool.toolRef ?? tool.detailRef}`)
    if (tool.access === 'ae_callable' && parseCallableRef(tool.toolRef)?.kind === 'listing') {
      line(`     quote · ae call ${tool.toolRef} --input '<json>'`)
    }
    line(`     ${tool.readiness} · ${tool.price.kind === 'indicative' ? tool.price.label : 'Price unavailable'}`)
    if (tool.signals !== undefined) line(`     ${formatSearchSignals(tool.signals)}`)
    for (const action of tool.next) {
      line(`     ${action.action} ${JSON.stringify(action.args)} · ${commandFor(action)}`)
    }
  }
  for (const action of result.next) {
    line(`  Next: ${action.action} ${JSON.stringify(action.args)} · ${commandFor(action)}`)
  }
  if (saveNeedCommand !== undefined) line(`  Save this need: ${saveNeedCommand}`)
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

export function parseSearchFilters(value: string | Record<string, unknown>): unknown {
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
