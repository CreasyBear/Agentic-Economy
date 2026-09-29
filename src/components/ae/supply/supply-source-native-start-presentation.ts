import type { OwnerSupplySourceAssessmentInput } from '@/modules/capability-supply/source-first-owner'
import type { SupplyIntegrationDraftTerms } from '@/modules/capability-supply/integration-draft'
import type { SupplySourceAssessment } from '@/modules/capability-supply/source-first-owner'
import { REASON_COPY } from '@/content/reason-copy'
import { degrade } from '@/lib/observability/degrade'
import { isRecord } from '@/modules/common/is-record'
import type { ProviderConnectionOwnerProjection } from '@/modules/capability-supply/provider-connection'
import type { SupplySourceInput, SupplySourcePreview, SupplyToolCandidate } from '@/modules/capability-supply/source-preview'
import type { PublishSupplyToolV2Input } from '@/modules/capability-supply/supply-publication-v2'
import type { SupplyPublishResult } from '@/modules/capability-supply/supply-actions'
import {
  displayPriceFromPricingConfig,
  fixedAudPricingConfig,
  formatDisplayAmount,
  parseDecimalExactAmount,
  rescaleExactAmount,
} from '@/modules/money/public'

export const TACTILE =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export type HttpsUrlPreflight = 'empty' | 'invalid' | 'insecure' | 'valid'
export type JsonPreflight = 'empty' | 'invalid' | 'not_object' | 'missing_fields' | 'valid'

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

export function inspectJsonPayload(value: string, requiredKeys: readonly string[]): JsonPreflight {
  const trimmed = value.trim()
  if (trimmed === '') return 'empty'
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'not_object'
    const rec = parsed as Record<string, unknown>
    const hasAll = requiredKeys.every((k) => k in rec && rec[k] !== undefined && rec[k] !== null)
    return hasAll ? 'valid' : 'missing_fields'
  } catch (cause) {
    void cause
    return 'invalid'
  }
}


export const PLUGIN_JSON_REQUIRED_KEYS = ['$schema', 'name'] as const
export const MCP_JSON_REQUIRED_KEYS = ['$schema', 'mcpServers'] as const

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
export function requiredAdapterIdForSourceKind(kind: SourceKind): string {
  return kind === 'openapi'
    ? 'http-json:v1'
    : kind === 'x402'
      ? 'x402-fetch:v2'
      : 'mcp-jsonrpc:v1'
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
  sourceKind: SourceKind
  environment: Environment
  definitionUrl: string
  mcpLocator: 'url' | 'registry'
  serverUrl: string
  registryName: string
  pluginJson: string
  mcpJson: string
  remoteRef: string
  resourceUrl: string
  x402Method: 'GET' | 'POST'
}>

export function sourceInput(value: SourceFieldState): SupplySourceInput | undefined {
  if (value.sourceKind === 'openapi') {
    const trimmed = value.definitionUrl.trim()
    if (trimmed === '') return undefined
    try {
      const u = new URL(trimmed)
      if (u.protocol !== 'https:') return undefined
    } catch (cause) {
      void cause
      return undefined
    }
    return { kind: 'openapi', definitionUrl: trimmed, environment: value.environment }
  }
  if (value.sourceKind === 'mcp') {
    if (value.mcpLocator === 'url') {
      const trimmed = value.serverUrl.trim()
      if (trimmed === '') return undefined
      try {
        const u = new URL(trimmed)
        if (u.protocol !== 'https:') return undefined
      } catch (cause) {
        void cause
        return undefined
      }
      return { kind: 'mcp', serverUrl: trimmed, environment: value.environment }
    }
    return value.registryName.trim() === '' ? undefined : {
      kind: 'mcp',
      registryName: value.registryName.trim(),
      ...(value.remoteRef === '' ? {} : { remoteRef: value.remoteRef }),
      environment: value.environment,
    }
  }
  if (value.sourceKind === 'agent_plugin') {
    const plugin = parseObject(value.pluginJson)
    const mcp = parseObject(value.mcpJson)
    return plugin === undefined || mcp === undefined ? undefined : {
      kind: 'agent_plugin',
      pluginJson: plugin,
      mcpJson: mcp,
      ...(value.remoteRef === '' ? {} : { remoteRef: value.remoteRef }),
      environment: value.environment,
    }
  }
  const trimmedResource = value.resourceUrl.trim()
  if (trimmedResource === '') return undefined
  try {
    const u = new URL(trimmedResource)
    if (u.protocol !== 'https:') return undefined
  } catch (cause) {
    void cause
    return undefined
  }
  return { kind: 'x402', resourceUrl: trimmedResource, method: value.x402Method, environment: value.environment }
}

export function sourceInputError(kind: SourceKind, locator: 'url' | 'registry', value?: SourceFieldState): string {
  if (kind === 'openapi') {
    if (value?.definitionUrl) {
      try {
        const u = new URL(value.definitionUrl.trim())
        if (u.protocol !== 'https:') return 'OpenAPI URL must be a public HTTPS endpoint.'
      } catch (cause) {
        void cause
        return 'Enter a valid HTTPS URL for the OpenAPI document.'
      }
    }
    return 'Enter the public HTTPS URL for the OpenAPI document.'
  }
  if (kind === 'mcp') {
    if (locator === 'url') {
      if (value?.serverUrl) {
        try {
          const u = new URL(value.serverUrl.trim())
          if (u.protocol !== 'https:') return 'MCP server URL must use HTTPS.'
        } catch (cause) {
          void cause
          return 'Enter a valid HTTPS URL for the MCP server.'
        }
      }
      return 'Enter the MCP server URL.'
    }
    return 'Enter its MCP Registry name.'
  }
  if (kind === 'agent_plugin') return 'Provide valid plugin.json and mcp.json documents.'
  if (value?.resourceUrl) {
    try {
      const u = new URL(value.resourceUrl.trim())
      if (u.protocol !== 'https:') return 'x402 resource URL must use HTTPS.'
    } catch (cause) {
      void cause
      return 'Enter a valid HTTPS x402 resource URL.'
    }
  }
  return 'Enter the x402 resource URL.'
}

export function parseObject(value: string): Readonly<Record<string, never>> | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Readonly<Record<string, never>>
      : undefined
  } catch (cause) {
    // Mid-typing JSON is routinely invalid until the user finishes; this is
    // form-validation state, not a fault - degrade() reports it as a warning
    // (not error) rather than crashing or silently discarding the cause.
    return degrade(cause, undefined, { site: 'supplyNativeStart.parseObject', reason: 'invalid_response' })
  }
}

export function pricingInput(
  kind: 'free' | 'fixed_aud' | 'source_x402',
  value: string,
): PublishSupplyToolV2Input['pricing'] | undefined {
  if (kind === 'free') return { kind: 'free' }
  if (kind === 'source_x402') return { kind: 'source_x402' }
  const parsed = parseDecimalExactAmount('AUD', value, 2)
  const amount = parsed === undefined ? undefined : rescaleExactAmount(parsed, 6)
  return amount === undefined ? undefined : { kind: 'fixed_aud', amount }
}

export function publicationPriceSummary(pricing: PublishSupplyToolV2Input['pricing'] | undefined): string {
  if (pricing === undefined) return 'Price needed'
  if (pricing.kind === 'free') return 'Free'
  if (pricing.kind === 'source_x402') return 'Provider source payment'
  const config = fixedAudPricingConfig(pricing.amount)
  if (config === undefined) return 'Price needed'
  const display = displayPriceFromPricingConfig(config)
  if (display.kind !== 'fixed') return 'Price confirmed at inspection'
  return formatDisplayAmount(display.amount)
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
  if (input.publishAuthorityRequired) {
    if (!Object.values(input.attestation).every(Boolean)) return 'Confirm all three publication statements before submitting.'
    return undefined
  }
  if (!input.attestation.informationAccurate || !input.attestation.publishAfterSuccessfulValidation) {
    return 'Confirm the information is accurate, and that publication can follow validation, before submitting.'
  }
  return undefined
}

export function publicationTermsValidationMessage(input: Readonly<{
  category: string
  pricing: PublishSupplyToolV2Input['pricing'] | undefined
  requiresConnection: boolean
  connectionRef: string
}>): string | undefined {
  if (input.category.trim() === '') return 'Enter a category before submitting this Tool.'
  if (input.pricing === undefined) return 'Enter a valid AUD price, or choose Free.'
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
  environment: Environment
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
      category: input.category.trim(),
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
      informationAccurate: input.attestation.informationAccurate,
      publishAfterSuccessfulValidation: input.attestation.publishAfterSuccessfulValidation,
    },
  }
}

export function sourceSummary(source: SupplySourceInput | undefined): string {
  if (source === undefined) return 'Source details unavailable'
  const label = source.kind === 'openapi' ? 'OpenAPI' : source.kind === 'mcp' ? 'MCP' : source.kind === 'agent_plugin' ? 'Agent Plugin' : 'x402'
  const location = source.kind === 'openapi'
    ? source.definitionUrl
    : source.kind === 'mcp'
      ? source.serverUrl ?? source.registryName ?? 'Selected MCP source'
      : source.kind === 'x402'
        ? source.resourceUrl
        : 'Uploaded manifests'
  return `${label} · ${location} · ${source.environment === 'sandbox' ? 'Sandbox' : 'Production'}`
}
