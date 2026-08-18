import { retiredCustomerRequestResponse } from '@/lib/server/customer-request-gone'

export async function handleBrowserCustomerRequestConfirmationPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleBrowserCustomerRequestRunPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleBrowserCustomerRequestCancelPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleBrowserCustomerRequestProblemPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.reportProblem')
}

export async function handleBrowserCustomerRequestEvidenceGet(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.inspectEvidence')
}

export async function handleBrowserCustomerRequestProblemReplyPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.replyProblem')
}
