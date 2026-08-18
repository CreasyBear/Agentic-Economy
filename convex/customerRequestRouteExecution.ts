import { vOnCompleteArgs } from '@convex-dev/workpool'
import { v, type Infer } from 'convex/values'

import {
  assembleCustomerEvidenceExport,
  assembleSupportProblemList,
  loadProblemBusinessReports,
} from '@/modules/customer-request/route-execution/evidence-load'
import {
  routeAttemptIntegrityValid,
} from '@/modules/customer-request/route-execution/journal'
import {
  cancelCurrent as cancelCurrentMachine,
  markDispatched as markDispatchedMachine,
  openCancellationAttempt as openCancellationAttemptMachine,
  recordNotReleased as recordNotReleasedMachine,
  reconcileRouteTransportWorkCompletion,
  recordOutcome as recordOutcomeMachine,
  recordProblemBusinessReport as recordProblemBusinessReportMachine,
  replyProblem as replyProblemMachine,
  reportProblem as reportProblemMachine,
  resolveCancellationAttempt as resolveCancellationAttemptMachine,
  startOrResume as startOrResumeMachine,
  updateProblemStatus as updateProblemStatusMachine,
} from '@/modules/customer-request/route-execution/machines'
import { canonicalClaimMaterialV2Value } from '@/modules/customer-request/runtime'
import { connectionAuthoritySnapshotValue } from '@/modules/capability-supply/convex'
import {
  x402PaymentReconciliationEvidenceValue,
  x402PaymentSettlementStatusValue,
} from '@/modules/customer-request/convex'
import {
  projectBusinessProblem,
  projectSupportProblemExport,
} from '@/modules/customer-request/route-execution/problem-support'

import type { Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server'
import { resolveAdminAuthority } from './authz'
import { evidenceLoadPorts } from './customerRequestEvidenceLoadPorts'
import {
  cancelMutationPorts,
  cancelOpenPorts,
} from './customerRequestRouteExecutionCancelPorts'
import {
  dispatchLifecycleOpenPorts,
  dispatchLifecyclePorts,
  openDispatchFromJournal,
} from './customerRequestRouteExecutionDispatchPorts'
import {
  journalMutationPorts,
  readRunProjection as readRunProjectionPorts,
} from './customerRequestRouteExecutionJournalPorts'
import {
  problemMutationPorts,
  problemSupportReadPorts,
} from './customerRequestRouteExecutionProblemPorts'

const exactAmount = v.object({ currency: v.string(), units: v.string(), exponent: v.number() })
const routeExecutionBinding = v.union(
  v.object({
    adapterId: v.string(),
    endpointUrl: v.string(),
    authority: v.object({ kind: v.literal('keyless') }),
    configJson: v.string(),
    configDigest: v.string(),
  }),
  v.object({
    adapterId: v.string(),
    endpointUrl: v.string(),
    authority: v.object({
      kind: v.literal('provider_connection'),
      connectionRef: v.string(),
      providerRef: v.string(),
    }),
    connectionAuthority: connectionAuthoritySnapshotValue,
    configJson: v.string(),
    configDigest: v.string(),
  }),
)
const startCommand = v.object({
  requestId: v.string(),
  principalId: v.string(),
  idempotencyKey: v.string(),
})

const x402PaymentPrepareArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  operationRef: v.optional(v.string()),
  inputDigest: v.optional(v.string()),
  paymentIdentifier: v.string(),
  operationKeyDigest: v.string(),
  challengeDigest: v.string(),
  challengeJson: v.string(),
  selectedRequirementJson: v.string(),
  providerEndpoint: v.string(),
  credentialRef: v.string(),
  scheme: v.string(),
  network: v.string(),
  asset: v.string(),
  payTo: v.string(),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  reservationRef: v.optional(v.string()),
}

const x402PaymentAuthorizationMaterial = v.object({
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  operationRef: v.optional(v.string()),
  inputDigest: v.optional(v.string()),
  paymentIdentifier: v.string(),
  challengeDigest: v.string(),
  challengeJson: v.string(),
  selectedRequirementJson: v.string(),
  providerEndpoint: v.string(),
  credentialRef: v.string(),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  reservationRef: v.optional(v.string()),
  paymentIdentityDigest: v.optional(v.string()),
  paymentSignatureDigest: v.optional(v.string()),
  state: v.union(
    v.literal('prepared'),
    v.literal('possibly_submitted'),
    v.literal('observed'),
    v.literal('reconciliation_required'),
  ),
  transportObservationDigest: v.optional(v.string()),
  transportRequestDigest: v.optional(v.string()),
  paymentObservationDigest: v.optional(v.string()),
  settlementStatus: v.optional(x402PaymentSettlementStatusValue),
  paymentResponseDigest: v.optional(v.string()),
  reconciliationEvidenceRef: v.optional(v.string()),
  reconciliationEvidenceDigest: v.optional(v.string()),
})

const x402PaymentAttemptReadValue = v.object({
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  operationRef: v.optional(v.string()),
  inputDigest: v.optional(v.string()),
  paymentIdentifier: v.string(),
  operationKeyDigest: v.string(),
  challengeDigest: v.string(),
  selectedRequirementJson: v.string(),
  providerEndpoint: v.string(),
  scheme: v.string(),
  network: v.string(),
  asset: v.string(),
  payTo: v.string(),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  credentialRef: v.string(),
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  reservationRef: v.optional(v.string()),
  paymentIdentityDigest: v.optional(v.string()),
  paymentSignatureDigest: v.optional(v.string()),
  state: v.union(
    v.literal('prepared'),
    v.literal('possibly_submitted'),
    v.literal('observed'),
    v.literal('reconciliation_required'),
  ),
  preparedAt: v.number(),
  submissionStartedAt: v.optional(v.number()),
  observedAt: v.optional(v.number()),
  transportObservationDigest: v.optional(v.string()),
  transportRequestDigest: v.optional(v.string()),
  paymentObservationDigest: v.optional(v.string()),
  settlementStatus: v.optional(x402PaymentSettlementStatusValue),
  paymentResponseDigest: v.optional(v.string()),
  reconciliationEvidenceRef: v.optional(v.string()),
  reconciliationEvidenceDigest: v.optional(v.string()),
})
const x402PaymentEventArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  paymentIdentifier: v.string(),
  challengeDigest: v.string(),
  scheme: v.string(),
  network: v.string(),
  asset: v.string(),
  payTo: v.string(),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  providerEndpoint: v.string(),
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  settlementStatus: v.optional(x402PaymentSettlementStatusValue),
  settlementDigest: v.optional(v.string()),
}

const x402PaymentObservationArgs = {
  ...x402PaymentEventArgs,
  state: v.union(v.literal('observed'), v.literal('reconciliation_required')),
  evidenceRefs: v.array(v.string()),
}
const x402PaymentObservationReconciliationArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  operationRef: v.string(),
  inputDigest: v.string(),
  evidenceRef: v.string(),
  evidenceDigest: v.string(),
  reservationRef: v.string(),
  paymentIdentifier: v.string(),
  challengeDigest: v.string(),
  settlementStatus: v.union(v.literal('settled'), v.literal('not_settled')),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  paymentResponseDigest: v.string(),
  transportObservationDigest: v.string(),
  transportRequestDigest: v.string(),
  paymentObservationDigest: v.string(),
  observedAt: v.number(),
}

const x402PaymentObservationReconciliationResult = v.union(
  v.object({
    kind: v.literal('settled'),
    settlementStatus: v.union(v.literal('settled'), v.literal('not_settled')),
  }),
  v.object({ kind: v.literal('reconciliation_required') }),
  v.object({ kind: v.literal('not_found') }),
)


const runProjection = v.object({
  runRef: v.string(),
  requestId: v.string(),
  requestRevision: v.number(),
  generationRef: v.string(),
  businesses: v.optional(v.array(v.object({
    businessRef: v.string(),
    name: v.string(),
  }))),
  state: v.union(
    v.literal('queued'),
    v.literal('running'),
    v.literal('outcome_unknown'),
    v.literal('completed'),
    v.literal('failed'),
    v.literal('cancelled'),
  ),
  totalSteps: v.number(),
  completedSteps: v.number(),
  currentPosition: v.number(),
  currentState: v.union(
    v.literal('queued'),
    // Leased is an active route step state while transport work is in progress.
    v.literal('leased'),
    v.literal('dispatched'),
    v.literal('accepted'),
    v.literal('succeeded'),
    v.literal('failed'),
    v.literal('outcome_unknown'),
    v.literal('cancelled'),
  ),
  resultJson: v.optional(v.string()),
  cancellationReleaseMayStartAt: v.optional(v.number()),
  cancellationUnavailableSince: v.optional(v.number()),
  cancellationRequestedAt: v.optional(v.number()),
  cancellationAttempt: v.optional(v.union(
    v.object({
      state: v.literal('pending'),
      requestedAt: v.number(),
      nextCheckAt: v.number(),
    }),
    v.object({
      state: v.literal('unknown'),
      requestedAt: v.number(),
      observedAt: v.number(),
      nextCheckAt: v.number(),
    }),
    v.object({
      state: v.literal('rejected'),
      requestedAt: v.number(),
      observedAt: v.number(),
      reason: v.string(),
    }),
  )),
  updatedAt: v.number(),
})

const startResult = v.union(
  v.object({ kind: v.literal('started'), run: runProjection }),
  v.object({ kind: v.literal('replayed'), run: runProjection }),
  v.object({ kind: v.literal('resumed'), run: runProjection }),
  v.object({ kind: v.literal('conflict'), reason: v.literal('command_changed') }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('confirmation_required'),
      v.literal('confirmation_expired'),
      v.literal('confirmation_changed'),
      v.literal('route_unavailable'),
    ),
  }),
)

async function readRunProjection(
  ctx: MutationCtx | QueryCtx,
  runRef: string,
): Promise<Infer<typeof runProjection> | null> {
  return await readRunProjectionPorts(ctx, runRef) as Infer<typeof runProjection> | null
}

export const startOrResume = internalMutation({
  args: startCommand.fields,
  returns: startResult,
  handler: async (ctx, args): Promise<Infer<typeof startResult>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await startOrResumeMachine(args, journalMutationPorts(ctx)) as Infer<typeof startResult>
  )
  },
})

const cancelCurrentResult = v.union(
  v.object({ kind: v.literal('cancelled'), run: runProjection }),
  v.object({ kind: v.literal('replayed'), run: runProjection }),
  v.object({ kind: v.literal('pending'), run: runProjection }),
  v.object({ kind: v.literal('too_late'), run: runProjection }),
  v.object({ kind: v.literal('refused'), reason: v.literal('run_not_found') }),
  v.object({ kind: v.literal('conflict'), reason: v.literal('command_changed') }),
)

export const cancelCurrent = internalMutation({
  args: {
    requestId: v.string(), principalId: v.string(), idempotencyKey: v.string(),
    mode: v.union(v.literal('current_and_downstream'), v.literal('after_current_step')),
  },
  returns: cancelCurrentResult,
  handler: async (ctx, args): Promise<Infer<typeof cancelCurrentResult>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await cancelCurrentMachine(args, cancelMutationPorts(ctx)) as Infer<typeof cancelCurrentResult>
  )
  },
})

const dispatchInvocation = v.object({
  dispatchRef: v.string(),
  attemptRef: v.string(),
  runRef: v.string(),
  requestId: v.string(),
  requestRevision: v.number(),
  principalId: v.string(),
  mandateRef: v.string(),
  grantRef: v.string(),
  authorityDigest: v.string(),
  actionId: v.string(),
  position: v.number(),
  operationKeyDigest: v.string(),
  inputJson: v.string(),
  inputDigest: v.string(),
  binding: routeExecutionBinding,
  authority: v.object({
    mandateDigest: v.string(), grantDigest: v.string(), capabilityContractDigest: v.string(),
    maximumSpend: exactAmount,
    expiresAt: v.number(),
  }),
  canonical: canonicalClaimMaterialV2Value,
})

const openDispatchResult = v.union(
  v.object({ kind: v.literal('available'), invocation: dispatchInvocation }),
  v.object({ kind: v.literal('unavailable') }),
)

export const openDispatch = internalQuery({
  args: { dispatchRef: v.string() },
  returns: openDispatchResult,
  handler: async (ctx, args): Promise<Infer<typeof openDispatchResult>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await openDispatchFromJournal(args, dispatchLifecycleOpenPorts(ctx)) as Infer<typeof openDispatchResult>
  )
  },
})

const cancellationInvocation = v.object({
  cancellationRef: v.string(),
  attemptRef: v.string(),
  requestId: v.string(),
  requestRevision: v.number(),
  principalId: v.string(),
  mandateRef: v.string(),
  grantRef: v.string(),
  authorityDigest: v.string(),
  actionId: v.string(),
  position: v.number(),
  operationKeyDigest: v.string(),
  binding: routeExecutionBinding,
  authority: v.object({
    mandateDigest: v.string(), grantDigest: v.string(), capabilityContractDigest: v.string(),
    maximumSpend: exactAmount,
    expiresAt: v.number(),
  }),
  canonical: canonicalClaimMaterialV2Value,
})

const openCancellationAttemptResult = v.union(
  v.object({ kind: v.literal('available'), invocation: cancellationInvocation }),
  v.object({ kind: v.literal('unavailable') }),
)

export const openCancellationAttempt = internalQuery({
  args: { cancellationRef: v.string() },
  returns: openCancellationAttemptResult,
  handler: async (ctx, args): Promise<Infer<typeof openCancellationAttemptResult>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await openCancellationAttemptMachine(args, cancelOpenPorts(ctx)) as Infer<
      typeof openCancellationAttemptResult
    >
  )
  },
})

const resolveCancellationAttemptResult = v.union(
  v.object({ kind: v.literal('recorded'), run: runProjection }),
  v.object({ kind: v.literal('replayed'), run: runProjection }),
  v.object({ kind: v.literal('refused') }),
)

export const resolveCancellationAttempt = internalMutation({
  args: {
    cancellationRef: v.string(),
    observation: v.object({
      disposition: v.union(
        v.literal('accepted'), v.literal('rejected'),
        v.literal('unknown'), v.literal('unsupported'),
      ),
      requestDigest: v.string(),
      responseDigest: v.optional(v.string()),
      providerReference: v.optional(v.string()),
      reason: v.optional(v.string()),
      failureCode: v.optional(v.string()),
    }),
  },
  returns: resolveCancellationAttemptResult,
  handler: async (ctx, args): Promise<Infer<typeof resolveCancellationAttemptResult>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await resolveCancellationAttemptMachine(args, cancelMutationPorts(ctx)) as Infer<
      typeof resolveCancellationAttemptResult
    >
  )
  },
})

export const completeRouteCancellationWork = internalMutation({
  args: vOnCompleteArgs(v.object({ cancellationRef: v.string() })),
  returns: v.null(),
  handler: async (ctx, { context }) => {
    throw new Error('customer_request_tables_unlisted')

    await resolveCancellationAttemptMachine({
      cancellationRef: context.cancellationRef,
      observation: {
        disposition: 'unknown',
        requestDigest: context.cancellationRef,
        failureCode: 'route_cancellation_work_incomplete',
      },
    }, cancelMutationPorts(ctx))
    return null
  },
})


const markDispatchedResult = v.union(
  v.object({ kind: v.literal('recorded') }),
  v.object({ kind: v.literal('replayed') }),
  v.object({ kind: v.literal('refused'), reason: v.literal('dispatch_not_current') }),
)

export const markDispatched = internalMutation({
  args: { dispatchRef: v.string(), attemptRef: v.string() },
  returns: markDispatchedResult,
  handler: async (ctx, args): Promise<Infer<typeof markDispatchedResult>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await markDispatchedMachine(args, dispatchLifecyclePorts(ctx)) as Infer<
      typeof markDispatchedResult
    >
  )
  },
})

const recordNotReleasedResult = v.union(
  v.object({ kind: v.literal('failed'), run: runProjection }),
  v.object({ kind: v.literal('replayed'), run: runProjection }),
  v.object({ kind: v.literal('refused'), reason: v.literal('dispatch_not_current') }),
)

export const recordNotReleased = internalMutation({
  args: {
    dispatchRef: v.string(), attemptRef: v.string(),
    observationJson: v.string(),
  },
  returns: recordNotReleasedResult,
  handler: async (ctx, args): Promise<Infer<typeof recordNotReleasedResult>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await recordNotReleasedMachine(args, dispatchLifecyclePorts(ctx)) as Infer<
      typeof recordNotReleasedResult
    >
  )
  },
})

export const completeRouteTransportWork = internalMutation({
  args: vOnCompleteArgs(v.object({ dispatchRef: v.string() })),
  returns: v.null(),
  handler: async (ctx, { context }) => {
    throw new Error('customer_request_tables_unlisted')

    const dispatchPorts = dispatchLifecyclePorts(ctx)
    const journalPorts = journalMutationPorts(ctx)
    await reconcileRouteTransportWorkCompletion(context.dispatchRef, {
      loadDispatchByRef: dispatchPorts.loadDispatchByRef,
      loadAttemptByRef: dispatchPorts.loadAttemptByRef,
      recordNotReleased: async (command) => (
        await recordNotReleasedMachine(command, dispatchPorts)
      ),
      recordOutcome: async (command) => await recordOutcomeMachine(command, journalPorts),
    })
    return null
  },
})



const outcomeResult = v.union(
  v.object({ kind: v.literal('advanced'), run: runProjection }),
  v.object({ kind: v.literal('cancelled'), run: runProjection }),
  v.object({ kind: v.literal('completed'), run: runProjection }),
  v.object({ kind: v.literal('failed'), run: runProjection }),
  v.object({ kind: v.literal('outcome_unknown'), run: runProjection }),
  v.object({ kind: v.literal('replayed'), run: runProjection }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(v.literal('attempt_not_current'), v.literal('output_invalid')),
  }),
)

export const recordOutcome = internalMutation({
  args: {
    attemptRef: v.string(),
    operationKeyDigest: v.string(),
    observationJson: v.optional(v.string()),
    outcome: v.union(
      v.object({ kind: v.literal('succeeded'), outputJson: v.string() }),
      v.object({ kind: v.literal('partial'), outputJson: v.string() }),
      v.object({ kind: v.literal('failed') }),
      v.object({ kind: v.literal('unknown') }),
    ),
  },
  returns: outcomeResult,
  handler: async (ctx, args): Promise<Infer<typeof outcomeResult>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await recordOutcomeMachine(args, journalMutationPorts(ctx)) as Infer<typeof outcomeResult>
  )
  },
})
export const prepareX402PaymentAuthorization = internalMutation({
  args: x402PaymentPrepareArgs,
  returns: v.object({
    custodyRef: v.string(),
    authorizationDigest: v.string(),
  }),
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')

    const result: { custodyRef: string; authorizationDigest: string } = await ctx.runMutation(
      internal.moneyX402PaymentAttempts.prepareX402PaymentAuthorization,
      args,
    )
    return result
  },
})

export const recordX402PaymentSignature = internalMutation({
  args: {
    custodyRef: v.string(),
    authorizationDigest: v.string(),
    paymentSignatureDigest: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')

    await ctx.runMutation(internal.moneyX402PaymentAttempts.recordX402PaymentSignature, args)
    return null
  },
})

export const readX402PaymentAuthorization = internalQuery({
  args: { custodyRef: v.string(), authorizationDigest: v.string() },
  returns: v.union(x402PaymentAuthorizationMaterial, v.null()),
  handler: async (ctx, args): Promise<Infer<typeof x402PaymentAuthorizationMaterial> | null> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await ctx.runQuery(internal.moneyX402PaymentAttempts.readX402PaymentAuthorization, args)
  )
  },
})

export const readX402PaymentAuthorizationByDigest = internalQuery({
  args: { custodyRef: v.string(), authorizationDigest: v.string() },
  returns: v.union(x402PaymentAuthorizationMaterial, v.null()),
  handler: async (ctx, args): Promise<Infer<typeof x402PaymentAuthorizationMaterial> | null> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await ctx.runQuery(internal.moneyX402PaymentAttempts.readX402PaymentAuthorizationByDigest, args)
  )
  },
})

export const markX402PaymentPossiblySubmitted = internalMutation({
  args: x402PaymentEventArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')

    await ctx.runMutation(internal.moneyX402PaymentAttempts.markX402PaymentPossiblySubmitted, args)
    return null
  },
})

export const observeX402PaymentAttempt = internalMutation({
  args: x402PaymentObservationArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')

    await ctx.runMutation(internal.moneyX402PaymentAttempts.observeX402PaymentAttempt, args)
    return null
  },
})
export const readX402PaymentAttempt = internalQuery({
  args: {
    dispatchRef: v.string(),
    attemptRef: v.string(),
    effectGeneration: v.number(),
  },
  returns: v.union(x402PaymentAttemptReadValue, v.null()),
  handler: async (ctx, args): Promise<Infer<typeof x402PaymentAttemptReadValue> | null> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await ctx.runQuery(internal.moneyX402PaymentAttempts.readX402PaymentAttempt, args)
  )
  },
})
export const recordX402PaymentObservation = internalMutation({
  args: {
    dispatchRef: v.string(),
    attemptRef: v.string(),
    effectGeneration: v.number(),
    paymentIdentifier: v.string(),
    operationRef: v.string(),
    inputDigest: v.string(),
    transportObservationDigest: v.string(),
    transportRequestDigest: v.string(),
    paymentObservationDigest: v.string(),
    settlementStatus: x402PaymentSettlementStatusValue,
    paymentResponseDigest: v.optional(v.string()),
    observedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')

    await ctx.runMutation(internal.moneyX402PaymentAttempts.recordX402PaymentObservation, args)
    return null
  },
})
export const reconcileX402PaymentAttempt = internalMutation({
  args: x402PaymentObservationReconciliationArgs,
  returns: x402PaymentObservationReconciliationResult,
  handler: async (ctx, args): Promise<Infer<typeof x402PaymentObservationReconciliationResult>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await ctx.runMutation(internal.moneyX402PaymentAttempts.reconcileX402PaymentAttempt, args)
  )
  },
})

export const getCurrent = internalQuery({
  args: { requestId: v.string() },
  returns: v.union(v.object({ kind: v.literal('found'), run: runProjection }), v.object({ kind: v.literal('none') })),
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')

    const head = await ctx.db.query('customerRequestRouteRunHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (head === null) return { kind: 'none' as const }
    const storedRun = await ctx.db.query('customerRequestRouteRuns')
      .withIndex('by_runRef', (query) => query.eq('runRef', head.currentRunRef)).unique()
    if (storedRun === null || storedRun.mandateRef !== head.currentMandateRef
      || storedRun.principalId !== head.principalId) {
      throw new Error('customer_request_route_run_head_integrity_failure')
    }
    const run = await readRunProjection(ctx, head.currentRunRef)
    if (run === null) throw new Error('customer_request_route_run_integrity_failure')
    return { kind: 'found' as const, run }
  },
})

const problemCategory = v.union(
  v.literal('incorrect_result'), v.literal('unexpected_cost'), v.literal('privacy_concern'),
  v.literal('duplicate_charge_or_effect'), v.literal('could_not_stop'), v.literal('other'),
)

export const reportProblem = internalMutation({
  args: {
    requestId: v.string(), principalId: v.string(), idempotencyKey: v.string(),
    category: problemCategory, summary: v.string(),
    affectedStep: v.optional(v.number()),
    evidenceReceiptRefs: v.array(v.string()),
    visibility: v.union(
      v.literal('customer_and_ae_only'), v.literal('share_with_affected_business'),
    ),
  },
  returns: v.union(
    v.object({
      kind: v.union(v.literal('reported'), v.literal('replayed')),
      reportRef: v.string(), reportedAt: v.number(),
      affected: v.object({
        step: v.number(), attemptRef: v.optional(v.string()), business: v.optional(v.string()),
      }),
      visibility: v.union(
        v.literal('customer_and_ae_only'), v.literal('share_with_affected_business'),
      ),
      evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    }),
    v.object({ kind: v.literal('conflict') }),
    v.object({
      kind: v.literal('refused'),
      reason: v.union(v.literal('request_not_found'), v.literal('evidence_not_found')),
    }),
  ),
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')

    const result = await reportProblemMachine(args, problemMutationPorts(ctx))
    // The machine returns a readonly evidence list; the return validator declares a mutable array.
    return 'evidence' in result
      ? { ...result, evidence: result.evidence.map((item) => ({ receiptRef: item.receiptRef, label: item.label })) }
      : result
  },
})

const businessCausalityPosition = v.union(
  v.literal('supports'),
  v.literal('disputes'),
  v.literal('uncertain'),
)

const businessProblemReportResult = v.union(
  v.object({
    kind: v.union(v.literal('recorded'), v.literal('replayed')),
    statementRef: v.string(),
    reportRef: v.string(),
    business: v.string(),
    causalityPosition: businessCausalityPosition,
    statement: v.string(),
    evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    recordedAt: v.number(),
  }),
  v.object({ kind: v.literal('conflict') }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authentication_required'),
      v.literal('authority_denied'),
      v.literal('report_not_found'),
      v.literal('sharing_not_authorized'),
      v.literal('evidence_not_found'),
      v.literal('invalid_report'),
    ),
  }),
)

const businessProblemViewResult = v.union(
  v.object({
    kind: v.literal('business_problem'),
    reportRef: v.string(),
    business: v.string(),
    category: v.union(
      v.literal('incorrect_result'),
      v.literal('unexpected_cost'),
      v.literal('duplicate_charge_or_effect'),
      v.literal('privacy_concern'),
      v.literal('could_not_stop'),
      v.literal('other'),
    ),
    customerStatement: v.string(),
    causality: v.literal('unknown'),
    resolution: v.literal('not_adjudicated'),
    decisionAuthority: v.literal('not_assigned'),
    evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    availableEvidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    businessClaims: v.array(v.object({
      statementRef: v.string(),
      causalityPosition: businessCausalityPosition,
      statement: v.string(),
      evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
      recordedAt: v.number(),
    })),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authentication_required'),
      v.literal('authority_denied'),
      v.literal('report_not_found'),
      v.literal('sharing_not_authorized'),
    ),
  }),
)

export const readProblemForBusiness = internalQuery({
  args: { reportRef: v.string() },
  returns: businessProblemViewResult,
  handler: async (ctx, args): Promise<Infer<typeof businessProblemViewResult>> => {
    throw new Error('customer_request_tables_unlisted')

    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { kind: 'refused', reason: 'authentication_required' }
    if (args.reportRef.trim().length === 0 || args.reportRef.length > 300) {
      return { kind: 'refused', reason: 'report_not_found' }
    }
    const report = await ctx.db.query('customerRequestRouteProblemReports')
      .withIndex('by_reportRef', (query) => query.eq('reportRef', args.reportRef)).unique()
    if (report === null || report.attemptRef === undefined) {
      return { kind: 'refused', reason: 'report_not_found' }
    }
    const attemptRef = report.attemptRef
    if ((report.visibility ?? 'customer_and_ae_only') !== 'share_with_affected_business') {
      return { kind: 'refused', reason: 'sharing_not_authorized' }
    }
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attemptRef)).unique()
    if (attempt === null || attempt.requestId !== report.requestId || attempt.position !== report.step
      || !routeAttemptIntegrityValid(attempt)) {
      throw new Error('customer_request_route_problem_attempt_integrity_failure')
    }
    const business = await ctx.db.get(attempt.grant.step.businessId as Id<'businesses'>)
    const owner = business === null ? null : await ctx.db.get(business.ownerId)
    if (business === null || owner === null || owner.clerkUserId !== identity.subject) {
      return { kind: 'refused', reason: 'authority_denied' }
    }
    const businessReports = await loadProblemBusinessReports(evidenceLoadPorts(ctx), report.reportRef)
    const projected = projectBusinessProblem({
      report,
      attempt,
      businessName: business.name,
      businessId: String(business._id),
      businessReports,
    })
    return {
      ...projected,
      evidence: projected.evidence.map((item) => ({
        receiptRef: item.receiptRef,
        label: item.label,
      })),
      availableEvidence: projected.availableEvidence.map((item) => ({
        receiptRef: item.receiptRef,
        label: item.label,
      })),
      businessClaims: projected.businessClaims.map((claim) => ({
        ...claim,
        evidence: claim.evidence.map((item) => ({
          receiptRef: item.receiptRef,
          label: item.label,
        })),
      })),
    }
  },
})

export const recordProblemBusinessReport = internalMutation({
  args: {
    reportRef: v.string(),
    idempotencyKey: v.string(),
    causalityPosition: businessCausalityPosition,
    statement: v.string(),
    evidenceReceiptRefs: v.array(v.string()),
  },
  returns: businessProblemReportResult,
  handler: async (ctx, args): Promise<Infer<typeof businessProblemReportResult>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await recordProblemBusinessReportMachine(args, problemMutationPorts(ctx)) as Infer<
      typeof businessProblemReportResult
    >
  )
  },
})

const problemUpdateState = v.union(
  v.literal('investigating'),
  v.literal('waiting_for_customer'),
  v.literal('closed'),
)

const problemUpdateResult = v.union(
  v.object({
    kind: v.literal('updated'),
    reportRef: v.string(),
    version: v.number(),
    state: problemUpdateState,
    recordedAt: v.number(),
  }),
  v.object({ kind: v.literal('conflict'), reason: v.union(
    v.literal('idempotency_key_reused'),
    v.literal('stale_version'),
  ) }),
  v.object({ kind: v.literal('refused'), reason: v.union(
    v.literal('authentication_required'),
    v.literal('authority_denied'),
    v.literal('report_not_found'),
    v.literal('invalid_update'),
  ) }),
)

export const updateProblemStatus = internalMutation({
  args: {
    reportRef: v.string(),
    expectedVersion: v.number(),
    idempotencyKey: v.string(),
    state: problemUpdateState,
    publicMessage: v.string(),
  },
  returns: problemUpdateResult,
  handler: async (ctx, args): Promise<Infer<typeof problemUpdateResult>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await updateProblemStatusMachine(args, problemMutationPorts(ctx)) as Infer<
      typeof problemUpdateResult
    >
  )
  },
})

export const replyProblem = internalMutation({
  args: {
    requestId: v.string(),
    reportRef: v.string(),
    principalId: v.string(),
    expectedVersion: v.number(),
    idempotencyKey: v.string(),
    message: v.string(),
  },
  returns: problemUpdateResult,
  handler: async (ctx, args): Promise<Infer<typeof problemUpdateResult>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await replyProblemMachine(args, problemMutationPorts(ctx)) as Infer<typeof problemUpdateResult>
  )
  },
})

export const listProblemsForSupport = internalQuery({
  args: { limit: v.number() },
  returns: v.union(
    v.object({
      kind: v.literal('allowed'),
      rows: v.array(v.object({
        reportRef: v.string(),
        requestRef: v.string(),
        version: v.number(),
        state: v.union(
          v.literal('received'),
          v.literal('update_due'),
          v.literal('investigating'),
          v.literal('waiting_for_customer'),
          v.literal('closed'),
        ),
        nextActor: v.union(v.literal('ae'), v.literal('customer'), v.literal('none')),
        category: problemCategory,
        summary: v.string(),
        business: v.optional(v.string()),
        reportedAt: v.number(),
        lastUpdatedAt: v.number(),
      })),
    }),
    v.object({
      kind: v.literal('denied'),
      reason: v.union(
        v.literal('missing_membership'),
        v.literal('inactive_membership'),
        v.literal('action_not_allowed'),
      ),
      rows: v.array(v.object({
        reportRef: v.string(),
        requestRef: v.string(),
        version: v.number(),
        state: v.union(
          v.literal('received'),
          v.literal('update_due'),
          v.literal('investigating'),
          v.literal('waiting_for_customer'),
          v.literal('closed'),
        ),
        nextActor: v.union(v.literal('ae'), v.literal('customer'), v.literal('none')),
        category: problemCategory,
        summary: v.string(),
        business: v.optional(v.string()),
        reportedAt: v.number(),
        lastUpdatedAt: v.number(),
      })),
    }),
  ),
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')

    const authority = await resolveAdminAuthority(
      { db: ctx.db, auth: ctx.auth },
      'read_admin_readbacks',
    )
    if (authority.kind === 'denied') {
      return { kind: 'denied' as const, reason: authority.reason, rows: [] }
    }
    const limit = Number.isSafeInteger(args.limit) ? Math.min(Math.max(args.limit, 1), 100) : 50
    return {
      kind: 'allowed' as const,
      rows: await assembleSupportProblemList({ limit }, evidenceLoadPorts(ctx)),
    }
  },
})

const supportProblemExport = v.object({
  kind: v.literal('problem_export'),
  reportRef: v.string(),
  requestRef: v.string(),
  version: v.number(),
  state: v.union(
    v.literal('received'),
    v.literal('update_due'),
    v.literal('investigating'),
    v.literal('waiting_for_customer'),
    v.literal('closed'),
  ),
  category: problemCategory,
  summary: v.string(),
  claimSource: v.literal('customer'),
  causality: v.literal('unknown'),
  resolution: v.literal('not_adjudicated'),
  nextAction: v.union(
    v.literal('await_status_update'),
    v.literal('check_status'),
    v.literal('provide_information'),
    v.literal('none'),
  ),
  nextActor: v.union(v.literal('ae'), v.literal('customer'), v.literal('none')),
  nextUpdateDueAt: v.optional(v.number()),
  decisionAuthority: v.literal('not_assigned'),
  visibility: v.union(
    v.literal('customer_and_ae_only'),
    v.literal('share_with_affected_business'),
  ),
  evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
  reportedAt: v.number(),
  affected: v.object({ step: v.number(), business: v.optional(v.string()) }),
  claims: v.array(v.object({
    claimSource: v.union(v.literal('customer'), v.literal('business')),
    causalityPosition: v.union(
      v.literal('reported_problem'),
      v.literal('supports'),
      v.literal('disputes'),
      v.literal('uncertain'),
    ),
    statement: v.string(),
    business: v.optional(v.string()),
    evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    recordedAt: v.number(),
  })),
  history: v.array(v.object({
    version: v.number(),
    state: v.union(
      v.literal('received'),
      v.literal('investigating'),
      v.literal('waiting_for_customer'),
      v.literal('closed'),
    ),
    source: v.union(v.literal('customer'), v.literal('ae_support')),
    message: v.string(),
    recordedAt: v.number(),
  })),
  reconstruction: v.optional(v.object({
    request: v.object({ revision: v.number(), ordinaryRequest: v.string() }),
    choice: v.object({
      businesses: v.array(v.string()), selectedBecause: v.array(v.string()),
      confirmedAt: v.number(), validUntil: v.number(),
    }),
    authority: v.object({
      state: v.union(v.literal('current'), v.literal('expired'), v.literal('revoked')),
      source: v.literal('customer_confirmation'),
      spend: v.object({
        limit: exactAmount,
        admitted: exactAmount,
      }),
      dataSharing: v.array(v.object({
        classification: v.union(
          v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential'),
        ),
        recipient: v.string(), purposes: v.array(v.string()),
        releaseState: v.union(v.literal('authorized'), v.literal('business_step_released')),
      })),
      effects: v.array(v.object({
        class: v.union(
          v.literal('data_release'), v.literal('financial_exposure'), v.literal('external_state_change'),
        ),
        reversibility: v.union(
          v.literal('not_applicable'), v.literal('reversible'),
          v.literal('conditional'), v.literal('irreversible'),
        ),
        releaseState: v.union(v.literal('authorized'), v.literal('business_step_released')),
      })),
    }),
    execution: v.object({
      state: v.union(
        v.literal('queued'), v.literal('running'), v.literal('outcome_unknown'),
        v.literal('completed'), v.literal('failed'), v.literal('cancelled'),
      ),
      completedSteps: v.number(), totalSteps: v.number(),
      duplicateRisk: v.union(
        v.literal('protected_by_required_idempotency'), v.literal('mixed_or_not_applicable'),
      ),
      steps: v.array(v.object({
        step: v.number(), business: v.string(),
        state: v.union(
          v.literal('blocked'), v.literal('queued'), v.literal('leased'),
          v.literal('ready_to_contact'), v.literal('contacting'),
          v.literal('awaiting_result'), v.literal('completed'), v.literal('failed'),
          v.literal('outcome_unknown'), v.literal('cancelled'),
        ),
        evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
      })),
    }),
    recovery: v.object({
      nextActor: v.union(v.literal('ae'), v.literal('customer'), v.literal('none')),
      nextAction: v.union(
        v.literal('await_status_update'), v.literal('check_status'),
        v.literal('provide_information'), v.literal('none'),
      ),
      retry: v.union(
        v.literal('not_needed'), v.literal('safe'), v.literal('blocked_until_reconciled'),
      ),
    }),
  })),
})

export const exportProblemForSupport = internalQuery({
  args: { reportRef: v.string() },
  returns: v.union(
    supportProblemExport,
    v.object({ kind: v.literal('not_found') }),
    v.object({
      kind: v.literal('denied'),
      reason: v.union(
        v.literal('missing_membership'),
        v.literal('inactive_membership'),
        v.literal('action_not_allowed'),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')

    const authority = await resolveAdminAuthority(
      { db: ctx.db, auth: ctx.auth },
      'read_admin_readbacks',
    )
    if (authority.kind === 'denied') {
      return { kind: 'denied' as const, reason: authority.reason }
    }
    const ports = problemSupportReadPorts(ctx)
    const material = await ports.loadSupportExportMaterial(args.reportRef)
    if (material === null) return { kind: 'not_found' as const }
    return projectSupportProblemExport({
      ...material,
      observedAt: ports.now(),
    })
  },
})

const exportedStepState = v.union(
  v.literal('queued'), v.literal('leased'), v.literal('ready_to_contact'), v.literal('contacting'), v.literal('awaiting_result'), v.literal('completed'),
  v.literal('failed'), v.literal('outcome_unknown'), v.literal('cancelled'),
)

export const exportCustomerEvidence = internalQuery({
  args: { requestId: v.string(), principalId: v.string() },
  returns: v.union(
    v.object({ kind: v.literal('none') }),
    v.object({
      kind: v.literal('found'),
      state: v.union(
        v.literal('queued'), v.literal('running'), v.literal('outcome_unknown'),
        v.literal('completed'), v.literal('failed'), v.literal('cancelled'),
      ),
      generatedAt: v.number(), resultJson: v.optional(v.string()),
      steps: v.array(v.object({
        step: v.number(), state: exportedStepState, observedAt: v.number(),
        business: v.string(), providerOrigin: v.string(), outputDigest: v.optional(v.string()),
        evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
      })),
      problems: v.array(v.object({
        reportRef: v.string(),
        version: v.number(),
        state: v.union(
          v.literal('received'),
          v.literal('update_due'),
          v.literal('investigating'),
          v.literal('waiting_for_customer'),
          v.literal('closed'),
        ),
        category: problemCategory, summary: v.string(), claimSource: v.literal('customer'),
        causality: v.literal('unknown'), resolution: v.literal('not_adjudicated'),
        nextAction: v.union(
          v.literal('await_status_update'),
          v.literal('check_status'),
          v.literal('provide_information'),
          v.literal('none'),
        ),
        nextActor: v.union(v.literal('ae'), v.literal('customer'), v.literal('none')),
        nextUpdateDueAt: v.optional(v.number()),
        decisionAuthority: v.literal('not_assigned'), reportedAt: v.number(),
        visibility: v.union(
          v.literal('customer_and_ae_only'), v.literal('share_with_affected_business'),
        ),
        evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
        affected: v.object({
          step: v.number(), attemptRef: v.optional(v.string()), business: v.optional(v.string()),
        }),
        claims: v.array(v.object({
          claimSource: v.union(v.literal('customer'), v.literal('business')),
          causalityPosition: v.union(
            v.literal('reported_problem'),
            v.literal('supports'),
            v.literal('disputes'),
            v.literal('uncertain'),
          ),
          statement: v.string(),
          business: v.optional(v.string()),
          evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
          recordedAt: v.number(),
        })),
        history: v.array(v.object({
          version: v.number(),
          state: v.union(
            v.literal('received'),
            v.literal('investigating'),
            v.literal('waiting_for_customer'),
            v.literal('closed'),
          ),
          source: v.union(v.literal('customer'), v.literal('ae_support')),
          message: v.string(),
          recordedAt: v.number(),
        })),
      })),
    }),
  ),
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')
    return await assembleCustomerEvidenceExport(args, evidenceLoadPorts(ctx))
  },
})


