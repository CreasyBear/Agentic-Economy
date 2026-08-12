import { z } from 'zod'

import { exactAmountSchema } from '@/modules/money/public'
import { identifier } from '@/modules/capability-contract/public'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import { qualifySuppliedCandidate } from './internal/graph/qualify-candidate'
import type { CapabilityGraphPorts } from './internal/graph/ports'

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const contractRefSchema = z.strictObject({
  capabilityId: identifier,
  version: z.number().int().positive(),
  contractDigest: digestSchema,
})
const candidateSchema = z.strictObject({
  publicationRef: z.string().trim().min(1).max(240),
  revision: z.number().int().nonnegative(),
  networkId: z.string().trim().min(1).max(240),
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
      price: exactAmountSchema,
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
export type DevelopmentQuoteProviderRequest = Readonly<{
  target: SuppliedCandidateQuoteInput['target']
  operationKey: string
  request: Readonly<{
    serviceReference: string
    constraints: Readonly<Record<string, string>>
  }>
}>

export type QuoteDisclosureValidation =
  | Readonly<{
      kind: 'valid'
      providerRequest: DevelopmentQuoteProviderRequest
      fields: readonly string[]
      limits: Readonly<Record<string, number>>
    }>
  | Readonly<{ kind: 'invalid'; code:
      | 'disclosure_fields_mismatch'
      | 'disclosure_limits_mismatch'
      | 'disclosed_value_over_limit'
    }>

export function validateDevelopmentQuoteDisclosure(
  input: SuppliedCandidateQuoteInput,
): QuoteDisclosureValidation {
  const fields = [
    'quoteRequest.serviceReference',
    ...Object.keys(input.quoteRequest.constraints)
      .sort()
      .map((key) => `quoteRequest.constraints.${key}`),
  ]
  const declaredFields = [...input.disclosure.fields]
  if (
    new Set(declaredFields).size !== declaredFields.length
    || [...declaredFields].sort().join('\0') !== [...fields].sort().join('\0')
  ) return { kind: 'invalid', code: 'disclosure_fields_mismatch' }
  if (
    Object.keys(input.disclosure.limits).sort().join('\0') !== [...fields].sort().join('\0')
  ) return { kind: 'invalid', code: 'disclosure_limits_mismatch' }
  const values = new Map<string, string>([
    ['quoteRequest.serviceReference', input.quoteRequest.serviceReference],
    ...Object.entries(input.quoteRequest.constraints)
      .map(([key, value]) => [`quoteRequest.constraints.${key}`, value] as const),
  ])
  if (fields.some((field) => {
    const value = values.get(field)
    const limit = input.disclosure.limits[field]
    if (value === undefined || limit === undefined) {
      throw new Error('development_quote_disclosure_invariant')
    }
    return value.length > limit
  })) {
    return { kind: 'invalid', code: 'disclosed_value_over_limit' }
  }
  return {
    kind: 'valid',
    fields,
    limits: { ...input.disclosure.limits },
    providerRequest: {
      target: input.target,
      operationKey: input.operationKey,
      request: {
        serviceReference: input.quoteRequest.serviceReference,
        constraints: { ...input.quoteRequest.constraints },
      },
    },
  }
}

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
  effect: {
    class: 'comparison_quote',
    reversible: true,
    recipientKind: 'provider_system',
    dataClasses: ['service_reference', 'constraints'],
    spendExposure: 'none',
    approval: 'mandate_eligible',
  },
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
    developmentAttemptTimeoutMs: 15_000,
    reconciliationEvidenceSource: 'supply.collectDevelopmentQuote:provider-observer:v1',
  },
  projectInvocationPreparation: (input) => ({
    dataUse: (() => {
      const disclosure = validateDevelopmentQuoteDisclosure(input)
      return disclosure.kind === 'valid'
        ? { fields: disclosure.fields, limits: disclosure.limits }
        : { fields: [], limits: {} }
    })(),
  }),
  classifyInvocationResult: (result) => result.kind === 'quote_returned'
    ? { outcome: 'completed', referenceable: true }
    : { outcome: 'refused', referenceable: false },
  preReleaseCheck: async ({ data, context }) => {
    const input = suppliedCandidateQuoteInputSchema.parse(data)
    const disclosure = validateDevelopmentQuoteDisclosure(input)
    if (disclosure.kind === 'invalid') {
      return {
        kind: 'refused' as const,
        environment: 'MOCK/DEVELOPMENT ONLY' as const,
        code: disclosure.code,
        reason: 'The provider-visible quote request is not exactly covered by the authorized disclosure.',
      }
    }
    const ports = context.developmentOnlySuppliedQuoteQualificationPorts as CapabilityGraphPorts | undefined
    const now = context.developmentOnlySuppliedQuoteNow?.()
    if (ports === undefined || now === undefined) {
      return {
        kind: 'refused' as const,
        environment: 'MOCK/DEVELOPMENT ONLY' as const,
        code: 'qualification_source_unavailable',
        reason: 'Current supplied-candidate evidence could not be checked immediately before release.',
      }
    }
    const qualification = await qualifySuppliedCandidate(ports, {
      candidate: input.target,
      now,
    })
    if (
      qualification.status !== 'eligible'
      || qualification.validUntil === undefined
      || now >= qualification.validUntil
      || qualification.validUntil !== input.qualificationValidUntil
      || qualification.qualificationDigest !== input.qualificationDigest
    ) {
      return {
        kind: 'refused' as const,
        environment: 'MOCK/DEVELOPMENT ONLY' as const,
        code: 'qualification_changed_before_release',
        reason: 'The supplied candidate changed or expired after authority and before release.',
      }
    }
    return undefined
  },
  run: async ({ data, context }) => {
    const parsed = suppliedCandidateQuoteInputSchema.parse(data)
    const disclosure = validateDevelopmentQuoteDisclosure(parsed)
    if (disclosure.kind === 'invalid') throw new Error('development_quote_disclosure_not_validated')
    const adapter = context.developmentOnlySuppliedQuoteAdapter
    if (adapter === undefined) throw new Error('development_quote_adapter_unavailable')
    return suppliedCandidateQuoteOutputSchema.parse(await adapter(disclosure.providerRequest))
  },
})
