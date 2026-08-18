import { retiredCustomerRequestResponse } from '@/lib/server/customer-request-gone'

export type InspectResult = Readonly<{ kind: string }>

export async function handleCustomerRequestGet(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}
