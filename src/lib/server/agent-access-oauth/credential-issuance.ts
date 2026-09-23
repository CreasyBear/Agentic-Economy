import { clerkClient } from '@clerk/tanstack-react-start/server'
import type { AgentAccessAuthorityMode } from '@/modules/agent-access/contract'
import {
  AGENT_ACCESS_DEFAULT_APPLICATION_REF,
  AGENT_ACCESS_KEY_TTL_SECONDS,
  AGENT_ACCESS_PURPOSE,
  AGENT_ACCESS_MAX_TTL_SECONDS,
  AGENT_ACCESS_MIN_TTL_SECONDS,
  agentAccessToolSelectionDigest,
  issueAgentAccessKey,
} from '@/modules/agent-access/agent-access'
import { issuedAgentGrantRef } from '@/modules/agent-access/issued-agent-binding'
import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'
import { buildProductionAgentAccessPolicy, defaultProductionAgentAccessPolicy } from '@/modules/agent-access/production-policy'
import {
  agentAccessPolicySchema,
  type AgentAccessPolicy,
} from '@/modules/agent-access/policy'
import {
  createClerkAgentAccessKeyApi,
  cancelAgentCredentialReplacement,
  prepareAgentCredentialReplacement,
  recordAgentProviderRevocation,
  registerIssuedAgentBinding,
} from '@/modules/agent-access/agent-access.functions'
import {
  AgentAccessOAuthIssueRefusal,
  type AgentAccessOAuthGrant,
  type AgentAccessOAuthIssueKey,
  type AgentAccessOAuthRequestedAccess,
  type AgentConnectionTarget,
  type AgentCredentialReplacement,
} from '@/modules/agent-access/oauth-state'
import type { AgentAccessOAuthRefreshFamily, AgentAccessOAuthRefreshStore } from '@/lib/server/agent-access-oauth-store'
import { degrade } from '@/lib/observability/degrade'
import { modeForGrant } from './protocol'
import type { OAuthApiOptions } from './runtime'

export async function confirmCompromisedPredecessorRevocation(
  grant: AgentAccessOAuthGrant,
  correlationRef: string,
  options: OAuthApiOptions,
): Promise<boolean> {
  const predecessor = grant.consequenceReservation?.predecessor
  if (grant.connectionTarget?.kind !== 'replace_credential' || predecessor === undefined) return false
  try {
    const reason = 'Revoked before successor issuance because compromise was reported.'
    await revokeProviderCredentialIfCurrent(predecessor.credentialId, reason, options)
    const provider: Readonly<{ revoked: boolean }> = options.getProviderCredential !== undefined
      ? await options.getProviderCredential(predecessor.credentialId)
      : await clerkClient().apiKeys.get(predecessor.credentialId)
    if (!provider.revoked) return false
    const recorded = await (options.recordProviderRevocation ?? recordAgentProviderRevocation)({
      principalRef: grant.connectionTarget.principalRef,
      credentialRef: predecessor.credentialRef,
      providerCredentialId: predecessor.credentialId,
      correlationRef,
      outcome: 'revoked',
    })
    return recorded.kind === 'completed' || recorded.kind === 'replayed'
  } catch (cause) {
    return degrade(cause, false, { site: 'confirmCompromisedPredecessorRevocation', reason: 'source_unavailable' })
  }
}

export async function defaultIssueRefreshKey(input: Readonly<{
  family: AgentAccessOAuthRefreshFamily
  issuanceKey: string
  grantRef: string
  expiresInSeconds: number
}>): Promise<Readonly<{ keyId: string }>> {
  const api = createClerkAgentAccessKeyApi(clerkClient().apiKeys)
  const key = await api.create({
    name: input.family.displayName,
    subject: input.family.providerSubject,
    createdBy: input.family.providerSubject,
    scopes: [...input.family.scopes],
    secondsUntilExpiration: input.expiresInSeconds,
    claims: {
      aePurpose: AGENT_ACCESS_PURPOSE,
      aeGrantRef: input.grantRef,
      aeDisplayName: input.family.displayName,
      aeAuthorityMode: input.family.authorityMode,
      aeIssuanceKey: input.issuanceKey,
      aeApplicationRef: input.family.applicationRef,
      aeEnvironment: input.family.environment,
      aeScopes: JSON.stringify(input.family.scopes),
      aePrincipalRef: input.family.principalRef,
      aeConnectionTarget: 'replace_credential',
      aeToolSelectionDigest: agentAccessToolSelectionDigest(input.family),
    },
    description: 'Rotated credential for a durable Agentic Economy connection.',
  })
  return { keyId: key.id }
}

export async function completeRefreshProviderCleanup(
  committed: Extract<Awaited<ReturnType<AgentAccessOAuthRefreshStore['commitRefreshFamilyRotation']>>, { kind: 'completed' | 'replayed' }>,
  options: OAuthApiOptions,
): Promise<void> {
  const target = committed.providerCleanupTarget
  if (target === undefined) return
  const reason = 'Replaced by a refreshed Agentic Economy credential.'
  await revokeProviderCredentialIfCurrent(target.providerCredentialId, reason, options)
  const recorded = await (options.recordProviderRevocation ?? recordAgentProviderRevocation)({
    principalRef: committed.family.principalRef,
    credentialRef: target.credentialRef,
    providerCredentialId: target.providerCredentialId,
    correlationRef: `oauth-refresh:${committed.family.familyRef}:${committed.family.revision}`,
    outcome: 'revoked',
  })
  if (recorded.kind !== 'completed' && recorded.kind !== 'replayed') {
    throw new Error('refresh_provider_revocation_record_failed')
  }
}

export async function cancelExpiredReplacement(grant: AgentAccessOAuthGrant, options: OAuthApiOptions): Promise<boolean> {
  if (grant.replacement === undefined) return true
  const replacement = grant.replacement
  const cancelled = options.cancelReplacement === undefined
    ? await cancelAgentCredentialReplacement({
        principalRef: replacement.principalRef,
        successorCredentialRef: replacement.successorCredentialRef,
        successorGrantRef: replacement.successorGrantRef,
      })
    : await options.cancelReplacement(replacement)
  if (cancelled.kind !== 'completed' && cancelled.kind !== 'replayed') return false
  try {
    const reason = 'Replacement delivery expired before the credential was claimed.'
    await revokeProviderCredentialIfCurrent(cancelled.providerCredentialId, reason, options)
    const recorded = await (options.recordProviderRevocation ?? recordAgentProviderRevocation)({
      principalRef: replacement.principalRef,
      credentialRef: replacement.successorCredentialRef,
      providerCredentialId: cancelled.providerCredentialId,
      correlationRef: `replacement-expired:${replacement.successorGrantRef}`,
      outcome: 'revoked',
    })
    if (recorded.kind !== 'completed' && recorded.kind !== 'replayed') {
      throw new Error('expired_replacement_provider_revocation_record_failed')
    }
    return true
  } catch (cause) {
    // The canonical successor is already revoked. A repeated expired-token
    // request safely retries provider cleanup and outbox completion without
    // reviving it. The token endpoint returns a retryable server error until
    // both provider cleanup and outbox completion converge.
    return degrade(cause, false, { site: 'cancelExpiredReplacement', reason: 'source_unavailable' })
  }
}

export async function revokeProviderCredentialIfCurrent(
  providerCredentialId: string,
  reason: string,
  options: OAuthApiOptions,
): Promise<void> {
  const provider = options.getProviderCredential !== undefined
    ? await options.getProviderCredential(providerCredentialId)
    : await clerkClient().apiKeys.get(providerCredentialId)
  if (provider.revoked) return
  if (options.revokeProviderCredential !== undefined) {
    await options.revokeProviderCredential(providerCredentialId, reason)
    return
  }
  await clerkClient().apiKeys.revoke({ apiKeyId: providerCredentialId, revocationReason: reason })
}

export async function defaultOAuthKeySecret(keyId: string): Promise<{ secret: string }> {
  return await clerkClient().apiKeys.getSecret(keyId)
}

export async function issueReplacementGrantKey(input: Readonly<{
  ownerId: string
  grant: AgentAccessOAuthGrant
  target: Extract<AgentConnectionTarget, { kind: 'replace_credential' }>
  idempotencyKey: string
  authorityMode: AgentAccessAuthorityMode
  spendingPolicy: AgentAccessPolicy
  options: OAuthApiOptions
}>): Promise<{ keyId: string; replacement: AgentCredentialReplacement }> {
  const api = createClerkAgentAccessKeyApi(clerkClient().apiKeys)
  const successorGrantRef = issuedAgentGrantRef(input.ownerId, input.idempotencyKey)
  const toolSelectionDigest = agentAccessToolSelectionDigest(input.spendingPolicy)
  const accessTtlSeconds = accessCredentialTtlSeconds(input.grant.approvedAccess)
  const existing = (await api.list({ subject: input.ownerId, includeInvalid: false, limit: 100 })).data.find((key) => (
    !key.revoked && !key.expired && key.claims?.aeGrantRef === successorGrantRef
  ))
  if (existing !== undefined && existing.claims?.aeToolSelectionDigest !== toolSelectionDigest) {
    throw new AgentAccessOAuthIssueRefusal('invalid_grant')
  }
  let createdHere = false
  const key = existing ?? await api.create({
    name: `AE Agent replacement ${input.idempotencyKey.slice(-12)}`,
    subject: input.ownerId,
    createdBy: input.ownerId,
    scopes: [...input.grant.requestedScopes],
    secondsUntilExpiration: accessTtlSeconds,
    claims: {
      aePurpose: AGENT_ACCESS_PURPOSE,
      aeGrantRef: successorGrantRef,
      aeDisplayName: input.grant.displayName,
      aeAuthorityMode: input.authorityMode,
      aeIssuanceKey: input.idempotencyKey,
      aeApplicationRef: AGENT_ACCESS_DEFAULT_APPLICATION_REF,
      aeEnvironment: input.grant.approvedAccess.environment,
      aeScopes: JSON.stringify(input.grant.requestedScopes),
      aePrincipalRef: input.target.principalRef,
      aeConnectionTarget: 'replace_credential',
      aeToolSelectionDigest: toolSelectionDigest,
    },
    description: 'Replacement credential for an existing Agentic Economy agent.',
  }).then((created) => {
    createdHere = true
    return created
  })
  if (key === undefined) throw new Error('replacement_provider_credential_missing')
  const createdAt = Date.now()
  const prepared = await (input.options.prepareReplacement ?? prepareAgentCredentialReplacement)({
    principalRef: input.target.principalRef,
    replacementMode: input.target.replacementMode,
    issuanceKey: input.idempotencyKey,
    grantRef: successorGrantRef,
    credentialId: key.id,
    applicationRef: AGENT_ACCESS_DEFAULT_APPLICATION_REF,
    environment: input.grant.approvedAccess.environment,
    scopes: input.grant.requestedScopes,
    authorityMode: input.authorityMode,
    toolAccess: input.spendingPolicy.toolAccess,
    toolRefs: input.spendingPolicy.toolRefs,
    spendingPolicy: input.spendingPolicy,
    createdAt: existing?.createdAt ?? createdAt,
    expiresAt: existing?.expiresAt ?? existing?.expiration ?? createdAt + accessTtlSeconds * 1_000,
  })
  if (prepared.kind !== 'recorded' && prepared.kind !== 'replayed') {
    if (createdHere) {
      await api.revoke?.({
        apiKeyId: key.id,
        revocationReason: 'Credential replacement registration failed.',
      }).catch(() => {})
    }
    if (prepared.kind === 'conflict') throw new AgentAccessOAuthIssueRefusal('invalid_grant')
    throw new Error('replacement_registration_unavailable')
  }
  return {
    keyId: key.id,
    replacement: {
      principalRef: prepared.principalRef,
      generation: prepared.generation,
      successorCredentialRef: prepared.successorCredentialRef,
      predecessorCredentialRef: prepared.predecessorCredentialRef,
      predecessorKeyId: prepared.predecessorKeyId,
      successorGrantRef: prepared.successorGrantRef,
    },
  }
}

export async function issueGrantKey(
  grant: AgentAccessOAuthGrant,
  ownerId: string,
  target: AgentConnectionTarget,
  options: OAuthApiOptions,
): Promise<{ keyId: string; replacement?: AgentCredentialReplacement }> {
  const issue: AgentAccessOAuthIssueKey = async ({ ownerId: inputOwnerId, grant: inputGrant, target: inputTarget }) => {
    const idempotencyKey = inputGrant.issuanceKey ?? `oauth-${inputGrant.grantRef.replaceAll(':', '-')}`
    const authorityMode = modeForGrant(inputGrant)
    if (authorityMode === undefined || (inputGrant.approvedAccess.environment === 'production' && authorityMode === 'unrestricted_test_only')) {
      throw new AgentAccessOAuthIssueRefusal('invalid_scope')
    }
    let spendingPolicy: AgentAccessPolicy
    try {
      spendingPolicy = deriveOAuthGrantPolicy(inputGrant.approvedAccess)
    } catch (cause) {
      throw new AgentAccessOAuthIssueRefusal('invalid_grant', { cause })
    }
    if (options.issueKey !== undefined) {
      return await options.issueKey({
        ownerId: inputOwnerId,
        name: inputGrant.displayName,
        idempotencyKey,
        scopes: inputGrant.requestedScopes,
        grantRef: inputGrant.grantRef,
        authorityMode,
        approvedAccess: {
          ...inputGrant.approvedAccess,
          expiresInSeconds: accessCredentialTtlSeconds(inputGrant.approvedAccess),
        },
        spendingPolicy,
        target: inputTarget,
      })
    }
    if (inputTarget.kind === 'replace_credential') {
      return await issueReplacementGrantKey({
        ownerId: inputOwnerId,
        grant: inputGrant,
        target: inputTarget,
        idempotencyKey,
        authorityMode,
        spendingPolicy,
        options,
      })
    }
    const issued = await issueAgentAccessKey({
      ownerId: inputOwnerId,
      principal: { userId: inputOwnerId },
      input: {
        name: inputGrant.displayName,
        idempotencyKey,
        scopes: inputGrant.requestedScopes,
        grantRef: issuedAgentGrantRef(inputOwnerId, idempotencyKey),
        environment: inputGrant.approvedAccess.environment,
        toolAccess: inputGrant.approvedAccess.toolAccess,
        toolRefs: inputGrant.approvedAccess.toolRefs,
        expiresInSeconds: accessCredentialTtlSeconds(inputGrant.approvedAccess),
        ...(inputGrant.approvedAccess.maximumSpendPerCall === undefined ? {} : { maximumSpendPerCall: inputGrant.approvedAccess.maximumSpendPerCall }),
        ...(inputGrant.approvedAccess.maximumDailySpend === undefined ? {} : { maximumDailySpend: inputGrant.approvedAccess.maximumDailySpend }),
        ...(inputGrant.approvedAccess.maximumMonthlySpend === undefined ? {} : { maximumMonthlySpend: inputGrant.approvedAccess.maximumMonthlySpend }),
        ...(inputGrant.approvedAccess.maximumConcurrentCalls === undefined ? {} : { maximumConcurrentCalls: inputGrant.approvedAccess.maximumConcurrentCalls }),
        ...(inputGrant.approvedAccess.maximumCallsPerMinute === undefined ? {} : { maximumCallsPerMinute: inputGrant.approvedAccess.maximumCallsPerMinute }),
        ...(inputGrant.approvedAccess.maximumCallsPerHour === undefined ? {} : { maximumCallsPerHour: inputGrant.approvedAccess.maximumCallsPerHour }),
      },
      spendingPolicy,
      returnSecret: false,
      api: createClerkAgentAccessKeyApi(clerkClient().apiKeys),
      registerBinding: options.registerBinding ?? registerIssuedAgentBinding,
    })
    if (issued.kind === 'error') {
      if (issued.code === 'invalid_input') throw new AgentAccessOAuthIssueRefusal('invalid_scope')
      if (issued.code === 'idempotency_conflict') throw new AgentAccessOAuthIssueRefusal('invalid_grant')
      throw new Error(issued.code)
    }
    return { keyId: issued.keyId }
  }
  return await issue({ ownerId, grant, target })
}

export function accessCredentialTtlSeconds(approvedAccess: AgentAccessOAuthRequestedAccess): number {
  return Math.min(approvedAccess.expiresInSeconds, AGENT_ACCESS_KEY_TTL_SECONDS)
}

export function deriveOAuthGrantPolicy(requestedAccess: AgentAccessOAuthRequestedAccess): AgentAccessPolicy {
  if (!Number.isSafeInteger(requestedAccess.expiresInSeconds)
    || requestedAccess.expiresInSeconds < AGENT_ACCESS_MIN_TTL_SECONDS
    || requestedAccess.expiresInSeconds > AGENT_ACCESS_MAX_TTL_SECONDS) {
    throw new Error('invalid_requested_access')
  }
  const controls = [
    requestedAccess.maximumConcurrentCalls,
    requestedAccess.maximumCallsPerMinute,
    requestedAccess.maximumCallsPerHour,
  ]
  if (controls.some((value) => value !== undefined && (!Number.isSafeInteger(value) || value <= 0))) {
    throw new Error('invalid_requested_access')
  }
  const amounts = [
    requestedAccess.maximumSpendPerCall,
    requestedAccess.maximumDailySpend,
    requestedAccess.maximumMonthlySpend,
  ]
  const budgetCount = amounts.filter((amount) => amount !== undefined).length
  if (requestedAccess.environment === 'sandbox') {
    if (budgetCount !== 0 || controls.some((value) => value !== undefined)) throw new Error('invalid_requested_access')
    const base = defaultSandboxAgentAccessPolicy({ currency: 'AUD', exponent: 6 })
    return agentAccessPolicySchema.parse({
      ...base,
      toolAccess: requestedAccess.toolAccess,
      toolRefs: requestedAccess.toolRefs,
    })
  }
  if (budgetCount !== 0 && budgetCount !== amounts.length) throw new Error('invalid_requested_access')
  let base: AgentAccessPolicy
  if (budgetCount === amounts.length) {
    const [maximumSpendPerCall, maximumDailySpend, maximumMonthlySpend] = amounts
    if (maximumSpendPerCall === undefined || maximumDailySpend === undefined || maximumMonthlySpend === undefined) {
      throw new Error('invalid_requested_access')
    }
    base = buildProductionAgentAccessPolicy({
      currency: maximumSpendPerCall.currency,
      exponent: maximumSpendPerCall.exponent,
      maximumSpendPerCall,
      maximumDailySpend,
      maximumMonthlySpend,
    })
  } else {
    base = defaultProductionAgentAccessPolicy({ currency: 'AUD', exponent: 6 })
  }
  return agentAccessPolicySchema.parse({
    ...base,
    toolAccess: requestedAccess.toolAccess,
    toolRefs: requestedAccess.toolRefs,
    budget: {
      ...base.budget,
      ...(requestedAccess.maximumConcurrentCalls === undefined ? {} : { maximumConcurrentCalls: requestedAccess.maximumConcurrentCalls }),
    },
    rate: {
      ...base.rate,
      ...(requestedAccess.maximumCallsPerMinute === undefined ? {} : { maximumCallsPerMinute: requestedAccess.maximumCallsPerMinute }),
      ...(requestedAccess.maximumCallsPerHour === undefined ? {} : { maximumCallsPerHour: requestedAccess.maximumCallsPerHour }),
    },
  })
}