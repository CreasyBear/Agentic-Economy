import { retiredCustomerRequestResponse } from '@/lib/server/customer-request-gone'

export type BrowserApiOptions = Readonly<Record<string, unknown>>

export async function handleBrowserCustomerRequestPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleBrowserCustomerRequestFactsPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleBrowserCustomerRequestMessagePost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleBrowserCustomerOptionsPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function handleBrowserCustomerRequestGet(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.run')
}

export async function callBrowserGuestAction<Result>(..._args: unknown[]): Promise<Result> {
  throw new Error('customer_request_tables_unlisted')
}

export async function hasBrowserGuestSession(..._args: unknown[]): Promise<boolean> {
  return false
}
