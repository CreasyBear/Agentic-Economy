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
  parameters: ownerVersionedParameters,
  readOnly: false,
  surfaces: ['ui', 'http'],
  run: async ({ data, context }) =>
    closeCurrentOwnerInquiryThroughSource(data, context) as Promise<OwnerInquiryMutationServerResult>,
})
