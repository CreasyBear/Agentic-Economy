import { retiredCustomerRequestResponse } from '@/lib/server/customer-request-gone'

export async function handleCustomerRequestProblemPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.reportProblem')
}

export async function handleCustomerRequestProblemReplyPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.replyProblem')
}

export async function handleCustomerRequestEvidenceGet(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.inspectEvidence')
}
