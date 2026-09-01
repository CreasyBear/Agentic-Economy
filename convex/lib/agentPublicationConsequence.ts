import type { MutationCtx } from '../_generated/server'

import {
  AuthorityBoundaryError,
  ConsequenceAuthorityBoundary,
  type AuthorityConsequenceAdmission,
  type Package3ConsequenceAction,
} from '../../src/modules/authority/context/public'
import {
  DelegationError,
  DelegationService,
  delegationGrantRef,
} from '../../src/modules/authority/delegation/public'
import { accountRef, principalRef } from '../../src/modules/principal-account/public'
import { MARKET_SUPPLY_MANAGE_SCOPE } from '../../src/modules/agent-access/contract'
import type { AgentSupplyPrincipalAdmission } from '../agentAccessPrincipals'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from './delegationPersistence'

type AllowedAgentSupplyPrincipal = Extract<
  AgentSupplyPrincipalAdmission,
  { kind: 'allowed' }
>

type AgentPublicationAction = Extract<
  Package3ConsequenceAction,
  'publication.publish' | 'publication.republish' | 'publication.withdraw'
>

export async function admitAgentPublicationConsequence(
  ctx: MutationCtx,
  input: Readonly<{
    agent: AllowedAgentSupplyPrincipal
    action: AgentPublicationAction
    target: Readonly<{
      targetType: 'capability_publication'
      targetRef: string
      targetRevision: number
    }>
    resourceRefs: readonly string[]
    consequenceSummary: string
    statusReadbackRef: string
    correlationRef: string
    idempotencyRef: string
    command: unknown
    now: number
  }>,
): Promise<AuthorityConsequenceAdmission | null> {
  const rows = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', input.agent.grantRef))
    .take(2)
  const grant = rows.length === 1 ? rows[0] : undefined
  if (grant === undefined
    || grant.lifecycle !== 'active'
    || grant.accountRef !== input.agent.ownerId
    || grant.subjectPrincipalRef !== input.agent.principalId
    || grant.expiresAt <= input.now) return null

  let actor
  let account
  let canonicalGrantRef
  try {
    actor = principalRef(input.agent.principalId)
    account = accountRef(input.agent.ownerId)
    canonicalGrantRef = delegationGrantRef(grant.grantRef)
  } catch {
    return null
  }

  const boundary = new ConsequenceAuthorityBoundary(new DelegationService(
    createConvexDelegationStore(ctx),
    createConvexDelegationContextPort(ctx, actor),
    { now: () => input.now },
  ))
  try {
    const admission = await boundary.forSurface('convex', {
      resolveCanonicalBinding: async () => ({
        principalClass: 'interactive',
        actorPrincipalRef: actor,
        activeAccountRef: account,
        grantRef: canonicalGrantRef,
        grantGeneration: grant.generation,
      }),
    }).withCurrentAuthority({
      requiredScopes: [MARKET_SUPPLY_MANAGE_SCOPE],
      resourceRefs: input.resourceRefs,
      budgetAmount: 0,
      correlationRef: input.correlationRef,
      idempotencyRef: input.idempotencyRef,
      consequence: {
        action: input.action,
        target: input.target,
        consequenceSummary: input.consequenceSummary,
        statusReadbackRef: input.statusReadbackRef,
        command: input.command,
      },
    }, async (admission) => admission)
    return admission.authoritySource.kind === 'delegation_snapshot'
      && admission.consequenceAction === input.action
      && admission.descriptor !== undefined
      && admission.proofPolicy !== undefined
      ? admission
      : null
  } catch (error) {
    if (error instanceof DelegationError || error instanceof AuthorityBoundaryError) return null
    throw error
  }
}
