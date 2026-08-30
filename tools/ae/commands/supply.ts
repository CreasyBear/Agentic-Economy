import { isRecord } from '@/modules/common/is-record'
import {
  SUPPLY_ACTION_ROUTE_CONTRACTS,
  supplyConnectionConnectAction,
  supplyConnectionDetailAction,
  supplyConnectionListAction,
  supplyConnectionReconnectAction,
  supplyConnectionRetryCleanupAction,
  supplyConnectionRevokeAction,
  supplyEarningsAction,
  supplyPublishAction,
  supplyRecheckAction,
  supplyRepublishAction,
  supplyStatusAction,
  supplyWithdrawAction,
} from '@/modules/capability-supply/supply-actions'
import { MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'

import type { CliOptions } from '../lib/args'
import {
  CliFailure,
  callJson,
  heading,
  line,
  printJson,
  requireOk,
  table,
} from '../lib/output'
import { usageFailure } from '../lib/help'
import {
  connectionContinuationForCli,
  supplierContinuationForCli,
} from '../lib/suggested-continuation-adapter'
import { requireAgentAccessKey } from './status'

export const SUPPLY_COMMAND_DESCRIPTORS = Object.freeze([
  { actionId: supplyStatusAction.id, command: 'supply', subcommand: 'status', route: SUPPLY_ACTION_ROUTE_CONTRACTS.status, action: supplyStatusAction },
  { actionId: supplyPublishAction.id, command: 'supply', subcommand: 'publish', route: SUPPLY_ACTION_ROUTE_CONTRACTS.publish, action: supplyPublishAction },
  { actionId: supplyWithdrawAction.id, command: 'supply', subcommand: 'withdraw', route: SUPPLY_ACTION_ROUTE_CONTRACTS.withdraw, action: supplyWithdrawAction },
  { actionId: supplyRecheckAction.id, command: 'supply', subcommand: 'recheck', route: SUPPLY_ACTION_ROUTE_CONTRACTS.recheck, action: supplyRecheckAction },
  { actionId: supplyRepublishAction.id, command: 'supply', subcommand: 'republish', route: SUPPLY_ACTION_ROUTE_CONTRACTS.republish, action: supplyRepublishAction },
  { actionId: supplyEarningsAction.id, command: 'supply', subcommand: 'earnings', route: SUPPLY_ACTION_ROUTE_CONTRACTS.earnings, action: supplyEarningsAction },
  { actionId: supplyConnectionListAction.id, command: 'supply', subcommand: 'connections', route: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionList, action: supplyConnectionListAction },
  { actionId: supplyConnectionDetailAction.id, command: 'supply', subcommand: 'connection', route: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionDetail, action: supplyConnectionDetailAction },
  { actionId: supplyConnectionConnectAction.id, command: 'supply', subcommand: 'connect', route: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionConnect, action: supplyConnectionConnectAction },
  { actionId: supplyConnectionReconnectAction.id, command: 'supply', subcommand: 'reconnect', route: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionReconnect, action: supplyConnectionReconnectAction },
  { actionId: supplyConnectionRevokeAction.id, command: 'supply', subcommand: 'revoke', route: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionRevoke, action: supplyConnectionRevokeAction },
  { actionId: supplyConnectionRetryCleanupAction.id, command: 'supply', subcommand: 'retry-cleanup', route: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionRetryCleanup, action: supplyConnectionRetryCleanupAction },
] as const)

type SupplyDescriptor = (typeof SUPPLY_COMMAND_DESCRIPTORS)[number]

function descriptorFor(subcommand: string): SupplyDescriptor | undefined {
  return SUPPLY_COMMAND_DESCRIPTORS.find((descriptor) => descriptor.subcommand === subcommand)
}

function parseInputJson(options: CliOptions): Record<string, unknown> {
  if (options.input === undefined) {
    throw new CliFailure('This supplier command requires --input with one JSON object.', {
      kind: 'INVALID_ARGUMENT',
      code: 'supply-input-required',
    })
  }
  try {
    const parsed = JSON.parse(options.input) as unknown
    if (!isRecord(parsed)) throw new TypeError('not_object')
    return parsed
  } catch {
    throw new CliFailure('Supplier --input must be one valid JSON object.', {
      kind: 'INVALID_ARGUMENT',
      code: 'supply-input-invalid',
    })
  }
}

function writeInput(options: CliOptions): Record<string, unknown> {
  const input = parseInputJson(options)
  if (options.idempotencyKey === undefined) return input
  if (typeof input.idempotencyKey === 'string' && input.idempotencyKey !== options.idempotencyKey) {
    throw new CliFailure('The input idempotencyKey and --idempotency-key must match.', {
      kind: 'INVALID_ARGUMENT',
      code: 'supply-idempotency-key-mismatch',
    })
  }
  return { ...input, idempotencyKey: options.idempotencyKey }
}

function inputFor(subcommand: string, args: readonly string[], options: CliOptions): unknown {
  if (subcommand === 'status') {
    const businessId = args[1]
    const offeringRef = args[2]
    if (businessId === undefined || args.length > 3) {
      throw usageFailure('supply status', 'supply-status-usage')
    }
    return { businessId, ...(offeringRef === undefined ? {} : { offeringRef }) }
  }
  if (subcommand === 'earnings') {
    const currency = args[1]
    if (currency === undefined || args.length > 2) {
      throw usageFailure('supply earnings', 'supply-earnings-usage')
    }
    return { currency }
  }
  if (subcommand === 'connections') {
    const businessId = args[1]
    const lifecycle = args[2]
    if (businessId === undefined || args.length > 3) {
      throw usageFailure('supply connections', 'supply-connections-usage')
    }
    return {
      businessId,
      ...(lifecycle === undefined ? {} : { lifecycle }),
    }
  }
  if (subcommand === 'connection') {
    const connectionRef = args[1]
    if (connectionRef === undefined || args.length > 2) {
      throw usageFailure('supply connection', 'supply-connection-usage')
    }
    return { connectionRef }
  }
  if (args.length !== 1) {
    throw usageFailure(`supply ${subcommand}`, 'supply-command-usage')
  }
  return writeInput(options)
}

function printSupplyResult(subcommand: string, result: unknown, options: CliOptions): void {
  if (options.json || !isRecord(result)) {
    printJson(result)
    return
  }
  heading(`Supplier ${subcommand}`)
  if (result.kind === 'available' && Array.isArray(result.operations)) {
    line(`${result.operations.length} Operation${result.operations.length === 1 ? '' : 's'}`)
    for (const operation of result.operations) {
      if (!isRecord(operation)) continue
      const lifecycle = isRecord(operation.lifecycle) ? operation.lifecycle : undefined
      const live = isRecord(operation.live) ? operation.live : undefined
      const publication = isRecord(operation.publication) ? operation.publication : undefined
      table([
        ['offering', String(operation.offeringRef ?? '')],
        ['name', String(operation.name ?? '')],
        ['catalog', String(operation.catalogStatus ?? '')],
        ['lifecycle', String(lifecycle?.state ?? '')],
        ['ready', isRecord(operation.readiness) ? String(operation.readiness.outcome ?? '') : ''],
        ['live', live?.available === true ? 'yes' : 'no'],
      ])
      if (
        typeof operation.offeringRef === 'string'
        && (operation.catalogStatus === 'draft' || operation.catalogStatus === 'published' || operation.catalogStatus === 'paused' || operation.catalogStatus === 'retired')
        && (lifecycle?.state === 'inactive' || lifecycle?.state === 'active' || lifecycle?.state === 'withdrawn' || lifecycle?.state === 'incompatible')
      ) {
        const continuation = supplierContinuationForCli({
          offeringRef: operation.offeringRef,
          catalogStatus: operation.catalogStatus,
          lifecycleState: lifecycle.state,
          liveAvailable: live?.available === true,
          ...(publication?.state === 'current' || publication?.state === 'withdrawn' || publication?.state === 'superseded' || publication?.state === 'incompatible'
            ? { publicationState: publication.state }
            : {}),
          ...(typeof publication?.operationRef === 'string' ? { operationRef: publication.operationRef } : {}),
        })
        table([['next', continuation.command ?? continuation.href ?? continuation.label]])
      }
      line()
    }
    return
  }
  if (result.kind === 'available' && Array.isArray(result.connections)) {
    line(`${result.connections.length} provider connection${result.connections.length === 1 ? '' : 's'}`)
    if (result.connections.length === 0) {
      const continuation = connectionContinuationForCli('supplier')
      table([['next', continuation.command ?? continuation.href ?? continuation.label]])
      return
    }
    for (const connection of result.connections) {
      if (!isRecord(connection)) continue
      table([
        ['connection', String(connection.connectionRef ?? '')],
        ['provider', String(connection.providerRef ?? '')],
        ['lifecycle', String(connection.lifecycle ?? '')],
        ['available', connection.available === true ? 'yes' : 'no'],
        ['generation', String(connection.authorityGeneration ?? '')],
      ])
      line()
    }
    return
  }
  if (result.kind === 'found' && isRecord(result.connection)) {
    table([
      ['connection', String(result.connection.connectionRef ?? '')],
      ['business', String(result.connection.businessId ?? '')],
      ['provider', String(result.connection.providerRef ?? '')],
      ['lifecycle', String(result.connection.lifecycle ?? '')],
      ['available', result.connection.available === true ? 'yes' : 'no'],
      ['generation', String(result.connection.authorityGeneration ?? '')],
      ['authority digest', String(result.connection.authorityDigest ?? '')],
    ])
    return
  }
  printJson(result)
}

/** First-class supplier Operation lifecycle over the canonical HTTP actions. */
export async function runSupplyCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const subcommand = args[0] ?? 'status'
  const descriptor = descriptorFor(subcommand)
  if (descriptor === undefined) {
    throw usageFailure('supply', 'supply-usage')
  }
  const input = inputFor(subcommand, args, options)
  const parsedInput = descriptor.action.schema.safeParse(input)
  if (!parsedInput.success) {
    throw new CliFailure(`Input does not match ${descriptor.action.invocationContract.version}.`, {
      kind: 'INVALID_ARGUMENT',
      code: 'supply-input-invalid',
    })
  }
  const apiKey = requireAgentAccessKey(`supply ${subcommand}`, options, MARKET_SUPPLY_MANAGE_SCOPE)
  const outcome = await callJson(options.baseUrl, descriptor.route.path, {
    method: descriptor.route.method,
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(parsedInput.data),
  })
  const result = descriptor.action.outputSchema.safeParse(requireOk(outcome, `supply ${subcommand}`))
  if (!result.success) {
    throw new CliFailure('The server returned an invalid supplier action projection.', {
      kind: 'UNAVAILABLE',
      code: 'supply-result-invalid',
    })
  }
  printSupplyResult(subcommand, result.data, options)
}
