import { retiredCustomerRequestResponse } from '@/lib/server/customer-request-gone'

export async function handleCustomerRequestRepeatPermissionAllowPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.allowRepeatPermission')
}

export async function handleCustomerRequestConnectedAssistantsGet(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.listConnectedAssistants')
}

export async function handleCustomerRequestRepeatPermissionUsePost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.useRepeatPermission')
}

export async function handleCustomerRequestRepeatPermissionGet(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.inspectRepeatPermission')
}

export async function handleCustomerRequestRepeatPermissionWithdrawPost(..._args: unknown[]): Promise<Response> {
  return retiredCustomerRequestResponse('customerRequest.withdrawRepeatPermission')
}
