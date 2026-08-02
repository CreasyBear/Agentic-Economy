import {
  routeAttemptIntegrityValid,
  routeDispatchIntegrityValid,
} from '@/modules/customer-request/route-execution/journal'
import type {
  DispatchLifecycleOpenPorts,
  DispatchLifecyclePorts,
  DispatchPublicationSnapshot,
  DispatchInvocation,
  MarkDispatchedResult,
  OpenDispatchResult,
  RecordNotReleasedResult,
} from '@/modules/customer-request/route-execution/machines'
import { routeStepGrantDigest } from '@/modules/customer-request/route-mandate-admission'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
  markUnknownOutcome,
  readRunProjection,
} from './customerRequestRouteExecutionJournalPorts'
import {
  loadActiveRouteMandate,
  loadEligibleRouteSupply,
} from './customerRequestRouteExecutionOpenPorts'
import {
  requireAttempt,
  requireDispatch,
  requireRun,
  toAttemptRecord,
  toDispatchRecord,
  toRunRecord,
} from './customerRequestRouteExecutionSnapshots'

export function dispatchLifecyclePorts(ctx: MutationCtx): DispatchLifecyclePorts {
  return {
    ...dispatchLifecycleOpenPorts(ctx),

    loadRunByRef: async (runRef) => {
      const run = await ctx.db.query('customerRequestRouteRuns')
        .withIndex('by_runRef', (query) => query.eq('runRef', runRef)).unique()
      return run === null ? null : toRunRecord(run)
    },

    loadRunProjection: async (runRef) => await readRunProjection(ctx, runRef),


    commitMarkDispatched: async (input) => {
      const dispatch = await requireDispatch(ctx, input.dispatchRef)
      const attempt = await requireAttempt(ctx, input.attemptRef)
      const run = await requireRun(ctx, input.runRef)
      await ctx.db.patch(dispatch._id, { state: 'delivered', updatedAt: input.now })
      await ctx.db.patch(attempt._id, { state: 'dispatched', updatedAt: input.now })
      await ctx.db.patch(run._id, { state: 'running', updatedAt: input.now })
      return { kind: 'recorded' } satisfies Extract<MarkDispatchedResult, { kind: 'recorded' }>
    },

    commitNotReleasedFailed: async (input) => {
      const dispatch = await requireDispatch(ctx, input.dispatchRef)
      const attempt = await requireAttempt(ctx, input.attemptRef)
      const run = await requireRun(ctx, input.runRef)
      await ctx.db.patch(dispatch._id, { state: 'failed', updatedAt: input.now })
      await ctx.db.patch(attempt._id, {
        state: 'failed',
        transportObservationJson: input.observationJson,
        transportObservationDigest: input.observationDigest,
        updatedAt: input.now,
      })
      await ctx.db.patch(run._id, {
        state: 'failed',
        resultJson: input.resultJson,
        resultDigest: input.resultDigest,
        updatedAt: input.now,
      })
      const failed = await readRunProjection(ctx, run.runRef)
      if (failed === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: 'failed', run: failed } satisfies Extract<
        RecordNotReleasedResult,
        { kind: 'failed' }
      >
    },

  }
}

export function dispatchLifecycleOpenPorts(ctx: QueryCtx | MutationCtx): DispatchLifecycleOpenPorts {
  return {
    now: () => Date.now(),

    loadDispatchByRef: async (dispatchRef) => {
      const dispatch = await ctx.db.query('customerRequestRouteDispatchOutbox')
        .withIndex('by_dispatchRef', (query) => query.eq('dispatchRef', dispatchRef)).unique()
      return dispatch === null ? null : toDispatchRecord(dispatch)
    },

    loadAttemptByRef: async (attemptRef) => {
      const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attemptRef)).unique()
      return attempt === null ? null : toAttemptRecord(attempt)
    },

    loadActiveMandateForPrincipal: async (requestId, principalId, now) => (
      await loadActiveRouteMandate(ctx, requestId, principalId, now)
    ),

    loadEligibleExactCapabilitySupply: async (input) => (
      await loadEligibleRouteSupply(ctx, input)
    ),

    loadPublicationAtRevision: async (publicationRef, revision) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', publicationRef).eq('revision', revision)
        )).unique()
      return publication === null ? null : toPublicationSnapshot(publication)
    },
  }
}
export async function openDispatchFromJournal(
  args: Readonly<{ dispatchRef: string }>,
  ports: DispatchLifecycleOpenPorts,
): Promise<OpenDispatchResult> {
  const now = ports.now()
  const dispatch = await ports.loadDispatchByRef(args.dispatchRef)
  const attempt = dispatch === null ? null : await ports.loadAttemptByRef(dispatch.attemptRef)
  if (dispatch === null || attempt === null || dispatch.state !== 'pending'
    || attempt.state !== 'queued' || dispatch.attemptRef !== attempt.attemptRef
    || dispatch.runRef !== attempt.runRef
    || dispatch.operationKeyDigest !== attempt.operationKeyDigest
    || !routeDispatchIntegrityValid(dispatch) || !routeAttemptIntegrityValid(attempt)
    || attempt.grant.grantRef !== `route-step-grant:v1:${attempt.grant.grantDigest}`
    || routeStepGrantDigest(attempt.grant) !== attempt.grant.grantDigest
    || attempt.grant.expiresAt <= now) {
    return { kind: 'unavailable' }
  }
  const mandate = await ports.loadActiveMandateForPrincipal(
    attempt.requestId, attempt.grant.principalId, now,
  )
  if (mandate.kind !== 'active' || mandate.mandateRef !== attempt.grant.mandateRef
    || mandate.mandateDigest !== attempt.grant.mandateDigest) {
    return { kind: 'unavailable' }
  }
  const supply = await ports.loadEligibleExactCapabilitySupply({
    networkId: mandate.networkId,
    businessId: attempt.grant.step.businessId,
    offeringId: attempt.grant.step.offeringId,
    bindingId: attempt.grant.step.bindingId,
    contractRef: attempt.grant.step.contractRef,
    expectedOfferingRegistrationHash: attempt.grant.step.offeringRegistrationHash,
    expectedBindingRegistrationHash: attempt.grant.step.bindingRegistrationHash,
  })
  if (supply.kind !== 'available') return { kind: 'unavailable' }
  const publication = await ports.loadPublicationAtRevision(
    attempt.grant.step.publicationRef,
    attempt.grant.step.publicationRevision,
  )
  if (publication === null || publication.disposition !== 'current'
    || publication.businessId !== attempt.grant.step.businessId
    || publication.networkId !== mandate.networkId
    || publication.offeringId !== attempt.grant.step.offeringId
    || publication.bindingId !== attempt.grant.step.bindingId
    || publication.capabilityId !== attempt.grant.step.contractRef.capabilityId
    || publication.version !== attempt.grant.step.contractRef.version
    || publication.contractDigest !== attempt.grant.step.contractRef.contractDigest
    || publication.credentialState !== 'ready' || publication.healthState !== 'healthy'
    || publication.readinessObservedAt === undefined || publication.readinessObservedAt > now
    || publication.readinessValidUntil === undefined
    || publication.readinessValidUntil < now) {
    return { kind: 'unavailable' }
  }
  const invocation: DispatchInvocation = {
    dispatchRef: dispatch.dispatchRef,
    attemptRef: attempt.attemptRef,
    runRef: attempt.runRef,
    operationKeyDigest: attempt.operationKeyDigest,
    inputJson: attempt.inputJson,
    inputDigest: attempt.inputDigest,
    binding: { ...supply.binding },
    authority: {
      mandateDigest: attempt.grant.mandateDigest,
      grantDigest: attempt.grant.grantDigest,
      capabilityContractDigest: attempt.grant.step.contractRef.contractDigest,
      maximumSpend: { ...attempt.grant.step.maximumSpend },
      expiresAt: attempt.grant.expiresAt,
    },
  }
  return { kind: 'available', invocation }
}


function toPublicationSnapshot(
  publication: Doc<'capabilityPublications'>,
): DispatchPublicationSnapshot {
  return {
    disposition: publication.disposition,
    businessId: String(publication.businessId),
    networkId: publication.networkId,
    offeringId: publication.offeringId,
    bindingId: publication.bindingId,
    capabilityId: publication.capabilityId,
    version: publication.version,
    contractDigest: publication.contractDigest,
    credentialState: publication.credentialState,
    healthState: publication.healthState,
    ...(publication.readinessObservedAt === undefined
      ? {}
      : { readinessObservedAt: publication.readinessObservedAt }),
    ...(publication.readinessValidUntil === undefined
      ? {}
      : { readinessValidUntil: publication.readinessValidUntil }),
  }
}

