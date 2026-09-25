import { agentAccessPolicyDigest, normalizeAgentAccessToolSelection, type AgentAccessGrant, type NormalizedStoredAgentAccessGrant } from '@/modules/agent-access/policy'

export function sameGrantMaterial(left: NormalizedStoredAgentAccessGrant, right: NormalizedStoredAgentAccessGrant): boolean {
  return left.format === right.format
    && left.spendingPolicy.format === right.spendingPolicy.format
    && left.grantRef === right.grantRef
    && left.principalId === right.principalId
    && left.ownerId === right.ownerId
    && left.applicationRef === right.applicationRef
    && left.credentialId === right.credentialId
    && left.environment === right.environment
    && left.toolAccess === right.toolAccess
    && left.toolRefs.length === right.toolRefs.length
    && left.toolRefs.every((ref, index) => ref === right.toolRefs[index])
    && left.authorityMode === right.authorityMode
    && left.generation === right.generation
    && left.spendingPolicyDigest === right.spendingPolicyDigest
    && left.budgetPolicyRef === right.budgetPolicyRef
    && left.ratePolicyRef === right.ratePolicyRef
    && left.expiresAt === right.expiresAt
}

export function invalidGrantMaterial(grant: AgentAccessGrant): boolean {
  const selection = normalizeAgentAccessToolSelection(grant)
  return (selection === undefined
    || selection.toolRefs.some((ref, index) => ref !== grant.toolRefs[index])
    || grant.toolAccess !== grant.spendingPolicy.toolAccess
    || grant.toolRefs.length !== grant.spendingPolicy.toolRefs.length
    || grant.toolRefs.some((ref, index) => ref !== grant.spendingPolicy.toolRefs[index])
    || grant.spendingPolicy.environment !== grant.environment
    || (grant.environment === 'production' && grant.authorityMode === 'unrestricted_test_only')
    || grant.spendingPolicy.budget.budgetPolicyRef !== grant.budgetPolicyRef
    || grant.spendingPolicy.rate.ratePolicyRef !== grant.ratePolicyRef
    // Grant identity may rotate while budget/rate account generations remain
    // stable so credential replacement shares the principal's capacity.
    || grant.generation < 1
    || grant.expiresAt <= grant.createdAt
    || agentAccessPolicyDigest(grant.spendingPolicy) !== grant.spendingPolicyDigest)
}
