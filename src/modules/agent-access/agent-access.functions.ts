import { auth, clerkClient } from '@clerk/tanstack-react-start/server'
import type { ClerkClient } from '@clerk/backend'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  callSourceMutation,
  callSourceQuery,
  createConvexServerFunctionAssertion,
  sourceMutation,
  sourceQuery,
  type ConvexServerFunctionAssertion,
} from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import { currentRequestCorrelationId } from '@/lib/server/request-correlation'

import {
  issueAgentAccessKey,
  AGENT_ACCESS_MAX_TTL_SECONDS,
  AGENT_ACCESS_MIN_TTL_SECONDS,
  listAgentAccessKeys,
  type AgentAccessKeyCreateInput,
  type AgentAccessKeyRecord,
  type AgentAccessPrincipalRegistration,
  type AgentAccessPrincipalRegistrationResult,
  type AgentAccessGrantRegistrationResult,
  type IssuedAgentBindingRegistration,
  type AgentCredentialReplacementRegistration,
  type AgentCredentialReplacementRegistrationResult,
  type AgentCredentialReplacementTransition,
  type AgentCredentialReplacementTransitionResult,
  type AgentLifecycleCanonicalResult,
  type AgentLifecycleResult,
} from './agent-access'
import {
  agentAccessPolicySchema,
  type AgentAccessPolicy,
} from './policy'
import {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  MARKET_OPERATIONS_INVOKE_SCOPE,
  agentAuthorityModeForScopes,
  agentAuthorityScopeForMode,
} from './contract'
import {
  buildProductionAgentAccessPolicy,
  defaultProductionAgentAccessPolicy,
} from './production-policy'
import { defaultSandboxAgentAccessPolicy } from './sandbox-policy'
import { exactAmountSchema } from '@/modules/money/public'
import { issuedAgentGrantRef } from './issued-agent-binding'

const issueInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  idempotencyKey: z.string().trim().min(8).max(128),
  scopes: z.array(z.string()).min(1).max(32).optional(),
  grantRef: z.string().trim().min(1).max(300).optional(),
  applicationRef: z.string().trim().min(1).max(200).optional(),
  environment: z.enum(['sandbox', 'production']).optional(),
  authorityMode: z.enum(AGENT_ACCESS_AUTHORITY_MODE_VALUES).optional(),
  maximumSpendPerInvocation: exactAmountSchema.optional(),
  maximumDailySpend: exactAmountSchema.optional(),
  maximumMonthlySpend: exactAmountSchema.optional(),
  maximumConcurrentInvocations: z.number().int().safe().positive().optional(),
  maximumCallsPerMinute: z.number().int().safe().positive().optional(),
  maximumCallsPerHour: z.number().int().safe().positive().optional(),
  expiresInSeconds: z.number().int().safe().min(AGENT_ACCESS_MIN_TTL_SECONDS).max(AGENT_ACCESS_MAX_TTL_SECONDS).optional(),
}).superRefine((value, context) => {
  const budgetFields = [
    value.maximumSpendPerInvocation,
    value.maximumDailySpend,
    value.maximumMonthlySpend,
  ]
  const budgetCount = budgetFields.filter((field) => field !== undefined).length
  if (budgetCount !== 0 && budgetCount !== budgetFields.length) {
    context.addIssue({ code: 'custom', message: 'production_budget_must_be_complete', path: ['maximumSpendPerInvocation'] })
  }
  const rateFields = [value.maximumCallsPerMinute, value.maximumCallsPerHour]
  const rateCount = rateFields.filter((field) => field !== undefined).length
  if (rateCount === 1) {
    context.addIssue({ code: 'custom', message: 'production_rate_must_be_complete', path: ['maximumCallsPerMinute'] })
  }
})

type IssueInput = z.infer<typeof issueInputSchema>

/** Build the owner-side policy before any key or grant is created. */
export function buildOwnerAgentAccessPolicy(input: Readonly<Pick<
  IssueInput,
  | 'environment'
  | 'maximumSpendPerInvocation'
  | 'maximumDailySpend'
  | 'maximumMonthlySpend'
  | 'maximumConcurrentInvocations'
  | 'maximumCallsPerMinute'
  | 'maximumCallsPerHour'
  | 'expiresInSeconds'
  | 'authorityMode'
>>): AgentAccessPolicy {
  const environment = input.environment ?? 'sandbox'
  if (environment === 'sandbox') return defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 })
  const hasBudget = input.maximumSpendPerInvocation !== undefined
    && input.maximumDailySpend !== undefined
    && input.maximumMonthlySpend !== undefined
  const base = hasBudget
    ? buildProductionAgentAccessPolicy({
        currency: 'USD',
        exponent: 2,
        maximumSpendPerInvocation: input.maximumSpendPerInvocation,
        maximumDailySpend: input.maximumDailySpend,
        maximumMonthlySpend: input.maximumMonthlySpend,
      })
    : defaultProductionAgentAccessPolicy({ currency: 'USD', exponent: 2 })
  return agentAccessPolicySchema.parse({
    ...base,
    budget: {
      ...base.budget,
      ...(input.maximumConcurrentInvocations === undefined
        ? {}
        : { maximumConcurrentInvocations: input.maximumConcurrentInvocations }),
    },
    rate: {
      ...base.rate,
      ...(input.maximumCallsPerMinute === undefined
        ? {}
        : { maximumCallsPerMinute: input.maximumCallsPerMinute }),
      ...(input.maximumCallsPerHour === undefined
        ? {}
        : { maximumCallsPerHour: input.maximumCallsPerHour }),
    },
  })
}

function issueScopes(input: IssueInput): readonly string[] | undefined {
  if (input.scopes === undefined && input.authorityMode === undefined) {
    return [MARKET_OPERATIONS_INVOKE_SCOPE, agentAuthorityScopeForMode('inspect_only')]
  }
  const scopes = input.scopes === undefined && input.authorityMode !== undefined
    ? [MARKET_OPERATIONS_INVOKE_SCOPE, agentAuthorityScopeForMode(input.authorityMode)]
    : input.scopes
  if (scopes === undefined || input.authorityMode === undefined) return scopes
  return agentAuthorityModeForScopes(scopes) === input.authorityMode ? scopes : undefined
}

const owner = async (): Promise<{ userId: string } | undefined> => {
  const identity = await auth()
  return identity.isAuthenticated && identity.userId !== null ? { userId: identity.userId } : undefined
}

function convexTokenIdentifierFor(userId: string): string | undefined {
  const issuer = readTrimmedEnv(process.env, 'CLERK_JWT_ISSUER_DOMAIN')
  if (issuer === undefined || typeof userId !== 'string' || userId.trim().length === 0) return undefined
  try {
    const parsed = new URL(issuer)
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      || parsed.username.length > 0
      || parsed.password.length > 0
      || parsed.search.length > 0
      || parsed.hash.length > 0
    ) return undefined
    const canonicalIssuer = trimTrailingSlashes(parsed.href)
    return canonicalIssuer.length === 0 ? undefined : `${canonicalIssuer}|${userId}`
  } catch {
    return undefined
  }
}

type ClerkApiKeyLike = Readonly<{
  id: string
  name: string
  subject: string
  revoked: boolean
  expired: boolean
  claims: Record<string, unknown> | null
  scopes?: readonly string[]
  createdAt?: number | null
  expiration?: number | null
  expiresAt?: number | null
}>

type ApiKeyListQuery = Readonly<{ subject: string; includeInvalid: boolean; limit: number }>
type ClerkApiKeysClient = ClerkClient['apiKeys']

type ClerkAgentAccessKeyApi = Readonly<{
  list: (query: ApiKeyListQuery) => Promise<{ data: readonly AgentAccessKeyRecord[] }>
  create: (input: AgentAccessKeyCreateInput) => Promise<{ id: string; secret?: string }>
  getSecret: (keyId: string) => Promise<{ secret: string }>
  get: (keyId: string) => Promise<AgentAccessKeyRecord>
  revoke: (input: { apiKeyId: string; revocationReason: string }) => Promise<void>
}>

type RegisterAgentPrincipalArgs = Omit<AgentAccessPrincipalRegistration, 'ownerId'>
type RegisterAgentPrincipalResult =
  | { kind: 'recorded' }
  | { kind: 'conflict' }
  | { kind: 'refused'; code: 'authentication_required' }
const registerAgentPrincipalMutation = sourceMutation<RegisterAgentPrincipalArgs, RegisterAgentPrincipalResult>(
  'agentAccessPrincipals:registerAgentPrincipal',
)
type RegisterIssuedAgentBindingArgs = IssuedAgentBindingRegistration & Readonly<{
  serviceAuth: ConvexServerFunctionAssertion
}>
const registerIssuedAgentBindingMutation = sourceMutation<RegisterIssuedAgentBindingArgs, AgentAccessGrantRegistrationResult>(
  'agentAccessPrincipals:registerIssuedAgentBindingForServer',
)
type PrepareReplacementArgs = AgentCredentialReplacementRegistration & Readonly<{ serviceAuth: ConvexServerFunctionAssertion }>
const prepareCredentialReplacementMutation = sourceMutation<PrepareReplacementArgs, AgentCredentialReplacementRegistrationResult>(
  'agentAccessPrincipals:prepareCredentialReplacementForServer',
)
type TransitionReplacementArgs = AgentCredentialReplacementTransition & Readonly<{ serviceAuth: ConvexServerFunctionAssertion }>
const promoteCredentialReplacementMutation = sourceMutation<TransitionReplacementArgs, AgentCredentialReplacementTransitionResult>(
  'agentAccessPrincipals:promoteCredentialReplacementForServer',
)
const cancelCredentialReplacementMutation = sourceMutation<TransitionReplacementArgs, AgentCredentialReplacementTransitionResult>(
  'agentAccessPrincipals:cancelCredentialReplacementForServer',
)
type RevokeCredentialCommand = Readonly<{ credentialRef: string; correlationRef: string }>
type DisconnectAgentCommand = Readonly<{ principalRef: string; correlationRef: string }>
type LifecycleMutationArgs<Command> = Command & Readonly<{ serviceAuth: ConvexServerFunctionAssertion }>
const revokeCredentialMutation = sourceMutation<LifecycleMutationArgs<RevokeCredentialCommand>, AgentLifecycleCanonicalResult>(
  'agentAccessPrincipals:revokeCredentialForServer',
)
const disconnectAgentMutation = sourceMutation<LifecycleMutationArgs<DisconnectAgentCommand>, AgentLifecycleCanonicalResult>(
  'agentAccessPrincipals:disconnectAgentForServer',
)
type ProviderRevocationCommand = Readonly<{
  principalRef: string
  credentialRef: string
  providerCredentialId: string
  correlationRef: string
  outcome: 'revoked' | 'failed'
}>
type ProviderRevocationResult = Readonly<{ kind: 'completed' | 'replayed' | 'conflict' } | { kind: 'refused'; code: 'authentication_required' }>
const recordProviderRevocationMutation = sourceMutation<LifecycleMutationArgs<ProviderRevocationCommand>, ProviderRevocationResult>(
  'agentAccessPrincipals:recordProviderRevocationForServer',
)
const listOwnerGrantReadbacksQuery = sourceQuery<{ requireAuthority: true }, readonly unknown[]>(
  'agentAccessPolicy:listOwnerGrantReadbacks',
)

async function requireCanonicalOwnerAuthorityServer(): Promise<void> {
  await callSourceQuery(listOwnerGrantReadbacksQuery, { requireAuthority: true })
}

export function createClerkAgentAccessKeyApi(apiKeys: ClerkApiKeysClient): ClerkAgentAccessKeyApi {
  return {
    list: async (query) => {
      const result = await apiKeys.list(query)
      return { data: result.data.map(normalizeKey) }
    },
    create: async (value) => {
      const created = await apiKeys.create({ ...value, scopes: [...value.scopes] })
      return created.secret === undefined ? { id: created.id } : { id: created.id, secret: created.secret }
    },
    getSecret: async (keyId) => await apiKeys.getSecret(keyId),
    get: async (keyId) => normalizeKey(await apiKeys.get(keyId)),
    revoke: async (value) => {
      await apiKeys.revoke(value)
    },
  }
}

const normalizeKey = (key: ClerkApiKeyLike): AgentAccessKeyRecord => {
  const createdAt = key.createdAt === null || key.createdAt === undefined ? undefined : key.createdAt
  const expiration = key.expiration === null || key.expiration === undefined ? undefined : key.expiration
  const expiresAt = key.expiresAt === null || key.expiresAt === undefined ? undefined : key.expiresAt
  return {
    id: key.id,
    name: key.name,
    subject: key.subject,
    revoked: key.revoked,
    expired: key.expired,
    claims: key.claims,
    ...(key.scopes === undefined ? {} : { scopes: key.scopes }),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(expiration === undefined ? {} : { expiration }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  }
}
export async function registerAgentAccessPrincipal(
  input: AgentAccessPrincipalRegistration,
): Promise<AgentAccessPrincipalRegistrationResult> {
  try {
    const result = await callSourceMutation(registerAgentPrincipalMutation, {
      principalId: input.principalId,
      credentialId: input.credentialId,
      applicationRef: input.applicationRef,
      environment: input.environment,
      scopes: [...input.scopes],
      authorityMode: input.authorityMode,
      grantGeneration: input.grantGeneration,
      policyDigest: input.policyDigest,
      lifecycle: input.lifecycle,
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      seenAt: input.seenAt,
    })
    return result.kind === 'recorded' || result.kind === 'conflict' ? result : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  }
}

export async function registerIssuedAgentBinding(
  input: IssuedAgentBindingRegistration,
): Promise<AgentAccessGrantRegistrationResult> {
  try {
    const command = {
      ...input,
      scopes: [...input.scopes],
    }
    const serviceAuth = await createConvexServerFunctionAssertion({
      operation: 'agentAccessPrincipals.registerIssuedAgentBindingForServer',
      scope: MARKET_OPERATIONS_INVOKE_SCOPE,
      command,
    })
    return await callSourceMutation(registerIssuedAgentBindingMutation, { ...command, serviceAuth })
  } catch {
    return { kind: 'unavailable' }
  }
}

async function callReplacementMutation(
  operation: string,
  reference: typeof prepareCredentialReplacementMutation | typeof promoteCredentialReplacementMutation,
  command: AgentCredentialReplacementRegistration | AgentCredentialReplacementTransition,
): Promise<AgentCredentialReplacementRegistrationResult | AgentCredentialReplacementTransitionResult> {
  try {
    const serviceAuth = await createConvexServerFunctionAssertion({
      operation,
      scope: MARKET_OPERATIONS_INVOKE_SCOPE,
      command,
    })
    return await callSourceMutation(reference as never, { ...command, serviceAuth } as never) as AgentCredentialReplacementRegistrationResult | AgentCredentialReplacementTransitionResult
  } catch {
    return { kind: 'unavailable' }
  }
}

export async function prepareAgentCredentialReplacement(
  input: AgentCredentialReplacementRegistration,
): Promise<AgentCredentialReplacementRegistrationResult> {
  return await callReplacementMutation(
    'agentAccessPrincipals.prepareCredentialReplacementForServer',
    prepareCredentialReplacementMutation,
    { ...input, scopes: [...input.scopes] },
  ) as AgentCredentialReplacementRegistrationResult
}

export async function promoteAgentCredentialReplacement(
  input: AgentCredentialReplacementTransition,
): Promise<AgentCredentialReplacementTransitionResult> {
  return await callReplacementMutation(
    'agentAccessPrincipals.promoteCredentialReplacementForServer',
    promoteCredentialReplacementMutation,
    input,
  ) as AgentCredentialReplacementTransitionResult
}

export async function cancelAgentCredentialReplacement(
  input: AgentCredentialReplacementTransition,
): Promise<AgentCredentialReplacementTransitionResult> {
  return await callReplacementMutation(
    'agentAccessPrincipals.cancelCredentialReplacementForServer',
    cancelCredentialReplacementMutation,
    input,
  ) as AgentCredentialReplacementTransitionResult
}

export const issueAgentAccessKeyServer = createServerFn({ method: 'POST' })
  .validator((data) => issueInputSchema.parse(data))
  .handler(async ({ data }) => {
    const scopes = issueScopes(data)
    const environment = data.environment ?? 'sandbox'
    const authorityMode = scopes === undefined ? undefined : agentAuthorityModeForScopes(scopes)
    if (scopes === undefined || authorityMode === undefined
      || (environment === 'production' && authorityMode === 'full_yolo')) {
      return { kind: 'error' as const, code: 'invalid_input' as const, retryable: false }
    }
    let policy: AgentAccessPolicy
    try {
      policy = buildOwnerAgentAccessPolicy(data)
    } catch {
      return { kind: 'error' as const, code: 'invalid_input' as const, retryable: false }
    }
    let principal: { userId: string } | undefined
    try {
      principal = await owner()
    } catch {
      return { kind: 'error' as const, code: 'missing_auth' as const, retryable: false }
    }
    if (principal === undefined) {
      return { kind: 'error' as const, code: 'missing_auth' as const, retryable: false }
    }
    const tokenIdentifier = convexTokenIdentifierFor(principal.userId)
    if (tokenIdentifier === undefined) {
      return { kind: 'error' as const, code: 'missing_auth' as const, retryable: false }
    }
    try {
      await requireCanonicalOwnerAuthorityServer()
    } catch {
      return { kind: 'error' as const, code: 'missing_auth' as const, retryable: false }
    }
    const api = createClerkAgentAccessKeyApi(clerkClient().apiKeys)
    const grantRef = data.grantRef ?? issuedAgentGrantRef(principal.userId, data.idempotencyKey)
    return await issueAgentAccessKey({
      principal,
      input: {
        name: data.name,
        idempotencyKey: data.idempotencyKey,
        scopes,
        ...(data.maximumSpendPerInvocation === undefined ? {} : { maximumSpendPerInvocation: data.maximumSpendPerInvocation }),
        ...(data.maximumDailySpend === undefined ? {} : { maximumDailySpend: data.maximumDailySpend }),
        ...(data.maximumMonthlySpend === undefined ? {} : { maximumMonthlySpend: data.maximumMonthlySpend }),
        ...(data.maximumConcurrentInvocations === undefined ? {} : { maximumConcurrentInvocations: data.maximumConcurrentInvocations }),
        ...(data.maximumCallsPerMinute === undefined ? {} : { maximumCallsPerMinute: data.maximumCallsPerMinute }),
        ...(data.maximumCallsPerHour === undefined ? {} : { maximumCallsPerHour: data.maximumCallsPerHour }),
        ...(data.expiresInSeconds === undefined ? {} : { expiresInSeconds: data.expiresInSeconds }),
        grantRef,
        ...(data.applicationRef === undefined ? {} : { applicationRef: data.applicationRef }),
        ...(data.environment === undefined ? {} : { environment: data.environment }),
      },
      policy,
      api,
      registerBinding: registerIssuedAgentBinding,
    })
  })

export const listAgentAccessKeysServer = createServerFn({ method: 'GET' })
  .handler(async () => {
    if (isLocalE2EAuthBypassEnabled()) return []
    await requireCanonicalOwnerAuthorityServer()
    const principal = await owner()
    const api = createClerkAgentAccessKeyApi(clerkClient().apiKeys)
    return await listAgentAccessKeys({ principal, api })
  })

async function lifecycleCanonicalMutation<Command extends Record<string, string>>(
  operation: string,
  reference: typeof revokeCredentialMutation | typeof disconnectAgentMutation,
  command: Command,
): Promise<AgentLifecycleCanonicalResult> {
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation,
    scope: MARKET_OPERATIONS_INVOKE_SCOPE,
    command,
  })
  return await callSourceMutation(reference as never, { ...command, serviceAuth } as never) as AgentLifecycleCanonicalResult
}

async function recordProviderRevocation(command: ProviderRevocationCommand): Promise<ProviderRevocationResult> {
  const operation = 'agentAccessPrincipals.recordProviderRevocationForServer'
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation,
    scope: MARKET_OPERATIONS_INVOKE_SCOPE,
    command,
  })
  return await callSourceMutation(recordProviderRevocationMutation, { ...command, serviceAuth })
}

async function completeAgentLifecycle(
  canonical: AgentLifecycleCanonicalResult,
): Promise<AgentLifecycleResult> {
  if (canonical.kind === 'conflict' || canonical.kind === 'refused') return canonical
  const api = createClerkAgentAccessKeyApi(clerkClient().apiKeys)
  let partial = false
  for (const target of canonical.providerTargets) {
    let outcome: 'revoked' | 'failed' = 'failed'
    try {
      const provider = await api.get(target.providerCredentialId)
      if (!provider.revoked) {
        await api.revoke({
          apiKeyId: target.providerCredentialId,
          revocationReason: 'Agentic Economy owner revoked this credential.',
        })
      }
      outcome = 'revoked'
    } catch {
      partial = true
    }
    try {
      const recorded = await recordProviderRevocation({
        principalRef: canonical.principalRef,
        credentialRef: target.credentialRef,
        providerCredentialId: target.providerCredentialId,
        correlationRef: canonical.correlationRef,
        outcome,
      })
      if (recorded.kind !== 'completed' && recorded.kind !== 'replayed') partial = true
    } catch {
      partial = true
    }
  }
  return partial
    ? { kind: 'partial', principalRef: canonical.principalRef, correlationRef: canonical.correlationRef, retryable: true }
    : { kind: canonical.kind, principalRef: canonical.principalRef, correlationRef: canonical.correlationRef }
}

function lifecycleCorrelationRef(): string {
  return currentRequestCorrelationId() ?? globalThis.crypto.randomUUID()
}

export const revokeAgentCredentialServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({ credentialRef: z.string().trim().min(1).max(300) }).parse(data))
  .handler(async ({ data }): Promise<AgentLifecycleResult> => {
    const correlationRef = lifecycleCorrelationRef()
    try {
      await requireCanonicalOwnerAuthorityServer()
      const command = { credentialRef: data.credentialRef, correlationRef }
      return await completeAgentLifecycle(await lifecycleCanonicalMutation(
        'agentAccessPrincipals.revokeCredentialForServer',
        revokeCredentialMutation,
        command,
      ))
    } catch {
      return { kind: 'refused', code: 'source_unavailable', correlationRef }
    }
  })

export const disconnectAgentServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({ principalRef: z.string().trim().min(1).max(300) }).parse(data))
  .handler(async ({ data }): Promise<AgentLifecycleResult> => {
    const correlationRef = lifecycleCorrelationRef()
    try {
      await requireCanonicalOwnerAuthorityServer()
      const command = { principalRef: data.principalRef, correlationRef }
      return await completeAgentLifecycle(await lifecycleCanonicalMutation(
        'agentAccessPrincipals.disconnectAgentForServer',
        disconnectAgentMutation,
        command,
      ))
    } catch {
      return { kind: 'refused', code: 'source_unavailable', correlationRef }
    }
  })
