import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { OperationInvokeService } from '@/modules/capability-execution/operation-invoke'
import type { SupplyManagementService } from '@/modules/capability-supply/supply-actions'
import type { SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'

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
