import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enqueueAction: vi.fn(async (..._args: unknown[]) => 'workpool:cleanup:first'),
}))

vi.mock('../../../convex/marketDispatchWorkpool', () => ({
  marketDispatchWorkpool: { enqueueAction: mocks.enqueueAction },
}))

import { enqueueCleanupWork } from '../../../convex/capabilityProviderConnectionLifecycle'
import { beginProviderConnectionRevocation, createProviderConnection } from '@/modules/capability-supply/provider-connection'

type Row = Record<string, unknown> & { _id: string }
type QueryBuilder = { eq: (field: string, value: unknown) => QueryBuilder }
type Query = {
  withIndex: (name: string, build: (query: QueryBuilder) => QueryBuilder) => Query
  unique: () => Promise<Row | null>
  take: (limit: number) => Promise<Row[]>
}

class MemoryDb {
  private readonly tables = new Map<string, Row[]>()

  seed(table: string, row: Row): void {
    this.tables.set(table, [...(this.tables.get(table) ?? []), row])
  }

  row(table: string, id: string): Row | undefined {
    return this.tables.get(table)?.find((candidate) => candidate._id === id)
  }

  query(table: string): Query {
    const filters: Array<(row: Row) => boolean> = []
    const query: Query = {
      withIndex: (_name, build) => {
        const builder: QueryBuilder = {
          eq: (field, value) => {
            filters.push((row) => row[field] === value)
            return builder
          },
        }
        build(builder)
        return query
      },
      unique: async () => {
        const matches = this.rows(table).filter((row) => filters.every((filter) => filter(row)))
        if (matches.length > 1) throw new Error('expected_unique')
        return matches[0] ?? null
      },
      take: async (limit) => this.rows(table).filter((row) => filters.every((filter) => filter(row))).slice(0, limit),
    }
    return query
  }

  async get(id: string): Promise<Row | null> {
    for (const rows of this.tables.values()) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row !== undefined) return row
    }
    return null
  }

  async replace(id: string, replacement: Row): Promise<void> {
    for (const [table, rows] of this.tables.entries()) {
      const index = rows.findIndex((row) => row._id === id)
      if (index !== -1) {
        rows[index] = { ...replacement, _id: id }
        this.tables.set(table, rows)
        return
      }
    }
    throw new Error('row_not_found')
  }

  async patch(id: string, changes: Record<string, unknown>): Promise<void> {
    for (const [table, rows] of this.tables.entries()) {
      const index = rows.findIndex((row) => row._id === id)
      if (index !== -1) {
      const row = rows[index]
      if (row === undefined) continue
      rows[index] = { ...row, ...changes, _id: row._id }
        this.tables.set(table, rows)
        return
      }
    }
    throw new Error('row_not_found')
  }

  private rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])]
  }
}

const createCommand = {
  commandId: 'command:create:cleanup-binding',
  connectionRef: 'connection:cleanup-binding',
  businessId: 'business:cleanup-binding',
  providerRef: 'provider:cleanup-binding',
  providerAccountRef: 'account:cleanup-binding',
  adapterId: 'http-json:v1',
  credentialRef: `sec_${'6'.repeat(32)}`,
  requestedScopes: ['profile:read'],
  grantedScopes: ['profile:read'],
  requestedResources: ['account:cleanup-binding'],
  grantedResources: ['account:cleanup-binding'],
  evidenceRefs: ['evidence:create'],
}

describe('provider cleanup enqueue binding', () => {
  it('persists attempt one with the returned Workpool identity in the revocation transaction', async () => {
    mocks.enqueueAction.mockClear()
    const created = createProviderConnection(createCommand, 1_000)
    if (created.kind !== 'applied') throw new Error('provider connection create failed')
    const revoked = beginProviderConnectionRevocation(created.connection, {
      commandId: 'command:revoke:cleanup-binding',
      expectedAuthorityGeneration: created.connection.authorityGeneration,
      expectedAuthorityDigest: created.connection.authorityDigest,
      evidenceRefs: ['evidence:revoke'],
    }, 2_000)
    if (revoked.kind !== 'applied') throw new Error('provider connection revoke failed')
    const canonicalConnectionRef = `con_${'c'.repeat(32)}`
    const accountRef = `acc_${'1'.repeat(32)}`
    const principalRef = `prn_${'2'.repeat(32)}`
    const ownershipRef = `own_${'3'.repeat(32)}`
    const revokeGrantRef = `grt_${'4'.repeat(32)}`
    const installGrantRef = `grt_${'5'.repeat(32)}`
    const secretRef = createCommand.credentialRef
    const connection = {
      ...revoked.connection,
      canonicalConnectionRef,
      owningAccountRef: accountRef,
      installedByPrincipalRef: principalRef,
      authorityGrantRef: revokeGrantRef,
      authorityGrantGeneration: 1,
      canonicalConnectionGeneration: 2,
      secretRef,
      _id: 'connection:cleanup-binding:row',
      _creationTime: 1_000,
    }
    const db = new MemoryDb()
    db.seed('capabilityProviderConnections', connection)
    db.seed('connections', {
      _id: 'canonical:connection:cleanup-binding',
      _creationTime: 1_000,
      connectionRef: canonicalConnectionRef,
      owningAccountRef: accountRef,
      installedByPrincipalRef: principalRef,
      providerNamespace: 'provider.test',
      secretRef,
      installedExternalState: { kind: 'known', value: 'ready' },
      externalState: { kind: 'known', value: 'revoked' },
      lifecycle: 'revoked',
      generation: 2,
      revision: 2,
      createdAt: 1_000,
      updatedAt: 2_000,
      installAction: {
        operation: 'install',
        snapshotRef: `das_${'7'.repeat(32)}`,
        actorPrincipalRef: principalRef,
        activeAccountRef: accountRef,
        grantRef: installGrantRef,
        grantGeneration: 1,
        correlationRef: 'provider-connection:install:test',
        idempotencyRef: 'provider-connection:install:test',
        resourceRefs: ['connection-provider:provider.test', `secret:${secretRef}`],
        occurredAt: 1_000,
      },
      action: {
        operation: 'revoke',
        snapshotRef: `das_${'8'.repeat(32)}`,
        actorPrincipalRef: principalRef,
        activeAccountRef: accountRef,
        grantRef: revokeGrantRef,
        grantGeneration: 1,
        correlationRef: 'provider-connection:revoke:test',
        idempotencyRef: 'provider-connection:revoke:test',
        resourceRefs: [`connection:${canonicalConnectionRef}`],
        occurredAt: 2_000,
      },
    })
    db.seed('principals', {
      _id: 'principal:cleanup-binding',
      principalRef,
      lifecycle: 'active',
    })
    db.seed('accounts', {
      _id: 'account:cleanup-binding',
      accountRef,
      lifecycle: 'active',
      currentOwnershipRef: ownershipRef,
      revision: 1,
    })
    db.seed('accountOwnerships', {
      _id: 'ownership:cleanup-binding',
      ownershipRef,
      accountRef,
      ownerPrincipalRef: principalRef,
      lifecycle: 'active',
    })
    db.seed('authorityDelegationGrants', {
      _id: 'grant:cleanup-binding',
      _creationTime: 1,
      grantRef: revokeGrantRef,
      accountRef,
      actorPrincipalRef: principalRef,
      subjectPrincipalRef: principalRef,
      scopes: ['connection:revoke'],
      resourceRefs: [`connection:${canonicalConnectionRef}`],
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt: 4_000_000_000_000,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: principalRef,
        activeAccountRef: accountRef,
        correlationRef: 'test:cleanup:grant',
        idempotencyRef: 'test:cleanup:grant',
      },
    })
    const scheduled = await enqueueCleanupWork({ db } as never, connection._id as never, connection, {
        connectionRef: connection.connectionRef,
        commandId: 'command:revoke:cleanup-binding',
        expectedAuthorityGeneration: connection.authorityGeneration,
        expectedAuthorityDigest: connection.authorityDigest,
        requestDigest: `sha256:${'b'.repeat(64)}`,
        cleanupAttempt: 1,
        workKind: 'cleanup',
      }, 2_000)

      expect(scheduled).toMatchObject({ cleanupAttempt: 1, cleanupWorkKind: 'cleanup' })
      expect(mocks.enqueueAction).toHaveBeenCalledTimes(1)
      const enqueue = mocks.enqueueAction.mock.calls[0]
      if (enqueue === undefined) throw new Error('cleanup enqueue missing')
      expect(enqueue[2]).toMatchObject({ cleanupAttempt: 1, workKind: 'cleanup' })
      expect(enqueue[3]).toMatchObject({ retry: false, context: { cleanupAttempt: 1, workKind: 'cleanup' } })

      const persisted = db.row('capabilityProviderConnections', connection._id)
      expect(persisted).toMatchObject({
        lifecycle: 'revocation_pending',
        cleanupAttempt: 1,
        cleanupWorkId: 'workpool:cleanup:first',
        cleanupWorkKind: 'cleanup',
        cleanupCommandId: enqueue[2] && typeof enqueue[2] === 'object' ? (enqueue[2] as Record<string, unknown>).commandId : undefined,
        cleanupCallbackGraceUntil: 12_000,
        authorityGeneration: connection.authorityGeneration,
        authorityDigest: connection.authorityDigest,
      })
      expect(persisted?.cleanupRequestDigest).toEqual((enqueue[2] as Record<string, unknown>).requestDigest)
  })
})
