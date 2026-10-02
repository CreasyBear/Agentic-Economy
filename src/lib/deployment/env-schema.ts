import { z } from 'zod'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import { deploymentPaymentEnvironment } from './environment'
import { DEPLOYMENT_MANIFEST, fieldRules, validateDeploymentManifest, type FieldRule } from './manifest'

export type EnvValidationProblem = Readonly<{ name: string; reason: string }>
export type EnvValidationResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; problems: readonly EnvValidationProblem[] }>

const kindSchemas: Readonly<Record<FieldRule['kind'], z.ZodType<string>>> = {
  url: z.url(),
  boolean: z.enum(['true', 'false']),
  'host-list': z.string().min(1).refine(value =>
    value.split(',').every(entry => entry.trim().length > 0)),
  'credential-ref': z.string().min(1),
}

const clerkWebhookConfigurationNames = new Set([
  ...DEPLOYMENT_MANIFEST.configuration.sharedProduction.flatMap(group => group.names),
  ...DEPLOYMENT_MANIFEST.configuration.forbiddenProduction,
  'AE_CANONICAL_HOST_ALLOWLIST',
])

/**
 * Requires the declared environment and its identity/source authority rules.
 * Ensures identity callbacks remain available while money providers need setup.
 * Invariant: production credential, URL and source-key rules still come from
 * the manifest; unrelated payment readiness never grants webhook authority.
 * On violation: return only configuration names/codes, before source mutation.
 */
export function validateClerkWebhookEnvironment(
  env: NodeJS.ProcessEnv,
  environment: 'development' | 'production',
): EnvValidationResult {
  // Preserve development admission; only production sheds unrelated readiness.
  if (deploymentPaymentEnvironment(env) !== 'production') return validateEnvironment(env, environment)

  const result = validateDeploymentManifest(env, { environment })
  const problems = result.findings
    .filter(finding => finding.names.some(name => clerkWebhookConfigurationNames.has(name)
      || name.startsWith('AE_SOURCE_WRITE_') || name.startsWith('VITE_AE_SOURCE_WRITE_')))
    .flatMap(finding => finding.names.map(name => Object.freeze({ name, reason: finding.code })))
  const token = readTrimmedEnv(env, 'AE_CONVEX_SERVER_FUNCTION_TOKEN')
  if (token !== undefined && token.length < 32) {
    problems.push({ name: 'AE_CONVEX_SERVER_FUNCTION_TOKEN', reason: 'server_function_auth_invalid' })
  }
  return problems.length === 0 ? { ok: true } : { ok: false, problems: Object.freeze(problems) }
}

/**
 * Requires an explicit money world; production requires the complete manifest.
 * Ensures production boot and diagnostics share one semantic decision.
 * Invariant: a production build does not turn development money into live money;
 * findings contain names/codes, never supplied credentials or URLs.
 * On violation: named problems, without provider calls or payment effects.
 */
export function validateEnvironment(
  env: NodeJS.ProcessEnv,
  environment: 'development' | 'production',
): EnvValidationResult {
  const paymentEnvironment = deploymentPaymentEnvironment(env)
  if (paymentEnvironment === undefined) return {
    ok: false,
    problems: [Object.freeze({ name: 'AE_DEPLOYMENT_ENVIRONMENT', reason: 'must be exactly production or development' })],
  }
  if (paymentEnvironment === 'sandbox') {
    if (environment !== 'production') return { ok: true }
    // Preserve hosted sandbox's shared presence/basic-shape contract. Live
    // credentials, money groups and semantic payment checks are production-only.
    const problems: EnvValidationProblem[] = []
    for (const group of DEPLOYMENT_MANIFEST.configuration.sharedProduction) {
      const values = group.names.map(name => ({ name, value: readTrimmedEnv(env, name) }))
      if (group.mode === 'one-of' && !values.some(({ value }) => value !== undefined)) {
        problems.push(...group.names.map(name => ({ name, reason: 'required in production but missing (one-of group)' })))
        continue
      }
      for (const { name, value } of values) {
        if (value === undefined) {
          if (group.mode === 'all') problems.push({ name, reason: 'required in production but missing' })
          continue
        }
        const rule = fieldRules.find(rule => rule.name === name)
        const result = (rule === undefined ? z.string().min(1) : kindSchemas[rule.kind]).safeParse(value)
        if (!result.success) problems.push({ name, reason: result.error.issues[0]?.message ?? 'invalid value' })
      }
    }
    for (const name of DEPLOYMENT_MANIFEST.configuration.forbiddenProduction) {
      if (readTrimmedEnv(env, name) !== undefined) problems.push({ name, reason: 'forbidden in production but present' })
    }
    return problems.length === 0 ? { ok: true } : { ok: false, problems: Object.freeze(problems) }
  }
  const result = validateDeploymentManifest(env, { environment })
  if (result.ok) return { ok: true }
  return {
    ok: false,
    problems: Object.freeze(result.findings.flatMap(finding => finding.names.map(name =>
      Object.freeze({ name, reason: finding.code })))),
  }
}
