import { ConsequenceAuthorityBoundary, type AuthorityConsequenceAdmission } from '../../../../src/modules/authority/context/public'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { accountRef, ownershipRef, principalRef } from '../../../../src/modules/principal-account/public'
import type { ProviderConnectionActor } from './contracts'

async function readCurrentX402Ownership(
  ctx: MutationCtx,
  actor: ProviderConnectionActor,
) {
  const provenance = actor.authorityProvenance
  const revision = actor.authorityRevision
  if (provenance?.accessKind !== 'ownership'
    || provenance.accessRef !== provenance.currentOwnershipRef
    || revision === undefined) return null
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', provenance.currentOwnershipRef as never))
    .unique()
  const ownershipIsCurrent = ownership !== null
    && ownership.lifecycle === 'active'
    && ownership.accountRef === actor.canonicalAccountRef
    && ownership.ownerPrincipalRef === actor.canonicalPrincipalRef
    && ownership.revision === revision.currentOwnership
  return ownershipIsCurrent ? { ownership, revision } : null
}

function x402ConsequenceParameters(
  input: Readonly<{
    actor: ProviderConnectionActor
    connectionRef: string
    canonicalResourceUrl: string
    method: 'GET' | 'POST'
    payee: string
    observationDigest: string
    claimDigest: string
    commandId: string
    existing: Doc<'capabilityProviderConnections'> | null
    now: number
  }>,
  currentOwnership: NonNullable<Awaited<ReturnType<typeof readCurrentX402Ownership>>>,
) {
  const action = input.existing === null ? 'connection.connect' as const : 'connection.reauthorize' as const
  return {
    binding: {
      principalClass: 'interactive' as const,
      actorPrincipalRef: principalRef(input.actor.canonicalPrincipalRef),
      activeAccountRef: accountRef(input.actor.canonicalAccountRef),
      authoritySource: {
        kind: 'account_ownership' as const,
        ownershipRef: ownershipRef(currentOwnership.ownership.ownershipRef),
        ownershipRevision: currentOwnership.ownership.revision,
        accountRevision: currentOwnership.revision.account,
        admittedAt: input.now,
        expiresAt: input.now + 1,
      },
    },
    consequence: {
      requiredScopes: [input.existing === null ? 'connection:install' : 'connection:refresh'],
      resourceRefs: [`connection:${input.connectionRef}`, `connection-provider:x402:${input.canonicalResourceUrl}`],
      budgetAmount: 0,
      correlationRef: input.commandId,
      idempotencyRef: input.commandId,
      consequence: {
        action,
        target: {
          targetType: 'provider_connection',
          targetRef: input.connectionRef,
          targetRevision: input.existing?.authorityGeneration ?? 1,
        },
        consequenceSummary: input.existing === null
          ? 'Connect this exact x402 resource and payee authority.'
          : 'Reauthorize this exact x402 resource and payee authority.',
        statusReadbackRef: `provider-connections/${input.connectionRef}`,
        command: {
          version: 'ae.x402-connection-authority:v1',
          action,
          commandId: input.commandId,
          connectionRef: input.connectionRef,
          expectedAuthorityGeneration: input.existing?.authorityGeneration ?? 0,
          expectedAuthorityDigest: input.existing?.authorityDigest ?? null,
          method: input.method,
          resourceUrl: input.canonicalResourceUrl,
          payee: input.payee,
          observationDigest: input.observationDigest,
          claimDigest: input.claimDigest,
        },
      },
    },
  }
}

export async function x402ConnectionConsequenceAdmission(input: Readonly<{
  ctx: MutationCtx
  actor: ProviderConnectionActor
  connectionRef: string
  canonicalResourceUrl: string
  method: 'GET' | 'POST'
  payee: string
  observationDigest: string
  claimDigest: string
  commandId: string
  existing: Doc<'capabilityProviderConnections'> | null
  now: number
}>): Promise<AuthorityConsequenceAdmission | null> {
  const currentOwnership = await readCurrentX402Ownership(input.ctx, input.actor)
  if (currentOwnership === null) return null
  const parameters = x402ConsequenceParameters(input, currentOwnership)
  const boundary = new ConsequenceAuthorityBoundary({
    admitConsequence: async () => {
      throw new Error('provider_connection_owner_delegation_unreachable')
    },
  })
  return await boundary.forSurface('convex', {
    resolveCanonicalBinding: async () => parameters.binding,
  }).withCurrentAuthority(parameters.consequence, async (admission) => admission)
}
