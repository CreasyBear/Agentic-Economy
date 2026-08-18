import { retiredCustomerRequestResponse } from '@/lib/server/customer-request-gone'

export type MessageResult = Readonly<{ kind: string }>

export async function handleCustomerRequestMessagePost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}
