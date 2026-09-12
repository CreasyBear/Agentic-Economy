import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import { degrade } from '@/lib/observability/degrade'
import { isRecord } from '@/modules/common/is-record'
import type { ProviderConnectionOwnerProjection } from '@/modules/capability-supply/provider-connection'
import type { SupplySourceInput, SupplySourcePreview, SupplyToolCandidate } from '@/modules/capability-supply/source-preview'
import type { PublishSupplyToolV2Input } from '@/modules/capability-supply/supply-publication-v2'
import type { SupplyPublishResult } from '@/modules/capability-supply/supply-actions'
import { parseDecimalExactAmount, rescaleExactAmount } from '@/modules/money/public'

export type SourceKind = SupplySourceInput['kind']
export type Environment = SupplySourceInput['environment']
export type AttestationKey = keyof PublishSupplyToolV2Input['attestation']

export type SupplyNativeStartProps = Readonly<{
  businessRef: string
  connections?: readonly ProviderConnectionOwnerProjection[]
  initial?: Readonly<{
    source: SupplySourceInput
    preview?: Extract<SupplySourcePreview, { kind: 'ready' }>
    candidateRef: string
    connectionRef?: string
  }>
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
  if (value.sourceKind === 'openapi') return value.definitionUrl.trim() === '' ? undefined : { kind: 'openapi', definitionUrl: value.definitionUrl.trim(), environment: value.environment }
  if (value.sourceKind === 'mcp') {
    if (value.mcpLocator === 'url') return value.serverUrl.trim() === '' ? undefined : { kind: 'mcp', serverUrl: value.serverUrl.trim(), environment: value.environment }
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
  return value.resourceUrl.trim() === '' ? undefined : { kind: 'x402', resourceUrl: value.resourceUrl.trim(), method: value.x402Method, environment: value.environment }
}

export function sourceInputError(kind: SourceKind, locator: 'url' | 'registry'): string {
  if (kind === 'openapi') return 'Enter the public HTTPS URL for the OpenAPI document.'
  if (kind === 'mcp') return locator === 'url' ? 'Enter the MCP server URL.' : 'Enter its MCP Registry name.'
  if (kind === 'agent_plugin') return 'Provide valid plugin.json and mcp.json documents.'
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

export function publicationError(reason: string): string {
  return REASON_COPY[reason] ?? REASON_COPY_FALLBACK
}

/** Validates the "Review and submit" fields in the exact order the form checks them, before the input is built. */
export function publicationValidationMessage(input: Readonly<{
  category: string
  pricing: PublishSupplyToolV2Input['pricing'] | undefined
  requiresConnection: boolean
  connectionRef: string
  attestation: Record<AttestationKey, boolean>
}>): string | undefined {
  if (input.category.trim() === '') return 'Enter a category before submitting this Tool.'
  if (input.pricing === undefined) return 'Enter a valid AUD price, or choose Free.'
  if (input.requiresConnection && input.connectionRef === '') return 'Choose a connected source before submitting this Tool.'
  if (!Object.values(input.attestation).every(Boolean)) return 'Confirm all three publication statements before submitting.'
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
      authorisedToPublish: true,
      informationAccurate: true,
      publishAfterSuccessfulValidation: true,
    },
  }
}
