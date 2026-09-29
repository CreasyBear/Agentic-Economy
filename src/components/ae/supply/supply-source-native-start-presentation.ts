import type { OwnerSupplySourceAssessmentInput } from '@/modules/capability-supply/source-first-owner'
import type { SupplyIntegrationDraftTerms } from '@/modules/capability-supply/integration-draft'
import type { SupplySourceAssessment } from '@/modules/capability-supply/source-first-owner'
import { REASON_COPY } from '@/content/reason-copy'
import { isRecord } from '@/modules/common/is-record'
import type { ProviderConnectionOwnerProjection } from '@/modules/capability-supply/provider-connection'
import type { SupplySourceInput, SupplySourcePreview, SupplyToolCandidate } from '@/modules/capability-supply/source-preview'
import type { PublishSupplyToolV2Input } from '@/modules/capability-supply/supply-publication-v2'
import type { SupplyPublishResult } from '@/modules/capability-supply/supply-actions'

export const TACTILE =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export type HttpsUrlPreflight = 'empty' | 'invalid' | 'insecure' | 'valid'

export function inspectHttpsUrl(value: string): HttpsUrlPreflight {
  const trimmed = value.trim()
  if (trimmed === '') return 'empty'
  try {
    const u = new URL(trimmed)
    return u.protocol === 'https:' ? 'valid' : 'insecure'
  } catch (cause) {
    void cause
    return 'invalid'
  }
}

export type SourceKind = SupplySourceInput['kind']
export type Environment = SupplySourceInput['environment']
export type AttestationKey = keyof PublishSupplyToolV2Input['attestation']
export type SupplyJourneyContinuation = Readonly<{ label: string; to: string }>
export type SupplyPublicationInvalidField =
  | 'category'
  | 'price'
  | 'connection'
  | 'attestation'
  | 'candidate'

export const SUPPLY_PUBLICATION_ERROR_ID = 'supply-publication-error'

export const SUPPLY_PUBLICATION_FIELD_IDS = {
  category: 'supply-native-category',
  priceGroup: 'supply-native-price-group',
  priceAud: 'supply-native-price-aud',
  connection: 'supply-native-connection',
  attestation: 'supply-attest-authorised',
  candidate: 'supply-candidate-group',
} as const

/** Maps the existing validation copy to the control that message names. */
export function publicationInvalidFieldForMessage(
  message: string,
): SupplyPublicationInvalidField | undefined {
  switch (message) {
    case 'Enter a category before submitting this Tool.':
      return 'category'
    case 'Enter a valid AUD price, or choose Free.':
      return 'price'
    case 'Choose a connected source before submitting this Tool.':
      return 'connection'
    case 'Confirm all three publication statements before submitting.':
    case 'Confirm the information is accurate, and that publication can follow validation, before submitting.':
      return 'attestation'
    case 'Select one supported Tool before submitting it.':
      return 'candidate'
    default:
      return undefined
  }
}

export type SupplyNativeStartProps = Readonly<{
  businessRef: string
  connections?: readonly ProviderConnectionOwnerProjection[]
  initial?: Readonly<{
    source: SupplySourceInput
    preview?: Extract<SupplySourcePreview, { kind: 'ready' }>
    candidateRef: string
    connectionRef?: string
    terms?: SupplyIntegrationDraftTerms
  }>
  onAssess?: (input: OwnerSupplySourceAssessmentInput, signal: AbortSignal) => Promise<SupplySourceAssessment>
  onPreview: (source: SupplySourceInput, idempotencyKey: string) => Promise<SupplySourcePreview>
  onConnect: (input: Readonly<{
    businessId: string
    source: SupplySourceInput
    expectedSourceDigest: string
    candidateRef: string
    idempotencyKey: string
  }>) => Promise<SupplySourcePreview>
  onSelectCandidate: (input: Readonly<{
    businessRef: string
    source: SupplySourceInput
    sourceDigest: string
    sourceRevision: string
    candidate: Pick<SupplyToolCandidate, 'candidateRef' | 'sourceSelector' | 'title' | 'description'>
  }>) => Promise<Readonly<{ kind: 'saved' | 'replayed' }> | Readonly<{ kind: 'refused'; reason: string }>>
  onDraftSaved?: (candidateRef: string, connectionRef?: string) => Promise<void> | void
  onPublish: (input: PublishSupplyToolV2Input) => Promise<SupplyPublishResult>
  onSaveTerms?: (input: Readonly<{
    businessRef: string
    source: SupplySourceInput
    sourceDigest: string
    sourceRevision: string
    candidate: Pick<SupplyToolCandidate, 'candidateRef' | 'sourceSelector' | 'title' | 'description'>
    terms: SupplyIntegrationDraftTerms
  }>) => Promise<Readonly<{ kind: 'saved' | 'replayed' }> | Readonly<{ kind: 'refused'; reason: string }>>
  onNavigationSafetyChange?: (state: Readonly<{
    dirty: boolean
    pending: boolean
    saveOutcome: 'idle' | 'saved' | 'failed' | 'outcome_unknown'
  }>) => void
}>

/** The connection adapter a source of this kind requires before it can be called. */
export function requiredAdapterIdForSourceKind(_kind: SourceKind): string {
  return 'x402-fetch:v2'
}

/** The provider connections the "Source connection" field may offer for the currently selected candidate. */
export function eligibleSupplyConnections(input: Readonly<{
  requiredAdapterId: string
  hasSelectedCandidate: boolean
  connections: readonly ProviderConnectionOwnerProjection[]
  businessRef: string
}>): readonly ProviderConnectionOwnerProjection[] {
  if (!input.hasSelectedCandidate) return []
  return input.connections.filter((connection) =>
    connection.available
    && connection.businessId === input.businessRef
    && connection.adapterId === input.requiredAdapterId)
}

export type SourceFieldState = Readonly<{
  environment?: 'sandbox' | 'production'
  resourceUrl: string
  x402Method?: 'GET' | 'POST' | undefined
}>

export function sourceInput(value: Pick<SourceFieldState, 'resourceUrl' | 'x402Method' | 'environment'>): SupplySourceInput | undefined {
  const trimmedResource = value.resourceUrl.trim()
  if (trimmedResource === '') return undefined
  try {
    const u = new URL(trimmedResource)
    if (u.protocol !== 'https:') return undefined
  } catch (cause) {
    void cause
    return undefined
  }
  return {
    kind: 'x402',
    resourceUrl: trimmedResource,
    ...(value.x402Method === undefined ? {} : { method: value.x402Method }),
    ...(value.environment === undefined ? {} : { environment: value.environment }),
  }
}

export function sourceInputError(value?: Pick<SourceFieldState, 'resourceUrl'>): string {
  if (value?.resourceUrl) {
    try {
      const u = new URL(value.resourceUrl.trim())
      if (u.protocol !== 'https:') return 'x402 resource URL must use HTTPS.'
    } catch (cause) {
      void cause
      return 'Enter a valid HTTPS x402 resource URL.'
    }
  }
  return 'Enter the public HTTPS x402 resource URL.'
}

export function pricingInput(
  _kind: 'free' | 'fixed_aud' | 'source_x402',
  _value: string,
): PublishSupplyToolV2Input['pricing'] {
  return { kind: 'source_x402' }
}

export function publicationPriceSummary(pricing: { kind: string } | undefined): string {
  return pricing?.kind === 'source_x402' ? 'Provider source payment' : 'Price comes from the endpoint challenge'
}

export function publicationError(reason: string): string {
  if (reason === 'source_unavailable') return 'Could not read the source during validation. Check that the endpoint is reachable, then retry.'
  return REASON_COPY[reason] ?? `Submission refused (${reason}). Check this Tool’s source and publication details, then retry.`
}

/** Validates the "Review and submit" fields in the exact order the form checks them, before the input is built. */
export function publicationValidationMessage(input: Readonly<{
  category: string
  pricing: PublishSupplyToolV2Input['pricing'] | undefined
  requiresConnection: boolean
  connectionRef: string
  attestation: Record<AttestationKey, boolean>
  publishAuthorityRequired: boolean
}>): string | undefined {
  const termsMessage = publicationTermsValidationMessage(input)
  if (termsMessage !== undefined) return termsMessage
  if (input.publishAuthorityRequired && !input.attestation.authorisedToPublish) {
    return 'Confirm you are authorised to list this endpoint for this business.'
  }
  return undefined
}

export function publicationTermsValidationMessage(input: Readonly<{
  category: string
  pricing: PublishSupplyToolV2Input['pricing'] | undefined
  requiresConnection: boolean
  connectionRef: string
}>): string | undefined {
  if (input.pricing?.kind !== 'source_x402') return 'Price comes from the payment challenge.'
  if (input.requiresConnection && input.connectionRef === '') return 'Choose a connected source before submitting this Tool.'
  return undefined
}

/** Assembles the exact `PublishSupplyToolV2Input` the server expects from the raw form state. */
export function buildPublishInput(input: Readonly<{
  businessRef: string
  source: SupplySourceInput
  selected: SupplyToolCandidate
  sourceDigest: string
  connectionRef: string
  name: string
  description: string
  category: string
  serviceArea: string
  availability: string
  externalEffect: boolean
  dataRelease: boolean
  financialExposure: boolean
  dataClassification: 'public' | 'personal' | 'sensitive'
  pricing: NonNullable<PublishSupplyToolV2Input['pricing']>
  environment: 'sandbox' | 'production'
  idempotencyKey: string
  attestation: Readonly<{
    authorisedToPublish: boolean
    informationAccurate: true
    publishAfterSuccessfulValidation: true
  }>
}>): PublishSupplyToolV2Input {
  const dataEffectIndex = input.dataRelease ? 0 : -1
  const effects: PublishSupplyToolV2Input['consequences']['effects'] = [
    ...(input.dataRelease ? [{ class: 'data_release' as const, authority: 'explicit' as const, reversibility: 'not_applicable' as const }] : []),
    ...(input.financialExposure ? [{ class: 'financial_exposure' as const, authority: 'explicit' as const, reversibility: 'conditional' as const }] : []),
    ...(input.externalEffect ? [{ class: 'external_state_change' as const, authority: 'explicit' as const, reversibility: 'conditional' as const }] : []),
  ]
  return {
    businessRef: input.businessRef,
    source: input.source,
    candidateRef: input.selected.candidateRef,
    expectedSourceDigest: input.sourceDigest,
    ...(input.connectionRef === '' ? {} : { connectionRef: input.connectionRef }),
    presentation: {
      name: input.name.trim(),
      description: input.description.trim(),
      category: input.category.trim() || 'x402',
      ...(input.serviceArea.trim() === '' ? {} : { serviceArea: input.serviceArea.trim() }),
      ...(input.availability.trim() === '' ? {} : { availability: input.availability.trim() }),
    },
    consequences: {
      effects,
      dataUse: dataEffectIndex < 0 ? [] : Object.keys(
        isRecord(input.selected.inputSchema?.properties) ? input.selected.inputSchema.properties : {},
      ).map((property) => ({
        inputPointer: `/${property.replace(/~/g, '~0').replace(/\//g, '~1')}`,
        classification: input.dataClassification,
        phase: 'execution',
        purposes: ['Perform the Tool'],
      })),
      evidence: [{ outputPointer: '', purpose: 'completion' }],
    },
    pricing: input.pricing,
    environment: input.environment,
    idempotencyKey: input.idempotencyKey,
    attestation: {
      authorisedToPublish: input.attestation.authorisedToPublish,
      informationAccurate: true,
      publishAfterSuccessfulValidation: true,
    },
  }
}

export function sourceSummary(source: SupplySourceInput | undefined): string {
  if (source === undefined) return 'Source details unavailable'
  const environment = source.environment === 'sandbox' ? 'Sandbox' : source.environment === 'production' ? 'Production' : 'Network from the endpoint'
  return `x402 · ${source.resourceUrl} · ${environment}`
}
