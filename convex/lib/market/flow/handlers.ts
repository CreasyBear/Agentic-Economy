import type { Infer } from 'convex/values'

import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type {
  addChunkArgs, advanceArgs, expireChunkArgs, failArgs, noteWindowArgs,
  payeeVolumesArgs, rankArgs, savePayeeVolumesArgs, visibleVolumesArgs,
} from './contracts'
import {
  advanceFlowCheckpoint, applyAddedChunk, expireDayChunk, noteFlowWindowStart, readCachedPayeeVolumes,
  readFlowCheckpoint, readFlowRank, readVisiblePayeeVolumes, recordFlowFailure, writeCachedPayeeVolumes,
} from './store'

export async function checkpointHandler(ctx: QueryCtx) {
  const row = await readFlowCheckpoint(ctx)
  if (row === null) return null
  return {
    facilitatorSetDigest: row.facilitatorSetDigest,
    ...(row.lastClosedDay === undefined ? {} : { lastClosedDay: row.lastClosedDay }),
    ...(row.windowStart === undefined ? {} : { windowStart: row.windowStart }),
    ...(row.lastError === undefined ? {} : { lastError: row.lastError }),
  }
}

export async function failHandler(ctx: MutationCtx, args: Infer<typeof failArgs>) {
  await recordFlowFailure(ctx, args.message, Date.now())
  return null
}

export async function addChunkHandler(ctx: MutationCtx, args: Infer<typeof addChunkArgs>) {
  await applyAddedChunk(ctx, args.rows)
  return null
}

export async function expireChunkHandler(ctx: MutationCtx, args: Infer<typeof expireChunkArgs>) {
  return await expireDayChunk(ctx, args.day)
}

export async function noteWindowHandler(ctx: MutationCtx, args: Infer<typeof noteWindowArgs>) {
  await noteFlowWindowStart(ctx, args.windowStart, Date.now())
  return null
}

export async function advanceHandler(ctx: MutationCtx, args: Infer<typeof advanceArgs>) {
  await advanceFlowCheckpoint(ctx, args.day, Date.now())
  return null
}

export async function payeeVolumesHandler(ctx: QueryCtx, args: Infer<typeof payeeVolumesArgs>) {
  return await readCachedPayeeVolumes(ctx, args.recipients, args.windowEnd)
}

export async function savePayeeVolumesHandler(ctx: MutationCtx, args: Infer<typeof savePayeeVolumesArgs>) {
  await writeCachedPayeeVolumes(ctx, args.rows, args.windowEnd, Date.now())
  return null
}

export async function visibleVolumesHandler(ctx: QueryCtx, args: Infer<typeof visibleVolumesArgs>) {
  return await readVisiblePayeeVolumes(ctx, args.payTos, Date.now())
}

export async function rankHandler(ctx: QueryCtx, args: Infer<typeof rankArgs>) {
  return await readFlowRank(ctx, args.payTos)
}
