import { callSourceAction, sourceAction } from '@/lib/server/convex-source'

import type {
  CustomerRequestAgentResult,
  CustomerRequestEvidenceResult,
  CustomerRequestProblemInput,
  CustomerRequestProblemReplyInput,
  CustomerRequestProblemResult,
  CustomerRequestProblemStatusChange,
  CustomerRequestRouteActionInput,
  CustomerRequestRouteConfirmationInput,
} from './agent-contract'

export type ConfirmCustomerRequestInput = CustomerRequestRouteConfirmationInput & Readonly<{
  requestRef: string
}>
export type ActOnCustomerRequestRouteInput = CustomerRequestRouteActionInput & Readonly<{ requestRef: string }>
export type ReportCustomerRequestProblemInput = CustomerRequestProblemInput & Readonly<{ requestRef: string }>
export type ReplyCustomerRequestProblemInput = CustomerRequestProblemReplyInput & Readonly<{
  requestRef: string
  reportRef: string
}>
export type InspectCustomerRequestEvidenceInput = Readonly<{ requestRef: string }>

const confirmRouteSourceAction = sourceAction<ConfirmCustomerRequestInput, CustomerRequestAgentResult>(
  'customerRequestApplication:confirmRoute',
)
const runRouteSourceAction = sourceAction<ActOnCustomerRequestRouteInput, CustomerRequestAgentResult>(
  'customerRequestApplication:runRoute',
)
const cancelRouteSourceAction = sourceAction<ActOnCustomerRequestRouteInput, CustomerRequestAgentResult>(
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

export async function confirmCustomerRequestThroughSource(
  input: ConfirmCustomerRequestInput,
): Promise<CustomerRequestAgentResult> {
  return callSourceAction(confirmRouteSourceAction, input)
}

export async function runCustomerRequestThroughSource(
  input: ActOnCustomerRequestRouteInput,
): Promise<CustomerRequestAgentResult> {
  return callSourceAction(runRouteSourceAction, input)
}

export async function cancelCustomerRequestThroughSource(
  input: ActOnCustomerRequestRouteInput,
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
