import {
  AGENT_ACCOUNT_SELF_ROUTE_CONTRACT,
  AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS,
  agentAccountActivityAction,
  agentAccountBalanceAction,
  agentAccountSelfResultSchema,
  type AgentAccountSelfResult,
} from '@/modules/agent-access/account.actions'
import { MARKET_OPERATIONS_INVOKE_SCOPE, MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'

import type { CliOptions } from '../lib/args'
import {
  listStoredConnections,
  removeStoredConnection,
  resolveAgentAccessCredential,
} from '../lib/config'
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
import { continuationCommand } from '../lib/continuation-command'
import { requireAgentAccessKey } from './status'

export const accountCommandDescriptor = Object.freeze({
  actionId: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.actionId,
  command: 'account',
  subcommand: 'status',
  method: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.method,
  path: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.path,
  outputSchema: agentAccountSelfResultSchema,
})

export const ACCOUNT_COMMAND_DESCRIPTORS = Object.freeze([
  {
    actionId: agentAccountBalanceAction.id,
    command: 'account',
    subcommand: 'balance',
    method: AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS.balance.method,
    path: AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS.balance.path,
    action: agentAccountBalanceAction,
  },
  {
    actionId: agentAccountActivityAction.id,
    command: 'account',
    subcommand: 'activity',
    method: AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS.activity.method,
    path: AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS.activity.path,
    action: agentAccountActivityAction,
  },
] as const)

function printAccount(result: AgentAccountSelfResult, options: CliOptions): void {
  if (options.json) {
    printJson(result)
    return
  }
  heading('Current agent account')
  table([
    ['principal', result.principalRef],
    ['account', result.accountRef],
    ['credential', result.credentialId],
    ['application', result.applicationRef],
    ['environment', result.environment],
    ['authority', result.authorityMode],
    ['scopes', result.scopes.join(' ')],
  ])
}

async function inspectCurrentAccount(options: CliOptions, profile: 'market' | 'supplier' = 'market'): Promise<void> {
  const requiredScope = profile === 'supplier' ? MARKET_SUPPLY_MANAGE_SCOPE : MARKET_OPERATIONS_INVOKE_SCOPE
  const apiKey = requireAgentAccessKey('account status', options, requiredScope)
  const outcome = await callJson(options.baseUrl, accountCommandDescriptor.path, {
    method: accountCommandDescriptor.method,
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const parsed = accountCommandDescriptor.outputSchema.safeParse(requireOk(outcome, 'account status'))
  if (!parsed.success) {
    throw new CliFailure('The server returned an invalid agent account projection.', {
      kind: 'UNAVAILABLE',
      code: 'account-result-invalid',
    })
  }
  printAccount(parsed.data, options)
}

async function readAccountMoney(
  subcommand: 'balance' | 'activity',
  args: readonly string[],
  options: CliOptions,
): Promise<void> {
  const descriptor = ACCOUNT_COMMAND_DESCRIPTORS.find((item) => item.subcommand === subcommand)
  if (descriptor === undefined) throw new Error('account_command_descriptor_missing')
  const currency = args[1] ?? 'USD'
  if (args.length > 2) {
    throw usageFailure(`account ${subcommand}`, `account-${subcommand}-usage`)
  }
  const input = subcommand === 'balance'
    ? { currency }
    : {
        currency,
        ...(options.limit === undefined ? {} : { limit: Number(options.limit) }),
        ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      }
  const parsedInput = descriptor.action.schema.safeParse(input)
  if (!parsedInput.success) {
    throw new CliFailure(`Input does not match ${descriptor.action.invocationContract.version}.`, {
      kind: 'INVALID_ARGUMENT', code: `account-${subcommand}-input-invalid`,
    })
  }
  const apiKey = requireAgentAccessKey(`account ${subcommand}`, options)
  const outcome = await callJson(options.baseUrl, descriptor.path, {
    method: descriptor.method,
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(parsedInput.data),
  })
  const parsed = descriptor.action.outputSchema.safeParse(requireOk(outcome, `account ${subcommand}`))
  if (!parsed.success) {
    throw new CliFailure('The server returned an invalid account money projection.', {
      kind: 'UNAVAILABLE', code: `account-${subcommand}-result-invalid`,
    })
  }
  const nextCommand = subcommand === 'activity'
    && parsed.data.kind === 'available'
    && 'nextCursor' in parsed.data
    && parsed.data.nextCursor !== undefined
    ? continuationCommand([
        'ae', 'account', 'activity', currency,
        ...(options.limit === undefined ? [] : ['--limit', options.limit]),
        '--cursor', parsed.data.nextCursor,
      ])
    : undefined
  if (options.json) {
    printJson(nextCommand === undefined ? parsed.data : { ...parsed.data, nextCommand })
    return
  }
  heading(`Account ${subcommand}`)
  if (parsed.data.kind !== 'available') {
    printJson(parsed.data)
    return
  }
  if (subcommand === 'balance' && 'balance' in parsed.data) {
    table([
      ['account', parsed.data.accountRef],
      ['balance', `${parsed.data.balance.units} × 10^-${parsed.data.balance.exponent} ${parsed.data.balance.currency}`],
      ['state', parsed.data.accountState],
      ['recovery due', `${parsed.data.recoveryDue.units} × 10^-${parsed.data.recoveryDue.exponent} ${parsed.data.recoveryDue.currency}`],
      ['funding', `${parsed.data.funding.path}#${parsed.data.funding.anchor} (owner browser)`],
    ])
    return
  }
  if ('items' in parsed.data) {
    line(`${parsed.data.items.length} charge event${parsed.data.items.length === 1 ? '' : 's'}`)
    for (const item of parsed.data.items) {
      table([
        ['invocation', item.invocationRef],
        ['offering', item.offeringRef],
        ['state', item.chargeState],
        ['amount', `${item.grossAmount.units} × 10^-${item.grossAmount.exponent} ${item.grossAmount.currency}`],
        ['observed', new Date(item.observedAt).toISOString()],
      ])
      line()
    }
    if (nextCommand !== undefined) line(`Next: ${nextCommand}`)
  }
}

function listConnections(options: CliOptions): void {
  const selectedOrigin = new URL(options.baseUrl).origin
  const items = listStoredConnections().map((item) => ({
    ...item,
    selected: item.origin === selectedOrigin,
    active: item.origin === selectedOrigin && resolveAgentAccessCredential(
      options.baseUrl,
      item.profile === 'supplier' ? MARKET_SUPPLY_MANAGE_SCOPE : MARKET_OPERATIONS_INVOKE_SCOPE,
    )?.source === 'stored',
  }))
  const result = {
    kind: 'connections' as const,
    selectedOrigin,
    credentialSource: resolveAgentAccessCredential(options.baseUrl)?.source ?? 'none',
    items,
  }
  if (options.json) {
    printJson(result)
    return
  }
  heading('AE connections')
  if (items.length === 0) {
    line('No stored connections. Run ae connect for the selected origin.')
    return
  }
  for (const item of items) {
    table([
      ['origin', item.origin],
      ['profile', item.profile],
      ['status', item.active ? 'active stored credential' : item.selected ? 'selected but overridden' : 'stored'],
      ['connected', item.connectedAt],
      ['scope', item.scope ?? 'unknown'],
    ])
    line()
  }
}

function disconnectCurrentAccount(options: CliOptions, profile?: 'market' | 'supplier'): void {
  const requiredScope = profile === 'supplier' ? MARKET_SUPPLY_MANAGE_SCOPE : MARKET_OPERATIONS_INVOKE_SCOPE
  const active = resolveAgentAccessCredential(options.baseUrl, requiredScope)
  if (active?.source === 'environment') {
    throw new CliFailure('The selected credential comes from AE_API_KEY. Remove that environment variable to disconnect it.', {
      kind: 'FAILED_PRECONDITION',
      code: 'environment_credential_cannot_be_removed',
    })
  }
  const removed = removeStoredConnection(options.baseUrl, profile)
  const result = {
    kind: 'disconnected' as const,
    origin: removed.origin,
    removed: removed.removed,
    nextAction: removed.removed
      ? profile === 'supplier'
        ? 'Run ae connect --supplier to authorize a new supplier credential for this origin.'
        : 'Run ae connect to authorize a new credential for this origin.'
      : 'No stored credential existed for this origin.',
  }
  if (options.json) {
    printJson(result)
    return
  }
  heading('Disconnect AE')
  table([
    ['origin', result.origin],
    ['removed', result.removed ? 'yes' : 'no'],
  ])
  line(result.nextAction)
}

/** Account status is the default; local connection lifecycle is explicit. */
export async function runAccountCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const subcommand = args[0] ?? 'status'
  if (subcommand === 'balance' || subcommand === 'activity') {
    await readAccountMoney(subcommand, args, options)
    return
  }
  const rawDisconnectProfile = args[1]
  const disconnectProfile = rawDisconnectProfile === 'market' || rawDisconnectProfile === 'supplier'
    ? rawDisconnectProfile
    : undefined
  const statusProfile = disconnectProfile
  if ((subcommand !== 'disconnect' && subcommand !== 'status' && args.length > 1)
    || (subcommand === 'status' && (args.length > 2 || (rawDisconnectProfile !== undefined && statusProfile === undefined)))
    || (subcommand === 'disconnect' && (args.length > 2 || (rawDisconnectProfile !== undefined && disconnectProfile === undefined)))
    || !['status', 'connections', 'disconnect'].includes(subcommand)) {
    throw usageFailure('account', 'account-usage')
  }
  if (subcommand === 'status') {
    await inspectCurrentAccount(options, statusProfile)
    return
  }
  if (subcommand === 'connections') {
    listConnections(options)
    return
  }
  disconnectCurrentAccount(options, disconnectProfile)
}
