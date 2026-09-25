import { v } from 'convex/values'

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

export const checkpointArgs = v.object({})
export const checkpointResult = v.union(v.null(), checkpointValue)
export const failArgs = v.object({ message: v.string() })
export const failResult = v.null()
export const addChunkArgs = v.object({ rows: v.array(rowValue) })
export const addChunkResult = v.null()
export const expireChunkArgs = v.object({ day: v.string() })
export const expireChunkResult = v.boolean()
export const noteWindowArgs = v.object({ windowStart: v.string() })
export const noteWindowResult = v.null()
export const advanceArgs = v.object({ day: v.string() })
export const advanceResult = v.null()
export const payeeVolumesArgs = v.object({ recipients: v.array(v.string()), windowEnd: v.string() })
export const payeeVolumesResult = v.array(v.object({ recipient: v.string(), amountAtomic: v.string() }))
export const savePayeeVolumesArgs = v.object({
  windowEnd: v.string(),
  rows: v.array(v.object({ recipient: v.string(), amountAtomic: v.string() })),
})
export const savePayeeVolumesResult = v.null()
export const visibleVolumesArgs = v.object({ payTos: v.array(v.string()) })
export const visibleVolumesResult = v.array(v.object({ payTo: v.string(), amountAtomic: v.string() }))
export const rankArgs = v.object({ payTos: v.array(v.string()) })
export const rankResult = rankValue
