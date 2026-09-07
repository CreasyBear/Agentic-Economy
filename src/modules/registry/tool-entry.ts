import type { JsonValue } from '@/modules/capability-contract/public'
import type { PublicToolNavigationRelation } from '@/modules/capability-supply/public'
import { describeActionForAgent, type ActionSurface } from '@/modules/common/action'
import {
  registryToolsCompareContract,
  registryToolsDescribeContract,
  registryToolsListContract,
  registryToolsSearchContract,
} from './tool-action-contracts'
import {
  TOOL_MARKET_COMPARE_PATH,
  TOOL_MARKET_DESCRIBE_PATH,
  TOOL_MARKET_LIST_PATH,
  TOOL_MARKET_SEARCH_PATH,
} from './tool-paths'

export {
  TOOL_MARKET_COMPARE_PATH,
  TOOL_MARKET_DESCRIBE_PATH,
  TOOL_MARKET_LIST_PATH,
  TOOL_MARKET_SEARCH_PATH,
} from './tool-paths'

type ToolMarketRelation = 'list' | 'search' | 'describe' | 'compare'
type ToolMarketActionEntry = Readonly<{
  relation: ToolMarketRelation
  pathTemplate: string
  method: 'POST'
  actionId: string
  authentication: 'none'
  inputSchema?: Readonly<Record<string, JsonValue>>
  surfaces: readonly ActionSurface[]
}>

function toolMarketActionEntry(
  relation: ToolMarketRelation,
  pathTemplate: string,
  action: Parameters<typeof describeActionForAgent>[0],
): ToolMarketActionEntry {
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

export const TOOL_MARKET_ACTION_ENTRIES: readonly ToolMarketActionEntry[] = Object.freeze([
  toolMarketActionEntry('list', TOOL_MARKET_LIST_PATH, registryToolsListContract),
  toolMarketActionEntry('search', TOOL_MARKET_SEARCH_PATH, registryToolsSearchContract),
  toolMarketActionEntry('describe', TOOL_MARKET_DESCRIBE_PATH, registryToolsDescribeContract),
  toolMarketActionEntry('compare', TOOL_MARKET_COMPARE_PATH, registryToolsCompareContract),
])

export function toolMarketNavigation<Relation extends ToolMarketRelation>(
  relation: Relation,
): PublicToolNavigationRelation & Readonly<{ relation: Relation }> {
  const entry = TOOL_MARKET_ACTION_ENTRIES.find((candidate) => candidate.relation === relation)
  if (entry === undefined) throw new Error('tool_market_action_entry_missing')
  return {
    pathTemplate: entry.pathTemplate,
    method: entry.method,
    actionId: entry.actionId,
    authentication: entry.authentication,
    ...(entry.inputSchema === undefined ? {} : { inputSchema: entry.inputSchema }),
    surfaces: entry.surfaces,
    relation,
  }
}
