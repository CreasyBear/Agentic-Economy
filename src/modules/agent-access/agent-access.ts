import {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  CUSTOMER_REQUEST_AGENT_SCOPE,
  MARKET_OPERATIONS_INVOKE_SCOPE,
  MARKET_SUPPLY_MANAGE_SCOPE,
  agentAuthorityModeAllows,
  agentAuthorityModeForScopes,
  agentAuthorityScopeForMode,
  type AgentAccessAuthorityMode,
} from './contract'
import {
  AGENT_ACCESS_ENVIRONMENT_VALUES,
  normalizeAgentAccessOperationSelection,
  type AgentAccessEnvironment,
  type AgentAccessOperationAccess,
  type AgentAccessPolicy,
} from './policy'
import { compareExactAmounts, type ExactAmount } from '@/modules/money/public'
import { sanitizeTelemetryError } from '@/lib/observability/private-route-safety'
import { canonicalDigest } from '@/modules/common/canonical-digest'

export const AGENT_ACCESS_KEY_TTL_SECONDS = 7 * 24 * 60 * 60
export const AGENT_ACCESS_MIN_TTL_SECONDS = 1
export const AGENT_ACCESS_MAX_TTL_SECONDS = 365 * 24 * 60 * 60
export const AGENT_ACCESS_PURPOSE = 'agent_access' as const
export const AGENT_ACCESS_DEFAULT_APPLICATION_REF = 'agentic-economy' as const
export { AGENT_ACCESS_ENVIRONMENT_VALUES }
export type { AgentAccessEnvironment }

export type AgentAccessPrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: AgentAccessEnvironment
  scopes: readonly string[]
  authorityMode: AgentAccessAuthorityMode
}>

export type AgentAccessKeyResult =
  | Readonly<{ kind: 'created' | 'replayed'; keyId: string; secret: string; expiresInSeconds: number; authorityMode: AgentAccessAuthorityMode; scopes: readonly string[]; grantRef: string }>
  | Readonly<{
      kind: 'error'
      code: 'missing_auth' | 'invalid_input' | 'idempotency_conflict' | 'issuance_unavailable'
      retryable: boolean
      reconciliation?: 'provider_credential_revoked' | 'provider_revocation_required'
    }>

export type AgentAccessKeyInventoryItem = Readonly<{
  keyId: string
  name: string
  applicationRef: string
  environment: AgentAccessEnvironment
  authorityMode: AgentAccessAuthorityMode
  scopes: readonly string[]
  createdAt?: number
  expiresAt?: number
  revoked: boolean
  expired: boolean
  grantRef?: string
}>

export type AgentAccessGrantRegistrationInput = Readonly<{
  grantRef: string
  principalId: string
  ownerId: string
  applicationRef: string
  credentialId: string
  environment: AgentAccessEnvironment
  operationAccess: AgentAccessOperationAccess
  operationRefs: readonly string[]
  authorityMode: AgentAccessAuthorityMode
  policy: AgentAccessPolicy
  lifecycle: 'active'
  generation: number
  createdAt: number
  updatedAt: number
  expiresAt: number
}>

export type AgentAccessGrantBinding = Readonly<{
  kind: 'recorded' | 'replayed'
  grantRef: string
  generation: number
  policyDigest: string
  lifecycle: 'active' | 'revoked' | 'expired'
  expiresAt: number
}>

export type AgentAccessGrantRegistrationResult = Readonly<{
  kind: 'recorded' | 'replayed' | 'conflict' | 'unavailable'
  grantRef?: string
  generation?: number
  policyDigest?: string
  lifecycle?: 'active' | 'revoked' | 'expired'
  expiresAt?: number
}>

export type IssuedAgentBindingRegistration = Readonly<{
  issuanceKey: string
  grantRef: string
  credentialId: string
  displayName: string
  applicationRef: string
  environment: AgentAccessEnvironment
  scopes: readonly string[]
  authorityMode: AgentAccessAuthorityMode
  operationAccess: AgentAccessOperationAccess
  operationRefs: readonly string[]
  policy: AgentAccessPolicy
  createdAt: number
  expiresAt: number
}>

export type AgentCredentialReplacementRegistration = Readonly<{
  principalRef: string
  issuanceKey: string
  grantRef: string
  credentialId: string
  applicationRef: string
  environment: AgentAccessEnvironment
  scopes: readonly string[]
  authorityMode: AgentAccessAuthorityMode
  operationAccess: AgentAccessOperationAccess
  operationRefs: readonly string[]
  policy: AgentAccessPolicy
  createdAt: number
  expiresAt: number
}>

export type AgentCredentialReplacementRegistrationResult =
  | Readonly<{
      kind: 'recorded' | 'replayed'
      principalRef: string
      generation: number
      successorCredentialRef: string
      predecessorCredentialRef: string
      predecessorKeyId: string
      successorGrantRef: string
    }>
  | Readonly<{ kind: 'conflict' | 'unavailable' }>
  | Readonly<{ kind: 'refused'; code: 'authentication_required' }>

export type AgentCredentialReplacementTransition = Readonly<{
  principalRef: string
  successorCredentialRef: string
  successorGrantRef: string
}>

export type AgentCredentialReplacementTransitionResult =
  | Readonly<{ kind: 'completed' | 'replayed'; providerCredentialId: string }>
  | Readonly<{ kind: 'conflict' | 'unavailable' }>
  | Readonly<{ kind: 'refused'; code: 'authentication_required' }>

export type AgentLifecycleProviderTarget = Readonly<{
  credentialRef: string
  providerCredentialId: string
}>

export type AgentLifecycleCanonicalResult =
  | Readonly<{
      kind: 'completed' | 'replayed'
      principalRef: string
      providerTargets: readonly AgentLifecycleProviderTarget[]
      hasMore?: boolean
      correlationRef: string
    }>
  | Readonly<{ kind: 'conflict'; code: string; correlationRef: string }>
  | Readonly<{ kind: 'refused'; code: 'authentication_required'; correlationRef: string }>

export type AgentLifecycleResult =
  | Readonly<{ kind: 'completed' | 'replayed'; principalRef: string; correlationRef: string }>
  | Readonly<{ kind: 'partial'; code: 'provider_cleanup' | 'work_remaining'; principalRef: string; correlationRef: string; retryable: true }>
  | Readonly<{ kind: 'conflict'; code: string; correlationRef: string }>
  | Readonly<{ kind: 'refused'; code: 'authentication_required' | 'source_unavailable'; correlationRef: string }>

export type AgentAccessPrincipalRegistrationResult = Readonly<{ kind: 'recorded' | 'conflict' | 'unavailable' }>

export type AgentAccessPrincipalRegistration = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: AgentAccessEnvironment
  scopes: readonly string[]
  authorityMode: AgentAccessAuthorityMode
  grantGeneration: number
  policyDigest: string
  lifecycle: 'active' | 'revoked' | 'expired'
  expiresAt?: number
  seenAt: number
}>

export type AgentAccessKeyApi = Readonly<{
  list: (input: { subject: string; includeInvalid: boolean; limit: number }) => Promise<{ data: readonly AgentAccessKeyRecord[] }>
  create: (input: AgentAccessKeyCreateInput) => Promise<{ id: string; secret?: string | undefined }>
  getSecret: (keyId: string) => Promise<{ secret: string }>
  get?: (keyId: string) => Promise<AgentAccessKeyRecord>
  revoke?: (input: { apiKeyId: string; revocationReason: string }) => Promise<void>
}>

export type AgentAccessKeyRecord = Readonly<{
  id: string
  name: string
  subject: string
  revoked: boolean
  expired: boolean
  claims: Record<string, unknown> | null
  scopes?: readonly string[]
  createdAt?: number
  expiration?: number
  expiresAt?: number
}>

export type AgentAccessKeyIssueInput = Readonly<{
  name: string
  idempotencyKey: string
  scopes?: readonly string[]
  grantRef?: string
  applicationRef?: string
  environment?: AgentAccessEnvironment
  operationAccess?: AgentAccessOperationAccess
  operationRefs?: readonly string[]
  maximumSpendPerInvocation?: ExactAmount
  maximumDailySpend?: ExactAmount
  maximumMonthlySpend?: ExactAmount
  maximumConcurrentInvocations?: number
  maximumCallsPerMinute?: number
  maximumCallsPerHour?: number
  expiresInSeconds?: number
}>

export type AgentAccessKeyCreateInput = Readonly<{
  name: string
  subject: string
  createdBy: string
  scopes: readonly string[]
  secondsUntilExpiration: number
  claims: Record<string, string>
  description: string
}>

type IssueInput = Readonly<{
  ownerId?: string
  principal: { userId: string } | undefined
  input: AgentAccessKeyIssueInput
  policy: AgentAccessPolicy
  api: AgentAccessKeyApi
  registerBinding: (input: IssuedAgentBindingRegistration) => Promise<AgentAccessGrantRegistrationResult>
  returnSecret?: boolean
}>
export async function issueAgentAccessKey(input: IssueInput): Promise<AgentAccessKeyResult> {
  const ownerId = input.ownerId ?? input.principal?.userId
  if (ownerId === undefined) return { kind: 'error', code: 'missing_auth', retryable: false }
  const name = input.input.name.trim()
  const idempotencyKey = input.input.idempotencyKey.trim()
  const rawScopes = input.input.scopes ?? [MARKET_OPERATIONS_INVOKE_SCOPE, agentAuthorityScopeForMode('inspect_only')]
  const scopes = canonicalAgentScopes(rawScopes)
  const authorityMode = scopes === undefined ? undefined : agentAuthorityModeForScopes(scopes)
  const grantRef = input.input.grantRef?.trim() || idempotencyKey
  const applicationRef = input.input.applicationRef?.trim() || AGENT_ACCESS_DEFAULT_APPLICATION_REF
  const environment = input.input.environment ?? 'sandbox'
  const expiresInSeconds = input.input.expiresInSeconds ?? AGENT_ACCESS_KEY_TTL_SECONDS
  if (name.length < 1 || name.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9 _.-]{7,127}$/u.test(idempotencyKey)
    || grantRef.length < 1 || grantRef.length > 300 || applicationRef.length < 1 || applicationRef.length > 200
    || authorityMode === undefined || scopes === undefined
    || !validExpiry(expiresInSeconds)
    || !policyMatchesRequestedControls(input.policy, input.input)
    || (environment === 'production' && authorityMode === 'full_yolo')) {
    return { kind: 'error', code: 'invalid_input', retryable: false }
  }
  const issuanceClaims = issuanceClaimMaterial(input.input)
  try {
    const existing = (await input.api.list({ subject: ownerId, includeInvalid: false, limit: 100 })).data.find((key) => !key.revoked && !key.expired
      && key.claims?.aePurpose === AGENT_ACCESS_PURPOSE
      && (key.claims.aeGrantRef === grantRef || key.claims.aeIssuanceKey === idempotencyKey))
    if (existing !== undefined) {
      if (existing.claims?.aeDisplayName !== name
        || existing.claims.aeAuthorityMode !== authorityMode
        || existing.claims.aeApplicationRef !== applicationRef
        || existing.claims.aeEnvironment !== environment
        || existing.claims.aeScopes !== JSON.stringify(scopes)
        || existing.claims.aeGrantRef !== grantRef
        || Object.entries(issuanceClaims).some(([key, value]) => existing.claims?.[key] !== value)
        || existing.scopes === undefined
        || existing.scopes.length !== scopes.length
        || existing.scopes.some((scope) => !scopes.includes(scope))) {
        return { kind: 'error', code: 'idempotency_conflict', retryable: false }
      }
      const binding = await bindAgentPrincipal(input, existing.id, scopes, authorityMode, applicationRef, environment, existing.expiresAt ?? existing.expiration, grantRef, existing.createdAt)
      if (binding === null) {
        return { kind: 'error', code: 'issuance_unavailable', retryable: true }
      }
      const secret = input.returnSecret === false ? '' : (await input.api.getSecret(existing.id)).secret
      return { kind: 'replayed', keyId: existing.id, secret, expiresInSeconds, authorityMode, scopes: [...scopes], grantRef: binding.grantRef }
    }
    const created = await input.api.create({
      name: `AE Agent ${idempotencyKey.slice(-16)}`,
      subject: ownerId,
      createdBy: ownerId,
      scopes: [...scopes],
      secondsUntilExpiration: expiresInSeconds,
      claims: {
        aePurpose: AGENT_ACCESS_PURPOSE,
        aeGrantRef: grantRef,
        aeDisplayName: name,
        aeAuthorityMode: authorityMode,
        aeIssuanceKey: idempotencyKey,
        aeApplicationRef: applicationRef,
        aeEnvironment: environment,
        aeScopes: JSON.stringify(scopes),
        ...issuanceClaims,
      },
      description: 'Use Agentic Economy Market Operations with this assistant.',
    })
    const createdAt = Date.now()
    const expiresAt = createdAt + expiresInSeconds * 1000
    const binding = await bindAgentPrincipal(input, created.id, scopes, authorityMode, applicationRef, environment, expiresAt, grantRef, createdAt)
    if (binding === null) {
      return {
        kind: 'error',
        code: 'issuance_unavailable',
        retryable: true,
        reconciliation: await rollbackAgentKey(input.api, created.id),
      }
    }
    try {
      const secret = input.returnSecret === false ? '' : (created.secret ?? (await input.api.getSecret(created.id)).secret)
      return { kind: 'created', keyId: created.id, secret, expiresInSeconds, authorityMode, scopes: [...scopes], grantRef: binding.grantRef }
    } catch (error) {
      console.error('[agent-access] credential delivery failed', sanitizeTelemetryError(error))
      return {
        kind: 'error',
        code: 'issuance_unavailable',
        retryable: true,
        reconciliation: await rollbackAgentKey(input.api, created.id),
      }
    }
  } catch (error) {
    console.error('[agent-access] issueAgentAccessKey failed', sanitizeTelemetryError(error))
    return { kind: 'error', code: 'issuance_unavailable', retryable: true }
  }
}

async function bindAgentPrincipal(
  input: IssueInput,
  keyId: string,
  scopes: readonly string[],
  authorityMode: AgentAccessAuthorityMode,
  applicationRef: string,
  environment: AgentAccessEnvironment,
  expiresAt: number | undefined,
  grantRef: string,
  createdAt: number | undefined,
): Promise<AgentAccessGrantBinding | null> {
  if (expiresAt === undefined) return null
  try {
    return completeGrantBinding(await input.registerBinding({
      issuanceKey: input.input.idempotencyKey,
      grantRef,
      credentialId: keyId,
      displayName: input.input.name,
      applicationRef,
      environment,
      scopes: [...scopes],
      authorityMode,
      policy: input.policy,
      operationAccess: input.policy.operationAccess,
      operationRefs: input.policy.operationRefs,
      createdAt: createdAt ?? Date.now(),
      expiresAt,
    }))
  } catch {
    return null
  }
}

function completeGrantBinding(result: AgentAccessGrantRegistrationResult): AgentAccessGrantBinding | null {
  if (result.kind !== 'recorded' && result.kind !== 'replayed'
    || typeof result.grantRef !== 'string'
    || typeof result.generation !== 'number'
    || typeof result.policyDigest !== 'string'
    || result.lifecycle === undefined
    || typeof result.expiresAt !== 'number') return null
  return {
    kind: result.kind,
    grantRef: result.grantRef,
    generation: result.generation,
    policyDigest: result.policyDigest,
    lifecycle: result.lifecycle,
    expiresAt: result.expiresAt,
  }
}

async function rollbackAgentKey(
  api: AgentAccessKeyApi,
  keyId: string,
): Promise<'provider_credential_revoked' | 'provider_revocation_required'> {
  if (api.revoke === undefined) return 'provider_revocation_required'
  try {
    await api.revoke({ apiKeyId: keyId, revocationReason: 'Source principal binding failed.' })
    return 'provider_credential_revoked'
  } catch {
    return 'provider_revocation_required'
  }
}
export function projectAgentAccessKey(record: AgentAccessKeyRecord): AgentAccessKeyInventoryItem | undefined {
  if (record.claims?.aePurpose !== AGENT_ACCESS_PURPOSE
    || record.scopes === undefined
    || (!record.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)
      && !record.scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE))) return undefined
  const scopes = canonicalAgentScopes(record.scopes)
  const authorityMode = scopes === undefined ? undefined : agentAuthorityModeForScopes(scopes)
  const claimMode = record.claims.aeAuthorityMode
  const displayName = record.claims.aeDisplayName
  const grantRef = record.claims.aeGrantRef
  const applicationRef = record.claims.aeApplicationRef
  const environment = record.claims.aeEnvironment
  if (scopes === undefined
    || authorityMode === undefined
    || claimMode !== authorityMode
    || typeof displayName !== 'string'
    || displayName.trim().length === 0
    || typeof grantRef !== 'string'
    || grantRef.trim().length === 0
    || typeof applicationRef !== 'string'
    || applicationRef.trim().length === 0
    || (environment !== 'sandbox' && environment !== 'production')) return undefined
  return {
    keyId: record.id,
    name: displayName,
    applicationRef,
    environment,
    authorityMode,
    scopes: Object.freeze([...scopes]),
    ...(record.createdAt === undefined ? {} : { createdAt: record.createdAt }),
    ...(record.expiresAt === undefined && record.expiration === undefined ? {} : { expiresAt: record.expiresAt ?? record.expiration }),
    revoked: record.revoked,
    expired: record.expired,
    ...(grantRef === undefined ? {} : { grantRef }),
  }
}
export async function listAgentAccessKeys(input: Readonly<{
  principal: { userId: string } | undefined
  api: Pick<AgentAccessKeyApi, 'list'>
}>): Promise<readonly AgentAccessKeyInventoryItem[]> {
  if (input.principal === undefined) return []
  try {
    const records = await input.api.list({ subject: input.principal.userId, includeInvalid: true, limit: 100 })
    return records.data.flatMap((record) => {
      const projected = projectAgentAccessKey(record)
      return projected === undefined ? [] : [projected]
    })
  } catch {
    return []
  }
}

function validExpiry(value: number): boolean {
  return Number.isSafeInteger(value)
    && value >= AGENT_ACCESS_MIN_TTL_SECONDS
    && value <= AGENT_ACCESS_MAX_TTL_SECONDS
}

function policyMatchesRequestedControls(
  policy: AgentAccessPolicy,
  input: AgentAccessKeyIssueInput,
): boolean {
  const selection = normalizeAgentAccessOperationSelection({
    operationAccess: input.operationAccess ?? 'all_admitted',
    ...(input.operationRefs === undefined ? {} : { operationRefs: input.operationRefs }),
  })
  if (selection === undefined
    || selection.operationAccess !== policy.operationAccess
    || selection.operationRefs.length !== policy.operationRefs.length
    || selection.operationRefs.some((ref, index) => ref !== policy.operationRefs[index])) return false
  const amounts: readonly [ExactAmount | undefined, ExactAmount][] = [
    [input.maximumSpendPerInvocation, policy.budget.maximumSpendPerInvocation],
    [input.maximumDailySpend, policy.budget.maximumDailySpend],
    [input.maximumMonthlySpend, policy.budget.maximumMonthlySpend],
  ]
  if (amounts.some(([requested, actual]) => requested !== undefined && compareExactAmounts(requested, actual) !== 0)) return false
  const limits: readonly [number | undefined, number][] = [
    [input.maximumConcurrentInvocations, policy.budget.maximumConcurrentInvocations],
    [input.maximumCallsPerMinute, policy.rate.maximumCallsPerMinute],
    [input.maximumCallsPerHour, policy.rate.maximumCallsPerHour],
  ]
  return limits.every(([requested, actual]) => requested === undefined || requested === actual)
}

function amountClaim(amount: ExactAmount): string {
  return `${amount.currency}:${amount.units}:${amount.exponent}`
}

function issuanceClaimMaterial(input: AgentAccessKeyIssueInput): Record<string, string> {
  const selection = normalizeAgentAccessOperationSelection({
    operationAccess: input.operationAccess ?? 'all_admitted',
    ...(input.operationRefs === undefined ? {} : { operationRefs: input.operationRefs }),
  })
  return {
    ...(selection === undefined ? {} : {
      aeOperationSelectionDigest: agentAccessOperationSelectionDigest(selection),
    }),
    ...(input.maximumSpendPerInvocation === undefined ? {} : { aeMaximumSpendPerInvocation: amountClaim(input.maximumSpendPerInvocation) }),
    ...(input.maximumDailySpend === undefined ? {} : { aeMaximumDailySpend: amountClaim(input.maximumDailySpend) }),
    ...(input.maximumMonthlySpend === undefined ? {} : { aeMaximumMonthlySpend: amountClaim(input.maximumMonthlySpend) }),
    ...(input.maximumConcurrentInvocations === undefined ? {} : { aeMaximumConcurrentInvocations: String(input.maximumConcurrentInvocations) }),
    ...(input.maximumCallsPerMinute === undefined ? {} : { aeMaximumCallsPerMinute: String(input.maximumCallsPerMinute) }),
    ...(input.maximumCallsPerHour === undefined ? {} : { aeMaximumCallsPerHour: String(input.maximumCallsPerHour) }),
    ...(input.expiresInSeconds === undefined ? {} : { aeExpiresInSeconds: String(input.expiresInSeconds) }),
  }
}

export function agentAccessOperationSelectionDigest(selection: Readonly<{
  operationAccess: AgentAccessOperationAccess
  operationRefs: readonly string[]
}>): string {
  const normalized = normalizeAgentAccessOperationSelection(selection)
  if (normalized === undefined) throw new Error('agent_access_operation_selection_invalid')
  return canonicalDigest({
    format: 'ae.operation-selection:v1',
    operationAccess: normalized.operationAccess,
    operationRefs: normalized.operationRefs,
  } as never)
}

function canonicalAgentScopes(scopes: readonly string[]): readonly string[] | undefined {
  if (scopes.length === 0 || new Set(scopes).size !== scopes.length) return undefined
  const hasSupplyScope = scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE)
  const withGatewayScope = scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE) || hasSupplyScope
    ? [...scopes]
    : [MARKET_OPERATIONS_INVOKE_SCOPE, ...scopes]
  if (withGatewayScope.includes(CUSTOMER_REQUEST_AGENT_SCOPE)) return undefined
  const authorityMode = agentAuthorityModeForScopes(withGatewayScope)
  if (authorityMode === undefined) return undefined
  const modeScope = agentAuthorityScopeForMode(authorityMode)
  const hasRequestedModeScope = withGatewayScope.includes(modeScope)
  const extras = withGatewayScope.filter((scope) => scope !== MARKET_OPERATIONS_INVOKE_SCOPE
    && scope !== MARKET_SUPPLY_MANAGE_SCOPE
    && scope !== modeScope)
  if (extras.length > 0) return undefined
  return [
    ...(withGatewayScope.includes(MARKET_OPERATIONS_INVOKE_SCOPE) ? [MARKET_OPERATIONS_INVOKE_SCOPE] : []),
    ...(withGatewayScope.includes(MARKET_SUPPLY_MANAGE_SCOPE) ? [MARKET_SUPPLY_MANAGE_SCOPE] : []),
    ...(hasRequestedModeScope ? [modeScope] : []),
  ]
}

export {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  CUSTOMER_REQUEST_AGENT_SCOPE,
  MARKET_OPERATIONS_INVOKE_SCOPE,
  MARKET_SUPPLY_MANAGE_SCOPE,
  agentAuthorityModeAllows,
  agentAuthorityModeForScopes,
  agentAuthorityScopeForMode,
}
export type { AgentAccessAuthorityMode }
