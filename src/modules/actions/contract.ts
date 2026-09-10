import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { AccountManagementService } from '@/modules/agent-access/account.actions'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import type { CallService } from '@/modules/capability-execution/call-authority'
import type { ToolProjectionNavigationContract } from '@/modules/capability-supply/tool-projection'
import type { SupplyManagementService } from '@/modules/capability-supply/supply-actions'
import { toolMarketNavigation } from '@/modules/registry/tool-entry'
import type { SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'
import type { MarketDemandService } from '@/modules/market-demand/market-demand.actions'
import type { FundingHandoffService } from '@/modules/money/funding-handoff.actions'

export const CURRENT_TOOL_PROJECTION_NAVIGATION = Object.freeze({
  market: Object.freeze({
    list: toolMarketNavigation('list'),
    search: toolMarketNavigation('search'),
    describe: toolMarketNavigation('describe'),
    compare: toolMarketNavigation('compare'),
  }),
  call: Object.freeze({
    relation: 'call',
    pathTemplate: CALL_ROUTE_CONTRACT.call.path,
    method: CALL_ROUTE_CONTRACT.call.method,
    actionId: CALL_ROUTE_CONTRACT.call.actionId,
    authentication: 'required',
    surfaces: ['http', 'cli', 'mcp', 'chat'] as const,
  }),
}) satisfies ToolProjectionNavigationContract

declare module '@/modules/common/action' {
  interface ActionContextComposition {
    /** Admission context for writes; built from the calling surface's request. */
    sourceWriteRequest?: SourceWriteAdmissionRequest
    /** Full server-derived agent-access principal; never caller-supplied authority. */
    agentAccessPrincipal?: AgentAccessPrincipal
    /** One injected Call application service shared by HTTP and MCP adapters. */
    callService?: CallService
    /** One injected supply-management service shared by authenticated MCP and CLI adapters. */
    supplyManagementService?: SupplyManagementService
    /** One injected account read service shared by authenticated HTTP, MCP, and CLI adapters. */
    accountManagementService?: AccountManagementService
    /** Private market-demand memory shared by authenticated HTTP, MCP, and CLI adapters. */
    marketDemandService?: MarketDemandService
    /** Agent-native hosted funding session service shared by HTTP and MCP. */
    fundingHandoffService?: FundingHandoffService
  }
}
