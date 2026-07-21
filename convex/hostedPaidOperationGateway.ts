import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { z } from 'zod'

import { createDevelopmentReleaseSignal, replaceAttempt } from '../src/modules/action-invocation/attempts'
import type {
  ActionInvocationView,
  AuthorityBindingSnapshot,
  InvocationActor,
} from '../src/modules/action-invocation/contracts'
import {
  beginAcquiredRelease,
  executeReleasedAttempt,
} from '../src/modules/action-invocation/fenced-execution'
import {
  createHostedPaidOperation,
  type HostedSandboxProvider,
} from '../src/modules/action-invocation/hosted-paid-operation-creation'
import {
  HOSTED_PAID_OPERATION_HISTORY_PAGE_SIZE,
  type HostedPaidOperationAggregate,
  type HostedPaidOperationLoadResult,
  type HostedPaidOperationTransactionResult,
  type HostedPaidOperationTrustedObservationGuard,
} from '../src/modules/action-invocation/hosted-paid-operation-port'
import {
  hostedPaidOperationAmountFromMinorUnits,
  hostedPaidOperationPaymentProposalMatches,
  hostedPaidOperationPaymentProposalValid,
} from '../src/modules/action-invocation/hosted-paid-operation-payment-proposal'
import {
  type HostedPaidOperationServiceIntent,
  verifyHostedPaidOperationServiceToken,
} from '../src/modules/action-invocation/hosted-paid-operation-service-auth'
import { createHostedSandboxReconciliation } from '../src/modules/action-invocation/hosted-sandbox-reconciliation'
import { createInMemoryActionInvocationTracer } from '../src/modules/action-invocation/in-memory'
import {
  createPaidOperationApplicationService,
} from '../src/modules/action-invocation/paid-operation-application-service'
import type { ReconciliationEvidenceMaterial } from '../src/modules/action-invocation/reconciliation-evidence'
import type { X402PaymentAttempt } from '../src/modules/action-invocation/x402-payment-attempt'
import type {
  X402PaymentReconciliationEvidenceMaterial,
} from '../src/modules/action-invocation/x402-payment-reconciliation-evidence'
import type { ActionResult } from '../src/modules/common/action'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  action,
  env,
  internalMutation,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'

const internalLoadComplete = makeFunctionReference<'query'>('hostedPaidOperation:loadComplete')
const internalCreateInitial = makeFunctionReference<'mutation'>('hostedPaidOperation:createInitial')
const internalTransact = makeFunctionReference<'mutation'>('hostedPaidOperation:transact')
const internalReserveAdmission = makeFunctionReference<'mutation'>('hostedPaidOperation:reserveAdmission')
const internalReleaseAdmission = makeFunctionReference<'mutation'>('hostedPaidOperation:releaseAdmission')
const internalCheckAdmission = makeFunctionReference<'query'>(
  'hostedPaidOperation:checkAdmissionForInvocation',
)
const internalRecordMockEffect = makeFunctionReference<'mutation'>(
  'hostedPaidOperation:recordMockEffect',
)
const internalReadMockEffect = makeFunctionReference<'query'>(
  'hostedPaidOperation:readMockEffectObservation',
)
const internalApplyAuthorization = makeFunctionReference<'mutation'>(
  'hostedPaidOperationGateway:applyAuthenticatedAuthorization',
)
const internalBeginExecute = makeFunctionReference<'mutation'>(
  'hostedPaidOperationGateway:beginAuthenticatedExecute',
)
const internalBeginReconcile = makeFunctionReference<'mutation'>(
  'hostedPaidOperationGateway:beginAuthenticatedReconcile',
)

type HostedAggregate = HostedPaidOperationAggregate<ActionResult>
type HostedLoad = HostedPaidOperationLoadResult<ActionResult>
type ConvexIdentityContext = Readonly<{
  auth: {
    getUserIdentity(): Promise<Readonly<{
      subject: string
      tokenIdentifier: string
    }> | null>
  }
}>

type ResolvedCaller = Readonly<{
  actor: InvocationActor
  requestIdentity?: string
}>

type AuthenticatedIntent = Readonly<{
  principalRef: string
  callerRef: string
  invocationRef: string
  commandId: string
  expectedInvocationVersion: number
}>

type InternalRefusal = Readonly<{ kind: 'refused'; code: string }>
type InternalDuplicate = Readonly<{
  kind: 'duplicate'
  invocationVersion: number
  effectGeneration?: number
}>
type Applied = Readonly<{
  kind: 'applied'
  invocationVersion: number
  effectGeneration?: number
}>
type ExecuteReady = Readonly<{
  kind: 'ready'
  aggregate: HostedAggregate
  releaseStartView: ActionInvocationView<ActionResult>
  commandDigest: string
  attemptRef: string
  leaseOwner: string
  effectGeneration: number
}>
type ReconcileReady = Readonly<{
  kind: 'ready'
  aggregate: HostedAggregate
  commandDigest: string
}>
type MockObservation =
  | Readonly<{
      effect: 'not_released'
      payment: 'not_submitted'
      recordedAt: string
    }>
  | Readonly<{
      providerId: string
      operationKey: string
      operationRevision: string
      paymentIdentifier: string
      proposalDigest?: string
      effect: 'released'
      payment: 'settled'
      delivery: 'returned' | 'response_lost'
      resultKind: string
      recordedAt: string
    }>

const PAID_OPERATION_POLICY_REF = 'phase-3c-hosted-paid-operation-trial:g6'
const TRUSTED_OBSERVER_SOURCE = 'hosted-paid-operation:mock-effect-ledger'
const commandKind = v.union(
  v.literal('authorize'),
  v.literal('execute'),
  v.literal('reconcile'),
)

export const authenticatedCreate = mutation({
  args: {
    providerKey: v.union(v.literal('A'), v.literal('B')),
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const publicIntent = { kind: 'create' as const, providerKey: args.providerKey }
    const caller = await resolveCaller(ctx, args.serviceToken, publicIntent)
    if (caller === undefined) {
      return { kind: 'refused' as const, code: 'authentication_required' as const }
    }
    const recordedAt = new Date(Date.now()).toISOString()
    const requestIdentity = caller.requestIdentity ?? canonicalDigest({
      kind: 'hosted-paid-operation-create',
      principalRef: caller.actor.principalRef,
      callerRef: caller.actor.callerRef,
      at: recordedAt,
      nonce: Math.random(),
      providerKey: args.providerKey,
    })
    let heldReservationRef: string | undefined
    const creation = createHostedPaidOperation<ActionResult>({
      reserveAdmission: async ({ windowKey }) => {
        const admission = await ctx.runMutation(internalReserveAdmission, {
          policyRef: PAID_OPERATION_POLICY_REF,
          principalRef: caller.actor.principalRef,
          windowKey,
          commandId: `admission:${requestIdentity}`,
          recordedAt,
        }) as
          | Readonly<{
              kind: 'admitted'
              reservationRef: string
              environment: Readonly<{ name: string; evidenceClass: string; claimCeiling: string }>
            }>
          | Readonly<{ kind: 'refused'; code: string }>
        if (admission.kind === 'admitted') {
          heldReservationRef = admission.reservationRef
          return admission
        }
        return {
          kind: 'refused' as const,
          code: admission.code === 'total_exhausted'
            || admission.code === 'concurrency_exhausted'
            || admission.code === 'rate_exhausted'
            ? admission.code
            : 'trial_disabled' as const,
        }
      },
      resolveProvider: (providerKey) => HOSTED_SANDBOX_PROVIDERS[providerKey],
      nextIdentity: (kind) => `${kind}:${canonicalDigest({ requestIdentity, kind })}`,
      windowKey: () => recordedAt.slice(0, 13),
      now: () => recordedAt,
      createInitial: async ({ record, reservationRef, aggregate }) => {
        const result = await ctx.runMutation(
          internalCreateInitial,
          serializeInitialCreation({
            creationCommandId: `create:${requestIdentity}`,
            creationCommandDigest: canonicalDigest({
              requestIdentity,
              providerKey: record.providerKey,
              reservationRef,
            }),
            reservationRef,
            aggregate,
          }, recordedAt),
        ) as
          | Readonly<{ kind: 'created' | 'duplicate' }>
          | Readonly<{ kind: 'refused'; code: string }>
        if (result.kind !== 'refused') return result
        return {
          kind: 'refused' as const,
          code: result.code === 'aggregate_incomplete'
            ? 'aggregate_incomplete' as const
            : result.code === 'creation_command_conflict'
              ? 'creation_command_conflict' as const
              : 'invocation_already_exists' as const,
        }
      },
    })
    const created = await creation.create({
      actor: caller.actor,
      setup: { providerKey: args.providerKey },
    })
    if (created.kind === 'refused') {
      if (heldReservationRef !== undefined) {
        await ctx.runMutation(internalReleaseAdmission, {
          reservationRef: heldReservationRef,
          recordedAt,
        })
      }
      return created
    }
    const loaded = await loadOwned(ctx, caller.actor, created.record.invocationRef)
    if (loaded.kind !== 'loaded'
      || loaded.aggregate.invocation.invocationVersion !== 1) {
      return { kind: 'refused' as const, code: 'aggregate_incomplete' as const }
    }
    return {
      kind: 'created' as const,
      invocationRef: created.record.invocationRef,
      expectedInvocationVersion: 1,
    }
  },
})

export const authenticatedInspect = query({
  args: {
    invocationRef: v.string(),
    expectedInvocationVersion: v.number(),
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const publicIntent = {
      kind: 'inspect' as const,
      invocationRef: args.invocationRef,
      expectedInvocationVersion: args.expectedInvocationVersion,
    }
    const caller = await resolveCaller(ctx, args.serviceToken, publicIntent)
    if (caller === undefined) {
      return { kind: 'refused' as const, code: 'authentication_required' as const }
    }
    const loaded = await loadOwned(ctx, caller.actor, args.invocationRef)
    return projectLoaded(loaded, args.expectedInvocationVersion)
  },
})

export const authenticatedCurrentVersion = query({
  args: {
    invocationRef: v.string(),
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await resolveCaller(ctx, args.serviceToken, {
      kind: 'current_version',
      invocationRef: args.invocationRef,
    })
    if (caller === undefined) return null
    const loaded = await loadOwned(ctx, caller.actor, args.invocationRef)
    return loaded.kind === 'loaded' ? loaded.aggregate.invocation.invocationVersion : null
  },
})

export const applyAuthenticatedAuthorization = internalMutation({
  args: {
    principalRef: v.string(),
    callerRef: v.string(),
    invocationRef: v.string(),
    commandId: v.string(),
    expectedInvocationVersion: v.number(),
    accept: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = actorFromInternal(args)
    const commandDigest = publicCommandDigest(args, 'authorize', args.accept)
    const loaded = await loadOwned(ctx, actor, args.invocationRef)
    const preflight = await commandPreflight(ctx, loaded, args.commandId, commandDigest)
    if (preflight !== undefined) return preflight
    if (loaded.kind !== 'loaded') return loadRefusal(loaded)
    const projected = projectAggregate(loaded.aggregate, args.expectedInvocationVersion)
    if (projected.kind === 'refused') return projected
    if (!projected.value.semantics.continuations.some(({ kind }) => kind === 'authorize')) {
      return { kind: 'refused' as const, code: 'continuation_not_allowed' as const }
    }
    const now = new Date(Date.now()).toISOString()
    const authority = loaded.aggregate.invocation.authority
    if (authority === undefined) {
      return { kind: 'refused' as const, code: 'aggregate_incomplete' as const }
    }
    const decision = lifecycleTracer(loaded.aggregate, now, args.commandId).decide({
      invocationRef: args.invocationRef,
      expectedInvocationVersion: args.expectedInvocationVersion,
      authorityRef: authority.reference,
      actor: loaded.aggregate.invocation.owner,
      origin: loaded.aggregate.invocation.origin,
      accept: args.accept,
    })
    if (decision.view === undefined
      || decision.view.invocationVersion <= loaded.aggregate.invocation.invocationVersion) {
      return {
        kind: 'refused' as const,
        code: decision.kind === 'refused' && decision.code === 'stale_invocation_version'
          ? 'stale_invocation_version' as const
          : 'continuation_not_allowed' as const,
      }
    }
    return await ctx.runMutation(
      internalTransact,
      serializeTransaction({
        owner: actor,
        invocationRef: args.invocationRef,
        commandId: args.commandId,
        commandDigest,
        expectedInvocationVersion: args.expectedInvocationVersion,
        next: aggregateWithView(loaded.aggregate, decision.view),
      }, now),
    )
  },
})

export const beginAuthenticatedExecute = internalMutation({
  args: {
    principalRef: v.string(),
    callerRef: v.string(),
    invocationRef: v.string(),
    commandId: v.string(),
    expectedInvocationVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = actorFromInternal(args)
    const commandDigest = publicCommandDigest(args, 'execute')
    const loaded = await loadOwned(ctx, actor, args.invocationRef)
    const preflight = await commandPreflight(ctx, loaded, args.commandId, commandDigest)
    if (preflight !== undefined) return preflight
    if (loaded.kind !== 'loaded') return loadRefusal(loaded)
    const projected = projectAggregate(loaded.aggregate, args.expectedInvocationVersion)
    if (projected.kind === 'refused') return projected
    if (!projected.value.semantics.continuations.some(({ kind }) => kind === 'execute')) {
      return { kind: 'refused' as const, code: 'continuation_not_allowed' as const }
    }
    const admission = await ctx.runQuery(internalCheckAdmission, {
      principalRef: actor.principalRef,
      callerRef: actor.callerRef,
      invocationRef: args.invocationRef,
    }) as Readonly<{ kind: 'active' }> | InternalRefusal
    if (admission.kind !== 'active') {
      return {
        kind: 'refused' as const,
        code: admission.code === 'invocation_not_found'
          ? 'invocation_not_found' as const
          : 'trial_disabled' as const,
      }
    }
    const authority = loaded.aggregate.invocation.authority
    const accepted = loaded.aggregate.invocation.acceptedAuthority
    if (authority === undefined || accepted === undefined) {
      return { kind: 'refused' as const, code: 'continuation_not_allowed' as const }
    }
    const now = new Date(Date.now()).toISOString()
    const tracer = lifecycleTracer(loaded.aggregate, now, args.commandId)
    const acquired = tracer.acquire({
      invocationRef: args.invocationRef,
      expectedInvocationVersion: args.expectedInvocationVersion,
      authorityRef: authority.reference,
      actor: loaded.aggregate.invocation.owner,
      origin: loaded.aggregate.invocation.origin,
      materialInput: hostedMaterialInput(loaded.aggregate),
      leaseOwner: `hosted:${args.commandId}`,
      leaseMs: 30_000,
      ...(accepted.kind === 'standing_mandate_use'
        ? { acceptedAuthorityBasis: accepted }
        : {}),
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
      return {
        kind: 'refused' as const,
        code: acquired.kind === 'refused' && acquired.code === 'stale_invocation_version'
          ? 'stale_invocation_version' as const
          : 'continuation_not_allowed' as const,
      }
    }
    const attemptRef = acquired.view.control.attemptRef
    const leaseOwner = acquired.view.control.leaseOwner
    const effectGeneration = acquired.view.control.effectGeneration
    const attributedAcquired = attributeCurrentAttempt(acquired.view, actor)
    const releaseStart = beginAcquiredRelease({
      view: attributedAcquired,
      expectedInvocationVersion: attributedAcquired.invocationVersion,
      attemptRef,
      leaseOwner,
      effectGeneration,
      now: () => now,
    })
    if (releaseStart.kind !== 'accepted') {
      return { kind: 'refused' as const, code: 'continuation_not_allowed' as const }
    }
    const durableUncertainty = preReleaseUncertainty(releaseStart.view, now)
    const persisted = await ctx.runMutation(
      internalTransact,
      serializeTransaction({
        owner: actor,
        invocationRef: args.invocationRef,
        commandId: args.commandId,
        commandDigest,
        expectedInvocationVersion: args.expectedInvocationVersion,
        next: aggregateWithView(loaded.aggregate, durableUncertainty, {
          paymentState: 'possibly_submitted',
        }),
      }, now, true),
    ) as HostedPaidOperationTransactionResult
    if (persisted.kind === 'refused' || persisted.kind === 'duplicate') return persisted
    return {
      kind: 'ready' as const,
      aggregate: loaded.aggregate,
      releaseStartView: releaseStart.view,
      commandDigest,
      attemptRef,
      leaseOwner,
      effectGeneration,
    }
  },
})

export const beginAuthenticatedReconcile = internalMutation({
  args: {
    principalRef: v.string(),
    callerRef: v.string(),
    invocationRef: v.string(),
    commandId: v.string(),
    expectedInvocationVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = actorFromInternal(args)
    const commandDigest = publicCommandDigest(args, 'reconcile')
    const loaded = await loadOwned(ctx, actor, args.invocationRef)
    const preflight = await commandPreflight(ctx, loaded, args.commandId, commandDigest)
    if (preflight !== undefined) return preflight
    if (loaded.kind !== 'loaded') return loadRefusal(loaded)
    const projected = projectAggregate(loaded.aggregate, args.expectedInvocationVersion)
    if (projected.kind === 'refused') return projected
    if (!projected.value.semantics.continuations.some(({ kind }) => kind === 'reconcile')) {
      return { kind: 'refused' as const, code: 'continuation_not_allowed' as const }
    }
    return {
      kind: 'ready' as const,
      aggregate: loaded.aggregate,
      commandDigest,
    }
  },
})

export const authenticatedCommand = action({
  args: {
    invocationRef: v.string(),
    commandId: v.string(),
    expectedInvocationVersion: v.number(),
    command: commandKind,
    accept: v.optional(v.boolean()),
    serviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const accept = args.accept
    if ((args.command === 'authorize') !== (typeof accept === 'boolean')) {
      return { kind: 'refused' as const, code: 'continuation_not_allowed' as const }
    }
    const publicIntent: HostedPaidOperationServiceIntent = args.command === 'authorize'
      ? {
          kind: 'command',
          invocationRef: args.invocationRef,
          commandId: args.commandId,
          expectedInvocationVersion: args.expectedInvocationVersion,
          command: args.command,
          accept: requireAuthorizationDecision(accept),
        }
      : {
          kind: 'command',
          invocationRef: args.invocationRef,
          commandId: args.commandId,
          expectedInvocationVersion: args.expectedInvocationVersion,
          command: args.command,
        }
    const caller = await resolveCaller(ctx, args.serviceToken, publicIntent)
    if (caller === undefined) {
      return { kind: 'refused' as const, code: 'authentication_required' as const }
    }
    const internalIntent = {
      principalRef: caller.actor.principalRef,
      callerRef: caller.actor.callerRef,
      invocationRef: args.invocationRef,
      commandId: args.commandId,
      expectedInvocationVersion: args.expectedInvocationVersion,
    }
    const transition = args.command === 'authorize'
      ? await ctx.runMutation(internalApplyAuthorization, {
          ...internalIntent,
          accept: requireAuthorizationDecision(accept),
        })
      : args.command === 'execute'
        ? await executeAuthenticatedIntent(ctx, internalIntent)
        : await reconcileAuthenticatedIntent(ctx, internalIntent)
    if (transition.kind === 'refused') return transition
    const loaded = await ctx.runQuery(
      internalLoadComplete,
      loadArgs(caller.actor, args.invocationRef),
    ) as HostedLoad
    if (loaded.kind !== 'loaded') return loadRefusal(loaded)
    return projectAggregate(loaded.aggregate, loaded.aggregate.invocation.invocationVersion)
  },
})

async function executeAuthenticatedIntent(
  ctx: ActionCtx,
  intent: AuthenticatedIntent,
): Promise<InternalRefusal | InternalDuplicate | Applied> {
  const begun = await ctx.runMutation(internalBeginExecute, intent) as
    InternalRefusal | InternalDuplicate | ExecuteReady
  if (begun.kind !== 'ready') return begun

  const completedAt = new Date(Date.now()).toISOString()
  const releaseSignal = createDevelopmentReleaseSignal()
  const result = { kind: 'hosted_sandbox_succeeded', ok: true } as const
  let effectRefusal: InternalRefusal | undefined
  let observation: MockObservation | undefined
  const completed = await executeReleasedAttempt({
    action: hostedLifecycleAction(begun.aggregate, async () => {
      const recorded = await ctx.runMutation(internalRecordMockEffect, {
        principalRef: intent.principalRef,
        callerRef: intent.callerRef,
        invocationRef: intent.invocationRef,
        attemptRef: begun.attemptRef,
        effectGeneration: begun.effectGeneration,
        recordedAt: completedAt,
      }) as
        | Readonly<{ kind: 'recorded' | 'duplicate'; observation: MockObservation }>
        | InternalRefusal
      if (recorded.kind === 'refused') {
        effectRefusal = {
          kind: 'refused',
          code: recorded.code === 'trial_disabled_or_inactive'
            ? 'trial_disabled'
            : 'continuation_not_allowed',
        }
        throw new Error('hosted_sandbox_pre_release_refused')
      }
      observation = recorded.observation
      releaseSignal.markReleased()
      if (recorded.observation.effect !== 'released'
        || recorded.observation.delivery === 'response_lost') {
        throw new Error('hosted_sandbox_provider_outcome_unknown')
      }
      return result
    }),
    actionInput: hostedMaterialInput(begun.aggregate),
    context: {
      actionInvocationExecution: {
        invocationRef: intent.invocationRef,
        attemptRef: begun.attemptRef,
        effectGeneration: begun.effectGeneration,
      },
    },
    releaseStartView: begun.releaseStartView,
    attemptRef: begun.attemptRef,
    leaseOwner: begun.leaseOwner,
    effectGeneration: begun.effectGeneration,
    operationKey: begun.aggregate.interpretation.operation.operationKey,
    now: () => completedAt,
    legacyReleaseSignal: releaseSignal,
  })
  const successfulObservation = completed.control.state === 'terminal'
    && completed.observedResolution.state === 'returned'
    && observation?.effect === 'released'
    && observation.payment === 'settled'
    ? observation
    : undefined
  const successful = successfulObservation !== undefined
  const evidenceReferences = successfulObservation === undefined
    ? []
    : [mockObservationReference(intent, begun, successfulObservation)]
  const next = aggregateWithView(begun.aggregate, completed, {
    paymentState: successful
      ? 'settled'
      : effectRefusal === undefined
        ? 'reconciliation_required'
        : 'prepared',
    evidenceRefs: evidenceReferences,
    ...(successful
      ? {
          result,
          settledAmount: { currency: 'USD', amountMinor: 1 },
        }
      : {}),
  })
  const persisted = await ctx.runMutation(
    internalTransact,
    serializeTransaction({
      owner: actorFromInternal(intent),
      invocationRef: intent.invocationRef,
      commandId: `${intent.commandId}:complete:${begun.effectGeneration}`,
      commandDigest: canonicalDigest({
        commandDigest: begun.commandDigest,
        phase: 'complete',
        effectGeneration: begun.effectGeneration,
        controlState: completed.control.state,
      }),
      expectedInvocationVersion: begun.releaseStartView.invocationVersion,
      expectedEffectGeneration: begun.effectGeneration,
      next,
    }, completedAt),
  ) as InternalRefusal | InternalDuplicate | Applied
  if (persisted.kind === 'refused') return persisted
  return effectRefusal ?? persisted
}

async function reconcileAuthenticatedIntent(
  ctx: ActionCtx,
  intent: AuthenticatedIntent,
): Promise<InternalRefusal | InternalDuplicate | Applied> {
  const begun = await ctx.runMutation(internalBeginReconcile, intent) as
    InternalRefusal | InternalDuplicate | ReconcileReady
  if (begun.kind !== 'ready') return begun
  const currentAttempt = begun.aggregate.invocation.attempts.at(-1)
  if (currentAttempt === undefined || begun.aggregate.paymentAttempt === undefined) {
    return { kind: 'refused', code: 'aggregate_incomplete' }
  }
  const observationResult = await ctx.runQuery(internalReadMockEffect, {
    principalRef: intent.principalRef,
    callerRef: intent.callerRef,
    invocationRef: intent.invocationRef,
    attemptRef: currentAttempt.attemptRef,
    effectGeneration: currentAttempt.effectGeneration,
  }) as Readonly<{ kind: 'observed'; observation: MockObservation }> | InternalRefusal
  if (observationResult.kind === 'refused') return observationResult
  if (!mockObservationMatches(begun.aggregate, observationResult.observation)) {
    return { kind: 'refused', code: 'aggregate_incomplete' }
  }
  const trustedObservationGuard: HostedPaidOperationTrustedObservationGuard =
    observationResult.observation.effect === 'not_released'
      ? {
          kind: 'mock_effect_absent',
          attemptRef: currentAttempt.attemptRef,
          effectGeneration: currentAttempt.effectGeneration,
        }
      : {
          kind: 'mock_effect_digest',
          attemptRef: currentAttempt.attemptRef,
          effectGeneration: currentAttempt.effectGeneration,
          observationDigest: canonicalDigest(observationResult.observation),
        }
  const observedAt = new Date(Date.now()).toISOString()
  const boundPayment = boundPaymentAttempt(begun.aggregate, currentAttempt, observedAt)
  const trusted = trustedObservationEvidence(
    {
      source: TRUSTED_OBSERVER_SOURCE,
      invocationRef: intent.invocationRef,
      attemptRef: currentAttempt.attemptRef,
      effectGeneration: currentAttempt.effectGeneration,
      paymentAttempt: boundPayment,
    },
    observationResult.observation,
    observedAt,
  )
  let applyRefusal: InternalRefusal | undefined
  let appliedResult: InternalDuplicate | Applied | undefined
  const service = createHostedSandboxReconciliation({
    loadBoundAttempt: async (candidate) => candidate.commandId === intent.commandId
      && candidate.expectedInvocationVersion === intent.expectedInvocationVersion
      ? {
          source: TRUSTED_OBSERVER_SOURCE,
          invocationRef: intent.invocationRef,
          invocationVersion: begun.aggregate.invocation.invocationVersion,
          attemptRef: currentAttempt.attemptRef,
          effectGeneration: currentAttempt.effectGeneration,
          paymentAttempt: boundPayment,
        }
      : undefined,
    observeTrustedFixture: async () => trusted,
    verifyActionEvidence: (evidence) => evidence.source === TRUSTED_OBSERVER_SOURCE,
    verifyPaymentEvidence: (evidence) => evidence.source === TRUSTED_OBSERVER_SOURCE,
    applyValidated: async (validated) => {
      const reconciled = lifecycleTracer(
        begun.aggregate,
        observedAt,
        intent.commandId,
      ).reconcile({
        invocationRef: intent.invocationRef,
        expectedInvocationVersion: intent.expectedInvocationVersion,
        attemptRef: currentAttempt.attemptRef,
        actor: begun.aggregate.invocation.owner,
        origin: begun.aggregate.invocation.origin,
        evidence: trusted.actionEvidence,
      })
      if (reconciled.kind !== 'accepted') {
        applyRefusal = {
          kind: 'refused',
          code: reconciled.code === 'stale_invocation_version'
            ? 'stale_invocation_version'
            : 'continuation_not_allowed',
        }
        return undefined
      }
      const observedView: ActionInvocationView<ActionResult> = {
        ...reconciled.view,
        observedResolution: { state: 'pending' },
        freshness: { state: 'current', observedAt },
      }
      const released = validated.actionResolution === 'released'
      const settled = validated.paymentResolution === 'settled'
      const next = aggregateWithView(begun.aggregate, observedView, {
        paymentState: released
          ? settled ? 'settled' : 'not_settled'
          : 'prepared',
        evidenceRefs: [
          validated.actionEvidenceRef,
          validated.paymentEvidenceRef,
        ],
        ...(settled ? { settledAmount: { currency: 'USD', amountMinor: 1 } } : {}),
      })
      const persisted = await ctx.runMutation(
        internalTransact,
        serializeTransaction({
          owner: actorFromInternal(intent),
          invocationRef: intent.invocationRef,
          commandId: intent.commandId,
          commandDigest: begun.commandDigest,
          expectedInvocationVersion: intent.expectedInvocationVersion,
          expectedEffectGeneration: currentAttempt.effectGeneration,
          trustedObservationGuard,
          next,
        }, observedAt),
      ) as InternalRefusal | InternalDuplicate | Applied
      if (persisted.kind === 'refused') {
        applyRefusal = persisted
        return undefined
      }
      appliedResult = persisted
      return { currentVersion: persisted.invocationVersion }
    },
    now: () => Date.parse(observedAt),
  })
  const reconciled = await service.reconcile({
    command: 'reconcile',
    commandId: intent.commandId,
    expectedInvocationVersion: intent.expectedInvocationVersion,
  })
  if (applyRefusal !== undefined) return applyRefusal
  if (reconciled.kind === 'refused' || appliedResult === undefined) {
    return { kind: 'refused', code: 'continuation_not_allowed' }
  }
  return appliedResult
}

async function resolveCaller(
  ctx: ConvexIdentityContext,
  serviceToken: string | undefined,
  intent: HostedPaidOperationServiceIntent,
): Promise<ResolvedCaller | undefined> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity !== null) {
    if (serviceToken !== undefined) return undefined
    return {
      actor: {
        principalRef: identity.subject,
        callerRef: identity.tokenIdentifier,
      },
    }
  }
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (serviceToken === undefined || key === undefined || key.length < 32) return undefined
  const verified = await verifyHostedPaidOperationServiceToken({
    key,
    serviceToken,
    intent,
    now: Date.now(),
  })
  if (verified === undefined) return undefined
  return {
    actor: {
      principalRef: verified.principalRef,
      callerRef: verified.callerRef,
    },
    requestIdentity: verified.tokenRef,
  }
}

function projectLoaded(
  loaded: HostedLoad,
  expectedInvocationVersion: number,
) {
  return loaded.kind === 'loaded'
    ? projectAggregate(loaded.aggregate, expectedInvocationVersion)
    : loadRefusal(loaded)
}

function projectAggregate(
  aggregate: HostedAggregate,
  expectedInvocationVersion: number,
) {
  return createPaidOperationApplicationService({
    actor: aggregate.invocation.owner,
    reads: {
      loadInvocation: (invocationRef) =>
        invocationRef === aggregate.invocation.invocationRef ? aggregate.invocation : undefined,
      loadPreparedPaymentAttempt: ({ invocationRef }) =>
        invocationRef === aggregate.invocation.invocationRef
          ? aggregate.paymentAttempt
          : undefined,
      loadPaymentAttempt: ({ invocationRef, attemptRef, effectGeneration }) => {
        const attempt = aggregate.invocation.attempts.at(-1)
        return invocationRef === aggregate.invocation.invocationRef
          && attempt?.attemptRef === attemptRef
          && attempt.effectGeneration === effectGeneration
          ? aggregate.paymentAttempt
          : undefined
      },
    },
    interpreter: { interpret: () => aggregate.interpretation },
    commands: {
      authorize: async () => undefined,
      execute: async () => undefined,
      reconcile: async () => undefined,
    },
  }).inspect({
    invocationRef: aggregate.invocation.invocationRef,
    expectedInvocationVersion,
  })
}

async function loadOwned(
  ctx: QueryCtx | MutationCtx,
  actor: InvocationActor,
  invocationRef: string,
): Promise<HostedLoad> {
  return await ctx.runQuery(internalLoadComplete, loadArgs(actor, invocationRef)) as HostedLoad
}

function loadArgs(actor: InvocationActor, invocationRef: string) {
  return {
    ownerPrincipalRef: actor.principalRef,
    ownerCallerRef: actor.callerRef,
    invocationRef,
    paginationOpts: {
      numItems: HOSTED_PAID_OPERATION_HISTORY_PAGE_SIZE,
      cursor: null,
    },
  }
}

function loadRefusal(loaded: Exclude<HostedLoad, { kind: 'loaded' }>) {
  return loaded.kind === 'not_found'
    ? { kind: 'refused' as const, code: 'invocation_not_found' as const }
    : { kind: 'refused' as const, code: 'aggregate_incomplete' as const }
}

async function commandPreflight(
  ctx: MutationCtx,
  loaded: HostedLoad,
  commandId: string,
  commandDigest: string,
): Promise<InternalRefusal | InternalDuplicate | undefined> {
  if (loaded.kind !== 'loaded') return undefined
  const prior = await ctx.db.query('hostedPaidOperationCommands')
    .withIndex('by_invocationRef_and_commandId', (q) =>
      q.eq('invocationRef', loaded.aggregate.invocation.invocationRef)
        .eq('commandId', commandId))
    .unique()
  if (prior === null) return undefined
  if (prior.commandDigest !== commandDigest) {
    return { kind: 'refused', code: 'command_identity_conflict' }
  }
  return {
    kind: 'duplicate',
    invocationVersion: prior.invocationVersion,
    ...(prior.effectGeneration === undefined
      ? {}
      : { effectGeneration: prior.effectGeneration }),
  }
}

function actorFromInternal(input: Readonly<{
  principalRef: string
  callerRef: string
}>): InvocationActor {
  return { principalRef: input.principalRef, callerRef: input.callerRef }
}

function attributeCurrentAttempt(
  view: ActionInvocationView<ActionResult>,
  actor: InvocationActor,
): ActionInvocationView<ActionResult> {
  const attempt = view.attempts.at(-1)
  if (attempt === undefined) return view
  return {
    ...view,
    attempts: [
      ...view.attempts.slice(0, -1),
      { ...attempt, actor },
    ],
  }
}

function publicCommandDigest(
  input: Readonly<{
    invocationRef: string
    commandId: string
    expectedInvocationVersion: number
  }>,
  command: 'authorize' | 'execute' | 'reconcile',
  accept?: boolean,
) {
  return canonicalDigest({
    schema: 'hosted-paid-operation-public-intent:v1',
    invocationRef: input.invocationRef,
    commandId: input.commandId,
    expectedInvocationVersion: input.expectedInvocationVersion,
    command,
    ...(accept === undefined ? {} : { accept }),
  })
}

type HostedMaterialInput = Readonly<{
  symbol: 'BTC'
  convert: 'USD'
  operationKey: string
}>

function lifecycleTracer(
  aggregate: HostedAggregate,
  now: string,
  commandId: string,
) {
  const prepared = aggregate.invocation.prepared
  if (prepared === undefined) {
    throw new Error('hosted_paid_operation_prepared_state_missing')
  }
  return createInMemoryActionInvocationTracer({
    action: hostedLifecycleAction(aggregate, async () => ({ kind: 'unused' })),
    now: () => now,
    nextInvocationRef: () => aggregate.invocation.invocationRef,
    nextAttemptRef: () => `attempt:${canonicalDigest({
      invocationRef: aggregate.invocation.invocationRef,
      commandId,
    })}`,
    initialSnapshot: {
      format: 'action-invocation-control:development:v1',
      records: [{
        sourceRef: aggregate.header.selectedSourceRef,
        control: withoutSourceState(aggregate.invocation),
        authorityBinding: authorityBinding(aggregate),
      }],
    },
    resolveSourceState: () => ({
      input: hostedMaterialInput(aggregate),
      context: {},
      prepared,
      observedResolution: aggregate.invocation.observedResolution,
    }),
    verifyReconciliationEvidence: (evidence) =>
      evidence.source === TRUSTED_OBSERVER_SOURCE,
  })
}

function requireAuthorizationDecision(value: boolean | undefined): boolean {
  if (typeof value !== 'boolean') {
    throw new Error('hosted_paid_operation_authorization_decision_missing')
  }
  return value
}

function hostedLifecycleAction(
  aggregate: HostedAggregate,
  run: () => Promise<ActionResult>,
) {
  return {
    id: aggregate.invocation.action.id,
    name: aggregate.interpretation.presentation.title,
    summary: aggregate.interpretation.presentation.summary,
    boundaries: ['Labelled sandbox fixture only.'],
    schema: z.unknown() as z.ZodType<HostedMaterialInput>,
    parameters: [],
    readOnly: false,
    surfaces: [],
    outputSchema: z.unknown() as z.ZodType<ActionResult>,
    invocationContract: {
      version: aggregate.invocation.action.contractVersion,
      consequenceClass: 'external_effect' as const,
      materialInputPaths: ['symbol', 'convert'],
      authorityRequirement: 'principal' as const,
      retryClass: 'reconcile_before_retry' as const,
      expectedEvidence: ['labelled-sandbox-observation'],
      safeContinuations: ['inspect', 'reconcile'],
      invalidationConditions: ['material_input_changed', 'authority_expired'],
      developmentAttemptTimeoutMs: 5_000,
      reconciliationEvidenceSource: TRUSTED_OBSERVER_SOURCE,
    },
    classifyInvocationResult: (result: ActionResult) => ({
      outcome: result.kind,
      referenceable: true,
    }),
    run,
  }
}

function hostedMaterialInput(aggregate: HostedAggregate): HostedMaterialInput {
  const material = aggregate.interpretation.operation.materialInputs
  if (material === null || typeof material !== 'object' || Array.isArray(material)) {
    throw new Error('hosted_paid_operation_material_input_invalid')
  }
  const candidate = material as Readonly<Record<string, unknown>>
  if (candidate.symbol !== 'BTC' || candidate.convert !== 'USD') {
    throw new Error('hosted_paid_operation_material_input_invalid')
  }
  return {
    symbol: 'BTC',
    convert: 'USD',
    operationKey: aggregate.interpretation.operation.operationKey,
  }
}

function withoutSourceState(
  view: ActionInvocationView<ActionResult>,
): Omit<ActionInvocationView<ActionResult>, 'prepared' | 'observedResolution'> {
  const { prepared: _prepared, observedResolution: _observedResolution, ...control } = view
  return control
}

function authorityBinding(aggregate: HostedAggregate): AuthorityBindingSnapshot {
  const preparedState = aggregate.invocation.prepared
  const authority = aggregate.invocation.authority
  if (preparedState === undefined || authority === undefined) {
    throw new Error('hosted_paid_operation_authority_binding_incomplete')
  }
  return {
    reference: authority.reference,
    invocationRef: aggregate.invocation.invocationRef,
    actor: aggregate.invocation.owner,
    origin: aggregate.invocation.origin,
    invocationVersion: aggregate.invocation.invocationVersion,
    actionId: aggregate.invocation.action.id,
    contractVersion: aggregate.invocation.action.contractVersion,
    digest: preparedState.materialInputDigest,
    targetDigest: canonicalDigest(preparedState.target as never),
    consequence: preparedState.consequence,
    limits: preparedState.dataUse.limits,
    expiresAt: authority.expiresAt,
    ...(aggregate.invocation.acceptedAuthority === undefined
      ? {}
      : { acceptedBasis: aggregate.invocation.acceptedAuthority }),
  }
}

function preReleaseUncertainty(
  releaseStart: ActionInvocationView<ActionResult>,
  recordedAt: string,
): ActionInvocationView<ActionResult> {
  const attempt = releaseStart.attempts.at(-1)
  if (attempt === undefined) {
    throw new Error('hosted_paid_operation_release_attempt_missing')
  }
  return {
    ...releaseStart,
    attempts: replaceAttempt(releaseStart.attempts, {
      ...attempt,
      release: { state: 'possibly_released' },
      outcome: {
        state: 'uncertain',
        retry: 'reconcile_before_retry',
        message: 'Release prepared; completion has not yet been durably observed.',
        reconciliationRequiredAt: recordedAt,
      },
    }),
    observedResolution: { state: 'pending' },
    freshness: { state: 'current', observedAt: recordedAt },
    control: { state: 'reconciliation_required', attemptRef: attempt.attemptRef },
  }
}

function aggregateWithView(
  aggregate: HostedAggregate,
  invocation: ActionInvocationView<ActionResult>,
  options: Readonly<{
    paymentState?: NonNullable<HostedAggregate['paymentAttempt']>['state']
    evidenceRefs?: readonly string[]
    result?: ActionResult
    settledAmount?: Readonly<{ currency: string; amountMinor: number }>
  }> = {},
): HostedAggregate {
  const attempt = invocation.attempts.at(-1)
  const evidenceRefs = options.evidenceRefs ?? aggregate.evidenceReferences
  const resultDelivery = options.result === undefined
    ? aggregate.interpretation.resultDelivery
    : {
        state: 'valid' as const,
        blocks: [{
          kind: 'status' as const,
          label: 'Sandbox result',
          value: options.result.kind,
          tone: 'positive' as const,
        }],
        evidenceRefs,
      }
  return {
    ...aggregate,
    header: {
      ...aggregate.header,
      ...(attempt === undefined
        ? {}
        : { currentEffectGeneration: attempt.effectGeneration }),
    },
    invocation,
    ...(aggregate.paymentAttempt === undefined
      ? {}
      : {
          paymentAttempt: {
            ...aggregate.paymentAttempt,
            ...(options.paymentState === undefined ? {} : { state: options.paymentState }),
            ...(options.settledAmount === undefined
              ? {}
              : { settledAmount: options.settledAmount }),
            evidenceRefs,
          },
        }),
    interpretation: {
      ...aggregate.interpretation,
      resultDelivery,
    },
    evidenceReferences: evidenceRefs,
  }
}

function boundPaymentAttempt(
  aggregate: HostedAggregate,
  attempt: ActionInvocationView<ActionResult>['attempts'][number],
  observedAt: string,
): X402PaymentAttempt {
  const payment = aggregate.paymentAttempt
  const preparedState = aggregate.invocation.prepared
  const proposal = aggregate.paymentProposal
  const amount = hostedPaidOperationAmountFromMinorUnits(
    aggregate.interpretation.maximumAuthorizedCharge.amountMinor,
  )
  if (payment === undefined
    || preparedState === undefined
    || proposal === undefined
    || amount === undefined
    || !hostedPaidOperationPaymentProposalValid(proposal)
    || !hostedPaidOperationPaymentProposalMatches(proposal, {
      paymentIdentifier: payment.paymentIdentifier,
      providerId: aggregate.interpretation.operation.providerId,
      operationKey: aggregate.interpretation.operation.operationKey,
      operationRevision: aggregate.interpretation.operation.operationRevision,
      payTo: aggregate.interpretation.queryRecipient,
      amount,
      custodyRef: payment.custodyRef,
      preparedAt: preparedState.preparedAt,
    })) {
    throw new Error('hosted_paid_operation_payment_binding_incomplete')
  }
  const submissionStartedAt = attempt.outcome.state === 'uncertain'
    || attempt.outcome.state === 'timed_out'
    ? Date.parse(attempt.outcome.reconciliationRequiredAt)
    : Date.parse(observedAt)
  return {
    paymentIdentifier: payment.paymentIdentifier,
    invocationRef: aggregate.invocation.invocationRef,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
    operationKey: proposal.operationKey,
    challengeDigest: proposal.challengeDigest,
    scheme: proposal.scheme,
    network: proposal.network,
    asset: proposal.asset,
    payTo: proposal.payTo,
    amount: proposal.amount,
    providerEndpoint: proposal.providerEndpoint,
    operationRevision: proposal.operationRevision,
    authorizationDigest: proposal.authorizationDigest,
    custodyRef: proposal.custodyRef,
    state: 'reconciliation_required',
    preparedAt: Date.parse(proposal.preparedAt),
    submissionStartedAt,
    evidenceRefs: payment.evidenceRefs,
  }
}

function trustedObservationEvidence(
  bound: Readonly<{
    source: string
    invocationRef: string
    attemptRef: string
    effectGeneration: number
    paymentAttempt: X402PaymentAttempt
  }>,
  observation: MockObservation,
  observedAt: string,
) {
  const actionResolution = observation.effect
  const paymentResolution = observation.payment === 'settled' ? 'settled' : 'not_settled'
  const actionMaterial: ReconciliationEvidenceMaterial = {
    kind: 'action_invocation_reconciliation',
    version: 1,
    evidenceRef: canonicalDigest({
      kind: 'hosted-sandbox-action-observation',
      invocationRef: bound.invocationRef,
      attemptRef: bound.attemptRef,
      effectGeneration: bound.effectGeneration,
      observation,
    }),
    source: bound.source,
    invocationRef: bound.invocationRef,
    attemptRef: bound.attemptRef,
    effectGeneration: bound.effectGeneration,
    resolution: actionResolution,
    observedAt,
  }
  const paymentMaterial: X402PaymentReconciliationEvidenceMaterial = {
    kind: 'x402_payment_reconciliation',
    version: 1,
    evidenceRef: canonicalDigest({
      kind: 'hosted-sandbox-payment-observation',
      paymentIdentifier: bound.paymentAttempt.paymentIdentifier,
      attemptRef: bound.attemptRef,
      effectGeneration: bound.effectGeneration,
      observation,
    }),
    evidenceRefs: [actionMaterial.evidenceRef],
    source: bound.source,
    paymentIdentifier: bound.paymentAttempt.paymentIdentifier,
    challengeDigest: bound.paymentAttempt.challengeDigest,
    providerEndpoint: bound.paymentAttempt.providerEndpoint,
    scheme: bound.paymentAttempt.scheme,
    network: bound.paymentAttempt.network,
    asset: bound.paymentAttempt.asset,
    payTo: bound.paymentAttempt.payTo,
    amount: bound.paymentAttempt.amount,
    invocationRef: bound.invocationRef,
    attemptRef: bound.attemptRef,
    effectGeneration: bound.effectGeneration,
    resolution: paymentResolution,
    ...(paymentResolution === 'settled'
      ? { settledAmount: { currency: 'USD', amountMinor: 1 } }
      : {}),
    observedAt,
  }
  return {
    actionEvidence: {
      ...actionMaterial,
      digest: canonicalDigest(actionMaterial),
    },
    paymentEvidence: {
      ...paymentMaterial,
      digest: canonicalDigest(paymentMaterial),
    },
  }
}

function mockObservationMatches(
  aggregate: HostedAggregate,
  observation: MockObservation,
): boolean {
  const proposal = aggregate.paymentProposal
  if (proposal === undefined) return false
  if (observation.effect === 'not_released') {
    return observation.payment === 'not_submitted'
  }
  return observation.providerId === aggregate.interpretation.operation.providerId
    && observation.operationKey === aggregate.interpretation.operation.operationKey
    && observation.operationRevision === aggregate.interpretation.operation.operationRevision
    && observation.paymentIdentifier === aggregate.paymentAttempt?.paymentIdentifier
    && observation.proposalDigest === proposal.proposalDigest
}

function mockObservationReference(
  intent: AuthenticatedIntent,
  begun: ExecuteReady,
  observation: MockObservation,
) {
  return canonicalDigest({
    kind: 'hosted-labelled-mock-observation',
    invocationRef: intent.invocationRef,
    attemptRef: begun.attemptRef,
    effectGeneration: begun.effectGeneration,
    observation,
  })
}

const HOSTED_SANDBOX_PROVIDERS: Readonly<Record<'A' | 'B', HostedSandboxProvider>> = {
  A: {
    providerId: 'provider:a',
    providerName: 'Sandbox provider A',
    sourceRef: 'source:a',
    recipient: 'sandbox-recipient:a',
    endpoint: 'https://sandbox-a.invalid/btc-usd',
    operationKey: 'btc-usd-a',
    operationRevision: '1',
  },
  B: {
    providerId: 'provider:b',
    providerName: 'Sandbox provider B',
    sourceRef: 'source:b',
    recipient: 'sandbox-recipient:b',
    endpoint: 'https://sandbox-b.invalid/btc-usd',
    operationKey: 'btc-usd-b',
    operationRevision: '1',
  },
}

function serializeInitialCreation(
  creation: Readonly<{
    creationCommandId: string
    creationCommandDigest: string
    reservationRef: string
    aggregate: HostedAggregate
  }>,
  recordedAt: string,
): Record<string, unknown> {
  const aggregate = creation.aggregate
  const payment = aggregate.paymentAttempt
  const preparedState = aggregate.invocation.prepared
  const authority = aggregate.invocation.authority
  if (payment === undefined || preparedState === undefined || authority === undefined) {
    throw new Error('hosted_paid_operation_initial_aggregate_incomplete')
  }
  return {
    creationCommandId: creation.creationCommandId,
    creationCommandDigest: creation.creationCommandDigest,
    reservationRef: creation.reservationRef,
    invocationRef: aggregate.invocation.invocationRef,
    invocationVersion: aggregate.invocation.invocationVersion,
    selectedSource: serializeSelectedSource(aggregate),
    control: serializeControl(aggregate),
    payment: serializePayment(aggregate, 'creation', 0),
    recordedAt,
  }
}

function serializeTransaction(
  transaction: Readonly<{
    owner: InvocationActor
    invocationRef: string
    commandId: string
    commandDigest: string
    expectedInvocationVersion: number
    expectedEffectGeneration?: number
    trustedObservationGuard?: HostedPaidOperationTrustedObservationGuard
    next: HostedAggregate
  }>,
  recordedAt: string,
  submissionStarted = false,
): Record<string, unknown> {
  const next = transaction.next
  const attempt = next.invocation.attempts.at(-1)
  return {
    ownerPrincipalRef: transaction.owner.principalRef,
    ownerCallerRef: transaction.owner.callerRef,
    invocationRef: transaction.invocationRef,
    commandId: transaction.commandId,
    commandDigest: transaction.commandDigest,
    expectedInvocationVersion: transaction.expectedInvocationVersion,
    ...(transaction.expectedEffectGeneration === undefined
      ? {}
      : { expectedEffectGeneration: transaction.expectedEffectGeneration }),
    ...(transaction.trustedObservationGuard === undefined
      ? {}
      : { trustedObservationGuard: transaction.trustedObservationGuard }),
    nextInvocationVersion: next.invocation.invocationVersion,
    ...(attempt === undefined ? {} : { nextEffectGeneration: attempt.effectGeneration }),
    selectedSource: serializeSelectedSource(next),
    control: serializeControl(next),
    ...(attempt === undefined
      ? {}
      : {
          currentAttempt: {
            attemptRef: attempt.attemptRef,
            attemptNumber: attempt.attemptNumber,
            effectGeneration: attempt.effectGeneration,
            actor: attempt.actor,
            idempotency: attempt.idempotency,
            lease: attempt.lease,
            release: attempt.release,
            outcome: attempt.outcome,
          },
        }),
    ...(next.paymentAttempt === undefined
      ? {}
      : {
          payment: serializePayment(
            next,
            attempt?.attemptRef ?? 'creation',
            attempt?.effectGeneration ?? 0,
          ),
        }),
    evidenceReferences: attempt === undefined
      ? []
      : next.evidenceReferences.map((reference) => ({
          attemptRef: attempt.attemptRef,
          effectGeneration: attempt.effectGeneration,
          evidenceKind: 'hosted-sandbox-observation',
          evidenceReference: serializeOpaqueReference(reference),
        })),
    submissionStarted,
    releaseAdmission: isAdmissionClosed(next.invocation.control),
    recordedAt,
  }
}

function isAdmissionClosed(control: Readonly<{ state: string; reason?: string }>): boolean {
  return control.state === 'terminal'
    || control.state === 'cancelled'
    || (control.state === 'invalidated' && control.reason === 'authority_not_accepted')
}

function serializeSelectedSource(aggregate: HostedAggregate): Record<string, unknown> {
  const preparedState = aggregate.invocation.prepared
  if (preparedState === undefined) {
    throw new Error('hosted_paid_operation_prepared_state_missing')
  }
  return {
    sourceRef: aggregate.header.selectedSourceRef,
    providerId: aggregate.interpretation.operation.providerId,
    providerName: aggregate.interpretation.operation.providerName,
    operationKey: aggregate.interpretation.operation.operationKey,
    operationRevision: aggregate.interpretation.operation.operationRevision,
    materialInputDigest: preparedState.materialInputDigest,
    materialInputs: aggregate.interpretation.operation.materialInputs,
    prepared: preparedState,
    presentation: aggregate.interpretation.presentation,
    maximumAuthorizedCharge: aggregate.interpretation.maximumAuthorizedCharge,
    queryRecipient: aggregate.interpretation.queryRecipient,
    resultDelivery: aggregate.interpretation.resultDelivery,
    environment: aggregate.interpretation.environment,
    observedResolution: aggregate.invocation.observedResolution,
  }
}

function serializeControl(aggregate: HostedAggregate): Record<string, unknown> {
  const preparedState = aggregate.invocation.prepared
  const authority = aggregate.invocation.authority
  if (preparedState === undefined || authority === undefined) {
    throw new Error('hosted_paid_operation_control_incomplete')
  }
  return {
    origin: aggregate.invocation.origin,
    owner: aggregate.invocation.owner,
    action: aggregate.invocation.action,
    desired: aggregate.invocation.desired,
    prepared: preparedState,
    authority,
    ...(aggregate.invocation.acceptedAuthority === undefined
      ? {}
      : { acceptedAuthority: aggregate.invocation.acceptedAuthority }),
    freshness: aggregate.invocation.freshness,
    control: aggregate.invocation.control,
  }
}

function serializePayment(
  aggregate: HostedAggregate,
  attemptRef: string,
  effectGeneration: number,
): Record<string, unknown> {
  const payment = aggregate.paymentAttempt
  const proposal = aggregate.paymentProposal
  if (payment === undefined || proposal === undefined) {
    throw new Error('hosted_paid_operation_payment_missing')
  }
  return {
    attemptRef,
    effectGeneration,
    paymentIdentifier: payment.paymentIdentifier,
    custodyReference: serializeOpaqueReference(payment.custodyRef),
    proposal,
    state: payment.state,
    ...(payment.settledAmount === undefined
      ? {}
      : {
          settledCurrency: payment.settledAmount.currency,
          settledAmountMinor: payment.settledAmount.amountMinor,
        }),
  }
}

function serializeOpaqueReference(reference: string) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(reference)) {
    throw new Error('hosted_paid_operation_reference_not_opaque')
  }
  return { algorithm: 'sha256' as const, digest: reference.slice('sha256:'.length) }
}
