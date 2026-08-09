import { readTrimmedEnv, type StringEnvironment } from '@/lib/server/read-trimmed-env'
import { validateDeploymentManifest, type DeploymentEnvironment } from '@/lib/deployment/manifest'

const DEFAULT_PROBE_TIMEOUT_MS = 2_000
const MAX_PROBE_TIMEOUT_MS = 5_000

type ReadinessCheck = Readonly<{
  status: 'ready' | 'failed'
  code?: string
}>

export type ServerReadinessResult =
  | Readonly<{
      status: 'ready'
      checks: Readonly<{ config: ReadinessCheck; convex: ReadinessCheck }>
    }>
  | Readonly<{
      status: 'not_ready'
      checks: Readonly<{ config: ReadinessCheck; convex: ReadinessCheck }>
    }>

export type ServerReadinessOptions = Readonly<{
  env?: StringEnvironment
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
  nodeMajor?: number
}>

export async function readServerReadiness(
  options: ServerReadinessOptions = {},
): Promise<ServerReadinessResult> {
  const env = options.env ?? process.env
  const config = readDeploymentConfig(env, options.nodeMajor)
  if (config.kind === 'failed') {
    return {
      status: 'not_ready',
      checks: {
        config: { status: 'failed', code: config.code },
        convex: { status: 'failed', code: 'convex_probe_skipped' },
      },
    }
  }

  const convex = await probeConvex(config.convexUrl, options.fetch ?? globalThis.fetch, options.timeoutMs)
  if (convex.status === 'failed') {
    return {
      status: 'not_ready',
      checks: {
        config: { status: 'ready' },
        convex,
      },
    }
  }

  return {
    status: 'ready',
    checks: {
      config: { status: 'ready' },
      convex,
    },
  }
}

type DeploymentConfig =
  | Readonly<{ kind: 'ready'; convexUrl: string }>
  | Readonly<{
      kind: 'failed'
      code:
        | 'convex_url_missing'
        | 'convex_url_invalid'
        | 'canonical_url_missing'
        | 'canonical_url_invalid'
        | 'deployment_environment_conflict'
        | 'deployment_manifest_invalid'
    }>

function readDeploymentConfig(env: StringEnvironment, nodeMajor?: number): DeploymentConfig {
  const convexValue = readTrimmedEnv(env, 'CONVEX_URL') ?? readTrimmedEnv(env, 'VITE_CONVEX_URL')
  if (convexValue === undefined) return { kind: 'failed', code: 'convex_url_missing' }
  const convexUrl = readHttpUrl(convexValue)
  if (convexUrl === undefined) return { kind: 'failed', code: 'convex_url_invalid' }

  const mode = resolveDeploymentMode(env)
  const nodeEnvironment = readTrimmedEnv(env, 'NODE_ENV')
  const vercelEnvironment = readTrimmedEnv(env, 'VERCEL_ENV')
  const cloudflarePreview = readTrimmedEnv(env, 'CF_PAGES_BRANCH') !== undefined
  if (nodeEnvironment === 'test' && (vercelEnvironment === 'production' || vercelEnvironment === 'preview' || cloudflarePreview)) {
    return { kind: 'failed', code: 'deployment_environment_conflict' }
  }
  if (mode === 'production') {
    const canonical = readTrimmedEnv(env, 'AE_CANONICAL_BASE_URL')
    const hostAllowlist = readTrimmedEnv(env, 'AE_CANONICAL_HOST_ALLOWLIST')
    if (canonical === undefined && hostAllowlist === undefined) {
      return { kind: 'failed', code: 'canonical_url_missing' }
    }
    if (canonical !== undefined && readHttpUrl(canonical) === undefined) {
      return { kind: 'failed', code: 'canonical_url_invalid' }
    }
    if (hostAllowlist !== undefined && !hostAllowlist.split(',').some((host) => readAllowlistedHost(host) !== undefined)) {
      return { kind: 'failed', code: 'canonical_url_invalid' }
    }
  }

  if (mode === 'production' || mode === 'preview') {
    let deployment
    try {
      deployment = validateDeploymentManifest(env, {
        environment: mode,
        nodeMajor: nodeMajor ?? Number.parseInt(process.versions.node.split('.')[0] ?? '', 10),
      })
    } catch {
      return { kind: 'failed', code: 'deployment_manifest_invalid' }
    }
    if (!deployment.ok) return { kind: 'failed', code: 'deployment_manifest_invalid' }
  }
  return { kind: 'ready', convexUrl: convexUrl.href }
}

function resolveDeploymentMode(env: StringEnvironment): DeploymentEnvironment {
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
async function probeConvex(
  convexUrl: string,
  fetchImpl: typeof globalThis.fetch,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<ReadinessCheck> {
  const boundedTimeout = Math.min(Math.max(1, Math.trunc(timeoutMs)), MAX_PROBE_TIMEOUT_MS)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), boundedTimeout)
  try {
    const response = await fetchImpl(convexUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    })
    return response.status >= 200 && response.status < 500
      ? { status: 'ready' }
      : { status: 'failed', code: 'convex_probe_failed' }
  } catch (error) {
    return { status: 'failed', code: error instanceof Error && error.name === 'AbortError' ? 'convex_probe_timeout' : 'convex_unreachable' }
  } finally {
    clearTimeout(timer)
  }
}

function readHttpUrl(value: string): URL | undefined {
  try {
    const parsed = new URL(value)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && parsed.username.length === 0
      && parsed.password.length === 0
      && parsed.search.length === 0
      && parsed.hash.length === 0
      ? parsed
      : undefined
  } catch {
    return undefined
  }
}

function readAllowlistedHost(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  const asUrl = readHttpUrl(trimmed)
  if (asUrl !== undefined) return asUrl.host
  if (trimmed.includes('/') || trimmed.includes('?') || trimmed.includes('#')) return undefined
  return trimmed
}
