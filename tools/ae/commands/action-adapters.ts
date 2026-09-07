import { AGENT_ACCOUNT_SELF_ROUTE_CONTRACT } from '@/modules/agent-access/account.actions'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { TOOL_QUOTE_ROUTE_CONTRACT } from '@/modules/capability-execution/quote.actions'

import { ACCOUNT_COMMAND_DESCRIPTORS, accountCommandDescriptor } from './account'
import { callCommandDescriptor } from './call'
import { historyCommandDescriptor } from './history'
import { MARKET_TOOL_COMMAND_DESCRIPTORS } from './market-tools'
import { SUPPLY_COMMAND_DESCRIPTORS } from './supply'
import { MARKET_REQUEST_COMMAND_DESCRIPTORS } from './request'

export type CliActionAdapterDescriptor = Readonly<{
  actionId: string
  command: string
  subcommand?: string
  method: string
  path: string
}>

/**
 * Executable proof for every action that declares the CLI surface. Adding a
 * `cli` declaration without adding its adapter makes conformance fail.
 */
export const CLI_ACTION_ADAPTERS: readonly CliActionAdapterDescriptor[] = Object.freeze([
  ...MARKET_TOOL_COMMAND_DESCRIPTORS.map(({ actionId, command, path }) => ({
    actionId,
    command,
    method: 'POST',
    path,
  })),
  {
    actionId: accountCommandDescriptor.actionId,
    command: accountCommandDescriptor.command,
    subcommand: accountCommandDescriptor.subcommand,
    method: accountCommandDescriptor.method,
    path: accountCommandDescriptor.path,
  },
  ...ACCOUNT_COMMAND_DESCRIPTORS.map(({ actionId, command, subcommand, method, path }) => ({
    actionId,
    command,
    subcommand,
    method,
    path,
  })),
  ...MARKET_REQUEST_COMMAND_DESCRIPTORS.map(({ actionId, command, subcommand, method, path }) => ({
    actionId,
    command,
    subcommand,
    method,
    path,
  })),
  {
    actionId: TOOL_QUOTE_ROUTE_CONTRACT.actionId,
    command: 'call',
    method: TOOL_QUOTE_ROUTE_CONTRACT.method,
    path: TOOL_QUOTE_ROUTE_CONTRACT.path,
  },
  {
    actionId: callCommandDescriptor.actionId,
    command: callCommandDescriptor.command,
    method: callCommandDescriptor.method,
    path: callCommandDescriptor.path,
  },
  {
    actionId: historyCommandDescriptor.actionId,
    command: historyCommandDescriptor.command,
    method: historyCommandDescriptor.method,
    path: historyCommandDescriptor.path,
  },
  {
    actionId: CALL_ROUTE_CONTRACT.status.actionId,
    command: 'status',
    method: CALL_ROUTE_CONTRACT.status.method,
    path: CALL_ROUTE_CONTRACT.status.path,
  },
  {
    actionId: CALL_ROUTE_CONTRACT.cancel.actionId,
    command: 'cancel',
    method: CALL_ROUTE_CONTRACT.cancel.method,
    path: CALL_ROUTE_CONTRACT.cancel.path,
  },
  {
    actionId: CALL_ROUTE_CONTRACT.reconcile.actionId,
    command: 'recover',
    method: CALL_ROUTE_CONTRACT.reconcile.method,
    path: CALL_ROUTE_CONTRACT.reconcile.path,
  },
  ...SUPPLY_COMMAND_DESCRIPTORS.map(({ actionId, command, subcommand, route }) => ({
    actionId,
    command,
    subcommand,
    method: route.method,
    path: route.path,
  })),
])

if (accountCommandDescriptor.path !== AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.path) {
  throw new Error('Agent account CLI adapter drifted from its canonical route contract.')
}
