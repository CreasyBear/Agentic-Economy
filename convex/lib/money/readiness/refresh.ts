"use node"

import { deploymentPaymentEnvironment, type PaymentEnvironment } from '@/lib/deployment/environment'
import { boundaryCauseKind, degradeBackend } from '@/lib/observability/degrade-backend'
import { isRecord } from '@/modules/common/is-record'
import { sendGuardedHttpRequest } from '@/modules/network-guard/server'
import { cdpX402CustodyConfigurationFromEnvironment, readCdpX402CustodyReadiness } from '@/modules/capability-supply/server'
import { createFormanceContext, readFormanceConfiguration, readFormanceHealth } from '../formance/gateway'
import { backendPaymentReadinessDigest, paymentReadinessExpiresAt, sealPaymentReadinessSnapshot,
  type PaymentReadinessCheck, type PaymentReadinessChecks } from '@/modules/money/payment-readiness'
import { readX402PayeeScreeningReadiness } from '@/modules/money/x402-payee-screening.server'
import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import { readTreasuryChainObservation } from '../treasury/chainObservation'
import type { PaymentReadinessSourceChecks } from './sourceChecks'

const VALID_FOR_MS = 10 * 60_000
type RefreshResult = { kind: 'published'; replayed: boolean } | { kind: 'refused'; code: string }

/**
 * Requires admitted workload authority and this runtime's explicit environment.
 * Ensures one complete, credential-bound observation; each source retains its
 * own expiry. Probe clocks start before I/O, never at delayed completion.
 * Invariant: all provider operations are read-only; no signing/funding effects.
 * On violation: named failed checks are published; invalid/late publication is
 * refused by the transaction. No retry loop or last-good readiness fallback.
 */
export async function refreshPaymentReadiness(ctx: ActionCtx): Promise<RefreshResult> {
  const startedAt = Date.now()
  const environment = deploymentPaymentEnvironment(process.env)
  if (environment === undefined) return { kind: 'refused', code: 'readiness_environment_mismatch' }
  const configurationDigest = backendPaymentReadinessDigest(process.env)
  const expiresAt = startedAt + VALID_FOR_MS
  const custody = cdpX402CustodyConfigurationFromEnvironment(process.env)
  const [web, formance, cdp, chain, sources] = await Promise.all([
    readWebConfiguration(process.env, environment, expiresAt),
    readLedgerHealth(expiresAt).catch(cause => sourceFailure(cause, 'formance_readiness_unavailable')),
    readCdpX402CustodyReadiness(process.env, environment).catch(cause => ({
      kind: 'unavailable' as const, code: sourceFailure(cause, 'cdp_custody_read_unavailable').code,
    })),
    custody === undefined ? undefined
      : readTreasuryChainObservation({ environment, address: custody.expectedEvmAddress, now: startedAt })
        .catch(cause => ({ kind: 'unavailable' as const, code: sourceFailure(cause, 'treasury_rpc_unavailable').code })),
    ctx.runQuery(internal.moneyReadiness.readSourceChecks, { environment, now: startedAt })
      .catch((cause: unknown): PaymentReadinessSourceChecks => {
        const check = sourceFailure(cause, 'readiness_source_unavailable')
        return { reference_rate: check, commercial_policy: check, treasury: check }
      }),
  ])
  const screening = readX402PayeeScreeningReadiness()
  const checks: PaymentReadinessChecks = {
    web_configuration: web,
    formance,
    cdp_custody: cdp.kind === 'ready' ? { kind: 'passed', validUntil: expiresAt } : failed(cdp.code),
    base_rpc: chain?.kind === 'observed' ? { kind: 'passed', validUntil: Math.min(expiresAt, chain.blockTimestamp + VALID_FOR_MS) }
      : failed(chain?.code ?? 'treasury_chain_configuration_invalid'),
    sanctions: screening.kind === 'deferred'
      ? { kind: 'deferred', policyRef: screening.policyRef, validUntil: expiresAt }
      : failed(screening.code),
    ...sources,
  }
  const completedAt = Date.now()
  // A source can expire during I/O. Record its failure rather than extending it
  // or dropping the entire observation, which would conceal the named cause.
  for (const key of Object.keys(checks) as Array<keyof PaymentReadinessChecks>) {
    const check = checks[key]
    if ((check.kind === 'passed' || check.kind === 'deferred') && check.validUntil <= completedAt) checks[key] = failed('readiness_source_expired')
  }
  const snapshot = sealPaymentReadinessSnapshot({ environment, configurationDigest, startedAt, completedAt,
    expiresAt: paymentReadinessExpiresAt(startedAt, checks), checks })
  return await ctx.runMutation(internal.moneyReadiness.publish, { snapshot })
}

async function readLedgerHealth(validUntil: number): Promise<PaymentReadinessCheck> {
  const configured = readFormanceConfiguration()
  if (configured.kind !== 'configured') return failed(configured.code)
  const context = createFormanceContext({ ...configured.configuration, requestTimeoutMs: 5_000 },
    { signal: AbortSignal.timeout(10_000) })
  const result = await readFormanceHealth(context)
  // This verifies observed Ledger version/schema and gateway reachability.
  // The gatewayVersion field is a requirement constant, not live version proof.
  return result.kind === 'ready' ? { kind: 'passed', validUntil } : failed(result.code)
}

export async function readWebConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
  paymentEnvironment: PaymentEnvironment,
  validUntil: number,
): Promise<PaymentReadinessCheck> {
  const site = environment.AE_SITE_URL?.trim() ?? environment.SITE_URL?.trim()
  const convex = environment.CONVEX_CLOUD_URL
  if (site === undefined || convex === undefined) return failed('web_readiness_configuration_missing')
  try {
    const target = new URL(site)
    const source = new URL(convex)
    if (target.protocol !== 'https:' || target.username !== '' || target.password !== ''
      || target.pathname !== '/' || target.search !== '' || target.hash !== ''
      || source.protocol !== 'https:' || source.username !== '' || source.password !== ''
      || source.pathname !== '/' || source.search !== '' || source.hash !== '') return failed('web_readiness_configuration_invalid')
    target.pathname = '/api/ready'
    const response = await sendGuardedHttpRequest(new Request(target, {
      method: 'GET', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5_000),
    }), 32 * 1024)
    if (response.status !== 200 && response.status !== 503) return failed('web_readiness_unavailable')
    const body: unknown = await response.json()
    const successful = response.status === 200 && isRecord(body) && body.status === 'ready'
    const diagnostic = response.status === 503 && response.headers.get('content-type')?.split(';')[0] === 'application/problem+json'
      && isRecord(body) && body.type === 'about:blank' && body.status === 503
      && body.kind === 'UNAVAILABLE' && body.code === 'server_not_ready' && body.retryable === true
      && typeof body.title === 'string' && typeof body.detail === 'string'
    if (response.redirected || (!successful && !diagnostic) || !isRecord(body) || !isRecord(body.checks)
      || body.checks.config !== 'ready' || body.checks.convex !== 'ready'
      || !isRecord(body.deployment) || body.deployment.paymentEnvironment !== paymentEnvironment
      || body.deployment.convexOrigin !== source.origin) return failed('web_readiness_identity_mismatch')
    return { kind: 'passed', validUntil }
  } catch {
    return failed('web_readiness_unavailable')
  }
}

function failed(code: string): PaymentReadinessCheck { return { kind: 'failed', code } }

function sourceFailure(cause: unknown, code: string): Extract<PaymentReadinessCheck, { kind: 'failed' }> {
  return degradeBackend(boundaryCauseKind(cause), { kind: 'failed', code },
    { site: 'refreshPaymentReadiness', reason: 'source_unavailable' })
}
