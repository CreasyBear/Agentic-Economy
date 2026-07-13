import {
  parseCustomerRequestReleaseReadback,
  verifyCustomerRequestHostedRevision,
} from '../../src/modules/customer-request/release-readback'
import { pathToFileURL } from 'node:url'

type Environment = Record<string, string | undefined>

export async function verifyHostedCustomerRequestRelease(options: Readonly<{
  baseUrl: string
  apiKey: string
  expectedRevision: string
  expectedDeploymentId: string
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
  const admittedHosts = new Set([
    new URL(readback.deployment.url).hostname,
    new URL(readback.deployment.productionUrl).hostname,
  ])
  if (!admittedHosts.has(baseUrl.hostname)) {
    throw new Error('hosted_release_deployment_url_mismatch')
  }
  if (readback.deployment.id !== options.expectedDeploymentId) {
    throw new Error('hosted_release_deployment_id_mismatch')
  }
  return verifyCustomerRequestHostedRevision({ expectedRevision: options.expectedRevision, readback })
}

export async function main(env: Environment = process.env): Promise<void> {
  const baseUrl = required(env, 'AE_CUSTOMER_REQUEST_BASE_URL')
  const apiKey = required(env, 'AE_CUSTOMER_REQUEST_API_KEY')
  const expectedRevision = required(env, 'AE_RELEASE_SOURCE_REVISION')
  const expectedDeploymentId = required(env, 'AE_RELEASE_DEPLOYMENT_ID')
  const result = await verifyHostedCustomerRequestRelease({
    baseUrl,
    apiKey,
    expectedRevision,
    expectedDeploymentId,
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

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) await main()
