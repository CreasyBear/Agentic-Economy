import type { MutationCtx } from '../../../_generated/server'
import {
  loadExactOfferingSourceState,
  persistOfferingSourceState,
} from '../../catalog/offerings/persistence'
import {
  changeOfferingStatusInState,
  withdrawAccessPathInState,
} from '@/modules/catalog/public'
import { providerOffboardingCompletion } from '@/modules/capability-supply/provider-offboarding'
import {
  block,
  countActiveConnections,
  hasActiveCall,
  hasUnresolvedObligations,
  hasUnresolvedPayouts,
  offeringOffboardingAuthorityDigest,
  readTargetPage,
  requireCase,
} from './caseState'

export async function verifyCallsPageHandler(
  ctx: MutationCtx,
  args: { caseRef: string; afterToolRef?: string },
) {
  const row = await requireCase(ctx, args.caseRef)
  const targets = await readTargetPage(ctx, row.caseRef, 'tool', args.afterToolRef)
  for (const target of targets) {
    if (await hasActiveCall(ctx, target.targetRef)) {
      await block(ctx, row, 'drain-calls', 'calls_remain')
      return { ready: false, done: false }
    }
  }
  const last = targets.at(-1)
  return {
    ready: true,
    done: targets.length < 100,
    ...(targets.length < 100 || last === undefined ? {} : { nextToolRef: last.targetRef }),
  }
}

export async function retireOfferingTargetsPageHandler(
  ctx: MutationCtx,
  args: { caseRef: string; afterOfferingRef?: string },
) {
  const row = await requireCase(ctx, args.caseRef)
  const targets = await readTargetPage(ctx, row.caseRef, 'offering', args.afterOfferingRef)
  for (const target of targets) {
    const initial = await loadExactOfferingSourceState(ctx.db, row.businessId, {
      offeringRef: target.targetRef,
    })
    const offering = initial.offerings[0]
    if (offering === undefined || offering.status === 'retired') continue
    if (
      offering.currentRevision !== target.targetRevision
      || offeringOffboardingAuthorityDigest(row.businessId, offering) !== target.authorityDigest
    ) {
      await block(ctx, row, 'verify-completion', 'offering_retirement_conflict')
      return { ready: false, done: false }
    }
    let next = initial
    const authority = {
      actorRef: row.requestedByPrincipalRef,
      ownerRef: row.requestedByPrincipalRef,
      businessOwnerRef: row.requestedByPrincipalRef,
    }
    for (const path of initial.accessPaths.filter((candidate) => candidate.status !== 'withdrawn')) {
      const withdrawn = withdrawAccessPathInState(next, {
        authority,
        operationKey: `${row.caseRef}:withdraw-path:${path.accessPathRef}`,
        accessPathRef: path.accessPathRef,
        expectedRevision: offering.currentRevision,
        now: Date.now(),
      })
      if (withdrawn.kind === 'error') throw new Error(`provider_offboarding_path_${withdrawn.code}`)
      next = withdrawn.state
    }
    const retired = changeOfferingStatusInState(next, {
      authority,
      operationKey: `${row.caseRef}:retire-offering:${offering.offeringRef}`,
      offeringRef: offering.offeringRef,
      expectedRevision: offering.currentRevision,
      status: 'retired',
      now: Date.now(),
    })
    if (retired.kind === 'error') throw new Error(`provider_offboarding_offering_${retired.code}`)
    const persisted = await persistOfferingSourceState(ctx.db, row.businessId, initial, retired.state, 'owner')
    if (persisted.kind === 'error') throw new Error('provider_offboarding_retirement_persist_failed')
  }
  const last = targets.at(-1)
  return {
    ready: true,
    done: targets.length < 100,
    ...(targets.length < 100 || last === undefined ? {} : { nextOfferingRef: last.targetRef }),
  }
}

export async function verifyCompletionHandler(ctx: MutationCtx, args: { caseRef: string }) {
  const row = await requireCase(ctx, args.caseRef)
  const routeable = await ctx.db.query('capabilityPublications')
    .withIndex('by_businessId_and_disposition', (index) => index.eq('businessId', row.businessId))
    .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field('disposition'), 'current'))
    .take(1)
  const completion = providerOffboardingCompletion({
    routeableToolCount: routeable.length,
    activeOrUnknownCallCount: 0,
    unresolvedObligationCount: await hasUnresolvedObligations(ctx, row.providerRef) ? 1 : 0,
    activeOrCleanupPendingConnectionCount: await countActiveConnections(ctx, row.businessId),
    retentionPolicyVersion: row.retentionPolicyVersion,
  })
  if (completion.kind === 'blocked') return await block(ctx, row, 'verify-completion', completion.blocker)
  if (await hasUnresolvedPayouts(ctx, String(row.businessId))) return await block(ctx, row, 'verify-completion', 'payout_resolution_required')
  const now = Date.now()
  await ctx.db.patch(row._id, {
    state: 'retired',
    blockerCodes: [],
    evidenceRefs: [...row.evidenceRefs, `retention-policy:${row.retentionPolicyVersion}`, `provider-offboarding:completed:${row.caseRef}`],
    revision: row.revision + 1,
    completedAt: now,
    updatedAt: now,
  })
  return { ready: true }
}
