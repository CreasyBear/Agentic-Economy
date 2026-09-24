import { type Infer } from 'convex/values'

import type { MutationCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { requireSourceWrite } from '../../../sourceWriteAdmission'
import { admitInteractiveOwnerConsequence } from '../../authority/consequence/owner'
import {
  DelegationService,
} from '../../../../src/modules/authority/delegation/public'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from '../../authority/delegation/persistence'
import {
  prepareOAuthOwnerArgs,
  prepareOAuthOwnerResult,
  prepareOwnerArgsValue,
} from './contracts'
import { providerConnectionSecretRef } from './shared'

type PrepareOAuthOwnerArgs = Infer<typeof prepareOwnerArgsValue>

export { prepareOAuthOwnerArgs, prepareOAuthOwnerResult }

export async function prepareOAuthOwnerHandler(ctx: MutationCtx, args: PrepareOAuthOwnerArgs) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') {
    return { kind: 'refused' as const, code: 'not_found' as const }
  }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'refused' as const, code: 'not_found' as const }
  }
  const attempt = await ctx.db.query('capabilityProviderConnectionAttempts')
    .withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef))
    .unique()
  if (attempt === null
    || attempt.owningAccountRef !== actor.canonicalAccountRef
    || attempt.sourceKind !== 'mcp_oauth'
    || attempt.authentication.kind !== 'mcp_oauth'
    || attempt.lifecycle !== 'pending') {
    return { kind: 'refused' as const, code: 'not_found' as const }
  }
  const now = Date.now()
  if (attempt.expiresAt <= now) {
    await ctx.db.patch(attempt._id, { lifecycle: 'expired', updatedAt: now })
    return { kind: 'refused' as const, code: 'attempt_expired' as const }
  }
  const secretRef = providerConnectionSecretRef(attempt.owningAccountRef, attempt.attemptRef)
  const provisionIdempotencyRef = `${args.commandId}:oauth-state`
  const rotationIdempotencyRef = `${args.commandId}:oauth-tokens`
  const admitted = await admitInteractiveOwnerConsequence(ctx, {
    actor,
    action: 'connection.connect',
    target: {
      targetType: 'provider_connection_attempt',
      targetRef: attempt.attemptRef,
      targetRevision: 1,
    },
    requiredScopes: ['secret:provision', 'secret:rotate'],
    resourceRefs: [`secret:${secretRef}`],
    budgetAmount: 0,
    consequenceSummary: `Sign in to ${attempt.sourceOrigin} and connect that exact MCP source.`,
    statusReadbackRef: `provider-connection-attempts/${attempt.attemptRef}`,
    command: {
      version: 'ae.provider-connection-mcp-oauth:v1',
      attemptRef: attempt.attemptRef,
      secretRef,
      sourceOrigin: attempt.sourceOrigin,
    },
    correlationRef: args.commandId,
    idempotencyRef: args.commandId,
    proof: args.proof,
    now,
  })
  if (admitted.kind === 'refused') return admitted

  const delegation = new DelegationService(
    createConvexDelegationStore(ctx),
    createConvexDelegationContextPort(ctx, actor.canonicalPrincipalRef),
    { now: () => now },
  )
  const grant = await delegation.issueRoot({
    context: {
      actorPrincipalRef: actor.canonicalPrincipalRef,
      activeAccountRef: actor.canonicalAccountRef,
      correlationRef: `secret-grant:${attempt.attemptRef}:oauth`,
      idempotencyRef: `secret-grant:${attempt.attemptRef}:oauth`,
    },
    subjectPrincipalRef: actor.canonicalPrincipalRef,
    scopes: ['secret:provision', 'secret:rotate'],
    resourceRefs: [`secret:${secretRef}`],
    budgetLimit: 2,
    expiresAt: attempt.expiresAt,
  })
  const authority = async (
    operation: 'provision' | 'rotate',
    idempotencyRef: string,
  ) => {
    const snapshot = await delegation.admitConsequence({
      grantRef: grant.grantRef,
      expectedGeneration: grant.generation,
      context: {
        actorPrincipalRef: actor.canonicalPrincipalRef,
        activeAccountRef: actor.canonicalAccountRef,
        correlationRef: idempotencyRef,
        idempotencyRef,
      },
      requiredScopes: [`secret:${operation}`],
      resourceRefs: [`secret:${secretRef}`],
      budgetAmount: 0,
    })
    return {
      operation,
      snapshotRef: snapshot.snapshotRef,
      accountRef: snapshot.accountRef,
      actorPrincipalRef: snapshot.actorPrincipalRef,
      grantRef: snapshot.grantRef,
      grantGeneration: snapshot.generation,
      correlationRef: snapshot.correlationRef,
      idempotencyRef: snapshot.idempotencyRef,
      occurredAt: snapshot.admittedAt,
    }
  }
  return {
    kind: 'prepared' as const,
    attemptRef: attempt.attemptRef,
    secretRef,
    provisionAuthority: await authority('provision', provisionIdempotencyRef),
    rotationAuthority: await authority('rotate', rotationIdempotencyRef),
  }
}
