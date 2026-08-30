import { canonicalDigest } from '@/modules/common/canonical-digest'
import { OPERATION_INVOKE_ACTION_ID, OPERATION_INVOKE_HTTP_PATH } from '@/modules/capability-execution/operation-invoke-entry'
import {
  SourceWriteAdmissionScopeValues,
  resolveActiveSourceWriteSigningKey,
  sourceWriteKeyFamilyForScope,
} from '@/modules/security/source-write-admission'
import type { StableHashValue } from '@/modules/common/stable-hash'

export type DeploymentEnvironment = 'production' | 'preview' | 'development' | 'test'
export type DeploymentEnvironmentInput = Readonly<Record<string, string | undefined>>
export type DeploymentFindingKind = 'missing' | 'forbidden' | 'malformed' | 'unknown' | 'conflict' | 'runtime'
export type DeploymentFinding = Readonly<{ kind: DeploymentFindingKind; code: string; names: readonly string[]; scope: string }>
export type ValidateDeploymentOptions = Readonly<{ environment?: DeploymentEnvironment; nodeMajor?: number }>
export type DeploymentValidationResult = Readonly<{
  ok: boolean
  manifestVersion: typeof DEPLOYMENT_MANIFEST.schemaVersion
  environment: DeploymentEnvironment
  findings: readonly DeploymentFinding[]
  fingerprint: string
  runtime: Readonly<{ expectedNodeMajor: 22; compatible: boolean; observedNodeMajor?: number }>
  configuration: typeof DEPLOYMENT_MANIFEST.configuration
  resources: typeof DEPLOYMENT_MANIFEST.resources
  readinessProbes: typeof DEPLOYMENT_MANIFEST.readinessProbes
}>

type FieldRule = Readonly<{ name: string; kind: 'url' | 'host-list' | 'boolean' | 'credential-ref'; target?: string }>
type RequirementGroup = Readonly<{ scope: string; code: string; names: readonly string[]; mode: 'all' | 'one-of'; trigger?: readonly string[] }>

export const SOURCE_WRITE_FAMILIES = ['billing', 'protected', 'catalog', 'operator', 'repair', 'session'] as const
const sourceWriteNames = SOURCE_WRITE_FAMILIES.map((family) => `AE_SOURCE_WRITE_KEY_${family.toUpperCase()}`)
const sourceWriteDerivedNames = SOURCE_WRITE_FAMILIES.flatMap((family) => {
  const suffix = family.toUpperCase()
  return [
    `AE_SOURCE_WRITE_PREVIOUS_KEYS_${suffix}`,
    `AE_SOURCE_WRITE_DERIVED_KEY_ID_${suffix}`,
    `AE_SOURCE_WRITE_PREVIOUS_DERIVED_KEY_IDS_${suffix}`,
  ]
})
const forbiddenProductionNames = Object.freeze([
  'AE_SOURCE_WRITE_SECRET',
  'VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E',
  'AE_DEV_WBA_SMOKE_ENABLED',
  'AE_DEV_WBA_SMOKE_SECRET',
  'AE_DEV_WBA_SIGNATURE_AGENT',
  'AE_LOCAL_DEV_VITE_ARGS',
  'AE_X402_PAYMENT_CREDENTIAL_REF',
  'AE_X402_PAYMENT_PRIVATE_KEY',
  'CONVEX_SELF_HOSTED_ADMIN_KEY',
  'AE_API_KEY',
])

const requiredProduction: readonly RequirementGroup[] = [
  { scope: 'canonical', code: 'canonical_origin_required', names: ['AE_CANONICAL_BASE_URL', 'AE_CANONICAL_HOST_ALLOWLIST'], mode: 'one-of' },
  { scope: 'convex', code: 'convex_source_required', names: ['CONVEX_URL', 'VITE_CONVEX_URL'], mode: 'one-of' },
  { scope: 'convex-auth', code: 'server_function_auth_required', names: ['AE_CONVEX_SERVER_FUNCTION_TOKEN'], mode: 'all' },
  { scope: 'clerk', code: 'required_configuration_missing', names: ['VITE_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY', 'CLERK_JWT_ISSUER_DOMAIN'], mode: 'all' },
  { scope: 'model-gateway', code: 'required_configuration_missing', names: ['OPENROUTER_API_KEY', 'AE_LLM_MODEL'], mode: 'all' },
  { scope: 'chat-proxy', code: 'required_configuration_missing', names: ['AE_CHAT_PROXY_SECRET'], mode: 'all' },
  { scope: 'source-write', code: 'source_write_family_required', names: sourceWriteNames, mode: 'all' },
  { scope: 'x402-payment', code: 'x402_payment_custody_required', names: ['CDP_API_KEY_ID', 'CDP_API_KEY_SECRET', 'CDP_WALLET_SECRET', 'AE_X402_CDP_ACCOUNT_NAME', 'AE_X402_CDP_EXPECTED_EVM_ADDRESS', 'AE_X402_CDP_ACCOUNT_POLICY_ID', 'AE_X402_CDP_PROJECT_POLICY_ID', 'AE_X402_CDP_CREDENTIAL_GENERATION', 'AE_X402_CUSTODY_ENABLED', 'AE_X402_CUSTODY_MAX_ATOMIC', 'AE_X402_CUSTODY_DAILY_MAX_ATOMIC', 'AE_X402_RPC_URLS_JSON'], mode: 'all' },
  { scope: 'stripe-money', code: 'stripe_configuration_required', names: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'VITE_STRIPE_PUBLISHABLE_KEY'], mode: 'all' },
]

const liveGatewaySmokeNames = [
  'AE_GATEWAY_SMOKE_CONFIRM_LIVE_SPEND',
  'AE_GATEWAY_SMOKE_RUN_ID',
  'AE_GATEWAY_SMOKE_BASE_URL',
  'AE_GATEWAY_SMOKE_JOB_QUERY',
  'AE_GATEWAY_SMOKE_OWNER_QUERY',
  'AE_GATEWAY_SMOKE_INPUT_JSON',
  'AE_GATEWAY_SMOKE_API_KEY',
  'AE_GATEWAY_SMOKE_RELEASE_API_KEY',
  'AE_RELEASE_SOURCE_REVISION',
  'AE_RELEASE_DEPLOYMENT_ID',
  'AE_RELEASE_CONVEX_DEPLOYMENT_ID',
  'AE_RELEASE_CONVEX_URL',
  'AE_GATEWAY_SMOKE_OWNER_OPENAPI_DOCUMENT_JSON',
  'AE_GATEWAY_SMOKE_OWNER_OPENAPI_PATH',
  'AE_GATEWAY_SMOKE_OWNER_OPENAPI_METHOD',
  'AE_GATEWAY_SMOKE_OWNER_CLERK_SESSION_ID',
  'AE_GATEWAY_SMOKE_OWNER_CLERK_USER_ID',
  'AE_GATEWAY_SMOKE_CONTROL_BUSINESS_ID',
  'AE_GATEWAY_SMOKE_CREDENTIAL_ID',
  'AE_GATEWAY_SMOKE_TOPUP_AMOUNT_JSON',
  'CLERK_SECRET_KEY',
] as const

const conditional: readonly RequirementGroup[] = [
  {
    scope: 'routing', code: 'route_signing_pair_incomplete', names: ['AE_ROUTE_CALL_SIGNING_SECRET', 'AE_ROUTE_CALL_SIGNING_KEY_ID'], mode: 'all',
    trigger: ['AE_ROUTE_CALL_SIGNING_SECRET', 'AE_ROUTE_CALL_SIGNING_KEY_ID'],
  },
  {
    scope: 'security:chat-share', code: 'secret_key_id_without_secret', names: ['AE_CHAT_SHARE_SECRET', 'AE_CHAT_SHARE_KEY_ID'], mode: 'all',
    trigger: ['AE_CHAT_SHARE_SECRET', 'AE_CHAT_SHARE_KEY_ID'],
  },
  {
    scope: 'observability:build', code: 'sentry_build_configuration_partial', names: ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'], mode: 'all',
    trigger: ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'],
  },
  {
    scope: 'release:live-gateway-smoke',
    code: 'live_gateway_smoke_configuration_incomplete',
    names: liveGatewaySmokeNames,
    mode: 'all',
    trigger: ['AE_GATEWAY_SMOKE_CONFIRM_LIVE_SPEND', 'AE_GATEWAY_SMOKE_RUN_ID'],
  },
]

const optionalNames = Object.freeze([
  'AE_CSP_REPORT_ONLY', 'AE_COOKIE_SECURE',
  'AE_DISABLE_OBSERVABILITY', 'VITE_AE_DISABLE_OBSERVABILITY', 'AE_ROUTING_PUBLIC_BASE_URL',
  'AE_SITE_URL', 'SITE_URL', 'VITE_SENTRY_DSN', 'SENTRY_DSN', 'VITE_SENTRY_ENVIRONMENT',
  'SENTRY_ENVIRONMENT', 'SENTRY_RELEASE', 'VITE_POSTHOG_KEY', 'POSTHOG_KEY', 'VITE_POSTHOG_HOST', 'POSTHOG_HOST',
  'VITE_POSTHOG_APP_URL', 'POSTHOG_APP_URL',   'AE_WBA_SIGNATURE_AGENT_ALLOWLIST', 'AE_WBA_DIRECTORY_PUBLIC_JWK_JSON',
  'AE_CLI_BASE_URL',
])

const fieldRules: readonly FieldRule[] = [
  { name: 'AE_CANONICAL_BASE_URL', kind: 'url' }, { name: 'AE_CANONICAL_HOST_ALLOWLIST', kind: 'host-list' },
  { name: 'CONVEX_URL', kind: 'url' }, { name: 'VITE_CONVEX_URL', kind: 'url' }, { name: 'CLERK_JWT_ISSUER_DOMAIN', kind: 'url' },
  { name: 'AE_GATEWAY_SMOKE_BASE_URL', kind: 'url' }, { name: 'AE_RELEASE_CONVEX_URL', kind: 'url' },
  { name: 'AE_GATEWAY_SMOKE_CONFIRM_LIVE_SPEND', kind: 'boolean' },
  { name: 'AE_OPENROUTER_API_BASE_URL', kind: 'url' }, { name: 'SITE_URL', kind: 'url' }, { name: 'AE_SITE_URL', kind: 'url' },
  { name: 'AE_X402_CUSTODY_ENABLED', kind: 'boolean' },
  { name: 'AE_ROUTING_PUBLIC_BASE_URL', kind: 'url' }, { name: 'VITE_POSTHOG_HOST', kind: 'url' }, { name: 'POSTHOG_HOST', kind: 'url' },
  { name: 'VITE_POSTHOG_APP_URL', kind: 'url' }, { name: 'POSTHOG_APP_URL', kind: 'url' },
  { name: 'AUTUMN_API_BASE_URL', kind: 'url' }, { name: 'AUTUMN_PORTAL_RETURN_BASE_URL', kind: 'url' },
  { name: 'AE_WBA_SIGNATURE_AGENT_ALLOWLIST', kind: 'host-list' },
  { name: 'AE_CSP_REPORT_ONLY', kind: 'boolean' },
  { name: 'AE_COOKIE_SECURE', kind: 'boolean' },
  { name: 'AE_DISABLE_OBSERVABILITY', kind: 'boolean' }, { name: 'VITE_AE_DISABLE_OBSERVABILITY', kind: 'boolean' },
  { name: 'VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', kind: 'boolean' }, { name: 'VITE_AE_OPERATOR_ADVANCED_NAV', kind: 'boolean' },
  { name: 'AE_DEV_WBA_SMOKE_ENABLED', kind: 'boolean' },
]

const knownNames = Object.freeze([
  'OPENROUTER_API_KEY', 'AE_CONVEX_SERVER_FUNCTION_TOKEN', 'VITE_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY',
  'AE_CHAT_PROXY_SECRET', 'AE_CHAT_SHARE_SECRET', 'AE_CHAT_SHARE_KEY_ID',
  'AE_SOURCE_WRITE_SECRET',
  'AE_ROUTE_CALL_SIGNING_KEY_ID', 'AE_X402_PAYMENT_CREDENTIAL_REF', 'AE_X402_PAYMENT_PRIVATE_KEY',
  'CDP_API_KEY_ID', 'CDP_API_KEY_SECRET', 'CDP_WALLET_SECRET', 'AE_X402_CDP_ACCOUNT_NAME', 'AE_X402_CUSTODY_MAX_ATOMIC',
  'SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT',
  'SENTRY_ENVIRONMENT', 'VITE_SENTRY_ENVIRONMENT', 'SENTRY_RELEASE', 'VITE_SENTRY_DSN', 'SENTRY_DSN', 'VITE_POSTHOG_KEY',
  'POSTHOG_KEY', 'VERCEL_ENV', 'VERCEL_DEPLOYMENT_ID', 'VERCEL_URL', 'AE_RELEASE_DEPLOYMENT_ID', 'AE_GATEWAY_SMOKE_RELEASE_API_KEY',
  'AE_DEV_WBA_SMOKE_SECRET', 'AE_DEV_WBA_SIGNATURE_AGENT', 'AE_LOCAL_DEV_VITE_ARGS', 'AE_KERNEL_PROOF_MANIFEST_JSON',
  'AE_KERNEL_PROOF_MANIFEST_PATH', 'AE_CLI_BASE_URL',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'VITE_STRIPE_PUBLISHABLE_KEY',
])

export const DEPLOYMENT_MANIFEST = Object.freeze({
  schemaVersion: 'ae.deployment-manifest:v1', version: 1,
  runtime: Object.freeze({ nodeMajor: 22, engine: 'nodejs22.x' }),
  configuration: Object.freeze({
    requiredProduction: Object.freeze(requiredProduction), conditional: Object.freeze(conditional), optional: optionalNames,
    forbiddenProduction: forbiddenProductionNames,
  }),
  resources: Object.freeze([
    Object.freeze({ id: 'web-server', kind: 'vercel-node-runtime', declaration: 'nitro.vercel.entryFormat=node' }),
    Object.freeze({
      id: 'convex-components',
      kind: 'convex-component-set',
      components: Object.freeze([
        'workpool',
        'rate-limiter',
        'agent',
        'aggregate:ownerActivationByStage',
        'aggregate:marketEvidence',
        'aggregate:marketOperationEvidence',
        'aggregate:marketOperationRatings',
        'aggregate:marketActiveOperations',
        'aggregate:marketActiveSuppliers',
      ]),
    }),
    Object.freeze({ id: 'agent-access', kind: 'clerk-api-key-agent-access', declaration: 'Clerk-issued bearer key; AE-owned principal, grant, policy, and revocation readback.' }),
    Object.freeze({ id: 'durable-invocation-workpool', kind: 'convex-workpool', components: Object.freeze(['workpool', 'operation-invocation-worker', 'operation-recovery-worker']) }),
    Object.freeze({ id: 'operation-gateway', kind: 'authenticated-action-gateway', action: `${OPERATION_INVOKE_ACTION_ID}:v1`, httpPath: OPERATION_INVOKE_HTTP_PATH, mcpPath: '/mcp' }),
    Object.freeze({
      id: 'convex-scheduled-jobs',
      kind: 'convex-cron-set',
      jobs: Object.freeze([
        'cleanup expired agent access oauth grants',
        'cleanup expired source write nonces',
        'reconcile due facilitator invocations',
        'refresh Agentic Economy API registry',
        'refresh Agentic Market snapshots',
        'refresh capability supply readiness',
        'refresh current market presence',
        'refresh facilitator discovery',
        'run daily supplier settlement',
      ]),
    }),
  ]),
  readinessProbes: Object.freeze([
    Object.freeze({ id: 'liveness', method: Object.freeze(['GET', 'HEAD']), path: '/api/health', dependencies: Object.freeze([]) }),
    Object.freeze({ id: 'readiness', method: Object.freeze(['GET', 'HEAD']), path: '/api/ready', dependencies: Object.freeze(['deployment-config', 'convex-source', 'source-authority']) }),
    Object.freeze({ id: 'release-readback', method: Object.freeze(['GET']), path: '/api/v1/release', dependencies: Object.freeze(['release-identity']) }),
  ]),
})

export function validateDeploymentManifest(environment: DeploymentEnvironmentInput = {}, options: ValidateDeploymentOptions = {}): DeploymentValidationResult {
  const findings: DeploymentFinding[] = []
  const seen = new Set<string>()
  const add = (kind: DeploymentFindingKind, code: string, names: readonly string[], scope: string) => {
    const sortedNames = [...new Set(names)].sort()
    const key = `${kind}:${code}:${scope}:${sortedNames.join(',')}`
    if (seen.has(key)) return
    seen.add(key)
    findings.push(Object.freeze({ kind, code, names: Object.freeze(sortedNames), scope }))
  }
  const envClass = resolveEnvironment(environment, options.environment, add)
  const production = envClass === 'production'
  const compatible = options.nodeMajor === undefined || options.nodeMajor === 22
  if (!compatible) add('runtime', 'node_runtime_incompatible', ['NODE_RUNTIME'], 'runtime')

  for (const name of Object.keys(environment)) {
    if (present(environment, name) !== undefined && (name.startsWith('AE_') || name.startsWith('VITE_AE_')) && !isKnown(name)) {
      add('unknown', 'unknown_deployment_environment', [name], 'environment')
    }
  }
  if (production) for (const name of forbiddenProductionNames) {
    if (present(environment, name) !== undefined) add('forbidden', 'production_local_or_fixture_configuration', [name], 'environment')
  }
  for (const group of requiredProduction) if (production) requireGroup(environment, group, add)
  for (const group of conditional) if (group.trigger?.some((name) => present(environment, name)) === true) requireGroup(environment, group, add)
  if (production) validateProductionClerkCredentials(environment, add)
  if (production) validateSourceWriteAuthority(environment, add)
  for (const rule of fieldRules) validateField(environment, rule, production, add)
  validateX402Custody(environment, add)
  validateX402RpcUrls(environment, add)

  const convex = present(environment, 'CONVEX_URL')
  const viteConvex = present(environment, 'VITE_CONVEX_URL')
  if (convex !== undefined && viteConvex !== undefined && convex !== viteConvex) add('conflict', 'convex_source_ambiguous', ['CONVEX_URL', 'VITE_CONVEX_URL'], 'convex')
  const resultFindings = Object.freeze(findings.sort((a, b) => `${a.kind}:${a.scope}:${a.code}:${a.names.join(',')}`.localeCompare(`${b.kind}:${b.scope}:${b.code}:${b.names.join(',')}`)))
  const runtime = Object.freeze({ expectedNodeMajor: 22 as const, compatible, ...(options.nodeMajor === undefined ? {} : { observedNodeMajor: options.nodeMajor }) })
  return Object.freeze({
    ok: resultFindings.length === 0, manifestVersion: DEPLOYMENT_MANIFEST.schemaVersion, environment: envClass,
    findings: resultFindings, fingerprint: deploymentConfigFingerprint(environment, { environment: envClass, ...(options.nodeMajor === undefined ? {} : { nodeMajor: options.nodeMajor }), unknownNames: resultFindings.filter((finding) => finding.kind === 'unknown').flatMap((finding) => finding.names) }),
    runtime, configuration: DEPLOYMENT_MANIFEST.configuration, resources: DEPLOYMENT_MANIFEST.resources, readinessProbes: DEPLOYMENT_MANIFEST.readinessProbes,
  })
}

export function deploymentConfigFingerprint(environment: DeploymentEnvironmentInput = {}, options: Readonly<{ environment?: DeploymentEnvironment; nodeMajor?: number; unknownNames?: readonly string[] }> = {}): string {
  const envClass = options.environment ?? resolveEnvironmentName(present(environment, 'NODE_ENV'))
  const names = [...new Set([
    ...fieldRules.map((rule) => rule.name),
    ...knownNames,
    ...sourceWriteNames,
    ...sourceWriteDerivedNames,
    ...requiredProduction.flatMap((group) => group.names),
    ...conditional.flatMap((group) => group.names),
  ])].sort()
  const unknownNames = options.unknownNames
    ?? Object.keys(environment).filter((name) => present(environment, name) !== undefined && (name.startsWith('AE_') || name.startsWith('VITE_AE_')) && !isKnown(name)).sort()
  const values: StableHashValue[] = names.map((name) => {
    const value = present(environment, name)
    return {
      name,
      present: value !== undefined,
      ...(value === undefined || isSecretDeploymentName(name) ? {} : { value }),
    }
  })
  const resources: readonly StableHashValue[] = DEPLOYMENT_MANIFEST.resources.map((resource) => {
    if ('declaration' in resource) {
      return { id: resource.id, kind: resource.kind, declaration: resource.declaration }
    }
    if ('components' in resource) {
      return { id: resource.id, kind: resource.kind, components: resource.components.map((component) => component) }
    }
    if ('action' in resource) {
      return {
        id: resource.id,
        kind: resource.kind,
        action: resource.action,
        httpPath: resource.httpPath,
        mcpPath: resource.mcpPath,
      }
    }
    if ('jobs' in resource) {
      return { id: resource.id, kind: resource.kind, jobs: resource.jobs.map((job) => job) }
    }
    throw new Error('deployment_manifest_resource_unrecognized')
  })
  const readinessProbes: readonly StableHashValue[] = DEPLOYMENT_MANIFEST.readinessProbes.map((probe) => ({
    id: probe.id,
    method: probe.method.map((method) => method),
    path: probe.path,
    dependencies: probe.dependencies.map((dependency) => dependency),
  }))
  const shape: StableHashValue = {
    manifestVersion: DEPLOYMENT_MANIFEST.schemaVersion,
    environment: envClass,
    runtime: { expectedNodeMajor: 22, ...(options.nodeMajor === undefined ? {} : { observedNodeMajor: options.nodeMajor }) },
    values,
    unknownNames: [...new Set(unknownNames)].sort(),
    resources,
    readinessProbes,
  }
  return canonicalDigest(shape)
}

function requireGroup(environment: DeploymentEnvironmentInput, group: RequirementGroup, add: (kind: DeploymentFindingKind, code: string, names: readonly string[], scope: string) => void): void {
  const missing = group.names.filter((name) => present(environment, name) === undefined)
  if (group.mode === 'one-of') {
    if (missing.length === group.names.length) add('missing', group.code, group.names, group.scope)
    return
  }
  for (const name of missing) add('missing', group.code, [name], group.scope)
}
function validateSourceWriteAuthority(
  environment: DeploymentEnvironmentInput,
  add: (kind: DeploymentFindingKind, code: string, names: readonly string[], scope: string) => void,
): void {
  for (const family of SOURCE_WRITE_FAMILIES) {
    const scope = SourceWriteAdmissionScopeValues.find(
      (candidate) => sourceWriteKeyFamilyForScope(candidate) === family,
    )
    if (scope === undefined) throw new Error(`source_write_scope_missing:${family}`)
    try {
      resolveActiveSourceWriteSigningKey(scope, environment)
    } catch {
      add(
        'malformed',
        'source_write_authority_invalid',
        [`AE_SOURCE_WRITE_KEY_${family.toUpperCase()}`],
        'source-write',
      )
    }
  }
}
function validateProductionClerkCredentials(
  environment: DeploymentEnvironmentInput,
  add: (kind: DeploymentFindingKind, code: string, names: readonly string[], scope: string) => void,
): void {
  const publishableKey = present(environment, 'VITE_CLERK_PUBLISHABLE_KEY')
  if (publishableKey !== undefined && !/^pk_live_[A-Za-z0-9_-]+$/u.test(publishableKey)) {
    add('malformed', 'clerk_publishable_key_invalid', ['VITE_CLERK_PUBLISHABLE_KEY'], 'clerk')
  }
  const secretKey = present(environment, 'CLERK_SECRET_KEY')
  if (secretKey !== undefined && !/^sk_live_[A-Za-z0-9_-]+$/u.test(secretKey)) {
    add('malformed', 'clerk_secret_key_invalid', ['CLERK_SECRET_KEY'], 'clerk')
  }
}
function validateX402RpcUrls(
  environment: DeploymentEnvironmentInput,
  add: (kind: DeploymentFindingKind, code: string, names: readonly string[], scope: string) => void,
): void {
  const value = present(environment, 'AE_X402_RPC_URLS_JSON')
  if (value === undefined) return
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      typeof parsed !== 'object'
      || parsed === null
      || Array.isArray(parsed)
      || Object.keys(parsed).length === 0
      || Object.keys(parsed).length > 32
      || Object.entries(parsed).some(([network, urls]) =>
        !/^eip155:[1-9]\d*$/u.test(network)
        || !Array.isArray(urls)
        || urls.length < 1
        || urls.length > 2
        || urls.some((url) => typeof url !== 'string' || !validUrl(url, true))
        || new Set(urls).size !== urls.length
      )
    ) throw new Error('invalid')
  } catch {
    add('malformed', 'x402_rpc_urls_invalid', ['AE_X402_RPC_URLS_JSON'], 'x402-payment')
  }
}
function validateX402Custody(
  environment: DeploymentEnvironmentInput,
  add: (kind: DeploymentFindingKind, code: string, names: readonly string[], scope: string) => void,
): void {
  const enabled = present(environment, 'AE_X402_CUSTODY_ENABLED')
  if (enabled !== undefined && enabled !== 'true') {
    add('malformed', 'x402_custody_not_enabled', ['AE_X402_CUSTODY_ENABLED'], 'x402-payment')
  }
  const maxAtomic = present(environment, 'AE_X402_CUSTODY_MAX_ATOMIC')
  if (maxAtomic !== undefined && !/^[1-9]\d*$/u.test(maxAtomic)) {
    add('malformed', 'x402_custody_cap_invalid', ['AE_X402_CUSTODY_MAX_ATOMIC'], 'x402-payment')
  }
}
function validateField(environment: DeploymentEnvironmentInput, rule: FieldRule, production: boolean, add: (kind: DeploymentFindingKind, code: string, names: readonly string[], scope: string) => void): void {
  const value = present(environment, rule.name)
  if (value === undefined || !isMalformed(rule, value, production)) return
  const code = rule.name === 'AE_CANONICAL_BASE_URL' ? 'url_configuration_invalid' : rule.name === 'AE_CANONICAL_HOST_ALLOWLIST' ? 'canonical_host_allowlist_invalid' : `${rule.name.toLowerCase()}_invalid`
  add('malformed', code, [rule.name], rule.name.startsWith('AE_') ? 'ae-config' : 'configuration')
}
function isMalformed(rule: FieldRule, value: string, production: boolean): boolean {
  if (rule.kind === 'credential-ref') return rule.target === undefined || value !== `env:${rule.target}`
  if (rule.kind === 'url') return !validUrl(value, production)
  if (rule.kind === 'host-list') return !value.split(',').every((entry) => validHost(entry.trim()))
  if (rule.kind === 'boolean') return value !== 'true' && value !== 'false' && !(rule.name === 'AE_CSP_REPORT_ONLY' && ['0', '1'].includes(value))
  return false
}
function validUrl(value: string, production: boolean): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (!production || url.protocol === 'https:')
      && url.username.length === 0
      && url.password.length === 0
      && url.search.length === 0
      && url.hash.length === 0
  } catch { return false }
}
function validHost(value: string): boolean {
  if (value.length === 0 || /\s/u.test(value) || (!value.includes('://') && /[/?#]/u.test(value))) return false
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0 && url.pathname === '/' && url.search.length === 0 && url.hash.length === 0
  } catch { return false }
}
function present(environment: DeploymentEnvironmentInput, name: string): string | undefined {
  const value = environment[name]?.trim()
  return value === undefined || value.length === 0 ? undefined : value
}
function isSecretDeploymentName(name: string): boolean {
  if (
    name === 'VITE_CLERK_PUBLISHABLE_KEY'
    || name === 'VITE_SENTRY_DSN'
    || name === 'VITE_POSTHOG_KEY'
    || name === 'VITE_STRIPE_PUBLISHABLE_KEY'
  ) return false
  if (name === 'AE_X402_RPC_URLS_JSON') return true
  return name === 'STRIPE_WEBHOOK_SECRET'
    || name.startsWith('AE_SOURCE_WRITE_KEY_')
    || name.startsWith('AE_SOURCE_WRITE_PREVIOUS_KEYS_')
    || name.includes('TOKEN')
    || name.includes('PASSWORD')
    || name.includes('SECRET')
    || name.includes('API_KEY')
    || name.endsWith('_KEY')
    || name.endsWith('_KEK')
}
function isKnown(name: string): boolean {
  return fieldRules.some((rule) => rule.name === name)
    || knownNames.includes(name)
    || requiredProduction.some((group) => group.names.includes(name))
    || conditional.some((group) => group.names.includes(name))
    || optionalNames.includes(name)
    || /^AE_SOURCE_WRITE_(?:KEY|PREVIOUS_KEYS|DERIVED_KEY_ID|PREVIOUS_DERIVED_KEY_IDS)_(?:BILLING|PROTECTED|CATALOG|OPERATOR|REPAIR|SESSION)$/u.test(name)
}
function resolveEnvironment(environment: DeploymentEnvironmentInput, requested: DeploymentEnvironment | undefined, add: (kind: DeploymentFindingKind, code: string, names: readonly string[], scope: string) => void): DeploymentEnvironment {
  const raw = present(environment, 'NODE_ENV')
  if (requested !== undefined) return requested
  if (raw === undefined) return 'production'
  if (raw === 'production' || raw === 'preview' || raw === 'development' || raw === 'test') return raw
  add('malformed', 'node_environment_invalid', ['NODE_ENV'], 'runtime')
  return 'production'
}
function resolveEnvironmentName(raw: string | undefined): DeploymentEnvironment {
  return raw === 'production' || raw === 'preview' || raw === 'development' || raw === 'test' ? raw : 'production'
}
