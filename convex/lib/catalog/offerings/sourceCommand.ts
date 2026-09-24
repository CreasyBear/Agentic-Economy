import type { GenericDatabaseWriter } from 'convex/server'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { MutationCtx } from '../../../_generated/server'
import type { DataModel, Id } from '../../../_generated/dataModel'
import { resolveBusinessActor } from '../../../authz'
import { requireSourceWrite } from '../../../sourceWriteAdmission'
import { admitDevSeedCatalogAuthority } from '../devSeedAuthority'
import { deriveBusinessOfferingSupportFromCapabilitySupply } from '../../capabilitySupply/projection/support'
import { rebuildBusinessSupplyProjectionSnapshotCommand } from '../../capabilitySupply/projection/snapshot'
import type { DelegationAuthoritySnapshot } from '../../../../src/modules/authority/delegation/public'
import type { OfferingSourceResult, OfferingSourceState } from '../../../../src/modules/catalog/public'
import { loadExactOfferingSourceState, persistOfferingSourceState, type OfferingCommandTarget } from './persistence'

type OfferingCommandResult =
  | { kind: 'ok'; code: string; resultRef?: string; currentRevision?: number }
  | { kind: 'error'; code: string; reason: string }
export type OfferingSourceMutationArgs = { businessId: Id<'businesses'>; operationKey: string; correlationId: string; sourceWrite?: unknown }

async function runOfferingSourceCore(
  db: GenericDatabaseWriter<DataModel>,
  businessId: Id<'businesses'>,
  ownerRef: string,
  actorRef: string,
  operationName: string,
  operationKey: string,
  target: OfferingCommandTarget,
  mutate: (
    state: OfferingSourceState,
    authority: { actorRef?: string; ownerRef: string; businessOwnerRef: string },
    now: number,
  ) => OfferingSourceResult<unknown>,
  now: number,
  actorKind: 'owner' | 'system',
): Promise<OfferingCommandResult> {
  const state = await loadExactOfferingSourceState(db, businessId, target, {
    actorRef: ownerRef,
    operationName,
    operationKey,
  })
  const result = mutate(state, { actorRef, ownerRef, businessOwnerRef: ownerRef }, now)
  if (result.kind === 'error') return { kind: 'error', code: result.code, reason: result.reason }
  const persisted = await persistOfferingSourceState(db, businessId, state, result.state, actorKind)
  if (persisted.kind === 'error') return persisted
  const value = result.value
  const resultRef = typeof value === 'object' && value !== null
    ? ('offeringRef' in value && typeof value.offeringRef === 'string'
      ? value.offeringRef
      : 'accessPathRef' in value && typeof value.accessPathRef === 'string' ? value.accessPathRef : undefined)
    : undefined
  const currentRevision = typeof value === 'object' && value !== null && 'currentRevision' in value && typeof value.currentRevision === 'number'
    ? value.currentRevision
    : undefined
  return { kind: 'ok', code: result.code, ...(resultRef === undefined ? {} : { resultRef }), ...(currentRevision === undefined ? {} : { currentRevision }) }
}

type SystemOfferingCommand = Readonly<{
  businessId: Id<'businesses'>
  operationName: string
  operationKey: string
}>
export async function runSystemOfferingSourceCommand(
  ctx: MutationCtx,
  command: SystemOfferingCommand,
  target: OfferingCommandTarget,
  mutate: (
    state: OfferingSourceState,
    authority: { actorRef?: string; ownerRef: string; businessOwnerRef: string },
  ) => OfferingSourceResult<unknown>,
  now: number,
): Promise<OfferingCommandResult> {
  let snapshot: DelegationAuthoritySnapshot
  try {
    snapshot = await admitDevSeedCatalogAuthority(ctx, command.operationKey, command.businessId)
  } catch (cause) {
    return degradeBackend(cause, {
      kind: 'error' as const,
      code: 'authority_denied' as const,
      reason: 'Declared development seed workload authority is not current.',
    }, { site: 'runSystemOfferingSourceCommand', reason: 'invalid_response' })
  }
  return runOfferingSourceCore(
    ctx.db,
    command.businessId,
    snapshot.actorPrincipalRef,
    snapshot.actorPrincipalRef,
    command.operationName,
    command.operationKey,
    target,
    mutate,
    now,
    'system',
  )
}

export async function runOfferingSourceMutation(
  ctx: MutationCtx,
  args: OfferingSourceMutationArgs,
  operationName: string,
  target: OfferingCommandTarget,
  mutate: (state: OfferingSourceState, authority: { actorRef?: string; ownerRef: string; businessOwnerRef: string }, now: number) => OfferingSourceResult<unknown>,
): Promise<OfferingCommandResult> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'error', code: 'unauthenticated', reason: 'Authentication is required.' }
  const business = await ctx.db.get(args.businessId)
  if (business === null) return { kind: 'error', code: 'wrong_owner', reason: 'Business was not found.' }
  if (business.owningAccountRef !== actor.canonicalAccountRef) {
    return { kind: 'error', code: 'wrong_owner', reason: 'Only the canonical business owner may change this business.' }
  }
  const admitted = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (admitted.kind === 'rejected') return { kind: 'error', code: 'operation_conflict', reason: admitted.reason }
  const now = Date.now()
  const core = await runOfferingSourceCore(
    ctx.db,
    args.businessId,
    actor.canonicalPrincipalRef,
    actor.canonicalPrincipalRef,
    operationName,
    args.operationKey,
    target,
    mutate,
    now,
    'owner',
  )
  if (core.kind === 'error') return core
  if (business.businessContext?.kind === 'programmable_provider') return core
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, args.businessId, now)
  await rebuildBusinessSupplyProjectionSnapshotCommand({ db: ctx.db, sourceDb: ctx.db, businessId: args.businessId, support, now })
  return core
}
