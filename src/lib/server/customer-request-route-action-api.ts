import { retiredCustomerRequestResponse } from '@/lib/server/customer-request-gone'

export type CustomerRequestPostBoundaryOptions<Input extends object, Result> = Readonly<{ request: Request }>

export async function handleCustomerRequestRunPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleCustomerRequestCancelPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleCustomerRequestPostBoundary(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export function customerRequestResultStatus(_result: unknown): number {
  return 410
}
