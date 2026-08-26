import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import { createConvexConnectionLifecycleStore } from '../../../convex/lib/connectionLifecyclePersistence'
import { delegationSnapshotRef } from '../../../src/modules/authority/delegation/public'
import {
  connectionRef,
  type Connection,
  type ConnectionAction,
  type ConnectionLifecycleCommand,
} from '../../../src/modules/connections/lifecycle/public'
import { accountRef, principalRef } from '../../../src/modules/principal-account/public'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

const ownerAccountRef = accountRef('acc_11111111111111111111111111111111')
const actorPrincipalRef = principalRef('prn_22222222222222222222222222222222')
const snapshotRef = delegationSnapshotRef('das_33333333333333333333333333333333')
const canonicalConnectionRef = connectionRef('con_44444444444444444444444444444444')
const grantRef = 'grt_55555555555555555555555555555555'
const collisionIdempotencyRef = 'connection:collision'

function action(
  operation: ConnectionAction['operation'],
  idempotencyRef = `connection:${operation}`,
): ConnectionAction {
  return Object.freeze({
    operation,
    snapshotRef,
    actorPrincipalRef,
    activeAccountRef: ownerAccountRef,
    grantRef,
    grantGeneration: 1,
    correlationRef: `connection:${operation}:correlation`,
    idempotencyRef,
    resourceRefs: operation === 'install'
      ? ['connection-provider:github']
      : [`connection:${canonicalConnectionRef}`],
    occurredAt: operation === 'install' ? 10 : 20,
  })
}

function installedConnection(): Connection {
  const installAction = action('install')
  return Object.freeze({
    connectionRef: canonicalConnectionRef,
    owningAccountRef: ownerAccountRef,
    installedByPrincipalRef: actorPrincipalRef,
    providerNamespace: 'github',
    installedExternalState: { kind: 'known' as const, value: 'ready' as const },
    externalState: { kind: 'known' as const, value: 'ready' as const },
    lifecycle: 'active',
    generation: 1,
    revision: 1,
    createdAt: 10,
    updatedAt: 10,
    installAction,
    action: installAction,
  })
}

function transition(
  operation: 'refresh' | 'revoke' | 'delete',
  idempotencyRef = collisionIdempotencyRef,
): ConnectionLifecycleCommand {
  const transitionAction = action(operation, idempotencyRef)
  const lifecycle = operation === 'refresh' ? 'active' : operation === 'revoke' ? 'revoked' : 'deleted'
  const requestedExternalState = operation === 'refresh'
    ? { kind: 'unknown' as const, value: 'provider-pending' }
    : { kind: 'known' as const, value: operation === 'revoke' ? 'revoked' as const : 'deleted' as const }
  const result = Object.freeze({
    ...installedConnection(),
    externalState: requestedExternalState,
    lifecycle,
    generation: 2,
    revision: 2,
    updatedAt: 20,
    action: transitionAction,
  })
  return Object.freeze({
    operation,
    connectionRef: canonicalConnectionRef,
    expectedGeneration: 1,
    requestedExternalState,
    action: transitionAction,
    result,
  })
}

function storedCommand(command: ConnectionLifecycleCommand) {
  return {
    ...command,
    requestedExternalState: { ...command.requestedExternalState },
    action: { ...command.action, resourceRefs: [...command.action.resourceRefs] },
    result: {
      ...command.result,
      installedExternalState: { ...command.result.installedExternalState },
      externalState: { ...command.result.externalState },
      installAction: {
        ...command.result.installAction,
        resourceRefs: [...command.result.installAction.resourceRefs],
      },
      action: { ...command.result.action, resourceRefs: [...command.result.action.resourceRefs] },
    },
  }
}

describe('Phase 2 Wave 1 Connection transition atomicity', () => {
  for (const operation of ['refresh', 'revoke', 'delete'] as const) {
    it(`does not persist a staged ${operation} replacement when command insertion fails and is caught`, async () => {
      const backend = convexTest(schema, convexModules)
      await backend.run(async (ctx) => {
        const store = createConvexConnectionLifecycleStore(ctx)
        await store.transact(async (transaction) => {
          await transaction.insertConnection(installedConnection())
          await transaction.insertLifecycleCommand(transition('refresh'))
        })

        try {
          await store.transact(async (transaction) => {
            const command = transition(operation)
            await transaction.replaceConnection(command.result, 1)
            await expect(transaction.getConnection(canonicalConnectionRef)).resolves.toMatchObject({
              lifecycle: command.result.lifecycle,
              revision: 2,
            })
            await expect(transaction.getConnectionByInstallIdempotency(
              ownerAccountRef,
              'connection:install',
            )).resolves.toMatchObject({ revision: 2 })
            try {
              await transaction.insertLifecycleCommand(command)
            } catch (error) {
              expect(error).toMatchObject({ code: 'connection_idempotency_conflict' })
            }
          })
          throw new Error('expected the durable command collision to reject')
        } catch (error) {
          expect(error).toMatchObject({ code: 'connection_idempotency_conflict' })
        }

        await expect(store.transact(async (transaction) => (
          await transaction.getConnection(canonicalConnectionRef)
        ))).resolves.toMatchObject({
          lifecycle: 'active',
          generation: 1,
          revision: 1,
        })
        expect(await ctx.db.query('connectionLifecycleCommands').collect()).toHaveLength(1)
      })
    })
  }

  it('retains read-your-writes while flushing a valid replacement and command together', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.run(async (ctx) => {
      const store = createConvexConnectionLifecycleStore(ctx)
      await store.transact(async (transaction) => await transaction.insertConnection(installedConnection()))

      const command = transition('refresh', 'connection:successful-refresh')
      await store.transact(async (transaction) => {
        await transaction.replaceConnection(command.result, 1)
        await transaction.replaceConnection(command.result, 2)
        await transaction.insertLifecycleCommand(command)
        await expect(transaction.getConnection(canonicalConnectionRef)).resolves.toMatchObject({ revision: 2 })
        await expect(transaction.getLifecycleCommandByIdempotency(
          ownerAccountRef,
          command.action.idempotencyRef,
        )).resolves.toMatchObject({ operation: 'refresh' })
      })

      expect(await ctx.db.query('connections').unique()).toMatchObject({ revision: 2 })
      expect(await ctx.db.query('connectionLifecycleCommands').unique()).toMatchObject({
        action: { idempotencyRef: 'connection:successful-refresh' },
      })
    })
  })

  it('fails closed after a caught stale replacement against staged state', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.run(async (ctx) => {
      const store = createConvexConnectionLifecycleStore(ctx)
      await store.transact(async (transaction) => await transaction.insertConnection(installedConnection()))

      try {
        await store.transact(async (transaction) => {
          const command = transition('refresh', 'connection:staged-stale')
          await transaction.replaceConnection(command.result, 1)
          try {
            await transaction.replaceConnection(command.result, 1)
          } catch (error) {
            expect(error).toMatchObject({ code: 'connection_generation_stale' })
          }
        })
        throw new Error('expected the caught staged revision mismatch to reject')
      } catch (error) {
        expect(error).toMatchObject({ code: 'connection_generation_stale' })
      }

      await expect(store.transact(async (transaction) => (
        await transaction.getConnection(canonicalConnectionRef)
      ))).resolves.toMatchObject({ revision: 1 })
    })
  })

  it('revalidates staged connection and command facts before the first flush write', async () => {
    const replacementBackend = convexTest(schema, convexModules)
    await replacementBackend.run(async (ctx) => {
      await createConvexConnectionLifecycleStore(ctx).transact(
        async (transaction) => await transaction.insertConnection(installedConnection()),
      )
    })
    await expect(replacementBackend.run(async (ctx) => {
      await createConvexConnectionLifecycleStore(ctx).transact(async (transaction) => {
        const command = transition('refresh', 'connection:preflight-replacement')
        await transaction.replaceConnection(command.result, 1)
        const document = await ctx.db.query('connections').unique()
        if (document === null) throw new Error('seed connection missing')
        await ctx.db.patch(document._id, { revision: 9 })
      })
    })).rejects.toMatchObject({ code: 'connection_generation_stale' })
    await replacementBackend.run(async (ctx) => {
      expect(await ctx.db.query('connections').unique()).toMatchObject({ revision: 1 })
    })

    const commandBackend = convexTest(schema, convexModules)
    await expect(commandBackend.run(async (ctx) => {
      await createConvexConnectionLifecycleStore(ctx).transact(async (transaction) => {
        const command = transition('refresh', 'connection:preflight-command')
        await transaction.insertLifecycleCommand(command)
        await ctx.db.insert('connectionLifecycleCommands', storedCommand(command))
      })
    })).rejects.toMatchObject({ code: 'connection_idempotency_conflict' })
    await commandBackend.run(async (ctx) => {
      expect(await ctx.db.query('connectionLifecycleCommands').collect()).toHaveLength(0)
    })
  })
})
