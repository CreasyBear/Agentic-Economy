import { retiredCustomerRequestResponse } from '@/lib/server/customer-request-gone'

export type ConfirmationResult = Readonly<{ kind: string }>

export async function handleCustomerRequestConfirmationPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}
