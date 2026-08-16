import type { JsonValue } from '@/modules/capability-contract/public'
import type { PublicOperationNavigationRelation } from '@/modules/capability-supply/public'
import { describeActionForAgent, type ActionSurface } from '@/modules/common/action'
import {
  registryOperationsCompareContract,
  registryOperationsDetailContract,
  registryOperationsInspectPlanContract,
  registryOperationsSearchContract,
} from './operation-action-contracts'
import {
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_DETAIL_PATH,
  OPERATION_MARKET_INSPECT_PLAN_PATH,
  OPERATION_MARKET_SEARCH_PATH,
} from './operation-paths'

export {
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_DETAIL_PATH,
  OPERATION_MARKET_INSPECT_PLAN_PATH,
  OPERATION_MARKET_SEARCH_PATH,
} from './operation-paths'

type OperationMarketRelation = 'search' | 'detail' | 'compare' | 'inspect_plan'
type OperationMarketActionEntry = Readonly<{
  relation: OperationMarketRelation
  pathTemplate: string
  method: 'POST'
  actionId: string
  authentication: 'none'
  inputSchema?: Readonly<Record<string, JsonValue>>
  surfaces: readonly ActionSurface[]
}>

function operationMarketActionEntry(
  relation: OperationMarketRelation,
  pathTemplate: string,
  action: Parameters<typeof describeActionForAgent>[0],
): OperationMarketActionEntry {
  const inputSchema = describeActionForAgent(action).inputJsonSchema
  return {
    relation,
    pathTemplate,
    method: 'POST',
    actionId: action.id,
    authentication: 'none',
    ...(inputSchema === undefined
      ? {}
      : { inputSchema: inputSchema as Readonly<Record<string, JsonValue>> }),
    surfaces: action.surfaces,
  }
}

export const OPERATION_MARKET_ACTION_ENTRIES: readonly OperationMarketActionEntry[] = Object.freeze([
  operationMarketActionEntry('search', OPERATION_MARKET_SEARCH_PATH, registryOperationsSearchContract),
  operationMarketActionEntry('detail', OPERATION_MARKET_DETAIL_PATH, registryOperationsDetailContract),
  operationMarketActionEntry('compare', OPERATION_MARKET_COMPARE_PATH, registryOperationsCompareContract),
  operationMarketActionEntry('inspect_plan', OPERATION_MARKET_INSPECT_PLAN_PATH, registryOperationsInspectPlanContract),
])

export function operationMarketNavigation(relation: OperationMarketRelation): PublicOperationNavigationRelation {
  const entry = OPERATION_MARKET_ACTION_ENTRIES.find((candidate) => candidate.relation === relation)
  if (entry === undefined) throw new Error('operation_market_action_entry_missing')
  return {
    relation: entry.relation,
    pathTemplate: entry.pathTemplate,
    method: entry.method,
    actionId: entry.actionId,
    authentication: entry.authentication,
    ...(entry.inputSchema === undefined ? {} : { inputSchema: entry.inputSchema }),
    surfaces: entry.surfaces,
  }
}
