import { retiredCustomerRequestResponse } from '@/lib/server/customer-request-gone'

export type SubmitResult = Readonly<{ kind: string }>

export async function handleCustomerRequestPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}
