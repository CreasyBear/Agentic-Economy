import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  publicInquirySubmitSchema,
  readCustomerRecordThroughSource,
  submitPublicInquiryThroughSource,
  type CustomerInquiryRecordServerResult,
  type PublicInquirySubmitServerResult,
} from '@/modules/inquiries/inquiry.functions'

const serverErrorOutputSchema = z.strictObject({
  kind: z.literal('error'),
  code: z.string(),
  retryable: z.boolean(),
  reason: z.string(),
  field: z.string().optional(),
  retryAfter: z.number().optional(),
})

const publicInquirySubmitOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('ok'),
    code: z.enum(['inquiry_submitted', 'inquiry_replayed']),
    receipt: z.strictObject({
      threadId: z.string(),
      businessId: z.string(),
      serviceId: z.string(),
      status: z.string(),
      version: z.number().int().nonnegative(),
      notificationId: z.string(),
      notificationStatus: z.string(),
      accessKey: z.string(),
    }),
  }),
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
    description:
      'Identifier of the published business the inquiry is for. Provide with target.serviceId, or use target.businessSlug + target.serviceSlug instead.',
    required: false,
  },
  {
    name: 'target.serviceId',
    type: 'string',
    description:
      'Identifier of the published service the inquiry is about. Pairs with target.businessId.',
    required: false,
  },
  {
    name: 'target.businessSlug',
    type: 'string',
    description:
      'Public slug of the business, as read from a listing. Provide with target.serviceSlug when you do not have identifiers.',
    required: false,
  },
  {
    name: 'target.serviceSlug',
    type: 'string',
    description:
      'Public slug of the service on that business, as read from a listing. Pairs with target.businessSlug.',
    required: false,
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
  {
    name: 'expectedDigest',
    type: 'string',
    description: 'SHA-256 digest of the exact reviewed governed-send payload, formatted as sha256:<64 lowercase hexadecimal characters>.',
    required: true,
  },
]

// Route-boundary caps for inquiry.submit, checked ahead of (and stricter than) the domain caps
// in internal/commands.ts / internal/schema.ts, so oversized agent payloads are rejected before
// a Convex mutation is ever attempted. `body` matches the source-owned
// defaultInquiryOperatorControls.maxBodyLength (2_000 chars). The domain has no length cap for
// contact fields today, so these use generous, standard upper bounds (RFC 5321 email length,
// a formatted international phone number, a normal display name).
const agentToolInquirySubmitSchema = publicInquirySubmitSchema.extend({
  body: z.string().max(2_000),
  contact: z.strictObject({
    name: z.string().max(200).optional(),
    email: z.string().max(254).optional(),
    phone: z.string().max(32).optional(),
  }),
})


const readCustomerRecordInputSchema = z.strictObject({
  threadId: z.string().trim().min(1).max(240),
  accessKey: z.string().trim().min(16).max(256),
})

const customerRecordOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('ok'),
    code: z.literal('inquiry_customer_record_read'),
    record: z.strictObject({
      schemaVersion: z.literal('inquiry-customer-record:v1'),
      threadId: z.string(),
      business: z.strictObject({ name: z.string(), slug: z.string() }),
      submitted: z.strictObject({ messageSummary: z.string(), submittedAt: z.number() }),
      governedSend: z.strictObject({
        digest: z.string(),
        fields: z.array(z.strictObject({
          key: z.enum([
            'businessId',
            'serviceId',
            'capabilityKind',
            'body',
            'contactName',
            'contactEmail',
            'contactPhone',
            'originThreadId',
          ]),
          label: z.string(),
          value: z.string().nullable(),
        })),
      }).optional(),
      delivery: z.strictObject({
        state: z.enum(['queued', 'sent', 'failed', 'held']),
        label: z.string(),
        updatedAt: z.number(),
      }),
      timeline: z.array(z.strictObject({
        key: z.enum(['received', 'sent_to_business', 'business_replied', 'closed']),
        label: z.string(),
        detail: z.string(),
        status: z.enum(['complete', 'current', 'pending']),
        timestamp: z.number().optional(),
      })),
      reply: z.strictObject({ body: z.string(), createdAt: z.number() }).optional(),
      closedAt: z.number().optional(),
      updatedAt: z.number(),
    }),
  }),
  serverErrorOutputSchema,
]) as z.ZodType<CustomerInquiryRecordServerResult>

const readCustomerRecordParameters: readonly ActionParameter[] = [
  {
    name: 'threadId',
    type: 'string',
    description: 'Inquiry record id from the customer receipt link.',
    required: true,
  },
  {
    name: 'accessKey',
    type: 'string',
    description: 'Private access key from the customer receipt link. The thread id alone is not enough.',
    required: true,
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
    'When the target names a business slug, a refusal returns a handoffUrl to that listing\'s inquiry form, prefilled with the message, so a person can send it for owner review.',
  ],
  schema: agentToolInquirySubmitSchema,
  outputSchema: publicInquirySubmitOutputSchema,
  parameters: submitParameters,
  readOnly: false,
  effect: {
    class: 'disclosure',
    reversible: false,
    recipientKind: 'business',
    dataClasses: ['contact', 'query_text'],
    spendExposure: 'none',
    approval: 'mandate_eligible',
  },
  surfaces: ['agentJson'],
  invocationContract: {
    version: 'inquiry.submit:v1',
    consequenceClass: 'communication',
    materialInputPaths: [
      'target',
      'body',
      'contact',
      'expectedDigest',
      'operationKey',
      'inquiryOrigin',
    ],
    authorityRequirement: 'principal',
    retryClass: 'attributable_retry',
    expectedEvidence: [
      'attributable inquiry receipt',
      'notification queue state',
    ],
    safeContinuations: [
      'inspect the returned customer inquiry record',
      'wait for human owner review',
    ],
    invalidationConditions: [
      'material inquiry input changes',
      'target changes',
      'authority expires',
      'principal or caller changes',
      'origin changes',
    ],
    developmentAttemptTimeoutMs: 30_000,
    reconciliationEvidenceSource: 'inquiry.submit:delivery-observer:v1',
  },
  projectInvocationPreparation: (input) => {
    const contactFields = Object.keys(input.contact)
      .filter((key) => input.contact[key as keyof typeof input.contact] !== undefined)
      .map((key) => `contact.${key}`)
    const allLimits = {
      body: 2_000,
      'contact.name': 200,
      'contact.email': 254,
      'contact.phone': 32,
    }
    const fields = ['body', ...contactFields]
    return {
      dataUse: {
        fields,
        limits: Object.fromEntries(fields.map((field) => [field, allLimits[field as keyof typeof allLimits]])),
      },
    }
  },
  classifyInvocationResult: (result) => {
    if (result.kind === 'error') return { outcome: 'refused', referenceable: false }
    return result.receipt.notificationStatus === 'queued'
      ? { outcome: 'queued_communication', referenceable: true }
      : { outcome: 'completed', referenceable: true }
  },
  run: async ({ data, context }) =>
    submitPublicInquiryThroughSource(data, context) as Promise<PublicInquirySubmitServerResult>,
})


export const readCustomerRecordAction = defineAction({
  id: 'inquiry.readCustomerRecord',
  name: 'Read a customer inquiry record',
  summary:
    'Read the customer-facing inquiry record using the receipt thread id and private access key. ' +
    'Returns the written handoff status, business identity, and any business reply saved on the record.',
  boundaries: [
    'Read-only. The thread id alone never grants access; the private access key is required.',
    'Returns business identity, delivery state, the exact authorized submitted fields when verified, and business reply text.',
    'Does not expose owner private data, unshared customer details, booking, payment, dispatch, or job acceptance.',
  ],
  schema: readCustomerRecordInputSchema,
  outputSchema: customerRecordOutputSchema,
  parameters: readCustomerRecordParameters,
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'agentJson'],
  run: async ({ data }) => readCustomerRecordThroughSource(data),
})
