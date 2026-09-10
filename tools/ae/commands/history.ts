import {
  callListInputSchema,
  callListResultSchema,
} from '@/modules/capability-execution/call-history.actions'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, printJson, requireOk, table } from '../lib/output'
import { usageFailure } from '../lib/help'
import { continuationCommand } from '../lib/continuation-command'
import { requireAgentAccessKey } from './status'

export const historyCommandDescriptor = Object.freeze({
  actionId: CALL_ROUTE_CONTRACT.list.actionId,
  command: 'history',
  method: CALL_ROUTE_CONTRACT.list.method,
  path: CALL_ROUTE_CONTRACT.list.path,
  inputSchema: callListInputSchema,
  outputSchema: callListResultSchema,
  run: runHistoryCommand,
})

export async function runHistoryCommand(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length > 0) {
    throw usageFailure('history', 'history-usage')
  }
  const parsed = callListInputSchema.safeParse({
    ...(options.limit === undefined ? {} : { limit: Number(options.limit) }),
    ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
    ...(options.state === undefined ? {} : { state: options.state }),
  })
  if (!parsed.success) {
    throw new CliFailure('History requires limit 1-100, an opaque cursor, and an optional canonical call state.', {
      kind: 'INVALID_ARGUMENT',
      code: 'history-query-invalid',
    })
  }
  const query = new URLSearchParams({ limit: String(parsed.data.limit) })
  if (parsed.data.cursor !== undefined) query.set('cursor', parsed.data.cursor)
  if (parsed.data.state !== undefined) query.set('state', parsed.data.state)
  const key = requireAgentAccessKey('history', options)
  const outcome = await callJson(options.baseUrl, `${historyCommandDescriptor.path}?${query.toString()}`, {
    method: historyCommandDescriptor.method,
    headers: { Authorization: `Bearer ${key}` },
  })
  const result = callListResultSchema.safeParse(requireOk(outcome, 'tool history'))
  if (!result.success) {
    throw new CliFailure('The gateway returned an invalid call history page.', {
      kind: 'UNAVAILABLE',
      code: 'history-result-invalid',
    })
  }
  const nextCursor = result.data.nextCursor
  if (nextCursor !== undefined && /[\u0000-\u001f\u007f-\u009f]/u.test(nextCursor)) {
    throw new CliFailure('The gateway returned an invalid call history cursor.', {
      kind: 'UNAVAILABLE',
      code: 'history-result-invalid',
    })
  }
  const nextCommand = nextCursor === undefined
    ? undefined
    : continuationCommand([
        'ae', 'history',
        ...(options.limit === undefined ? [] : ['--limit', options.limit]),
        ...(options.state === undefined ? [] : ['--state', options.state]),
        '--cursor', nextCursor,
        ...(options.baseUrlSource === undefined || options.baseUrlSource === 'hosted_default'
          ? []
          : ['--base-url', options.baseUrl]),
        ...(options.json ? ['--json'] : []),
      ])
  if (options.json) {
    printJson(nextCommand === undefined ? result.data : { ...result.data, nextCommand })
    return
  }
  heading('Call history')
  table(result.data.items.flatMap((item, index) => [
    [`${index + 1}. call`, item.callRef],
    ['tool', item.toolRef],
    ['state', item.state],
    ['created', new Date(item.createdAt).toISOString()],
  ]))
  if (nextCommand !== undefined) process.stdout.write(`Next: ${nextCommand}\n`)
}
