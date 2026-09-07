import {
  AGENT_ACCOUNT_SELF_ROUTE_CONTRACT,
  AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS,
  agentAccountActivityAction,
  agentAccountBalanceAction,
  agentAccountSelfResultSchema,
  type AgentAccountSelfResult,
} from '@/modules/agent-access/account.actions'
import { MARKET_TOOLS_CALL_SCOPE, MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'

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

async function inspectCurrentAccount(options: CliOptions, profile: 'market' | 'provider' = 'market'): Promise<void> {
  const requiredScope = profile === 'provider' ? MARKET_SUPPLY_MANAGE_SCOPE : MARKET_TOOLS_CALL_SCOPE
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
  const currency = args[1] ?? 'AUD'
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
  const nextCursor = subcommand === 'activity'
    && parsed.data.kind === 'available'
    && 'nextCursor' in parsed.data
    ? parsed.data.nextCursor
    : undefined
  if (nextCursor !== undefined && /[\u0000-\u001f\u007f-\u009f]/u.test(nextCursor)) {
    throw new CliFailure('The server returned an invalid account activity cursor.', {
      kind: 'UNAVAILABLE', code: 'account-activity-result-invalid',
    })
  }
  const nextCommand = subcommand === 'activity'
    && parsed.data.kind === 'available'
    && nextCursor !== undefined
    ? continuationCommand([
        'ae', 'account', 'activity', currency,
        ...(options.limit === undefined ? [] : ['--limit', options.limit]),
        '--cursor', nextCursor,
        ...(options.baseUrlSource === undefined || options.baseUrlSource === 'hosted_default'
          ? []
          : ['--base-url', options.baseUrl]),
        ...(options.json ? ['--json'] : []),
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
      ['funding', `${parsed.data.funding.createAction} → ${parsed.data.funding.statusAction}`],
    ])
    return
  }
  if ('items' in parsed.data) {
    line(`${parsed.data.items.length} Call${parsed.data.items.length === 1 ? '' : 's'}`)
    for (const item of parsed.data.items) {
      table([
        ['call', item.callRef],
        ['tool', item.toolRef],
        ['provider', item.providerRef],
        ['state', item.state],
        ['payment', item.paymentState],
        ['AUD units', item.audAmountUnits ?? 'not applicable'],
        ['observed', new Date(item.observedAt).toISOString()],
      ])
      line()
    }
    if (nextCommand !== undefined) line(`Next: ${nextCommand}`)
  }
}

function listConnections(options: CliOptions): void {
  const selectedOrigin = new URL(options.baseUrl).origin
  const credentialSource = resolveAgentAccessCredential(options.baseUrl)?.source ?? 'none'
  const items = listStoredConnections().map((item) => ({
    ...item,
    selected: item.origin === selectedOrigin,
    active: item.origin === selectedOrigin && resolveAgentAccessCredential(
      options.baseUrl,
      item.profile === 'provider' ? MARKET_SUPPLY_MANAGE_SCOPE : MARKET_TOOLS_CALL_SCOPE,
    )?.source === 'stored',
  })).map((item) => {
    const state = item.active
      ? 'selected_active'
      : item.selected
        ? 'selected_overridden'
        : 'stored_for_other_origin'
    return {
      ...item,
      state,
      ...(state === 'stored_for_other_origin'
        ? {
            statusCommand: continuationCommand([
              'ae', 'account', 'status',
              item.profile,
              '--base-url', item.origin,
            ]),
          }
        : {}),
    }
  })
  const useExistingCommands = items.flatMap((item) => (
    'statusCommand' in item && typeof item.statusCommand === 'string' ? [item.statusCommand] : []
  ))
  const nextCommand = credentialSource !== 'none'
    ? undefined
    : useExistingCommands.length === 1
      ? useExistingCommands[0]
      : useExistingCommands.length === 0
        ? continuationCommand(['ae', 'connect', '--base-url', selectedOrigin])
        : undefined
  const result = {
    kind: 'connections' as const,
    selectedOrigin,
    credentialSource,
    items,
    ...(nextCommand === undefined ? {} : { nextCommand }),
  }
  if (options.json) {
    printJson(result)
    return
  }
  heading('AE connections')
  if (items.length === 0) {
    line('No stored connections for any origin.')
    line('Anonymous search and description remain available. Connect only after selecting a Call that requires access.')
  } else {
    for (const item of items) {
      table([
        ['origin', item.origin],
        ['profile', item.profile],
        ['status', item.state.replaceAll('_', ' ')],
        ['connected', item.connectedAt],
        ['scope', item.scope ?? 'unknown'],
        ...('statusCommand' in item && typeof item.statusCommand === 'string'
          ? [['status command', item.statusCommand] as const]
          : []),
      ])
      line()
    }
  }
  if (nextCommand !== undefined) line(`Next: ${nextCommand}`)
}

function disconnectCurrentAccount(options: CliOptions, profile: 'market' | 'provider'): void {
  const requiredScope = profile === 'provider' ? MARKET_SUPPLY_MANAGE_SCOPE : MARKET_TOOLS_CALL_SCOPE
  const active = resolveAgentAccessCredential(options.baseUrl, requiredScope)
  if (profile === 'market' && active?.source === 'environment') {
    throw new CliFailure('The selected credential comes from AE_API_KEY. Remove that environment variable to disconnect it.', {
      kind: 'FAILED_PRECONDITION',
      code: 'environment_credential_cannot_be_removed',
    })
  }
  const removed = removeStoredConnection(options.baseUrl, profile)
  const result = {
    kind: 'disconnected' as const,
    origin: removed.origin,
    profile,
    removed: removed.removed,
    nextAction: removed.removed
      ? profile === 'provider'
        ? 'Run ae connect --provider to authorize a new provider credential for this origin.'
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
    ['profile', result.profile],
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
  const requestedProfile = rawDisconnectProfile === 'market' || rawDisconnectProfile === 'provider'
    ? rawDisconnectProfile
    : undefined
  const disconnectProfile = requestedProfile ?? 'market'
  const statusProfile = requestedProfile
  if ((subcommand !== 'disconnect' && subcommand !== 'status' && args.length > 1)
    || (subcommand === 'status' && (args.length > 2 || (rawDisconnectProfile !== undefined && statusProfile === undefined)))
    || (subcommand === 'disconnect' && (args.length > 2 || (rawDisconnectProfile !== undefined && requestedProfile === undefined)))
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
