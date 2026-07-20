import { makeFunctionReference, paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  HOSTED_PAID_OPERATION_CHILD_CAP,
  HOSTED_PAID_OPERATION_HISTORY_PAGE_SIZE,
} from '../src/modules/action-invocation/hosted-paid-operation-port'
import {
  acceptedAuthorityValue,
  actionInvocationOriginValue,
  invocationActorValue,
  invocationControlValue,
  invocationFreshnessValue,
} from '../src/modules/action-invocation/internal/convex-schema'
import { internalMutation, internalQuery } from './_generated/server'
import { mutation, query } from './_generated/server'
const internalLoadComplete = makeFunctionReference<'query'>('hostedPaidOperation:loadComplete')
const internalCreateInitial = makeFunctionReference<'mutation'>('hostedPaidOperation:createInitial')
const internalTransact = makeFunctionReference<'mutation'>('hostedPaidOperation:transact')
const internalReserveAdmission = makeFunctionReference<'mutation'>('hostedPaidOperation:reserveAdmission')

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

    await ctx.db.insert('hostedPaidOperationHeaders', {
      ownerPrincipalRef: args.control.owner.principalRef,
      ownerCallerRef: args.control.owner.callerRef,
      invocationRef: args.invocationRef,
      invocationVersion: args.invocationVersion,
      selectedSourceRef: args.selectedSource.sourceRef,
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
    if (header === null || header.ownerCallerRef !== args.ownerCallerRef) {
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
    const payment = header.currentPaymentIdentifier === undefined
      ? null
      : await ctx.db.query('hostedPaidOperationPayments')
        .withIndex('by_invocationRef_and_paymentIdentifier', (q) =>
          q.eq('invocationRef', args.invocationRef)
            .eq('paymentIdentifier', header.currentPaymentIdentifier!))
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
    nextInvocationVersion: v.number(),
    nextEffectGeneration: v.optional(v.number()),
    selectedSource: sourceRow,
    payment: v.optional(paymentRow),
    evidenceReferences: v.array(evidenceReferenceRow),
    submissionStarted: v.boolean(),
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
    const header = await ctx.db.query('hostedPaidOperationHeaders')
      .withIndex('by_ownerPrincipalRef_and_invocationRef', (q) =>
        q.eq('ownerPrincipalRef', args.ownerPrincipalRef).eq('invocationRef', args.invocationRef))
      .unique()
    if (header === null || header.ownerCallerRef !== args.ownerCallerRef) {
      return { kind: 'refused' as const, code: 'cross_principal_refused' as const }
    }
    if (header.invocationVersion !== args.expectedInvocationVersion
      || args.nextInvocationVersion <= header.invocationVersion) {
      return { kind: 'refused' as const, code: 'stale_invocation_version' as const }
    }
    if (args.expectedEffectGeneration !== undefined
      && header.currentEffectGeneration !== args.expectedEffectGeneration) {
      return { kind: 'refused' as const, code: 'effect_generation_stale' as const }
    }

    const source = await ctx.db.query('hostedPaidOperationSources')
      .withIndex('by_invocationRef_and_sourceRef', (q) =>
        q.eq('invocationRef', args.invocationRef).eq('sourceRef', args.selectedSource.sourceRef))
      .unique()
    const sourceWrite = { invocationRef: args.invocationRef, ...args.selectedSource }
    if (source === null) await ctx.db.insert('hostedPaidOperationSources', sourceWrite)
    else await ctx.db.replace(source._id, sourceWrite)

    if (args.payment !== undefined) {
      const payment = await ctx.db.query('hostedPaidOperationPayments')
        .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (q) =>
          q.eq('invocationRef', args.invocationRef)
            .eq('attemptRef', args.payment!.attemptRef)
            .eq('effectGeneration', args.payment!.effectGeneration))
        .unique()
      const paymentWrite = { invocationRef: args.invocationRef, ...args.payment, updatedAt: args.recordedAt }
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
      ...(args.nextEffectGeneration === undefined
        ? {} : { effectGeneration: args.nextEffectGeneration }),
      recordedAt: args.recordedAt,
    })
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
      return { kind: 'admitted' as const, reservationRef }
    }
    const policy = await ctx.db.query('hostedPaidOperationAdmissionPolicies')
      .withIndex('by_policyRef_and_principalRef', (q) =>
        q.eq('policyRef', args.policyRef).eq('principalRef', args.principalRef))
      .unique()
    if (policy === null || !policy.enabled) {
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
      state: 'active',
      updatedAt: args.recordedAt,
    })
    return { kind: 'admitted' as const, reservationRef }
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

async function requireTokenIdentity(ctx: { auth: { getUserIdentity(): Promise<{ tokenIdentifier: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return null
  return {
    principalRef: identity.tokenIdentifier,
    callerRef: identity.tokenIdentifier,
  }
}

export const authenticatedLoadComplete = query({
  args: {
    invocationRef: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<unknown> => {
    const identity = await requireTokenIdentity(ctx)
    if (identity === null) return { kind: 'refused' as const, code: 'authentication_required' as const }
    return await ctx.runQuery(internalLoadComplete, {
      ownerPrincipalRef: identity.principalRef,
      ownerCallerRef: identity.callerRef,
      invocationRef: args.invocationRef,
      paginationOpts: args.paginationOpts,
    })
  },
})

export const authenticatedCreateInitial = mutation({
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
  handler: async (ctx, args): Promise<unknown> => {
    const identity = await requireTokenIdentity(ctx)
    if (identity === null) return { kind: 'refused' as const, code: 'authentication_required' as const }
    if (args.control.owner.principalRef !== identity.principalRef
      || args.control.owner.callerRef !== identity.callerRef) {
      return { kind: 'refused' as const, code: 'caller_identity_refused' as const }
    }
    return await ctx.runMutation(internalCreateInitial, args)
  },
})

export const authenticatedTransact = mutation({
  args: {
    invocationRef: v.string(),
    commandId: v.string(),
    commandDigest: v.string(),
    expectedInvocationVersion: v.number(),
    expectedEffectGeneration: v.optional(v.number()),
    nextInvocationVersion: v.number(),
    nextEffectGeneration: v.optional(v.number()),
    selectedSource: sourceRow,
    payment: v.optional(paymentRow),
    evidenceReferences: v.array(evidenceReferenceRow),
    submissionStarted: v.boolean(),
    recordedAt: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const identity = await requireTokenIdentity(ctx)
    if (identity === null) return { kind: 'refused' as const, code: 'authentication_required' as const }
    return await ctx.runMutation(internalTransact, {
      ...args,
      ownerPrincipalRef: identity.principalRef,
      ownerCallerRef: identity.callerRef,
    })
  },
})

export const authenticatedReserveAdmission = mutation({
  args: {
    policyRef: v.string(),
    windowKey: v.string(),
    commandId: v.string(),
    recordedAt: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const identity = await requireTokenIdentity(ctx)
    if (identity === null) return { kind: 'refused' as const, code: 'authentication_required' as const }
    return await ctx.runMutation(internalReserveAdmission, {
      ...args,
      principalRef: identity.principalRef,
    })
  },
})
