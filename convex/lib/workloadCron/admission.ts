import { accountRef, WorkloadContextAdmission } from '@/modules/principal-account/public'
import type { QueryCtx } from '../../_generated/server'
import { WorkloadCronBoundaryError, declarationByName, parseWorkloadCronSnapshot, type WorkloadCronName, type WorkloadCronSnapshot } from './context'
import { ConvexWorkloadContextStore } from './store'

export async function admitWorkloadCron(
  ctx: Pick<QueryCtx, 'db'>,
  name: WorkloadCronName,
): Promise<WorkloadCronSnapshot> {
  const declared = declarationByName[name]
  const admittedAt = Date.now()
  const sourceRef = declared.handler.replaceAll(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`)
  const admitted = await new WorkloadContextAdmission(new ConvexWorkloadContextStore(ctx)).admit({
    workloadKind: declared.workloadKind,
    actorPrincipalRef: declared.actorPrincipalRef,
    activeAccountRef: declared.activeAccountRef,
    correlationRef: `cron:${sourceRef}:${admittedAt}`,
    idempotencyRef: `cron:${sourceRef}:${admittedAt}`,
    purpose: declared.name,
    source: `convex/workloadCron:${declared.handler}`,
  })
  return Object.freeze({ name, ...admitted, admittedAt })
}

export async function admitWorkloadCronHandler(
  ctx: QueryCtx,
  args: Readonly<{ name: WorkloadCronName }>,
): Promise<WorkloadCronSnapshot> {
  return await admitWorkloadCron(ctx, args.name)
}

export async function reconcileWorkloadCronSnapshot(
  ctx: Pick<QueryCtx, 'db'>,
  name: WorkloadCronName,
  snapshot: WorkloadCronSnapshot,
): Promise<WorkloadCronSnapshot> {
  const declared = declarationByName[name]
  if (snapshot.name !== name
    || snapshot.workloadKind !== declared.workloadKind
    || snapshot.actorPrincipalRef !== declared.actorPrincipalRef
    || snapshot.activeAccountRef !== declared.activeAccountRef
    || snapshot.purpose !== declared.name
    || snapshot.source !== `convex/workloadCron:${declared.handler}`
    || !Number.isSafeInteger(snapshot.admittedAt)
    || snapshot.admittedAt > Date.now()) {
    throw new WorkloadCronBoundaryError('workload_snapshot_invalid')
  }
  return await admitWorkloadCron(ctx, name)
}

export async function reconcileWorkloadCronSnapshotHandler(
  ctx: QueryCtx,
  args: Readonly<{
    name: WorkloadCronName
    snapshot: WorkloadCronSnapshot
  }>,
): Promise<WorkloadCronSnapshot> {
  return await reconcileWorkloadCronSnapshot(ctx, args.name, parseWorkloadCronSnapshot(args.snapshot))
}

export async function reconcileWorkloadCronResourceAccount(
  ctx: Pick<QueryCtx, 'db'>,
  name: WorkloadCronName,
  snapshot: WorkloadCronSnapshot,
  resourceAccountRef: string,
): Promise<WorkloadCronSnapshot> {
  const current = await reconcileWorkloadCronSnapshot(ctx, name, snapshot)
  const canonicalResourceAccountRef = accountRef(resourceAccountRef)
  if (canonicalResourceAccountRef !== current.activeAccountRef) {
    await new WorkloadContextAdmission(new ConvexWorkloadContextStore(ctx)).attributeCrossAccount({
      context: workloadContextFromSnapshot(current),
      counterpartyAccountRef: canonicalResourceAccountRef,
    })
  }
  return current
}

export function workloadContextFromSnapshot(snapshot: WorkloadCronSnapshot) {
  return {
    workloadKind: snapshot.workloadKind,
    actorPrincipalRef: snapshot.actorPrincipalRef,
    activeAccountRef: snapshot.activeAccountRef,
    correlationRef: snapshot.correlationRef,
    idempotencyRef: snapshot.idempotencyRef,
    purpose: snapshot.purpose,
    source: snapshot.source,
  }
}
