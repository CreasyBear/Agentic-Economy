export type HostedCustomerRequestRelease = {
  sourceRevision: string
  vercelDeploymentId: string
  vercelUrl: string
  productionUrl: string
  convexDeploymentId: string
  convexUrl: string
  convexSourceRevision: string
}

export function parseCustomerRequestReleaseReadback(..._args: unknown[]): never {
  throw new Error('customer_request_module_deleted')
}

export function verifyCustomerRequestHostedRevision(..._args: unknown[]): never {
  throw new Error('customer_request_module_deleted')
}

export async function verifyHostedCustomerRequestRelease(
  ..._args: unknown[]
): Promise<HostedCustomerRequestRelease> {
  throw new Error('customer_request_module_deleted')
}

export async function main(..._args: unknown[]): Promise<never> {
  throw new Error('customer_request_module_deleted')
}
