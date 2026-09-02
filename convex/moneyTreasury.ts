import { v, type Infer } from 'convex/values'

import { canonicalDigest, isCanonicalDigest } from '../src/modules/common/canonical-digest'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { internalMutation, internalQuery } from './_generated/server'

const environmentValue = v.union(v.literal('sandbox'), v.literal('production'))
const custodyIdentityArgs = {
  environment: environmentValue,
  custodyRef: v.string(),
  custodyGeneration: v.number(),
  network: v.string(),
  asset: v.literal('USDC'),
  exponent: v.literal(6),
} as const
const treasuryProjectionValue = v.object({
  environment: environmentValue,
  custodyRef: v.string(),
  custodyGeneration: v.number(),
  network: v.string(),
  asset: v.literal('USDC'),
  exponent: v.literal(6),
  observedTotalUnits: v.string(),
  committedUnits: v.string(),
  pendingOutflowUnits: v.string(),
  settledOutflowUnits: v.string(),
  bufferUnits: v.string(),
  spendableUnits: v.string(),
  version: v.number(),
  lastObservationRef: v.string(),
  observedAt: v.number(),
  updatedAt: v.number(),
})
const treasuryAcceptedValue = v.object({
  kind: v.literal('accepted'),
  replayed: v.boolean(),
  projection: treasuryProjectionValue,
})
const treasuryRefusalValue = v.object({
  kind: v.literal('refused'),
  code: v.string(),
  retryable: v.boolean(),
})
const treasuryMutationResultValue = v.union(treasuryAcceptedValue, treasuryRefusalValue)
const transitionResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    replayed: v.boolean(),
    state: v.union(
      v.literal('committed'),
      v.literal('pending_outflow'),
      v.literal('settled'),
      v.literal('released'),
      v.literal('outcome_unknown'),
    ),
    projection: treasuryProjectionValue,
  }),
  treasuryRefusalValue,
)

const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/u
const UNITS_PATTERN = /^(?:0|[1-9]\d{0,29})$/u

type CustodyIdentity = Readonly<{
  environment: 'sandbox' | 'production'
  custodyRef: string
  custodyGeneration: number
  network: string
  asset: 'USDC'
  exponent: 6
}>
type TreasuryMutationResult = Infer<typeof treasuryMutationResultValue>

function validRef(value: string): boolean {
  return REF_PATTERN.test(value)
}

function validUnits(value: string): boolean {
  return UNITS_PATTERN.test(value)
}

function validCustodyIdentity(input: CustodyIdentity): boolean {
  return validRef(input.custodyRef)
    && Number.isSafeInteger(input.custodyGeneration)
    && input.custodyGeneration > 0
    && validRef(input.network)
}

function computeSpendable(input: Readonly<{
  observedTotalUnits: string
  committedUnits: string
  pendingOutflowUnits: string
  settledOutflowUnits: string
  bufferUnits: string
}>): string {
  const spendable = BigInt(input.observedTotalUnits)
    - BigInt(input.committedUnits)
    - BigInt(input.pendingOutflowUnits)
    - BigInt(input.settledOutflowUnits)
    - BigInt(input.bufferUnits)
  return (spendable > 0n ? spendable : 0n).toString()
}

function projectionView(row: Doc<'moneyTreasuryProjections'>) {
  return {
    environment: row.environment,
    custodyRef: row.custodyRef,
    custodyGeneration: row.custodyGeneration,
    network: row.network,
    asset: row.asset,
    exponent: row.exponent,
    observedTotalUnits: row.observedTotalUnits,
    committedUnits: row.committedUnits,
    pendingOutflowUnits: row.pendingOutflowUnits,
    settledOutflowUnits: row.settledOutflowUnits,
    bufferUnits: row.bufferUnits,
    spendableUnits: row.spendableUnits,
    version: row.version,
    lastObservationRef: row.lastObservationRef,
    observedAt: row.observedAt,
    updatedAt: row.updatedAt,
  }
}

async function loadProjection(ctx: MutationCtx, input: CustodyIdentity) {
  const row = await ctx.db.query('moneyTreasuryProjections')
    .withIndex('by_custody', (query) => query
      .eq('environment', input.environment)
      .eq('custodyRef', input.custodyRef)
      .eq('custodyGeneration', input.custodyGeneration))
    .unique()
  if (row === null) return null
  return row.network === input.network && row.asset === input.asset && row.exponent === input.exponent
    ? row
    : undefined
}

export const recordObservation = internalMutation({
  args: {
    ...custodyIdentityArgs,
    observationRef: v.string(),
    totalUnits: v.string(),
    bufferUnits: v.string(),
    evidenceRef: v.string(),
    evidenceDigest: v.string(),
    observedAt: v.number(),
  },
  returns: treasuryMutationResultValue,
  handler: async (ctx, args): Promise<TreasuryMutationResult> => {
    if (!validCustodyIdentity(args)
      || !validRef(args.observationRef)
      || !validUnits(args.totalUnits)
      || !validUnits(args.bufferUnits)
      || !validRef(args.evidenceRef)
      || !isCanonicalDigest(args.evidenceDigest)
      || !Number.isSafeInteger(args.observedAt)
      || args.observedAt < 0) {
      return { kind: 'refused', code: 'treasury_observation_invalid', retryable: false }
    }
    const existing = await ctx.db.query('moneyTreasuryObservations')
      .withIndex('by_observationRef', (query) => query.eq('observationRef', args.observationRef))
      .unique()
    const observationDigest = canonicalDigest({
      format: 'ae.treasury-observation:v1',
      ...args,
    })
    if (existing !== null) {
      const existingDigest = canonicalDigest({
        format: 'ae.treasury-observation:v1',
        environment: existing.environment,
        custodyRef: existing.custodyRef,
        custodyGeneration: existing.custodyGeneration,
        network: existing.network,
        asset: existing.asset,
        exponent: existing.exponent,
        observationRef: existing.observationRef,
        totalUnits: existing.totalUnits,
        bufferUnits: existing.bufferUnits,
        evidenceRef: existing.evidenceRef,
        evidenceDigest: existing.evidenceDigest,
        observedAt: existing.observedAt,
      })
      if (existingDigest !== observationDigest) {
        return { kind: 'refused', code: 'treasury_observation_conflict', retryable: false }
      }
      const projection = await loadProjection(ctx, args)
      return projection === null || projection === undefined
        ? { kind: 'refused', code: 'treasury_projection_unavailable', retryable: false }
        : { kind: 'accepted', replayed: true, projection: projectionView(projection) }
    }

    const now = Date.now()
    const projection = await loadProjection(ctx, args)
    if (projection === undefined) {
      return { kind: 'refused', code: 'treasury_identity_conflict', retryable: false }
    }
    if (projection !== null && args.observedAt < projection.observedAt) {
      return { kind: 'refused', code: 'treasury_observation_stale', retryable: false }
    }
    await ctx.db.insert('moneyTreasuryObservations', {
      environment: args.environment,
      custodyRef: args.custodyRef,
      custodyGeneration: args.custodyGeneration,
      network: args.network,
      asset: args.asset,
      exponent: args.exponent,
      observationRef: args.observationRef,
      totalUnits: args.totalUnits,
      bufferUnits: args.bufferUnits,
      evidenceRef: args.evidenceRef,
      evidenceDigest: args.evidenceDigest,
      observedAt: args.observedAt,
      recordedAt: now,
    })
    if (projection === null) {
      const material = {
        ...args,
        observedTotalUnits: args.totalUnits,
        committedUnits: '0',
        pendingOutflowUnits: '0',
        settledOutflowUnits: '0',
      }
      const id = await ctx.db.insert('moneyTreasuryProjections', {
        environment: args.environment,
        custodyRef: args.custodyRef,
        custodyGeneration: args.custodyGeneration,
        network: args.network,
        asset: args.asset,
        exponent: args.exponent,
        observedTotalUnits: args.totalUnits,
        committedUnits: '0',
        pendingOutflowUnits: '0',
        settledOutflowUnits: '0',
        bufferUnits: args.bufferUnits,
        spendableUnits: computeSpendable(material),
        version: 1,
        lastObservationRef: args.observationRef,
        observedAt: args.observedAt,
        updatedAt: now,
      })
      const inserted = await ctx.db.get(id)
      if (inserted === null) throw new Error('treasury_projection_insert_missing')
      return { kind: 'accepted', replayed: false, projection: projectionView(inserted) }
    }
    const next = {
      observedTotalUnits: args.totalUnits,
      committedUnits: projection.committedUnits,
      pendingOutflowUnits: projection.pendingOutflowUnits,
      settledOutflowUnits: '0',
      bufferUnits: args.bufferUnits,
    }
    await ctx.db.patch(projection._id, {
      ...next,
      spendableUnits: computeSpendable(next),
      version: projection.version + 1,
      lastObservationRef: args.observationRef,
      observedAt: args.observedAt,
      updatedAt: now,
    })
    const updated = await ctx.db.get(projection._id)
    if (updated === null) throw new Error('treasury_projection_update_missing')
    return { kind: 'accepted', replayed: false, projection: projectionView(updated) }
  },
})

export const reserve = internalMutation({
  args: {
    ...custodyIdentityArgs,
    reservationRef: v.string(),
    idempotencyKey: v.string(),
    commitmentRef: v.string(),
    invocationRef: v.string(),
    amountUnits: v.string(),
    evidenceDigest: v.string(),
    now: v.number(),
  },
  returns: treasuryMutationResultValue,
  handler: async (ctx, args): Promise<TreasuryMutationResult> => {
    if (!validCustodyIdentity(args)
      || !validRef(args.reservationRef)
      || !validRef(args.idempotencyKey)
      || !validRef(args.commitmentRef)
      || !validRef(args.invocationRef)
      || !validUnits(args.amountUnits)
      || BigInt(args.amountUnits) <= 0n
      || !isCanonicalDigest(args.evidenceDigest)
      || !Number.isSafeInteger(args.now)
      || args.now < 0) {
      return { kind: 'refused', code: 'treasury_reservation_invalid', retryable: false }
    }
    const identityMaterial = {
      format: 'ae.treasury-reservation:v1',
      environment: args.environment,
      custodyRef: args.custodyRef,
      custodyGeneration: args.custodyGeneration,
      network: args.network,
      asset: args.asset,
      exponent: args.exponent,
      reservationRef: args.reservationRef,
      idempotencyKey: args.idempotencyKey,
      commitmentRef: args.commitmentRef,
      invocationRef: args.invocationRef,
      amountUnits: args.amountUnits,
      evidenceDigest: args.evidenceDigest,
    }
    const identityDigest = canonicalDigest(identityMaterial)
    const existing = await ctx.db.query('moneyTreasuryReservations')
      .withIndex('by_idempotencyKey', (query) => query.eq('idempotencyKey', args.idempotencyKey))
      .unique()
    if (existing !== null) {
      const projection = await loadProjection(ctx, args)
      return existing.identityDigest !== identityDigest || projection === null || projection === undefined
        ? { kind: 'refused', code: 'treasury_reservation_conflict', retryable: false }
        : { kind: 'accepted', replayed: true, projection: projectionView(projection) }
    }
    const conflictingRef = await ctx.db.query('moneyTreasuryReservations')
      .withIndex('by_reservationRef', (query) => query.eq('reservationRef', args.reservationRef))
      .unique()
    if (conflictingRef !== null) {
      return { kind: 'refused', code: 'treasury_reservation_conflict', retryable: false }
    }
    const projection = await loadProjection(ctx, args)
    if (projection === null) {
      return { kind: 'refused', code: 'treasury_observation_required', retryable: false }
    }
    if (projection === undefined) {
      return { kind: 'refused', code: 'treasury_identity_conflict', retryable: false }
    }
    if (BigInt(projection.spendableUnits) < BigInt(args.amountUnits)) {
      return { kind: 'refused', code: 'treasury_capacity_insufficient', retryable: false }
    }
    await ctx.db.insert('moneyTreasuryReservations', {
      environment: args.environment,
      custodyRef: args.custodyRef,
      custodyGeneration: args.custodyGeneration,
      network: args.network,
      asset: args.asset,
      exponent: args.exponent,
      reservationRef: args.reservationRef,
      idempotencyKey: args.idempotencyKey,
      commitmentRef: args.commitmentRef,
      invocationRef: args.invocationRef,
      amountUnits: args.amountUnits,
      state: 'committed',
      identityDigest,
      evidenceDigest: args.evidenceDigest,
      createdAt: args.now,
      updatedAt: args.now,
    })
    const next = {
      observedTotalUnits: projection.observedTotalUnits,
      committedUnits: (BigInt(projection.committedUnits) + BigInt(args.amountUnits)).toString(),
      pendingOutflowUnits: projection.pendingOutflowUnits,
      settledOutflowUnits: projection.settledOutflowUnits,
      bufferUnits: projection.bufferUnits,
    }
    await ctx.db.patch(projection._id, {
      committedUnits: next.committedUnits,
      spendableUnits: computeSpendable(next),
      version: projection.version + 1,
      updatedAt: args.now,
    })
    const updated = await ctx.db.get(projection._id)
    if (updated === null) throw new Error('treasury_projection_update_missing')
    return { kind: 'accepted', replayed: false, projection: projectionView(updated) }
  },
})

type ReservationTransition = 'pending_outflow' | 'settled' | 'released'

async function transitionReservation(
  ctx: MutationCtx,
  input: Readonly<{
    reservationRef: string
    target: ReservationTransition
    evidenceDigest: string
    now: number
  }>,
) {
  if (!validRef(input.reservationRef)
    || !isCanonicalDigest(input.evidenceDigest)
    || !Number.isSafeInteger(input.now)
    || input.now < 0) {
    return { kind: 'refused' as const, code: 'treasury_transition_invalid', retryable: false }
  }
  const reservation = await ctx.db.query('moneyTreasuryReservations')
    .withIndex('by_reservationRef', (query) => query.eq('reservationRef', input.reservationRef))
    .unique()
  if (reservation === null) {
    return { kind: 'refused' as const, code: 'treasury_reservation_not_found', retryable: false }
  }
  const identity = {
    environment: reservation.environment,
    custodyRef: reservation.custodyRef,
    custodyGeneration: reservation.custodyGeneration,
    network: reservation.network,
    asset: reservation.asset,
    exponent: reservation.exponent,
  }
  const projection = await loadProjection(ctx, identity)
  if (projection === null || projection === undefined) {
    return { kind: 'refused' as const, code: 'treasury_projection_unavailable', retryable: false }
  }
  if (reservation.state === input.target) {
    return {
      kind: 'accepted' as const,
      replayed: true,
      state: reservation.state,
      projection: projectionView(projection),
    }
  }
  if (input.target === 'released' && reservation.state !== 'committed') {
    return {
      kind: 'refused' as const,
      code: reservation.state === 'pending_outflow' || reservation.state === 'outcome_unknown'
        ? 'treasury_submission_may_have_occurred'
        : 'treasury_state_conflict',
      retryable: false,
    }
  }
  if (input.target === 'pending_outflow' && reservation.state !== 'committed') {
    return { kind: 'refused' as const, code: 'treasury_state_conflict', retryable: false }
  }
  if (input.target === 'settled'
    && reservation.state !== 'committed'
    && reservation.state !== 'pending_outflow'
    && reservation.state !== 'outcome_unknown') {
    return { kind: 'refused' as const, code: 'treasury_state_conflict', retryable: false }
  }

  const amount = BigInt(reservation.amountUnits)
  let committed = BigInt(projection.committedUnits)
  let pending = BigInt(projection.pendingOutflowUnits)
  let settled = BigInt(projection.settledOutflowUnits)
  if (reservation.state === 'committed') committed -= amount
  if (reservation.state === 'pending_outflow' || reservation.state === 'outcome_unknown') pending -= amount
  if (input.target === 'pending_outflow') pending += amount
  if (input.target === 'settled') settled += amount
  if (committed < 0n || pending < 0n) throw new Error('treasury_projection_invariant_broken')
  const next = {
    observedTotalUnits: projection.observedTotalUnits,
    committedUnits: committed.toString(),
    pendingOutflowUnits: pending.toString(),
    settledOutflowUnits: settled.toString(),
    bufferUnits: projection.bufferUnits,
  }
  await ctx.db.patch(projection._id, {
    ...next,
    spendableUnits: computeSpendable(next),
    version: projection.version + 1,
    updatedAt: input.now,
  })
  await ctx.db.patch(reservation._id, {
    state: input.target,
    ...(input.target === 'pending_outflow' ? { submissionDigest: input.evidenceDigest, submittedAt: input.now } : {}),
    ...(input.target === 'settled' || input.target === 'released'
      ? { finalEvidenceDigest: input.evidenceDigest, finalizedAt: input.now }
      : {}),
    updatedAt: input.now,
  })
  const updated = await ctx.db.get(projection._id)
  if (updated === null) throw new Error('treasury_projection_update_missing')
  return {
    kind: 'accepted' as const,
    replayed: false,
    state: input.target,
    projection: projectionView(updated),
  }
}

export const markPossiblySubmitted = internalMutation({
  args: {
    reservationRef: v.string(),
    submissionDigest: v.string(),
    now: v.number(),
  },
  returns: transitionResultValue,
  handler: async (ctx, args) => transitionReservation(ctx, {
    reservationRef: args.reservationRef,
    target: 'pending_outflow',
    evidenceDigest: args.submissionDigest,
    now: args.now,
  }),
})

export const settle = internalMutation({
  args: { reservationRef: v.string(), evidenceDigest: v.string(), now: v.number() },
  returns: transitionResultValue,
  handler: async (ctx, args) => transitionReservation(ctx, { ...args, target: 'settled' }),
})

export const release = internalMutation({
  args: { reservationRef: v.string(), evidenceDigest: v.string(), now: v.number() },
  returns: transitionResultValue,
  handler: async (ctx, args) => transitionReservation(ctx, { ...args, target: 'released' }),
})

export const read = internalQuery({
  args: custodyIdentityArgs,
  returns: v.union(
    v.object({ kind: v.literal('available'), projection: treasuryProjectionValue }),
    v.object({ kind: v.literal('unavailable') }),
  ),
  handler: async (ctx, args) => {
    if (!validCustodyIdentity(args)) return { kind: 'unavailable' as const }
    const row = await ctx.db.query('moneyTreasuryProjections')
      .withIndex('by_custody', (query) => query
        .eq('environment', args.environment)
        .eq('custodyRef', args.custodyRef)
        .eq('custodyGeneration', args.custodyGeneration))
      .unique()
    return row === null
      || row.network !== args.network
      || row.asset !== args.asset
      || row.exponent !== args.exponent
      ? { kind: 'unavailable' as const }
      : { kind: 'available' as const, projection: projectionView(row) }
  },
})
