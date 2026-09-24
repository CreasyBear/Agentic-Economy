import { degradeBackend } from '@/lib/observability/degrade-backend'
import { dereferenceLocalSchema } from '@/modules/capability-supply/convex'
import { jsonValueSchema } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  decodeConvexPublicationSource,
  preparePublicationDraft,
  publishPreparedCapabilityCommand,
  validEvidenceRefs,
  withdrawCapabilityCommand,
  type CapabilityPublicationBindingDraft,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
  type PreparePublicationDraftRefusal,
  type PublishPreparedCapabilityCommandInput,
  type PublishPreparedCapabilityRefusal,
  type SupplyCommandActor,
} from '@/modules/capability-supply/public'
import type { Id } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import { rebuildCapabilityOriginSupplyProjection } from '../../capabilitySupplyShared'
import { upsertProviderDirectoryRows } from '../x402DirectoryIndex/providerRows'
import {
  publicationPorts,
  syncProviderDirectoryRowsAfterPublish,
} from './publishPrepared'

type BootstrapPreparedCapabilityInput = Omit<
  PublishPreparedCapabilityCommandInput,
  'actor'
>
type BootstrapRawCapabilityInput = Omit<
  PublishPreparedCapabilityCommandInput,
  'actor' | 'prepared'
> &
  Readonly<{
    source: unknown
    sourceRevision?: string
    pricingConfig?: unknown
    offering?: CapabilityPublicationOfferingDraft
    binding?: CapabilityPublicationBindingDraft
  }>
type BootstrapCapabilityInput =
  BootstrapPreparedCapabilityInput | BootstrapRawCapabilityInput

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  )
}

function isDecodedPublicationImport(
  value: unknown,
): value is CapabilityPublicationImport {
  const parsed = jsonValueSchema.safeParse(value)
  if (
    !parsed.success ||
    !isRecord(parsed.data) ||
    typeof parsed.data.kind !== 'string'
  )
    return false
  const source = parsed.data
  if (
    !isStringArray(source.evidenceRefs) ||
    !validEvidenceRefs(source.evidenceRefs)
  )
    return false
  switch (source.kind) {
    case 'ae_envelope':
      return (
        typeof source.documentJson === 'string' &&
        isRecord(source.offering) &&
        isRecord(source.binding)
      )
    case 'openapi_http':
      return (
        isRecord(source.document) &&
        isRecord(source.operation) &&
        typeof source.operation.path === 'string' &&
        (source.operation.method === 'get' ||
          source.operation.method === 'post') &&
        (source.fixedQuery === undefined ||
          (Array.isArray(source.fixedQuery) &&
            source.fixedQuery.every(
              (entry) =>
                isRecord(entry) &&
                typeof entry.parameter === 'string' &&
                typeof entry.value === 'string',
            ))) &&
        isRecord(source.contract) &&
        isRecord(source.commercial)
      )
    case 'mcp':
      return (
        typeof source.serverUrl === 'string' &&
        typeof source.protocolVersion === 'string' &&
        isRecord(source.tool) &&
        isRecord(source.contract) &&
        isRecord(source.commercial)
      )
    case 'agent_plugin_mcp':
      return (
        typeof source.serverName === 'string' &&
        typeof source.protocolVersion === 'string' &&
        isRecord(source.manifest) &&
        isRecord(source.tool) &&
        isRecord(source.contract) &&
        isRecord(source.commercial)
      )
    case 'x402':
      return (
        isRecord(source.resource) &&
        isRecord(source.contract) &&
        isRecord(source.commercial)
      )
    default:
      return false
  }
}

function decodeBootstrapPublicationSource(
  source: unknown,
  offering: CapabilityPublicationOfferingDraft | undefined,
  binding: CapabilityPublicationBindingDraft | undefined,
  evidenceRefs: readonly string[],
): CapabilityPublicationImport | undefined {
  let decoded: unknown
  try {
    decoded = decodeConvexPublicationSource(source)
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'decodeBootstrapPublicationSource', reason: 'invalid_response' })
  }
  if (!isRecord(decoded) || typeof decoded.kind !== 'string') return undefined
  if (decoded.kind === 'ae_envelope') {
    if (typeof decoded.documentJson !== 'string') return undefined
    const envelopeOffering = decoded.offering ?? offering
    const envelopeBinding = decoded.binding ?? binding
    if (!isRecord(envelopeOffering) || !isRecord(envelopeBinding))
      return undefined
    const envelopeEvidenceRefs = decoded.evidenceRefs
    const candidate = {
      kind: 'ae_envelope' as const,
      documentJson: decoded.documentJson,
      offering: envelopeOffering,
      binding: envelopeBinding,
      evidenceRefs: isStringArray(envelopeEvidenceRefs)
        ? envelopeEvidenceRefs
        : evidenceRefs,
    }
    return isDecodedPublicationImport(candidate) ? candidate : undefined
  }
  return isDecodedPublicationImport(decoded) ? decoded : undefined
}

function bootstrapSourceRevision(
  sourceValue: unknown,
  source: CapabilityPublicationImport,
  operationKey: string,
): string {
  const sourceRecord = isRecord(sourceValue) ? sourceValue : undefined
  const embeddedRevision = sourceRecord?.sourceRevision
  if (typeof embeddedRevision === 'string') return embeddedRevision
  try {
    return `seed:bootstrap:${canonicalDigest(source)}`
  } catch {
    const safeOperationKey = operationKey
      .replace(/[^A-Za-z0-9._:/-]/gu, '-')
      .slice(0, 180)
    return `seed:bootstrap:${safeOperationKey || 'publication'}`
  }
}

function mapBootstrapPreparationRefusal(
  reason: PreparePublicationDraftRefusal,
): PublishPreparedCapabilityRefusal {
  return reason
}

/*
 * `registrySearchDocuments` is the only table `/api/businesses/search` reads,
 * and nothing under the publish command writes it. The owner-facing handler
 * rebuilds after its own publish (see `publishPreparedCapabilityHandler`), so
 * without the same rebuild here every business onboarded through a system
 * publish - dev seed, curated bootstrap, facilitator discovery - stays
 * invisible to business search until some unrelated catalog write happens to
 * rebuild it. Same command every catalog write path uses; it diffs documents
 * against the stored rows, so a replayed publish is a no-op rather than a
 * duplicate row.
 */
export async function publishBootstrapCapability(
  ctx: MutationCtx,
  input: BootstrapCapabilityInput,
  actor: SupplyCommandActor,
) {
  const result = await commitBootstrapCapability(ctx, input, actor)
  if (result.kind !== 'refused') {
    await rebuildCapabilityOriginSupplyProjection(
      ctx,
      input.businessId as Id<'businesses'>,
      input.now,
    )
    await syncProviderDirectoryRowsAfterPublish(ctx, result.publicationRef, result.publicationRevision)
  }
  return result
}

async function commitBootstrapCapability(
  ctx: MutationCtx,
  input: BootstrapCapabilityInput,
  actor: SupplyCommandActor,
) {
  const ports = publicationPorts(ctx)
  if ('prepared' in input) {
    return publishPreparedCapabilityCommand({ ...input, actor }, ports)
  }

  const source = decodeBootstrapPublicationSource(
    input.source,
    input.offering,
    input.binding,
    input.evidenceRefs,
  )
  if (source === undefined)
    return { kind: 'refused' as const, reason: 'source_invalid' as const }
  const pricingConfig = input.pricingConfig
  if (pricingConfig === undefined)
    return { kind: 'refused' as const, reason: 'price_unavailable' as const }
  const prepared = await preparePublicationDraft({
    source,
    sourceRevision:
      input.sourceRevision ??
      bootstrapSourceRevision(input.source, source, input.operationKey),
    pricingConfig,
    offering: input.offering,
    binding: input.binding,
    origin: input.origin,
    evidenceRefs: input.evidenceRefs,
    derefSchema: dereferenceLocalSchema,
  })
  if (prepared.kind === 'refused') {
    return {
      kind: 'refused' as const,
      reason: mapBootstrapPreparationRefusal(prepared.reason),
    }
  }
  return publishPreparedCapabilityCommand(
    {
      businessId: input.businessId,
      runtimeEnvironment: input.runtimeEnvironment,
      prepared: prepared.prepared,
      operationKey: input.operationKey,
      correlationId: input.correlationId,
      reasonCode: input.reasonCode,
      evidenceRefs: input.evidenceRefs,
      now: input.now,
      actor,
      ...(input.origin === undefined ? {} : { origin: input.origin }),
      ...(input.publicationMetadata === undefined
        ? {}
        : { publicationMetadata: input.publicationMetadata }),
    },
    ports,
  )
}

export async function publishCapabilityForSeed(
  ctx: MutationCtx,
  input: BootstrapCapabilityInput,
) {
  return publishBootstrapCapability(ctx, input, {
    kind: 'system',
    ref: 'system:dev-seed',
  })
}

export async function publishCuratedCapability(
  ctx: MutationCtx,
  input: BootstrapCapabilityInput,
) {
  return publishBootstrapCapability(ctx, input, {
    kind: 'system',
    ref: 'system:curated-provider-bootstrap',
  })
}

export async function withdrawCuratedCapability(
  ctx: MutationCtx,
  input: Readonly<{
    publicationRef: string
    expectedRevision: number
    evidenceRefs: readonly string[]
    now: number
  }>,
) {
  const ports = publicationPorts(ctx)
  const publication = await ports.loadPublicationAtRevision(
    input.publicationRef,
    input.expectedRevision,
  )
  if (publication === null) {
    return {
      kind: 'refused' as const,
      reason: 'publication_not_found' as const,
    }
  }
  // Only curated admin classes are withdrawable via the curated path.
  // provider_owned is owner-managed and observed_external is never withdrawable
  // until it is promoted out of the observed (inert) state.
  if (
    publication.publisherRef !== 'system:curated-provider-bootstrap' ||
    (publication.authorityMode !== 'ae_curated_external' &&
      publication.authorityMode !== 'third_party_gateway')
  ) {
    return {
      kind: 'refused' as const,
      reason: 'authorization_denied' as const,
    }
  }
  const result = await withdrawCapabilityCommand(
    {
      publication,
      evidenceRefs: input.evidenceRefs,
      now: input.now,
    },
    ports,
  )
  if (result.kind === 'withdrawn') {
    await rebuildCapabilityOriginSupplyProjection(
      ctx,
      publication.businessId as Id<'businesses'>,
      input.now,
    )
    await upsertProviderDirectoryRows(ctx, {
      disposition: 'withdrawn', authorityMode: publication.authorityMode,
      ...(publication.sourceRouteRef === undefined ? {} : { sourceRouteRef: publication.sourceRouteRef }),
      businessId: publication.businessId as Id<'businesses'>,
      offeringId: publication.offeringId, networkId: publication.networkId, sourceKind: publication.sourceKind,
    })
  }
  return result
}
