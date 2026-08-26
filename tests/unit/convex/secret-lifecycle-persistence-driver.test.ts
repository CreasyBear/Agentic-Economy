import { convexTest, type TestConvex } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import {
  createConvexSecretLifecyclePersistence,
} from '../../../convex/lib/secretLifecyclePersistence'
import type { SecretPointerAuthority } from '../../../convex/lib/secretPointerPersistence'
import {
  secretGeneration,
  secretRef,
  type SecretLifecycleRecord,
} from '../../../src/modules/secrets/public'
import {
  accountRef,
  principalRef,
} from '../../../src/modules/principal-account/public'
import { delegationSnapshotRef } from '../../../src/modules/authority/delegation/public'
import { convexModules } from '../../helpers/convex-fixtures'

const ACCOUNT = accountRef('acc_00000000000040008000000000000061')
const OTHER_ACCOUNT = accountRef('acc_00000000000040008000000000000062')
const ACTOR = principalRef('prn_00000000000040008000000000000061')
const OTHER_ACTOR = principalRef('prn_00000000000040008000000000000062')
const REF = secretRef('sec_00000000000040008000000000000061')
const OTHER_REF = secretRef('sec_00000000000040008000000000000062')
const FIRST = secretGeneration('sgn_00000000000040008000000000000061')
const NEXT = secretGeneration('sgn_00000000000040008000000000000062')
const THIRD = secretGeneration('sgn_00000000000040008000000000000063')

type SnapshotSeed = Readonly<{
  snapshotRef: string
  grantRef: string
  generation: number
  accountRef: string
  accountRevision: number
  actorPrincipalRef: string
  subjectPrincipalRef: string
  scopes: string[]
  resourceRefs: string[]
  budgetAmount: number
  admittedAt: number
  expiresAt: number
  correlationRef: string
  idempotencyRef: string
  ancestryCount: number
}>

function authority(
  operation: SecretPointerAuthority['operation'],
  suffix: string,
  overrides: Partial<SecretPointerAuthority> = {},
): SecretPointerAuthority {
  const tail = suffix.padStart(2, '0').slice(-2)
  return {
    operation,
    snapshotRef: delegationSnapshotRef(`das_000000000000400080000000000000${tail}`),
    accountRef: ACCOUNT,
    actorPrincipalRef: ACTOR,
    grantRef: `grt_000000000000400080000000000000${tail}`,
    grantGeneration: 1,
    correlationRef: `secret:${operation}:${suffix}`,
    idempotencyRef: `secret:${operation}:${suffix}`,
    occurredAt: 1_100,
    ...overrides,
  }
}

function snapshotFor(
  input: SecretPointerAuthority,
  overrides: Partial<SnapshotSeed> = {},
): SnapshotSeed {
  return {
    snapshotRef: input.snapshotRef,
    grantRef: input.grantRef,
    generation: input.grantGeneration,
    accountRef: input.accountRef,
    accountRevision: 1,
    actorPrincipalRef: input.actorPrincipalRef,
    subjectPrincipalRef: input.actorPrincipalRef,
    scopes: [`secret:${input.operation}`],
    resourceRefs: [`secret:${REF}`],
    budgetAmount: 0,
    admittedAt: input.occurredAt,
    expiresAt: input.occurredAt + 1_000,
    correlationRef: input.correlationRef,
    idempotencyRef: input.idempotencyRef,
    ancestryCount: 1,
    ...overrides,
  }
}

async function seedSnapshot(
  backend: TestConvex<typeof schema>,
  input: SecretPointerAuthority,
  overrides: Partial<SnapshotSeed> = {},
): Promise<void> {
  const snapshot = snapshotFor(input, overrides)
  await backend.run(async (ctx) => {
    await ctx.db.insert('authorityDelegationSnapshots', snapshot)
    if (snapshot.ancestryCount > 0) {
      await ctx.db.insert('authorityDelegationSnapshotAncestors', {
        snapshotRef: snapshot.snapshotRef,
        position: 0,
        grantRef: snapshot.grantRef,
        generation: snapshot.generation,
        accountRef: snapshot.accountRef,
        actorPrincipalRef: snapshot.actorPrincipalRef,
        subjectPrincipalRef: snapshot.subjectPrincipalRef,
        scopes: snapshot.scopes,
        resourceRefs: snapshot.resourceRefs,
        budgetLimit: 1,
        budgetUsedBefore: 0,
        expiresAt: snapshot.expiresAt,
      })
    }
  })
}

function record(
  input: SecretPointerAuthority,
  overrides: Partial<SecretLifecycleRecord> = {},
): SecretLifecycleRecord {
  return {
    operationRef: `operation:${input.idempotencyRef}`,
    idempotencyRef: input.idempotencyRef,
    operation: input.operation === 'provision' ? 'provision' : 'rotate',
    secretRef: REF,
    targetGeneration: input.operation === 'provision' ? FIRST : NEXT,
    ...(input.operation === 'provision' ? {} : { previousGeneration: FIRST }),
    previousRevision: input.operation === 'provision' ? 0 : 1,
    state: 'prepared',
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    ...overrides,
  }
}

async function insertJournalRow(
  backend: TestConvex<typeof schema>,
  input: SecretPointerAuthority,
  persistedAuthority: SecretPointerAuthority = input,
): Promise<void> {
  const value = record(input)
  await backend.run(async (ctx) => {
    await ctx.db.insert('secretLifecycleJournal', {
      operationRef: value.operationRef,
      idempotencyRef: value.idempotencyRef,
      operation: value.operation,
      secretRef: value.secretRef,
      targetGeneration: value.targetGeneration,
      ...(value.previousGeneration === undefined ? {} : { previousGeneration: value.previousGeneration }),
      previousRevision: value.previousRevision,
      state: value.state,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      authority: persistedAuthority,
    })
  })
}

describe('Convex secret lifecycle persistence driver', () => {
  it('provisions an absent pointer, persists the no-previous-generation record, and denies non-rotate advance', async () => {
    const backend = convexTest(schema, convexModules)
    const provision = authority('provision', '61')
    await seedSnapshot(backend, provision)

    await backend.run(async (ctx) => {
      const persistence = createConvexSecretLifecyclePersistence(ctx, provision)
      await expect(persistence.journal.getByIdempotency('missing')).resolves.toBeUndefined()
      await expect(persistence.pointerControl.getActive(REF)).resolves.toBeUndefined()
      const prepared = record(provision)
      await persistence.journal.insertPrepared(prepared)
      await persistence.pointerControl.initializeActive({ secretRef: REF, generation: FIRST })
      await persistence.journal.replace({ ...prepared, state: 'active' }, 'prepared')
      await expect(persistence.journal.getByIdempotency(provision.idempotencyRef))
        .resolves.toEqual({ ...prepared, state: 'active' })
      await expect(persistence.pointerControl.getActive(REF)).resolves.toEqual({
        secretRef: REF,
        activeGeneration: FIRST,
        revision: 1,
      })
      await expect(persistence.pointerControl.advanceActive({
        secretRef: REF,
        expectedActiveGeneration: FIRST,
        expectedRevision: 1,
        newGeneration: NEXT,
      })).rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
    })

    const other = authority('provision', '62', { accountRef: OTHER_ACCOUNT })
    await seedSnapshot(backend, other)
    await backend.run(async (ctx) => {
      await expect(createConvexSecretLifecyclePersistence(ctx, other).pointerControl.getActive(REF))
        .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
    })
  })

  it('rejects malformed prepared records and both journal uniqueness collisions', async () => {
    const backend = convexTest(schema, convexModules)
    const rotate = authority('rotate', '63')
    await seedSnapshot(backend, rotate)
    const base = record(rotate)
    const malformed: SecretLifecycleRecord[] = [
      { ...base, state: 'active' },
      { ...base, operation: 'provision' },
      { ...base, idempotencyRef: 'other:idempotency' },
      { ...base, createdAt: rotate.occurredAt + 1, updatedAt: rotate.occurredAt + 1 },
      { ...base, updatedAt: rotate.occurredAt + 1 },
      { ...base, previousRevision: -1 },
      { ...base, previousRevision: Number.NaN },
      { ...base, createdAt: -1 },
      { ...base, createdAt: Number.NaN },
      { ...base, updatedAt: base.createdAt - 1 },
      { ...base, updatedAt: Number.NaN },
      { ...base, operationRef: '' },
      { ...base, idempotencyRef: '' },
      { ...base, secretRef: 'bad' as typeof REF },
      { ...base, targetGeneration: 'bad' as typeof NEXT },
      { ...base, previousGeneration: 'bad' as typeof FIRST },
    ]
    await backend.run(async (ctx) => {
      const persistence = createConvexSecretLifecyclePersistence(ctx, rotate)
      for (const candidate of malformed) {
        await expect(persistence.journal.insertPrepared(candidate)).rejects.toBeInstanceOf(Error)
      }
      await persistence.journal.insertPrepared(base)
      await expect(persistence.journal.insertPrepared(base))
        .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
    })

    const second = authority('rotate', '64')
    await seedSnapshot(backend, second)
    await backend.run(async (ctx) => {
      const duplicateOperation = record(second, { operationRef: base.operationRef })
      await expect(createConvexSecretLifecyclePersistence(ctx, second).journal.insertPrepared(duplicateOperation))
        .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
    })
  })

  it('rejects missing, stale, rewound, and identity-corrupt journal replacements', async () => {
    const identityFields: readonly (keyof SecretLifecycleRecord)[] = [
      'operationRef', 'operation', 'secretRef', 'targetGeneration',
      'previousGeneration', 'previousRevision', 'createdAt',
    ]
    for (const [index, field] of identityFields.entries()) {
      const suffix = String(70 + index)
      const backend = convexTest(schema, convexModules)
      const rotate = authority('rotate', suffix)
      await seedSnapshot(backend, rotate)
      const base = record(rotate)
      await backend.run(async (ctx) => {
        const persistence = createConvexSecretLifecyclePersistence(ctx, rotate)
        await expect(persistence.journal.replace(base, 'prepared'))
          .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
        await persistence.journal.insertPrepared(base)
        await expect(persistence.journal.replace({ ...base, state: 'active' }, 'active'))
          .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
        const row = await ctx.db.query('secretLifecycleJournal')
          .withIndex('by_idempotencyRef', (query) => query.eq('idempotencyRef', base.idempotencyRef)).unique()
        if (row === null) throw new Error('fixture_missing')
        await ctx.db.patch(row._id, { updatedAt: base.updatedAt + 1 })
        await expect(persistence.journal.replace({ ...base, state: 'active' }, 'prepared'))
          .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
        await ctx.db.patch(row._id, { updatedAt: base.updatedAt })
        const corrupt = field === 'operationRef'
          ? { operationRef: `${base.operationRef}:other` }
          : field === 'operation'
            ? { operation: 'provision' as const }
            : field === 'secretRef'
              ? { secretRef: OTHER_REF }
              : field === 'targetGeneration'
                ? { targetGeneration: THIRD }
                : field === 'previousGeneration'
                  ? { previousGeneration: THIRD }
                  : field === 'previousRevision'
                    ? { previousRevision: 2 }
                    : { createdAt: base.createdAt - 1 }
        await ctx.db.patch(row._id, corrupt)
        await expect(persistence.journal.replace({ ...base, state: 'active' }, 'prepared'))
          .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
      })
    }
  })

  it('allows reconcile to read an attributed rotate journal while rejecting mismatched rotate authority', async () => {
    const backend = convexTest(schema, convexModules)
    const rotate = authority('rotate', '80')
    await seedSnapshot(backend, rotate)
    await insertJournalRow(backend, rotate)

    const reconcile = authority('reconcile', '81', {
      accountRef: rotate.accountRef,
      actorPrincipalRef: rotate.actorPrincipalRef,
      grantRef: rotate.grantRef,
      grantGeneration: rotate.grantGeneration,
    })
    await seedSnapshot(backend, reconcile)
    await backend.run(async (ctx) => {
      await expect(createConvexSecretLifecyclePersistence(ctx, reconcile).journal
        .getByIdempotency(rotate.idempotencyRef)).resolves.toEqual(record(rotate))
      await expect(createConvexSecretLifecyclePersistence(ctx, reconcile).pointerControl.advanceActive({
        secretRef: REF,
        expectedActiveGeneration: FIRST,
        expectedRevision: 1,
        newGeneration: NEXT,
      })).rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
    })

    for (const [index, delta] of [
      { operation: 'provision' as const },
      { snapshotRef: delegationSnapshotRef('das_00000000000040008000000000000099') },
      { actorPrincipalRef: OTHER_ACTOR },
      { grantRef: 'grt_00000000000040008000000000000099' },
      { grantGeneration: 2 },
      { correlationRef: 'secret:other' },
      { idempotencyRef: 'secret:other' },
      { occurredAt: rotate.occurredAt + 1 },
    ].entries()) {
      const candidateBackend = convexTest(schema, convexModules)
      const reader = authority('rotate', String(82 + index))
      await seedSnapshot(candidateBackend, reader)
      await insertJournalRow(candidateBackend, reader, { ...reader, ...delta })
      await candidateBackend.run(async (ctx) => {
        await expect(createConvexSecretLifecyclePersistence(ctx, reader).journal
          .getByIdempotency(reader.idempotencyRef))
          .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
      })
    }

    const otherAccountBackend = convexTest(schema, convexModules)
    const reader = authority('rotate', '90')
    await seedSnapshot(otherAccountBackend, reader)
    await insertJournalRow(otherAccountBackend, reader, { ...reader, accountRef: OTHER_ACCOUNT })
    await otherAccountBackend.run(async (ctx) => {
      await expect(createConvexSecretLifecyclePersistence(ctx, reader).journal
        .getByIdempotency(reader.idempotencyRef))
        .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
    })
  })

  it('rejects every malformed or stale consequence snapshot field', async () => {
    const base = authority('rotate', '91')
    const invalidSnapshots: readonly (Partial<SnapshotSeed> | undefined)[] = [
      undefined,
      { accountRef: OTHER_ACCOUNT },
      { actorPrincipalRef: OTHER_ACTOR },
      { subjectPrincipalRef: OTHER_ACTOR },
      { grantRef: 'grt_00000000000040008000000000000099' },
      { generation: 2 },
      { correlationRef: 'secret:other' },
      { idempotencyRef: 'secret:other' },
      { admittedAt: base.occurredAt - 1 },
      { expiresAt: base.occurredAt },
      { scopes: ['secret:provision'] },
      { resourceRefs: [`secret:${OTHER_REF}`] },
    ]
    for (const [index, delta] of invalidSnapshots.entries()) {
      const backend = convexTest(schema, convexModules)
      const input = authority('rotate', String(100 + index))
      if (delta !== undefined) await seedSnapshot(backend, input, delta)
      await backend.run(async (ctx) => {
        await expect(createConvexSecretLifecyclePersistence(ctx, input).journal.insertPrepared(record(input)))
          .rejects.toMatchObject({ code: 'delegation_snapshot_invalid' })
      })
    }
  })

  it('rejects malformed authority numbers, references, context, and persisted pointer revisions', async () => {
    const base = authority('rotate', '95')
    for (const delta of [
      { grantGeneration: 0 },
      { grantGeneration: Number.NaN },
      { occurredAt: -1 },
      { occurredAt: Number.NaN },
      { correlationRef: '' },
      { idempotencyRef: '' },
      { snapshotRef: 'bad' },
      { accountRef: 'bad' },
      { actorPrincipalRef: 'bad' },
    ]) {
      expect(() => createConvexSecretLifecyclePersistence({} as never, { ...base, ...delta } as SecretPointerAuthority))
        .toThrow()
    }

    for (const revision of [0, Number.NaN]) {
      const backend = convexTest(schema, convexModules)
      const provision = authority('provision', revision === 0 ? '96' : '97')
      await seedSnapshot(backend, provision)
      await backend.run(async (ctx) => {
        await ctx.db.insert('secretPointers', {
          secretRef: REF,
          owningAccountRef: ACCOUNT,
          activeGeneration: FIRST,
          revision,
          createdAt: 1_000,
          updatedAt: 1_000,
          lastAction: provision,
        })
        await expect(createConvexSecretLifecyclePersistence(ctx, provision).pointerControl.getActive(REF))
          .rejects.toMatchObject({ code: 'secret_lifecycle_invalid' })
      })
    }
  })
})
