import { retiredCustomerRequestResponse } from '@/lib/server/customer-request-gone'

export type FactsResult = Readonly<{ kind: string }>

export async function handleCustomerRequestFactsPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}
