import { degrade } from '@/lib/observability/degrade'
import { readTrimmedEnv, type StringEnvironment } from '@/lib/server/read-trimmed-env'
import { readStripeMoneyProviderConfig } from '@/lib/server/stripe-money-provider-config'
import {
  DEPLOYMENT_MANIFEST,
  validateDeploymentManifest,
  type DeploymentEnvironment,
} from '@/lib/deployment/manifest'
import { cdpX402CustodyConfigurationFromEnvironment } from '@/modules/capability-supply/server'
import { readCapabilityToolSearch } from '@/modules/capability-supply/tool-source'
import type { SourceFreshnessState } from '@/modules/common/freshness'
import { readDirectoryFreshnessField } from '@/modules/market/x402-directory-index.server'
import { isMoneyRefusal } from '@/modules/money/public'

const DEFAULT_PROBE_TIMEOUT_MS = 2_000
const MAX_PROBE_TIMEOUT_MS = 5_000

type ReadinessCheck = Readonly<{
  status: 'ready' | 'failed'
  code?: string
}>

export type ReadinessConfigName = Readonly<{
  name: string
  configured: boolean
}>

export type ReadinessConfigFamily = Readonly<{
  scope: string
  code: string
  required: boolean
  status: 'ready' | 'missing' | 'invalid' | 'not_required'
  names: readonly ReadinessConfigName[]
}>

export type ReadinessDiagnostics = Readonly<{
  environment: DeploymentEnvironment
  configuration: Readonly<{
    required: readonly ReadinessConfigFamily[]
    conditional: readonly ReadinessConfigFamily[]
    optional: readonly ReadinessConfigName[]
    forbiddenProduction: readonly ReadinessConfigName[]
  }>
  readinessProbes: readonly Readonly<{
    id: string
    method: readonly string[]
    path: string
    dependencies: readonly string[]
  }>[]
}>

export function readNamesOnlyReadinessDiagnostics(
  environment: StringEnvironment = process.env,
  nodeMajor?: number,
): ReadinessDiagnostics {
  const mode = resolveDeploymentMode(environment)
  let findings: readonly Readonly<{ kind: string; code: string; names: readonly string[]; scope: string }>[] = []
  try {
    findings = validateDeploymentManifest(environment, {
      environment: mode,
      ...(nodeMajor === undefined ? {} : { nodeMajor }),
    }).findings
  } catch (cause) {
    findings = degrade(cause, [], {
      site: 'readNamesOnlyReadinessDiagnostics',
      reason: 'invalid_response',
    })
  }
  const configuration = DEPLOYMENT_MANIFEST.configuration
  const family = (
    group: Readonly<{ scope: string; code: string; names: readonly string[]; mode: 'all' | 'one-of'; trigger?: readonly string[] }>,
  ): ReadinessConfigFamily => {
    const active = group.trigger === undefined || group.trigger.some((name) => readTrimmedEnv(environment, name) !== undefined)
    const scopedFindings = findings.filter((finding) => finding.scope === group.scope)
    const status = !active
      ? 'not_required'
      : scopedFindings.some((finding) => finding.kind === 'missing')
        ? 'missing'
        : scopedFindings.length > 0
          ? 'invalid'
          : 'ready'
    return {
      scope: group.scope,
      code: group.code,
      required: active,
      status,
      names: group.names.map((name) => ({ name, configured: readTrimmedEnv(environment, name) !== undefined })),
    }
  }
  return {
    environment: mode,
    configuration: {
      required: configuration.requiredProduction.map((group) => family(group)),
      conditional: configuration.conditional.map((group) => family(group)),
      optional: configuration.optional.map((name) => ({
        name,
        configured: readTrimmedEnv(environment, name) !== undefined,
      })),
      forbiddenProduction: configuration.forbiddenProduction.map((name) => ({
        name,
        configured: readTrimmedEnv(environment, name) !== undefined,
      })),
    },
    readinessProbes: DEPLOYMENT_MANIFEST.readinessProbes.map((probe) => ({
      id: probe.id,
      method: [...probe.method],
      path: probe.path,
      dependencies: [...probe.dependencies],
    })),
  }
}


/**
 * Whether a sale can complete right now, additive to the Kubernetes-style
 * infra `checks` above (config/convex = "process is up"; this = "the doctor's
 * discovery/quoting/purchase grouping actually clears"). Every field is
 * best-effort: a source outage or timeout degrades to the named unavailable
 * state, it never fails the request or flips the HTTP status.
 */
export type CommercialReadiness = Readonly<{
  /** x402 directory completion state (absent|failed|stale|fresh), from `readDirectoryFreshnessField`. */
  catalogue: SourceFreshnessState
  /** Whether at least one routeable Tool is discoverable through the public search surface the CLI doctor's sandbox search also uses. */
  quoting: 'ready' | 'unavailable'
  /** Whether a money rail (Stripe test/live or the CDP/x402 custody bundle) is configured to settle a sale. */
  funding: 'configured' | 'missing'
  /** catalogue in {fresh, stale} && quoting ready && funding configured. */
  sellable: boolean
}>

export type ServerReadinessResult =
  | Readonly<{
      status: 'ready'
      checks: Readonly<{ config: ReadinessCheck; convex: ReadinessCheck }>
      diagnostics: ReadinessDiagnostics
      commercial: CommercialReadiness
    }>
  | Readonly<{
      status: 'not_ready'
      checks: Readonly<{ config: ReadinessCheck; convex: ReadinessCheck }>
      diagnostics: ReadinessDiagnostics
      commercial: CommercialReadiness
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
  const diagnostics = readNamesOnlyReadinessDiagnostics(env, options.nodeMajor)
  const config = readDeploymentConfig(env, options.nodeMajor)
  // Commercial truth is independent of the deployment-manifest gate above
  // (e.g. a missing canonical URL in production still leaves Convex, the
  // directory, and the money rails reachable) and shares its probe budget
  // with the Convex liveness probe below via Promise.all, so adding it never
  // multiplies /api/ready's worst-case latency.
  const commercialPromise = readCommercialReadiness(env, options.timeoutMs)

  if (config.kind === 'failed') {
    return {
      status: 'not_ready',
      checks: {
        config: { status: 'failed', code: config.code },
        convex: { status: 'failed', code: 'convex_probe_skipped' },
      },
      diagnostics,
      commercial: await commercialPromise,
    }
  }

  const [convex, commercial] = await Promise.all([
    probeConvex(config.convexUrl, options.fetch ?? globalThis.fetch, options.timeoutMs),
    commercialPromise,
  ])
  if (convex.status === 'failed') {
    return {
      status: 'not_ready',
      checks: {
        config: { status: 'ready' },
        convex,
      },
      diagnostics,
      commercial,
    }
  }

  return {
    status: 'ready',
    checks: {
      config: { status: 'ready' },
      convex,
    },
    diagnostics,
    commercial,
  }
}

/** Bounds a probe timeout the same way `probeConvex` does, shared by every commercial sub-check. */
function boundedProbeTimeout(timeoutMs = DEFAULT_PROBE_TIMEOUT_MS): number {
  return Math.min(Math.max(1, Math.trunc(timeoutMs)), MAX_PROBE_TIMEOUT_MS)
}

/** Races a lazily-started probe against a bounded timeout; never rejects, always settles to `fallback`. */
function withBoundedTimeout<T>(run: () => Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs)
    Promise.resolve()
      .then(run)
      .then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        () => {
          clearTimeout(timer)
          resolve(fallback)
        },
      )
  })
}

async function readCommercialReadiness(env: StringEnvironment, timeoutMs?: number): Promise<CommercialReadiness> {
  const bounded = boundedProbeTimeout(timeoutMs)
  const [catalogue, quoting] = await Promise.all([probeCatalogue(bounded), probeQuoting(bounded)])
  const funding = fundingState(env)
  const sellable = (catalogue === 'fresh' || catalogue === 'stale') && quoting === 'ready' && funding === 'configured'
  return { catalogue, quoting, funding, sellable }
}

/** x402 directory freshness, best-effort (shared with `/api/v1/catalogue-status`). */
function probeCatalogue(timeoutMs: number): Promise<SourceFreshnessState> {
  return withBoundedTimeout(async () => (await readDirectoryFreshnessField(Date.now())).state, timeoutMs, 'absent')
}

/**
 * Whether at least one routeable Tool is discoverable. An empty query is the
 * catalogue-browse operation (see `rankToolSearchCandidates` in
 * `tool-search.ts`), i.e. the same anonymous search surface the CLI doctor's
 * sandbox lookup and `/api/v1/market-tools/search` both call.
 */
function probeQuoting(timeoutMs: number): Promise<'ready' | 'unavailable'> {
  return withBoundedTimeout(
    async () => {
      const result = await readCapabilityToolSearch({ query: '', limit: 1 })
      return result.kind === 'ok' && result.items.length > 0 ? ('ready' as const) : ('unavailable' as const)
    },
    timeoutMs,
    'unavailable',
  )
}

/** Either money rail configured (Stripe test/live, or the CDP/x402 custody bundle) suffices to settle a sale. */
function fundingState(env: StringEnvironment): 'configured' | 'missing' {
  try {
    const stripe = readStripeMoneyProviderConfig(env)
    if (!isMoneyRefusal(stripe)) return 'configured'
    return cdpX402CustodyConfigurationFromEnvironment(env) === undefined ? 'missing' : 'configured'
  } catch (cause) {
    return degrade(cause, 'missing', {
      site: 'fundingState',
      reason: 'source_unavailable',
    })
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
    if (canonical === undefined) {
      return { kind: 'failed', code: 'canonical_url_missing' }
    }
    if (canonical !== undefined && readHttpUrl(canonical) === undefined) {
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
    } catch (cause) {
      return degrade(cause, { kind: 'failed', code: 'deployment_manifest_invalid' } as const, {
        site: 'readDeploymentConfig',
        reason: 'invalid_response',
      })
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
  const boundedTimeout = boundedProbeTimeout(timeoutMs)
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
  } catch (cause) {
    return degrade(cause, undefined, {
      site: 'readHttpUrl',
      reason: 'invalid_response',
    })
  }
}
