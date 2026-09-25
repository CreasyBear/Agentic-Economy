import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { MutationCtx } from '../../../_generated/server'
import type { CustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { resolveInteractiveAuthorityContext } from '../../../interactiveAuthority'
import { admitInteractiveOwnerConsequence } from '../../authority/consequence/owner'
import { validReplacementAssertion, type CanonicalCredentialOwner } from './records'
type LifecycleOwner = NonNullable<Awaited<ReturnType<typeof resolveInteractiveAuthorityContext>>>

export async function requireLifecycleOwner(
  ctx: MutationCtx,
  operation: string,
  command: StableHashValue,
  assertion: CustomerRequestServiceAssertion,
): Promise<LifecycleOwner | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null || !await validReplacementAssertion(operation, command, assertion)) return null
  try {
    return await resolveInteractiveAuthorityContext(ctx, identity)
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'requireLifecycleOwner', reason: 'forbidden' })
  }
}

export async function lifecycleMembership(ctx: MutationCtx, owner: CanonicalCredentialOwner, agentRef: string) {
  return await ctx.db.query('memberships')
    .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
      .eq('accountRef', owner.accountRef).eq('memberPrincipalRef', agentRef).eq('lifecycle', 'active'))
    .unique()
}

export async function admitAgentLifecycleReduction(
  ctx: MutationCtx,
  owner: LifecycleOwner,
  input: Readonly<{
    action: 'agent_access.revoke_credential' | 'agent_access.disconnect'
    targetType: 'agent_credential' | 'agent'
    targetRef: string
    targetRevision: number
    resourceRefs: readonly string[]
    consequenceSummary: string
    statusReadbackRef: string
    correlationRef: string
    idempotencyRef: string
    command: StableHashValue
    now: number
  }>,
): Promise<boolean> {
  try {
    const admitted = await admitInteractiveOwnerConsequence(ctx, {
      actor: {
        kind: 'authenticated_owner',
        canonicalPrincipalRef: owner.principalRef,
        canonicalAccountRef: owner.accountRef,
        authorityRevision: owner.revision,
        authorityProvenance: owner.provenance,
      },
      action: input.action,
      target: {
        targetType: input.targetType,
        targetRef: input.targetRef,
        targetRevision: input.targetRevision,
      },
      requiredScopes: ['agent:manage'],
      resourceRefs: input.resourceRefs,
      budgetAmount: 0,
      consequenceSummary: input.consequenceSummary,
      statusReadbackRef: input.statusReadbackRef,
      command: input.command,
      correlationRef: input.correlationRef,
      idempotencyRef: input.idempotencyRef,
      now: input.now,
    })
    return admitted.kind === 'admitted'
      && admitted.admission.consequenceAction === input.action
      && admitted.admission.descriptor !== undefined
      && admitted.admission.proofPolicy?.kind === 'none'
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'admitAgentLifecycleReduction', reason: 'invalid_response' })
  }
}
