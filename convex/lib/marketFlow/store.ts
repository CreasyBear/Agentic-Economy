import { BASE_FACILITATOR_SET_DIGEST } from '@/modules/market/base-facilitator-set'
import { BASE_CHAIN, BASE_USDC_ASSET, flowPayeeWindow, flowRankKey, nextRecipientTotals, shiftUtcDay, type FlowSqlRow } from '@/modules/market/flow-tape'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { activeDirectoryGeneration } from '../x402DirectoryIndex/rows'

export const FLOW_CHECKPOINT_KEY = 'base-usdc'
const CHUNK = 40
// A page view must not scan the catalogue. Eight is enough to say "8+ Tools".
const TOOL_COUNT_CAP = 8

type ReadCtx = Pick<QueryCtx, 'db'>
type WriteCtx = Pick<MutationCtx, 'db'>

export async function readFlowCheckpoint(ctx: ReadCtx) {
  return await ctx.db.query('marketFlowCheckpoint').withIndex('by_key', q => q.eq('key', FLOW_CHECKPOINT_KEY)).unique()
}

export async function recordFlowFailure(ctx: WriteCtx, message: string, now: number) {
  const existing = await readFlowCheckpoint(ctx)
  const patch = { lastError: message.slice(0, 240), updatedAt: now, facilitatorSetDigest: existing?.facilitatorSetDigest ?? BASE_FACILITATOR_SET_DIGEST }
  if (existing === null) await ctx.db.insert('marketFlowCheckpoint', { key: FLOW_CHECKPOINT_KEY, ...patch })
  else await ctx.db.patch(existing._id, patch)
}

async function applyTotals(ctx: WriteCtx, recipient: string, delta: FlowSqlRow, direction: 'add' | 'subtract') {
  const current = await ctx.db.query('marketFlowRecipient').withIndex('by_recipient', q => q.eq('recipient', recipient)).unique()
  const next = nextRecipientTotals(current === null ? undefined : current, delta, direction)
  if (next === 'invalid') throw new Error('flow_rollup_invalid')
  if (next === 'delete') {
    if (current !== null) await ctx.db.delete(current._id)
    return
  }
  const row = {
    amountAtomic: next.amountAtomic,
    transferCount: next.transferCount,
    uniqueBuyers: next.uniqueBuyers,
    rankKey: flowRankKey(next.amountAtomic),
    chain: BASE_CHAIN,
    asset: BASE_USDC_ASSET,
  }
  if (current === null) await ctx.db.insert('marketFlowRecipient', { recipient, ...row })
  else await ctx.db.patch(current._id, row)
}

/** Insert a day's groups that are not already stored, and add them to the 30-day sum in the same write. */
export async function applyAddedChunk(ctx: WriteCtx, rows: readonly FlowSqlRow[]) {
  for (const row of rows) {
    const existing = await ctx.db.query('marketFlowDaily')
      .withIndex('by_recipient_facilitator_and_day', q => q.eq('recipient', row.recipient).eq('facilitator', row.facilitator).eq('day', row.day))
      .unique()
    if (existing !== null) continue
    await ctx.db.insert('marketFlowDaily', {
      recipient: row.recipient, facilitator: row.facilitator, day: row.day,
      chain: BASE_CHAIN, asset: BASE_USDC_ASSET,
      amountAtomic: row.amountAtomic, transferCount: row.transferCount, uniqueBuyers: row.uniqueBuyers, latestAt: row.latestAt,
    })
    await applyTotals(ctx, row.recipient, row, 'add')
  }
}

/** Remove one chunk of a day from the daily table and from the sum together, so a retry cannot subtract twice. */
export async function expireDayChunk(ctx: WriteCtx, day: string): Promise<boolean> {
  const rows = await ctx.db.query('marketFlowDaily').withIndex('by_day', q => q.eq('day', day)).take(CHUNK)
  for (const row of rows) {
    await applyTotals(ctx, row.recipient, row, 'subtract')
    await ctx.db.delete(row._id)
  }
  return rows.length < CHUNK
}

export async function advanceFlowCheckpoint(ctx: WriteCtx, day: string, now: number) {
  const existing = await readFlowCheckpoint(ctx)
  const windowStart = existing?.windowStart ?? day
  const row = {
    key: FLOW_CHECKPOINT_KEY,
    lastClosedDay: day,
    windowStart,
    facilitatorSetDigest: BASE_FACILITATOR_SET_DIGEST,
    updatedAt: now,
  }
  if (existing === null) await ctx.db.insert('marketFlowCheckpoint', row)
  else await ctx.db.replace(existing._id, row)
}

export async function noteFlowWindowStart(ctx: WriteCtx, windowStart: string, now: number) {
  const existing = await readFlowCheckpoint(ctx)
  if (existing === null) return
  await ctx.db.patch(existing._id, { windowStart, updatedAt: now })
}

async function toolCount(ctx: ReadCtx, recipient: string): Promise<{ toolCount: number; toolCountCapped: boolean }> {
  const generation = await activeDirectoryGeneration(ctx)
  if (generation === null) return { toolCount: 0, toolCountCapped: false }
  const rows = await ctx.db.query('marketDirectorySearchEntries')
    .withIndex('by_generation_and_basePayTo', q => q.eq('generation', generation.generation).eq('basePayTo', recipient))
    .take(TOOL_COUNT_CAP)
  return { toolCount: rows.length, toolCountCapped: rows.length === TOOL_COUNT_CAP }
}

export async function readFlowRank(ctx: ReadCtx, payTos: readonly string[]) {
  const checkpoint = await readFlowCheckpoint(ctx)
  const top = await ctx.db.query('marketFlowRecipient').withIndex('by_rankKey').take(8)
  const requested = [...new Set(payTos.map(payTo => payTo.toLowerCase()))].filter(payTo => /^0x[a-f0-9]{40}$/u.test(payTo)).slice(0, 48)
  const volumes = []
  for (const payTo of requested) {
    const row = await ctx.db.query('marketFlowRecipient').withIndex('by_recipient', q => q.eq('recipient', payTo)).unique()
    if (row !== null) volumes.push({ payTo, amountAtomic: row.amountAtomic })
  }
  const recipients = []
  for (const row of top) {
    const tools = await toolCount(ctx, row.recipient)
    recipients.push({
      recipient: row.recipient,
      amountAtomic: row.amountAtomic,
      transferCount: row.transferCount,
      uniqueBuyers: row.uniqueBuyers,
      ...tools,
    })
  }
  return {
    ready: checkpoint?.lastClosedDay !== undefined,
    facilitatorSetDigest: checkpoint?.facilitatorSetDigest ?? BASE_FACILITATOR_SET_DIGEST,
    recipients,
    volumes,
  }
}

/** Indexed point reads for the payees on screen. The daily rollup wins; the page cache fills gaps. */
export async function readVisiblePayeeVolumes(ctx: ReadCtx, payTos: readonly string[], now: number) {
  const windowEnd = shiftUtcDay(flowPayeeWindow(now).end, -1)
  const requested = [...new Set(payTos.map(payTo => payTo.toLowerCase()))].filter(payTo => /^0x[a-f0-9]{40}$/u.test(payTo)).slice(0, 48)
  const rows = []
  for (const payTo of requested) {
    const rollup = await ctx.db.query('marketFlowRecipient').withIndex('by_recipient', q => q.eq('recipient', payTo)).unique()
    if (rollup !== null && rollup.amountAtomic !== '0') {
      rows.push({ payTo, amountAtomic: rollup.amountAtomic })
      continue
    }
    const cached = await ctx.db.query('marketFlowPayeeVolume').withIndex('by_recipient', q => q.eq('recipient', payTo)).unique()
    if (cached !== null && cached.windowEnd === windowEnd && cached.amountAtomic !== '0') {
      rows.push({ payTo, amountAtomic: cached.amountAtomic })
    }
  }
  return rows
}

export async function readCachedPayeeVolumes(ctx: ReadCtx, recipients: readonly string[], windowEnd: string) {
  const rows = []
  for (const recipient of recipients) {
    const row = await ctx.db.query('marketFlowPayeeVolume').withIndex('by_recipient', q => q.eq('recipient', recipient)).unique()
    if (row !== null && row.windowEnd === windowEnd) rows.push({ recipient: row.recipient, amountAtomic: row.amountAtomic })
  }
  return rows
}

export async function writeCachedPayeeVolumes(
  ctx: WriteCtx,
  rows: readonly Readonly<{ recipient: string; amountAtomic: string }>[],
  windowEnd: string,
  now: number,
) {
  for (const row of rows) {
    if (!/^0x[a-f0-9]{40}$/u.test(row.recipient) || !/^(0|[1-9][0-9]*)$/u.test(row.amountAtomic)) continue
    const existing = await ctx.db.query('marketFlowPayeeVolume').withIndex('by_recipient', q => q.eq('recipient', row.recipient)).unique()
    const next = { recipient: row.recipient, windowEnd, amountAtomic: row.amountAtomic, fetchedAt: now }
    if (existing === null) await ctx.db.insert('marketFlowPayeeVolume', next)
    else await ctx.db.replace(existing._id, next)
  }
}

