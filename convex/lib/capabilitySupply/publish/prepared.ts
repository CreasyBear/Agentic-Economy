import { type Infer } from 'convex/values'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { activeOwnerPrincipalRef, enqueueEmail } from '../../principalAccount/notifications/enqueue'
import {
  connectionAuthoritySnapshotsEqual,
  publishPreparedCapabilityCommand,
  rotateCapabilityTransportBindingAuthority,
  validRegistrationContext,
  type PublishPreparedCapabilityCommandResult,
} from '@/modules/capability-supply/public'
import {
  agentAccessPrincipalValue,
  verifySupplyAgentPrincipal,
} from '../../../agentAccessPrincipals'
import { capabilitySupplyPublicationPorts } from '../publicationPorts/ports'
import { capabilitySupplyWriterPorts } from '../../../capabilitySupplyWriterPorts'
import {
  registerCapabilityOffering,
  registerCapabilityTransportBinding,
  setCapabilitySupplyEligibility,
} from '../commands/writes'
import { internal } from '../../../_generated/api'
import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { admitAgentPublicationConsequence } from '../../authority/consequence/publication'
import { admitInteractiveOwnerConsequence } from '../../authority/consequence/owner'
import { providerRouteabilityIsFrozen } from '../providerOffboarding/freeze'
import { isNativeSupplySource, nativeSubmissionBusiness, nativeSubmissionPorts } from '../../../capabilitySupplyNativeAdmission'
import { upsertProviderToolIdentity } from '../../../capabilityProviderToolProjection'
import {
  ownsPublishedBusiness,
  ownsPublishedBusinessForOwnerId,
} from './ownership'
import { rebuildCapabilityOriginSupplyProjection } from '../projection/rebuild'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import { clerkConsequenceProofValue } from '../../authority/consequence/proof'
import {
  convexPreparedPublicationResult,
  preparedPublicationMaterialValue,
  preparedPublicationResultValue,
} from './contracts'

/** Canonical publication is committed before the directory projection runs.
 * The hourly reconciliation also repairs any failed scheduled projection.
 */
export async function scheduleProviderDirectoryProjection(
  ctx: MutationCtx, publicationRef: string, publicationRevision: number,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.x402DirectoryIndexStore.projectProviderDirectoryRow, {
    publicationRef,
    publicationRevision,
  })
}

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
  const business = await ctx.db.get(args.businessId)
  const liveOwner = business === null ? null : await activeOwnerPrincipalRef(ctx.db, business.owningAccountRef)
  if (business !== null && liveOwner !== null) {
    await enqueueEmail(ctx, {
      eventKind: 'provider_live', stream: 'transactional', recipientPrincipalRef: liveOwner,
      accountRef: business.owningAccountRef, sourceEventRef: result.toolRef,
    })
  }
  await rebuildCapabilityOriginSupplyProjection(
    ctx,
    args.businessId,
    Date.now(),
  )
  await scheduleProviderDirectoryProjection(ctx, result.publicationRef, result.publicationRevision)
  return convexPreparedPublicationResult(result)
}
