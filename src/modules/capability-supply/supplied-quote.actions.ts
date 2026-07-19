import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const contractRefSchema = z.strictObject({
  capabilityId: z.string().trim().min(1).max(200),
  version: z.number().int().positive(),
  contractDigest: digestSchema,
})
const candidateSchema = z.strictObject({
  publicationRef: z.string().trim().min(1).max(240),
  revision: z.number().int().nonnegative(),
  businessId: z.string().trim().min(1).max(240),
  offeringId: z.string().trim().min(1).max(240),
  bindingId: z.string().trim().min(1).max(240),
  contractRef: contractRefSchema,
})

export const suppliedCandidateQuoteInputSchema = z.strictObject({
  target: candidateSchema,
  qualificationDigest: digestSchema,
  qualificationValidUntil: z.number().int().positive(),
  quoteRequest: z.strictObject({
    serviceReference: z.string().trim().min(1).max(500),
    requestedFields: z.array(z.string().trim().min(1).max(120)).min(1).max(32),
    constraints: z.record(z.string().trim().min(1).max(120), z.string().max(1_000))
      .refine((value) => Object.keys(value).length <= 32),
  }),
  disclosure: z.strictObject({
    fields: z.array(z.string().trim().min(1).max(160)).min(1).max(64),
    limits: z.record(z.string().trim().min(1).max(160), z.number().int().positive())
      .refine((value) => Object.keys(value).length <= 64),
    purpose: z.literal('request_development_quote'),
  }),
  operationKey: z.string().trim().min(1).max(240),
})

export const suppliedCandidateQuoteOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('quote_returned'),
    environment: z.literal('MOCK/DEVELOPMENT ONLY'),
    quote: z.strictObject({
      quoteRef: z.string().trim().min(1).max(240),
      price: z.strictObject({
        amountMinor: z.number().int().nonnegative(),
        currency: z.string().regex(/^[A-Z]{3}$/),
      }),
      validUntil: z.number().int().positive(),
      terms: z.array(z.string().max(500)).max(32),
      evidenceRefs: z.array(z.string().trim().min(1).max(240)).min(1).max(32),
    }),
  }),
  z.strictObject({
    kind: z.literal('refused'),
    environment: z.literal('MOCK/DEVELOPMENT ONLY'),
    code: z.string().trim().min(1).max(120),
    reason: z.string().trim().min(1).max(500),
  }),
])

export type SuppliedCandidateQuoteInput = z.infer<typeof suppliedCandidateQuoteInputSchema>
export type SuppliedCandidateQuoteResult = z.infer<typeof suppliedCandidateQuoteOutputSchema>

const parameters: readonly ActionParameter[] = [
  { name: 'target', type: 'object', description: 'Exact currently qualified supplied candidate.', required: true },
  { name: 'quoteRequest', type: 'object', description: 'Material quote request and constraints.', required: true },
  { name: 'disclosure', type: 'object', description: 'Exact fields, limits, and purpose requiring authority.', required: true },
  { name: 'operationKey', type: 'string', description: 'Stable idempotency identity for the exact attempt.', required: true },
]

export const collectSuppliedCandidateQuoteAction = defineAction({
  id: 'supply.collectDevelopmentQuote',
  name: 'Collect a supplied-candidate development quote',
  summary: 'Request one structured quote from an exactly qualified supplied candidate using labelled development data.',
  boundaries: [
    'Development-only: no public route, real provider call, availability, acceptance, fulfilment, or customer-value claim.',
    'Requires a current eligible qualification for the exact candidate.',
    'Returned fixture data is contract evidence only and is not an independently operated provider response.',
    'Possible provider release must be reconciled before retry.',
  ],
  schema: suppliedCandidateQuoteInputSchema,
  outputSchema: suppliedCandidateQuoteOutputSchema,
  parameters,
  readOnly: false,
  surfaces: [],
  invocationContract: {
    version: 'supply.collectDevelopmentQuote:v1',
    consequenceClass: 'external_effect',
    materialInputPaths: [
      'target', 'qualificationDigest', 'qualificationValidUntil', 'quoteRequest',
      'disclosure', 'operationKey',
    ],
    authorityRequirement: 'principal',
    retryClass: 'reconcile_before_retry',
    expectedEvidence: ['structured development quote with evidence references', 'attributable provider refusal'],
    safeContinuations: ['inspect the returned development quote or refusal', 'reconcile a possible provider release before retry'],
    invalidationConditions: [
      'qualification expires or changes', 'candidate or contract reference changes',
      'quote request or disclosure changes', 'principal, caller, origin, or invocation changes',
      'authority expires',
    ],
  },
  projectInvocationPreparation: (input) => ({
    dataUse: { fields: [...input.disclosure.fields], limits: { ...input.disclosure.limits } },
  }),
  run: async ({ data, context }) => {
    const parsed = suppliedCandidateQuoteInputSchema.parse(data)
    const adapter = context.developmentOnlySuppliedQuoteAdapter
    if (adapter === undefined) throw new Error('development_quote_adapter_unavailable')
    return suppliedCandidateQuoteOutputSchema.parse(await adapter(parsed))
  },
})
