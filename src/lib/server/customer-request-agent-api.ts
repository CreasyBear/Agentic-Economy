import { retiredCustomerRequestResponse } from '@/lib/server/customer-request-gone'

export async function handleAgentCustomerRequestPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleAgentCustomerRequestFactsPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleAgentCustomerRequestMessagePost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleAgentCustomerOptionsPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleAgentCustomerRequestConfirmationPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleAgentCustomerRequestRunPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleAgentCustomerRequestRepeatPermissionAllowPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.allowRepeatPermission')
}

export async function handleAgentCustomerRequestRepeatPermissionsGet(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.listConnectedAssistants')
}

export async function handleAgentCustomerRequestRepeatPermissionUsePost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.useRepeatPermission')
}

export async function handleAgentCustomerRequestRepeatPermissionGet(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.inspectRepeatPermission')
}

export async function handleAgentCustomerRequestRepeatPermissionWithdrawPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.withdrawRepeatPermission')
}

export async function handleAgentCustomerRequestCancelPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleAgentCustomerRequestProblemPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.reportProblem')
}

export async function handleAgentCustomerRequestProblemReplyPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.replyProblem')
}

export async function handleAgentCustomerRequestEvidenceGet(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.inspectEvidence')
}

export async function handleAgentCustomerRequestGet(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}
