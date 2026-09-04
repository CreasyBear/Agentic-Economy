import { isRecord } from '@/modules/common/is-record'
import {
  SUPPLY_ACTION_ROUTE_CONTRACTS,
  supplyConnectionConnectAction,
  supplyConnectionDetailAction,
  supplyConnectionListAction,
  supplyConnectionReconnectAction,
  supplyConnectionRevokeAction,
  supplyEarningsAction,
  supplyOffboardingStatusAction,
  supplyPublishAction,
  supplyRecheckAction,
  supplyRepublishAction,
  supplySourcePreviewAction,
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
} from '../lib/suggested-continuation-adapter'
import { requireAgentAccessKey } from './status'

export const SUPPLY_COMMAND_DESCRIPTORS = Object.freeze([
  { actionId: supplySourcePreviewAction.id, command: 'supply', subcommand: 'preview', route: SUPPLY_ACTION_ROUTE_CONTRACTS.sourcePreview, action: supplySourcePreviewAction },
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
  { actionId: supplyOffboardingStatusAction.id, command: 'supply', subcommand: 'offboarding', route: SUPPLY_ACTION_ROUTE_CONTRACTS.offboardingStatus, action: supplyOffboardingStatusAction },
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
    const businessRef = args[1]
    const operationRef = args[2]
    if (businessRef === undefined || args.length > 3) {
      throw usageFailure('supply status', 'supply-status-usage')
    }
    return { businessRef, ...(operationRef === undefined ? {} : { operationRef }) }
  }
  if (subcommand === 'offboarding') {
    const businessRef = args[1]
    if (businessRef === undefined || args.length > 2) {
      throw usageFailure('supply offboarding', 'supply-offboarding-usage')
    }
    return { businessRef }
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
      const source = isRecord(operation.source) ? operation.source : undefined
      const routeability = isRecord(operation.routeability) ? operation.routeability : undefined
      const health = isRecord(operation.health) ? operation.health : undefined
      const delivery = isRecord(health?.delivery) ? health.delivery : undefined
      const usefulOutcome = isRecord(health?.usefulOutcome) ? health.usefulOutcome : undefined
      const continuation = isRecord(operation.continuation) ? operation.continuation : undefined
      const ownerHandoff = isRecord(operation.ownerHandoff) ? operation.ownerHandoff : undefined
      table([
        ['operation', String(operation.operationRef ?? '')],
        ['state', String(operation.state ?? '')],
        ['source', String(source?.kind ?? '')],
        ['routeable', routeability?.available === true ? 'yes' : 'no'],
        ['connection', String(health?.connection ?? '')],
        ['validation', String(health?.validation ?? '')],
        ['delivery', delivery?.kind === 'observed'
          ? `${String(delivery.deliveredCount ?? 0)}/${String(delivery.sampleSize ?? 0)} delivered; ${String(delivery.notDeliveredCount ?? 0)} not delivered; ${String(delivery.unknownCount ?? 0)} unknown`
          : String(delivery?.kind ?? 'unobserved')],
        ['Qualified Use', usefulOutcome?.kind === 'observed'
          ? String(usefulOutcome.qualifiedUseCount ?? 0)
          : String(usefulOutcome?.kind ?? 'unobserved')],
      ])
      if (typeof continuation?.action === 'string') table([['next', continuation.action]])
      else if (typeof ownerHandoff?.cta === 'string') table([['next', ownerHandoff.cta]])
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
  if (result.kind === 'available' && isRecord(result.status)) {
    const blockers = Array.isArray(result.status.blockerCodes)
      ? result.status.blockerCodes.join(', ')
      : ''
    table([
      ['case', String(result.status.caseRef ?? '')],
      ['state', String(result.status.state ?? '')],
      ['new work frozen', result.status.routeabilityFrozen === true ? 'yes' : 'no'],
      ['blockers', blockers === '' ? 'none' : blockers],
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
