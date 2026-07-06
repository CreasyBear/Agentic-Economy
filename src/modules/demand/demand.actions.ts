import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  captureDemandSignalThroughSource,
  demandCaptureInputSchema,
  type DemandCaptureServerResult,
} from '@/modules/demand/demand.functions'

const demandCaptureOutputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ok'),
    code: z.literal('demand_signal_captured'),
    signalId: z.string(),
    createdAt: z.number(),
  }).strict(),
  z.object({
    kind: z.literal('error'),
    code: z.enum(['demand_capture_failed', 'demand_capture_invalid_input', 'missing_convex_url']),
    retryable: z.boolean(),
    reason: z.string(),
    field: z.enum(['service', 'suburb', 'note', 'queryText']).optional(),
  }).strict(),
]) as z.ZodType<DemandCaptureServerResult>

const demandCaptureParameters: readonly ActionParameter[] = [
  {
    name: 'service',
    type: 'string',
    description: 'What the person needed. Plain text, 1-80 characters.',
    required: true,
  },
  {
    name: 'suburb',
    type: 'string',
    description: 'The suburb or local area where they needed it. Plain text, 1-80 characters.',
    required: true,
  },
  {
    name: 'note',
    type: 'string',
    description: 'Optional extra context, up to 280 characters.',
    required: false,
  },
  {
    name: 'queryText',
    type: 'string',
    description: 'Optional registry search text that led to the empty state.',
    required: false,
  },
]

export const demandCaptureAction = defineAction({
  id: 'demand.capture',
  name: 'Capture registry demand',
  summary:
    'Record what a person needed when the registry has no listed business for that area. ' +
    'Used to guide where AE expands published listings next.',
  boundaries: [
    'Does not book, charge, dispatch, or contact a business.',
    'Does not promise a match, notification, owner response, availability, quote, or job acceptance.',
    'Captures only the requested service, suburb, optional note, and registry search text.',
  ],
  schema: demandCaptureInputSchema,
  outputSchema: demandCaptureOutputSchema,
  parameters: demandCaptureParameters,
  readOnly: false,
  surfaces: ['ui', 'http'],
  run: async ({ data }) => captureDemandSignalThroughSource(data),
})
