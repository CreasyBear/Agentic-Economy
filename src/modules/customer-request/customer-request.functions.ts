import { callSourceAction, sourceAction } from '@/lib/server/convex-source'

import type {
  CustomerRequestAgentResult,
  CustomerRequestCancellationInput,
  CustomerRequestConnectedAssistantsResult,
  CustomerRequestEvidenceResult,
  CustomerRequestProblemInput,
  CustomerRequestProblemReplyInput,
  CustomerRequestProblemResult,
  CustomerRequestProblemStatusChange,
  CustomerRequestRepeatPermissionResult,
  CustomerRequestRouteActionInput,
  CustomerRequestRouteConfirmationInput,
} from './agent-contract'

export type ConfirmCustomerRequestInput = CustomerRequestRouteConfirmationInput & Readonly<{
  requestRef: string
}>
export type ActOnCustomerRequestRouteInput = CustomerRequestRouteActionInput & Readonly<{ requestRef: string }>
export type CancelCustomerRequestRouteInput = CustomerRequestCancellationInput & Readonly<{ requestRef: string }>
export type ReportCustomerRequestProblemInput = CustomerRequestProblemInput & Readonly<{ requestRef: string }>
export type ReplyCustomerRequestProblemInput = CustomerRequestProblemReplyInput & Readonly<{
  requestRef: string
  reportRef: string
}>
export type InspectCustomerRequestEvidenceInput = Readonly<{ requestRef: string }>
export type ListCustomerRequestAssistantsInput = Readonly<{ requestRef: string }>
export type AllowCustomerRequestRepeatPermissionInput = Readonly<{
  requestRef: string
  revision: number
  routeRef: string
  delegatedCredentialId: string
  occurrences: number
  cumulativeSpend: Readonly<{ currency: string; amountMinor: number }>
  validUntil: number
  idempotencyKey: string
}>
export type UseCustomerRequestRepeatPermissionInput = Readonly<{
  requestRef: string
  revision: number
  routeRef: string
  permissionRef: string
  delegatedCredentialId: string
  idempotencyKey: string
}>
export type InspectCustomerRequestRepeatPermissionInput = Readonly<{
  requestRef: string
  permissionRef: string
  routeRef: string
}>
export type WithdrawCustomerRequestRepeatPermissionInput = InspectCustomerRequestRepeatPermissionInput & Readonly<{
  idempotencyKey: string
}>

const confirmRouteSourceAction = sourceAction<ConfirmCustomerRequestInput, CustomerRequestAgentResult>(
  'customerRequestApplication:confirmRoute',
)
const listRepeatPermissionAssistantsSourceAction = sourceAction<
  ListCustomerRequestAssistantsInput,
  CustomerRequestConnectedAssistantsResult
>('customerRequestApplication:listRepeatPermissionAssistants')
const runRouteSourceAction = sourceAction<ActOnCustomerRequestRouteInput, CustomerRequestAgentResult>(
  'customerRequestApplication:runRoute',
)
const cancelRouteSourceAction = sourceAction<CancelCustomerRequestRouteInput, CustomerRequestAgentResult>(
  'customerRequestApplication:cancelRoute',
)
const reportRouteProblemSourceAction = sourceAction<ReportCustomerRequestProblemInput, CustomerRequestProblemResult>(
  'customerRequestApplication:reportRouteProblem',
)
const exportRouteEvidenceSourceAction = sourceAction<InspectCustomerRequestEvidenceInput, CustomerRequestEvidenceResult>(
  'customerRequestApplication:exportRouteEvidence',
)
const replyRouteProblemSourceAction = sourceAction<ReplyCustomerRequestProblemInput, CustomerRequestProblemStatusChange>(
  'customerRequestApplication:replyRouteProblem',
)
const allowRepeatRouteSourceAction = sourceAction<
  AllowCustomerRequestRepeatPermissionInput,
  CustomerRequestRepeatPermissionResult
>('customerRequestApplication:allowRepeatRoute')
const useRepeatRouteSourceAction = sourceAction<
  UseCustomerRequestRepeatPermissionInput,
  CustomerRequestAgentResult
>('customerRequestApplication:useRepeatRoute')
const inspectRepeatRouteSourceAction = sourceAction<
  InspectCustomerRequestRepeatPermissionInput,
  CustomerRequestRepeatPermissionResult
>('customerRequestApplication:inspectRepeatRoute')
const withdrawRepeatRouteSourceAction = sourceAction<
  WithdrawCustomerRequestRepeatPermissionInput,
  CustomerRequestRepeatPermissionResult
>('customerRequestApplication:revokeRepeatRoute')

export async function confirmCustomerRequestThroughSource(
  input: ConfirmCustomerRequestInput,
): Promise<CustomerRequestAgentResult> {
  return callSourceAction(confirmRouteSourceAction, input)
}

export async function listCustomerRequestAssistantsThroughSource(
  input: ListCustomerRequestAssistantsInput,
): Promise<CustomerRequestConnectedAssistantsResult> {
  return callSourceAction(listRepeatPermissionAssistantsSourceAction, input)
}

export async function runCustomerRequestThroughSource(
  input: ActOnCustomerRequestRouteInput,
): Promise<CustomerRequestAgentResult> {
  return callSourceAction(runRouteSourceAction, input)
}

export async function cancelCustomerRequestThroughSource(
  input: CancelCustomerRequestRouteInput,
): Promise<CustomerRequestAgentResult> {
  return callSourceAction(cancelRouteSourceAction, input)
}

export async function reportCustomerRequestProblemThroughSource(
  input: ReportCustomerRequestProblemInput,
): Promise<CustomerRequestProblemResult> {
  return callSourceAction(reportRouteProblemSourceAction, input)
}

export async function inspectCustomerRequestEvidenceThroughSource(
  input: InspectCustomerRequestEvidenceInput,
): Promise<CustomerRequestEvidenceResult> {
  return callSourceAction(exportRouteEvidenceSourceAction, input)
}

export async function replyCustomerRequestProblemThroughSource(
  input: ReplyCustomerRequestProblemInput,
): Promise<CustomerRequestProblemStatusChange> {
  return callSourceAction(replyRouteProblemSourceAction, input)
}

export async function allowCustomerRequestRepeatPermissionThroughSource(
  input: AllowCustomerRequestRepeatPermissionInput,
): Promise<CustomerRequestRepeatPermissionResult> {
  return callSourceAction(allowRepeatRouteSourceAction, input)
}

export async function executeCustomerRequestRepeatPermissionThroughSource(
  input: UseCustomerRequestRepeatPermissionInput,
): Promise<CustomerRequestAgentResult> {
  return callSourceAction(useRepeatRouteSourceAction, input)
}

export async function inspectCustomerRequestRepeatPermissionThroughSource(
  input: InspectCustomerRequestRepeatPermissionInput,
): Promise<CustomerRequestRepeatPermissionResult> {
  return callSourceAction(inspectRepeatRouteSourceAction, input)
}

export async function withdrawCustomerRequestRepeatPermissionThroughSource(
  input: WithdrawCustomerRequestRepeatPermissionInput,
): Promise<CustomerRequestRepeatPermissionResult> {
  return callSourceAction(withdrawRepeatRouteSourceAction, input)
}
