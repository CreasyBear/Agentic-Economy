import { degradeBackend } from '@/lib/observability/degrade-backend'
import { readTrimmedEnv, type StringEnvironment } from '@/lib/server/read-trimmed-env'

export type DeploymentEnvironment = 'production' | 'preview' | 'development' | 'test'

export type PaymentEnvironment = 'production' | 'sandbox'

/** Returns undefined unless the deployment explicitly declares a supported payment environment. */
export function deploymentPaymentEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): PaymentEnvironment | undefined {
  const deploymentEnvironment = env.AE_DEPLOYMENT_ENVIRONMENT
  if (deploymentEnvironment === 'production') return 'production'
  if (deploymentEnvironment === 'development') return 'sandbox'
  return undefined
}

export function resolveDeploymentMode(env: StringEnvironment): DeploymentEnvironment {
  const nodeEnvironment = readTrimmedEnv(env, 'NODE_ENV')
  const vercelEnvironment = readTrimmedEnv(env, 'VERCEL_ENV')
  if (vercelEnvironment === 'production') return 'production'
  if (vercelEnvironment === 'preview' || readTrimmedEnv(env, 'CF_PAGES_BRANCH') !== undefined) return 'preview'
  if (nodeEnvironment === 'test') return 'test'
  if (nodeEnvironment === 'production') return 'production'
  if (nodeEnvironment === 'preview') return 'preview'
  if (nodeEnvironment === 'development') return 'development'
  return 'production'
}

export function bootValidationClass(env: StringEnvironment): 'development' | 'production' {
  return resolveDeploymentMode(env) === 'production' ? 'production' : 'development'
}

export function clerkMiddlewareConfigured(env: StringEnvironment): boolean {
  return readTrimmedEnv(env, 'CLERK_SECRET_KEY') !== undefined
    && readTrimmedEnv(env, 'VITE_CLERK_PUBLISHABLE_KEY') !== undefined
}

export function vercelPreviewHosts(env: StringEnvironment): readonly string[] {
  if (resolveDeploymentMode(env) !== 'preview') return []
  const hosts = [readTrimmedEnv(env, 'VERCEL_URL'), readTrimmedEnv(env, 'VERCEL_BRANCH_URL')]
    .map((value) => readVercelHost(value))
    .filter((host): host is string => host !== undefined)
  return [...new Set(hosts)]
}

function readVercelHost(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`)
    return url.host.toLowerCase()
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'readVercelHost', reason: 'invalid_response' })
  }
}
