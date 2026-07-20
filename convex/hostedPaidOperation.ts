import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  HOSTED_PAID_OPERATION_CHILD_CAP,
  HOSTED_PAID_OPERATION_HISTORY_PAGE_SIZE,
} from '../src/modules/action-invocation/hosted-paid-operation-port'
import { internalMutation, internalQuery } from './_generated/server'

const opaqueReference = v.object({
  algorithm: v.literal('sha256'),
  digest: v.string(),
})

const sourceRow = v.object({
  sourceRef: v.string(),
  providerId: v.string(),
  providerName: v.string(),
  operationKey: v.string(),
  operationRevision: v.string(),
  materialInputDigest: v.string(),
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
    const attempt = header.currentEffectGeneration === undefined || control?.currentAttemptRef === undefined
      ? null
      : await ctx.db.query('actionInvocationAttempts')
        .withIndex('by_invocationRef_and_attemptRef', (q) =>
          q.eq('invocationRef', args.invocationRef).eq('attemptRef', control.currentAttemptRef!))
        .unique()
    const payment = attempt === null
      ? null
      : await ctx.db.query('hostedPaidOperationPayments')
        .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (q) =>
          q.eq('invocationRef', args.invocationRef)
            .eq('attemptRef', attempt.attemptRef)
            .eq('effectGeneration', attempt.effectGeneration))
        .unique()
    const evidenceReferences = attempt === null
      ? []
      : await ctx.db.query('hostedPaidOperationEvidenceReferences')
        .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (q) =>
          q.eq('invocationRef', args.invocationRef)
            .eq('attemptRef', attempt.attemptRef)
            .eq('effectGeneration', attempt.effectGeneration))
        .take(HOSTED_PAID_OPERATION_CHILD_CAP + 1)
    if (source === null || control === null
      || (header.currentEffectGeneration !== undefined && attempt === null)
      || (header.paymentAttemptRequired && payment === null)
      || evidenceReferences.length > HOSTED_PAID_OPERATION_CHILD_CAP) {
      return { kind: 'aggregate_incomplete' as const, reason: 'required_child_missing_or_cap_exceeded' as const }
    }
    const history = await ctx.db.query('hostedPaidOperationCommands')
      .withIndex('by_invocationRef_and_commandId', (q) => q.eq('invocationRef', args.invocationRef))
      .paginate(args.paginationOpts)
    return { kind: 'loaded' as const, header, source, control, attempt, payment, evidenceReferences, history }
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
