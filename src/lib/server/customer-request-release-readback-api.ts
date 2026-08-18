import { retiredCustomerRequestResponse } from '@/lib/server/customer-request-gone'

export async function handleAgentCustomerRequestReleaseGet(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}
