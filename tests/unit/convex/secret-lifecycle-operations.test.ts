import { convexTest, type TestConvex } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'
import {
  secretGeneration,
  secretRef,
  type SecretLifecycleRecord,
} from '../../../src/modules/secrets/public'
import { convexModules } from '../../helpers/convex-fixtures'

const ACCOUNT = 'acc_00000000000040008000000000000111'
const OTHER_ACCOUNT = 'acc_00000000000040008000000000000112'
const ACTOR = 'prn_00000000000040008000000000000111'
const SNAPSHOT = 'das_00000000000040008000000000000111'
const GRANT = 'grt_00000000000040008000000000000111'
const SECRET = secretRef('sec_00000000000040008000000000000111')
const FIRST = secretGeneration('sgn_00000000000040008000000000000111')
const NEXT = secretGeneration('sgn_00000000000040008000000000000112')
const NOW = 4_000

const authority = Object.freeze({
  operation: 'rotate' as const,
  snapshotRef: SNAPSHOT,
  accountRef: ACCOUNT,
  actorPrincipalRef: ACTOR,
  grantRef: GRANT,
  grantGeneration: 1,
  correlationRef: 'secret:operations:rotate',
  idempotencyRef: 'secret:operations:rotate',
  occurredAt: NOW,
})

function journalRecord(
  overrides: Partial<SecretLifecycleRecord> = {},
): SecretLifecycleRecord {
  return {
    operationRef: 'sop_00000000000040008000000000000111',
    idempotencyRef: authority.idempotencyRef,
    operation: 'rotate',
    secretRef: SECRET,
    targetGeneration: NEXT,
    previousGeneration: FIRST,
    previousRevision: 1,
    state: 'prepared',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

async function seedAuthority(
  backend: TestConvex<typeof schema>,
  accountRef = ACCOUNT,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('authorityDelegationSnapshots', {
      snapshotRef: SNAPSHOT,
      grantRef: GRANT,
      generation: 1,
      accountRef,
      accountRevision: 1,
      actorPrincipalRef: ACTOR,
      subjectPrincipalRef: ACTOR,
      scopes: ['secret:rotate'],
      resourceRefs: [`secret:${SECRET}`],
      budgetAmount: 0,
      admittedAt: NOW,
      expiresAt: NOW + 1_000,
      correlationRef: authority.correlationRef,
      idempotencyRef: authority.idempotencyRef,
      ancestryCount: 1,
    })
    await ctx.db.insert('authorityDelegationSnapshotAncestors', {
      snapshotRef: SNAPSHOT,
      position: 0,
      grantRef: GRANT,
      generation: 1,
      accountRef,
      actorPrincipalRef: ACTOR,
      subjectPrincipalRef: ACTOR,
      scopes: ['secret:rotate'],
      resourceRefs: [`secret:${SECRET}`],
      budgetLimit: 1,
      budgetUsedBefore: 0,
      expiresAt: NOW + 1_000,
    })
  })
}

describe('secret lifecycle Convex operations', () => {
  it('runs every journal and pointer operation through the canonical persisted authority', async () => {
    const backend = convexTest(schema, convexModules)
    await seedAuthority(backend)
    await backend.run(async (ctx) => {
      const provisionAction = {
        ...authority,
        operation: 'provision' as const,
        correlationRef: 'secret:operations:seed',
        idempotencyRef: 'secret:operations:seed',
        occurredAt: NOW - 1,
      }
      await ctx.db.insert('secretPointers', {
        secretRef: SECRET,
        owningAccountRef: ACCOUNT,
        activeGeneration: FIRST,
        revision: 1,
        createdAt: NOW - 1,
        updatedAt: NOW - 1,
        lastAction: provisionAction,
      })
      await ctx.db.insert('secretPointerCommands', {
        secretRef: SECRET,
        operation: 'provision',
        newGeneration: FIRST,
        previousRevision: 0,
        newRevision: 1,
        action: provisionAction,
      })
    })

    await expect(backend.mutation(internal.secretLifecycleOperations.readLifecycleJournal, {
      authority,
      idempotencyRef: authority.idempotencyRef,
    })).resolves.toBeNull()
    const prepared = journalRecord()
    await expect(backend.mutation(internal.secretLifecycleOperations.insertLifecyclePrepared, {
      authority,
      record: prepared,
    })).resolves.toBeNull()
    await expect(backend.mutation(internal.secretLifecycleOperations.readLifecycleJournal, {
      authority,
      idempotencyRef: authority.idempotencyRef,
    })).resolves.toEqual(prepared)
    await expect(backend.mutation(internal.secretLifecycleOperations.readSecretPointer, {
      authority,
      secretRef: SECRET,
    })).resolves.toEqual({ secretRef: SECRET, activeGeneration: FIRST, revision: 1 })

    await expect(backend.mutation(internal.secretLifecycleOperations.advanceSecretPointer, {
      authority,
      secretRef: SECRET,
      expectedActiveGeneration: FIRST,
      expectedRevision: 1,
      newGeneration: NEXT,
    })).resolves.toBeNull()
    const active = journalRecord({ state: 'active', updatedAt: NOW + 1 })
    await expect(backend.mutation(internal.secretLifecycleOperations.replaceLifecycleJournal, {
      authority,
      record: active,
      expectedState: 'prepared',
    })).resolves.toBeNull()
    await expect(backend.mutation(internal.secretLifecycleOperations.readSecretPointer, {
      authority,
      secretRef: SECRET,
    })).resolves.toEqual({ secretRef: SECRET, activeGeneration: NEXT, revision: 2 })
    await expect(backend.mutation(internal.secretLifecycleOperations.readLifecycleJournal, {
      authority,
      idempotencyRef: authority.idempotencyRef,
    })).resolves.toEqual(active)

    const persisted = await backend.run(async (ctx) => ({
      journals: await ctx.db.query('secretLifecycleJournal').collect(),
      pointers: await ctx.db.query('secretPointers').collect(),
      commands: await ctx.db.query('secretPointerCommands').collect(),
    }))
    expect(JSON.stringify(persisted)).not.toContain('material')
    expect(persisted.journals[0]?.authority).toEqual(authority)
    expect(persisted.pointers[0]?.lastAction).toEqual(authority)
    expect(persisted.commands.at(-1)?.action).toEqual(authority)
  })

  it('preserves a provision record without inventing a previous generation', async () => {
    const backend = convexTest(schema, convexModules)
    const provisionAuthority = {
      ...authority,
      operation: 'provision' as const,
      correlationRef: 'secret:operations:provision',
      idempotencyRef: 'secret:operations:provision',
    }
    await backend.run(async (ctx) => {
      await ctx.db.insert('authorityDelegationSnapshots', {
        snapshotRef: SNAPSHOT,
        grantRef: GRANT,
        generation: 1,
        accountRef: ACCOUNT,
        accountRevision: 1,
        actorPrincipalRef: ACTOR,
        subjectPrincipalRef: ACTOR,
        scopes: ['secret:provision'],
        resourceRefs: [`secret:${SECRET}`],
        budgetAmount: 0,
        admittedAt: NOW,
        expiresAt: NOW + 1_000,
        correlationRef: provisionAuthority.correlationRef,
        idempotencyRef: provisionAuthority.idempotencyRef,
        ancestryCount: 1,
      })
      await ctx.db.insert('authorityDelegationSnapshotAncestors', {
        snapshotRef: SNAPSHOT,
        position: 0,
        grantRef: GRANT,
        generation: 1,
        accountRef: ACCOUNT,
        actorPrincipalRef: ACTOR,
        subjectPrincipalRef: ACTOR,
        scopes: ['secret:provision'],
        resourceRefs: [`secret:${SECRET}`],
        budgetLimit: 1,
        budgetUsedBefore: 0,
        expiresAt: NOW + 1_000,
      })
    })
    const { previousGeneration: _omittedPreviousGeneration, ...recordWithoutPreviousGeneration } = journalRecord()
    const prepared: SecretLifecycleRecord = {
      ...recordWithoutPreviousGeneration,
      operation: 'provision',
      idempotencyRef: provisionAuthority.idempotencyRef,
      targetGeneration: FIRST,
      previousRevision: 0,
    }
    await expect(backend.mutation(internal.secretLifecycleOperations.insertLifecyclePrepared, {
      authority: provisionAuthority,
      record: prepared,
    })).resolves.toBeNull()
    await expect(backend.mutation(internal.secretLifecycleOperations.readSecretPointer, {
      authority: provisionAuthority,
      secretRef: SECRET,
    })).resolves.toBeNull()
    await expect(backend.mutation(internal.secretLifecycleOperations.initializeSecretPointer, {
      authority: provisionAuthority,
      secretRef: SECRET,
      activeGeneration: FIRST,
    })).resolves.toBeNull()
    await expect(backend.mutation(internal.secretLifecycleOperations.readSecretPointer, {
      authority: provisionAuthority,
      secretRef: SECRET,
    })).resolves.toEqual({ secretRef: SECRET, activeGeneration: FIRST, revision: 1 })
    await expect(backend.mutation(internal.secretLifecycleOperations.readLifecycleJournal, {
      authority: provisionAuthority,
      idempotencyRef: provisionAuthority.idempotencyRef,
    })).resolves.toEqual(prepared)
  })

  it('rejects a cross-account or stale authority before any journal or pointer effect', async () => {
    for (const mode of ['cross-account', 'stale'] as const) {
      const backend = convexTest(schema, convexModules)
      await seedAuthority(backend, mode === 'cross-account' ? OTHER_ACCOUNT : ACCOUNT)
      if (mode === 'stale') {
        await backend.run(async (ctx) => {
          const snapshot = await ctx.db.query('authorityDelegationSnapshots').unique()
          if (snapshot === null) throw new Error('snapshot_fixture_missing')
          await ctx.db.patch(snapshot._id, { expiresAt: NOW })
        })
      }
      await expect(backend.mutation(internal.secretLifecycleOperations.insertLifecyclePrepared, {
        authority,
        record: journalRecord(),
      })).rejects.toMatchObject({ code: 'delegation_snapshot_invalid' })
      const rows = await backend.run(async (ctx) => ({
        journals: await ctx.db.query('secretLifecycleJournal').collect(),
        pointers: await ctx.db.query('secretPointers').collect(),
        commands: await ctx.db.query('secretPointerCommands').collect(),
      }))
      expect(rows).toEqual({ journals: [], pointers: [], commands: [] })
    }
  })
})
