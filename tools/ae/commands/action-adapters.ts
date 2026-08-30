import { AGENT_ACCOUNT_SELF_ROUTE_CONTRACT } from '@/modules/agent-access/account.actions'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'

import { ACCOUNT_COMMAND_DESCRIPTORS, accountCommandDescriptor } from './account'
import { invokeCommandDescriptor } from './invoke'
import { historyCommandDescriptor } from './history'
import { MARKET_OPERATION_COMMAND_DESCRIPTORS } from './market-operations'
import { SUPPLY_COMMAND_DESCRIPTORS } from './supply'

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
  ...MARKET_OPERATION_COMMAND_DESCRIPTORS.map(({ actionId, command, path }) => ({
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
  {
    actionId: invokeCommandDescriptor.actionId,
    command: invokeCommandDescriptor.command,
    method: invokeCommandDescriptor.method,
    path: invokeCommandDescriptor.path,
  },
  {
    actionId: historyCommandDescriptor.actionId,
    command: historyCommandDescriptor.command,
    method: historyCommandDescriptor.method,
    path: historyCommandDescriptor.path,
  },
  {
    actionId: OPERATION_INVOKE_ROUTE_CONTRACT.status.actionId,
    command: 'status',
    method: OPERATION_INVOKE_ROUTE_CONTRACT.status.method,
    path: OPERATION_INVOKE_ROUTE_CONTRACT.status.path,
  },
  {
    actionId: OPERATION_INVOKE_ROUTE_CONTRACT.cancel.actionId,
    command: 'cancel',
    method: OPERATION_INVOKE_ROUTE_CONTRACT.cancel.method,
    path: OPERATION_INVOKE_ROUTE_CONTRACT.cancel.path,
  },
  {
    actionId: OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.actionId,
    command: 'recover',
    method: OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.method,
    path: OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.path,
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
