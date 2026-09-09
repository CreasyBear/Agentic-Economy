import { v, type Validator } from 'convex/values'

import type { JsonValue } from '@/modules/capability-contract/public'
import { SCHEDULED_WORKLOADS } from '@/lib/deployment/scheduled-workloads'
import {
  accountRef,
  createWorkloadContext,
  membershipRef,
  ownershipRef,
  principalRef,
  type AdmittedWorkloadContext,
  type Account,
  type AccountActionContext,
  type AccountOwnership,
  type AccountRef,
  type Membership,
  type Principal,
  type PrincipalRef,
  type WorkloadContextStore,
  type WorkloadKind,
} from '@/modules/principal-account/public'
import {
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'

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
export type WorkloadCronActionContext = Pick<ActionCtx, 'runAction' | 'runQuery'>
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

  constructor(code: WorkloadCronBoundaryErrorCode) {
    super(code)
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
  } catch {
    throw new WorkloadCronBoundaryError('workload_snapshot_invalid')
  }
}

export const CONSEQUENCE_OPERATIONS = [
  'capabilityCalls:cancelBeforeClaim',
  'capabilityCalls:claimAutomaticReconciliationCandidate',
  'capabilityCalls:finishAutomaticReconciliation',
  'capabilityCallX402AuthorizationExpiry:queueExpiredX402Authorization',
  'capabilitySupply:recordCapabilityProbeResult',
  'facilitatorDiscovery:reconcile',
  'moneyX402PaymentAttempts:reconcileX402PaymentAttempt',
] as const
export type ConsequenceOperation = typeof CONSEQUENCE_OPERATIONS[number]

export const consequenceOperationValue = v.union(...CONSEQUENCE_OPERATIONS.map((operation) => v.literal(operation)))

export const consequenceJsonScalarValue: Validator<null | boolean | number | string> = v.union(
  v.null(),
  v.boolean(),
  v.number(),
  v.string(),
)

export function consequenceJsonValueAtDepth(depth: number): Validator<JsonValue, 'required', string> {
  if (depth === 0) return consequenceJsonScalarValue
  const child = consequenceJsonValueAtDepth(depth - 1)
  return v.union(
    consequenceJsonScalarValue,
    v.array(child),
    v.record(v.string(), child),
  )
}

// Consequence operations retain their own exact registered-function validators.
// This shared boundary additionally rejects non-JSON payload/result shapes and
// caps nesting before dispatching through the declared operation switch below.
export const consequenceJsonValue = consequenceJsonValueAtDepth(12)
export const consequencePayloadValue = v.record(v.string(), consequenceJsonValue)

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

export class ConvexWorkloadContextStore implements WorkloadContextStore {
  constructor(private readonly ctx: Pick<QueryCtx, 'db'>) {}

  async getPrincipal(principalRef: PrincipalRef): Promise<Principal | undefined> {
    const row = await this.ctx.db
      .query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', principalRef))
      .unique()
    return row === null ? undefined : principalFromRow(row)
  }

  async getAccount(accountRef: AccountRef): Promise<Account | undefined> {
    const row = await this.ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', accountRef))
      .unique()
    return row === null ? undefined : accountFromRow(row)
  }

  async getOwnership(account: Account): Promise<AccountOwnership | undefined> {
    const row = await this.ctx.db
      .query('accountOwnerships')
      .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
      .unique()
    return row === null ? undefined : ownershipFromRow(row)
  }

  async getActiveMembership(accountRef: AccountRef, principalRef: PrincipalRef): Promise<Membership | undefined> {
    const row = await this.ctx.db
      .query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => (
        query
          .eq('accountRef', accountRef)
          .eq('memberPrincipalRef', principalRef)
          .eq('lifecycle', 'active')
      ))
      .unique()
    return row === null ? undefined : membershipFromRow(row)
  }
}

export function actionContextFromRow(value: Doc<'accounts'>['lastAction']): AccountActionContext {
  return Object.freeze({
    actorPrincipalRef: principalRef(value.actorPrincipalRef),
    activeAccountRef: accountRef(value.activeAccountRef),
    correlationRef: value.correlationRef,
    idempotencyRef: value.idempotencyRef,
  })
}

export function principalFromRow(row: Doc<'principals'>): Principal {
  return Object.freeze({
    principalRef: principalRef(row.principalRef),
    kind: row.kind,
    displayName: row.displayName,
    lifecycle: row.lifecycle,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.mergedIntoPrincipalRef === undefined
      ? {}
      : { mergedIntoPrincipalRef: principalRef(row.mergedIntoPrincipalRef) }),
  })
}

export function accountFromRow(row: Doc<'accounts'>): Account {
  return Object.freeze({
    accountRef: accountRef(row.accountRef),
    displayName: row.displayName,
    lifecycle: row.lifecycle,
    recoveryPolicy: row.recoveryPolicy,
    creationActorPrincipalRef: principalRef(row.creationActorPrincipalRef),
    creationIdempotencyRef: row.creationIdempotencyRef,
    initialOwnershipRef: ownershipRef(row.initialOwnershipRef),
    currentOwnershipRef: ownershipRef(row.currentOwnershipRef),
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastAction: actionContextFromRow(row.lastAction),
  })
}

export function ownershipFromRow(row: Doc<'accountOwnerships'>): AccountOwnership {
  return Object.freeze({
    ownershipRef: ownershipRef(row.ownershipRef),
    accountRef: accountRef(row.accountRef),
    ownerPrincipalRef: principalRef(row.ownerPrincipalRef),
    lifecycle: row.lifecycle,
    changeKind: row.changeKind,
    revision: row.revision,
    createdAt: row.createdAt,
    createdBy: actionContextFromRow(row.createdBy),
    ...(row.predecessorOwnershipRef === undefined
      ? {}
      : { predecessorOwnershipRef: ownershipRef(row.predecessorOwnershipRef) }),
    ...(row.successionAuthorizationRef === undefined
      ? {}
      : { successionAuthorizationRef: row.successionAuthorizationRef }),
    ...(row.endedAt === undefined ? {} : { endedAt: row.endedAt }),
    ...(row.endedBy === undefined ? {} : { endedBy: actionContextFromRow(row.endedBy) }),
    ...(row.successorOwnershipRef === undefined
      ? {}
      : { successorOwnershipRef: ownershipRef(row.successorOwnershipRef) }),
  })
}

export function membershipFromRow(row: Doc<'memberships'>): Membership {
  return Object.freeze({
    membershipRef: membershipRef(row.membershipRef),
    accountRef: accountRef(row.accountRef),
    memberPrincipalRef: principalRef(row.memberPrincipalRef),
    lifecycle: row.lifecycle,
    revision: row.revision,
    createdAt: row.createdAt,
    createdBy: actionContextFromRow(row.createdBy),
    ...(row.endedAt === undefined ? {} : { endedAt: row.endedAt }),
    ...(row.endedBy === undefined ? {} : { endedBy: actionContextFromRow(row.endedBy) }),
  })
}
