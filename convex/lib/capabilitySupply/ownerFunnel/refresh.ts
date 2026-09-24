import type { MutationCtx } from '../../../_generated/server'
import { failOperation, replayOperationResult, succeedOperation } from '@/modules/capability-supply/public'
import { publicationPorts } from '../../../capabilitySupply'
import { requireSourceWrite } from '../../../sourceWriteAdmission'
import type { OwnerSupplyCommandArgs, OwnerSupplyCommandResult } from './contracts'
import { beginOwnerMaintenanceOperation, loadOwnerSupplyPublication } from './maintenance'

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
