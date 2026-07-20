import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import type { StableHashValue } from '../src/modules/common/stable-hash'
import {
  HOSTED_PAID_OPERATION_CHILD_CAP,
  HOSTED_PAID_OPERATION_HISTORY_PAGE_SIZE,
} from '../src/modules/action-invocation/hosted-paid-operation-port'
import {
  acceptedAuthorityValue,
  actionInvocationOriginValue,
  attemptReleaseValue,
  durableAttemptOutcomeValue,
  invocationActorValue,
  invocationControlValue,
  invocationFreshnessValue,
} from '../src/modules/action-invocation/internal/convex-schema'
import { internalMutation, internalQuery } from './_generated/server'
import type { MutationCtx } from './_generated/server'

const PHASE3C_POLICY_REF = 'phase-3c-hosted-paid-operation-trial'
const opaqueReference = v.object({
  algorithm: v.literal('sha256'),
  digest: v.string(),
})

const presentationBlock = v.union(
  v.object({ kind: v.literal('text'), label: v.string(), value: v.string() }),
  v.object({ kind: v.literal('measurement'), label: v.string(), value: v.number(), unit: v.string() }),
  v.object({ kind: v.literal('money'), label: v.string(), amountMinor: v.number(), currency: v.string() }),
  v.object({ kind: v.literal('timestamp'), label: v.string(), value: v.string() }),
  v.object({
    kind: v.literal('source'), label: v.string(), providerId: v.string(),
    providerName: v.string(), operationRevision: v.string(),
  }),
  v.object({ kind: v.literal('reference'), label: v.string(), value: v.string() }),
  v.object({
    kind: v.literal('status'), label: v.string(), value: v.string(),
    tone: v.union(
      v.literal('neutral'), v.literal('positive'), v.literal('caution'), v.literal('critical'),
    ),
  }),
)

const resultDelivery = v.union(
  v.object({ state: v.literal('not_delivered') }),
  v.object({ state: v.literal('invalid'), code: v.string(), evidenceRefs: v.array(v.string()) }),
  v.object({ state: v.literal('valid'), blocks: v.array(presentationBlock), evidenceRefs: v.array(v.string()) }),
)

const observedResolution = v.union(
  v.object({ state: v.literal('pending') }),
  v.object({
    state: v.literal('returned'),
    execution: v.union(v.literal('runner_returned'), v.literal('pre_release_refused')),
    businessOutcome: v.string(),
    resultReferenceable: v.boolean(),
    result: v.object({ kind: v.string(), ok: v.optional(v.boolean()) }),
  }),
  v.object({ state: v.literal('threw'), execution: v.literal('runner_threw'), message: v.string() }),
  v.object({ state: v.literal('timed_out'), timeoutMs: v.number(), observedAt: v.string() }),
)

const prepared = v.object({
  materialInputDigest: v.string(),
  target: v.object({
    providerId: v.string(),
    sourceRef: v.string(),
    operationRevision: v.string(),
  }),
  consequence: v.string(),
  dataUse: v.object({ fields: v.array(v.string()), limits: v.record(v.string(), v.number()) }),
  preparedAt: v.string(),
  freshUntil: v.string(),
})

const sourceRow = v.object({
  sourceRef: v.string(),
  providerId: v.string(),
  providerName: v.string(),
  operationKey: v.string(),
  operationRevision: v.string(),
  materialInputDigest: v.string(),
  materialInputs: v.object({ symbol: v.literal('BTC'), convert: v.literal('USD') }),
  prepared,
  presentation: v.object({
    title: v.string(),
    summary: v.string(),
    blocks: v.array(presentationBlock),
  }),
  maximumAuthorizedCharge: v.object({ currency: v.string(), amountMinor: v.number() }),
  queryRecipient: v.string(),
  resultDelivery,
  environment: v.object({
    name: v.string(), evidenceClass: v.string(), claimCeiling: v.string(),
  }),
  observedResolution,
  normalizedResultRef: v.optional(v.string()),
  normalizedResultDigest: v.optional(v.string()),
})

const paymentRow = v.object({
  attemptRef: v.string(),
  effectGeneration: v.number(),
  paymentIdentifier: v.string(),
  custodyReference: opaqueReference,
  state: v.union(
    v.literal('prepared'),
    v.literal('possibly_submitted'),
    v.literal('observed'),
    v.literal('reconciliation_required'),
    v.literal('not_settled'),
    v.literal('settled'),
  ),
  settledCurrency: v.optional(v.string()),
  settledAmountMinor: v.optional(v.number()),
})

const evidenceReferenceRow = v.object({
  attemptRef: v.string(),
  effectGeneration: v.number(),
  evidenceKind: v.string(),
  evidenceReference: opaqueReference,
})

const initialControl = v.object({
  origin: actionInvocationOriginValue,
  owner: invocationActorValue,
  action: v.object({ id: v.string(), contractVersion: v.string() }),
  desired: v.object({ state: v.literal('invoke') }),
  prepared,
  authority: v.object({ reference: v.string(), expiresAt: v.string() }),
  acceptedAuthority: v.optional(acceptedAuthorityValue),
  freshness: invocationFreshnessValue,
  control: invocationControlValue,
})

const currentAttempt = v.object({
  attemptRef: v.string(),
  attemptNumber: v.number(),
  effectGeneration: v.number(),
  actor: invocationActorValue,
  idempotency: v.object({
    operationKey: v.string(),
    materialInputDigest: v.string(),
    effectIdentity: v.string(),
  }),
  lease: v.object({ owner: v.string(), expiresAt: v.string() }),
  release: attemptReleaseValue,
  outcome: durableAttemptOutcomeValue,
})

const trustedObservationGuard = v.union(
  v.object({
    kind: v.literal('mock_effect_absent'),
    attemptRef: v.string(),
    effectGeneration: v.number(),
  }),
  v.object({
    kind: v.literal('mock_effect_digest'),
    attemptRef: v.string(),
    effectGeneration: v.number(),
    observationDigest: v.string(),
  }),
)

/**
 * One source-owned creation transaction. Provider/source interpretation,
 * neutral continuity, payment preparation and the creation command become
 * durable together before any authority decision can be accepted.
 */
export const createInitial = internalMutation({
  args: {
    creationCommandId: v.string(),
    creationCommandDigest: v.string(),
    reservationRef: v.string(),
    invocationRef: v.string(),
    invocationVersion: v.number(),
    selectedSource: sourceRow,
    control: initialControl,
    payment: paymentRow,
    recordedAt: v.string(),
  },
  handler: async (ctx, args) => {
    if (!opaqueDigestValid(args.creationCommandDigest.replace(/^sha256:/u, ''))
      || !opaqueDigestValid(args.payment.custodyReference.digest)
      || !sourceMaterialSafe(args.selectedSource)) {
      return { kind: 'refused' as const, code: 'raw_material_forbidden' as const }
    }
    if (!sourceMaterialWithinCaps(args.selectedSource)) {
      return { kind: 'refused' as const, code: 'aggregate_incomplete' as const }
    }
    if (args.invocationVersion !== 1
      || args.control.control.state !== 'awaiting_authority'
      || args.control.acceptedAuthority !== undefined
      || args.payment.state !== 'prepared') {
      return { kind: 'refused' as const, code: 'initial_state_invalid' as const }
    }
    const priorCommand = await ctx.db.query('hostedPaidOperationCommands')
      .withIndex('by_commandId', (q) => q.eq('commandId', args.creationCommandId))
      .unique()
    if (priorCommand !== null && priorCommand.commandDigest !== args.creationCommandDigest) {
      return { kind: 'refused' as const, code: 'creation_command_conflict' as const }
    }
    if (priorCommand !== null) return { kind: 'duplicate' as const }
    const existingHeader = await ctx.db.query('hostedPaidOperationHeaders')
      .withIndex('by_invocationRef', (q) => q.eq('invocationRef', args.invocationRef))
      .unique()
    if (existingHeader !== null) {
      return { kind: 'refused' as const, code: 'invocation_already_exists' as const }
    }
    const reservation = await ctx.db.query('hostedPaidOperationAdmissionReservations')
      .withIndex('by_reservationRef', (q) => q.eq('reservationRef', args.reservationRef))
      .unique()
    if (reservation === null
      || reservation.state !== 'active'
      || reservation.principalRef !== args.control.owner.principalRef) {
      return { kind: 'refused' as const, code: 'admission_reservation_invalid' as const }
    }
    const policy = await ctx.db.query('hostedPaidOperationAdmissionPolicies')
      .withIndex('by_policyRef_and_principalRef', (q) =>
        q.eq('policyRef', reservation.policyRef)
          .eq('principalRef', reservation.principalRef))
      .unique()
    const counter = await ctx.db.query('hostedPaidOperationAdmissionCounters')
      .withIndex('by_policyRef_and_principalRef', (q) =>
        q.eq('policyRef', reservation.policyRef)
          .eq('principalRef', reservation.principalRef))
      .unique()
    const recordedAt = canonicalIsoTimestamp(args.recordedAt)
    const admissionEndsAt = canonicalIsoTimestamp(policy?.admissionEndsAt)
    if (policy === null
      || !policy.enabled
      || recordedAt === undefined
      || admissionEndsAt === undefined
      || recordedAt >= admissionEndsAt
      || !admissionCounterExact(policy, reservation, counter)) {
      return { kind: 'refused' as const, code: 'admission_reservation_invalid' as const }
    }

    await ctx.db.insert('hostedPaidOperationHeaders', {
      ownerPrincipalRef: args.control.owner.principalRef,
      ownerCallerRef: args.control.owner.callerRef,
      invocationRef: args.invocationRef,
      invocationVersion: args.invocationVersion,
      selectedSourceRef: args.selectedSource.sourceRef,
      admissionReservationRef: args.reservationRef,
      paymentAttemptRequired: true,
      currentPaymentIdentifier: args.payment.paymentIdentifier,
      updatedAt: args.recordedAt,
    })
    await ctx.db.insert('hostedPaidOperationSources', {
      invocationRef: args.invocationRef,
      ...args.selectedSource,
    })
    await ctx.db.insert('actionInvocationControls', {
      invocationRef: args.invocationRef,
      invocationVersion: args.invocationVersion,
      control: {
        invocationRef: args.invocationRef,
        invocationVersion: args.invocationVersion,
        environment: 'MOCK/DEVELOPMENT ONLY',
        persistence: 'durable_control',
        origin: args.control.origin,
        owner: args.control.owner,
        action: args.control.action,
        desired: args.control.desired,
        authority: args.control.authority,
        freshness: args.control.freshness,
        control: args.control.control,
      },
      sourceRef: args.selectedSource.sourceRef,
      preparedMaterialDigest: args.control.prepared.materialInputDigest,
      preparedTargetDigest: canonicalDigest(args.control.prepared.target),
      consequence: args.control.prepared.consequence,
      dataLimitSummary: args.control.prepared.dataUse.limits,
      authorityReference: args.control.authority.reference,
      ...(args.control.acceptedAuthority === undefined
        ? {} : { acceptedAuthority: args.control.acceptedAuthority }),
      updatedAt: args.recordedAt,
    })
    await ctx.db.insert('hostedPaidOperationPayments', {
      invocationRef: args.invocationRef,
      ...args.payment,
      updatedAt: args.recordedAt,
    })
    await ctx.db.insert('hostedPaidOperationCommands', {
      invocationRef: args.invocationRef,
      commandId: args.creationCommandId,
      commandDigest: args.creationCommandDigest,
      invocationVersion: args.invocationVersion,
      principalRef: args.control.owner.principalRef,
      callerRef: args.control.owner.callerRef,
      recordedAt: args.recordedAt,
    })
    return { kind: 'created' as const }
  },
})

/**
 * Exact bounded lookup order: owner-bound header, selected source, neutral
 * control, current attempt, payment, evidence references, then history page.
 */
export const loadComplete = internalQuery({
  args: {
    ownerPrincipalRef: v.string(),
    ownerCallerRef: v.string(),
    invocationRef: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (args.paginationOpts.numItems > HOSTED_PAID_OPERATION_HISTORY_PAGE_SIZE) {
      return { kind: 'aggregate_incomplete' as const, reason: 'history_page_cap_exceeded' as const }
    }
    const header = await ctx.db.query('hostedPaidOperationHeaders')
      .withIndex('by_ownerPrincipalRef_and_invocationRef', (q) =>
        q.eq('ownerPrincipalRef', args.ownerPrincipalRef).eq('invocationRef', args.invocationRef))
      .unique()
    if (header === null) {
      return { kind: 'not_found' as const }
    }
    const source = await ctx.db.query('hostedPaidOperationSources')
      .withIndex('by_invocationRef_and_sourceRef', (q) =>
        q.eq('invocationRef', args.invocationRef).eq('sourceRef', header.selectedSourceRef))
      .unique()
    const control = await ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (q) => q.eq('invocationRef', args.invocationRef))
      .unique()
    const attempts = await ctx.db.query('actionInvocationAttempts')
      .withIndex('by_invocationRef_and_attemptNumber', (q) =>
        q.eq('invocationRef', args.invocationRef))
      .take(HOSTED_PAID_OPERATION_CHILD_CAP + 1)
    const currentAttempt = control?.currentAttemptRef === undefined
      ? undefined
      : attempts.find((candidate) => candidate.attemptRef === control.currentAttemptRef)
    const paymentIdentifier = header.currentPaymentIdentifier
    const payment = paymentIdentifier === undefined
      ? null
      : await ctx.db.query('hostedPaidOperationPayments')
        .withIndex('by_invocationRef_and_paymentIdentifier', (q) =>
          q.eq('invocationRef', args.invocationRef)
            .eq('paymentIdentifier', paymentIdentifier))
        .unique()
    const evidenceReferences = currentAttempt === undefined
      ? []
      : await ctx.db.query('hostedPaidOperationEvidenceReferences')
        .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (q) =>
          q.eq('invocationRef', args.invocationRef)
            .eq('attemptRef', currentAttempt.attemptRef)
            .eq('effectGeneration', currentAttempt.effectGeneration))
        .take(HOSTED_PAID_OPERATION_CHILD_CAP + 1)
    if (source === null || control === null
      || attempts.length > HOSTED_PAID_OPERATION_CHILD_CAP
      || (header.currentEffectGeneration !== undefined && currentAttempt === undefined)
      || (header.paymentAttemptRequired && payment === null)
      || evidenceReferences.length > HOSTED_PAID_OPERATION_CHILD_CAP) {
      return { kind: 'aggregate_incomplete' as const, reason: 'required_child_missing_or_cap_exceeded' as const }
    }
    const history = await ctx.db.query('hostedPaidOperationCommands')
      .withIndex('by_invocationRef_and_commandId', (q) => q.eq('invocationRef', args.invocationRef))
      .paginate(args.paginationOpts)
    const reconstructedHistory: Array<{ commandId: string; invocationVersion: number }> = []
    for (const command of history.page) {
      if (command.invocationVersion !== 1) {
        reconstructedHistory.push({
          commandId: command.commandId,
          invocationVersion: command.invocationVersion,
        })
      }
    }
    const aggregate = {
      header: {
        ownerPrincipalRef: header.ownerPrincipalRef,
        invocationRef: header.invocationRef,
        selectedSourceRef: header.selectedSourceRef,
        paymentAttemptRequired: header.paymentAttemptRequired,
        ...(header.currentPaymentIdentifier === undefined
          ? {} : { currentPaymentIdentifier: header.currentPaymentIdentifier }),
        ...(header.currentEffectGeneration === undefined
          ? {} : { currentEffectGeneration: header.currentEffectGeneration }),
        historyCursor: history.isDone ? null : history.continueCursor,
        historyPageSize: HOSTED_PAID_OPERATION_HISTORY_PAGE_SIZE,
      },
      invocation: {
        ...control.control,
        prepared: source.prepared,
        ...(control.control.authority === undefined ? {} : { authority: control.control.authority }),
        ...(control.acceptedAuthority === undefined
          ? {} : { acceptedAuthority: control.acceptedAuthority }),
        attempts: attempts.map(({ _id, _creationTime, recordedAt, ...attempt }) => ({
          ...attempt,
          outcome: normalizeAttemptOutcome(attempt.outcome),
        })),
        observedResolution: source.observedResolution,
      },
      ...(payment === null ? {} : {
        paymentAttempt: {
          paymentIdentifier: payment.paymentIdentifier,
          custodyRef: `sha256:${payment.custodyReference.digest}`,
          ...(payment.settledCurrency === undefined || payment.settledAmountMinor === undefined
            ? {} : {
                settledAmount: {
                  currency: payment.settledCurrency,
                  amountMinor: payment.settledAmountMinor,
                },
              }),
          state: payment.state,
          evidenceRefs: evidenceReferences.map(
            (reference) => `sha256:${reference.evidenceReference.digest}`,
          ),
        },
      }),
      interpretation: {
        operation: {
          operationKey: source.operationKey,
          providerId: source.providerId,
          providerName: source.providerName,
          operationRevision: source.operationRevision,
          materialInputs: source.materialInputs,
        },
        presentation: source.presentation,
        maximumAuthorizedCharge: source.maximumAuthorizedCharge,
        queryRecipient: source.queryRecipient,
        resultDelivery: source.resultDelivery,
        environment: source.environment,
      },
      evidenceReferences: evidenceReferences.map(
        (reference) => `sha256:${reference.evidenceReference.digest}`,
      ),
      history: reconstructedHistory,
    }
    return { kind: 'loaded' as const, aggregate }
  },
})

/**
 * Source facts, payment preparation/submission posture, opaque evidence and
 * command CAS are committed in one transaction before an adapter may release.
 */
export const transact = internalMutation({
  args: {
    ownerPrincipalRef: v.string(),
    ownerCallerRef: v.string(),
    invocationRef: v.string(),
    commandId: v.string(),
    commandDigest: v.string(),
    expectedInvocationVersion: v.number(),
    expectedEffectGeneration: v.optional(v.number()),
    trustedObservationGuard: v.optional(trustedObservationGuard),
    nextInvocationVersion: v.number(),
    nextEffectGeneration: v.optional(v.number()),
    selectedSource: sourceRow,
    control: initialControl,
    currentAttempt: v.optional(currentAttempt),
    payment: v.optional(paymentRow),
    evidenceReferences: v.array(evidenceReferenceRow),
    submissionStarted: v.boolean(),
    releaseAdmission: v.boolean(),
    recordedAt: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.evidenceReferences.length > HOSTED_PAID_OPERATION_CHILD_CAP) {
      return { kind: 'refused' as const, code: 'aggregate_incomplete' as const }
    }
    if (!sourceMaterialSafe(args.selectedSource)
      || !sourceMaterialWithinCaps(args.selectedSource)) {
      return { kind: 'refused' as const, code: 'aggregate_incomplete' as const }
    }
    for (const reference of args.evidenceReferences) {
      if (!opaqueDigestValid(reference.evidenceReference.digest)) {
        return { kind: 'refused' as const, code: 'raw_material_forbidden' as const }
      }
    }
    if (args.payment !== undefined && !opaqueDigestValid(args.payment.custodyReference.digest)) {
      return { kind: 'refused' as const, code: 'raw_material_forbidden' as const }
    }
    if (args.submissionStarted && args.payment?.state !== 'possibly_submitted') {
      return { kind: 'refused' as const, code: 'submission_started_not_durable' as const }
    }
    if (args.releaseAdmission && !isAdmissionClosed(args.control.control)) {
      return { kind: 'refused' as const, code: 'admission_release_not_terminal' as const }
    }
    const header = await ctx.db.query('hostedPaidOperationHeaders')
      .withIndex('by_ownerPrincipalRef_and_invocationRef', (q) =>
        q.eq('ownerPrincipalRef', args.ownerPrincipalRef).eq('invocationRef', args.invocationRef))
      .unique()
    if (header === null) {
      return { kind: 'refused' as const, code: 'cross_principal_refused' as const }
    }
    const duplicate = await ctx.db.query('hostedPaidOperationCommands')
      .withIndex('by_invocationRef_and_commandId', (q) =>
        q.eq('invocationRef', args.invocationRef).eq('commandId', args.commandId))
      .unique()
    if (duplicate !== null && duplicate.commandDigest !== args.commandDigest) {
      return { kind: 'refused' as const, code: 'command_identity_conflict' as const }
    }
    if (duplicate !== null) {
      return {
        kind: 'duplicate' as const,
        invocationVersion: duplicate.invocationVersion,
        effectGeneration: duplicate.effectGeneration,
      }
    }
    if (header.invocationVersion !== args.expectedInvocationVersion
      || args.nextInvocationVersion <= header.invocationVersion) {
      return { kind: 'refused' as const, code: 'stale_invocation_version' as const }
    }
    if (args.expectedEffectGeneration !== undefined
      && header.currentEffectGeneration !== args.expectedEffectGeneration) {
      return { kind: 'refused' as const, code: 'effect_generation_stale' as const }
    }
    if (args.control.owner.principalRef !== args.ownerPrincipalRef) {
      return { kind: 'refused' as const, code: 'cross_principal_refused' as const }
    }
    const storedControl = await ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (q) => q.eq('invocationRef', args.invocationRef))
      .unique()
    if (storedControl === null) {
      return { kind: 'refused' as const, code: 'aggregate_incomplete' as const }
    }
    const observationGuard = args.trustedObservationGuard
    if (observationGuard !== undefined) {
      if (observationGuard.attemptRef !== storedControl.currentAttemptRef
        || observationGuard.effectGeneration !== storedControl.currentEffectGeneration
        || observationGuard.effectGeneration !== header.currentEffectGeneration
        || observationGuard.effectGeneration !== args.expectedEffectGeneration) {
        return { kind: 'refused' as const, code: 'trusted_observation_changed' as const }
      }
      const effect = await ctx.db.query('hostedPaidOperationMockEffects')
        .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (q) =>
          q.eq('invocationRef', args.invocationRef)
            .eq('attemptRef', observationGuard.attemptRef)
            .eq('effectGeneration', observationGuard.effectGeneration))
        .unique()
      const observationChanged = observationGuard.kind === 'mock_effect_absent'
        ? effect !== null
        : effect === null
          || canonicalDigest(mockEffectObservation(effect)) !== observationGuard.observationDigest
      if (observationChanged) {
        return { kind: 'refused' as const, code: 'trusted_observation_changed' as const }
      }
    }
    const admissionRelease = args.releaseAdmission
      ? await prepareAdmissionRelease(ctx, {
          reservationRef: header.admissionReservationRef,
          principalRef: args.ownerPrincipalRef,
        })
      : undefined
    if (admissionRelease?.kind === 'refused') return admissionRelease
    const currentAttemptWrite = args.currentAttempt
    const existingCurrentAttempt = currentAttemptWrite === undefined
      ? null
      : await ctx.db.query('actionInvocationAttempts')
        .withIndex('by_invocationRef_and_attemptRef', (q) =>
          q.eq('invocationRef', args.invocationRef)
            .eq('attemptRef', currentAttemptWrite.attemptRef))
        .unique()
    if (existingCurrentAttempt !== null && args.currentAttempt !== undefined
      && canonicalDigest({
        attemptNumber: existingCurrentAttempt.attemptNumber,
        actor: existingCurrentAttempt.actor,
        effectGeneration: existingCurrentAttempt.effectGeneration,
        idempotency: existingCurrentAttempt.idempotency,
        lease: existingCurrentAttempt.lease,
      }) !== canonicalDigest({
        attemptNumber: args.currentAttempt.attemptNumber,
        actor: args.currentAttempt.actor,
        effectGeneration: args.currentAttempt.effectGeneration,
        idempotency: args.currentAttempt.idempotency,
        lease: args.currentAttempt.lease,
      })) {
      return { kind: 'refused' as const, code: 'command_identity_conflict' as const }
    }

    const source = await ctx.db.query('hostedPaidOperationSources')
      .withIndex('by_invocationRef_and_sourceRef', (q) =>
        q.eq('invocationRef', args.invocationRef).eq('sourceRef', args.selectedSource.sourceRef))
      .unique()
    const sourceWrite = { invocationRef: args.invocationRef, ...args.selectedSource }
    if (source === null) await ctx.db.insert('hostedPaidOperationSources', sourceWrite)
    else await ctx.db.replace(source._id, sourceWrite)

    await ctx.db.replace(storedControl._id, {
      invocationRef: args.invocationRef,
      invocationVersion: args.nextInvocationVersion,
      control: {
        invocationRef: args.invocationRef,
        invocationVersion: args.nextInvocationVersion,
        environment: 'MOCK/DEVELOPMENT ONLY',
        persistence: 'durable_control',
        origin: args.control.origin,
        owner: args.control.owner,
        action: args.control.action,
        desired: args.control.desired,
        authority: args.control.authority,
        freshness: args.control.freshness,
        control: args.control.control,
      },
      sourceRef: args.selectedSource.sourceRef,
      preparedMaterialDigest: args.control.prepared.materialInputDigest,
      preparedTargetDigest: canonicalDigest(args.control.prepared.target),
      consequence: args.control.prepared.consequence,
      dataLimitSummary: args.control.prepared.dataUse.limits,
      authorityReference: args.control.authority.reference,
      ...(args.control.acceptedAuthority === undefined
        ? {}
        : { acceptedAuthority: args.control.acceptedAuthority }),
      ...(args.control.control.state === 'authorized'
        ? { authorityDecisionAt: args.control.control.decidedAt }
        : {}),
      ...(args.currentAttempt === undefined
        ? {}
        : {
            currentAttemptRef: args.currentAttempt.attemptRef,
            currentEffectGeneration: args.currentAttempt.effectGeneration,
            currentLeaseOwner: args.currentAttempt.lease.owner,
            currentLeaseExpiresAt: args.currentAttempt.lease.expiresAt,
          }),
      updatedAt: args.recordedAt,
    })

    if (args.currentAttempt !== undefined) {
      const attemptWrite = {
        invocationRef: args.invocationRef,
        ...args.currentAttempt,
        recordedAt: args.recordedAt,
      }
      if (existingCurrentAttempt === null) {
        await ctx.db.insert('actionInvocationAttempts', attemptWrite)
      } else {
        await ctx.db.replace(existingCurrentAttempt._id, attemptWrite)
      }
    }

    const paymentWriteInput = args.payment
    if (paymentWriteInput !== undefined) {
      const payment = await ctx.db.query('hostedPaidOperationPayments')
        .withIndex('by_invocationRef_and_paymentIdentifier', (q) =>
          q.eq('invocationRef', args.invocationRef)
            .eq('paymentIdentifier', paymentWriteInput.paymentIdentifier))
        .unique()
      const paymentWrite = {
        invocationRef: args.invocationRef,
        ...paymentWriteInput,
        updatedAt: args.recordedAt,
      }
      if (payment === null) await ctx.db.insert('hostedPaidOperationPayments', paymentWrite)
      else await ctx.db.replace(payment._id, paymentWrite)
    }
    for (const evidence of args.evidenceReferences) {
      await ctx.db.insert('hostedPaidOperationEvidenceReferences', {
        invocationRef: args.invocationRef,
        ...evidence,
        recordedAt: args.recordedAt,
      })
    }
    await ctx.db.patch(header._id, {
      invocationVersion: args.nextInvocationVersion,
      selectedSourceRef: args.selectedSource.sourceRef,
      currentPaymentIdentifier: args.payment?.paymentIdentifier,
      currentEffectGeneration: args.nextEffectGeneration,
      updatedAt: args.recordedAt,
    })
    await ctx.db.insert('hostedPaidOperationCommands', {
      invocationRef: args.invocationRef,
      commandId: args.commandId,
      commandDigest: args.commandDigest,
      invocationVersion: args.nextInvocationVersion,
      principalRef: args.ownerPrincipalRef,
      callerRef: args.ownerCallerRef,
      ...(args.nextEffectGeneration === undefined
        ? {} : { effectGeneration: args.nextEffectGeneration }),
      recordedAt: args.recordedAt,
    })
    if (admissionRelease?.kind === 'active') {
      await ctx.db.patch(admissionRelease.counterId, {
        active: admissionRelease.nextActive,
        updatedAt: args.recordedAt,
      })
      await ctx.db.patch(admissionRelease.reservationId, {
        state: 'released',
        updatedAt: args.recordedAt,
      })
    }
    return {
      kind: 'applied' as const,
      invocationVersion: args.nextInvocationVersion,
      effectGeneration: args.nextEffectGeneration,
    }
  },
})

export const reserveAdmission = internalMutation({
  args: {
    policyRef: v.string(),
    principalRef: v.string(),
    windowKey: v.string(),
    commandId: v.string(),
    recordedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const reservationRef = canonicalDigest({
      policyRef: args.policyRef,
      principalRef: args.principalRef,
      commandId: args.commandId,
    })
    const priorReservation = await ctx.db.query('hostedPaidOperationAdmissionReservations')
      .withIndex('by_reservationRef', (q) => q.eq('reservationRef', reservationRef))
      .unique()
    if (priorReservation !== null) {
      return {
        kind: 'admitted' as const,
        reservationRef,
        environment: {
          name: 'hosted-labelled-mock-sandbox-candidate' as const,
          evidenceClass: 'hosted_labelled_mock_candidate' as const,
          claimCeiling: 'pending_authenticated_exact_revision_readback' as const,
        },
      }
    }
    const policy = await ctx.db.query('hostedPaidOperationAdmissionPolicies')
      .withIndex('by_policyRef_and_principalRef', (q) =>
        q.eq('policyRef', args.policyRef).eq('principalRef', args.principalRef))
      .unique()
    if (policy === null || !policy.enabled
      || policy.policyDigest === undefined
      || policy.admissionEndsAt === undefined
      || Date.parse(args.recordedAt) >= Date.parse(policy.admissionEndsAt)) {
      return { kind: 'refused' as const, code: 'trial_disabled_or_not_allowlisted' as const }
    }
    const counter = await ctx.db.query('hostedPaidOperationAdmissionCounters')
      .withIndex('by_policyRef_and_principalRef', (q) =>
        q.eq('policyRef', args.policyRef)
          .eq('principalRef', args.principalRef))
      .unique()
    const current = counter ?? {
      currentWindowKey: args.windowKey,
      admittedTotal: 0,
      active: 0,
      admittedInWindow: 0,
    }
    const admittedInWindow = current.currentWindowKey === args.windowKey
      ? current.admittedInWindow
      : 0
    if (current.admittedTotal >= policy.totalLimit) {
      return { kind: 'refused' as const, code: 'total_exhausted' as const }
    }
    if (current.active >= policy.concurrencyLimit) {
      return { kind: 'refused' as const, code: 'concurrency_exhausted' as const }
    }
    if (admittedInWindow >= policy.rateLimit) {
      return { kind: 'refused' as const, code: 'rate_exhausted' as const }
    }
    const next = {
      policyRef: args.policyRef,
      principalRef: args.principalRef,
      policyDigest: policy.policyDigest,
      currentWindowKey: args.windowKey,
      admittedTotal: current.admittedTotal + 1,
      active: current.active + 1,
      admittedInWindow: admittedInWindow + 1,
      updatedAt: args.recordedAt,
    }
    if (counter === null) await ctx.db.insert('hostedPaidOperationAdmissionCounters', next)
    else await ctx.db.replace(counter._id, next)
    await ctx.db.insert('hostedPaidOperationAdmissionReservations', {
      reservationRef,
      policyRef: args.policyRef,
      principalRef: args.principalRef,
      policyDigest: policy.policyDigest,
      state: 'active',
      updatedAt: args.recordedAt,
    })
    return {
      kind: 'admitted' as const,
      reservationRef,
      environment: {
        name: 'hosted-labelled-mock-sandbox-candidate' as const,
        evidenceClass: 'hosted_labelled_mock_candidate' as const,
        claimCeiling: 'pending_authenticated_exact_revision_readback' as const,
      },
    }
  },
})

export const releaseAdmission = internalMutation({
  args: { reservationRef: v.string(), recordedAt: v.string() },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.query('hostedPaidOperationAdmissionReservations')
      .withIndex('by_reservationRef', (q) => q.eq('reservationRef', args.reservationRef))
      .unique()
    if (reservation === null) return { kind: 'refused' as const, code: 'reservation_not_found' as const }
    if (reservation.state === 'released') return { kind: 'duplicate' as const }
    const counter = await ctx.db.query('hostedPaidOperationAdmissionCounters')
      .withIndex('by_policyRef_and_principalRef', (q) =>
        q.eq('policyRef', reservation.policyRef).eq('principalRef', reservation.principalRef))
      .unique()
    if (counter === null || counter.active < 1) {
      return { kind: 'refused' as const, code: 'admission_counter_inconsistent' as const }
    }
    await ctx.db.patch(counter._id, { active: counter.active - 1, updatedAt: args.recordedAt })
    await ctx.db.patch(reservation._id, { state: 'released', updatedAt: args.recordedAt })
    return { kind: 'released' as const }
  },
})

export const checkAdmissionForInvocation = internalQuery({
  args: {
    principalRef: v.string(),
    callerRef: v.string(),
    invocationRef: v.string(),
  },
  handler: async (ctx, args) => {
    const header = await ctx.db.query('hostedPaidOperationHeaders')
      .withIndex('by_ownerPrincipalRef_and_invocationRef', (q) =>
        q.eq('ownerPrincipalRef', args.principalRef).eq('invocationRef', args.invocationRef))
      .unique()
    if (header === null) {
      return { kind: 'refused' as const, code: 'invocation_not_found' as const }
    }
    const reservation = await ctx.db.query('hostedPaidOperationAdmissionReservations')
      .withIndex('by_reservationRef', (q) =>
        q.eq('reservationRef', header.admissionReservationRef))
      .unique()
    if (reservation === null
      || reservation.principalRef !== args.principalRef
      || reservation.state !== 'active') {
      return { kind: 'refused' as const, code: 'trial_admission_inactive' as const }
    }
    const policy = await ctx.db.query('hostedPaidOperationAdmissionPolicies')
      .withIndex('by_policyRef_and_principalRef', (q) =>
        q.eq('policyRef', reservation.policyRef).eq('principalRef', args.principalRef))
      .unique()
    const counter = await ctx.db.query('hostedPaidOperationAdmissionCounters')
      .withIndex('by_policyRef_and_principalRef', (q) =>
        q.eq('policyRef', reservation.policyRef).eq('principalRef', args.principalRef))
      .unique()
    const admissionEndsAt = canonicalIsoTimestamp(policy?.admissionEndsAt)
    return policy?.enabled === true
      && admissionEndsAt !== undefined
      && Date.now() < admissionEndsAt
      && admissionCounterExact(policy, reservation, counter)
      ? { kind: 'active' as const, reservationRef: reservation.reservationRef }
      : { kind: 'refused' as const, code: 'trial_disabled' as const }
  },
})

/**
 * The labelled mock effect is the insertion of this source-owned row. Policy,
 * current authority, reservation, attempt and payment lineage are rechecked in
 * the same transaction, and the compound index makes replay idempotent.
 */
export const recordMockEffect = internalMutation({
  args: {
    principalRef: v.string(),
    callerRef: v.string(),
    invocationRef: v.string(),
    attemptRef: v.string(),
    effectGeneration: v.number(),
    recordedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const header = await ctx.db.query('hostedPaidOperationHeaders')
      .withIndex('by_ownerPrincipalRef_and_invocationRef', (q) =>
        q.eq('ownerPrincipalRef', args.principalRef).eq('invocationRef', args.invocationRef))
      .unique()
    if (header === null) {
      return { kind: 'refused' as const, code: 'invocation_not_found' as const }
    }
    const control = await ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (q) => q.eq('invocationRef', args.invocationRef))
      .unique()
    const attempt = await ctx.db.query('actionInvocationAttempts')
      .withIndex('by_invocationRef_and_attemptRef', (q) =>
        q.eq('invocationRef', args.invocationRef).eq('attemptRef', args.attemptRef))
      .unique()
    const source = await ctx.db.query('hostedPaidOperationSources')
      .withIndex('by_invocationRef_and_sourceRef', (q) =>
        q.eq('invocationRef', args.invocationRef).eq('sourceRef', header.selectedSourceRef))
      .unique()
    const paymentIdentifier = header.currentPaymentIdentifier
    const payment = paymentIdentifier === undefined
      ? null
      : await ctx.db.query('hostedPaidOperationPayments')
        .withIndex('by_invocationRef_and_paymentIdentifier', (q) =>
          q.eq('invocationRef', args.invocationRef)
            .eq('paymentIdentifier', paymentIdentifier))
        .unique()
    if (control === null
      || attempt === null
      || source === null
      || payment === null
      || header.currentEffectGeneration !== args.effectGeneration
      || control.currentAttemptRef !== args.attemptRef
      || control.currentEffectGeneration !== args.effectGeneration
      || !currentAuthorityAccepted(control)
      || control.control.control.state !== 'reconciliation_required'
      || attempt.effectGeneration !== args.effectGeneration
      || attempt.release.state !== 'possibly_released'
      || payment.attemptRef !== args.attemptRef
      || payment.effectGeneration !== args.effectGeneration) {
      return { kind: 'refused' as const, code: 'effect_lineage_not_current' as const }
    }
    const existing = await ctx.db.query('hostedPaidOperationMockEffects')
      .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (q) =>
        q.eq('invocationRef', args.invocationRef)
          .eq('attemptRef', args.attemptRef)
          .eq('effectGeneration', args.effectGeneration))
      .unique()
    if (existing !== null) {
      return {
        kind: 'duplicate' as const,
        observation: mockEffectObservation(existing),
      }
    }
    const reservation = await ctx.db.query('hostedPaidOperationAdmissionReservations')
      .withIndex('by_reservationRef', (q) =>
        q.eq('reservationRef', header.admissionReservationRef))
      .unique()
    const policy = reservation === null
      ? null
      : await ctx.db.query('hostedPaidOperationAdmissionPolicies')
        .withIndex('by_policyRef_and_principalRef', (q) =>
          q.eq('policyRef', reservation.policyRef).eq('principalRef', args.principalRef))
        .unique()
    const counter = reservation === null
      ? null
      : await ctx.db.query('hostedPaidOperationAdmissionCounters')
        .withIndex('by_policyRef_and_principalRef', (q) =>
          q.eq('policyRef', reservation.policyRef).eq('principalRef', args.principalRef))
        .unique()
    const effectRecordedAt = canonicalIsoTimestamp(args.recordedAt)
    const admissionEndsAt = canonicalIsoTimestamp(policy?.admissionEndsAt)
    if (reservation === null
      || reservation.principalRef !== args.principalRef
      || reservation.state !== 'active'
      || policy?.enabled !== true
      || effectRecordedAt === undefined
      || admissionEndsAt === undefined
      || Date.now() >= admissionEndsAt
      || !admissionCounterExact(policy, reservation, counter)) {
      return { kind: 'refused' as const, code: 'trial_disabled_or_inactive' as const }
    }
    const row = {
      invocationRef: args.invocationRef,
      attemptRef: args.attemptRef,
      effectGeneration: args.effectGeneration,
      providerId: source.providerId,
      operationKey: source.operationKey,
      operationRevision: source.operationRevision,
      paymentIdentifier: payment.paymentIdentifier,
      effect: 'released' as const,
      payment: 'settled' as const,
      delivery: source.providerId === 'provider:b'
        ? 'response_lost' as const
        : 'returned' as const,
      resultKind: 'hosted_sandbox_succeeded',
      recordedAt: args.recordedAt,
    }
    await ctx.db.insert('hostedPaidOperationMockEffects', row)
    return {
      kind: 'recorded' as const,
      observation: mockEffectObservation(row),
    }
  },
})

export const configurePhase3CAdmission = internalMutation({
  args: {
    evaluatorPrincipalRef: v.string(),
    sourceRevision: v.string(),
    totalLimit: v.number(),
    concurrencyLimit: v.number(),
    rateLimit: v.number(),
    admissionEndsAt: v.string(),
    retainThrough: v.string(),
    killSwitchOwner: v.string(),
    recordedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const recordedAt = canonicalIsoTimestamp(args.recordedAt)
    const admissionEndsAt = canonicalIsoTimestamp(args.admissionEndsAt)
    const retainThrough = canonicalIsoTimestamp(args.retainThrough)
    if (!/^[0-9a-f]{40}$/u.test(args.sourceRevision)
      || args.evaluatorPrincipalRef.trim() === ''
      || args.killSwitchOwner.trim() === ''
      || recordedAt === undefined
      || admissionEndsAt === undefined
      || retainThrough === undefined
      || !(recordedAt < admissionEndsAt && admissionEndsAt <= retainThrough)
      || !Number.isSafeInteger(args.totalLimit) || args.totalLimit < 1 || args.totalLimit > 3
      || args.concurrencyLimit !== 1
      || !Number.isSafeInteger(args.rateLimit) || args.rateLimit < 1 || args.rateLimit > 3) {
      return { kind: 'refused' as const, code: 'policy_invalid' as const }
    }
    const policyDigest = canonicalDigest({ policyRef: PHASE3C_POLICY_REF, ...args })
    const policies = await ctx.db.query('hostedPaidOperationAdmissionPolicies')
      .withIndex('by_policyRef', (q) => q.eq('policyRef', PHASE3C_POLICY_REF))
      .take(2)
    const existing = policies[0] ?? null
    if (policies.length > 1
      || (existing !== null && existing.principalRef !== args.evaluatorPrincipalRef)) {
      return { kind: 'refused' as const, code: 'policy_conflict' as const }
    }
    if (existing?.policyDigest === policyDigest) return { kind: 'configured' as const, policyDigest }
    const counter = await ctx.db.query('hostedPaidOperationAdmissionCounters')
      .withIndex('by_policyRef_and_principalRef', (q) =>
        q.eq('policyRef', PHASE3C_POLICY_REF).eq('principalRef', args.evaluatorPrincipalRef))
      .unique()
    if (existing !== null || counter !== null) {
      return { kind: 'refused' as const, code: 'policy_conflict' as const }
    }
    await ctx.db.insert('hostedPaidOperationAdmissionPolicies', {
      policyRef: PHASE3C_POLICY_REF,
      enabled: true,
      principalRef: args.evaluatorPrincipalRef,
      totalLimit: args.totalLimit,
      concurrencyLimit: 1,
      rateLimit: args.rateLimit,
      policyDigest,
      sourceRevision: args.sourceRevision,
      admissionEndsAt: args.admissionEndsAt,
      retainThrough: args.retainThrough,
      killSwitchOwner: args.killSwitchOwner,
      recordedAt: args.recordedAt,
    })
    return { kind: 'configured' as const, policyDigest }
  },
})

export const disablePhase3CAdmission = internalMutation({
  args: { evaluatorPrincipalRef: v.string(), policyDigest: v.string(), killSwitchOwner: v.string() },
  handler: async (ctx, args) => {
    const policy = await ctx.db.query('hostedPaidOperationAdmissionPolicies')
      .withIndex('by_policyRef_and_principalRef', (q) =>
        q.eq('policyRef', PHASE3C_POLICY_REF).eq('principalRef', args.evaluatorPrincipalRef))
      .unique()
    if (policy === null || policy.policyDigest !== args.policyDigest
      || policy.killSwitchOwner !== args.killSwitchOwner) {
      return { kind: 'refused' as const, code: 'policy_disable_mismatch' as const }
    }
    if (!policy.enabled) return { kind: 'disabled' as const, policyDigest: args.policyDigest }
    await ctx.db.patch(policy._id, { enabled: false })
    return { kind: 'disabled' as const, policyDigest: args.policyDigest }
  },
})

export const phase3CAdmissionStatus = internalQuery({
  args: { evaluatorPrincipalRef: v.string() },
  handler: async (ctx, args) => {
    const policy = await ctx.db.query('hostedPaidOperationAdmissionPolicies')
      .withIndex('by_policyRef_and_principalRef', (q) =>
        q.eq('policyRef', PHASE3C_POLICY_REF).eq('principalRef', args.evaluatorPrincipalRef))
      .unique()
    if (policy === null) return { kind: 'unconfigured' as const }
    const counter = await ctx.db.query('hostedPaidOperationAdmissionCounters')
      .withIndex('by_policyRef_and_principalRef', (q) =>
        q.eq('policyRef', PHASE3C_POLICY_REF).eq('principalRef', args.evaluatorPrincipalRef))
      .unique()
    return {
      kind: 'configured' as const,
      policyDigest: policy.policyDigest,
      sourceRevision: policy.sourceRevision,
      state: policy.enabled ? 'enabled' as const : 'disabled' as const,
      bounds: { total: policy.totalLimit, concurrency: policy.concurrencyLimit, rate: policy.rateLimit },
      admissionEndsAt: policy.admissionEndsAt,
      retainThrough: policy.retainThrough,
      counters: counter === null
        ? { admittedTotal: 0, activeReservations: 0, admittedInWindow: 0 }
        : {
            admittedTotal: counter.admittedTotal,
            activeReservations: counter.active,
            admittedInWindow: counter.admittedInWindow,
          },
    }
  },
})

/**
 * One operator-only proof observation for the exact declared trial rows.
 * Every growing child set is enumerated by invocation-prefix index under the
 * shared cap-plus-one rule. Returned identities and command/effect references
 * are digests; custody, evidence material, provider responses and credentials
 * never leave this owner.
 */
export const phase3CHostedProofObservation = internalQuery({
  args: { invocationRefs: v.array(v.string()) },
  handler: async (ctx, args) => {
    const invocationRefs = args.invocationRefs
    if (invocationRefs.length < 1
      || invocationRefs.length > 3
      || new Set(invocationRefs).size !== invocationRefs.length
      || invocationRefs.some((invocationRef) => invocationRef.trim() === '')) {
      return { kind: 'refused' as const, code: 'invocation_ref_count_invalid' as const }
    }

    const policies = await ctx.db.query('hostedPaidOperationAdmissionPolicies')
      .withIndex('by_policyRef', (q) => q.eq('policyRef', PHASE3C_POLICY_REF))
      .take(2)
    if (policies.length !== 1) {
      return { kind: 'refused' as const, code: 'proof_policy_not_exact' as const }
    }
    const policy = policies[0]!
    if (policy.policyDigest === undefined
      || policy.sourceRevision === undefined
      || policy.admissionEndsAt === undefined
      || policy.retainThrough === undefined
      || policy.killSwitchOwner === undefined) {
      return { kind: 'refused' as const, code: 'proof_rows_inconsistent' as const }
    }
    const counter = await ctx.db.query('hostedPaidOperationAdmissionCounters')
      .withIndex('by_policyRef_and_principalRef', (q) =>
        q.eq('policyRef', PHASE3C_POLICY_REF).eq('principalRef', policy.principalRef))
      .unique()
    if (counter === null) {
      return { kind: 'refused' as const, code: 'proof_row_missing' as const }
    }

    const invocations: StableHashValue[] = []
    let activeReservations = 0
    for (const invocationRef of invocationRefs) {
      const header = await ctx.db.query('hostedPaidOperationHeaders')
        .withIndex('by_invocationRef', (q) => q.eq('invocationRef', invocationRef))
        .unique()
      if (header === null) {
        return { kind: 'refused' as const, code: 'proof_row_missing' as const }
      }
      const source = await ctx.db.query('hostedPaidOperationSources')
        .withIndex('by_invocationRef_and_sourceRef', (q) =>
          q.eq('invocationRef', invocationRef).eq('sourceRef', header.selectedSourceRef))
        .unique()
      const control = await ctx.db.query('actionInvocationControls')
        .withIndex('by_invocationRef', (q) => q.eq('invocationRef', invocationRef))
        .unique()
      const attempts = await ctx.db.query('actionInvocationAttempts')
        .withIndex('by_invocationRef_and_attemptNumber', (q) =>
          q.eq('invocationRef', invocationRef))
        .take(HOSTED_PAID_OPERATION_CHILD_CAP + 1)
      const commands = await ctx.db.query('hostedPaidOperationCommands')
        .withIndex('by_invocationRef_and_commandId', (q) =>
          q.eq('invocationRef', invocationRef))
        .take(HOSTED_PAID_OPERATION_CHILD_CAP + 1)
      const effects = await ctx.db.query('hostedPaidOperationMockEffects')
        .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (q) =>
          q.eq('invocationRef', invocationRef))
        .take(HOSTED_PAID_OPERATION_CHILD_CAP + 1)
      const evidenceRows = await ctx.db.query('hostedPaidOperationEvidenceReferences')
        .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (q) =>
          q.eq('invocationRef', invocationRef))
        .take(HOSTED_PAID_OPERATION_CHILD_CAP + 1)
      const payment = header.currentPaymentIdentifier === undefined
        ? null
        : await ctx.db.query('hostedPaidOperationPayments')
          .withIndex('by_invocationRef_and_paymentIdentifier', (q) =>
            q.eq('invocationRef', invocationRef)
              .eq('paymentIdentifier', header.currentPaymentIdentifier!))
          .unique()
      const reservation = await ctx.db.query('hostedPaidOperationAdmissionReservations')
        .withIndex('by_reservationRef', (q) =>
          q.eq('reservationRef', header.admissionReservationRef))
        .unique()

      if (attempts.length > HOSTED_PAID_OPERATION_CHILD_CAP
        || commands.length > HOSTED_PAID_OPERATION_CHILD_CAP
        || effects.length > HOSTED_PAID_OPERATION_CHILD_CAP
        || evidenceRows.length > HOSTED_PAID_OPERATION_CHILD_CAP) {
        return { kind: 'refused' as const, code: 'proof_child_cap_exceeded' as const }
      }
      if (source === null || control === null || payment === null || reservation === null) {
        return { kind: 'refused' as const, code: 'proof_row_missing' as const }
      }

      const attemptKeys = new Set(attempts.map(
        (attempt) => `${attempt.attemptRef}\u0000${attempt.effectGeneration}`,
      ))
      const rowsConsistent = header.ownerPrincipalRef === policy.principalRef
        && header.invocationVersion === control.invocationVersion
        && control.control.owner.principalRef === policy.principalRef
        && control.sourceRef === source.sourceRef
        && source.prepared.target.providerId === source.providerId
        && source.prepared.target.sourceRef === source.sourceRef
        && source.prepared.target.operationRevision === source.operationRevision
        && reservation.policyRef === policy.policyRef
        && reservation.principalRef === policy.principalRef
        && reservation.policyDigest === policy.policyDigest
        && counter.policyDigest === policy.policyDigest
        && commands.every((command) =>
          command.principalRef === undefined || command.principalRef === policy.principalRef)
        && effects.every((effect) =>
          attemptKeys.has(`${effect.attemptRef}\u0000${effect.effectGeneration}`)
          && effect.providerId === source.providerId
          && effect.operationKey === source.operationKey
          && effect.operationRevision === source.operationRevision)
        && evidenceRows.every((evidence) =>
          attemptKeys.has(`${evidence.attemptRef}\u0000${evidence.effectGeneration}`))
        && (control.currentAttemptRef === undefined
          ? header.currentEffectGeneration === undefined
          : attemptKeys.has(
              `${control.currentAttemptRef}\u0000${control.currentEffectGeneration ?? -1}`,
            )
            && control.currentEffectGeneration === header.currentEffectGeneration)
        && (control.currentAttemptRef === undefined
          || payment.attemptRef === control.currentAttemptRef)
        && (control.currentEffectGeneration === undefined
          || payment.effectGeneration === control.currentEffectGeneration)
      if (!rowsConsistent) {
        return { kind: 'refused' as const, code: 'proof_rows_inconsistent' as const }
      }
      if (reservation.state === 'active') activeReservations += 1

      const commandsObserved = commands
        .map((command) => ({
          commandIdentityDigest: proofReferenceDigest('command', {
            commandId: command.commandId,
            commandDigest: command.commandDigest,
          }),
          commandIdDigest: proofReferenceDigest('command-id', command.commandId),
          invocationVersion: command.invocationVersion,
          ...(command.effectGeneration === undefined
            ? {}
            : { effectGeneration: command.effectGeneration }),
          principalDigest: command.principalRef === undefined
            ? null
            : proofReferenceDigest('principal', command.principalRef),
          callerDigest: command.callerRef === undefined
            ? null
            : proofReferenceDigest('caller', command.callerRef),
        }))
        .sort((left, right) =>
          left.invocationVersion - right.invocationVersion
          || left.commandIdentityDigest.localeCompare(right.commandIdentityDigest))
      const attemptsObserved = attempts
        .map((attempt) => ({
          attemptIdentityDigest: proofReferenceDigest('attempt', attempt.attemptRef),
          attemptNumber: attempt.attemptNumber,
          effectGeneration: attempt.effectGeneration,
          actorPrincipalDigest: proofReferenceDigest('principal', attempt.actor.principalRef),
          actorCallerDigest: proofReferenceDigest('caller', attempt.actor.callerRef),
          release: attempt.release.state,
          outcome: attempt.outcome.state,
        }))
        .sort((left, right) =>
          left.attemptNumber - right.attemptNumber
          || left.attemptIdentityDigest.localeCompare(right.attemptIdentityDigest))
      const effectsObserved = effects
        .map((effect) => ({
          observationDigest: canonicalDigest({
            invocationRef,
            attemptRef: effect.attemptRef,
            effectGeneration: effect.effectGeneration,
            providerId: effect.providerId,
            operationKey: effect.operationKey,
            operationRevision: effect.operationRevision,
            paymentIdentifier: effect.paymentIdentifier,
            effect: effect.effect,
            payment: effect.payment,
            delivery: effect.delivery,
            resultKind: effect.resultKind,
            recordedAt: effect.recordedAt,
          }),
          attemptIdentityDigest: proofReferenceDigest('attempt', effect.attemptRef),
          effectGeneration: effect.effectGeneration,
          providerId: effect.providerId,
          operationKey: effect.operationKey,
          operationRevision: effect.operationRevision,
          effect: effect.effect,
          payment: effect.payment,
          delivery: effect.delivery,
        }))
        .sort((left, right) =>
          left.effectGeneration - right.effectGeneration
          || left.observationDigest.localeCompare(right.observationDigest))
      const invocation = {
        invocationRef,
        ownerPrincipalDigest: proofReferenceDigest('principal', header.ownerPrincipalRef),
        ownerCallerDigest: proofReferenceDigest('caller', header.ownerCallerRef),
        invocationVersion: header.invocationVersion,
        providerId: source.providerId,
        operationKey: source.operationKey,
        operationRevision: source.operationRevision,
        environment: source.environment,
        currentTruth: {
          control: control.control.control.state,
          payment: payment.state,
          delivery: source.resultDelivery.state,
          observedResolution: source.observedResolution.state,
        },
        reservation: {
          state: reservation.state,
          reservationDigest: proofReferenceDigest('reservation', reservation.reservationRef),
        },
        counts: {
          commands: commandsObserved.length,
          attempts: attemptsObserved.length,
          effects: effectsObserved.length,
          evidenceReferences: evidenceRows.length,
          effectGenerations: new Set(effects.map((effect) => effect.effectGeneration)).size,
        },
        commands: commandsObserved,
        attempts: attemptsObserved,
        effects: effectsObserved,
      }
      invocations.push({
        ...invocation,
        observationDigest: canonicalDigest(invocation),
      })
    }

    if (counter.admittedTotal !== invocationRefs.length
      || counter.active !== activeReservations
      || counter.admittedInWindow < 0
      || counter.admittedInWindow > policy.rateLimit
      || counter.admittedTotal > policy.totalLimit
      || counter.active > policy.concurrencyLimit) {
      return { kind: 'refused' as const, code: 'proof_rows_inconsistent' as const }
    }
    const observation = {
      schema: 'phase3c-paid-operation-proof-observation:v1' as const,
      policy: {
        policyRef: policy.policyRef,
        enabled: policy.enabled,
        policyDigest: policy.policyDigest,
        sourceRevision: policy.sourceRevision,
        principalDigest: proofReferenceDigest('principal', policy.principalRef),
        bounds: {
          total: policy.totalLimit,
          concurrency: policy.concurrencyLimit,
          rate: policy.rateLimit,
        },
        admissionEndsAt: policy.admissionEndsAt,
        retainThrough: policy.retainThrough,
        killSwitchOwnerDigest: proofReferenceDigest(
          'kill-switch-owner',
          policy.killSwitchOwner,
        ),
      },
      counters: {
        admittedTotal: counter.admittedTotal,
        activeReservations: counter.active,
        admittedInWindow: counter.admittedInWindow,
      },
      invocations,
    }
    return {
      kind: 'observed' as const,
      ...observation,
      observationDigest: canonicalDigest(observation),
    }
  },
})

export const readMockEffectObservation = internalQuery({
  args: {
    principalRef: v.string(),
    callerRef: v.string(),
    invocationRef: v.string(),
    attemptRef: v.string(),
    effectGeneration: v.number(),
  },
  handler: async (ctx, args) => {
    const header = await ctx.db.query('hostedPaidOperationHeaders')
      .withIndex('by_ownerPrincipalRef_and_invocationRef', (q) =>
        q.eq('ownerPrincipalRef', args.principalRef).eq('invocationRef', args.invocationRef))
      .unique()
    if (header === null) {
      return { kind: 'refused' as const, code: 'invocation_not_found' as const }
    }
    const attempt = await ctx.db.query('actionInvocationAttempts')
      .withIndex('by_invocationRef_and_attemptRef', (q) =>
        q.eq('invocationRef', args.invocationRef).eq('attemptRef', args.attemptRef))
      .unique()
    if (attempt === null || attempt.effectGeneration !== args.effectGeneration) {
      return { kind: 'refused' as const, code: 'effect_lineage_not_found' as const }
    }
    const effect = await ctx.db.query('hostedPaidOperationMockEffects')
      .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (q) =>
        q.eq('invocationRef', args.invocationRef)
          .eq('attemptRef', args.attemptRef)
          .eq('effectGeneration', args.effectGeneration))
      .unique()
    return effect === null
      ? {
          kind: 'observed' as const,
          observation: {
            effect: 'not_released' as const,
            payment: 'not_submitted' as const,
            recordedAt: args.effectGeneration > 0 ? attempt.recordedAt : header.updatedAt,
          },
        }
      : { kind: 'observed' as const, observation: mockEffectObservation(effect) }
  },
})

function canonicalIsoTimestamp(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    return undefined
  }
  return timestamp
}

function admissionCounterExact(
  policy: Readonly<{
    policyDigest?: string
    totalLimit: number
    concurrencyLimit: number
    rateLimit: number
  }>,
  reservation: Readonly<{ policyDigest?: string }>,
  counter: Readonly<{
    policyDigest?: string
    admittedTotal: number
    active: number
    admittedInWindow: number
  }> | null,
): boolean {
  return policy.policyDigest !== undefined
    && reservation.policyDigest === policy.policyDigest
    && counter !== null
    && counter.policyDigest === policy.policyDigest
    && policy.concurrencyLimit === 1
    && Number.isSafeInteger(counter.admittedTotal)
    && counter.admittedTotal >= 1
    && counter.admittedTotal <= policy.totalLimit
    && Number.isSafeInteger(counter.active)
    && counter.active === 1
    && Number.isSafeInteger(counter.admittedInWindow)
    && counter.admittedInWindow >= 1
    && counter.admittedInWindow <= policy.rateLimit
}

function isAdmissionClosed(control: Readonly<{ state: string; reason?: string }>): boolean {
  return control.state === 'terminal'
    || control.state === 'cancelled'
    || (control.state === 'invalidated' && control.reason === 'authority_not_accepted')
}

function currentAuthorityAccepted(control: Readonly<{
  authorityReference?: string
  acceptedAuthority?:
    | Readonly<{ kind: 'approve_each'; authorityRef: string }>
    | Readonly<{ kind: 'standing_mandate_use' }>
}>): boolean {
  return control.authorityReference !== undefined
    && control.acceptedAuthority?.kind === 'approve_each'
    && control.acceptedAuthority.authorityRef === control.authorityReference
}

function mockEffectObservation(row: Readonly<{
  providerId: string
  operationKey: string
  operationRevision: string
  paymentIdentifier: string
  effect: 'released'
  payment: 'settled'
  delivery: 'returned' | 'response_lost'
  resultKind: string
  recordedAt: string
}>) {
  return {
    providerId: row.providerId,
    operationKey: row.operationKey,
    operationRevision: row.operationRevision,
    paymentIdentifier: row.paymentIdentifier,
    effect: row.effect,
    payment: row.payment,
    delivery: row.delivery,
    resultKind: row.resultKind,
    recordedAt: row.recordedAt,
  }
}

async function prepareAdmissionRelease(
  ctx: MutationCtx,
  input: Readonly<{ reservationRef: string; principalRef: string }>,
) {
  const reservation = await ctx.db.query('hostedPaidOperationAdmissionReservations')
    .withIndex('by_reservationRef', (q) => q.eq('reservationRef', input.reservationRef))
    .unique()
  if (reservation === null || reservation.principalRef !== input.principalRef) {
    return { kind: 'refused' as const, code: 'admission_reservation_invalid' as const }
  }
  if (reservation.state === 'released') return { kind: 'duplicate' as const }
  const counter = await ctx.db.query('hostedPaidOperationAdmissionCounters')
    .withIndex('by_policyRef_and_principalRef', (q) =>
      q.eq('policyRef', reservation.policyRef).eq('principalRef', reservation.principalRef))
    .unique()
  if (counter === null || counter.active < 1) {
    return { kind: 'refused' as const, code: 'admission_counter_inconsistent' as const }
  }
  return {
    kind: 'active' as const,
    reservationId: reservation._id,
    counterId: counter._id,
    nextActive: counter.active - 1,
  }
}

function proofReferenceDigest(kind: string, value: StableHashValue): string {
  return canonicalDigest({ kind, value })
}

function opaqueDigestValid(digest: string): boolean {
  return /^[a-f0-9]{64}$/u.test(digest)
}

function sourceMaterialSafe(source: {
  presentation: { title: string; summary: string; blocks: readonly unknown[] }
  resultDelivery: { state: string }
}): boolean {
  return !/(?:^Bearer\s|secret[-_:]|private[-_ ]?key|raw[-_ ]?(?:payload|evidence|response))/iu
    .test(JSON.stringify(source))
}

function sourceMaterialWithinCaps(source: {
  prepared: { dataUse: { fields: readonly string[] } }
  presentation: { blocks: readonly unknown[] }
  resultDelivery:
    | { state: 'not_delivered' }
    | { state: 'invalid'; evidenceRefs: readonly string[] }
    | { state: 'valid'; blocks: readonly unknown[]; evidenceRefs: readonly string[] }
}): boolean {
  if (source.prepared.dataUse.fields.length > HOSTED_PAID_OPERATION_CHILD_CAP
    || source.presentation.blocks.length > HOSTED_PAID_OPERATION_CHILD_CAP) {
    return false
  }
  if (source.resultDelivery.state === 'not_delivered') return true
  if (source.resultDelivery.evidenceRefs.length > HOSTED_PAID_OPERATION_CHILD_CAP) return false
  return source.resultDelivery.state !== 'valid'
    || source.resultDelivery.blocks.length <= HOSTED_PAID_OPERATION_CHILD_CAP
}

function normalizeAttemptOutcome(outcome: {
  state: string
  errorDigest?: string
  message?: string
  [key: string]: unknown
}) {
  const { errorDigest: _errorDigest, ...rest } = outcome
  if ((outcome.state === 'failed' || outcome.state === 'uncertain')
    && outcome.message === undefined) {
    return { ...rest, message: 'source_error_digest_recorded' }
  }
  return rest
}
