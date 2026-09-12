import { z } from 'zod'

import { requireStrictClerkConsequenceProof } from '@/lib/server/clerk-consequence-proof'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { callSourceMutation, callSourceQuery, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import { package5RolloutDecision } from '@/lib/server/package5-rollout'
import { idempotencyKeySchema } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { sourceWriteRequestFromAdmission } from '@/modules/security/source-write-admission'
import { stableStringify } from '@/modules/common/stable-hash'

import type { PreparedPublicationMaterial } from '../publication'
import type { ProviderConnectionOwnerProjection } from '../../provider-connection'
import {
  prepareSupplyPublicationV2,
  publishSupplyToolV2InputSchema,
  selectSupplyProviderAuthority,
  type PublishSupplyToolV2Input,
} from '../../supply-publication-v2'
import {
  previewSupplySource,
  supplySourceInputSchema,
  type SupplyToolCandidate,
  type SupplySourceInput,
  type SupplySourcePreview,
  type SupplySourcePreviewDependencies,
} from '../../source-preview'
import type { SupplyPublishResult } from '../../supply-actions'
import { readOwnerSupplyQuery } from './funnel-owner'
import type { OwnerSupplyFunnelReadback } from './types'

const ownerSourcePreviewInputSchema = z.strictObject({
  businessId: z.string().min(1),
  source: supplySourceInputSchema,
  connectionRef: z.string().trim().min(1).max(300).optional(),
  idempotencyKey: idempotencyKeySchema,
})

const ownerSourceConnectionInputSchema = z.strictObject({
  businessId: z.string().min(1),
  source: supplySourceInputSchema,
  expectedSourceDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  candidateRef: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  idempotencyKey: idempotencyKeySchema,
})

type OwnerDraftResult =
  | Readonly<{ kind: 'saved' | 'replayed'; offeringRef: string; accessPathRef: string }>
  | Readonly<{ kind: 'refused'; reason: string }>
type OwnerReservationResult =
  | Readonly<{ kind: 'reserved' | 'replayed' }>
  | Readonly<{ kind: 'refused'; reason: string }>
type PublicationResult =
  | Readonly<{
      kind: 'published' | 'replayed'
      publicationRef: string
      publicationRevision: number
      toolRef: string
    }>
  | Readonly<{ kind: 'refused'; reason: string }>

const saveDraftMutation = sourceMutation<Record<string, unknown>, OwnerDraftResult>(
  'capabilitySupplyOwnerFunnel:saveOwnerSupplyIntegrationDraft',
)
const reservePublicationMutation = sourceMutation<Record<string, unknown>, OwnerReservationResult>(
  'capabilitySupplyOwnerFunnel:reserveOwnerCapabilityPublication',
)
const publishMutation = sourceMutation<Record<string, unknown>, PublicationResult>(
  'capabilitySupply:publishPreparedCapability',
)
type OwnerConnectionAttemptReservation =
  | Readonly<{ kind: 'reserved' | 'replayed'; attemptRef: string; expiresAt: number }>
  | Readonly<{ kind: 'refused'; code: string }>
const reserveOwnerConnectionAttemptMutation = sourceMutation<
  Record<string, unknown>,
  OwnerConnectionAttemptReservation
>('capabilityProviderConnectionAttempts:reserveOwner')
type CandidateDraftResult =
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{
      kind: 'available'
      draft: Readonly<{
        sourceDescriptorJson: string
        sourceDigest: string
        candidateRef: string
      }>
    }>
const readCandidateDraftQuery = sourceQuery<
  { businessId: string; candidateRef: string },
  CandidateDraftResult
>('capabilitySupplyOwnerFunnel:readOwnerSupplyIntegrationDraft')
type SourceSelectionDraftResult =
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{
      kind: 'available'
      draft: Readonly<{
        draftRef: string
        businessRef: string
        sourceDescriptorJson: string
        expectedSourceDigest: string
        sourceRevision: string
        sourceUrl: string
        environment: 'sandbox' | 'production'
        state: 'pending' | 'connected' | 'consumed' | 'expired' | 'cancelled'
        connectionRef?: string
      }>
    }>
const readSourceSelectionDraftQuery = sourceQuery<
  { draftRef: string },
  SourceSelectionDraftResult
>('capabilityProviderConnectionAttempts:readOwnerSourceDraft')

export {
  ownerSourceConnectionInputSchema,
  ownerSourcePreviewInputSchema,
  publishSupplyToolV2InputSchema as ownerSourcePublishInputSchema,
}

const ownerSourceDraftInputSchema = z.strictObject({
  businessRef: z.string().trim().min(1),
  source: supplySourceInputSchema,
  sourceDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  sourceRevision: z.string().trim().min(1),
  candidate: z.strictObject({
    candidateRef: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    sourceSelector: z.record(z.string(), z.unknown()),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
  }),
})
export { ownerSourceDraftInputSchema }

export async function saveOwnerSupplySourceDraft({
  data,
  context,
}: {
  data: z.infer<typeof ownerSourceDraftInputSchema>
  context: unknown
}): Promise<OwnerDraftResult> {
  const operationKey = canonicalDigest({
    action: 'supply.source.selected',
    businessRef: data.businessRef,
    sourceDigest: data.sourceDigest,
    candidateRef: data.candidate.candidateRef,
  })
  const command = {
    businessId: data.businessRef,
    title: data.candidate.title,
    description: data.candidate.description,
    category: 'Uncategorised',
    sourceKind: data.source.kind,
    sourceDescriptorJson: stableStringify(data.source as never),
    sourceDigest: data.sourceDigest,
    sourceRevision: data.sourceRevision,
    candidateRef: data.candidate.candidateRef,
    sourceSelectorJson: stableStringify(data.candidate.sourceSelector as never),
    operationKey,
    correlationId: operationKey,
  }
  const sourceWrite = await sourceWriteAdmissionFromContext({
    context,
    command,
    scope: 'catalog_publish',
    operationKey,
    correlationId: operationKey,
  })
  return await callSourceMutation(saveDraftMutation, {
    ...command,
    sourceWrite,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
  })
}

export async function previewOwnerSupplySource({
  data,
  context,
}: {
  data: z.infer<typeof ownerSourcePreviewInputSchema>
  context: unknown
}): Promise<SupplySourcePreview> {
  const readback = await callSourceQuery(readOwnerSupplyQuery, { businessId: data.businessId })
  if (readback.kind !== 'available') return unavailablePreview()
  if (data.connectionRef !== undefined) {
    const connectionRef = data.connectionRef
    if (data.source.kind === 'mcp' || data.source.kind === 'agent_plugin') {
      const source = data.source
      return await previewSupplySource(source, {
        mcpAuthentication: { kind: 'mcp_oauth' },
        discoverMcp: async (discoveryInput) => {
          const { previewOwnerMcpProviderConnection } = await import('./provider-connection-handoff')
          return await previewOwnerMcpProviderConnection({
            connectionRef,
            businessRef: data.businessId,
            ...(discoveryInput.serverUrl === undefined ? {} : { serverUrl: discoveryInput.serverUrl }),
            ...(discoveryInput.registryName === undefined ? {} : { registryName: discoveryInput.registryName }),
            ...(discoveryInput.remoteRef === undefined ? {} : { remoteRef: discoveryInput.remoteRef }),
            environment: discoveryInput.environment,
          })
        },
      })
    }
    if (data.source.kind === 'openapi') {
      const source = data.source
      return await previewSupplySource(source, {
        loadOpenApi: async () => {
          const { loadOwnerConnectedOpenApi } = await import('./provider-connection-handoff')
          return await loadOwnerConnectedOpenApi({
            connectionRef,
            businessRef: data.businessId,
            definitionUrl: source.definitionUrl,
            environment: source.environment,
          })
        },
      })
    }
    return unavailablePreview()
  }
  let challengedServerUrl: string | undefined
  const preview = data.source.kind === 'mcp' || data.source.kind === 'agent_plugin'
    ? await previewSupplySource(data.source, {
        discoverMcp: async (input) => {
          const { discoverMcpSource } = await import('../mcp-source-discovery')
          const discovery = await discoverMcpSource(input)
          if (discovery.kind === 'authentication_required') challengedServerUrl = discovery.serverUrl
          return discovery
        },
      })
    : await previewSupplySource(data.source)
  if (preview.kind !== 'action_required'
    || (data.source.kind !== 'mcp' && data.source.kind !== 'agent_plugin')
    || challengedServerUrl === undefined) return preview
  if (!package5RolloutDecision('mcpOAuth').enabled) return unavailablePreview()
  return await reserveOwnerSourceConnection({
    businessId: data.businessId,
    sourceKind: 'mcp_oauth',
    sourceUrl: challengedServerUrl,
    sourceDescriptorJson: stableStringify(data.source as never),
    authentication: { kind: 'mcp_oauth' },
    environment: data.source.environment,
    idempotencyKey: data.idempotencyKey,
    context,
    title: 'Connect MCP server',
    description: 'Sign in to the MCP server, then AE will return to this source and continue finding Tools.',
    ctaLabel: 'Connect server',
  })
}

export async function startOwnerSupplySourceConnection({
  data,
  context,
}: {
  data: z.infer<typeof ownerSourceConnectionInputSchema>
  context: unknown
}): Promise<SupplySourcePreview> {
  const readback = await callSourceQuery(readOwnerSupplyQuery, { businessId: data.businessId })
  if (readback.kind !== 'available') return unavailablePreview()
  const preview = await previewSupplySource(data.source)
  if (preview.kind !== 'ready' || preview.sourceDigest !== data.expectedSourceDigest) return unavailablePreview()
  const candidate = preview.candidates.find(({ candidateRef }) => candidateRef === data.candidateRef)
  if (candidate === undefined) return unavailablePreview()
  if (data.source.kind === 'x402') {
    if (!isSupportedX402Candidate(candidate, data.source)) return unavailablePreview()
    return {
      kind: 'action_required',
      requiredAction: {
        action: 'supply.source.preview',
        blockedCapabilities: ['supply.publish'],
        cta: x402ConnectionCta({
          candidateRef: data.candidateRef,
          resourceUrl: data.source.resourceUrl,
          method: data.source.method,
          environment: data.source.environment,
        }),
        ctaLabel: 'Connect service',
        description: 'Inspect the exact x402 payment lane, prove payee control with your wallet, then AE will return to this Tool.',
        iconUrl: null,
        status: 'required',
        title: 'Connect service',
      },
    }
  }
  if (data.source.kind !== 'openapi'
    || candidate.disposition.kind !== 'supported'
    || (candidate.authentication.kind !== 'api_key' && candidate.authentication.kind !== 'http_bearer')) {
    return unavailablePreview()
  }
  return await reserveOwnerSourceConnection({
    businessId: data.businessId,
    sourceKind: 'http_credential',
    sourceUrl: data.source.definitionUrl,
    sourceDescriptorJson: stableStringify(data.source as never),
    authentication: candidate.authentication,
    environment: data.source.environment,
    idempotencyKey: data.idempotencyKey,
    candidateDraftRef: data.candidateRef,
    candidateSourceDigest: data.expectedSourceDigest,
    context,
    title: 'Connect service',
    description: 'Enter the service credential securely, then AE will return to this Tool.',
    ctaLabel: 'Connect service',
  })
}

async function reserveOwnerSourceConnection(input: Readonly<{
  businessId: string
  sourceKind: 'http_credential' | 'mcp_oauth'
  sourceUrl: string
  sourceDescriptorJson?: string
  authentication:
    | Readonly<{ kind: 'api_key'; location: 'header' | 'query'; name: string }>
    | Readonly<{ kind: 'http_bearer' }>
    | Readonly<{ kind: 'mcp_oauth' }>
  environment: 'sandbox' | 'production'
  idempotencyKey: string
  context: unknown
  title: string
  description: string
  ctaLabel: string
  candidateDraftRef?: string
  candidateSourceDigest?: string
}>): Promise<SupplySourcePreview> {
  const inputDigest = canonicalDigest({
    format: 'provider-connection-attempt-input:v1',
    sourceKind: input.sourceKind,
    businessRef: input.businessId,
    sourceUrl: input.sourceUrl,
    authentication: input.authentication,
    environment: input.environment,
    ...(input.sourceDescriptorJson === undefined ? {} : { sourceDescriptorJson: input.sourceDescriptorJson }),
    ...(input.candidateDraftRef === undefined ? {} : { candidateDraftRef: input.candidateDraftRef }),
    ...(input.candidateSourceDigest === undefined ? {} : { candidateSourceDigest: input.candidateSourceDigest }),
  })
  const operationKey = canonicalDigest({
    action: 'supply.connection.connect',
    ownerIdempotencyKey: input.idempotencyKey,
    inputDigest,
  })
  const command = {
    businessId: input.businessId,
    sourceKind: input.sourceKind,
    sourceUrl: input.sourceUrl,
    ...(input.sourceDescriptorJson === undefined ? {} : { sourceDescriptorJson: input.sourceDescriptorJson }),
    authentication: input.authentication,
    environment: input.environment,
    inputDigest,
    commandId: operationKey,
    operationKey,
    correlationId: operationKey,
    ...(input.candidateDraftRef === undefined ? {} : { candidateDraftRef: input.candidateDraftRef }),
    ...(input.candidateSourceDigest === undefined ? {} : { candidateSourceDigest: input.candidateSourceDigest }),
  }
  try {
    const sourceWrite = await sourceWriteAdmissionFromContext({
      context: input.context,
      command,
      scope: 'catalog_publish',
      operationKey,
      correlationId: operationKey,
    })
    const reserved = await callSourceMutation(reserveOwnerConnectionAttemptMutation, {
      ...command,
      sourceWrite,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    })
    if (reserved.kind === 'refused') return unavailablePreview()
    return {
      kind: 'action_required',
      requiredAction: {
        action: 'supply.source.preview',
        blockedCapabilities: ['supply.publish'],
        cta: `/owner/supply/connections/new?attempt=${encodeURIComponent(reserved.attemptRef)}`,
        ctaLabel: input.ctaLabel,
        description: input.description,
        iconUrl: null,
        status: 'required',
        title: input.title,
      },
    }
  } catch (cause) {
    return degradeBackend(cause, unavailablePreview(), {
      site: 'reserveOwnerSourceConnection',
      reason: 'source_unavailable',
    })
  }
}

export type OwnerSupplySourceResumeResult =
  | Readonly<{
      kind: 'available'
      source: SupplySourceInput
      preview?: Extract<SupplySourcePreview, { kind: 'ready' }>
      candidateRef: string
      connectionRef?: string
    }>
  | Readonly<{ kind: 'not_found' | 'source_changed' }>

export async function resumeOwnerSupplySourceDraft({
  data,
}: {
  data: Readonly<{
    businessId: string
    draftRef: string
    connectionRef?: string | undefined
    environment?: 'sandbox' | 'production' | undefined
  }>
}): Promise<OwnerSupplySourceResumeResult> {
  const selectedSource = await callSourceQuery(readSourceSelectionDraftQuery, { draftRef: data.draftRef })
  if (selectedSource.kind === 'available') {
    if (selectedSource.draft.businessRef !== data.businessId) {
      return { kind: 'not_found' }
    }
    if (selectedSource.draft.state === 'connected'
      && (selectedSource.draft.connectionRef === undefined
        || selectedSource.draft.connectionRef !== data.connectionRef)) return { kind: 'not_found' }
    let rawSource: unknown
    try {
      rawSource = JSON.parse(selectedSource.draft.sourceDescriptorJson) as unknown
    } catch (cause) {
      return degradeBackend(cause, { kind: 'source_changed' } as const, {
        site: 'resumeOwnerSupplySourceDraft',
        reason: 'invalid_response',
      })
    }
    const parsed = supplySourceInputSchema.safeParse(rawSource)
    if (!parsed.success || (parsed.data.kind !== 'mcp' && parsed.data.kind !== 'agent_plugin')) {
      return { kind: 'source_changed' }
    }
    if (selectedSource.draft.state !== 'connected') {
      return data.connectionRef === undefined
        ? { kind: 'available', source: parsed.data, candidateRef: '' }
        : { kind: 'not_found' }
    }
    const connectionRef = selectedSource.draft.connectionRef
    if (connectionRef === undefined) return { kind: 'not_found' }
    const preview = await previewSupplySource(parsed.data, connectedSourceDependencies({
      source: parsed.data,
      businessRef: data.businessId,
      environment: parsed.data.environment,
    }, connectionRef))
    if (preview.kind !== 'ready') return { kind: 'source_changed' }
    return {
      kind: 'available',
      source: parsed.data,
      preview,
      candidateRef: '',
      connectionRef,
    }
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(data.draftRef)) return { kind: 'not_found' }
  const saved = await callSourceQuery(readCandidateDraftQuery, {
    businessId: data.businessId,
    candidateRef: data.draftRef,
  })
  if (saved.kind !== 'available') return { kind: 'not_found' }
  let rawSource: unknown
  try {
    rawSource = JSON.parse(saved.draft.sourceDescriptorJson) as unknown
  } catch (cause) {
    return degradeBackend(cause, { kind: 'source_changed' } as const, {
      site: 'resumeOwnerSupplySourceDraft',
      reason: 'invalid_response',
    })
  }
  const parsed = supplySourceInputSchema.safeParse(rawSource)
  if (!parsed.success) return { kind: 'source_changed' }
  if (data.environment !== undefined && parsed.data.environment !== data.environment) {
    return { kind: 'source_changed' }
  }
  if (parsed.data.kind === 'x402' && data.connectionRef !== undefined) {
    const connection = (await readOwnerProviderConnectionsForPublication()).find((candidate) => (
      candidate.connectionRef === data.connectionRef
      && candidate.businessId === data.businessId
    ))
    if (!isMatchingX402Connection(connection, parsed.data)) return { kind: 'not_found' }
  }
  const connectionRef = data.connectionRef
  const preview = parsed.data.kind === 'x402' || connectionRef === undefined
    ? await previewSupplySource(parsed.data)
    : parsed.data.kind === 'openapi'
      ? await previewSupplySource(parsed.data, {
          loadOpenApi: async () => {
            const { loadOwnerConnectedOpenApi } = await import('./provider-connection-handoff')
            return await loadOwnerConnectedOpenApi({
              connectionRef,
              businessRef: data.businessId,
              definitionUrl: parsed.data.kind === 'openapi' ? parsed.data.definitionUrl : '',
              environment: parsed.data.environment,
            })
          },
        })
      : parsed.data.kind === 'mcp' && parsed.data.serverUrl !== undefined
        ? await previewSupplySource(parsed.data, {
            mcpAuthentication: { kind: 'mcp_oauth' },
            discoverMcp: async () => {
              const { previewOwnerMcpProviderConnection } = await import('./provider-connection-handoff')
              return await previewOwnerMcpProviderConnection({
                connectionRef,
                businessRef: data.businessId,
                serverUrl: parsed.data.kind === 'mcp' ? parsed.data.serverUrl! : '',
                environment: parsed.data.environment,
              })
            },
          })
        : undefined
  if (preview === undefined) return { kind: 'source_changed' }
  if (preview.kind !== 'ready'
    || preview.sourceDigest !== saved.draft.sourceDigest
    || !preview.candidates.some(({ candidateRef }) => candidateRef === saved.draft.candidateRef)) {
    return { kind: 'source_changed' }
  }
  return {
    kind: 'available',
    source: parsed.data,
    preview,
    candidateRef: saved.draft.candidateRef,
    ...(data.connectionRef === undefined ? {} : { connectionRef: data.connectionRef }),
  }
}

export async function publishOwnerSupplySource({
  data,
  context,
}: {
  data: PublishSupplyToolV2Input
  context: unknown
}): Promise<SupplyPublishResult> {
  const providerAuthority = data.connectionRef === undefined
    ? undefined
    : selectSupplyProviderAuthority(
        data.businessRef,
        data.connectionRef,
        await readOwnerProviderConnectionsForPublication(),
      )
  if (data.connectionRef !== undefined && providerAuthority === undefined) {
    return { kind: 'refused', reason: 'connection_unavailable' }
  }
  const sourceDependencies = data.connectionRef === undefined
    ? {}
    : connectedSourceDependencies(data, data.connectionRef)
  const preparation = await prepareSupplyPublicationV2(data, {
    ...(providerAuthority === undefined ? {} : { providerAuthority }),
    ...sourceDependencies,
  })
  if (preparation.kind === 'refused') return { kind: 'refused', reason: preparation.reason }

  const operationKey = canonicalDigest({
    action: 'supply.publish',
    businessRef: data.businessRef,
    idempotencyKey: data.idempotencyKey,
  })
  const correlationId = operationKey
  const write = async <Result>(
    command: Record<string, unknown>,
    mutation: ReturnType<typeof sourceMutation<Record<string, unknown>, Result>>,
  ): Promise<Result> => {
    const sourceWrite = await sourceWriteAdmissionFromContext({
      context,
      command,
      scope: 'catalog_publish',
      operationKey: String(command.operationKey),
      correlationId,
    })
    return await callSourceMutation(mutation, {
      ...command,
      sourceWrite,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    })
  }

  const draft = await write({
    businessId: data.businessRef,
    title: data.presentation.name,
    description: data.presentation.description,
    category: data.presentation.category,
    sourceKind: data.source.kind,
    sourceDescriptorJson: preparation.sourceDescriptorJson,
    sourceDigest: preparation.sourceDigest,
    sourceRevision: preparation.sourceRevision,
    candidateRef: data.candidateRef,
    sourceSelectorJson: preparation.sourceSelectorJson,
    ...(data.connectionRef === undefined ? {} : { connectionRef: data.connectionRef }),
    ...(preparation.validationInputJson === undefined ? {} : { validationInputJson: preparation.validationInputJson }),
    operationKey: `${operationKey}:draft`,
    correlationId,
  }, saveDraftMutation)
  if (draft.kind === 'refused') return { kind: 'refused', reason: draft.reason }

  const readback = await callSourceQuery(readOwnerSupplyQuery, { businessId: data.businessRef })
  const origin = publicationOrigin(readback, draft)
  if (origin === undefined) return { kind: 'refused', reason: 'catalog_offering_origin_changed' }
  const prepared: PreparedPublicationMaterial = {
    ...preparation.prepared.prepared,
    sourceAuthorityState: preparation.sourceAuthorityState,
    offering: {
      ...preparation.prepared.prepared.offering,
      origin,
    },
  }
  const materialDigest = canonicalDigest(data)
  const reservation = await write({
    businessId: data.businessRef,
    offeringRef: origin.offeringRef,
    offeringRevision: origin.offeringRevision,
    offeringSourceHash: origin.offeringSourceHash,
    materialDigest,
    operationKey,
    correlationId,
    reasonCode: 'supply.publish',
    evidenceRefs: [preparation.sourceDigest, data.candidateRef],
  }, reservePublicationMutation)
  if (reservation.kind === 'refused') return { kind: 'refused', reason: reservation.reason }

  const proof = await requireStrictClerkConsequenceProof(operationKey)
  const published = await write({
    businessId: data.businessRef,
    offeringRef: origin.offeringRef,
    revision: origin.offeringRevision,
    sourceHash: origin.offeringSourceHash,
    runtimeEnvironment: data.environment,
    prepared,
    proof,
    operationKey,
    correlationId,
    reasonCode: 'supply.publish',
    evidenceRefs: [preparation.sourceDigest, data.candidateRef],
  }, publishMutation)
  if (published.kind === 'refused') return { kind: 'refused', reason: published.reason }
  return {
    kind: published.kind === 'replayed' ? 'replayed' : 'submitted',
    publicationRef: published.publicationRef,
    publicationRevision: published.publicationRevision,
    toolRef: published.toolRef,
    state: 'Submitted',
  }
}

function connectedSourceDependencies(
  input: Pick<PublishSupplyToolV2Input, 'source' | 'businessRef' | 'environment'>,
  connectionRef: string,
): SupplySourcePreviewDependencies {
  if (input.source.kind === 'openapi') {
    return {
      loadOpenApi: async () => {
        const { loadOwnerConnectedOpenApi } = await import('./provider-connection-handoff')
        return await loadOwnerConnectedOpenApi({
          connectionRef,
          businessRef: input.businessRef,
          definitionUrl: input.source.kind === 'openapi' ? input.source.definitionUrl : '',
          environment: input.environment,
        })
      },
    }
  }
  if (input.source.kind === 'mcp' || input.source.kind === 'agent_plugin') {
    return {
      mcpAuthentication: { kind: 'mcp_oauth' },
      discoverMcp: async ({ serverUrl, registryName, remoteRef, environment }) => {
        const { previewOwnerMcpProviderConnection } = await import('./provider-connection-handoff')
        return await previewOwnerMcpProviderConnection({
            connectionRef,
            businessRef: input.businessRef,
            ...(serverUrl === undefined ? {} : { serverUrl }),
            ...(registryName === undefined ? {} : { registryName }),
            ...(remoteRef === undefined ? {} : { remoteRef }),
            environment,
          })
      },
    }
  }
  return {}
}

async function readOwnerProviderConnectionsForPublication(): Promise<readonly ProviderConnectionOwnerProjection[]> {
  try {
    return await callSourceQuery(
      sourceQuery<Record<string, never>, readonly ProviderConnectionOwnerProjection[]>(
        'capabilityProviderConnections:listOwner',
      ),
      {},
    )
  } catch (cause) {
    return degradeBackend(cause, [], {
      site: 'readOwnerProviderConnectionsForPublication',
      reason: 'source_unavailable',
    })
  }
}

function publicationOrigin(
  readback: OwnerSupplyFunnelReadback,
  draft: Extract<OwnerDraftResult, { kind: 'saved' | 'replayed' }>,
): Extract<PreparedPublicationMaterial['offering']['origin'], { kind: 'catalog_offering' }> | undefined {
  if (readback.kind !== 'available') return undefined
  const offering = readback.offerings.find(({ offeringRef }) => offeringRef === draft.offeringRef)
  const accessPath = offering?.accessPaths.find(({ accessPathRef }) => accessPathRef === draft.accessPathRef)
  if (offering?.sourceHash === undefined || accessPath === undefined) return undefined
  return {
    kind: 'catalog_offering',
    offeringRef: offering.offeringRef,
    offeringRevision: offering.revision,
    offeringSourceHash: offering.sourceHash,
    declaredAccessPathRef: accessPath.accessPathRef,
    accessPathSourceHash: accessPath.sourceHash,
  }
}

function unavailablePreview(): SupplySourcePreview {
  return {
    kind: 'action_required',
    requiredAction: {
      action: 'supply.source.preview',
      blockedCapabilities: ['supply.publish'],
      cta: '/owner/offerings',
      ctaLabel: 'Return to Tools',
      description: 'The current Business could not be confirmed. Return to Tools and try again.',
      iconUrl: null,
      status: 'required',
      title: 'Business unavailable',
    },
  }
}

function isSupportedX402Candidate(
  candidate: SupplyToolCandidate,
  source: Extract<SupplySourceInput, { kind: 'x402' }>,
): boolean {
  if (candidate.disposition.kind !== 'supported' || candidate.authentication.kind !== 'x402_wallet') return false
  if (!('resourceUrl' in candidate.sourceSelector)) return false
  return canonicalResourceUrl(candidate.sourceSelector.resourceUrl) === canonicalResourceUrl(source.resourceUrl)
    && candidate.sourceSelector.method === source.method
}

function isMatchingX402Connection(
  connection: ProviderConnectionOwnerProjection | undefined,
  source: Extract<SupplySourceInput, { kind: 'x402' }>,
): boolean {
  if (connection === undefined
    || !connection.available
    || connection.lifecycle !== 'active'
    || connection.adapterId !== 'x402-fetch:v2'
    || connection.x402Method !== source.method
    || connection.grantedResources.length !== 1
    || canonicalResourceUrl(connection.grantedResources[0] ?? '') !== canonicalResourceUrl(source.resourceUrl)) {
    return false
  }
  return connection.sourceEnvironment === undefined || connection.sourceEnvironment === source.environment
}

function x402ConnectionCta(input: Readonly<{
  candidateRef: string
  resourceUrl: string
  method: 'GET' | 'POST'
  environment: 'sandbox' | 'production'
}>): string {
  const search = new URLSearchParams({
    connect: 'x402',
    draft: input.candidateRef,
    resourceUrl: input.resourceUrl,
    method: input.method,
    environment: input.environment,
  })
  return `/owner/offerings?${search.toString()}`
}

function canonicalResourceUrl(resourceUrl: string): string {
  try {
    return new URL(resourceUrl).toString()
  } catch (cause) {
    return degradeBackend(cause, resourceUrl, {
      site: 'canonicalResourceUrl',
      reason: 'invalid_response',
    })
  }
}
