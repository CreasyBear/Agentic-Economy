import { canonicalDigest } from '@/modules/common/canonical-digest'
import { signEd25519Attestation } from '@/modules/common/ed25519-attestation'
import type {
  ExposureOffsetRuleIdentity,
  ExposureReleaseAttestationMaterial,
} from '@/modules/action-invocation'
import type { DevelopmentProviderOperationSigningCustody } from './development-provider-operation-signing-custody'
import type {
  DevelopmentProviderOperationCancellationInput,
  DevelopmentProviderOperationCancellationResult,
  DevelopmentProviderOperationInput,
  DevelopmentProviderOperationResult,
} from './development-provider-operation.actions'

export type DevelopmentAvailabilityObservation = DevelopmentProviderOperationInput['slot']
export const developmentCancellationConfirmationRule: ExposureOffsetRuleIdentity = {
  evidenceRuleRef: 'development_provider_operation.cancellation_confirmation',
  source: 'development_provider_operation.provider_records',
  version: 'v1',
}

export type DevelopmentProviderOperationProviderSnapshot = Readonly<{
  options: Readonly<{
    providerRef?: string
    slotRef?: string
    refusal?: 'terms_changed' | 'provider_refused'
    exposureAmount?: Readonly<{ amountMinor: number; currency: string }>
  }>
  effectRecords: readonly Readonly<{ operationKey: string; digest: string; input: DevelopmentProviderOperationInput; result: DevelopmentProviderOperationResult }>[]
  cancellations: readonly Readonly<{
    operationKey: string
    digest: string
    input: DevelopmentProviderOperationCancellationInput
    result: DevelopmentProviderOperationCancellationResult
  }>[]
  effects: number
  cancellationEffects: number
}>

export function createDevelopmentProviderOperationProvider(options: Readonly<{
  providerRef?: string
  slotRef?: string
  refusal?: 'terms_changed' | 'provider_refused'
  exposureAmount?: Readonly<{ amountMinor: number; currency: string }>
  signingCustody?: DevelopmentProviderOperationSigningCustody
  snapshot?: DevelopmentProviderOperationProviderSnapshot
}> = {}) {
  const effectRecords = new Map<string, Readonly<{
    digest: string
    input: DevelopmentProviderOperationInput
    result: DevelopmentProviderOperationResult
  }>>(options.snapshot?.effectRecords.map(({ operationKey, ...record }) => [operationKey, record]))
  const cancellations = new Map<string, Readonly<{
    digest: string
    input: DevelopmentProviderOperationCancellationInput
    result: DevelopmentProviderOperationCancellationResult
  }>>(options.snapshot?.cancellations.map(({ operationKey, ...record }) => [operationKey, record]))
  let effectCount = options.snapshot?.effects ?? 0
  let cancellationEffects = options.snapshot?.cancellationEffects ?? 0
  const availability: DevelopmentAvailabilityObservation = {
    slotRef: options.slotRef ?? 'mock:slot:2026-07-21T02:00Z',
    providerRef: options.providerRef ?? 'mock:provider:calendar',
    offeringRef: 'mock:offering:consultation',
    bindingRef: 'mock:binding:calendar-create-effect',
    contractRef: 'calendar.create-effect@1',
    actionVersion: 'v1',
    startsAt: '2026-07-21T02:00:00.000Z',
    freshAt: '2026-07-19T04:00:00.000Z',
    expiresAt: '2026-07-19T04:15:00.000Z',
    termsDigest: canonicalDigest({ cancellation: 'provider_supported_before_start', priceMinor: 0 }),
    provenance: {
      source: 'mock_provider_availability',
      observationRef: 'mock:availability-observation:001',
      observedBy: 'mock:provider:calendar',
    },
  }
  return {
    availability: async () => structuredClone(availability),
    check: async (input: DevelopmentProviderOperationInput, now: number) => {
      const exact = canonicalDigest(input.slot) === canonicalDigest(availability)
      return exact && now < Date.parse(availability.expiresAt)
        ? { kind: 'current' as const }
        : { kind: 'stale' as const, reason: 'Provider slot identity, terms, provenance, or freshness changed.' }
    },
    execute: async (input: DevelopmentProviderOperationInput): Promise<DevelopmentProviderOperationResult> => {
      const digest = canonicalDigest(input)
      const prior = effectRecords.get(input.operationKey)
      if (prior !== undefined) {
        if (prior.digest !== digest) {
          return {
            kind: 'effect_refused',
            environment: 'MOCK/DEVELOPMENT ONLY',
            code: 'terms_changed',
            reason: 'The operation key was already used with different operation material.',
          }
        }
        return prior.result
      }
      effectCount += 1
      if (options.refusal !== undefined) {
        const result: DevelopmentProviderOperationResult = {
          kind: 'effect_refused',
          environment: 'MOCK/DEVELOPMENT ONLY',
          code: options.refusal,
          reason: 'The development provider refused under its current terms.',
        }
        effectRecords.set(input.operationKey, { digest, input: structuredClone(input), result })
        return result
      }
      const result: DevelopmentProviderOperationResult = {
        kind: 'effect_confirmed',
        environment: 'MOCK/DEVELOPMENT ONLY',
        effectRef: `mock:effect:${canonicalDigest(input.operationKey).slice(-12)}`,
        providerRef: input.slot.providerRef,
        slotRef: input.slot.slotRef,
        evidenceRef: `mock:effect-evidence:${canonicalDigest(input.operationKey).slice(-12)}`,
      }
      effectRecords.set(input.operationKey, { digest, input: structuredClone(input), result })
      return result
    },
    checkCancellation: async (input: DevelopmentProviderOperationCancellationInput) => {
      const effect = [...effectRecords.values()].find(({ result }) =>
        result.kind === 'effect_confirmed' && result.effectRef === input.effectRef)
      return effect !== undefined
        && effect.result.kind === 'effect_confirmed'
        && effect.result.providerRef === input.providerRef
        && effect.input.customer.principalRef === input.principalRef
        ? { kind: 'current' as const }
        : { kind: 'refused' as const, reason: 'Provider effect, provider, or principal ownership did not match.' }
    },
    cancel: async (
      input: DevelopmentProviderOperationCancellationInput,
    ): Promise<DevelopmentProviderOperationCancellationResult> => {
      const digest = canonicalDigest(input)
      const prior = cancellations.get(input.operationKey)
      if (prior !== undefined) {
        return prior.digest === digest ? prior.result : {
          kind: 'effect_cancellation_refused',
          environment: 'MOCK/DEVELOPMENT ONLY',
          code: 'operation_key_conflict',
          reason: 'Cancellation operation key was already used with different material.',
        }
      }
      const effect = [...effectRecords.values()].find(({ result }) =>
        result.kind === 'effect_confirmed'
        && result.effectRef === input.effectRef
        && result.providerRef === input.providerRef)
      if (
        effect === undefined
        || effect.result.kind !== 'effect_confirmed'
        || effect.input.customer.principalRef !== input.principalRef
      ) {
        return {
          kind: 'effect_cancellation_refused',
          environment: 'MOCK/DEVELOPMENT ONLY',
          code: 'provider_record_mismatch',
          reason: 'Provider-owned effect state did not authorize cancellation.',
        }
      }
      cancellationEffects += 1
      const suffix = canonicalDigest(input.operationKey).slice(-12)
      const cancellationRef = `mock:cancellation:${suffix}`
      const evidenceRef = `mock:cancellation-evidence:${suffix}`
      const exposureReleaseAttestation = options.signingCustody === undefined
        ? undefined
        : issueExposureReleaseAttestation({
            input,
            effectRef: effect.result.effectRef,
            providerRef: effect.result.providerRef,
            originalEvidenceRef: effect.result.evidenceRef,
            cancellationRef,
            cancellationEvidenceRef: evidenceRef,
            reversedAmount: options.exposureAmount ?? { amountMinor: 5_000, currency: 'AUD' },
            signingCustody: options.signingCustody,
          })
      const result: DevelopmentProviderOperationCancellationResult = {
        kind: 'effect_cancellation_confirmed',
        environment: 'MOCK/DEVELOPMENT ONLY',
        effectRef: input.effectRef,
        cancellationRef,
        evidenceRef,
        ...(exposureReleaseAttestation === undefined ? {} : { exposureReleaseAttestation }),
      }
      cancellations.set(input.operationKey, { digest, input: structuredClone(input), result })
      return result
    },
    effectCount: () => effectCount,
    cancellationEffectCount: () => cancellationEffects,
    inspect: (operationKey: string) => effectRecords.get(operationKey),
    inspectCancellation: (operationKey: string) => cancellations.get(operationKey),
    exportSnapshot: (): DevelopmentProviderOperationProviderSnapshot => ({
      options: {
        ...(options.providerRef === undefined ? {} : { providerRef: options.providerRef }),
        ...(options.slotRef === undefined ? {} : { slotRef: options.slotRef }),
        ...(options.refusal === undefined ? {} : { refusal: options.refusal }),
        ...(options.exposureAmount === undefined ? {} : { exposureAmount: options.exposureAmount }),
      },
      effectRecords: [...effectRecords.entries()].map(([operationKey, record]) => ({ operationKey, ...record })),
      cancellations: [...cancellations.entries()].map(([operationKey, record]) => ({ operationKey, ...record })),
      effects: effectCount,
      cancellationEffects,
    }),
  }
}

function issueExposureReleaseAttestation(input: Readonly<{
  input: DevelopmentProviderOperationCancellationInput
  effectRef: string
  providerRef: string
  originalEvidenceRef: string
  cancellationRef: string
  cancellationEvidenceRef: string
  reversedAmount: Readonly<{ amountMinor: number; currency: string }>
  signingCustody: DevelopmentProviderOperationSigningCustody
}>) {
  if (
    input.input.effectRef !== input.effectRef
    || input.input.providerRef !== input.providerRef
  ) throw new Error('development_provider_operation_release_attestation_linkage_refused')
  const material: ExposureReleaseAttestationMaterial = {
    format: 'ae.exposure-release-attestation:v1',
    evidenceRule: developmentCancellationConfirmationRule,
    providerRef: input.providerRef,
    originalEffect: {
      action: { id: 'provider_operation.executeDevelopmentCancellable', version: 'v1' },
      subjectRef: input.effectRef,
      resultRef: input.effectRef,
      evidenceDigest: canonicalDigest(input.originalEvidenceRef as never),
    },
    cancellationEffect: {
      action: { id: 'provider_operation.cancelDevelopmentCancellable', version: 'v1' },
      subjectRef: input.effectRef,
      resultRef: input.cancellationRef,
      evidenceDigest: canonicalDigest(input.cancellationEvidenceRef as never),
    },
    outcome: 'provider_confirmed_reversal',
    reversedAmount: input.reversedAmount,
    observedAt: '2026-07-19T04:00:00.000Z',
  }
  const digest = canonicalDigest(material as never)
  return {
    material,
    digest,
    signature: signEd25519Attestation(
      digest,
      input.signingCustody.signingKey(),
      'development_provider_operation_release_signing_key_invalid',
    ),
  }
}
