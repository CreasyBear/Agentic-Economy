import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callPublicSourceMutation, ConvexSourceError, sourceMutation } from '@/lib/server/convex-source'

const optionalDemandNoteSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim().length === 0) {
      return undefined
    }
    return value
  },
  z.string().trim().max(280).optional(),
)

const optionalDemandQueryTextSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim().length === 0) {
      return undefined
    }
    return value
  },
  z.string().trim().max(120).optional(),
)

export const demandCaptureInputSchema = z.strictObject({
  service: z.string().trim().min(1).max(80),
  suburb: z.string().trim().min(1).max(80),
  note: optionalDemandNoteSchema,
  queryText: optionalDemandQueryTextSchema,
})

export type DemandCaptureInput = z.infer<typeof demandCaptureInputSchema>

export type DemandCaptureServerResult =
  | {
      kind: 'ok'
      code: 'demand_signal_captured'
      signalId: string
      createdAt: number
    }
  | DemandCaptureErrorResult

type DemandCaptureErrorResult = {
  kind: 'error'
  code: 'demand_capture_failed' | 'demand_capture_invalid_input' | 'missing_convex_url'
  retryable: boolean
  reason: string
  field?: 'service' | 'suburb' | 'note' | 'queryText'
}

type DemandCaptureMutationInput = DemandCaptureInput & {
  sourceSurface: 'registry'
}

const captureDemandSignalMutation = sourceMutation<DemandCaptureMutationInput, DemandCaptureServerResult>(
  'demand:captureDemandSignal'
)

export const captureDemandSignalServer = createServerFn({ method: 'POST' })
  .validator((data) => demandCaptureInputSchema.parse(data))
  .handler(async ({ data }) => captureDemandSignalThroughSource(data))

export async function captureDemandSignalThroughSource(
  data: DemandCaptureInput
): Promise<DemandCaptureServerResult> {
  try {
    return await callPublicSourceMutation(captureDemandSignalMutation, {
      service: data.service,
      suburb: data.suburb,
      sourceSurface: 'registry',
      ...(data.note === undefined ? {} : { note: data.note }),
      ...(data.queryText === undefined ? {} : { queryText: data.queryText }),
    })
  } catch (error) {
    return demandCaptureSourceError(error)
  }
}

function demandCaptureSourceError(error: unknown): DemandCaptureErrorResult {
  if (error instanceof ConvexSourceError && error.code === 'missing_convex_url') {
    return {
      kind: 'error',
      code: 'missing_convex_url',
      retryable: true,
      reason: error.message,
    }
  }

  return {
    kind: 'error',
    code: 'demand_capture_failed',
    retryable: true,
    reason: 'Demand signal could not be recorded right now.',
  }
}
