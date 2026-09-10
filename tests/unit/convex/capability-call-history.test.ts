import { describe, expect, it } from 'vitest'

import { listAgentCallSummariesHandler } from '../../../convex/lib/callLifecycle/callActions'

function row(overrides: Record<string, unknown> = {}) {
  return {
    callRef: 'call:one',
    principalId: 'principal:one',
    ownerId: 'owner:one',
    credentialId: 'credential:one',
    applicationRef: 'application:one',
    toolRef: 'tool:one',
    idempotencyKey: 'key:one',
    environment: 'sandbox',
    grantRef: 'grant:one',
    grantGeneration: 1,
    policyDigest: 'policy:one',
    grantExpiresAt: 10_000,
    inputDigest: 'input:one',
    requestDigest: 'request:one',
    inputJson: JSON.stringify({ private: true }),
    toolJson: JSON.stringify({ private: true }),
    state: 'completed',
    result: { kind: 'completed', receipt: { receiptRef: 'receipt:one' } },
    evidenceHash: 'evidence:one',
    createdAt: 10,
    updatedAt: 20,
    ...overrides,
  }
}

function context(rows: readonly Record<string, unknown>[], indexes: string[]) {
  const range = {
    eq: () => range,
  }
  const chain = {
    withIndex: (name: string, apply: (query: typeof range) => unknown) => {
      indexes.push(name)
      apply(range)
      return chain
    },
    order: () => chain,
    paginate: async () => ({ page: rows, isDone: false, continueCursor: 'cursor:two' }),
  }
  return { db: { query: () => chain } }
}

describe('capability Call history projection', () => {
  it('preserves Agent history across credentials with native pagination and private material removed', async () => {
    const indexes: string[] = []
    const result = await listAgentCallSummariesHandler(context([
      row(),
      row({ callRef: 'call:predecessor', credentialId: 'credential:predecessor' }),
      row({ callRef: 'call:other', principalId: 'principal:other' }),
      row({ callRef: 'call:foreign-account', ownerId: 'owner:other' }),
    ], indexes) as never, {
      principalId: 'principal:one',
      ownerId: 'owner:one',
      credentialId: 'credential:one',
      applicationRef: 'application:one',
      environment: 'sandbox',
      paginationOpts: { numItems: 20, cursor: null },
    })

    expect(indexes).toEqual(['by_principalId_and_createdAt'])
    expect(result).toMatchObject({ isDone: false, continueCursor: 'cursor:two' })
    expect(result.page).toEqual([expect.objectContaining({
      callRef: 'call:one',
      toolRef: 'tool:one',
      receiptRef: 'receipt:one',
      evidenceHash: 'evidence:one',
    }), expect.objectContaining({ callRef: 'call:predecessor' })])
    expect(JSON.stringify(result)).not.toContain('private')
    expect(JSON.stringify(result)).not.toContain('idempotencyKey')
  })

  it('uses the exact Agent-state index for filtered history', async () => {
    const indexes: string[] = []
    await listAgentCallSummariesHandler(context([row()], indexes) as never, {
      principalId: 'principal:one',
      ownerId: 'owner:one',
      credentialId: 'credential:one',
      applicationRef: 'application:one',
      environment: 'sandbox',
      state: 'completed',
      paginationOpts: { numItems: 5, cursor: null },
    })

    expect(indexes).toEqual(['by_principalId_and_state'])
  })
})
