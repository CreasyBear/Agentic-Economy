import { z } from 'zod'

import { requireStrictClerkConsequenceProof } from '@/lib/server/clerk-consequence-proof'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { callSourceMutation, callSourceQuery, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import { idempotencyKeySchema } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { sourceWriteRequestFromAdmission } from '@/modules/security/source-write-admission'
import { stableStringify } from '@/modules/common/stable-hash'

import type { SupplyIntegrationDraftTerms } from '../../integration-draft'
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
import { assessSupplySource, type SupplySourceAssessment } from '../../source-assessment'
import type { SupplyPublishResult } from '../../supply-actions'
import { readOwnerSupplyQuery } from './funnel-owner'
import type { OwnerSupplyFunnelReadback } from './types'

const ownerSourcePreviewInputSchema = z.strictObject({
  businessId: z.string().min(1),
  source: supplySourceInputSchema,
  connectionRef: z.string().trim().min(1).max(300).optional(),
  idempotencyKey: idempotencyKeySchema,
})

export const ownerSourceAssessmentInputSchema = ownerSourcePreviewInputSchema.extend({
  expectedSourceDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  expectedSourceRevision: z.string().min(1),
  candidateRef: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  mode: z.enum(['suggest', 'verify']),
})

export type OwnerSupplySourceAssessmentInput = z.infer<typeof ownerSourceAssessmentInputSchema>

export async function assessOwnerSupplySource(input: {
  data: OwnerSupplySourceAssessmentInput
  context: unknown
  signal?: AbortSignal
}): Promise<SupplySourceAssessment> {
  const { data } = input
  const previewInput = { data: ownerSourcePreviewInputSchema.parse({
    businessId: data.businessId, source: data.source, idempotencyKey: data.idempotencyKey,
    ...(data.connectionRef === undefined ? {} : { connectionRef: data.connectionRef }),
  }), context: input.context }
  const current = (preview: Extract<SupplySourcePreview, { kind: 'ready' }>): boolean => (
    preview.kind === 'ready' && preview.sourceDigest === data.expectedSourceDigest
    && preview.sourceRevision === data.expectedSourceRevision
    && preview.candidates.some(candidate => candidate.candidateRef === data.candidateRef && candidate.disposition.kind === 'supported')
  )
  if (input.signal?.aborted) return { kind: 'unavailable', reason: 'cancelled' }
  const preview = await previewOwnerSupplySource(previewInput)
  if (preview.kind !== 'ready' || !current(preview)) return { kind: 'unavailable', reason: preview.kind === 'ready' ? 'source_changed' : 'source_unavailable' }
  if (input.signal?.aborted) return { kind: 'unavailable', reason: 'cancelled' }
  if (data.mode === 'verify') return { kind: 'current', sourceDigest: preview.sourceDigest,
    sourceRevision: preview.sourceRevision, candidateRef: data.candidateRef }
  const assessment = await assessSupplySource(preview, data.candidateRef,
    input.signal === undefined ? {} : { signal: input.signal })
  if (assessment.kind !== 'suggested') return assessment
  // Source refresh or ownership loss during inference invalidates the suggestion.
  const refreshed = await previewOwnerSupplySource(previewInput)
  if (refreshed.kind !== 'ready' || !current(refreshed)) return { kind: 'unavailable', reason: refreshed.kind === 'ready' ? 'source_changed' : 'source_unavailable' }
  if (input.signal?.aborted) return { kind: 'unavailable', reason: 'cancelled' }
  return assessment
}

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
type CandidateDraftResult =
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{
      kind: 'available'
      draft: Readonly<{
        sourceDescriptorJson: string
        sourceDigest: string
        terms?: SupplyIntegrationDraftTerms
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

const ownerDraftTermsSchema = z.strictObject({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  category: z.string().trim().min(1),
  serviceArea: z.string(),
  availability: z.string(),
  pricingKind: z.enum(['free', 'fixed_aud', 'source_x402']),
  price: z.string(),
  externalEffect: z.boolean(),
  dataRelease: z.boolean(),
  financialExposure: z.boolean(),
  dataClassification: z.enum(['public', 'personal', 'sensitive']),
})

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
  terms: ownerDraftTermsSchema.optional(),
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
    ...(data.terms === undefined ? {} : { terms: data.terms }),
  })
  const command = {
    businessId: data.businessRef,
    title: data.terms?.name ?? data.candidate.title,
    description: data.terms?.description ?? data.candidate.description,
    category: data.terms?.category ?? 'Uncategorised',
    sourceKind: data.source.kind,
    sourceDescriptorJson: stableStringify(data.source as never),
    sourceDigest: data.sourceDigest,
    sourceRevision: data.sourceRevision,
    candidateRef: data.candidate.candidateRef,
    sourceSelectorJson: stableStringify(data.candidate.sourceSelector as never),
    ...(data.terms === undefined ? {} : { terms: data.terms }),
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
  context: _context,
}: {
  data: z.infer<typeof ownerSourcePreviewInputSchema>
  context: unknown
}): Promise<SupplySourcePreview> {
  const readback = await callSourceQuery(readOwnerSupplyQuery, { businessId: data.businessId })
  if (readback.kind !== 'available') return unavailablePreview()
  return await previewSupplySource(data.source)
}

export async function startOwnerSupplySourceConnection({
  data,
  context: _context,
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
  const environment = candidate.x402?.environment ?? data.source.environment
  if (environment === undefined || !isSupportedX402Candidate(candidate, {
    ...data.source,
    method: candidate.sourceSelector.method,
    environment,
  })) return unavailablePreview()
  return {
    kind: 'action_required',
    requiredAction: {
      action: 'supply.source.preview',
      blockedCapabilities: ['supply.publish'],
      cta: x402ConnectionCta({
        candidateRef: data.candidateRef,
        resourceUrl: data.source.resourceUrl,
        method: candidate.sourceSelector.method,
        environment,
      }),
      ctaLabel: 'Prove payTo',
      description: 'Sign one wallet message for this endpoint payee. The signature proves control of payTo and does not reveal a private key.',
      iconUrl: null,
      status: 'required',
      title: 'Prove the payee',
    },
  }
}

export type OwnerSupplySourceResumeResult =
  | Readonly<{
      kind: 'available'
      source: SupplySourceInput
      preview?: Extract<SupplySourcePreview, { kind: 'ready' }>
      candidateRef: string
      terms?: SupplyIntegrationDraftTerms
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
    if (!parsed.success) return { kind: 'source_changed' }
    if (selectedSource.draft.state !== 'connected') {
      return data.connectionRef === undefined
        ? { kind: 'available', source: parsed.data, candidateRef: '' }
        : { kind: 'not_found' }
    }
    const connectionRef = selectedSource.draft.connectionRef
    if (connectionRef === undefined) return { kind: 'not_found' }
    const preview = await previewSupplySource(parsed.data)
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
  const preview = await previewSupplySource(parsed.data)
  if (preview.kind !== 'ready'
    || preview.sourceDigest !== saved.draft.sourceDigest
    || !preview.candidates.some(({ candidateRef }) => candidateRef === saved.draft.candidateRef)) {
    return { kind: 'source_changed' }
  }
  return {
    kind: 'available',
    source: parsed.data,
    preview,
    ...(saved.draft.terms === undefined ? {} : { terms: saved.draft.terms }),
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
  _input: Pick<PublishSupplyToolV2Input, 'source' | 'businessRef' | 'environment'>,
  _connectionRef: string,
): SupplySourcePreviewDependencies {
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
      cta: '/owner/operations',
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
  return `/owner/settings/integrations?${search.toString()}`
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
