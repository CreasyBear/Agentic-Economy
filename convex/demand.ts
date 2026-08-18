import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'

import { unlistedRetiredListedTables } from './retiredListedUnlisted'
const demandCaptureError = v.object({
  kind: v.literal('error'),
  code: v.union(v.literal('demand_capture_failed'), v.literal('demand_capture_invalid_input')),
  retryable: v.boolean(),
  reason: v.string(),
  field: v.optional(v.union(
    v.literal('service'),
    v.literal('suburb'),
    v.literal('note'),
    v.literal('queryText')
  )),
})

const demandCaptureResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.literal('demand_signal_captured'),
    signalId: v.string(),
    createdAt: v.number(),
  }),
  demandCaptureError,
)

export const captureDemandSignal = mutationGeneric({
  args: {
    service: v.string(),
    suburb: v.string(),
    note: v.optional(v.string()),
    sourceSurface: v.literal('registry'),
    queryText: v.optional(v.string()),
  },
  returns: demandCaptureResult,
  handler: async () => unlistedRetiredListedTables(),
})

