import {
  SAVED_TOOLS_ROUTE_CONTRACTS,
  savedToolsListAction,
  savedToolsRemoveAction,
  savedToolsSaveAction,
} from '@/modules/market/saved-tools.actions'
import { directoryPrice } from '@/modules/market/directory-card.view-model'
import { formatDisplayPrice } from '@/modules/money/public'
import type { SavedToolIdentity } from '@/modules/market/saved-tools.contracts'

import type { CliOptions } from '../lib/args'
import { usageFailure } from '../lib/help'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'
import { requireAgentAccessKey } from './status'

function identity(value: string | undefined, allowCompact: boolean) {
  if (value === undefined) return undefined
  if (/^operation:v1:[0-9a-f]{64}$/u.test(value)) return { kind: 'ae_callable' as const, toolRef: value }
  if (allowCompact && /^registry:[0-9a-f]{64}$/u.test(value)) return { kind: 'external_listing' as const, id: value }
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' || url.protocol === 'http:') return { kind: 'external_listing' as const, resource: value }
  } catch { /* Invalid identity is reported as usage, not sent to the server. */ }
  return undefined
}

async function savedAction(path: string, method: string, body: unknown, options: CliOptions): Promise<unknown> {
  const apiKey = requireAgentAccessKey('saved', options)
  return requireOk(await callJson(options.baseUrl, path, {
    method,
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  }), path)
}

function refused(code: string): never {
  throw new CliFailure(`Saved Tools ${code.replaceAll('_', ' ')}.`, {
    kind: code === 'unauthenticated' ? 'UNAUTHENTICATED' : code === 'source_unavailable' ? 'UNAVAILABLE' : 'INVALID_ARGUMENT',
    code,
  })
}

function identityValue(item: SavedToolIdentity): string {
  return item.kind === 'ae_callable' ? item.toolRef : item.resource
}

export async function runSavedCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const [operation, value] = args
  if (operation === 'list' && args.length === 1) {
    const input = savedToolsListAction.schema.safeParse({})
    if (!input.success) throw usageFailure('saved list', 'saved-list-input-invalid')
    const route = SAVED_TOOLS_ROUTE_CONTRACTS.list
    const response = savedToolsListAction.outputSchema.safeParse(await savedAction(route.path, route.method, input.data, options))
    if (!response.success) throw new CliFailure('The server returned an invalid Saved Tools list.', { kind: 'UNAVAILABLE', code: 'saved-list-result-invalid' })
    const result = response.data
    if (result.kind !== 'available') return refused(result.code)
    if (options.json) return printJson(result)
    heading('Saved Tools')
    if (result.items.length === 0) return line('No Tools saved for this account. Search, then save a Tool by reference or Bazaar resource.')
    for (const item of result.items) {
      const { identity: saved, detail } = item
      const live = detail.kind === 'found'
        ? saved.kind === 'external_listing' && 'entry' in detail && detail.entry !== undefined
          ? { title: detail.entry.title, price: directoryPrice(detail.entry), access: 'External listing · not AE-callable' }
          : 'tool' in detail && detail.tool !== undefined
            ? { title: detail.tool.listing.label, price: formatDisplayPrice(detail.tool.commercial.displayPrice ?? { kind: 'unavailable' }) ?? 'AUD estimate unavailable', access: 'AE-callable' }
            : undefined
        : undefined
      table([
        ['Tool', live?.title ?? 'Tool no longer available'],
        ['identity', identityValue(saved)],
        ['access', live?.access ?? 'Unavailable · removable'],
        ['price', live?.price ?? 'Current price unavailable'],
        ['saved', new Date(item.createdAt).toISOString()],
      ])
      line()
    }
    return
  }
  if (operation === 'save' && args.length === 2) {
    const parsedIdentity = identity(value, true)
    const input = parsedIdentity === undefined ? undefined : savedToolsSaveAction.schema.safeParse(parsedIdentity)
    if (input === undefined || !input.success) throw usageFailure('saved save', 'saved-save-input-invalid')
    const route = SAVED_TOOLS_ROUTE_CONTRACTS.save
    const response = savedToolsSaveAction.outputSchema.safeParse(await savedAction(route.path, route.method, input.data, options))
    if (!response.success) throw new CliFailure('The server returned an invalid Saved Tool result.', { kind: 'UNAVAILABLE', code: 'saved-save-result-invalid' })
    const result = response.data
    if (result.kind === 'refused') return refused(result.code)
    if (options.json) return printJson(result)
    heading(result.kind === 'already_saved' ? 'Tool already saved' : 'Tool saved')
    table([['identity', identityValue(result.identity)], ['saved', new Date(result.createdAt).toISOString()]])
    return
  }
  if (operation === 'remove' && args.length === 2) {
    const parsedIdentity = identity(value, false)
    const input = parsedIdentity === undefined ? undefined : savedToolsRemoveAction.schema.safeParse(parsedIdentity)
    if (input === undefined || !input.success) throw usageFailure('saved remove', 'saved-remove-input-invalid')
    const route = SAVED_TOOLS_ROUTE_CONTRACTS.remove
    const response = savedToolsRemoveAction.outputSchema.safeParse(await savedAction(route.path, route.method, input.data, options))
    if (!response.success) throw new CliFailure('The server returned an invalid Saved Tool removal.', { kind: 'UNAVAILABLE', code: 'saved-remove-result-invalid' })
    const result = response.data
    if (result.kind === 'error') return refused(result.code)
    if (options.json) return printJson(result)
    line(result.kind === 'removed' ? 'Tool removed from Saved.' : 'Tool was not saved.')
    return
  }
  throw usageFailure('saved', 'saved-usage')
}
