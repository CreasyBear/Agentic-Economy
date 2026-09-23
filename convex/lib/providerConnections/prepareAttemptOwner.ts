import { type Infer } from 'convex/values'

import type { MutationCtx } from '../../_generated/server'
import { resolveBusinessActor } from '../../authz'
import { requireSourceWrite } from '../../sourceWriteAdmission'
import { admitInteractiveOwnerConsequence } from '../ownerConsequence'
import {
  DelegationService,
} from '../../../src/modules/authority/delegation/public'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from '../delegationPersistence'
import { providerRouteabilityIsFrozen } from '../providerOffboardingFreeze'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import {
  prepareOwnerArgs,
  prepareOwnerArgsValue,
  prepareOwnerResult,
} from './attemptValidators'

type PrepareOwnerArgs = Infer<typeof prepareOwnerArgsValue>

export { prepareOwnerArgs, prepareOwnerResult }

export async function prepareOwnerHandler(ctx: MutationCtx, args: PrepareOwnerArgs) {
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
    || attempt.lifecycle !== 'pending') {
    return { kind: 'refused' as const, code: 'not_found' as const }
  }
  const now = Date.now()
  if (attempt.expiresAt <= now) {
    await ctx.db.patch(attempt._id, { lifecycle: 'expired', updatedAt: now })
    return { kind: 'refused' as const, code: 'attempt_expired' as const }
  }
  if (await providerRouteabilityIsFrozen(ctx, attempt.businessId)) {
    return { kind: 'refused' as const, code: 'connection_conflict' as const }
  }
  const secretRef = `sec_${canonicalDigest({
    format: 'provider-connection-secret-ref:v1',
    owningAccountRef: attempt.owningAccountRef,
    attemptRef: attempt.attemptRef,
  }).slice('sha256:'.length, 'sha256:'.length + 32)}`
  const admitted = await admitInteractiveOwnerConsequence(ctx, {
    actor,
    action: 'connection.connect',
    target: {
      targetType: 'provider_connection_attempt',
      targetRef: attempt.attemptRef,
      targetRevision: 1,
    },
    requiredScopes: ['secret:provision'],
    resourceRefs: [`secret:${secretRef}`],
    budgetAmount: 0,
    consequenceSummary: `Store one credential for ${attempt.sourceOrigin} and connect that exact Provider source.`,
    statusReadbackRef: `provider-connection-attempts/${attempt.attemptRef}`,
    command: {
      version: 'ae.provider-connection-secret-provision:v1',
      attemptRef: attempt.attemptRef,
      secretRef,
      sourceOrigin: attempt.sourceOrigin,
      authentication: attempt.authentication,
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
      correlationRef: `secret-grant:${attempt.attemptRef}`,
      idempotencyRef: `secret-grant:${attempt.attemptRef}`,
    },
    subjectPrincipalRef: actor.canonicalPrincipalRef,
    scopes: ['secret:provision'],
    resourceRefs: [`secret:${secretRef}`],
    budgetLimit: 1,
    expiresAt: attempt.expiresAt,
  })
  const snapshot = await delegation.admitConsequence({
    grantRef: grant.grantRef,
    expectedGeneration: grant.generation,
    context: {
      actorPrincipalRef: actor.canonicalPrincipalRef,
      activeAccountRef: actor.canonicalAccountRef,
      correlationRef: args.commandId,
      idempotencyRef: args.commandId,
    },
    requiredScopes: ['secret:provision'],
    resourceRefs: [`secret:${secretRef}`],
    budgetAmount: 0,
  })
  return {
    kind: 'prepared' as const,
    attemptRef: attempt.attemptRef,
    secretRef,
    authority: {
      operation: 'provision' as const,
      snapshotRef: snapshot.snapshotRef,
      accountRef: snapshot.accountRef,
      actorPrincipalRef: snapshot.actorPrincipalRef,
      grantRef: snapshot.grantRef,
      grantGeneration: snapshot.generation,
      correlationRef: snapshot.correlationRef,
      idempotencyRef: snapshot.idempotencyRef,
      occurredAt: snapshot.admittedAt,
    },
  }
}
