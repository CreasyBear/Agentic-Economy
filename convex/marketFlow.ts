import { v } from 'convex/values'

import { internalMutation, internalQuery, query } from './_generated/server'
import {
  advanceFlowCheckpoint, applyAddedChunk, expireDayChunk, noteFlowWindowStart, readCachedPayeeVolumes, readFlowCheckpoint, readFlowRank, readVisiblePayeeVolumes, recordFlowFailure, writeCachedPayeeVolumes,
} from './lib/marketFlow/store'

const rowValue = v.object({
  recipient: v.string(), facilitator: v.string(), day: v.string(), amountAtomic: v.string(),
  transferCount: v.number(), uniqueBuyers: v.number(), latestAt: v.number(),
})

const checkpointValue = v.object({
  facilitatorSetDigest: v.string(),
  lastClosedDay: v.optional(v.string()),
  windowStart: v.optional(v.string()),
  lastError: v.optional(v.string()),
})

const rankValue = v.object({
  ready: v.boolean(),
  facilitatorSetDigest: v.string(),
  recipients: v.array(v.object({
    recipient: v.string(), amountAtomic: v.string(), transferCount: v.number(), uniqueBuyers: v.number(),
    toolCount: v.number(), toolCountCapped: v.boolean(),
  })),
  volumes: v.array(v.object({ payTo: v.string(), amountAtomic: v.string() })),
})

export const checkpoint = internalQuery({
  args: {},
  returns: v.union(v.null(), checkpointValue),
  handler: async (ctx) => {
    const row = await readFlowCheckpoint(ctx)
    if (row === null) return null
    return {
      facilitatorSetDigest: row.facilitatorSetDigest,
      ...(row.lastClosedDay === undefined ? {} : { lastClosedDay: row.lastClosedDay }),
      ...(row.windowStart === undefined ? {} : { windowStart: row.windowStart }),
      ...(row.lastError === undefined ? {} : { lastError: row.lastError }),
    }
  },
})

export const fail = internalMutation({
  args: { message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordFlowFailure(ctx, args.message, Date.now())
    return null
  },
})

export const addChunk = internalMutation({
  args: { rows: v.array(rowValue) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await applyAddedChunk(ctx, args.rows)
    return null
  },
})

export const expireChunk = internalMutation({
  args: { day: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => await expireDayChunk(ctx, args.day),
})

export const noteWindow = internalMutation({
  args: { windowStart: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await noteFlowWindowStart(ctx, args.windowStart, Date.now())
    return null
  },
})

export const advance = internalMutation({
  args: { day: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await advanceFlowCheckpoint(ctx, args.day, Date.now())
    return null
  },
})

export const payeeVolumes = internalQuery({
  args: { recipients: v.array(v.string()), windowEnd: v.string() },
  returns: v.array(v.object({ recipient: v.string(), amountAtomic: v.string() })),
  handler: async (ctx, args) => await readCachedPayeeVolumes(ctx, args.recipients, args.windowEnd),
})

export const savePayeeVolumes = internalMutation({
  args: {
    windowEnd: v.string(),
    rows: v.array(v.object({ recipient: v.string(), amountAtomic: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await writeCachedPayeeVolumes(ctx, args.rows, args.windowEnd, Date.now())
    return null
  },
})

export const visibleVolumes = query({
  args: { payTos: v.array(v.string()) },
  returns: v.array(v.object({ payTo: v.string(), amountAtomic: v.string() })),
  handler: async (ctx, args) => await readVisiblePayeeVolumes(ctx, args.payTos, Date.now()),
})

export const rank = query({
  args: { payTos: v.array(v.string()) },
  returns: rankValue,
  handler: async (ctx, args) => await readFlowRank(ctx, args.payTos),
})
