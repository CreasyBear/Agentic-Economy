import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../convex/schema'
import {
  createDelegationBackedConnectionAuthority,
  createConvexConnectionLifecycleStore,
} from '../../convex/lib/connectionLifecyclePersistence'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from '../../convex/lib/delegationPersistence'
import {
  createConvexSecretPointerStore,
  initializeConvexSecretPointer,
} from '../../convex/lib/secretPointerPersistence'
import { DelegationService } from '../../src/modules/authority/delegation/public'
import { authorityDelegationTables } from '../../src/modules/authority/internal/convex-schema'
import { ConnectionLifecycleService } from '../../src/modules/connections/lifecycle/public'
import { connectionTables } from '../../src/modules/connections/internal/convex-schema'
import {
  secretGeneration,
  secretRef,
} from '../../src/modules/secrets/public'
import { secretReferenceTables } from '../../src/modules/secrets/internal/convex-schema'
import {
  accountRef,
  principalRef,
} from '../../src/modules/principal-account/public'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../convex/', './'), load]),
)

const actorRef = principalRef('prn_11111111111111111111111111111111')
const account = accountRef('acc_22222222222222222222222222222222')
const subjectRef = principalRef('prn_33333333333333333333333333333333')

describe('Phase 2 Wave 1 canonical composition', () => {
  it('composes each canonical table fragment once without secret material fields', () => {
    const fragments = {
      ...authorityDelegationTables,
      ...connectionTables,
      ...secretReferenceTables,
    }
    for (const [name, table] of Object.entries(fragments)) {
      expect(Reflect.get(schema.tables, name)).toBe(table)
    }

    const exported = Reflect.get(schema, 'export')
    if (typeof exported !== 'function') throw new Error('Convex schema export unavailable')
    const serialized = String(exported.call(schema))
    expect(serialized).not.toMatch(/secret(Value|Material|Bytes|Token|Body|Payload|Hash)/i)
    expect(serialized).toContain('secretRef')
    expect(serialized).toContain('activeGeneration')
  })

  it('keeps context, delegation, Connection and pointer mutations on canonical stores', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.run(async (ctx) => {
      await ctx.db.insert('principals', {
        principalRef: actorRef,
        kind: 'human',
        displayName: 'Owner',
        lifecycle: 'active',
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('principals', {
        principalRef: subjectRef,
        kind: 'agent',
        displayName: 'Agent',
        lifecycle: 'active',
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('accounts', {
        accountRef: account,
        displayName: 'Canonical Account',
        lifecycle: 'active',
        recoveryPolicy: { kind: 'no_transfer', revision: 1 },
        creationActorPrincipalRef: actorRef,
        creationIdempotencyRef: 'account:create',
        initialOwnershipRef: 'own_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        currentOwnershipRef: 'own_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
        lastAction: {
          actorPrincipalRef: actorRef,
          activeAccountRef: account,
          correlationRef: 'account:create',
          idempotencyRef: 'account:create',
        },
      })
      await ctx.db.insert('accountOwnerships', {
        ownershipRef: 'own_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        accountRef: account,
        ownerPrincipalRef: actorRef,
        lifecycle: 'active',
        changeKind: 'creation',
        revision: 1,
        createdAt: 1,
        createdBy: {
          actorPrincipalRef: actorRef,
          activeAccountRef: account,
          correlationRef: 'account:create',
          idempotencyRef: 'account:create',
        },
      })

      let now = 100
      let uuid = 0
      const nextUuid = () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`
      const delegation = new DelegationService(
        createConvexDelegationStore(ctx),
        createConvexDelegationContextPort(ctx, actorRef),
        { now: () => now, randomUuid: nextUuid },
      )
      const root = await delegation.issueRoot({
        context: {
          actorPrincipalRef: actorRef,
          activeAccountRef: account,
          correlationRef: 'root:create',
          idempotencyRef: 'root:create',
        },
        subjectPrincipalRef: actorRef,
        scopes: ['connection:install'],
        resourceRefs: ['connection-provider:github', 'secret:sec_44444444444444444444444444444444'],
        budgetLimit: 10,
        expiresAt: 1_000,
      })

      const connections = new ConnectionLifecycleService(
        createConvexConnectionLifecycleStore(ctx),
        createDelegationBackedConnectionAuthority(delegation),
        { now: () => ++now, randomUuid: nextUuid },
      )
      const vaultRef = secretRef('sec_44444444444444444444444444444444')
      const connection = await connections.install({
        context: {
          actorPrincipalRef: actorRef,
          activeAccountRef: account,
          correlationRef: 'connection:install',
          idempotencyRef: 'connection:install',
        },
        grantRef: root.grantRef,
        expectedGrantGeneration: root.generation,
        providerNamespace: 'github',
        secretRef: vaultRef,
        externalState: { kind: 'known', value: 'ready' },
      })
      expect(connection.secretRef).toBe(vaultRef)
      expect(JSON.stringify(await ctx.db.query('connections').collect())).not.toContain('canary-secret')

      const pointerAuthority = {
        operation: 'provision' as const,
        snapshotRef: connection.action.snapshotRef,
        accountRef: account,
        actorPrincipalRef: actorRef,
        grantRef: root.grantRef,
        grantGeneration: root.generation,
        correlationRef: 'secret:provision',
        idempotencyRef: 'secret:provision',
        occurredAt: ++now,
      }
      const first = secretGeneration('sgn_55555555555555555555555555555555')
      await initializeConvexSecretPointer(ctx, pointerAuthority, {
        secretRef: vaultRef,
        activeGeneration: first,
      })
      const second = secretGeneration('sgn_66666666666666666666666666666666')
      const pointerStore = createConvexSecretPointerStore(ctx, {
        ...pointerAuthority,
        operation: 'rotate',
        correlationRef: 'secret:rotate',
        idempotencyRef: 'secret:rotate',
        occurredAt: ++now,
      })
      await pointerStore.advanceActive({
        secretRef: vaultRef,
        expectedActiveGeneration: first,
        expectedRevision: 1,
        newGeneration: second,
      })
      await expect(pointerStore.advanceActive({
        secretRef: vaultRef,
        expectedActiveGeneration: first,
        expectedRevision: 1,
        newGeneration: first,
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
      expect(await pointerStore.getActive(vaultRef)).toMatchObject({
        activeGeneration: second,
        revision: 2,
      })
    })
  })
})
