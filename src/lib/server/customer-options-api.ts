import { retiredCustomerRequestResponse } from '@/lib/server/customer-request-gone'

export async function handleCustomerOptionsPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}
