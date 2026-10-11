import { deploymentPaymentEnvironment, resolveDeploymentMode, type PaymentEnvironment } from '@/lib/deployment/environment'
import {
  DEPLOYMENT_MANIFEST,
  validateDeploymentManifest,
  type DeploymentEnvironment,
} from '@/lib/deployment/manifest'
import { degrade } from '@/lib/observability/degrade'
import { readTrimmedEnv, type StringEnvironment } from '@/lib/server/read-trimmed-env'
import { readStripeMoneyProviderConfig } from '@/lib/server/stripe-money-provider-config'
import { cdpX402CustodyConfigurationFromEnvironment } from '@/modules/capability-supply/server'
import { readCapabilityToolSearch } from '@/modules/capability-supply/tool-source'
import type { SourceFreshnessState } from '@/modules/common/freshness'
import { readDirectoryFreshnessField } from '@/modules/market/x402-directory-index.server'
import { isMoneyRefusal } from '@/modules/money/public'
import { readPlatformFundingConstraintsThroughSource, readPublicAvailabilityThroughSource } from '@/modules/money/server'
import { isRecord } from '@/modules/common/is-record'
import { PAYMENT_READINESS_CHECK_KEYS, PAYMENT_READINESS_GATING_KEYS, PAYMENT_READINESS_MAX_VALIDITY_MS, referenceRateFresh, type PaymentReadinessView } from '@/modules/money/payment-readiness'
import { ALPHA_X402_PAYEE_SCREENING_POLICY } from '@/modules/money/x402-spend-admission'
import { callPublicSourceQuery, createConvexServerFunctionAssertion, sourceQuery, type ConvexServerFunctionAssertion } from './convex-source'

const DEFAULT_PROBE_TIMEOUT_MS = 2_000
const MAX_PROBE_TIMEOUT_MS = 5_000
const PAYMENT_READINESS_OPERATION = 'moneyReadiness:readForServer'
const PAYMENT_READINESS_SCOPE = 'money_readiness:read'
const paymentReadinessQuery = sourceQuery<{ environment: PaymentEnvironment; serviceAuth: ConvexServerFunctionAssertion }, PaymentReadinessView>(PAYMENT_READINESS_OPERATION)

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
 * Discovery and configured funding signals used by the CLI doctor. `sellable`
 * is true only when the catalogue, quoting and funding signals hold, funding
 * constraints are available, and the admin paid-calls switch is open. It still
 * does not establish paid-Call admission for a given buyer: production also
 * requires the backend payment-readiness evidence and purchase authority.
 * Every field is best-effort: a source outage or timeout degrades to the named
 * unavailable state, it never fails the request or flips the HTTP status.
 */
export type CommercialReadiness = Readonly<{
  /** x402 directory completion state (absent|failed|stale|fresh), from `readDirectoryFreshnessField`. */
  catalogue: SourceFreshnessState
  /** Whether at least one routeable Tool is discoverable through the public search surface the CLI doctor's sandbox search also uses. */
  quoting: 'ready' | 'unavailable'
  /** Whether a money rail (Stripe test/live or the CDP/x402 custody bundle) is configured to settle a sale. */
  funding: 'configured' | 'missing'
  /** Public paid-calls availability, from the admin payments-audience switch (`/api/v1/availability`); `soon` when unreadable. */
  paidCalls: 'open' | 'soon'
  /** catalogue in {fresh, stale} && quoting ready && funding configured && funding constraints available && paidCalls open. */
  sellable: boolean
}>

export type WebReadinessDeployment = Readonly<{
  paymentEnvironment: PaymentEnvironment | null
  convexOrigin: string | null
}>

export type ServerReadinessResult =
  | Readonly<{
      status: 'ready'
      deployment: WebReadinessDeployment
      checks: Readonly<{ config: ReadinessCheck; convex: ReadinessCheck; payments?: ReadinessCheck }>
      diagnostics: ReadinessDiagnostics
      commercial: CommercialReadiness
    }>
  | Readonly<{
      status: 'not_ready'
      deployment: WebReadinessDeployment
      checks: Readonly<{ config: ReadinessCheck; convex: ReadinessCheck; payments?: ReadinessCheck }>
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
  const convexSource = readTrimmedEnv(env, 'CONVEX_URL') ?? readTrimmedEnv(env, 'VITE_CONVEX_URL')
  const deployment: WebReadinessDeployment = {
    paymentEnvironment: deploymentPaymentEnvironment(env) ?? null,
    convexOrigin: convexSource === undefined ? null : readHttpUrl(convexSource)?.origin ?? null,
  }
  // Commercial truth is independent of the deployment-manifest gate above
  // (e.g. a missing canonical URL in production still leaves Convex, the
  // directory, and the money rails reachable) and shares its probe budget
  // with the Convex liveness probe below via Promise.all, so adding it never
  // multiplies /api/ready's worst-case latency.
  const commercialPromise = readCommercialReadiness(env, options.timeoutMs)

  if (config.kind === 'failed') {
    return {
      status: 'not_ready',
      deployment,
      checks: {
        config: { status: 'failed', code: config.code },
        convex: { status: 'failed', code: 'convex_probe_skipped' },
        ...(deployment.paymentEnvironment === 'production'
          ? { payments: { status: 'failed' as const, code: 'payments_unavailable' } } : {}),
      },
      diagnostics,
      commercial: gateSellable(await commercialPromise, deployment.paymentEnvironment === 'production' ? 'failed' : undefined),
    }
  }

  const production = deployment.paymentEnvironment === 'production'
  const [convex, commercial, paymentView] = await Promise.all([
    probeConvex(config.convexUrl, options.fetch ?? globalThis.fetch, options.timeoutMs),
    commercialPromise,
    production ? readBackendPaymentReadiness(env, config.convexUrl, options.fetch ?? globalThis.fetch, options.timeoutMs) : undefined,
  ])
  // Commercial reads can finish after the query. Authority is still evaluated
  // at response completion, on one clock; a previously green response cannot extend expiry.
  const now = Date.now()
  const payments: ReadinessCheck | undefined = production
    ? freshPaymentReadiness(paymentView, now, env)
      ? { status: 'ready' } : { status: 'failed', code: 'payments_unavailable' }
    : undefined
  // Only an observed rate can be stale; an unreadable view already fails the payments gate.
  const observedRate = isRecord(paymentView) && isRecord(paymentView.checks) ? paymentView.checks.reference_rate : undefined
  const rateStale = observedRate !== undefined && !referenceRateFresh(observedRate, now)
  if (convex.status === 'failed') {
    return {
      status: 'not_ready',
      deployment,
      checks: {
        config: { status: 'ready' },
        convex,
        ...(payments === undefined ? {} : { payments }),
      },
      diagnostics,
      commercial: gateSellable(commercial, payments?.status, rateStale),
    }
  }

  return {
    status: payments?.status === 'failed' ? 'not_ready' : 'ready',
    deployment,
    checks: {
      config: { status: 'ready' },
      convex,
      ...(payments === undefined ? {} : { payments }),
    },
    diagnostics,
    commercial: gateSellable(commercial, payments?.status, rateStale),
  }
}

/**
 * Per-rail state is already catalogue (browse), quoting (quote) and funding (pay).
 * A failed payments gate overrides the aggregate: nothing is sellable while it is red.
 * An observed stale reference rate degrades quoting (quotes refuse without it) and so sellable.
 */
function gateSellable(
  commercial: CommercialReadiness, payments: 'ready' | 'failed' | undefined, rateStale = false,
): CommercialReadiness {
  if (rateStale) return { ...commercial, quoting: 'unavailable', sellable: false }
  return payments === 'failed' ? { ...commercial, sellable: false } : commercial
}

/**
 * Requires a statically admitted production origin and exact signed environment.
 * Ensures bounded read-only transport, including response body cancellation.
 * Invariant: no Clerk session, provider effect, raw error or detailed public code.
 * On violation: undefined; the aggregate gate returns only payments_unavailable.
 */
async function readBackendPaymentReadiness(env: StringEnvironment, convexUrl: string, fetchImpl: typeof fetch, timeoutMs?: number): Promise<PaymentReadinessView | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), boundedProbeTimeout(timeoutMs))
  try {
    const command = { environment: 'production' as const }
    const serviceAuth = await createConvexServerFunctionAssertion({
      operation: PAYMENT_READINESS_OPERATION, scope: PAYMENT_READINESS_SCOPE, command, env,
    })
    if (controller.signal.aborted) return undefined
    const view = await callPublicSourceQuery(paymentReadinessQuery, { ...command, serviceAuth }, {
      env, fetch: async (input, init) => {
        const response = await fetchImpl(input, { ...init, redirect: 'error', signal: controller.signal })
        if (response.redirected || (response.url !== '' && new URL(response.url).origin !== new URL(convexUrl).origin)) {
          throw new Error('readiness_backend_identity_invalid')
        }
        return response
      },
    })
    return controller.signal.aborted ? undefined : view
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

function freshPaymentReadiness(value: unknown, now: number, environment: StringEnvironment): boolean {
  const clock = (input: unknown): input is number => typeof input === 'number' && Number.isSafeInteger(input) && input >= 0
  if (!isRecord(value) || value.kind !== 'ready' || value.environment !== 'production' || value.code !== null
    || !clock(value.checkedAt) || value.checkedAt > now || !clock(value.expiresAt) || value.expiresAt <= now
    || value.expiresAt > value.checkedAt + PAYMENT_READINESS_MAX_VALIDITY_MS || !isRecord(value.checks)
    || Object.keys(value.checks).length !== PAYMENT_READINESS_CHECK_KEYS.length) return false
  const checks = value.checks
  const expiresAt = value.expiresAt
  const alphaPolicy = environment.AE_X402_PAYEE_SCREENING_POLICY === ALPHA_X402_PAYEE_SCREENING_POLICY
  if (alphaPolicy !== (checks.sanctions !== undefined && isRecord(checks.sanctions)
    && checks.sanctions.kind === 'deferred')) return false
  return PAYMENT_READINESS_GATING_KEYS.every(key => {
    const check = checks[key]
    return isRecord(check)
      && (check.kind === 'passed' || (key === 'sanctions' && check.kind === 'deferred'
        && check.policyRef === ALPHA_X402_PAYEE_SCREENING_POLICY)) && clock(check.validUntil)
      && check.validUntil > now && check.validUntil >= expiresAt
  })
}

/** Bounds a probe timeout the same way `probeConvex` does, shared by every commercial sub-check. */
function boundedProbeTimeout(timeoutMs = DEFAULT_PROBE_TIMEOUT_MS): number {
  return Math.min(Math.max(1, Math.trunc(timeoutMs)), MAX_PROBE_TIMEOUT_MS)
}

/** Races a lazily-started probe against a bounded timeout; never rejects, always settles to `fallback`. */
function withBoundedTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      resolve(fallback)
    }, timeoutMs)
    Promise.resolve()
      .then(() => run(controller.signal))
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
  const [catalogue, quoting, constraintsOk, paidCalls] = await Promise.all([
    probeCatalogue(bounded),
    probeQuoting(bounded),
    withBoundedTimeout(async () => (await readPlatformFundingConstraintsThroughSource()).kind === 'available', bounded, false),
    withBoundedTimeout(async () => (await readPublicAvailabilityThroughSource()).paidCalls, bounded, 'soon' as const),
  ])
  const funding = fundingState(env)
  const sellable =
    (catalogue === 'fresh' || catalogue === 'stale') && quoting === 'ready' && funding === 'configured' && constraintsOk && paidCalls === 'open'
  return { catalogue, quoting, funding, paidCalls, sellable }
}

/** x402 directory freshness, best-effort (shared with `/api/v1/catalogue-status`). */
function probeCatalogue(timeoutMs: number): Promise<SourceFreshnessState> {
  return withBoundedTimeout(async signal => (await readDirectoryFreshnessField(Date.now(), { signal })).state, timeoutMs, 'absent')
}

/**
 * Whether at least one routeable Tool is discoverable. An empty query is the
 * catalogue-browse operation (see `rankToolSearchCandidates` in
 * `tool-search.ts`), i.e. the same anonymous search surface the CLI doctor's
 * sandbox lookup and `/api/v1/market-tools/search` both call.
 */
function probeQuoting(timeoutMs: number): Promise<'ready' | 'unavailable'> {
  return withBoundedTimeout(
    async signal => {
      const result = await readCapabilityToolSearch({ query: '', limit: 1 }, { signal })
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
  if (deploymentPaymentEnvironment(env) === undefined) {
    return { kind: 'failed', code: 'deployment_manifest_invalid' }
  }
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

  if (deploymentPaymentEnvironment(env) === 'production' || mode === 'production' || mode === 'preview') {
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
    // Requires the actual web environment, not a mirrored backend configuration.
    // A production readiness response proves every static manifest check; its
    // environment/source identity lets the backend reject a different deployment.
    // Provider health and payment readiness remain separate, preventing a probe cycle.
    if (deploymentPaymentEnvironment(env) === 'production' && !deployment.ok) {
      // Requires validator findings. Ensures protected server diagnostics contain
      // only setting names/codes. Invariant: no values or public detail escape;
      // a logger failure cannot change the readiness refusal.
      try {
        console.error('[ae.deployment]', JSON.stringify({
          code: 'deployment_manifest_invalid',
          findings: deployment.findings.map(({ kind, code, names, scope }) => ({ kind, code, names, scope })),
        }))
      } catch { /* Diagnostic failures must not change readiness. */ }
      return { kind: 'failed', code: 'deployment_manifest_invalid' }
    }
    const sharedScopes: readonly string[] = ['canonical', 'convex', 'convex-auth', 'clerk', 'source-write', 'browser-security', 'runtime']
    if (deployment.findings.some((finding) =>
      sharedScopes.includes(finding.scope)
      || finding.names.some((name) => name === 'CLERK_JWT_ISSUER_DOMAIN' || name === 'AE_CANONICAL_HOST_ALLOWLIST')
      || finding.kind === 'forbidden'
      || finding.code === 'deployment_environment_invalid'
      || finding.code === 'convex_source_ambiguous'
    )) return { kind: 'failed', code: 'deployment_manifest_invalid' }
  }
  return { kind: 'ready', convexUrl: convexUrl.href }
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
    // Liveness needs only headers; stop an unused or stalled response body.
    controller.abort()
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
