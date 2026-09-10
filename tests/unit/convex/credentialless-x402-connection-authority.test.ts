import { beforeEach, describe, expect, it } from 'vitest'

import { createX402ProviderConnection } from '@/modules/capability-supply/provider-connection'
import { readCurrentProviderConnectionAuthorityHandler } from '../../../convex/lib/callLifecycle/callActions'

type Row = Record<string, unknown> & { _id: string }

const NOW = 2_000_000
const RESOURCE_URL = 'https://seller.example/x402/normalize'

function connectionRow() {
  const created = createX402ProviderConnection({
    commandId: 'command:test:x402-connection',
    connectionRef: 'connection:x402:test-seller',
    owningAccountRef: 'account:test-seller',
    installedByPrincipalRef: 'principal:test-seller',
    authorityGrantRef: 'grant:test-seller',
    authorityGrantGeneration: 1,
    businessId: 'business:test-seller',
    providerRef: 'provider:x402:seller.example',
    providerAccountRef: `x402:${RESOURCE_URL}`,
    resourceUrl: RESOURCE_URL,
    method: 'POST',
    payee: '0x1111111111111111111111111111111111111111',
    evidenceRefs: ['evidence:test-seller'],
  }, NOW - 1_000)
  if (created.kind !== 'applied') throw new Error('credentialless_x402_fixture_invalid')
  return { _id: 'capabilityProviderConnections:1', ...created.connection }
}

class MemoryDb {
  constructor(readonly row: Row | null) {}

  query(table: string) {
    if (table !== 'capabilityProviderConnections') throw new Error(`unexpected_table:${table}`)
    let connectionRef: unknown
    const query = {
      withIndex: (_index: string, build: (builder: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
        const builder = {
          eq: (field: string, value: unknown) => {
            if (field === 'connectionRef') connectionRef = value
            return builder
          },
        }
        build(builder)
        return query
      },
      unique: async () => this.row?.connectionRef === connectionRef ? this.row : null,
    }
    return query
  }
}

function expected(row: Row, overrides: Record<string, unknown> = {}) {
  return {
    connectionRef: String(row.connectionRef),
    providerRef: String(row.providerRef),
    adapterId: String(row.adapterId),
    authorityGeneration: Number(row.authorityGeneration),
    authorityDigest: String(row.authorityDigest),
    resourceUrl: RESOURCE_URL,
    now: NOW,
    ...overrides,
  }
}

async function read(row: Row | null, overrides: Record<string, unknown> = {}) {
  const db = new MemoryDb(row)
  return await readCurrentProviderConnectionAuthorityHandler(
    { db } as never,
    expected(row ?? connectionRow(), overrides),
  )
}

describe('credentialless x402 current connection authority', () => {
  let row: Row

  beforeEach(() => {
    row = connectionRow()
  })

  it('recognizes the exact active credentialless x402 connection without a provider approval', async () => {
    await expect(read(row)).resolves.toEqual({ kind: 'credentialless_x402' })
  })

  it.each([
    ['missing connection', () => null, {}],
    ['inactive connection', (current: Row) => ({ ...current, lifecycle: 'revoked', revokedAt: NOW - 100 }), {}],
    ['expired connection', (current: Row) => ({ ...current, expiresAt: NOW }), {}],
    ['wrong provider', (current: Row) => current, { providerRef: 'provider:x402:attacker.example' }],
    ['wrong adapter', (current: Row) => current, { adapterId: 'http-json:v1' }],
    ['rotated generation', (current: Row) => current, { authorityGeneration: 2 }],
    ['rotated digest', (current: Row) => current, { authorityDigest: `sha256:${'f'.repeat(64)}` }],
    ['wrong resource', (current: Row) => current, { resourceUrl: 'https://seller.example/x402/other' }],
  ] as const)('fails closed for %s', async (_label, mutate, overrides) => {
    const candidate = mutate(row)
    await expect(read(candidate, overrides)).resolves.toBeNull()
  })
})
