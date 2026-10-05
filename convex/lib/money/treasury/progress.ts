import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import {
  cdpX402CustodyBudgetRef, cdpX402TreasuryConfigurationFromEnvironment, x402PaymentProfileForEnvironment,
} from '@/modules/capability-supply/convex'
import type { TreasuryBatch, TreasuryChainObservation, TreasuryChainCheckpoint, TreasuryIdentity, TreasuryProgress } from '@/modules/money/treasury'
import { env, type MutationCtx, type QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'

const HASH = /^0x[0-9a-fA-F]{64}$/u
const ADDRESS = /^0x[0-9a-fA-F]{40}$/u
const UNITS = /^(?:0|[1-9]\d{0,15})$/u
const MAX_TRANSFERS = 100

export function configuredTreasuryIdentity(): TreasuryIdentity | undefined {
  const environment = deploymentPaymentEnvironment(env)
  const configuration = cdpX402TreasuryConfigurationFromEnvironment(env)
  const profile = x402PaymentProfileForEnvironment(environment)
  if (environment === undefined || configuration === undefined || profile === undefined) return undefined
  return { environment, custodyRef: cdpX402CustodyBudgetRef(configuration, environment),
    custodyGeneration: configuration.credentialGeneration, network: profile.network,
    asset: profile.asset.toLowerCase(), address: configuration.expectedEvmAddress.toLowerCase(),
    bufferTargetUnits: configuration.maxAtomic.toString() }
}

export async function readTreasuryProgress(ctx: Pick<QueryCtx, 'db'>): Promise<TreasuryProgress> {
  const identity = configuredTreasuryIdentity()
  if (identity === undefined) return unavailable('treasury_configuration_unavailable')
  const row = await readCursor(ctx, identity)
  if (row === null) return { kind: 'empty', identity }
  if (!cursorIdentityMatches(row, identity)) return unavailable('treasury_custody_cutover_required')
  if (row.state.kind === 'ready') return { kind: 'ready', identity,
    checkpoint: row.state.checkpoint, blockTimestamp: row.state.blockTimestamp, bufferUnits: row.bufferUnits }
  const batch = await readBatch(ctx, row.state.batchRef)
  if (batch === null || batch.state.kind !== 'pending') return unavailable('treasury_cursor_conflict')
  return { kind: 'pending', identity, batch: projectBatch(batch) }
}

/**
 * Historical audits use the same cutoff as their native insertion/PIT reads.
 * Validate the live cursor and every intervening range before projecting the
 * retained checkpoint. A later observer cannot refresh that checkpoint's clock.
 * A retained range completed after the cutoff remains unavailable: its mutable
 * pending state cannot be reconstructed as proven historical posting evidence.
 * Read cost is three indexed reads and at most 25 post-cutoff ranges. Longer or
 * broken bridges fail closed; the auditor still validates the complete retained
 * history and every native posting independently.
 */
export async function readTreasuryProgressAtCutoff(ctx: Pick<QueryCtx, 'db'>, cutoffAt: number): Promise<TreasuryProgress> {
  if (!Number.isSafeInteger(cutoffAt) || cutoffAt < 0) return unavailable('treasury_snapshot_cutoff_invalid')
  const identity = configuredTreasuryIdentity()
  if (identity === undefined) return unavailable('treasury_configuration_unavailable')
  const [cursor, retained, advanced] = await Promise.all([
    readCursor(ctx, identity),
    ctx.db.query('moneyTreasuryBatches').withIndex('by_custody_and_createdAt', q =>
      q.eq('custodyRef', identity.custodyRef).lte('createdAt', cutoffAt)).order('desc').first(),
    ctx.db.query('moneyTreasuryBatches').withIndex('by_custody_and_createdAt', q =>
      q.eq('custodyRef', identity.custodyRef).gt('createdAt', cutoffAt)).order('desc').take(26),
  ])
  if (advanced.length > 25) return unavailable('treasury_source_history_incomplete')
  const latest = advanced[0] ?? retained
  if (cursor === null) return latest === null ? { kind: 'empty', identity } : unavailable('treasury_cursor_conflict')
  if (!cursorIdentityMatches(cursor, identity)) return unavailable('treasury_custody_cutover_required')
  if (!Number.isSafeInteger(cursor.createdAt) || cursor.createdAt < 0
    || !Number.isSafeInteger(cursor.updatedAt) || cursor.updatedAt < cursor.createdAt) return unavailable('treasury_cursor_conflict')
  if (latest === null || !validSavedBatch(latest, identity)) return unavailable('treasury_cursor_conflict')
  if (cursor.state.kind === 'ready') {
    if (latest.state.kind !== 'booked' || cursor.updatedAt !== latest.state.completedAt
      || canonicalDigest(cursor.state.checkpoint) !== canonicalDigest(latest.observation.checkpoint)
      || cursor.state.blockTimestamp !== latest.observation.blockTimestamp
      || cursor.bufferUnits !== batchBufferUnits(latest)) return unavailable('treasury_cursor_conflict')
  } else if (latest.state.kind !== 'pending' || cursor.state.batchRef !== latest.batchRef
    || cursor.updatedAt !== latest.createdAt || cursor.bufferUnits !== latest.previousBufferUnits
    || (cursor.state.kind === 'opening' ? latest.previousCheckpoint !== null
      : canonicalDigest(cursor.state.checkpoint) !== canonicalDigest(latest.previousCheckpoint))) {
    return unavailable('treasury_cursor_conflict')
  }
  if (cursor.state.kind === 'applying' && latest.createdAt > cutoffAt
    && cursor.state.blockTimestamp !== (advanced[1] ?? retained)?.observation.blockTimestamp) {
    return unavailable('treasury_cursor_conflict')
  }
  // Prove that the cursor moved forward from the historical checkpoint, rather
  // than dropping the cursor comparison or accepting an unrelated latest row.
  for (const [index, batch] of advanced.entries()) {
    const previous = advanced[index + 1] ?? retained
    if (!validSavedBatch(batch, identity) || (index > 0 && batch.state.kind !== 'booked')
      || (previous !== null && (!validSavedBatch(previous, identity) || previous.state.kind !== 'booked'
        || previous.state.completedAt > batch.createdAt))
      || canonicalDigest(batch.previousCheckpoint) !== canonicalDigest(previous?.observation.checkpoint ?? null)
      || batch.previousBufferUnits !== (previous === null ? '0' : batchBufferUnits(previous))) {
      return unavailable('treasury_chain_history_incomplete')
    }
  }
  if (retained === null) return { kind: 'empty', identity }
  if (!validSavedBatch(retained, identity)) return unavailable('treasury_chain_history_incomplete')
  if (retained.observation.observedAt > cutoffAt
    || (retained.state.kind === 'booked' && retained.state.completedAt > cutoffAt)) {
    return unavailable('treasury_source_cutoff_changed')
  }
  return retained.state.kind === 'pending' ? { kind: 'pending', identity, batch: projectBatch(retained) }
    : { kind: 'ready', identity, checkpoint: retained.observation.checkpoint,
        blockTimestamp: retained.observation.blockTimestamp, bufferUnits: batchBufferUnits(retained) }
}

function validSavedBatch(batch: TreasuryBatch, identity: TreasuryIdentity): boolean {
  const observation = batch.observation
  return batch.custodyRef === identity.custodyRef && batch.custodyGeneration === identity.custodyGeneration
    && observation.environment === identity.environment && observation.network === identity.network
    && observation.asset === identity.asset && observation.address === identity.address
    && validCheckpoint(observation.checkpoint) && (batch.previousCheckpoint === null || validCheckpoint(batch.previousCheckpoint))
    && safeUnits(batch.previousBufferUnits) && safeUnits(batch.bufferIncreaseUnits)
    && BigInt(batch.previousBufferUnits) + BigInt(batch.bufferIncreaseUnits) <= BigInt(identity.bufferTargetUnits)
    && Number.isSafeInteger(batch.createdAt) && batch.createdAt >= 0
    && Number.isSafeInteger(observation.observedAt) && observation.observedAt >= 0 && observation.observedAt <= batch.createdAt
    && Number.isSafeInteger(observation.blockTimestamp) && observation.blockTimestamp >= 0
    && validObservation(identity, batch.previousCheckpoint, observation, batch.createdAt)
    && batch.batchRef === canonicalDigest({ kind: 'ae.treasury-batch:v1', identity, previous: batch.previousCheckpoint,
      checkpoint: observation.checkpoint, transfers: observation.transfers })
    && (batch.state.kind === 'pending' || (Number.isSafeInteger(batch.state.completedAt) && batch.state.completedAt >= batch.createdAt))
}
function batchBufferUnits(batch: TreasuryBatch): string {
  return (BigInt(batch.previousBufferUnits) + BigInt(batch.bufferIncreaseUnits)).toString()
}

/**
 * Requires agreeing chain evidence and the exact predecessor. Ensures one pending
 * range wins concurrent observers before any ledger write. Retry returns that
 * immutable range. A wallet's cursor survives credential-generation changes;
 * mismatches require cutover rather than funding a new generation silently.
 */
export async function beginTreasuryBatch(ctx: MutationCtx, args: {
  previousCheckpoint: TreasuryChainCheckpoint | null
  observation: TreasuryChainObservation
}): Promise<TreasuryProgress> {
  const identity = configuredTreasuryIdentity()
  if (identity === undefined) return unavailable('treasury_configuration_unavailable')
  if (!validObservation(identity, args.previousCheckpoint, args.observation, Date.now())) {
    return unavailable('treasury_observation_invalid')
  }
  const current = await readTreasuryProgress(ctx)
  if (current.kind === 'unavailable' || current.kind === 'pending') return current
  const previous = current.kind === 'ready' ? current.checkpoint : null
  if (canonicalDigest(previous) !== canonicalDigest(args.previousCheckpoint)) {
    return unavailable('treasury_checkpoint_changed')
  }
  const batchRef = canonicalDigest({ kind: 'ae.treasury-batch:v1', identity, previous,
    checkpoint: args.observation.checkpoint, transfers: args.observation.transfers })
  const existing = await readBatch(ctx, batchRef)
  if (existing !== null) return existing.state.kind === 'booked' ? current
    : { kind: 'pending', identity, batch: projectBatch(existing) }
  const createdAt = Date.now()
  const previousBufferUnits = current.kind === 'ready' ? current.bufferUnits : '0'
  const incomingUnits = previous === null ? BigInt(args.observation.checkpoint.balanceUnits)
    : args.observation.transfers.reduce((total, transfer) => total + (transfer.recipient === identity.address
      && transfer.payer !== identity.address ? BigInt(transfer.amountUnits) : 0n), 0n)
  const missingBuffer = BigInt(identity.bufferTargetUnits) - BigInt(previousBufferUnits)
  if (missingBuffer < 0n) return unavailable('treasury_buffer_conflict')
  const bufferIncreaseUnits = (incomingUnits < missingBuffer ? incomingUnits : missingBuffer).toString()
  const batch: TreasuryBatch = { batchRef, custodyRef: identity.custodyRef,
    custodyGeneration: identity.custodyGeneration, previousCheckpoint: previous, previousBufferUnits, bufferIncreaseUnits,
    observation: args.observation, state: { kind: 'pending' }, createdAt }
  await ctx.db.insert('moneyTreasuryBatches', batch)
  const row = await readCursor(ctx, identity)
  const state = previous === null
    ? { kind: 'opening' as const, batchRef }
    : { kind: 'applying' as const, checkpoint: previous,
        blockTimestamp: current.kind === 'ready' ? current.blockTimestamp : 0, batchRef }
  if (row === null) await ctx.db.insert('moneyTreasuryCursors', { ...identity, bufferUnits: '0', state, createdAt, updatedAt: createdAt })
  else await ctx.db.patch('moneyTreasuryCursors', row._id, { state, updatedAt: createdAt })
  return { kind: 'pending', identity, batch }
}

/** Only the Node posting controller calls this after exact native readback. */
export async function finishTreasuryBatch(ctx: MutationCtx, args: {
  batchRef: string; transactionRefs: string[]
}): Promise<{ kind: 'completed'; replayed: boolean } | { kind: 'unavailable'; code: string }> {
  const identity = configuredTreasuryIdentity()
  if (identity === undefined) return unavailable('treasury_configuration_unavailable')
  const row = await readCursor(ctx, identity)
  const batch = await readBatch(ctx, args.batchRef)
  if (row === null || !cursorIdentityMatches(row, identity) || batch === null
    || batch.custodyRef !== identity.custodyRef || batch.custodyGeneration !== identity.custodyGeneration
    || args.transactionRefs.length > MAX_TRANSFERS + 1
    || new Set(args.transactionRefs).size !== args.transactionRefs.length
    || args.transactionRefs.some(ref => !/^ae-p4:[a-f0-9]{64}:[a-z0-9_-]{1,32}$/u.test(ref))) {
    return unavailable('treasury_batch_conflict')
  }
  if (batch.state.kind === 'booked') return canonicalDigest(batch.state.transactionRefs) === canonicalDigest(args.transactionRefs)
    ? { kind: 'completed', replayed: true } : unavailable('treasury_batch_conflict')
  if (row.state.kind === 'ready' || row.state.batchRef !== args.batchRef) return unavailable('treasury_checkpoint_changed')
  const creditCount = batch.previousCheckpoint === null ? (BigInt(batch.observation.checkpoint.balanceUnits) > 0n ? 1 : 0)
    : batch.observation.transfers.filter(transfer => transfer.recipient === identity.address
      && transfer.payer !== identity.address && BigInt(transfer.amountUnits) > 0n).length
  const expectedCount = creditCount + (BigInt(batch.bufferIncreaseUnits) > 0n ? 1 : 0)
  if (args.transactionRefs.length !== expectedCount) return unavailable('treasury_posting_incomplete')
  const completedAt = Date.now()
  await ctx.db.patch('moneyTreasuryBatches', batch._id, {
    state: { kind: 'booked', transactionRefs: args.transactionRefs, completedAt },
  })
  await ctx.db.patch('moneyTreasuryCursors', row._id, {
    state: { kind: 'ready', checkpoint: batch.observation.checkpoint, blockTimestamp: batch.observation.blockTimestamp },
    bufferUnits: (BigInt(batch.previousBufferUnits) + BigInt(batch.bufferIncreaseUnits)).toString(),
    updatedAt: completedAt,
  })
  return { kind: 'completed', replayed: false }
}

function validObservation(identity: TreasuryIdentity, previous: TreasuryChainCheckpoint | null,
  observation: TreasuryChainObservation, now: number): boolean {
  if (observation.environment !== identity.environment || observation.network !== identity.network
    || observation.asset !== identity.asset || observation.address !== identity.address
    || !validCheckpoint(observation.checkpoint) || !UNITS.test(observation.fromBlock)
    || !Number.isSafeInteger(observation.observedAt) || observation.observedAt > now
    || now - observation.observedAt > 5 * 60_000
    || !Number.isSafeInteger(observation.blockTimestamp) || observation.blockTimestamp < 0
    || observation.blockTimestamp > now + 30_000 || observation.transfers.length > MAX_TRANSFERS) return false
  const to = BigInt(observation.checkpoint.blockNumber)
  if (previous === null) return observation.transfers.length === 0 && BigInt(observation.fromBlock) === to
  if (!validCheckpoint(previous) || to < BigInt(previous.blockNumber)
    || to > BigInt(previous.blockNumber) + 2_000n
    || BigInt(observation.fromBlock) !== BigInt(previous.blockNumber) + 1n) return false
  const seen = new Set<string>()
  let balance = BigInt(previous.balanceUnits)
  for (const transfer of observation.transfers) {
    if (!HASH.test(transfer.transactionHash) || !HASH.test(transfer.blockHash)
      || !UNITS.test(transfer.blockNumber) || BigInt(transfer.blockNumber) < BigInt(observation.fromBlock)
      || BigInt(transfer.blockNumber) > to || !ADDRESS.test(transfer.payer) || !ADDRESS.test(transfer.recipient)
      || transfer.payer !== transfer.payer.toLowerCase() || transfer.recipient !== transfer.recipient.toLowerCase()
      || (transfer.payer !== identity.address && transfer.recipient !== identity.address)
      || !safeUnits(transfer.amountUnits) || !Number.isSafeInteger(transfer.logIndex) || transfer.logIndex < 0
      || !isCanonicalDigest(transfer.evidenceDigest)) return false
    const { evidenceDigest, ...material } = transfer
    if (evidenceDigest !== canonicalDigest({ kind: 'ae.treasury-transfer:v1', network: identity.network,
      asset: identity.asset, ...material })) return false
    const key = `${transfer.transactionHash.toLowerCase()}:${transfer.logIndex}`
    if (seen.has(key)) return false
    seen.add(key)
    balance += transfer.recipient === identity.address ? BigInt(transfer.amountUnits) : 0n
    balance -= transfer.payer === identity.address ? BigInt(transfer.amountUnits) : 0n
  }
  return balance === BigInt(observation.checkpoint.balanceUnits)
}
function validCheckpoint(value: TreasuryChainCheckpoint): boolean {
  return UNITS.test(value.blockNumber) && HASH.test(value.blockHash) && safeUnits(value.balanceUnits)
}
function safeUnits(value: string): boolean { return UNITS.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER) }
function cursorIdentityMatches(row: Doc<'moneyTreasuryCursors'>, identity: TreasuryIdentity): boolean {
  return row.custodyGeneration === identity.custodyGeneration && row.network === identity.network
    && row.asset === identity.asset && row.address === identity.address && row.bufferTargetUnits === identity.bufferTargetUnits
}
async function readCursor(ctx: Pick<QueryCtx, 'db'>, identity: TreasuryIdentity) {
  return await ctx.db.query('moneyTreasuryCursors').withIndex('by_custody', query =>
    query.eq('environment', identity.environment).eq('custodyRef', identity.custodyRef)).unique()
}
async function readBatch(ctx: Pick<QueryCtx, 'db'>, batchRef: string) {
  return await ctx.db.query('moneyTreasuryBatches').withIndex('by_batchRef', query => query.eq('batchRef', batchRef)).unique()
}
function projectBatch(row: Doc<'moneyTreasuryBatches'>): TreasuryBatch {
  const { _id, _creationTime, ...batch } = row
  void _id; void _creationTime
  return batch
}
function unavailable(code: string) { return { kind: 'unavailable' as const, code } }
