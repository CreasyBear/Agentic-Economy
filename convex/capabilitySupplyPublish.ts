import { v, type Infer } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { dereferenceLocalSchema } from '@/modules/capability-supply/convex'
import { jsonValueSchema } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  contractRefFromRow,
  decodeConvexPublicationSource,
  preparePublicationDraft,
  publicationLifecycle,
  publicationProjection,
  publishPreparedCapabilityCommand,
  withdrawCapabilityCommand,
  validRegistrationContext,
  validEvidenceRefs,
  capabilityPublicationSourceSelectorValue,
  connectionAuthoritySnapshotsEqual,
  rotateCapabilityTransportBindingAuthority,
  type CapabilityPublicationBindingDraft,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
  type PreparePublicationDraftRefusal,
  type PublishPreparedCapabilityCommandInput,
  type PublishPreparedCapabilityCommandResult,
  type PublishPreparedCapabilityRefusal,
  type SupplyCommandActor,
} from '@/modules/capability-supply/public'

import {
  agentAccessPrincipalValue,
  verifySupplyAgentPrincipal,
} from './agentAccessPrincipals'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { capabilitySupplyPublicationPorts } from './capabilitySupplyPublicationPorts'
import { capabilitySupplyWriterPorts } from './capabilitySupplyWriterPorts'
import {
  registerCapabilityOffering,
  registerCapabilityTransportBinding,
  setCapabilitySupplyEligibility,
} from './capabilitySupplyCommands'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internal } from './_generated/api'
import { resolveAdminAuthority, resolveBusinessActor } from './authz'
import { clerkConsequenceProofValue } from './lib/consequenceProof'
import { admitAgentPublicationConsequence } from './lib/agentPublicationConsequence'
import { admitInteractiveOwnerConsequence } from './lib/ownerConsequence'
import { providerRouteabilityIsFrozen } from './lib/providerOffboardingFreeze'
import { isNativeSupplySource, nativeSubmissionBusiness, nativeSubmissionPorts } from './capabilitySupplyNativeAdmission'
import { upsertProviderToolIdentity } from './capabilityProviderToolProjection'
import { upsertProviderDirectoryRows } from './x402DirectoryIndexStore'
import {
  authorityValue,
  cancellationValue,
  continuationValue,
  contextFields,
  contractRefValue,
  convexPublicationLifecycle,
  evidenceRefsValue,
  offeringOriginValue,
  ownsPublishedBusiness,
  ownsPublishedBusinessForOwnerId,
  presentationValue,
  publicationAuthorityModeValue,
  publicationLifecycleValue,
  rebuildCapabilityOriginSupplyProjection,
} from './capabilitySupplyShared'

/**
 * Well 8 Lane C: keeps a publication's market directory rows in step with a
 * publish/withdraw immediately, alongside rebuildCapabilityOriginSupplyProjection
 * above (same transaction, no ctx.runMutation hop - upsertProviderDirectoryRows
 * is a plain helper, not a Convex function reference). The hourly
 * reconcileProviderDirectoryRows sweep (workloadCron.ts) is the safety net for
 * any disposition change that bypasses these call sites.
 */
async function syncProviderDirectoryRowsAfterPublish(
  ctx: MutationCtx, publicationRef: string, publicationRevision: number,
): Promise<void> {
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query.eq('publicationRef', publicationRef).eq('revision', publicationRevision))
    .unique()
  if (publication !== null) await upsertProviderDirectoryRows(ctx, publication)
}

export const verifyCapabilitySourceAuthorityArgs = {
  publicationRef: v.string(),
  expectedRevision: v.number(),
  expectedSourceDigest: v.string(),
  evidenceRefs: v.array(v.string()),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
} as const

export const verifyCapabilitySourceAuthorityResultValue = v.union(
  v.object({
    kind: v.union(v.literal('verified'), v.literal('replayed')),
    publicationRef: v.string(),
    revision: v.number(),
    toolRef: v.string(),
    sourceAuthorityState: v.literal('verified'),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authorization_denied'),
      v.literal('publication_not_found'),
      v.literal('revision_changed'),
      v.literal('source_changed'),
      v.literal('evidence_invalid'),
    ),
  }),
)

export async function verifyCapabilitySourceAuthorityHandler(
  ctx: MutationCtx,
  args: Readonly<{
    publicationRef: string
    expectedRevision: number
    expectedSourceDigest: string
    evidenceRefs: string[]
    operationKey: string
    correlationId: string
    sourceWrite?: unknown
    sourceWriteRequest?: unknown
  }>,
) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'admin_operator')
  if (sourceWrite.kind === 'rejected') {
    return { kind: 'refused' as const, reason: 'authorization_denied' as const }
  }
  const admin = await resolveAdminAuthority(ctx, 'register_capability_supply')
  if (admin.kind !== 'allowed') {
    return { kind: 'refused' as const, reason: 'authorization_denied' as const }
  }
  if (!validEvidenceRefs(args.evidenceRefs) || args.evidenceRefs.length === 0) {
    return { kind: 'refused' as const, reason: 'evidence_invalid' as const }
  }
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', args.publicationRef)
      .eq('revision', args.expectedRevision))
    .unique()
  if (publication === null || publication.disposition !== 'current') {
    return { kind: 'refused' as const, reason: 'publication_not_found' as const }
  }
  if (publication.revision !== args.expectedRevision) {
    return { kind: 'refused' as const, reason: 'revision_changed' as const }
  }
  if (publication.sourceDigest !== args.expectedSourceDigest) {
    return { kind: 'refused' as const, reason: 'source_changed' as const }
  }
  if (publication.sourceAuthorityState === 'verified') {
    return {
      kind: 'replayed' as const,
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      toolRef: publication.toolRef,
      sourceAuthorityState: 'verified' as const,
    }
  }
  const now = Date.now()
  const authorityEvidenceRefs = [...new Set([
    ...(publication.registrationEvidenceRefs ?? []),
    ...args.evidenceRefs,
  ])].sort()
  await ctx.db.patch(publication._id, {
    sourceAuthorityState: 'verified',
    registrationEvidenceRefs: authorityEvidenceRefs,
    updatedAt: now,
  })
  const admissionCase = await ctx.db.query('capabilitySupplyAdmissionCases')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', publication.publicationRef)
      .eq('publicationRevision', publication.revision))
    .unique()
  if (admissionCase !== null) {
    await ctx.db.patch(admissionCase._id, {
      sourceAuthorityState: 'verified',
      state: 'under_review',
      terminalDecision: 'pending',
      blockerRefs: [],
      evidenceRefs: [...new Set([...admissionCase.evidenceRefs, ...args.evidenceRefs])].sort(),
      reviewStartedAt: admissionCase.reviewStartedAt ?? now,
      completedAt: undefined,
      updatedAt: now,
    })
  }
  await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
    publicationRef: publication.publicationRef,
    expectedRevision: publication.revision,
  })
  return {
    kind: 'verified' as const,
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    toolRef: publication.toolRef,
    sourceAuthorityState: 'verified' as const,
  }
}

const adapterConfigScalarValue = v.union(
  v.string(),
  v.number(),
  v.boolean(),
  v.null(),
)
const adapterConfigObjectValue = v.record(v.string(), adapterConfigScalarValue)
const adapterConfigValue = v.record(
  v.string(),
  v.union(
    adapterConfigScalarValue,
    v.array(adapterConfigScalarValue),
    adapterConfigObjectValue,
    v.array(adapterConfigObjectValue),
  ),
)
const adapterValue = v.object({
  adapterId: v.string(),
  config: v.union(v.null(), adapterConfigValue),
})
export const capabilityPublicationOfferingValue = v.object({
  offeringId: v.string(),
  networkId: v.string(),
  origin: v.optional(offeringOriginValue),
  presentation: presentationValue,
  searchTerms: v.array(v.string()),
  registrationEvidenceRefs: evidenceRefsValue,
})
export const capabilityPublicationBindingValue = v.object({
  bindingId: v.string(),
  endpointUrl: v.string(),
  authority: authorityValue,
  continuation: continuationValue,
  cancellation: cancellationValue,
  adapter: adapterValue,
  registrationEvidenceRefs: evidenceRefsValue,
})
export const preparedPublicationMaterialValue = v.object({
  sourceKind: v.union(
    v.literal('ae_envelope'),
    v.literal('openapi_http'),
    v.literal('mcp'),
    v.literal('agent_plugin_mcp'),
    v.literal('x402'),
  ),
  sourceSelector: capabilityPublicationSourceSelectorValue,
  sourceDescriptorJson: v.string(),
  sourceRevision: v.string(),
  sourceDigest: v.string(),
  sourceRouteRef: v.string(),
  sourceAuthorityState: v.optional(
    v.union(v.literal('verified'), v.literal('review_required')),
  ),
  documentJson: v.string(),
  offering: capabilityPublicationOfferingValue,
  binding: capabilityPublicationBindingValue,
  evidenceRefs: evidenceRefsValue,
  pricingConfigJson: v.string(),
  priceDigest: v.string(),
})
const preparedPublicationRefusalValue = v.union(
  v.literal('authorization_denied'),
  v.literal('authority_mismatch'),
  v.literal('reauthentication_required'),
  v.literal('proof_stale'),
  v.literal('proof_replayed'),
  v.literal('command_changed'),
  v.literal('rate_limited'),
  v.literal('security_control_unavailable'),
  v.literal('registration_context_invalid'),
  v.literal('source_invalid'),
  v.literal('source_too_large'),
  v.literal('source_too_deep'),
  v.literal('source_version_unsupported'),
  v.literal('selector_invalid'),
  v.literal('tool_not_found'),
  v.literal('schema_missing'),
  v.literal('schema_profile_unsupported'),
  v.literal('openapi_query_parameter_definition_unsupported'),
  v.literal('openapi_query_parameter_serialization_unsupported'),
  v.literal('openapi_query_parameter_schema_unsupported'),
  v.literal('openapi_path_parameter_required'),
  v.literal('openapi_path_parameter_serialization_unsupported'),
  v.literal('openapi_header_parameter_unsafe'),
  v.literal('openapi_header_parameter_serialization_unsupported'),
  v.literal('openapi_media_type_unsupported'),
  v.literal('openapi_request_body_parameter_mix_unsupported'),
  v.literal('openapi_response_status_unsupported'),
  v.literal('openapi_operation_unsupported'),
  v.literal('admit_schema_circular_reference'),
  v.literal('admit_schema_reference_unresolvable'),
  v.literal('admit_schema_too_deep'),
  v.literal('admit_schema_deref_unavailable'),
  v.literal('admit_output_no_guaranteed_field'),
  v.literal('transport_unsupported'),
  v.literal('commercial_metadata_inconsistent'),
  v.literal('payment_execution_unsupported'),
  v.literal('payment_required_invalid'),
  v.literal('bazaar_discovery_invalid'),
  v.literal('contract_too_large'),
  v.literal('contract_invalid'),
  v.literal('price_unavailable'),
  v.literal('source_revision_invalid'),
  v.literal('pricing_config_invalid'),
  v.literal('catalog_offering_origin_changed'),
  v.literal('contract_identity_conflict'),
  v.literal('contract_integrity_failure'),
  v.literal('offering_identity_conflict'),
  v.literal('offering_integrity_failure'),
  v.literal('binding_identity_conflict'),
  v.literal('binding_integrity_failure'),
  v.literal('offering_invalid'),
  v.literal('binding_invalid'),
  v.literal('adapter_not_registered'),
  v.literal('adapter_config_invalid'),
  v.literal('adapter_config_too_large'),
  v.literal('operation_key_conflict'),
  v.literal('registration_changed'),
  v.literal('connection_authority_stale'),
  v.literal('source_route_conflict'),
)
export const preparedPublicationResultValue = v.union(
  v.object({
    kind: v.union(v.literal('published'), v.literal('replayed')),
    operationId: v.optional(v.string()),
    publicationRef: v.string(),
    publicationRevision: v.number(),
    toolRef: v.string(),
    contractRef: contractRefValue,
    offeringId: v.string(),
    bindingId: v.string(),
    sourceKind: v.union(
      v.literal('ae_envelope'),
      v.literal('openapi_http'),
      v.literal('mcp'),
      v.literal('agent_plugin_mcp'),
      v.literal('x402'),
    ),
    sourceSelector: capabilityPublicationSourceSelectorValue,
    sourceRevision: v.string(),
    sourceDigest: v.string(),
    priceDigest: v.string(),
    authorityMode: publicationAuthorityModeValue,
    publisherRef: v.string(),
    provenanceDigest: v.string(),
    lifecycle: publicationLifecycleValue,
  }),
  v.object({
    kind: v.literal('refused'),
    reason: preparedPublicationRefusalValue,
  }),
)
export const capabilityPublicationValue = v.object({
  kind: v.literal('published'),
  publicationRef: v.string(),
  contractRef: contractRefValue,
  offeringId: v.string(),
  bindingId: v.string(),
  lifecycle: publicationLifecycleValue,
})
type PreparedPublicationResult = Infer<typeof preparedPublicationResultValue>
function convexPreparedPublicationResult(
  result: PublishPreparedCapabilityCommandResult,
): PreparedPublicationResult {
  if (result.kind === 'refused') return result
  return {
    kind: result.kind,
    ...(result.operationId === undefined
      ? {}
      : { operationId: result.operationId }),
    publicationRef: result.publicationRef,
    publicationRevision: result.publicationRevision,
    toolRef: result.toolRef,
    contractRef: result.contractRef,
    offeringId: result.offeringId,
    bindingId: result.bindingId,
    sourceKind: result.sourceKind,
    sourceSelector: result.sourceSelector,
    sourceRevision: result.sourceRevision,
    sourceDigest: result.sourceDigest,
    priceDigest: result.priceDigest,
    authorityMode: result.authorityMode,
    publisherRef: result.publisherRef,
    provenanceDigest: result.provenanceDigest,
    lifecycle: {
      state: result.lifecycle.state,
      reasons: [...result.lifecycle.reasons],
    },
  }
}

async function recordSupplyAdmissionCase(
  ctx: MutationCtx,
  args: Readonly<{
    businessId: Id<'businesses'>
    operationKey: string
    correlationId: string
    evidenceRefs: readonly string[]
    prepared: Infer<typeof preparedPublicationMaterialValue>
  }>,
  result: Exclude<PublishPreparedCapabilityCommandResult, { kind: 'refused' }>,
  now: number,
): Promise<void> {
  const existing = await ctx.db.query('capabilitySupplyAdmissionCases')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', result.publicationRef)
        .eq('publicationRevision', result.publicationRevision)
    ))
    .unique()
  if (existing !== null) return

  const business = await ctx.db.get(args.businessId)
  if (business === null) throw new Error('capability_supply_admission_business_missing')
  const connectionAuthority = result.kind === 'replayed'
    ? (await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', result.publicationRef)
            .eq('revision', result.publicationRevision)
        ))
        .unique())?.connectionAuthority
    : undefined
  const providerRef = connectionAuthority?.providerRef
    ?? (args.prepared.binding.authority.kind === 'provider_connection'
      ? args.prepared.binding.authority.providerRef
      : String(args.businessId))
  const caseRef = canonicalDigest({
    kind: 'capability-supply-admission-case:v1',
    publicationRef: result.publicationRef,
    publicationRevision: result.publicationRevision,
  })
  const commandDigest = canonicalDigest({
    kind: 'capability-supply-admission-command:v1',
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    businessId: String(args.businessId),
    toolRef: result.toolRef,
    publicationRef: result.publicationRef,
    publicationRevision: result.publicationRevision,
    sourceDigest: result.sourceDigest,
    sourceRevision: result.sourceRevision,
    sourceRouteRef: args.prepared.sourceRouteRef,
  })
  await ctx.db.insert('capabilitySupplyAdmissionCases', {
    caseRef,
    commandRef: args.operationKey,
    commandDigest,
    owningAccountRef: business.owningAccountRef,
    businessId: args.businessId,
    providerRef,
    toolRef: result.toolRef,
    toolVersion: result.publicationRevision,
    publicationRef: result.publicationRef,
    publicationRevision: result.publicationRevision,
    sourceKind: result.sourceKind,
    sourceDigest: result.sourceDigest,
    sourceRevision: result.sourceRevision,
    sourceRouteRef: args.prepared.sourceRouteRef,
    ...(args.prepared.sourceAuthorityState === undefined
      ? {}
      : { sourceAuthorityState: args.prepared.sourceAuthorityState }),
    contractDigest: result.contractRef.contractDigest,
    ...(connectionAuthority === undefined
      ? {}
      : {
          connectionRef: connectionAuthority.connectionRef,
          authorityDigest: connectionAuthority.authorityDigest,
        }),
    scheduledReadbackRefs: [
      `capability-readiness:${result.publicationRef}:${result.publicationRevision}`,
    ],
    state: 'submitted',
    terminalDecision: 'pending',
    blockerRefs: [],
    evidenceRefs: [...args.evidenceRefs],
    submittedAt: now,
    updatedAt: now,
  })
  const catalogOrigin = args.prepared.offering.origin?.kind === 'catalog_offering'
    ? args.prepared.offering.origin
    : undefined
  await upsertProviderToolIdentity(ctx, {
    businessId: args.businessId,
    providerRef,
    toolRef: result.toolRef,
    offeringRef: catalogOrigin?.offeringRef ?? result.offeringId,
    offeringRevision: catalogOrigin?.offeringRevision ?? result.publicationRevision,
    publicationRef: result.publicationRef,
    publicationRevision: result.publicationRevision,
    offeringId: result.offeringId,
    bindingId: result.bindingId,
    updatedAt: now,
  })
}

export const publishPreparedCapabilityArgs = {
  businessId: v.id('businesses'),
  offeringRef: v.string(),
  revision: v.number(),
  sourceHash: v.string(),
  runtimeEnvironment: v.union(v.literal('sandbox'), v.literal('production')),
  prepared: preparedPublicationMaterialValue,
  proof: v.optional(clerkConsequenceProofValue),
  ...contextFields,
  agentPrincipal: v.optional(agentAccessPrincipalValue),
  ...sourceWriteArgs,
} as const
export const readCapabilityPublicationArgs = {
  publicationRef: v.string(),
} as const

export function publicationPorts(ctx: MutationCtx) {
  const publicationCommandPorts = capabilitySupplyPublicationPorts(ctx, {
    registerOffering: (registration, now) =>
      registerCapabilityOffering(ctx.db, registration, now),
    registerBinding: (registration, now, expectedToolRef) =>
      registerCapabilityTransportBinding(
        ctx.db,
        registration,
        now,
        expectedToolRef,
      ),
    setEligibility: (eligibility, now) =>
      setCapabilitySupplyEligibility(ctx.db, eligibility, now),
  })
  const bindingWritePorts = capabilitySupplyWriterPorts(ctx.db)
  return {
    ...publicationCommandPorts,
    rotateProviderConnectionBindingAuthority: (input: Parameters<typeof rotateCapabilityTransportBindingAuthority>[1], now: number) => (
      rotateCapabilityTransportBindingAuthority({
        ...bindingWritePorts,
        patchBindingConnectionAuthority: async (bindingId, patch) => {
          const binding = await ctx.db.query('capabilityTransportBindings')
            .withIndex('by_bindingId', (query) => query.eq('bindingId', bindingId)).unique()
          if (
            binding === null
            || binding.registrationHash !== patch.expectedRegistrationHash
            || !connectionAuthoritySnapshotsEqual(binding.connectionAuthority, patch.expectedAuthority)
          ) {
            throw new Error('capability_publication_refresh_connection_authority_stale')
          }
          await ctx.db.patch(binding._id, {
            connectionAuthority: {
              ...patch.nextAuthority,
              grantedScopes: [...patch.nextAuthority.grantedScopes],
              grantedResources: [...patch.nextAuthority.grantedResources],
            },
            updatedAt: patch.updatedAt,
          })
        },
      }, input, now)
    ),
  }
}

export async function publishPreparedCapabilityHandler(
  ctx: MutationCtx,
  args: {
    businessId: Id<'businesses'>
    offeringRef: string
    revision: number
    sourceHash: string
    runtimeEnvironment: 'sandbox' | 'production'
    prepared: Infer<typeof preparedPublicationMaterialValue>
    proof?: Infer<typeof clerkConsequenceProofValue>
    operationKey: string
    correlationId: string
    reasonCode: string
    evidenceRefs: string[]
    agentPrincipal?: Infer<typeof agentAccessPrincipalValue>
    sourceWrite?: unknown
    sourceWriteRequest?: unknown
  },
): Promise<Infer<typeof preparedPublicationResultValue>> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') {
    return {
      kind: 'refused' as const,
      reason: 'authorization_denied' as const,
    }
  }
  const agentAdmission = args.agentPrincipal === undefined
    ? undefined
    : await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, true)
  const ownerActor = args.agentPrincipal === undefined
    ? await resolveBusinessActor(ctx)
    : undefined
  const nativeSubmission = isNativeSupplySource(args.prepared.sourceKind)
    && args.prepared.sourceAuthorityState !== undefined
    && args.prepared.offering.origin?.kind === 'catalog_offering'
  const businessAuthorized = args.agentPrincipal === undefined
    ? ownerActor?.kind === 'authenticated_owner'
      && (nativeSubmission
        ? (await nativeSubmissionBusiness(ctx, args.businessId))?.owningAccountRef === ownerActor.canonicalAccountRef
        : await ownsPublishedBusiness(ctx, args.businessId))
    : agentAdmission?.kind === 'allowed'
      && await ownsPublishedBusinessForOwnerId(ctx, args.businessId, agentAdmission.ownerId)
  if (!validRegistrationContext(args) || !businessAuthorized) {
    return {
      kind: 'refused' as const,
      reason: 'authorization_denied' as const,
    }
  }
  if (await providerRouteabilityIsFrozen(ctx, args.businessId)) {
    return { kind: 'refused' as const, reason: 'authorization_denied' as const }
  }
  const [catalogOffering, catalogRevision] = await Promise.all([
    ctx.db
      .query('businessOfferings')
      .withIndex('by_offeringRef', (query) =>
        query.eq('offeringRef', args.offeringRef),
      )
      .unique(),
    ctx.db
      .query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) =>
        query
          .eq('offeringRef', args.offeringRef)
          .eq('revision', args.revision),
      )
      .unique(),
  ])
  const origin = args.prepared.offering.origin
  if (
    catalogOffering === null ||
    catalogRevision === null ||
    catalogOffering.businessId !== args.businessId ||
    catalogRevision.businessId !== args.businessId ||
    catalogOffering.currentRevision !== args.revision ||
    args.sourceHash !== catalogRevision.sourceHash ||
    origin?.kind !== 'catalog_offering' ||
    origin.offeringRef !== args.offeringRef ||
    origin.offeringRevision !== args.revision ||
    origin.offeringSourceHash !== args.sourceHash
  ) {
    return {
      kind: 'refused' as const,
      reason: 'catalog_offering_origin_changed' as const,
    }
  }
  if (args.agentPrincipal === undefined && ownerActor?.kind !== 'authenticated_owner')
    return {
      kind: 'refused' as const,
      reason: 'authorization_denied' as const,
    }
  const consequenceCommand = {
    version: 'ae.publication-consequence:v1',
    action: 'publication.publish',
    operationKey: args.operationKey,
    businessId: String(args.businessId),
    offeringRef: args.offeringRef,
    offeringRevision: args.revision,
    offeringSourceHash: args.sourceHash,
    publicationRef: args.prepared.offering.offeringId,
    publicationRevision: 1,
    sourceDigest: args.prepared.sourceDigest,
    priceDigest: args.prepared.priceDigest,
    bindingId: args.prepared.binding.bindingId,
    documentDigest: canonicalDigest(args.prepared.documentJson),
  }
  if (agentAdmission?.kind === 'allowed') {
    const consequence = await admitAgentPublicationConsequence(ctx, {
      agent: agentAdmission,
      action: 'publication.publish',
      target: {
        targetType: 'capability_publication',
        targetRef: args.prepared.offering.offeringId,
        targetRevision: 1,
      },
      resourceRefs: [
        `offering:${args.offeringRef}`,
        `publication:${args.prepared.offering.offeringId}`,
      ],
      consequenceSummary: 'Publish this exact Tool revision to the market.',
      statusReadbackRef: `owner/operations/${args.offeringRef}`,
      correlationRef: args.correlationId,
      idempotencyRef: args.operationKey,
      command: consequenceCommand,
      now: Date.now(),
    })
    if (consequence === null) {
      return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    }
  }
  if (args.agentPrincipal === undefined && ownerActor?.kind === 'authenticated_owner') {
    const consequence = await admitInteractiveOwnerConsequence(ctx, {
      actor: ownerActor,
      action: 'publication.publish',
      target: {
        targetType: 'capability_publication',
        targetRef: args.prepared.offering.offeringId,
        targetRevision: 1,
      },
      requiredScopes: ['catalog_publish'],
      resourceRefs: [
        `offering:${args.offeringRef}`,
        `publication:${args.prepared.offering.offeringId}`,
      ],
      budgetAmount: 0,
      consequenceSummary: 'Publish this exact Tool revision to the market.',
      statusReadbackRef: `owner/operations/${args.offeringRef}`,
      correlationRef: args.correlationId,
      idempotencyRef: args.operationKey,
      command: consequenceCommand,
      ...(args.proof === undefined ? {} : { proof: args.proof }),
      now: Date.now(),
    })
    if (consequence.kind === 'refused') {
      return { kind: 'refused' as const, reason: consequence.code }
    }
  }
  const result = await publishPreparedCapabilityCommand(
    {
      businessId: String(args.businessId),
      runtimeEnvironment: args.runtimeEnvironment,
      prepared: args.prepared,
      actor: {
        kind: 'owner',
        ref: agentAdmission?.kind === 'allowed'
          ? agentAdmission.principalId
          : ownerActor?.kind === 'authenticated_owner'
            ? ownerActor.canonicalPrincipalRef
            : '',
      },
      origin,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
      now: Date.now(),
    },
    nativeSubmission ? nativeSubmissionPorts(ctx, args.businessId) : publicationPorts(ctx),
  )
  if (result.kind === 'refused')
    return convexPreparedPublicationResult(result)
  await recordSupplyAdmissionCase(ctx, args, result, Date.now())
  await rebuildCapabilityOriginSupplyProjection(
    ctx,
    args.businessId,
    Date.now(),
  )
  await syncProviderDirectoryRowsAfterPublish(ctx, result.publicationRef, result.publicationRevision)
  return convexPreparedPublicationResult(result)
}

export async function readCapabilityPublicationHandler(
  ctx: QueryCtx,
  args: { publicationRef: string },
) {
  const publication = await ctx.db
    .query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (index) =>
      index.eq('publicationRef', args.publicationRef),
    )
    .order('desc')
    .first()
  if (
    publication === null ||
    !(await ownsPublishedBusiness(ctx, publication.businessId))
  )
    return null
  if (publication.disposition === 'incompatible') {
    const projection = publicationProjection(
      contractRefFromRow(publication),
      publication.offeringId,
      publication.bindingId,
      { state: 'incompatible', reasons: ['incompatible_revision'] },
    )
    return {
      ...projection,
      lifecycle: convexPublicationLifecycle(projection.lifecycle),
    }
  }
  const [offering, binding] = await Promise.all([
    ctx.db
      .query('capabilityOfferings')
      .withIndex('by_offeringId', (index) =>
        index.eq('offeringId', publication.offeringId),
      )
      .unique(),
    ctx.db
      .query('capabilityTransportBindings')
      .withIndex('by_bindingId', (index) =>
        index.eq('bindingId', publication.bindingId),
      )
      .unique(),
  ])
  if (offering === null || binding === null) return null
  const providerAuthority =
    binding.authority.kind === 'provider_connection'
      ? binding.authority
      : undefined
  const currentConnection =
    providerAuthority === undefined
      ? undefined
      : await ctx.db
          .query('capabilityProviderConnections')
          .withIndex('by_connectionRef', (index) =>
            index.eq('connectionRef', providerAuthority.connectionRef),
          )
          .unique()
  const projection = publicationProjection(
    contractRefFromRow(publication),
    publication.offeringId,
    publication.bindingId,
    publicationLifecycle(
      publication,
      offering,
      binding,
      Date.now(),
      currentConnection,
    ),
  )
  return {
    ...projection,
    lifecycle: convexPublicationLifecycle(projection.lifecycle),
  }
}

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
