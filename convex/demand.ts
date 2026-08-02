import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'

import { admissionKey, assertAdmission } from './lib/rateLimit'
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
    signalId: v.id('demandSignals'),
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
  handler: async (ctx, args) => {
    const service = args.service.trim()
    if (service.length < 1 || service.length > 80) {
      return invalidDemandInput('service', 'Service must be 1-80 characters.')
    }

    const suburb = args.suburb.trim()
    if (suburb.length < 1 || suburb.length > 80) {
      return invalidDemandInput('suburb', 'Suburb must be 1-80 characters.')
    }

    const note = args.note?.trim()
    if (note !== undefined && note.length > 280) {
      return invalidDemandInput('note', 'Note must be 280 characters or fewer.')
    }

    const queryText = args.queryText?.trim()
    if (queryText !== undefined && queryText.length > 120) {
      return invalidDemandInput('queryText', 'Registry search text must be 120 characters or fewer.')
    }

    const admission = await assertAdmission(ctx, {
      name: 'public-mutation',
      key: await admissionKey(ctx, `demand:${args.sourceSurface}`),
    })
    if (!admission.ok) {
      return {
        kind: 'error' as const,
        code: 'demand_capture_failed' as const,
        retryable: true,
        reason: `Retry after ${admission.retryAfter}.`,
      }
    }

    const createdAt = Date.now()
    const signalId = await ctx.db.insert('demandSignals', {
      service,
      suburb,
      createdAt,
      sourceSurface: args.sourceSurface,
      ...(note === undefined || note.length === 0 ? {} : { note }),
      ...(queryText === undefined || queryText.length === 0 ? {} : { queryText }),
    })

    return {
      kind: 'ok' as const,
      code: 'demand_signal_captured' as const,
      signalId,
      createdAt,
    }
  },
})

function invalidDemandInput(
  field: 'service' | 'suburb' | 'note' | 'queryText',
  reason: string,
) {
  return {
    kind: 'error' as const,
    code: 'demand_capture_invalid_input' as const,
    retryable: false,
    reason,
    field,
  }
}
