import { describe, expect, it } from 'vitest'

import { listAgentInvocationSummariesHandler } from '../../../convex/lib/operationInvocations/invokeActions'

function row(overrides: Record<string, unknown> = {}) {
  return {
    invocationRef: 'invocation:one',
    principalId: 'principal:one',
    ownerId: 'owner:one',
    credentialId: 'credential:one',
    applicationRef: 'application:one',
    operationRef: 'operation:one',
    idempotencyKey: 'key:one',
    environment: 'sandbox',
    grantRef: 'grant:one',
    grantGeneration: 1,
    policyDigest: 'policy:one',
    grantExpiresAt: 10_000,
    inputDigest: 'input:one',
    requestDigest: 'request:one',
    inputJson: JSON.stringify({ private: true }),
    operationJson: JSON.stringify({ private: true }),
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

describe('capability operation history projection', () => {
  it('uses the credential-time index, preserves native pagination, and strips private material', async () => {
    const indexes: string[] = []
    const result = await listAgentInvocationSummariesHandler(context([
      row(),
      row({ invocationRef: 'invocation:other', principalId: 'principal:other' }),
    ], indexes) as never, {
      principalId: 'principal:one',
      credentialId: 'credential:one',
      applicationRef: 'application:one',
      environment: 'sandbox',
      paginationOpts: { numItems: 20, cursor: null },
    })

    expect(indexes).toEqual(['by_credentialId_and_createdAt'])
    expect(result).toMatchObject({ isDone: false, continueCursor: 'cursor:two' })
    expect(result.page).toEqual([expect.objectContaining({
      invocationRef: 'invocation:one',
      receiptRef: 'receipt:one',
      evidenceHash: 'evidence:one',
    })])
    expect(JSON.stringify(result)).not.toContain('private')
    expect(JSON.stringify(result)).not.toContain('idempotencyKey')
  })

  it('uses the exact credential-state index for filtered history', async () => {
    const indexes: string[] = []
    await listAgentInvocationSummariesHandler(context([row()], indexes) as never, {
      principalId: 'principal:one',
      credentialId: 'credential:one',
      applicationRef: 'application:one',
      environment: 'sandbox',
      state: 'completed',
      paginationOpts: { numItems: 5, cursor: null },
    })

    expect(indexes).toEqual(['by_credentialId_and_state'])
  })
})
