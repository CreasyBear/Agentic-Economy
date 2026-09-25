import { X402_CUSTODY_ENV_NAMES, cdpX402CustodyConfigurationFromEnvironment } from '@/modules/capability-supply/internal/x402-custody-configuration'
import { isMoneyRefusal } from '@/modules/money/public'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import { readStripeMoneyProviderConfig, STRIPE_MONEY_ENV_NAMES } from '@/lib/server/stripe-money-provider-config'
import type { CliOptions } from '../../lib/args'
import { continuationCommand } from '../../lib/continuation-command'

export type DoctorGroup = 'discovery' | 'quoting' | 'purchase'
export type GroupState = 'pass' | 'warn' | 'fail' | 'skipped'

export type DoctorTier = Readonly<{ level: 0 | 1; missing: readonly string[] }>

export type DoctorResult = Readonly<{
  kind: 'ready' | 'degraded'
  information: Readonly<{ localProviderEnvironment: DoctorTier }>
  groups: Readonly<Record<DoctorGroup, GroupState>>
  checks: readonly DoctorCheck[]
}>

export type DoctorCheck = Readonly<{
  id: string
  group: DoctorGroup
  state: 'pass' | 'warn' | 'fail' | 'skipped'
  summary: string
  reason?: string
  nextCommand?: string
  /** Machine-readable discriminator for a skip reason, so CI can gate on it instead of matching free text. */
  code?: string
}>

/** Checks stay group-free so one table owns the discovery/quoting/purchase split. */
export type DoctorCheckDraft = Omit<DoctorCheck, 'group'>

export type CallDoctorResult = Readonly<{
  check: DoctorCheckDraft
  recentCompletedToolRef?: string
}>
export function stripeTestModeConfigured(): boolean {
  return !isMoneyRefusal(readStripeMoneyProviderConfig(process.env))
}

function x402SandboxConfigured(): boolean {
  return cdpX402CustodyConfigurationFromEnvironment(process.env) !== undefined
}

function missingEnvNames(names: readonly string[]): readonly string[] {
  return names.filter((name) => readTrimmedEnv(process.env, name) === undefined)
}

export function computeTier(): DoctorTier {
  const stripeReady = stripeTestModeConfigured()
  const x402Ready = x402SandboxConfigured()
  if (stripeReady && x402Ready) return { level: 1, missing: [] }
  return {
    level: 0,
    missing: [
      ...(stripeReady ? [] : missingEnvNames(STRIPE_MONEY_ENV_NAMES)),
      ...(x402Ready ? [] : missingEnvNames(X402_CUSTODY_ENV_NAMES)),
    ],
  }
}
export function originFlags(options: Pick<CliOptions, 'baseUrl' | 'baseUrlSource'>): readonly string[] {
  return options.baseUrlSource === undefined || options.baseUrlSource === 'hosted_default'
    ? []
    : ['--base-url', options.baseUrl]
}

/**
 * A next command is always the machine-readable (`--json`) invocation, so the
 * human renderer and the JSON `nextCommand` field print the identical string:
 * one source of truth regardless of which mode this run itself used.
 */
function continuationFlags(options: Pick<CliOptions, 'baseUrl' | 'baseUrlSource'>): readonly string[] {
  return [...originFlags(options), '--json']
}

export function doctorContinuation(
  options: Pick<CliOptions, 'baseUrl' | 'baseUrlSource'>,
  tokens: readonly (string | number | undefined)[],
): string {
  return continuationCommand([...tokens, ...continuationFlags(options)])
}
