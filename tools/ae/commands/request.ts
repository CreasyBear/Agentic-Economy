import {
  MARKET_REQUEST_ROUTE_CONTRACTS,
  marketRequestCreateAction,
  marketRequestListAction,
  marketRequestStatusAction,
} from '@/modules/market-demand/market-demand.actions'

import type { CliOptions } from '../lib/args'
import { continuationCommand } from '../lib/continuation-command'
import { usageFailure } from '../lib/help'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'
import { operationLabel } from '../lib/operation-format'
import { requireAgentAccessKey } from './status'

export const MARKET_REQUEST_COMMAND_DESCRIPTORS = Object.freeze([
  {
    actionId: marketRequestCreateAction.id,
    command: 'request',
    subcommand: 'create',
    method: MARKET_REQUEST_ROUTE_CONTRACTS.create.method,
    path: MARKET_REQUEST_ROUTE_CONTRACTS.create.path,
  },
  {
    actionId: marketRequestListAction.id,
    command: 'request',
    subcommand: 'list',
    method: MARKET_REQUEST_ROUTE_CONTRACTS.list.method,
    path: MARKET_REQUEST_ROUTE_CONTRACTS.list.path,
  },
  {
    actionId: marketRequestStatusAction.id,
    command: 'request',
    subcommand: 'status',
    method: MARKET_REQUEST_ROUTE_CONTRACTS.status.method,
    path: MARKET_REQUEST_ROUTE_CONTRACTS.status.path,
  },
] as const)

function descriptor(subcommand: 'create' | 'list' | 'status') {
  const found = MARKET_REQUEST_COMMAND_DESCRIPTORS.find((item) => item.subcommand === subcommand)
  if (found === undefined) throw new Error('market_request_command_descriptor_missing')
  return found
}

async function createRequest(args: readonly string[], options: CliOptions): Promise<void> {
  const query = args.slice(1).join(' ').trim()
  const input = marketRequestCreateAction.schema.safeParse({
    query,
    idempotencyKey: options.idempotencyKey ?? globalThis.crypto.randomUUID(),
  })
  if (!input.success) throw usageFailure('request create', 'request-create-input-invalid')
  const apiKey = requireAgentAccessKey('request create', options)
  const route = descriptor('create')
  const outcome = await callJson(options.baseUrl, route.path, {
    method: route.method,
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(input.data),
  })
  const parsed = marketRequestCreateAction.outputSchema.safeParse(requireOk(outcome, route.path))
  if (!parsed.success) {
    throw new CliFailure('The server returned an invalid market request result.', {
      kind: 'UNAVAILABLE', code: 'market-request-result-invalid',
    })
  }
  if (parsed.data.kind === 'refused') {
    const nextCommand = parsed.data.code === 'current_match_exists'
      ? continuationCommand(['ae', 'search', query])
      : parsed.data.code === 'idempotency_conflict'
        ? 'ae request create <job> --idempotency-key <new-key>'
        : undefined
    throw new CliFailure(
      parsed.data.code === 'current_match_exists'
        ? 'Current Market Operations already match this job; nothing was recorded.'
        : parsed.data.code === 'idempotency_conflict'
          ? 'That idempotency key already identifies a different market request.'
          : 'The missing job could not be recorded.',
      {
        kind: parsed.data.code === 'unauthenticated' ? 'UNAUTHENTICATED' : parsed.data.code === 'source_unavailable' ? 'UNAVAILABLE' : 'INVALID_ARGUMENT',
        code: parsed.data.code,
        ...(nextCommand === undefined ? {} : { nextCommand }),
      },
    )
  }
  const nextCommand = continuationCommand(['ae', 'request', 'status', parsed.data.requestRef])
  if (options.json) {
    printJson({ ...parsed.data, nextCommand })
    return
  }
  heading(parsed.data.kind === 'replayed' ? 'Market request recovered' : 'Missing job remembered')
  table([
    ['request', parsed.data.requestRef],
    ['job', parsed.data.query],
    ['recorded', new Date(parsed.data.createdAt).toISOString()],
  ])
  line(`Next: ${nextCommand}`)
}

async function listRequests(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length !== 1) throw usageFailure('request list', 'request-list-usage')
  const input = marketRequestListAction.schema.safeParse({
    ...(options.limit === undefined ? {} : { limit: Number(options.limit) }),
    ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
  })
  if (!input.success) throw usageFailure('request list', 'request-list-input-invalid')
  const apiKey = requireAgentAccessKey('request list', options)
  const route = descriptor('list')
  const outcome = await callJson(options.baseUrl, route.path, {
    method: route.method,
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(input.data),
  })
  const parsed = marketRequestListAction.outputSchema.safeParse(requireOk(outcome, route.path))
  if (!parsed.success || parsed.data.kind !== 'available') {
    throw new CliFailure('Private market requests are temporarily unavailable.', {
      kind: 'UNAVAILABLE', code: 'market-request-list-unavailable',
    })
  }
  const nextCommand = parsed.data.hasMore && parsed.data.nextCursor !== undefined
    ? continuationCommand([
        'ae', 'request', 'list',
        ...(options.limit === undefined ? [] : ['--limit', options.limit]),
        '--cursor', parsed.data.nextCursor,
      ])
    : undefined
  if (options.json) {
    printJson(nextCommand === undefined ? parsed.data : { ...parsed.data, nextCommand })
    return
  }
  heading('Private market requests')
  if (parsed.data.items.length === 0) {
    line('No missing jobs have been remembered for this connection.')
    line('Search first: ae search <job>')
    return
  }
  for (const item of parsed.data.items) {
    table([
      ['request', item.requestRef],
      ['job', item.query],
      ['recorded', new Date(item.createdAt).toISOString()],
      ['check', continuationCommand(['ae', 'request', 'status', item.requestRef])],
    ])
    line()
  }
  if (nextCommand !== undefined) line(`Next: ${nextCommand}`)
}

async function requestStatus(args: readonly string[], options: CliOptions): Promise<void> {
  const input = marketRequestStatusAction.schema.safeParse({ requestRef: args[1] })
  if (!input.success || args.length !== 2) throw usageFailure('request status', 'request-status-usage')
  const apiKey = requireAgentAccessKey('request status', options)
  const route = descriptor('status')
  const outcome = await callJson(options.baseUrl, route.path, {
    method: route.method,
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(input.data),
  })
  const parsed = marketRequestStatusAction.outputSchema.safeParse(requireOk(outcome, route.path))
  if (!parsed.success) {
    throw new CliFailure('The server returned an invalid market request status.', {
      kind: 'UNAVAILABLE', code: 'market-request-status-invalid',
    })
  }
  const nextCommand = parsed.data.kind === 'matched'
    ? continuationCommand(['ae', 'inspect', parsed.data.operations[0]?.operationRef ?? ''])
    : parsed.data.kind === 'open'
      ? continuationCommand(['ae', 'request', 'status', parsed.data.requestRef])
      : undefined
  if (options.json) {
    printJson(nextCommand === undefined ? parsed.data : { ...parsed.data, nextCommand })
    return
  }
  heading('Market request status')
  if (parsed.data.kind === 'not_found') {
    line('No private request with that reference belongs to this connection.')
    line('Next: ae request list')
    return
  }
  if (parsed.data.kind === 'error') {
    throw new CliFailure('Market request status is temporarily unavailable.', {
      kind: 'UNAVAILABLE', code: parsed.data.code,
    })
  }
  table([
    ['request', parsed.data.requestRef],
    ['job', parsed.data.query],
    ['status', parsed.data.kind],
    ['matches', String(parsed.data.matchedCount)],
  ])
  if (parsed.data.kind === 'matched') {
    for (const operation of parsed.data.operations) {
      line(`  ${operationLabel(operation)} — ${operation.operationRef}`)
    }
  } else {
    line('No current canonical Operation matches yet.')
  }
  if (nextCommand !== undefined) line(`Next: ${nextCommand}`)
}

export async function runRequestCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const subcommand = args[0]
  if (subcommand === 'create') return await createRequest(args, options)
  if (subcommand === 'list') return await listRequests(args, options)
  if (subcommand === 'status') return await requestStatus(args, options)
  throw usageFailure('request', 'request-command-required')
}
