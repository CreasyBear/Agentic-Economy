import { issueAgentAccessKey, type AgentAccessKeyApi, type AgentAccessKeyResult, type AgentAccessGrantRegistrationResult, type AgentCredentialReplacementRegistration, type AgentCredentialReplacementRegistrationResult, type AgentCredentialReplacementTransition, type AgentCredentialReplacementTransitionResult, type AgentLifecycleCanonicalResult, type AgentLifecycleResult } from './agent-access'
import { agentAccessPolicyDigest, buildAgentAccessPolicy } from './policy'
import { issuedAgentGrantRef } from './issued-agent-binding'
import type { AgentDetail } from './agent-operator-view-model'

export type ReplaceAgentKeyDeps = Readonly<{
  userId: string
  detail: AgentDetail
  idempotencyKey: string
  api: AgentAccessKeyApi
  prepare: (input: AgentCredentialReplacementRegistration) => Promise<AgentCredentialReplacementRegistrationResult>
  promote: (input: AgentCredentialReplacementTransition) => Promise<AgentCredentialReplacementTransitionResult>
  cancel: (input: AgentCredentialReplacementTransition) => Promise<AgentCredentialReplacementTransitionResult>
  completeLifecycle: (canonical: AgentLifecycleCanonicalResult) => Promise<AgentLifecycleResult>
  correlationRef: string
}>

/**
 * Requires: an owner-authorised Agent detail with a readable active grant.
 * Ensures: a successor key is minted and prepared, then promoted, and the
 * predecessor is revoked at the provider; the secret is returned only after
 * promote completes.
 * Invariant: the successor keeps the predecessor's scopes, tools and limits.
 * On violation: the pending successor is cancelled and its provider key revoked.
 */
export async function replaceAgentAccessKey(deps: ReplaceAgentKeyDeps): Promise<AgentAccessKeyResult> {
  const { detail, userId, idempotencyKey } = deps
  const { grant, agent } = detail
  const failed = { kind: 'error', code: 'invalid_input', retryable: false } as const
  if (grant === undefined || grant.lifecycle !== 'active') return failed
  const base = buildAgentAccessPolicy({
      environment: agent.environment,
      currency: grant.budget.maximumSpendPerCall.currency,
      exponent: grant.budget.maximumSpendPerCall.exponent,
      maximumSpendPerCall: grant.budget.maximumSpendPerCall,
      maximumDailySpend: grant.budget.maximumDailySpend,
      maximumMonthlySpend: grant.budget.maximumMonthlySpend,
      toolAccess: grant.toolAccess,
      toolRefs: grant.toolRefs,
  })
  const tuned = { ...base,
    budget: { ...base.budget, maximumConcurrentCalls: grant.budget.maximumConcurrentCalls },
    rate: { ...base.rate, ...grant.rate } }
  const box: { prepared?: Extract<AgentCredentialReplacementRegistrationResult, { predecessorKeyId: string }> } = {}
  const issued = await issueAgentAccessKey({
    principal: { userId },
    input: {
      name: agent.displayName,
      idempotencyKey,
      scopes: detail.scopes,
      grantRef: issuedAgentGrantRef(userId, idempotencyKey),
      applicationRef: agent.applicationRef,
      environment: agent.environment,
      toolAccess: grant.toolAccess,
      toolRefs: grant.toolRefs,
    },
    spendingPolicy: tuned,
    api: deps.api,
    registerBinding: async (binding): Promise<AgentAccessGrantRegistrationResult> => {
      const result = await deps.prepare({
        principalRef: agent.principalRef,
        replacementMode: 'planned',
        issuanceKey: binding.issuanceKey,
        grantRef: binding.grantRef,
        credentialId: binding.credentialId,
        applicationRef: binding.applicationRef,
        environment: binding.environment,
        scopes: binding.scopes,
        authorityMode: binding.authorityMode,
        toolAccess: binding.toolAccess,
        toolRefs: binding.toolRefs,
        spendingPolicy: binding.spendingPolicy,
        createdAt: binding.createdAt,
        expiresAt: binding.expiresAt,
      })
      if (result.kind !== 'recorded' && result.kind !== 'replayed') return { kind: result.kind === 'conflict' ? 'conflict' : 'unavailable' }
      box.prepared = result
      return {
        kind: result.kind, grantRef: result.successorGrantRef, generation: result.generation,
        spendingPolicyDigest: agentAccessPolicyDigest(binding.spendingPolicy), lifecycle: 'active', expiresAt: binding.expiresAt,
      }
    },
  })
  if ((issued.kind !== 'created' && issued.kind !== 'replayed') || box.prepared === undefined) return issued
  const prepared = box.prepared
  const transition = { principalRef: agent.principalRef, successorCredentialRef: prepared.successorCredentialRef, successorGrantRef: prepared.successorGrantRef }
  const promoted = await deps.promote(transition)
  if (promoted.kind !== 'completed' && promoted.kind !== 'replayed') {
    await deps.cancel(transition)
    await deps.api.revoke?.({ apiKeyId: issued.keyId, revocationReason: 'Replacement could not be promoted.' })
    return { kind: 'error', code: 'issuance_unavailable', retryable: true }
  }
  const completion = await deps.completeLifecycle({
    kind: 'completed', principalRef: agent.principalRef, correlationRef: deps.correlationRef,
    providerTargets: [{ credentialRef: prepared.predecessorCredentialRef, providerCredentialId: promoted.providerCredentialId }],
  })
  // A partial result means the predecessor key may still be live at the provider; the caller retries.
  if (completion.kind !== 'completed' && completion.kind !== 'replayed') return { kind: 'error', code: 'issuance_unavailable', retryable: true }
  return issued
}
