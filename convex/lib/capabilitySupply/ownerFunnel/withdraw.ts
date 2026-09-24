import type { MutationCtx } from '../../../_generated/server'
import type { Id } from '../../../_generated/dataModel'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { failOperation, replayOperationResult, succeedOperation, withdrawCapabilityCommand } from '@/modules/capability-supply/public'
import { publicationPorts, rebuildCapabilityOriginSupplyProjection } from '../../../capabilitySupply'
import { upsertProviderDirectoryRows } from '../../x402DirectoryIndex/providerRows'
import { verifySupplyAgentPrincipal } from '../../../agentAccessPrincipals'
import { requireSourceWrite } from '../../../sourceWriteAdmission'
import { resolveBusinessActor } from '../../../authz'
import { admitAgentPublicationConsequence } from '../../agentPublicationConsequence'
import { admitInteractiveOwnerConsequence } from '../../ownerConsequence'
import type { OwnerSupplyCommandArgs, OwnerSupplyCommandResult } from './contracts'
import { beginOwnerMaintenanceOperation, loadOwnerSupplyPublication } from './maintenance'

export async function withdrawOwnerCapabilityHandler(
  ctx: MutationCtx,
  args: OwnerSupplyCommandArgs,
): Promise<OwnerSupplyCommandResult> {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected')
      return { kind: 'refused', reason: 'authorization_denied' }
    const now = Date.now()
    const loaded = await loadOwnerSupplyPublication(ctx, args)
    if (loaded.kind === 'refused') return loaded
    const ownerActor = args.agentPrincipal === undefined
      ? await resolveBusinessActor(ctx)
      : undefined
    const agentAdmission = args.agentPrincipal === undefined
      ? undefined
      : await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, true)
    if (args.agentPrincipal !== undefined && agentAdmission?.kind !== 'allowed') {
      return { kind: 'refused', reason: 'authorization_denied' }
    }
    const consequenceCommand = {
      version: 'ae.publication-consequence:v1',
      action: 'publication.withdraw',
      operationKey: args.operationKey,
      businessId: String(args.businessId),
      offeringRef: args.offeringRef,
      offeringRevision: args.offeringRevision,
      offeringSourceHash: args.offeringSourceHash,
      publicationRef: args.publicationRef,
      publicationRevision: args.publicationRevision,
    }
    if (agentAdmission?.kind === 'allowed') {
      const consequence = await admitAgentPublicationConsequence(ctx, {
        agent: agentAdmission,
        action: 'publication.withdraw',
        target: {
          targetType: 'capability_publication',
          targetRef: args.publicationRef,
          targetRevision: args.publicationRevision,
        },
        resourceRefs: [`publication:${args.publicationRef}`],
        consequenceSummary: 'Withdraw this exact Tool revision from new market work.',
        statusReadbackRef: `owner/operations/${args.offeringRef}`,
        correlationRef: args.correlationId,
        idempotencyRef: args.operationKey,
        command: consequenceCommand,
        now,
      })
      if (consequence === null) {
        return { kind: 'refused', reason: 'authorization_denied' }
      }
    }
    if (ownerActor?.kind === 'authenticated_owner') {
      const consequence = await admitInteractiveOwnerConsequence(ctx, {
        actor: ownerActor,
        action: 'publication.withdraw',
        target: {
          targetType: 'capability_publication',
          targetRef: args.publicationRef,
          targetRevision: args.publicationRevision,
        },
        requiredScopes: ['catalog_publish'],
        resourceRefs: [`publication:${args.publicationRef}`],
        budgetAmount: 0,
        consequenceSummary: 'Withdraw this exact Tool revision from new market work.',
        statusReadbackRef: `owner/operations/${args.offeringRef}`,
        correlationRef: args.correlationId,
        idempotencyRef: args.operationKey,
        command: consequenceCommand,
        now,
      })
      if (consequence.kind === 'refused') {
        return { kind: 'refused', reason: consequence.code }
      }
    }
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
    // Well 8 Lane C: remove this publication's provider directory row
    // immediately, alongside the projection rebuild above (same
    // transaction). loaded.publication was fetched before the withdraw
    // command ran, so its disposition is stamped 'withdrawn' explicitly
    // rather than read stale off that object.
    await upsertProviderDirectoryRows(ctx, {
      disposition: 'withdrawn', authorityMode: loaded.publication.authorityMode,
      ...(loaded.publication.sourceRouteRef === undefined ? {} : { sourceRouteRef: loaded.publication.sourceRouteRef }),
      businessId: loaded.publication.businessId as Id<'businesses'>,
      offeringId: loaded.publication.offeringId, networkId: loaded.publication.networkId, sourceKind: loaded.publication.sourceKind,
    })
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
