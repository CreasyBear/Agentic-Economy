import { withTemporaryClerkApiKey } from './customer-request-production-credential'
import { verifyHostedCustomerRequestRelease } from './verify-customer-request-release'

export async function main(env: Record<string, string | undefined> = process.env): Promise<void> {
  await withTemporaryClerkApiKey({
    clerkSecretKey: env.CLERK_SECRET_KEY ?? '',
    expectedInstanceId: env.AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID ?? '',
    subject: env.AE_CUSTOMER_REQUEST_CLERK_SUBJECT ?? '',
    fetch: globalThis.fetch,
    keyNamePrefix: 'AE hosted release readback',
    run: async (apiKey) => {
      const result = await verifyHostedCustomerRequestRelease({
        baseUrl: required(env, 'AE_CUSTOMER_REQUEST_BASE_URL'),
        apiKey,
        expectedRevision: required(env, 'AE_RELEASE_SOURCE_REVISION'),
        expectedDeploymentId: required(env, 'AE_RELEASE_DEPLOYMENT_ID'),
        ...(env.AE_CUSTOMER_REQUEST_VERCEL_BYPASS_SECRET?.trim() === undefined
          ? {}
          : { deploymentProtectionBypass: env.AE_CUSTOMER_REQUEST_VERCEL_BYPASS_SECRET.trim() }),
      })
      process.stdout.write(`${JSON.stringify(result)}\n`)
    },
  })
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim()
  if (value === undefined || value.length === 0) throw new Error(`${name}_required`)
  return value
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
