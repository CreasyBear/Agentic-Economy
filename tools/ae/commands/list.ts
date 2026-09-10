import {
 toolChoiceListOutputSchema,
  toolListInputSchema,
} from '@/modules/registry/tool-choice-contracts'
import { TOOL_MARKET_LIST_PATH } from '@/modules/registry/tool-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { continuationCommand } from '../lib/continuation-command'
import { throwToolReadFailure } from '../lib/tool-read-failure'

export async function runListCommand(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length > 0) throw new CliFailure('List does not accept a search phrase.', { kind: 'INVALID_ARGUMENT', code: 'list-usage' })
  const input = listCommandDescriptor.inputSchema.safeParse({
    ...(options.source === undefined ? {} : { source: options.source }),
    ...(options.limit === undefined ? {} : { limit: Number(options.limit) }),
    ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
    ...(options.filters === undefined ? {} : { filters: parseFilters(options.filters) }),
  })
  if (!input.success) throw new CliFailure('List options are invalid.', { kind: 'INVALID_ARGUMENT', code: 'list-input' })
  const outcome = await callJson(options.baseUrl, listCommandDescriptor.path, { method: 'POST', body: JSON.stringify(input.data) })
  const parsed = listCommandDescriptor.outputSchema.safeParse(requireOk(outcome, listCommandDescriptor.path))
  if (!parsed.success) throw new CliFailure('The market returned an invalid Tool list.', { kind: 'UNAVAILABLE', code: 'tool-list-result-invalid' })
  if (parsed.data.kind === 'unavailable') throwToolReadFailure({ reason: parsed.data.reason })
  const origin = options.baseUrlSource === undefined || options.baseUrlSource === 'hosted_default' ? [] : ['--base-url', options.baseUrl]
  const nextPageCommand = parsed.data.pagination.hasMore && parsed.data.pagination.nextCursor !== undefined
    ? continuationCommand(['ae', 'list', '--limit', String(input.data.limit), '--cursor', parsed.data.pagination.nextCursor, ...origin, ...(input.data.source === undefined ? [] : ['--source', input.data.source]), ...(input.data.filters === undefined ? [] : ['--filters', JSON.stringify(input.data.filters)]), ...(options.json ? ['--json'] : [])])
    : undefined
  if (options.json) {
    printJson({ ...parsed.data, ...(nextPageCommand === undefined ? {} : { nextPageCommand }) })
    return
  }
  heading(`Current Tools (${outcome.durationMs}ms)`)
  line(`  ${parsed.data.count} shown`)
  for (const [index, tool] of parsed.data.items.entries()) {
    line(`  ${index + 1}. ${tool.provider.name} — ${tool.title}`)
    line(`     ${tool.healthStatus} · ${tool.priceLabel}`)
    line(`     ${tool.toolRef}`)
  }
  if (nextPageCommand !== undefined) line(`  More: ${nextPageCommand}`)
}

function parseFilters(value: string | Record<string, unknown>): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) as unknown } catch {
    throw new CliFailure('List filters must be valid JSON.', { kind: 'INVALID_ARGUMENT', code: 'list-filters-invalid' })
  }
}

export const listCommandDescriptor = {
  command: 'list', actionId: 'registry.tools.list', path: TOOL_MARKET_LIST_PATH,
  inputSchema: toolListInputSchema, outputSchema: toolChoiceListOutputSchema, run: runListCommand,
} as const
