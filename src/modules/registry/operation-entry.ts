import { z, type ZodType } from 'zod'
import type { ActionSurface } from '@/modules/common/action'
import type { JsonValue } from '@/modules/capability-contract/public'
import type { PublicOperationNavigationRelation } from '@/modules/capability-supply/public'
import {
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_DETAIL_PATH,
  OPERATION_MARKET_INSPECT_PLAN_PATH,
  OPERATION_MARKET_SEARCH_PATH,
} from './operation-paths'
import {
  operationCompareInputSchema,
  operationDetailInputSchema,
  operationInspectPlanInputSchema,
  operationSearchInputSchema,
} from '@/modules/capability-supply/operation-schemas'

export {
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_DETAIL_PATH,
  OPERATION_MARKET_INSPECT_PLAN_PATH,
  OPERATION_MARKET_SEARCH_PATH,
}


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
  actionId: string,
  schema: ZodType,
): OperationMarketActionEntry {
  return {
    relation,
    pathTemplate,
    method: 'POST',
    actionId,
    authentication: 'none',
    inputSchema: z.toJSONSchema(schema) as Readonly<Record<string, JsonValue>>,
    surfaces: ['http', 'agentJson', 'answerThread', 'mcp'],
  }
}

export const OPERATION_MARKET_ACTION_ENTRIES: readonly OperationMarketActionEntry[] = Object.freeze([
  operationMarketActionEntry('search', OPERATION_MARKET_SEARCH_PATH, 'registry.operations.search', operationSearchInputSchema),
  operationMarketActionEntry('detail', OPERATION_MARKET_DETAIL_PATH, 'registry.operations.detail', operationDetailInputSchema),
  operationMarketActionEntry('compare', OPERATION_MARKET_COMPARE_PATH, 'registry.operations.compare', operationCompareInputSchema),
  operationMarketActionEntry('inspect_plan', OPERATION_MARKET_INSPECT_PLAN_PATH, 'registry.operations.inspectPlan', operationInspectPlanInputSchema),
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
