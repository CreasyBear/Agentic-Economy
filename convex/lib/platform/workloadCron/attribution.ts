import type { JsonValue } from '@/modules/capability-contract/public'
import { accountRef, principalRef, WorkloadContextAdmission } from '@/modules/principal-account/public'
import { DelegationError, DelegationService, delegationGrantRef } from '@/modules/authority/delegation/public'
import { internal } from '../../../_generated/api'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { createConvexDelegationContextPort, createConvexDelegationStore } from '../../authority/delegation/persistence'
import { workloadContextFromSnapshot } from './admission'
import type { ConsequenceOperation } from './contracts'
import { WorkloadCronBoundaryError, type WorkloadCronSnapshot } from './context'
import { ConvexWorkloadContextStore } from './store'

function matchesCapturedAccessGrant(
  grant: Doc<'agentAccessGrants'> | null,
  call: Doc<'capabilityCalls'>,
): boolean {
  return grant !== null
    && grant.principalId === call.principalId
    && grant.ownerId === call.ownerId
    && grant.credentialId === call.credentialId
    && grant.applicationRef === call.applicationRef
    && grant.environment === call.environment
    && grant.generation === call.grantGeneration
    && grant.spendingPolicyDigest === call.policyDigest
    && grant.expiresAt === call.grantExpiresAt
}

/**
 * CONTRACT: attributeInvocationResourceAccount
 * Requires current system workload authority and matching immutable Call,
 * access-grant and canonical delegation identities. Refund bookkeeping is
 * limited to its exact Call and an existing pre-claim refund proof.
 * Ensures Account attribution survives expired/revoked buyer authority only
 * for claiming/finishing that proven refund; other consequences require live
 * canonical delegation. Access and delegation generations remain distinct.
 * Invariant: this never grants Provider effect authority or changes a booking.
 * On violation: workload_resource_authority_invalid, before consequence writes.
 */
export async function attributeInvocationResourceAccount(
  ctx: MutationCtx,
  current: WorkloadCronSnapshot,
  callRef: string,
  operation: ConsequenceOperation,
  payload: Readonly<Record<string, JsonValue>>,
): Promise<void> {
  const invocation = await ctx.db
    .query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
    .unique()
  if (invocation === null) throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
  const grant = await ctx.db
    .query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', invocation.grantRef))
    .unique()
  if (grant === null) {
    throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
  }
  const accessGrant = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', invocation.grantRef))
    .unique()
  if (!matchesCapturedAccessGrant(accessGrant, invocation)) {
    throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
  }
  const refundBookkeeping = operation === 'capabilityCalls:claimAutomaticReconciliationCandidate'
    || operation === 'capabilityCalls:finishAutomaticReconciliation'
  if (refundBookkeeping && payload.callRef !== callRef) {
    throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
  }
  // The grant chain remains the only Account source. Legacy invocation fields
  // are checked solely as fail-closed immutable-integrity evidence and never
  // seed the admission context below.
  if (invocation.principalId !== grant.subjectPrincipalRef
    || invocation.ownerId !== grant.accountRef
    || invocation.grantExpiresAt !== grant.expiresAt
    || (!grant.resourceRefs.includes('*') && !grant.resourceRefs.includes(invocation.toolRef))) {
    throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
  }
  try {
    const canonicalGrantRef = delegationGrantRef(invocation.grantRef)
    const canonicalSubjectPrincipalRef = principalRef(grant.subjectPrincipalRef)
    const canonicalAccountRef = accountRef(grant.accountRef)
    if (refundBookkeeping && await ctx.runQuery(internal.capabilityCalls.readPreClaimRefund, { callRef })) {
      if (canonicalAccountRef !== current.activeAccountRef) {
        await new WorkloadContextAdmission(new ConvexWorkloadContextStore(ctx)).attributeCrossAccount({
          context: workloadContextFromSnapshot(current),
          counterpartyAccountRef: canonicalAccountRef,
        })
      }
      return
    }
    const snapshot = await new DelegationService(
      createConvexDelegationStore(ctx),
      createConvexDelegationContextPort(ctx, canonicalSubjectPrincipalRef),
    ).admitConsequence({
      grantRef: canonicalGrantRef,
      expectedGeneration: grant.generation,
      context: {
        actorPrincipalRef: canonicalSubjectPrincipalRef,
        activeAccountRef: canonicalAccountRef,
        correlationRef: current.correlationRef,
        idempotencyRef: `cron-admit:${current.admittedAt}:${canonicalGrantRef}:${grant.generation}`,
      },
      requiredScopes: grant.scopes,
      resourceRefs: [invocation.toolRef],
      budgetAmount: 0,
    })
    const consequenceNow = Date.now()
    if (snapshot.grantRef !== canonicalGrantRef
      || snapshot.generation !== grant.generation
      || snapshot.accountRef !== canonicalAccountRef
      || snapshot.actorPrincipalRef !== canonicalSubjectPrincipalRef
      || snapshot.expiresAt <= consequenceNow) {
      throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
    }
    if (canonicalAccountRef !== current.activeAccountRef) {
      await new WorkloadContextAdmission(new ConvexWorkloadContextStore(ctx)).attributeCrossAccount({
        context: workloadContextFromSnapshot(current),
        counterpartyAccountRef: canonicalAccountRef,
      })
    }
  } catch (error) {
    if (error instanceof WorkloadCronBoundaryError) throw error
    if (error instanceof DelegationError) {
      throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
    }
    throw error
  }
}
