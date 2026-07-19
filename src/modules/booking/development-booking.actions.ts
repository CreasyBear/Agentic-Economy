import { z } from 'zod'

import { defineAction } from '@/modules/common/action'

const developmentLabel = z.literal('MOCK/DEVELOPMENT ONLY')

export const developmentBookingInputSchema = z.object({
  environment: developmentLabel,
  slot: z.object({
    slotRef: z.string().min(1),
    providerRef: z.string().min(1),
    offeringRef: z.string().min(1),
    bindingRef: z.string().min(1),
    contractRef: z.string().min(1),
    actionVersion: z.literal('v1'),
    startsAt: z.string().datetime(),
    freshAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    termsDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    provenance: z.object({
      source: z.literal('mock_provider_availability'),
      observationRef: z.string().min(1),
      observedBy: z.string().min(1),
    }),
  }),
  customer: z.object({
    principalRef: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email(),
  }),
  disclosure: z.object({
    fields: z.tuple([z.literal('customer.name'), z.literal('customer.email')]),
    recipient: z.string().min(1),
    purpose: z.literal('create_development_reservation'),
  }),
  operationKey: z.string().min(1),
})

export type DevelopmentBookingInput = z.infer<typeof developmentBookingInputSchema>

export const developmentBookingOutputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('reservation_confirmed'),
    environment: developmentLabel,
    reservationRef: z.string().min(1),
    providerRef: z.string().min(1),
    slotRef: z.string().min(1),
    evidenceRef: z.string().min(1),
  }),
  z.object({
    kind: z.literal('reservation_refused'),
    environment: developmentLabel,
    code: z.enum(['slot_unavailable', 'terms_changed', 'provider_refused']),
    reason: z.string().min(1),
  }),
])

export type DevelopmentBookingResult = z.infer<typeof developmentBookingOutputSchema>

export const createDevelopmentReservationAction = defineAction({
  id: 'booking.createDevelopmentReservation',
  name: 'Create development reservation',
  summary: 'Creates one reservation against a fresh provider-supplied development slot.',
  boundaries: [
    'MOCK/DEVELOPMENT ONLY; this action has no customer-reachable surface.',
    'A confirmed result proves only the deterministic development provider response.',
    'A possible release must be reconciled before retry; cancellation is not reversal.',
  ],
  schema: developmentBookingInputSchema,
  parameters: [
    { name: 'slot', type: 'object', description: 'Fresh provider slot and exact supply identity.', required: true },
    { name: 'customer', type: 'object', description: 'Customer material disclosed for this reservation.', required: true },
    { name: 'disclosure', type: 'object', description: 'Exact recipient, fields and purpose.', required: true },
    { name: 'operationKey', type: 'string', description: 'Stable idempotency meaning for this exact reservation.', required: true },
  ],
  readOnly: false,
  surfaces: [],
  outputSchema: developmentBookingOutputSchema,
  invocationContract: {
    version: 'v1',
    consequenceClass: 'external_effect',
    materialInputPaths: [
      'slot.slotRef', 'slot.providerRef', 'slot.offeringRef', 'slot.bindingRef',
      'slot.contractRef', 'slot.actionVersion', 'slot.startsAt', 'slot.expiresAt',
      'slot.termsDigest', 'slot.provenance.observationRef',
      'customer.principalRef', 'customer.name', 'customer.email',
      'disclosure.fields', 'disclosure.recipient', 'disclosure.purpose', 'operationKey',
    ],
    authorityRequirement: 'principal',
    retryClass: 'reconcile_before_retry',
    expectedEvidence: ['provider reservation reference', 'attributable provider refusal'],
    safeContinuations: [
      'inspect the confirmed reservation or refusal',
      'reconcile a possible provider release before retry',
      'request provider cancellation when the provider contract supports it',
    ],
    invalidationConditions: [
      'slot freshness expires or any slot identity changes',
      'customer material or disclosure changes',
      'terms digest, principal, invocation, action version, or operation key changes',
    ],
    developmentAttemptTimeoutMs: 15_000,
    reconciliationEvidenceSource: 'booking.createDevelopmentReservation:mock-provider-observer:v1',
  },
  projectInvocationPreparation: (input) => ({
    dataUse: { fields: input.disclosure.fields, limits: { recipients: 1 } },
  }),
  classifyInvocationResult: (result) => result.kind === 'reservation_confirmed'
    ? { outcome: 'completed', referenceable: true }
    : { outcome: 'refused', referenceable: false },
  preReleaseCheck: async ({ data }) => {
    const input = developmentBookingInputSchema.parse(data)
    if (Date.parse(input.slot.expiresAt) <= Date.parse(input.slot.freshAt)) {
      return {
        kind: 'reservation_refused' as const,
        environment: 'MOCK/DEVELOPMENT ONLY' as const,
        code: 'slot_unavailable' as const,
        reason: 'The development slot was not fresh at preparation.',
      }
    }
    if (input.disclosure.recipient !== input.slot.providerRef) {
      return {
        kind: 'reservation_refused' as const,
        environment: 'MOCK/DEVELOPMENT ONLY' as const,
        code: 'provider_refused' as const,
        reason: 'The disclosed recipient does not match the selected provider.',
      }
    }
    return undefined
  },
  run: async ({ data, context }) => {
    const input = developmentBookingInputSchema.parse(data)
    const adapter = context.developmentOnlyBookingAdapter
    if (adapter === undefined) throw new Error('development_booking_adapter_unavailable')
    return developmentBookingOutputSchema.parse(await adapter(input))
  },
})
