import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  publicInquirySubmitSchema,
  submitPublicInquiryThroughSource,
  type PublicInquirySubmitServerResult,
} from '@/modules/inquiries/inquiry.functions'

const serverErrorOutputSchema = z
  .object({
    kind: z.literal('error'),
    code: z.string(),
    retryable: z.boolean(),
    reason: z.string(),
    field: z.string().optional(),
    retryAfter: z.number().optional(),
  })
  .passthrough()

const publicInquirySubmitOutputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('ok'),
      code: z.enum(['inquiry_submitted', 'inquiry_replayed']),
      receipt: z
        .object({
          threadId: z.string(),
          businessId: z.string(),
          serviceId: z.string(),
          status: z.string(),
          version: z.number().int().nonnegative(),
          notificationId: z.string(),
          notificationStatus: z.string(),
        })
        .passthrough(),
    })
    .passthrough(),
  serverErrorOutputSchema,
]) as z.ZodType<PublicInquirySubmitServerResult>

/**
 * Public qualified inquiry — the first owned conversion event.
 *
 * This is the only current write in the quiet assistant action registry. Human
 * inquiry and owner-inbox UI flows stay on authenticated TanStack server
 * functions because they need route, owner, and source-write context rather
 * than a generic action runner.
 */
const submitParameters: readonly ActionParameter[] = [
  {
    name: 'target.businessId',
    type: 'string',
    description: 'The published business the inquiry is for.',
    required: true,
  },
  {
    name: 'target.serviceId',
    type: 'string',
    description: 'The published service the inquiry is about.',
    required: true,
  },
  {
    name: 'target.capabilityKind',
    type: 'enum',
    description: 'The published contact capability the person is using.',
    enum: ['phone_inquiry', 'quote_request', 'emergency_callout_interest', 'ae_hosted_discovery'],
    required: true,
  },
  {
    name: 'body',
    type: 'string',
    description: 'What the person needs help with. Plain text, no booking or payment intent.',
    required: true,
  },
  {
    name: 'contact.name',
    type: 'string',
    description: 'Optional name to help the owner reply.',
    required: false,
  },
  {
    name: 'contact.email',
    type: 'string',
    description: 'Private reply channel. Never shown on public pages.',
    required: false,
  },
  {
    name: 'contact.phone',
    type: 'string',
    description: 'Private reply channel. Use when a phone reply is better.',
    required: false,
  },
]

export const submitInquiryAction = defineAction({
  id: 'inquiry.submit',
  name: 'Submit a qualified inquiry',
  summary:
    'Send a human first-contact inquiry to a published business for owner review. ' +
    'Returns a receipt and delivery state. This is the only owned conversion action AE exposes today.',
  boundaries: [
    'Does not book, charge, dispatch, or auto-fulfil. It records a message for a human owner.',
    'Availability, quote, and job acceptance still need a human reply.',
    'Refuse to call this if the person wants instant booking, payment, or autonomous execution.',
    'Use one of phone_inquiry / quote_request / emergency_callout_interest / ae_hosted_discovery as the capability kind, matching what the listing publishes.',
  ],
  schema: publicInquirySubmitSchema,
  outputSchema: publicInquirySubmitOutputSchema,
  parameters: submitParameters,
  readOnly: false,
  surfaces: ['agentJson', 'agentTools'],
  run: async ({ data, context }) =>
    submitPublicInquiryThroughSource(data, context) as Promise<PublicInquirySubmitServerResult>,
})
