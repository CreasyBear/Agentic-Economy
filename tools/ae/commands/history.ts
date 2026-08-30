import {
  operationListInputSchema,
  operationListResultSchema,
} from '@/modules/capability-execution/operation-history.actions'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, printJson, requireOk, table } from '../lib/output'
import { usageFailure } from '../lib/help'
import { continuationCommand } from '../lib/continuation-command'
import { requireAgentAccessKey } from './status'

export const historyCommandDescriptor = Object.freeze({
  actionId: OPERATION_INVOKE_ROUTE_CONTRACT.list.actionId,
  command: 'history',
  method: OPERATION_INVOKE_ROUTE_CONTRACT.list.method,
  path: OPERATION_INVOKE_ROUTE_CONTRACT.list.path,
  inputSchema: operationListInputSchema,
  outputSchema: operationListResultSchema,
  run: runHistoryCommand,
})

export async function runHistoryCommand(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length > 0) {
    throw usageFailure('history', 'history-usage')
  }
  const parsed = operationListInputSchema.safeParse({
    ...(options.limit === undefined ? {} : { limit: Number(options.limit) }),
    ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
    ...(options.state === undefined ? {} : { state: options.state }),
  })
  if (!parsed.success) {
    throw new CliFailure('History requires limit 1-100, an opaque cursor, and an optional canonical invocation state.', {
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
  const result = operationListResultSchema.safeParse(requireOk(outcome, 'operation history'))
  if (!result.success) {
    throw new CliFailure('The gateway returned an invalid invocation history page.', {
      kind: 'UNAVAILABLE',
      code: 'history-result-invalid',
    })
  }
  const nextCommand = result.data.nextCursor === undefined
    ? undefined
    : continuationCommand([
        'ae', 'history',
        ...(options.limit === undefined ? [] : ['--limit', options.limit]),
        ...(options.state === undefined ? [] : ['--state', options.state]),
        '--cursor', result.data.nextCursor,
      ])
  if (options.json) {
    printJson(nextCommand === undefined ? result.data : { ...result.data, nextCommand })
    return
  }
  heading('Invocation history')
  table(result.data.items.flatMap((item, index) => [
    [`${index + 1}. invocation`, item.invocationRef],
    ['operation', item.operationRef],
    ['state', item.state],
    ['created', new Date(item.createdAt).toISOString()],
  ]))
  if (nextCommand !== undefined) process.stdout.write(`Next: ${nextCommand}\n`)
}
