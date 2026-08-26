import type { Doc } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import {
  DelegationError,
  delegationSnapshotRef,
  type DelegationAuthoritySnapshot,
} from '../../src/modules/authority/delegation/public'
import {
  SecretLifecycleError,
  secretGeneration,
  secretRef,
  type SecretLifecycleJournal,
  type SecretLifecycleRecord,
  type SecretPointer,
  type SecretPointerAdvanceRequest,
  type SecretPointerControl,
  type SecretRef,
  type SecretTarget,
} from '../../src/modules/secrets/public'
import { accountRef, principalRef } from '../../src/modules/principal-account/public'
import {
  createConvexSecretPointerStore,
  initializeConvexSecretPointer,
  type SecretPointerAuthority,
} from './secretPointerPersistence'
import { createConvexDelegationStore } from './delegationPersistence'

export type ConvexSecretLifecyclePersistence = Readonly<{
  journal: SecretLifecycleJournal
  pointerControl: SecretPointerControl
}>

export function createConvexSecretLifecyclePersistence(
  ctx: MutationCtx,
  authorityInput: SecretPointerAuthority,
): ConvexSecretLifecyclePersistence {
  const authority = canonicalAuthority(authorityInput)
  const journal: SecretLifecycleJournal = Object.freeze({
    getByIdempotency: async (idempotencyRef) => {
      const row = await rowByIdempotency(ctx, idempotencyRef)
      if (row === null) return undefined
      await requireSnapshot(ctx, authority, row.secretRef)
      if (row.authority.accountRef !== authority.accountRef
        || (authority.operation !== 'reconcile'
          && !authoritiesEqual(canonicalAuthority(row.authority), authority))) {
        throw new SecretLifecycleError('secret_lifecycle_conflict')
      }
      return recordFromRow(row)
    },
    insertPrepared: async (record) => {
      const canonical = canonicalRecord(record)
      if (canonical.state !== 'prepared'
        || authority.operation !== canonical.operation
        || canonical.idempotencyRef !== authority.idempotencyRef
        || canonical.createdAt !== authority.occurredAt
        || canonical.updatedAt !== authority.occurredAt) {
        throw new SecretLifecycleError('secret_lifecycle_conflict')
      }
      await requireSnapshot(ctx, authority, canonical.secretRef)
      if (await rowByIdempotency(ctx, canonical.idempotencyRef) !== null
        || await ctx.db.query('secretLifecycleJournal')
          .withIndex('by_operationRef', (query) => query.eq('operationRef', canonical.operationRef)).unique() !== null) {
        throw new SecretLifecycleError('secret_lifecycle_conflict')
      }
      await ctx.db.insert('secretLifecycleJournal', {
        ...recordForStorage(canonical),
        authority: authorityForStorage(authority),
      })
    },
    replace: async (record, expectedState) => {
      const canonical = canonicalRecord(record)
      const row = await rowByIdempotency(ctx, canonical.idempotencyRef)
      if (row === null
        || row.state !== expectedState
        || row.updatedAt > canonical.updatedAt
        || !recordsShareIdentity(recordFromRow(row), canonical)) {
        throw new SecretLifecycleError('secret_lifecycle_conflict')
      }
      await requireSnapshot(ctx, authority, canonical.secretRef)
      await ctx.db.replace(row._id, {
        ...recordForStorage(canonical),
        authority: row.authority,
      })
    },
  })

  const pointerStore = authority.operation === 'provision'
    ? undefined
    : createConvexSecretPointerStore(ctx, authority)
  const pointerControl: SecretPointerControl = Object.freeze({
    getActive: async (ref: SecretRef) => {
      if (pointerStore !== undefined) return await pointerStore.getActive(ref)
      const canonicalRef = secretRef(ref)
      const row = await ctx.db.query('secretPointers')
        .withIndex('by_secretRef', (query) => query.eq('secretRef', canonicalRef)).unique()
      if (row === null) return undefined
      if (row.owningAccountRef !== authority.accountRef) {
        throw new SecretLifecycleError('secret_lifecycle_conflict')
      }
      return Object.freeze({
        secretRef: canonicalRef,
        activeGeneration: secretGeneration(row.activeGeneration),
        revision: positiveInteger(row.revision),
      }) satisfies SecretPointer
    },
    initializeActive: async (target: SecretTarget) => {
      await requireSnapshot(ctx, authority, target.secretRef)
      await initializeConvexSecretPointer(ctx, authority, {
        secretRef: secretRef(target.secretRef),
        activeGeneration: secretGeneration(target.generation),
      })
    },
    advanceActive: async (request: SecretPointerAdvanceRequest) => {
      if (pointerStore === undefined || authority.operation !== 'rotate') {
        throw new SecretLifecycleError('secret_lifecycle_conflict')
      }
      await requireSnapshot(ctx, authority, request.secretRef)
      await pointerStore.advanceActive(request)
    },
  })
  return Object.freeze({ journal, pointerControl })
}

async function requireSnapshot(
  ctx: MutationCtx,
  authority: SecretPointerAuthority,
  secretRefInput: string,
): Promise<DelegationAuthoritySnapshot> {
  const ref = secretRef(secretRefInput)
  const snapshot = await createConvexDelegationStore(ctx).transact(async (transaction) =>
    await transaction.getSnapshot(delegationSnapshotRef(authority.snapshotRef)))
  if (snapshot === undefined
    || snapshot.accountRef !== authority.accountRef
    || snapshot.actorPrincipalRef !== authority.actorPrincipalRef
    || snapshot.subjectPrincipalRef !== authority.actorPrincipalRef
    || snapshot.grantRef !== authority.grantRef
    || snapshot.generation !== authority.grantGeneration
    || snapshot.correlationRef !== authority.correlationRef
    || snapshot.idempotencyRef !== authority.idempotencyRef
    || snapshot.admittedAt !== authority.occurredAt
    || snapshot.expiresAt <= authority.occurredAt
    || !snapshot.scopes.includes(`secret:${authority.operation}`)
    || !snapshot.resourceRefs.includes(`secret:${ref}`)) {
    throw new DelegationError('delegation_snapshot_invalid')
  }
  return snapshot
}

function canonicalAuthority(input: Readonly<{
  operation: SecretPointerAuthority['operation']
  snapshotRef: string
  accountRef: string
  actorPrincipalRef: string
  grantRef: string
  grantGeneration: number
  correlationRef: string
  idempotencyRef: string
  occurredAt: number
}>): SecretPointerAuthority {
  if (!Number.isSafeInteger(input.grantGeneration) || input.grantGeneration < 1
    || !Number.isSafeInteger(input.occurredAt) || input.occurredAt < 0
    || input.correlationRef.length === 0 || input.idempotencyRef.length === 0) {
    throw new SecretLifecycleError('secret_lifecycle_invalid')
  }
  return Object.freeze({
    ...input,
    snapshotRef: delegationSnapshotRef(input.snapshotRef),
    accountRef: accountRef(input.accountRef),
    actorPrincipalRef: principalRef(input.actorPrincipalRef),
  })
}

function canonicalRecord(record: SecretLifecycleRecord): SecretLifecycleRecord {
  if (!Number.isSafeInteger(record.previousRevision) || record.previousRevision < 0
    || !Number.isSafeInteger(record.createdAt) || record.createdAt < 0
    || !Number.isSafeInteger(record.updatedAt) || record.updatedAt < record.createdAt
    || record.operationRef.length === 0 || record.idempotencyRef.length === 0) {
    throw new SecretLifecycleError('secret_lifecycle_invalid')
  }
  return Object.freeze({
    ...record,
    secretRef: secretRef(record.secretRef),
    targetGeneration: secretGeneration(record.targetGeneration),
    ...(record.previousGeneration === undefined
      ? {}
      : { previousGeneration: secretGeneration(record.previousGeneration) }),
  })
}

function recordFromRow(row: Doc<'secretLifecycleJournal'>): SecretLifecycleRecord {
  return canonicalRecord({
    operationRef: row.operationRef,
    idempotencyRef: row.idempotencyRef,
    operation: row.operation,
    secretRef: secretRef(row.secretRef),
    targetGeneration: secretGeneration(row.targetGeneration),
    ...(row.previousGeneration === undefined
      ? {}
      : { previousGeneration: secretGeneration(row.previousGeneration) }),
    previousRevision: row.previousRevision,
    state: row.state,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

function recordForStorage(record: SecretLifecycleRecord) {
  return {
    operationRef: record.operationRef,
    idempotencyRef: record.idempotencyRef,
    operation: record.operation,
    secretRef: record.secretRef,
    targetGeneration: record.targetGeneration,
    ...(record.previousGeneration === undefined ? {} : { previousGeneration: record.previousGeneration }),
    previousRevision: record.previousRevision,
    state: record.state,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function authorityForStorage(authority: SecretPointerAuthority) {
  return { ...authority }
}

function recordsShareIdentity(left: SecretLifecycleRecord, right: SecretLifecycleRecord): boolean {
  return left.operationRef === right.operationRef
    && left.idempotencyRef === right.idempotencyRef
    && left.operation === right.operation
    && left.secretRef === right.secretRef
    && left.targetGeneration === right.targetGeneration
    && left.previousGeneration === right.previousGeneration
    && left.previousRevision === right.previousRevision
    && left.createdAt === right.createdAt
}

function authoritiesEqual(left: SecretPointerAuthority, right: SecretPointerAuthority): boolean {
  return left.operation === right.operation
    && left.snapshotRef === right.snapshotRef
    && left.accountRef === right.accountRef
    && left.actorPrincipalRef === right.actorPrincipalRef
    && left.grantRef === right.grantRef
    && left.grantGeneration === right.grantGeneration
    && left.correlationRef === right.correlationRef
    && left.idempotencyRef === right.idempotencyRef
    && left.occurredAt === right.occurredAt
}

async function rowByIdempotency(ctx: MutationCtx, idempotencyRef: string) {
  return await ctx.db.query('secretLifecycleJournal')
    .withIndex('by_idempotencyRef', (query) => query.eq('idempotencyRef', idempotencyRef)).unique()
}

function positiveInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new SecretLifecycleError('secret_lifecycle_invalid')
  return value
}
