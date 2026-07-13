import {
  parseCustomerRequestReleaseReadback,
  verifyCustomerRequestHostedRevision,
} from '../../src/modules/customer-request/release-readback'

type Environment = Record<string, string | undefined>

export async function verifyHostedCustomerRequestRelease(options: Readonly<{
  baseUrl: string
  apiKey: string
  expectedRevision: string
  deploymentProtectionBypass?: string
  fetchImpl?: typeof fetch
}>): Promise<Readonly<{ kind: 'verified'; revision: string; deploymentId: string }>> {
  const baseUrl = new URL(options.baseUrl)
  if (baseUrl.protocol !== 'https:') throw new Error('hosted_release_https_required')

  const headers = new Headers({
    Accept: 'application/json',
    Authorization: `Bearer ${options.apiKey}`,
  })
  if (options.deploymentProtectionBypass !== undefined) {
    headers.set('x-vercel-protection-bypass', options.deploymentProtectionBypass)
  }

  const response = await (options.fetchImpl ?? fetch)(new URL('/api/v1/release', baseUrl), {
    method: 'GET',
    headers,
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`hosted_release_readback_failed:${response.status}`)

  const readback = parseCustomerRequestReleaseReadback(await response.json())
  if (new URL(readback.deployment.url).hostname !== baseUrl.hostname) {
    throw new Error('hosted_release_deployment_url_mismatch')
  }
  return verifyCustomerRequestHostedRevision({ expectedRevision: options.expectedRevision, readback })
}

export async function main(env: Environment = process.env): Promise<void> {
  const baseUrl = required(env, 'AE_CUSTOMER_REQUEST_BASE_URL')
  const apiKey = required(env, 'AE_CUSTOMER_REQUEST_API_KEY')
  const expectedRevision = required(env, 'AE_RELEASE_SOURCE_REVISION')
  const result = await verifyHostedCustomerRequestRelease({
    baseUrl,
    apiKey,
    expectedRevision,
    ...(env.AE_CUSTOMER_REQUEST_VERCEL_BYPASS_SECRET?.trim() === undefined
      ? {}
      : { deploymentProtectionBypass: env.AE_CUSTOMER_REQUEST_VERCEL_BYPASS_SECRET.trim() }),
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

function required(env: Environment, name: string): string {
  const value = env[name]?.trim()
  if (value === undefined || value.length === 0) throw new Error(`${name}_required`)
  return value
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
