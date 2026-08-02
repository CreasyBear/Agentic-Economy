import type { CliOptions } from '../lib/args'
import { isRecord } from '@/modules/common/is-record'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'

export async function runSearchCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const query = args.join(' ').trim()
  if (query.length === 0) throw new CliFailure('Usage: ae search <query> [--location X] [--mode near_me|whole_catalogue]')

  const params = new URLSearchParams({ q: query })
  if (options.location !== undefined) params.set('location', options.location)
  if (options.mode !== undefined) params.set('mode', options.mode)

  const path = `/api/businesses/search?${params.toString()}`
  const outcome = await callJson(options.baseUrl, path)
  const body = requireOk(outcome, path)

  if (options.json) {
    printJson(body)
    return
  }

  printSearchPage(body, query, outcome.durationMs)
}

export function printSearchPage(body: unknown, query: string, durationMs: number): void {
  heading(`Search "${query}" (${durationMs}ms)`)
  if (!isRecord(body) || !Array.isArray(body.items)) {
    line('No item list in the response body.')
    return
  }

  const pagination = isRecord(body.pagination) ? body.pagination : {}
  line(`${body.items.length} shown, ${String(pagination.total ?? 'unknown')} total, hasMore=${String(pagination.hasMore ?? false)}`)

  if (body.items.length === 0) {
    line('No published businesses matched. The registry only searches published pages.')
    return
  }

  for (const item of body.items) {
    if (!isRecord(item)) continue
    line('')
    table([
      ['name', String(item.name ?? '')],
      ['slug', String(item.slug ?? '')],
      ['category', String(item.category ?? '')],
      ['where', `${String(item.suburb ?? '')} ${String(item.stateTerritory ?? '')}`.trim()],
      ['page', String(item.publicUrl ?? `/${String(item.slug ?? '')}`)],
      ['services', String(Array.isArray(item.services) ? item.services.length : 0)],
    ])
  }
}
