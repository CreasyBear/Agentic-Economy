import { v, type Infer } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  stableStringify,
  type StableHashValue,
} from '@/modules/common/stable-hash'
import {
  beginOperation,
  failOperation,
  offeringRegistrationFromRow,
  replayOperationResult,
  republishPreparedCapabilityCommand,
  succeedOperation,
  withdrawCapabilityCommand,
  type CapabilityOfferingRegistration,
  type CapabilityPublicationBindingDraft,
  type OperationBeginResult,
  type PreparedPublicationMaterial,
  type PublicationCommandRow,
} from '@/modules/capability-supply/public'
import type { MutationCtx } from './_generated/server'
import {
  ownsPublishedBusiness,
  ownsPublishedBusinessForOwnerId,
  publicationPorts,
  rebuildCapabilityOriginSupplyProjection,
} from './capabilitySupply'
import { agentAccessPrincipalValue, verifySupplyAgentPrincipal } from './agentAccessPrincipals'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { resolveBusinessActor } from './authz'

export const ownerSupplyCommandArgsValue = v.object({
  businessId: v.id('businesses'),
  offeringRef: v.string(),
  offeringRevision: v.number(),
  offeringSourceHash: v.string(),
  publicationRef: v.string(),
  publicationRevision: v.number(),
  operationKey: v.string(),
  correlationId: v.string(),
  reasonCode: v.string(),
  evidenceRefs: v.array(v.string()),
  agentPrincipal: v.optional(agentAccessPrincipalValue),
  ...sourceWriteArgs,
})
export const ownerSupplyCommandResultValue = v.union(
  v.object({
    kind: v.literal('withdrawn'),
    publicationRef: v.string(),
    revision: v.number(),
    lifecycle: v.object({
      state: v.literal('withdrawn'),
      reasons: v.array(v.string()),
    }),
  }),
  v.object({
    kind: v.literal('refreshed'),
    publicationRef: v.string(),
    revision: v.number(),
    disposition: v.union(v.literal('current'), v.literal('incompatible')),
    lifecycle: v.object({
      state: v.union(
        v.literal('active'),
        v.literal('inactive'),
        v.literal('incompatible'),
      ),
      reasons: v.array(v.string()),
    }),
  }),
  v.object({
    kind: v.literal('republished'),
    publicationRef: v.string(),
    revision: v.number(),
    operationRef: v.string(),
    bindingId: v.string(),
    lifecycle: v.object({
      state: v.union(v.literal('active'), v.literal('inactive')),
      reasons: v.array(v.string()),
    }),
  }),
  v.object({ kind: v.literal('refused'), reason: v.string() }),
)
type OwnerSupplyCommandArgs = Infer<typeof ownerSupplyCommandArgsValue>
type OwnerSupplyCommandResult = Infer<typeof ownerSupplyCommandResultValue>
export const ownerPublishReservationArgsValue = v.object({
  businessId: v.id('businesses'),
  offeringRef: v.string(),
  offeringRevision: v.number(),
  offeringSourceHash: v.string(),
  materialDigest: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  reasonCode: v.string(),
  evidenceRefs: v.array(v.string()),
  agentPrincipal: agentAccessPrincipalValue,
  ...sourceWriteArgs,
})
export const ownerPublishReservationResultValue = v.union(
  v.object({ kind: v.literal('reserved') }),
  v.object({ kind: v.literal('replayed') }),
  v.object({ kind: v.literal('refused'), reason: v.string() }),
)
export async function reserveOwnerCapabilityPublicationHandler(
  ctx: MutationCtx,
  args: Infer<typeof ownerPublishReservationArgsValue>,
): Promise<Infer<typeof ownerPublishReservationResultValue>> {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected') return { kind: 'refused', reason: 'authorization_denied' }
    const admission = await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, true)
    if (admission.kind !== 'allowed' || !(await ownsPublishedBusinessForOwnerId(ctx, args.businessId, admission.ownerId))) {
      return { kind: 'refused', reason: 'authorization_denied' }
    }
    const now = Date.now()
    const operation = await beginOperation(
      publicationPorts(ctx),
      { kind: 'owner', ref: admission.principalId },
      'reserveOwnerCapabilityPublication',
      {
        operationKey: args.operationKey,
        correlationId: args.correlationId,
        reasonCode: args.reasonCode,
        evidenceRefs: args.evidenceRefs,
      },
      {
        version: 'supply-publication:v1',
        businessId: String(args.businessId),
        offeringRef: args.offeringRef,
        offeringRevision: args.offeringRevision,
        offeringSourceHash: args.offeringSourceHash,
        materialDigest: args.materialDigest,
      },
      now,
    )
    const expected = { kind: 'reserved' as const }
    if (operation.kind === 'conflict') return { kind: 'refused', reason: 'operation_key_conflict' }
    if (operation.kind === 'replay') {
      replayOperationResult(operation, expected)
      return { kind: 'replayed' }
    }
    await succeedOperation(publicationPorts(ctx), operation.operationId, expected, [], now)
    return expected
}

async function loadOwnerSupplyPublication(
  ctx: MutationCtx,
  args: OwnerSupplyCommandArgs,
): Promise<
  | Readonly<{ kind: 'ok'; publication: PublicationCommandRow }>
  | Readonly<{ kind: 'refused'; reason: string }>
> {
  const agentAdmission = args.agentPrincipal === undefined
    ? undefined
    : await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, true)
  const owned = args.agentPrincipal === undefined
    ? await ownsPublishedBusiness(ctx, args.businessId)
    : agentAdmission?.kind === 'allowed'
      && await ownsPublishedBusinessForOwnerId(ctx, args.businessId, agentAdmission.ownerId)
  if (!owned) return { kind: 'refused', reason: 'authorization_denied' }
  const publication = await publicationPorts(ctx).loadPublicationAtRevision(
    args.publicationRef,
    args.publicationRevision,
  )
  if (
    publication === null ||
    publication.businessId !== String(args.businessId)
  ) {
    return { kind: 'refused', reason: 'publication_not_found' }
  }
  const [offering, revision, capabilityOffering] = await Promise.all([
    ctx.db
      .query('businessOfferings')
      .withIndex('by_offeringRef', (q) => q.eq('offeringRef', args.offeringRef))
      .unique(),
    ctx.db
      .query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (q) =>
        q
          .eq('offeringRef', args.offeringRef)
          .eq('revision', args.offeringRevision),
      )
      .unique(),
    ctx.db
      .query('capabilityOfferings')
      .withIndex('by_offeringId', (q) =>
        q.eq('offeringId', publication.offeringId),
      )
      .unique(),
  ])
  if (
    offering === null ||
    revision === null ||
    offering.businessId !== args.businessId ||
    offering.currentRevision !== args.offeringRevision ||
    revision.businessId !== args.businessId ||
    revision.sourceHash !== args.offeringSourceHash ||
    capabilityOffering?.origin?.kind !== 'catalog_offering' ||
    capabilityOffering.origin.offeringRef !== args.offeringRef ||
    capabilityOffering.origin.offeringRevision !== args.offeringRevision ||
    capabilityOffering.origin.offeringSourceHash !== args.offeringSourceHash
  )
    return { kind: 'refused', reason: 'catalog_offering_origin_changed' }
  return { kind: 'ok', publication }
}

async function reconstructPreparedRepublishMaterial(
  ctx: MutationCtx,
  publication: PublicationCommandRow,
  evidenceRefs: readonly string[],
): Promise<
  | Readonly<{
      kind: 'ready'
      prepared: PreparedPublicationMaterial
      origin?: CapabilityOfferingRegistration['origin']
    }>
  | Readonly<{ kind: 'refused'; reason: string }>
> {
  const ports = publicationPorts(ctx)
  const [offering, binding, exactContract] = await Promise.all([
    ports.loadOfferingByOfferingId(publication.offeringId),
    ports.loadBindingByBindingId(publication.bindingId),
    ports.getExactRegisteredContract({
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
    }),
  ])
  if (offering === null)
    return { kind: 'refused', reason: 'offering_integrity_failure' }
  let offeringRegistration: CapabilityOfferingRegistration
  try {
    offeringRegistration = offeringRegistrationFromRow(offering)
  } catch {
    return { kind: 'refused', reason: 'offering_integrity_failure' }
  }
  if (
    offeringRegistration.businessId !== publication.businessId ||
    offeringRegistration.contractRef.capabilityId !==
      publication.capabilityId ||
    offeringRegistration.contractRef.version !== publication.version ||
    offeringRegistration.contractRef.contractDigest !==
      publication.contractDigest
  ) {
    return { kind: 'refused', reason: 'registration_changed' }
  }
  if (binding === null)
    return { kind: 'refused', reason: 'binding_integrity_failure' }
  let adapterConfig: CapabilityPublicationBindingDraft['adapter']['config']
  try {
    adapterConfig = JSON.parse(binding.configJson)
  } catch {
    return { kind: 'refused', reason: 'binding_integrity_failure' }
  }
  if (
    stableStringify(adapterConfig) !== binding.configJson ||
    canonicalDigest(adapterConfig) !== binding.configDigest
  ) {
    return { kind: 'refused', reason: 'binding_integrity_failure' }
  }
  if (
    binding.offeringId !== publication.offeringId ||
    binding.capabilityId !== publication.capabilityId ||
    binding.version !== publication.version ||
    binding.contractDigest !== publication.contractDigest
  ) {
    return { kind: 'refused', reason: 'registration_changed' }
  }
  if (exactContract.kind !== 'found')
    return { kind: 'refused', reason: 'contract_integrity_failure' }
  if (
    exactContract.contract.ref.capabilityId !== publication.capabilityId ||
    exactContract.contract.ref.version !== publication.version ||
    exactContract.contract.ref.contractDigest !== publication.contractDigest
  ) {
    return { kind: 'refused', reason: 'contract_integrity_failure' }
  }
  if (
    publication.pricingConfigJson === undefined ||
    publication.priceDigest === undefined
  ) {
    return { kind: 'refused', reason: 'pricing_config_invalid' }
  }
  if (
    publication.sourceDescriptorJson === undefined ||
    publication.sourceSelector === undefined
  ) {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  const {
    businessId: _businessId,
    contractRef: _offeringContractRef,
    ...offeringDraft
  } = offeringRegistration
  const bindingDraft: CapabilityPublicationBindingDraft = {
    bindingId: binding.bindingId,
    endpointUrl: binding.endpointUrl,
    authority: binding.authority,
    continuation: {
      ...binding.continuation,
      evidenceRefs: [...binding.continuation.evidenceRefs],
    },
    cancellation: {
      ...binding.cancellation,
      evidenceRefs: [...binding.cancellation.evidenceRefs],
    },
    adapter: {
      adapterId: binding.adapterId,
      config: adapterConfig,
    },
    registrationEvidenceRefs: [...binding.registrationEvidenceRefs],
  }
  const { ref: _contractRef, ...contractDocument } = exactContract.contract
  return {
    kind: 'ready',
    origin: offeringRegistration.origin,
    prepared: {
      sourceKind: publication.sourceKind,
      sourceSelector: publication.sourceSelector,
      sourceDescriptorJson: publication.sourceDescriptorJson,
      sourceRevision: publication.sourceRevision,
      documentJson: stableStringify(contractDocument as StableHashValue),
      offering: offeringDraft,
      binding: bindingDraft,
      evidenceRefs: [...(publication.registrationEvidenceRefs ?? evidenceRefs)],
      pricingConfigJson: publication.pricingConfigJson,
      priceDigest: publication.priceDigest,
      sourceDigest: publication.sourceDigest,
    },
  }
}
type OwnerMaintenanceOperation = Exclude<
  OperationBeginResult,
  { kind: 'conflict' }
>
type OwnerMaintenanceBeginResult =
  | Readonly<{
      kind: 'refused'
      reason: 'authorization_denied' | 'operation_key_conflict'
    }>
  | Readonly<{ kind: 'ready'; operation: OwnerMaintenanceOperation }>

async function beginOwnerMaintenanceOperation(
  ctx: MutationCtx,
  args: OwnerSupplyCommandArgs,
  operationName: 'withdrawOwnerCapability' | 'refreshOwnerCapability',
  now: number,
): Promise<OwnerMaintenanceBeginResult> {
  const agentAdmission = args.agentPrincipal === undefined
    ? undefined
    : await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, true)
  const ownerActor = args.agentPrincipal === undefined
    ? await resolveBusinessActor(ctx)
    : undefined
  const owned = args.agentPrincipal === undefined
    ? ownerActor?.kind === 'authenticated_owner'
      && await ownsPublishedBusiness(ctx, args.businessId)
    : agentAdmission?.kind === 'allowed'
      && await ownsPublishedBusinessForOwnerId(ctx, args.businessId, agentAdmission.ownerId)
  if (!owned) {
    return { kind: 'refused', reason: 'authorization_denied' }
  }
  const operation = await beginOperation(
    publicationPorts(ctx),
    {
      kind: 'owner',
      ref: agentAdmission?.kind === 'allowed'
        ? agentAdmission.principalId
        : ownerActor?.kind === 'authenticated_owner'
          ? ownerActor.canonicalPrincipalRef
          : '',
    },
    operationName,
    {
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
    },
    {
      businessId: String(args.businessId),
      offeringRef: args.offeringRef,
      offeringRevision: args.offeringRevision,
      offeringSourceHash: args.offeringSourceHash,
      publicationRef: args.publicationRef,
      publicationRevision: args.publicationRevision,
    },
    now,
  )
  if (operation.kind === 'conflict') {
    return { kind: 'refused', reason: 'operation_key_conflict' }
  }
  return { kind: 'ready', operation }
}

export async function withdrawOwnerCapabilityHandler(
  ctx: MutationCtx,
  args: OwnerSupplyCommandArgs,
): Promise<OwnerSupplyCommandResult> {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected')
      return { kind: 'refused', reason: 'authorization_denied' }
    const now = Date.now()
    const maintenance = await beginOwnerMaintenanceOperation(
      ctx,
      args,
      'withdrawOwnerCapability',
      now,
    )
    if (maintenance.kind === 'refused') return maintenance
    const expected = {
      kind: 'withdrawn' as const,
      publicationRef: args.publicationRef,
      revision: args.publicationRevision,
      lifecycle: {
        state: 'withdrawn' as const,
        reasons: ['withdrawn' as const],
      },
    }
    if (maintenance.operation.kind === 'replay') {
      return replayOperationResult(maintenance.operation, expected)
    }
    const ports = publicationPorts(ctx)
    const loaded = await loadOwnerSupplyPublication(ctx, args)
    if (loaded.kind === 'refused') {
      await failOperation(
        ports,
        maintenance.operation.operationId,
        loaded.reason,
        now,
      )
      return loaded
    }
    if (loaded.publication.disposition !== 'current') {
      await failOperation(
        ports,
        maintenance.operation.operationId,
        'revision_changed',
        now,
      )
      return { kind: 'refused', reason: 'revision_changed' }
    }
    const result = await withdrawCapabilityCommand(
      {
        publication: loaded.publication,
        evidenceRefs: args.evidenceRefs,
        now,
      },
      ports,
    )
    if (result.kind === 'refused') {
      await failOperation(
        ports,
        maintenance.operation.operationId,
        result.reason,
        now,
      )
      return result
    }
    await rebuildCapabilityOriginSupplyProjection(ctx, args.businessId, now)
    const stableResult: StableHashValue = {
      kind: result.kind,
      publicationRef: result.publicationRef,
      revision: result.revision,
      lifecycle: {
        state: result.lifecycle.state,
        reasons: [...result.lifecycle.reasons],
      },
    }
    await succeedOperation(
      ports,
      maintenance.operation.operationId,
      stableResult,
      [loaded.publication.id],
      now,
    )
    return result
}

export async function republishOwnerCapabilityHandler(
  ctx: MutationCtx,
  args: OwnerSupplyCommandArgs,
): Promise<OwnerSupplyCommandResult> {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected')
      return { kind: 'refused', reason: 'authorization_denied' }
    const loaded = await loadOwnerSupplyPublication(ctx, args)
    if (loaded.kind === 'refused') return loaded
    if (loaded.publication.disposition !== 'withdrawn') {
      return { kind: 'refused', reason: 'revision_changed' }
    }
    const agentAdmission = args.agentPrincipal === undefined
      ? undefined
      : await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, true)
    const ownerActor = args.agentPrincipal === undefined
      ? await resolveBusinessActor(ctx)
      : undefined
    if (agentAdmission?.kind !== 'allowed'
      && ownerActor?.kind !== 'authenticated_owner')
      return { kind: 'refused', reason: 'authorization_denied' }
    const reconstructed = await reconstructPreparedRepublishMaterial(
      ctx,
      loaded.publication,
      args.evidenceRefs,
    )
    if (reconstructed.kind === 'refused') return reconstructed
    const now = Date.now()
    const result = await republishPreparedCapabilityCommand(
      {
        businessId: String(args.businessId),
        runtimeEnvironment: loaded.publication.runtimeEnvironment,
        publication: loaded.publication,
        prepared: reconstructed.prepared,
        origin: reconstructed.origin,
        actor: {
          kind: 'owner',
          ref: agentAdmission?.kind === 'allowed'
            ? agentAdmission.principalId
            : ownerActor?.kind === 'authenticated_owner'
              ? ownerActor.canonicalPrincipalRef
              : '',
        },
        operationKey: args.operationKey,
        correlationId: args.correlationId,
        reasonCode: args.reasonCode,
        evidenceRefs: args.evidenceRefs,
        now,
      },
      publicationPorts(ctx),
    )
    if (result.kind === 'refused') return result
    await rebuildCapabilityOriginSupplyProjection(ctx, args.businessId, now)
    return {
      kind: 'republished',
      publicationRef: result.publicationRef,
      revision: result.publicationRevision,
      operationRef: result.operationRef,
      bindingId: result.bindingId,
      lifecycle: {
        state: result.lifecycle.state === 'active' ? 'active' : 'inactive',
        reasons: [...result.lifecycle.reasons],
      },
    }
}

/**
 * Owner recheck is readiness-only. New publication material must enter
 * through preparePublicationDraft + publishPreparedCapability; this mutation
 * never reparses browser or raw source data.
 */
export async function refreshOwnerCapabilityHandler(
  ctx: MutationCtx,
  args: OwnerSupplyCommandArgs,
): Promise<OwnerSupplyCommandResult> {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected')
      return { kind: 'refused', reason: 'authorization_denied' }
    const now = Date.now()
    const maintenance = await beginOwnerMaintenanceOperation(
      ctx,
      args,
      'refreshOwnerCapability',
      now,
    )
    if (maintenance.kind === 'refused') return maintenance
    const expected = {
      kind: 'refreshed' as const,
      publicationRef: args.publicationRef,
      revision: args.publicationRevision,
      disposition: 'current' as const,
      lifecycle: {
        state: 'inactive' as const,
        reasons: ['health_unobserved' as const],
      },
    }
    if (maintenance.operation.kind === 'replay') {
      return replayOperationResult(maintenance.operation, expected)
    }
    const ports = publicationPorts(ctx)
    const loaded = await loadOwnerSupplyPublication(ctx, args)
    if (loaded.kind === 'refused') {
      await failOperation(
        ports,
        maintenance.operation.operationId,
        loaded.reason,
        now,
      )
      return loaded
    }
    if (loaded.publication.disposition !== 'current') {
      await failOperation(
        ports,
        maintenance.operation.operationId,
        'revision_changed',
        now,
      )
      return { kind: 'refused', reason: 'revision_changed' }
    }
    await ports.scheduleReadinessProbe(
      loaded.publication.publicationRef,
      loaded.publication.revision,
    )
    await succeedOperation(
      ports,
      maintenance.operation.operationId,
      expected,
      [loaded.publication.id],
      now,
    )
    return expected
}
