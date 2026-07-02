import { z } from 'zod'

import {
  defineAction,
  type ActionParameter,
} from '@/modules/common/action'
import {
  ownerReplySchema,
  ownerThreadSchema,
  ownerVersionedSchema,
  publicInquirySubmitSchema,
  closeCurrentOwnerInquiryThroughSource,
  markCurrentOwnerInquiryReadThroughSource,
  readCurrentOwnerInboxThroughSource,
  readCurrentOwnerInquiryThreadThroughSource,
  replyCurrentOwnerInquiryThroughSource,
  submitPublicInquiryThroughSource,
  type OwnerInboxServerResult,
  type OwnerInquiryMutationServerResult,
  type OwnerInquiryThreadServerResult,
  type PublicInquirySubmitServerResult,
} from '@/modules/inquiries/inquiry.functions'

const emptyObjectSchema = z.object({}).default({})

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

const unknownRecordOutputSchema = z.record(z.string(), z.unknown())

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

const ownerInboxOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), inbox: unknownRecordOutputSchema }).passthrough(),
  serverErrorOutputSchema,
]) as z.ZodType<OwnerInboxServerResult>

const ownerInquiryThreadOutputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('ok'),
      detail: unknownRecordOutputSchema,
      delivery: unknownRecordOutputSchema,
      tombstones: z.array(unknownRecordOutputSchema),
    })
    .passthrough(),
  serverErrorOutputSchema,
]) as z.ZodType<OwnerInquiryThreadServerResult>

const ownerInquiryMutationOutputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('ok'),
      code: z.enum([
        'inquiry_read_marked',
        'inquiry_read_replayed',
        'inquiry_replied',
        'inquiry_reply_replayed',
        'inquiry_closed',
        'inquiry_close_replayed',
      ]),
      thread: z
        .object({
          threadId: z.string(),
          status: z.string(),
          version: z.number().int().nonnegative(),
          updatedAt: z.number(),
        })
        .passthrough(),
      message: z
        .object({
          messageId: z.string(),
          sender: z.enum(['customer', 'owner']),
          createdAt: z.number(),
        })
        .passthrough()
        .optional(),
      notification: z
        .object({
          notificationId: z.string(),
          status: z.string(),
          recipientRole: z.enum(['owner', 'customer']),
        })
        .passthrough()
        .optional(),
    })
    .passthrough(),
  serverErrorOutputSchema,
]) as z.ZodType<OwnerInquiryMutationServerResult>

/**
 * Public qualified inquiry — the first owned conversion event.
 *
 * Exposed to external assistants through the quiet agent-tools door so an
 * assistant can send a human inquiry on a person's behalf, within the same
 * refusal boundaries a human faces on the public form.
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
  surfaces: ['ui', 'http', 'agentJson', 'agentTools'],
  run: async ({ data, context }) =>
    submitPublicInquiryThroughSource(data, context) as Promise<PublicInquirySubmitServerResult>,
})

const ownerThreadParameters: readonly ActionParameter[] = [
  { name: 'threadId', type: 'string', description: 'The inquiry thread to read.', required: true },
]

const ownerVersionedParameters: readonly ActionParameter[] = [
  { name: 'threadId', type: 'string', description: 'The inquiry thread to mutate.', required: true },
  {
    name: 'expectedVersion',
    type: 'number',
    description: 'Optimistic concurrency version of the thread.',
    required: true,
  },
]

const ownerReplyParameters: readonly ActionParameter[] = [
  ...ownerVersionedParameters,
  { name: 'body', type: 'string', description: 'The owner reply text.', required: true },
]

export const readOwnerInboxAction = defineAction({
  id: 'inquiry.readOwnerInbox',
  name: 'Read owner inquiry inbox',
  summary: 'List inquiry threads for the currently signed-in owner. Owner-authenticated.',
  boundaries: ['Only callable by the authenticated owner.', 'Read-only.'],
  schema: emptyObjectSchema,
  outputSchema: ownerInboxOutputSchema,
  parameters: [],
  readOnly: true,
  surfaces: ['ui', 'http'],
  run: async () => readCurrentOwnerInboxThroughSource() as Promise<OwnerInboxServerResult>,
})

export const readOwnerInquiryThreadAction = defineAction({
  id: 'inquiry.readOwnerThread',
  name: 'Read one owner inquiry thread',
  summary: 'Read one inquiry thread, its delivery readback, and privacy tombstones for the signed-in owner.',
  boundaries: ['Only callable by the authenticated owner.', 'Read-only.'],
  schema: ownerThreadSchema,
  outputSchema: ownerInquiryThreadOutputSchema,
  parameters: ownerThreadParameters,
  readOnly: true,
  surfaces: ['ui', 'http'],
  run: async ({ data }) =>
    readCurrentOwnerInquiryThreadThroughSource(data.threadId) as Promise<OwnerInquiryThreadServerResult>,
})

export const replyOwnerInquiryAction = defineAction({
  id: 'inquiry.reply',
  name: 'Reply to an inquiry',
  summary: 'Record an owner reply to an inquiry thread. Owner-authenticated write.',
  boundaries: ['Only callable by the authenticated owner.', 'Does not book or charge; it sends a message.'],
  schema: ownerReplySchema,
  outputSchema: ownerInquiryMutationOutputSchema,
  parameters: ownerReplyParameters,
  readOnly: false,
  surfaces: ['ui', 'http'],
  run: async ({ data, context }) =>
    replyCurrentOwnerInquiryThroughSource(data, context) as Promise<OwnerInquiryMutationServerResult>,
})

export const markOwnerInquiryReadAction = defineAction({
  id: 'inquiry.markRead',
  name: 'Mark an inquiry read',
  summary: 'Mark an inquiry thread as read by the owner. Owner-authenticated write.',
  boundaries: ['Only callable by the authenticated owner.'],
  schema: ownerVersionedSchema,
  outputSchema: ownerInquiryMutationOutputSchema,
  parameters: ownerVersionedParameters,
  readOnly: false,
  surfaces: ['ui', 'http'],
  run: async ({ data, context }) =>
    markCurrentOwnerInquiryReadThroughSource(data, context) as Promise<OwnerInquiryMutationServerResult>,
})

export const closeOwnerInquiryAction = defineAction({
  id: 'inquiry.close',
  name: 'Close an inquiry',
  summary: 'Close an inquiry thread. Owner-authenticated write.',
  boundaries: ['Only callable by the authenticated owner.', 'Closing is not a booking outcome.'],
  schema: ownerVersionedSchema,
  outputSchema: ownerInquiryMutationOutputSchema,
  parameters: ownerVersionedParameters,
  readOnly: false,
  surfaces: ['ui', 'http'],
  run: async ({ data, context }) =>
    closeCurrentOwnerInquiryThroughSource(data, context) as Promise<OwnerInquiryMutationServerResult>,
})
