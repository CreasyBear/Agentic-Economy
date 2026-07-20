import { z } from 'zod'

import { defineAction } from '../../../../src/modules/common/action'
import { developmentProviderOperationDependencies } from './development-provider-operation-context'

const developmentLabel = z.literal('MOCK/DEVELOPMENT ONLY')

export const developmentProviderOperationInputSchema = z.object({
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
    purpose: z.literal('create_development_effect'),
  }),
  operationKey: z.string().min(1),
})

export type DevelopmentProviderOperationInput = z.infer<typeof developmentProviderOperationInputSchema>

export const developmentProviderOperationOutputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('effect_confirmed'),
    environment: developmentLabel,
    effectRef: z.string().min(1),
    providerRef: z.string().min(1),
    slotRef: z.string().min(1),
    evidenceRef: z.string().min(1),
  }),
  z.object({
    kind: z.literal('effect_refused'),
    environment: developmentLabel,
    code: z.enum(['slot_unavailable', 'terms_changed', 'provider_refused']),
    reason: z.string().min(1),
  }),
])

export type DevelopmentProviderOperationResult = z.infer<typeof developmentProviderOperationOutputSchema>

export const executeDevelopmentProviderOperationAction = defineAction({
  id: 'provider_operation.executeDevelopmentCancellable',
  name: 'Create development effect',
  summary: 'Creates one effect against a fresh provider-supplied development slot.',
  boundaries: [
    'MOCK/DEVELOPMENT ONLY; this action has no customer-reachable surface.',
    'A confirmed result proves only the deterministic development provider response.',
    'A possible release must be reconciled before retry; cancellation is not reversal.',
  ],
  schema: developmentProviderOperationInputSchema,
  parameters: [
    { name: 'slot', type: 'object', description: 'Fresh provider slot and exact supply identity.', required: true },
    { name: 'customer', type: 'object', description: 'Customer material disclosed for this effect.', required: true },
    { name: 'disclosure', type: 'object', description: 'Exact recipient, fields and purpose.', required: true },
    { name: 'operationKey', type: 'string', description: 'Stable idempotency meaning for this exact effect.', required: true },
  ],
  readOnly: false,
  surfaces: [],
  outputSchema: developmentProviderOperationOutputSchema,
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
    expectedEvidence: ['provider effect reference', 'attributable provider refusal'],
    safeContinuations: [
      'inspect the confirmed effect or refusal',
      'reconcile a possible provider release before retry',
      'request provider cancellation when the provider contract supports it',
    ],
    invalidationConditions: [
      'slot freshness expires or any slot identity changes',
      'customer material or disclosure changes',
      'terms digest, principal, invocation, action version, or operation key changes',
    ],
    developmentAttemptTimeoutMs: 15_000,
    reconciliationEvidenceSource: 'provider_operation.executeDevelopmentCancellable:mock-provider-observer:v1',
  },
  projectInvocationPreparation: (input) => ({
    dataUse: { fields: input.disclosure.fields, limits: { recipients: 1 } },
  }),
  classifyInvocationResult: (result) => result.kind === 'effect_confirmed'
    ? { outcome: 'completed', referenceable: true }
    : { outcome: 'refused', referenceable: false },
  preReleaseCheck: async ({ data, context }) => {
    const input = developmentProviderOperationInputSchema.parse(data)
    const dependencies = developmentProviderOperationDependencies(context)
    const now = dependencies.now?.()
    const check = dependencies.checkAvailability
    if (now === undefined || check === undefined) {
      return {
        kind: 'effect_refused' as const,
        environment: 'MOCK/DEVELOPMENT ONLY' as const,
        code: 'slot_unavailable' as const,
        reason: 'Trusted current availability could not be checked before provider release.',
      }
    }
    if (
      input.customer.principalRef !== dependencies.authorityPrincipalRef
    ) {
      return {
        kind: 'effect_refused' as const,
        environment: 'MOCK/DEVELOPMENT ONLY' as const,
        code: 'provider_refused' as const,
        reason: 'The disclosed operation principal does not match the authority-bound principal.',
      }
    }
    if (now >= Date.parse(input.slot.expiresAt)) {
      return {
        kind: 'effect_refused' as const,
        environment: 'MOCK/DEVELOPMENT ONLY' as const,
        code: 'slot_unavailable' as const,
        reason: 'The development slot expired before provider release.',
      }
    }
    if (input.disclosure.recipient !== input.slot.providerRef) {
      return {
        kind: 'effect_refused' as const,
        environment: 'MOCK/DEVELOPMENT ONLY' as const,
        code: 'provider_refused' as const,
        reason: 'The disclosed recipient does not match the selected provider.',
      }
    }
    const availability = await check(input, now)
    if (availability.kind !== 'current') {
      return {
        kind: 'effect_refused' as const,
        environment: 'MOCK/DEVELOPMENT ONLY' as const,
        code: 'terms_changed' as const,
        reason: availability.reason,
      }
    }
    return undefined
  },
  run: async ({ data, context }) => {
    const input = developmentProviderOperationInputSchema.parse(data)
    const adapter = developmentProviderOperationDependencies(context).execute
    if (adapter === undefined) throw new Error('development_provider_operation_adapter_unavailable')
    return developmentProviderOperationOutputSchema.parse(await adapter(input))
  },
})

export const developmentProviderOperationCancellationInputSchema = z.object({
  environment: developmentLabel,
  effectRef: z.string().min(1),
  providerRef: z.string().min(1),
  principalRef: z.string().min(1),
  reason: z.string().min(1),
  operationKey: z.string().min(1),
})

export type DevelopmentProviderOperationCancellationInput = z.infer<typeof developmentProviderOperationCancellationInputSchema>

export const developmentProviderOperationCancellationOutputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('effect_cancellation_confirmed'),
    environment: developmentLabel,
    effectRef: z.string().min(1),
    cancellationRef: z.string().min(1),
    evidenceRef: z.string().min(1),
    exposureReleaseAttestation: z.object({
      material: z.object({
        format: z.literal('ae.exposure-release-attestation:v1'),
        evidenceRule: z.object({
          evidenceRuleRef: z.string().min(1),
          source: z.string().min(1),
          version: z.string().min(1),
        }),
        providerRef: z.string().min(1),
        originalEffect: z.object({
          action: z.object({ id: z.string().min(1), version: z.string().min(1) }),
          subjectRef: z.string().min(1),
          resultRef: z.string().min(1),
          evidenceDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        }),
        cancellationEffect: z.object({
          action: z.object({ id: z.string().min(1), version: z.string().min(1) }),
          subjectRef: z.string().min(1),
          resultRef: z.string().min(1),
          evidenceDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        }),
        outcome: z.literal('provider_confirmed_reversal'),
        reversedAmount: z.object({
          amountMinor: z.number().int().nonnegative(),
          currency: z.string().min(1),
        }),
        observedAt: z.string().datetime(),
      }),
      digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      signature: z.object({
        signingKeyId: z.string().min(1),
        signingPublicKey: z.string().regex(/^[a-f0-9]{64}$/),
        signature: z.string().regex(/^ed25519:[a-f0-9]{128}$/),
      }),
    }).optional(),
  }),
  z.object({
    kind: z.literal('effect_cancellation_refused'),
    environment: developmentLabel,
    code: z.enum(['principal_mismatch', 'provider_record_unavailable', 'provider_record_mismatch', 'operation_key_conflict']),
    reason: z.string().min(1),
  }),
])

export type DevelopmentProviderOperationCancellationResult = z.infer<typeof developmentProviderOperationCancellationOutputSchema>

export const cancelDevelopmentProviderOperationAction = defineAction({
  id: 'provider_operation.cancelDevelopmentCancellable',
  name: 'Cancel development effect',
  summary: 'Requests and records provider-confirmed cancellation of one development effect.',
  boundaries: [
    'MOCK/DEVELOPMENT ONLY; this action has no customer-reachable surface.',
    'Cancellation is a separate provider effect and never rewrites the original effect.',
  ],
  schema: developmentProviderOperationCancellationInputSchema,
  parameters: [
    { name: 'effectRef', type: 'string', description: 'Effect to cancel.', required: true },
    { name: 'providerRef', type: 'string', description: 'Provider holding the effect.', required: true },
    { name: 'principalRef', type: 'string', description: 'Principal who owns the effect.', required: true },
    { name: 'reason', type: 'string', description: 'Reason disclosed to the provider.', required: true },
    { name: 'operationKey', type: 'string', description: 'Stable cancellation operation identity.', required: true },
  ],
  readOnly: false,
  surfaces: [],
  outputSchema: developmentProviderOperationCancellationOutputSchema,
  invocationContract: {
    version: 'v1',
    consequenceClass: 'external_effect',
    materialInputPaths: ['effectRef', 'providerRef', 'principalRef', 'reason', 'operationKey'],
    authorityRequirement: 'principal',
    retryClass: 'reconcile_before_retry',
    expectedEvidence: ['provider cancellation reference'],
    safeContinuations: ['inspect the original effect and separate cancellation evidence'],
    invalidationConditions: ['effect, provider, principal, reason, or operation key changes'],
    developmentAttemptTimeoutMs: 15_000,
    reconciliationEvidenceSource: 'provider_operation.cancelDevelopmentCancellable:mock-provider-observer:v1',
  },
  projectInvocationPreparation: () => ({
    dataUse: { fields: ['reason'], limits: { recipients: 1 } },
  }),
  classifyInvocationResult: (result) => result.kind === 'effect_cancellation_confirmed'
    ? { outcome: 'completed', referenceable: true }
    : { outcome: 'refused', referenceable: false },
  preReleaseCheck: async ({ data, context }) => {
    const input = developmentProviderOperationCancellationInputSchema.parse(data)
    const dependencies = developmentProviderOperationDependencies(context)
    if (
      input.principalRef !== dependencies.authorityPrincipalRef
    ) {
      return {
        kind: 'effect_cancellation_refused' as const,
        environment: 'MOCK/DEVELOPMENT ONLY' as const,
        code: 'principal_mismatch' as const,
        reason: 'Cancellation principal does not match the authority-bound principal.',
      }
    }
    const check = dependencies.checkCancellation
    if (check === undefined) {
      return {
        kind: 'effect_cancellation_refused' as const,
        environment: 'MOCK/DEVELOPMENT ONLY' as const,
        code: 'provider_record_unavailable' as const,
        reason: 'Provider effect ownership could not be checked before release.',
      }
    }
    const result = await check(input)
    return result.kind === 'current' ? undefined : {
      kind: 'effect_cancellation_refused' as const,
      environment: 'MOCK/DEVELOPMENT ONLY' as const,
      code: 'provider_record_mismatch' as const,
      reason: result.reason,
    }
  },
  run: async ({ data, context }) => {
    const input = developmentProviderOperationCancellationInputSchema.parse(data)
    const adapter = developmentProviderOperationDependencies(context).cancel
    if (adapter === undefined) throw new Error('development_provider_operation_cancellation_adapter_unavailable')
    return developmentProviderOperationCancellationOutputSchema.parse(await adapter(input))
  },
})
