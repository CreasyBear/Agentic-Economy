import { auth, clerkClient } from '@clerk/tanstack-react-start/server'
import type { ClerkClient } from '@clerk/backend'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceMutation, sourceMutation } from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'

import {
  issueAgentAccessKey,
  AGENT_ACCESS_MAX_TTL_SECONDS,
  AGENT_ACCESS_MIN_TTL_SECONDS,
  listAgentAccessKeys,
  revokeAgentAccessKey,
  type AgentAccessGrantRegistrationInput,
  type AgentAccessKeyCreateInput,
  type AgentAccessKeyRecord,
  type AgentAccessPrincipalRegistration,
  type AgentAccessPrincipalRegistrationResult,
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
import { registerAgentAccessGrant, revokeAgentAccessGrant } from './policy.functions'
import {
  buildProductionAgentAccessPolicy,
  defaultProductionAgentAccessPolicy,
} from './production-policy'
import { defaultSandboxAgentAccessPolicy } from './sandbox-policy'
import { exactAmountSchema } from '@/modules/money/public'

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
    const principal = await owner()
    const api = createClerkAgentAccessKeyApi(clerkClient().apiKeys)
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
        ...(data.grantRef === undefined ? {} : { grantRef: data.grantRef }),
        ...(data.applicationRef === undefined ? {} : { applicationRef: data.applicationRef }),
        ...(data.environment === undefined ? {} : { environment: data.environment }),
      },
      policy,
      api,
      registerPrincipal: registerAgentAccessPrincipal,
      registerGrant: async (grant: AgentAccessGrantRegistrationInput) => await registerAgentAccessGrant(grant),
    })
  })

export const listAgentAccessKeysServer = createServerFn({ method: 'GET' })
  .handler(async () => {
    if (isLocalE2EAuthBypassEnabled()) return []
    const principal = await owner()
    const api = createClerkAgentAccessKeyApi(clerkClient().apiKeys)
    return await listAgentAccessKeys({ principal, api })
  })

export const revokeAgentAccessKeyServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({ keyId: z.string().trim().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const principal = await owner()
    const api = createClerkAgentAccessKeyApi(clerkClient().apiKeys)
    return await revokeAgentAccessKey({
      principal,
      keyId: data.keyId,
      api,
      revokeGrant: revokeAgentAccessGrant,
    })
  })
