import { useEffect, useState } from 'react'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/arc/badge/badge'
import { formatPerthTimestamp, timestampIso } from '@/lib/ui/format-time'
import { PAYMENT_READINESS_CHECK_KEYS, PAYMENT_READINESS_GATING_KEYS, referenceRateFresh, type PaymentReadinessCheck, type PaymentReadinessView } from '@/modules/money/payment-readiness'
import { ALPHA_X402_PAYEE_SCREENING_POLICY } from '@/modules/money/x402-spend-admission'
import './OverviewMetricsComposition.css'
import { ADMIN_OVERVIEW_COPY } from '../overview.contracts'

export type ConfigurationBannerProps = Readonly<{ readiness: PaymentReadinessView | null; compact?: boolean }>

const CHECK_LABELS: Readonly<Record<typeof PAYMENT_READINESS_CHECK_KEYS[number], string>> = {
  web_configuration: 'Web configuration',
  formance: 'Formance',
  cdp_custody: 'CDP custody',
  base_rpc: 'Base RPC providers',
  reference_rate: 'USDC/AUD reference rate',
  sanctions: 'Payee screening policy',
  commercial_policy: 'Commercial approvals',
  treasury: 'Treasury reconciliation',
}
const CHECK_FAILURES: Readonly<Record<typeof PAYMENT_READINESS_CHECK_KEYS[number], string>> = {
  web_configuration: 'The live web deployment did not prove its configuration and backend identity.',
  formance: 'The live ledger did not prove the required health, version and schema.',
  cdp_custody: 'The live custody account and policies could not be verified.',
  base_rpc: 'The two RPC providers did not prove matching finalized chain evidence.',
  reference_rate: 'A current USDC/AUD reference rate is unavailable.',
  sanctions: 'The screening provider could not establish readiness.',
  commercial_policy: 'Current commercial approvals are incomplete or unavailable.',
  treasury: 'Fresh reconciliation, liquidity and spending capacity could not be verified.',
}
const FAILURE_REASONS: Readonly<Record<string, string>> = {
  readiness_evidence_missing: 'No current readiness evidence is available.',
  readiness_configuration_changed: 'Deployment configuration changed. Fresh readiness evidence is required.',
  readiness_environment_mismatch: 'The readiness evidence does not match this deployment.',
  readiness_expired: 'Readiness evidence has expired. A fresh check is required.',
  readiness_source_expired: 'Source evidence expired during the readiness check.',
  readiness_snapshot_invalid: 'The readiness evidence could not be verified.',
  readiness_clock_invalid: 'The readiness timestamp could not be verified.',
  trm_tenant_contract_unavailable: 'The verified TRM Wallet Screening tenant contract is not connected.',
  cdp_custody_policy_mismatch: 'The live CDP policies do not match the required signing restrictions.',
  cdp_custody_account_mismatch: 'The live CDP account does not match the configured wallet.',
  cdp_custody_not_found: 'The configured CDP account or policy was not found.',
  cdp_custody_configuration_invalid: 'The required CDP custody configuration is incomplete or invalid.',
  formance_component_version_drift: 'The installed ledger version does not match the required version.',
  reference_rate_stale: 'The USDC/AUD reference rate is missing or stale.',
  web_readiness_identity_mismatch: 'The live web deployment has not passed its configuration and backend identity checks.',
}

/**
 * A visible pass requires current backend evidence. Expiry and returning to this
 * tab update the clock without waiting for a database write; neither can restore
 * an expired pass. Readiness is informational, never a command override.
 */
export function ConfigurationBanner({ readiness, compact = false }: ConfigurationBannerProps) {
  const [now, setNow] = useState<number | null>(null)
  const expiresAt = readiness?.expiresAt ?? null
  useEffect(() => {
    const updateClock = () => setNow(Date.now())
    updateClock()
    const timer = expiresAt !== null && expiresAt > Date.now()
      ? window.setTimeout(updateClock, expiresAt - Date.now()) : undefined
    window.addEventListener('focus', updateClock)
    document.addEventListener('visibilitychange', updateClock)
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      window.removeEventListener('focus', updateClock)
      document.removeEventListener('visibilitychange', updateClock)
    }
  }, [expiresAt])
  const expired = now !== null && expiresAt !== null && now >= expiresAt
  const ready = now !== null && readiness?.kind === 'ready' && !expired && expiresAt !== null
    && readiness.checkedAt !== null && readiness.checkedAt <= now
    && PAYMENT_READINESS_GATING_KEYS.every(key => {
      const check = readiness.checks[key]
      return (check.kind === 'passed' || (key === 'sanctions' && check.kind === 'deferred'
        && check.policyRef === ALPHA_X402_PAYEE_SCREENING_POLICY))
        && check.validUntil > now
    })
  const quotesDegraded = ready && !referenceRateFresh(readiness.checks.reference_rate, now)
  const verdict = !ready ? 'Not ready' : quotesDegraded ? 'Ready, quotes degraded' : 'Ready'
  const summary = readiness === null ? 'The deployment money environment is missing or invalid.'
    : expired ? FAILURE_REASONS.readiness_expired
      : readiness.code === null ? null : FAILURE_REASONS[readiness.code] ?? 'One or more required checks have failed.'
  return (
    <AeSection title={ADMIN_OVERVIEW_COPY.configurationTitle} description={ADMIN_OVERVIEW_COPY.configurationDescription} className="arc-market arc-overview-configuration">
      <div className="mb-related grid gap-intra">
        {/* A readiness flip is a new status, not a label morph: remount so the live region never holds both words. */}
        <p role="status" aria-label="Payment readiness status"><Badge key={verdict} tone={verdict === 'Ready' ? 'neutral' : 'warning'}>{verdict}</Badge></p>
        {ready && readiness?.checks.sanctions.kind === 'deferred'
          ? <p className="text-sm">Payee screening deferred under the alpha policy; payees are not screened.</p> : null}
        {quotesDegraded
          ? <p className="text-sm">Quotes are refused until the USDC/AUD reference rate refreshes; payment readiness does not depend on it.</p> : null}
        <p className="text-sm">{readiness === null ? 'Environment: Not declared'
          : readiness.environment === 'production' ? 'Environment: Production · Base' : 'Environment: Sandbox · Base Sepolia'}</p>
        {summary === null ? null : <p className="text-sm text-muted-foreground">{summary}</p>}
        <p className="text-xs text-muted-foreground">Checked: {readiness?.checkedAt == null ? 'No evidence'
          : <time dateTime={timestampIso(readiness.checkedAt)}>{formatPerthTimestamp(readiness.checkedAt)}</time>}
          {' · '}Valid until: {expiresAt === null ? 'No valid evidence'
            : <time dateTime={timestampIso(expiresAt)}>{formatPerthTimestamp(expiresAt)}</time>}</p>
      </div>
      <details open={!compact}>
        <summary className="min-h-touch cursor-pointer py-intra text-sm font-medium">Inspect readiness evidence</summary>
      <dl className="integrations-list">
        {PAYMENT_READINESS_CHECK_KEYS.map(key => <ReadinessCheckRow key={key} name={key}
          check={readiness?.checks[key]} now={now} expired={expired} />)}
      </dl>
      </details>
    </AeSection>
  )
}

// One local row component keeps the eight check explanations separate from the
// summary's expiry subscription. No new state, public surface or file boundary.
function ReadinessCheckRow({ name, check, now, expired }: Readonly<{
  name: typeof PAYMENT_READINESS_CHECK_KEYS[number]
  check: PaymentReadinessCheck | undefined
  now: number | null
  expired: boolean
}>) {
  const passed = now !== null && check?.kind === 'passed' && !expired && check.validUntil > now
  const deferred = now !== null && name === 'sanctions' && check?.kind === 'deferred'
    && check.policyRef === ALPHA_X402_PAYEE_SCREENING_POLICY && !expired && check.validUntil > now
  // The reference rate never gates payments; an observed stale rate only degrades quoting.
  const degraded = name === 'reference_rate' && !expired && !passed
    && (check?.kind === 'passed' || (check?.kind === 'failed' && check.code === 'reference_rate_stale'))
  let reason = FAILURE_REASONS.readiness_expired
  if (!expired) {
    if (check === undefined) reason = 'No readiness evidence is available.'
    else if (check.kind === 'failed') reason = FAILURE_REASONS[check.code] ?? CHECK_FAILURES[name]
    else if (deferred) reason = 'Payees are not screened under the approved alpha policy.'
    else if (passed) reason = name === 'web_configuration'
      ? 'Clerk and Sentry configured; backend identity verified.' : 'Current evidence verified.'
  }
  return <div className="arc-overview-readiness-row">
    <dt className="text-sm text-muted-foreground">{CHECK_LABELS[name]}</dt>
    <dd className="mt-intra grid gap-intra"><span className="font-medium">{deferred ? 'Deferred' : passed ? 'Passed' : degraded ? 'Degraded' : 'Failed'}</span>
      <span className="text-xs text-muted-foreground">{reason}</span></dd>
  </div>
}
