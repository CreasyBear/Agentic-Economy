import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { operationExecuteAction } from '@/modules/capability-execution/operation-execute-mcp.actions'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import type { OperationInvokeService } from '@/modules/capability-execution/operation-invoke'
import type { OperationProjectionNavigationContract } from '@/modules/capability-supply/operation-projection'
import type { SupplyManagementService } from '@/modules/capability-supply/supply-actions'
import { operationMarketNavigation } from '@/modules/registry/operation-entry'
import type { SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'

export const CURRENT_OPERATION_PROJECTION_NAVIGATION = Object.freeze({
  market: Object.freeze({
    search: operationMarketNavigation('search'),
    detail: operationMarketNavigation('detail'),
    compare: operationMarketNavigation('compare'),
    inspectPlan: operationMarketNavigation('inspect_plan'),
  }),
  execute: Object.freeze({
    relation: 'execute',
    method: 'POST',
    actionId: operationExecuteAction.id,
    authentication: 'none',
    surfaces: (['chat', 'mcp'] as const).filter((surface) => (
      operationExecuteAction.surfaces.includes(surface)
    )),
    precondition: 'free_keyless_read_only',
  }),
  invoke: Object.freeze({
    relation: 'invoke',
    pathTemplate: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
    method: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.method,
    actionId: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId,
    authentication: 'required',
    surfaces: ['http', 'cli', 'mcp'],
  }),
}) satisfies OperationProjectionNavigationContract

declare module '@/modules/common/action' {
  interface ActionContextComposition {
    /** Admission context for writes; built from the calling surface's request. */
    sourceWriteRequest?: SourceWriteAdmissionRequest
    /** Full server-derived agent-access principal; never caller-supplied authority. */
    agentAccessPrincipal?: AgentAccessPrincipal
    /** One injected operation application service shared by HTTP and MCP adapters. */
    operationInvokeService?: OperationInvokeService
    /** One injected supply-management service shared by authenticated MCP and CLI adapters. */
    supplyManagementService?: SupplyManagementService
  }
}
