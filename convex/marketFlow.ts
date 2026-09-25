import { internalMutation, internalQuery, query } from './_generated/server'
import {
  addChunkArgs, addChunkResult, advanceArgs, advanceResult, checkpointArgs, checkpointResult,
  expireChunkArgs, expireChunkResult, failArgs, failResult, noteWindowArgs, noteWindowResult,
  payeeVolumesArgs, payeeVolumesResult, rankArgs, rankResult, savePayeeVolumesArgs, savePayeeVolumesResult,
  visibleVolumesArgs, visibleVolumesResult,
} from './lib/market/flow/contracts'
import {
  addChunkHandler, advanceHandler, checkpointHandler, expireChunkHandler, failHandler, noteWindowHandler,
  payeeVolumesHandler, rankHandler, savePayeeVolumesHandler, visibleVolumesHandler,
} from './lib/market/flow/handlers'

export const checkpoint = internalQuery({
  args: checkpointArgs.fields,
  returns: checkpointResult,
  handler: checkpointHandler,
})

export const fail = internalMutation({
  args: failArgs.fields,
  returns: failResult,
  handler: failHandler,
})

export const addChunk = internalMutation({
  args: addChunkArgs.fields,
  returns: addChunkResult,
  handler: addChunkHandler,
})

export const expireChunk = internalMutation({
  args: expireChunkArgs.fields,
  returns: expireChunkResult,
  handler: expireChunkHandler,
})

export const noteWindow = internalMutation({
  args: noteWindowArgs.fields,
  returns: noteWindowResult,
  handler: noteWindowHandler,
})

export const advance = internalMutation({
  args: advanceArgs.fields,
  returns: advanceResult,
  handler: advanceHandler,
})

export const payeeVolumes = internalQuery({
  args: payeeVolumesArgs.fields,
  returns: payeeVolumesResult,
  handler: payeeVolumesHandler,
})

export const savePayeeVolumes = internalMutation({
  args: savePayeeVolumesArgs.fields,
  returns: savePayeeVolumesResult,
  handler: savePayeeVolumesHandler,
})

export const visibleVolumes = query({
  args: visibleVolumesArgs.fields,
  returns: visibleVolumesResult,
  handler: visibleVolumesHandler,
})

export const rank = query({
  args: rankArgs.fields,
  returns: rankResult,
  handler: rankHandler,
})
