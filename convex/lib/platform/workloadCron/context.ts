import { v } from 'convex/values'

import { SCHEDULED_WORKLOADS } from '@/lib/deployment/scheduled-workloads'
import {
  createWorkloadContext,
  type AdmittedWorkloadContext,
  type AccountRef,
  type PrincipalRef,
  type WorkloadKind,
} from '@/modules/principal-account/public'
import type { ActionCtx, MutationCtx } from '../../../_generated/server'

export const SYSTEM_WORKLOAD_PRINCIPAL_REF = 'prn_f2000000000000000000000000000001' as PrincipalRef
export const SYSTEM_WORKLOAD_ACCOUNT_REF = 'acc_f2000000000000000000000000000001' as AccountRef

// Fixed machine-identity refs for the cron workload's platform rows, provisioned
// idempotently by ensurePlatformWorkloadIdentities (convex/workloadCron.ts) so a
// fresh deployment admits the cron fleet without out-of-band seeding. The
// account is owned by a distinct platform owner principal; the workload
// principal reaches it through an active membership (accessVia 'membership'),
// matching the canonical fixtures in convex/agentAccessOAuth.test.ts and
// tests/integration/facilitator-discovery.test.ts.
export const SYSTEM_WORKLOAD_OWNER_PRINCIPAL_REF = 'prn_f2000000000000000000000000000002' as PrincipalRef
export const SYSTEM_WORKLOAD_OWNERSHIP_REF = 'own_f2000000000000000000000000000001'
export const SYSTEM_WORKLOAD_MEMBERSHIP_REF = 'mem_f2000000000000000000000000000001'

export const WORKLOAD_CRON_DECLARATIONS = SCHEDULED_WORKLOADS.map((workload) =>
  declaration(workload.name, workload.workloadKind, workload.handler),
) as readonly ReturnType<typeof declaration<typeof SCHEDULED_WORKLOADS[number]['name'], typeof SCHEDULED_WORKLOADS[number]['handler']>>[]

export type WorkloadCronName = typeof WORKLOAD_CRON_DECLARATIONS[number]['name']
export type WorkloadCronActionContext = Pick<ActionCtx, 'runAction' | 'runMutation' | 'runQuery'>
export type WorkloadCronMutationContext = Pick<MutationCtx, 'db' | 'runMutation'>

export type WorkloadCronSnapshot = AdmittedWorkloadContext & Readonly<{
  name: WorkloadCronName
  admittedAt: number
}>

export type WorkloadCronActionBinding = Readonly<{
  name: WorkloadCronName
  snapshot: WorkloadCronSnapshot
  resourceInvocationRef?: string
}>

export type WorkloadCronBoundaryErrorCode =
  | 'workload_consequence_not_declared'
  | 'workload_resource_authority_invalid'
  | 'workload_snapshot_invalid'

export class WorkloadCronBoundaryError extends Error {
  readonly code: WorkloadCronBoundaryErrorCode

  constructor(code: WorkloadCronBoundaryErrorCode, options?: { cause?: unknown }) {
    super(code, options)
    this.name = 'WorkloadCronBoundaryError'
    this.code = code
  }
}

export const workloadCronNameValue = v.union(...SCHEDULED_WORKLOADS.map((workload) => v.literal(workload.name)))

export const workloadCronSnapshotValue = v.object({
  name: workloadCronNameValue,
  workloadKind: v.union(
    v.literal('job'),
    v.literal('cron'),
    v.literal('callback'),
    v.literal('reconciliation'),
  ),
  actorPrincipalRef: v.string(),
  activeAccountRef: v.string(),
  correlationRef: v.string(),
  idempotencyRef: v.string(),
  purpose: v.string(),
  source: v.string(),
  principalRevision: v.number(),
  activeAccountRevision: v.number(),
  accessVia: v.union(v.literal('ownership'), v.literal('membership')),
  admittedAt: v.number(),
})

export const declarationByName = Object.fromEntries(
  WORKLOAD_CRON_DECLARATIONS.map((entry) => [entry.name, entry]),
) as Readonly<Record<WorkloadCronName, typeof WORKLOAD_CRON_DECLARATIONS[number]>>

export function parseWorkloadCronSnapshot(input: unknown): WorkloadCronSnapshot {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new WorkloadCronBoundaryError('workload_snapshot_invalid')
  }
  const record = input as Record<string, unknown>
  const expectedKeys = [
    'accessVia',
    'activeAccountRef',
    'activeAccountRevision',
    'actorPrincipalRef',
    'admittedAt',
    'correlationRef',
    'idempotencyRef',
    'name',
    'principalRevision',
    'purpose',
    'source',
    'workloadKind',
  ]
  const actualKeys = Object.keys(record).sort()
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new WorkloadCronBoundaryError('workload_snapshot_invalid')
  }
  const declaration = WORKLOAD_CRON_DECLARATIONS.find(({ name }) => name === record.name)
  if (declaration === undefined
    || record.workloadKind !== declaration.workloadKind
    || record.actorPrincipalRef !== declaration.actorPrincipalRef
    || record.activeAccountRef !== declaration.activeAccountRef
    || record.purpose !== declaration.name
    || record.source !== `convex/workloadCron:${declaration.handler}`
    || !Number.isSafeInteger(record.principalRevision)
    || (record.principalRevision as number) < 1
    || !Number.isSafeInteger(record.activeAccountRevision)
    || (record.activeAccountRevision as number) < 1
    || (record.accessVia !== 'ownership' && record.accessVia !== 'membership')
    || !Number.isSafeInteger(record.admittedAt)
    || (record.admittedAt as number) < 0) {
    throw new WorkloadCronBoundaryError('workload_snapshot_invalid')
  }
  try {
    const context = createWorkloadContext({
      workloadKind: record.workloadKind,
      actorPrincipalRef: record.actorPrincipalRef,
      activeAccountRef: record.activeAccountRef,
      correlationRef: record.correlationRef,
      idempotencyRef: record.idempotencyRef,
      purpose: record.purpose,
      source: record.source,
    })
    return Object.freeze({
      name: declaration.name,
      ...context,
      principalRevision: record.principalRevision as number,
      activeAccountRevision: record.activeAccountRevision as number,
      accessVia: record.accessVia,
      admittedAt: record.admittedAt as number,
    })
  } catch (cause) {
    throw new WorkloadCronBoundaryError('workload_snapshot_invalid', { cause })
  }
}

export function declaration<Name extends string, Handler extends string>(
  name: Name,
  workloadKind: WorkloadKind,
  handler: Handler,
) {
  return Object.freeze({
    name,
    workloadKind,
    handler,
    authority: 'canonical_workload' as const,
    actorPrincipalRef: SYSTEM_WORKLOAD_PRINCIPAL_REF,
    activeAccountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
  })
}
