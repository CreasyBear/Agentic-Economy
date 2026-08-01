import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'

import type { PreviewCustomerRequestResult } from './application/public'
import { previewCustomerRequestThroughSource } from './plan-preview.functions'

const previewInputSchema = z.strictObject({
  customerJob: z.string().trim().min(1).max(200).describe('The outcome the customer wants in plain language'),
  network: z.string().trim().min(1).max(120).describe('The public service network to inspect'),
})

const destinationSchema = z.strictObject({ label: z.string(), request: z.string() })
const previewStepSchema = z.strictObject({
  step: z.number().int().positive(),
  title: z.string(),
  purpose: z.string(),
  dependsOn: z.array(z.number().int().positive()),
  offeringRefs: z.array(z.string()),
})
const previewOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('preview'),
    destination: destinationSchema,
    steps: z.array(previewStepSchema),
    expiresAt: z.number(),
    authority: z.literal('inspect_only'),
  }),
  z.strictObject({
    kind: z.literal('needs_information'),
    prompt: z.string(),
    destination: destinationSchema,
  }),
  z.strictObject({
    kind: z.literal('unavailable'),
    reason: z.enum(['no_current_supply', 'preview_unavailable', 'options_changed']),
    destination: destinationSchema,
  }),
])

const parameters: readonly ActionParameter[] = [
  { name: 'customerJob', type: 'string', description: 'The outcome the customer wants in plain language.', required: true },
  { name: 'network', type: 'string', description: 'The public service network to inspect.', required: true },
]

export const customerRequestPlanPreviewAction = defineAction({
  id: 'customerRequest.planPreview',
  name: 'Preview a customer plan',
  summary: 'Turn a plain-language ask into inspect-only steps before a Request is started.',
  boundaries: [
    'Read-only. Does not create a Request, contact a business, reserve timing, charge, dispatch, or fulfil work.',
    'Returns only a bounded consumer-neutral preview; it does not expose route plans, capabilities, bindings, or registry digests.',
    'Search and quote options remain inspect-only and need fresh confirmation before any future consequential action.',
  ],
  schema: previewInputSchema,
  outputSchema: previewOutputSchema as z.ZodType<PreviewCustomerRequestResult>,
  parameters,
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['ui'],
  run: async ({ data }) => previewCustomerRequestThroughSource(data),
})
