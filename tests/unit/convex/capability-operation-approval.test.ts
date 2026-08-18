import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enqueueAction: vi.fn(async () => 'workpool:approval'),
  readCurrentPublishedOperation: vi.fn(async (): Promise<unknown> => undefined),
}))

vi.mock('../../../convex/marketDispatchWorkpool', () => ({
  marketDispatchWorkpool: { enqueueAction: mocks.enqueueAction },
}))

vi.mock('../../../convex/capabilitySupplyOperations', () => ({
  readCurrentPublishedOperation: mocks.readCurrentPublishedOperation,
}))

import {
  decideOperationApproval,
  invoke,
  listPendingOperationApprovals,
  reserve,
} from '../../../convex/capabilityOperationInvocations'
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import { materializeRuntimePublishedOperation } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'

type Row = Record<string, unknown> & { _id: string }
type QueryBuilder = {
  eq: (field: string, value: unknown) => QueryBuilder
  gt: (field: string, value: number) => QueryBuilder
  lte: (field: string, value: number) => QueryBuilder
}
type Query = {
  withIndex: (name: string, build: (query: QueryBuilder) => QueryBuilder) => Query
  order: (direction: 'asc' | 'desc') => Query
  unique: () => Promise<Row | null>
  take: (limit: number) => Promise<Row[]>
}

class MemoryDb {
  private readonly tables = new Map<string, Row[]>()
  seed(table: string, row: Row): void {
    const rows = this.tables.get(table) ?? []
    rows.push(row)
    this.tables.set(table, rows)
  }

  row(table: string, id: string): Row | undefined {
    return this.tables.get(table)?.find((candidate) => candidate._id === id)
  }

  rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])]
  }

  query(table: string): Query {
    let filters: Array<(row: Row) => boolean> = []
    let direction: 'asc' | 'desc' = 'asc'
    const query: Query = {
      withIndex: (_name, build) => {
        const builder: QueryBuilder = {
          eq: (field, value) => {
            filters.push((row) => row[field] === value)
            return builder
          },
          gt: (field, value) => {
            filters.push((row) => typeof row[field] === 'number' && row[field] > value)
            return builder
          },
          lte: (field, value) => {
            filters.push((row) => typeof row[field] === 'number' && row[field] <= value)
            return builder
          },
        }
        build(builder)
        return query
      },
      order: (nextDirection) => {
        direction = nextDirection
        return query
      },
      unique: async () => {
        const matches = queryRows()
        if (matches.length > 1) throw new Error('expected_unique')
        return matches[0] ?? null
      },
      take: async (limit) => queryRows().slice(0, limit),
    }
    const queryRows = (): Row[] => {
      const matches = (this.tables.get(table) ?? []).filter((row) => filters.every((filter) => filter(row)))
      return matches.sort((left, right) => {
        const leftValue = typeof left.createdAt === 'number' ? left.createdAt : 0
        const rightValue = typeof right.createdAt === 'number' ? right.createdAt : 0
        return direction === 'desc' ? rightValue - leftValue : leftValue - rightValue
      })
    }
    return query
  }

  async patch(id: string, changes: Record<string, unknown>): Promise<void> {
    for (const rows of this.tables.values()) {
      const index = rows.findIndex((row) => row._id === id)
      const current = rows[index]
      if (current !== undefined) rows[index] = { ...current, ...changes }
    }
  }

  async insert(table: string, row: Record<string, unknown>): Promise<string> {
    const id = `${table}:${(this.tables.get(table) ?? []).length + 1}`
    this.seed(table, { ...row, _id: id })
    return id
  }
}

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>
const approvalHandler = (decideOperationApproval as unknown as { _handler: Handler })._handler
const listHandler = (listPendingOperationApprovals as unknown as { _handler: Handler })._handler
const invokeHandler = (invoke as unknown as { _handler: Handler })._handler
const reserveHandler = (reserve as unknown as { _handler: Handler })._handler

const evidence = buildDevelopmentPublishedOperationEvidence()
const operationRef = `operation:v1:${canonicalDigest({ fixture: 'approval' }).slice(7)}`
const operation = { ...evidence.operation, operationId: operationRef }
const descriptor = materializeRuntimePublishedOperation(operation)
mocks.readCurrentPublishedOperation.mockResolvedValue(operation)
const input = { symbol: 'BTC', convert: 'USD' }
const now = operation.readiness.observedAt + 1_000
const grantExpiresAt = now + 60_000
const owner = 'owner:approval'
const principal: AgentAccessPrincipal = {
  principalId: 'principal:approval',
  ownerId: owner,
  credentialId: 'credential:approval',
  applicationRef: 'application:approval',
  environment: 'sandbox',
  scopes: ['market_operations:invoke'],
  authorityMode: 'approve_each',
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now)
})
afterEach(() => {
  vi.restoreAllMocks()
  mocks.readCurrentPublishedOperation.mockResolvedValue(operation)
})

function grant(overrides: Record<string, unknown> = {}): Row {
  return {
    _id: 'agentAccessGrants:approval',
    grantRef: 'grant:approval',
    principalId: principal.principalId,
    ownerId: principal.ownerId,
    credentialId: principal.credentialId,
    applicationRef: principal.applicationRef,
    environment: principal.environment,
    lifecycle: 'active',
    authorityMode: 'approve_each',
    generation: 1,
    policyDigest: 'sha256:approval-policy',
    expiresAt: grantExpiresAt,
    operationAccess: 'all_admitted',
    policy: {
      rate: { maximumCallsPerMinute: 20, maximumCallsPerHour: 100 },
      budget: { maximumConcurrentInvocations: 1 },
    },
    ...overrides,
  }
}

function authorityRequest() {
  return {
    kind: 'approve_each' as const,
    operationRef,
    consequence: descriptor.consequenceClass,
    retryClass: descriptor.retryClass,
    maximumSpend: descriptor.price.kind === 'fixed' ? descriptor.price.amount : undefined,
    dataFields: [...descriptor.materialInputPointers],
  }
}

function needsAuthorityResult(invocationRef: string) {
  return {
    kind: 'needs_authority' as const,
    invocationRef,
    operationRef,
    authorityRequest: authorityRequest(),
  }
}
function invocation(overrides: Record<string, unknown> = {}): Row {
  const invocationRef = 'operation-invocation:v1:approval'
  return {
    _id: 'capabilityOperationInvocations:approval',
    invocationRef,
    principalId: principal.principalId,
    ownerId: principal.ownerId,
    credentialId: principal.credentialId,
    applicationRef: principal.applicationRef,
    operationRef,
    idempotencyKey: 'idempotency:approval',
    environment: 'sandbox',
    grantRef: 'grant:approval',
    grantGeneration: 1,
    policyDigest: 'sha256:approval-policy',
    grantExpiresAt,
    state: 'pending',
    dispatchState: 'pending',
    inputDigest: canonicalDigest(input),
    requestDigest: canonicalDigest({ operationRef, input }),
    operationJson: JSON.stringify(operation),
    inputJson: JSON.stringify(input),
    result: needsAuthorityResult(invocationRef),
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  }
}

function context(options: Readonly<{
  identity?: string | null
  invocation?: Row
  grant?: Row
  includeOperation?: boolean
}> = {}) {
  const db = new MemoryDb()
  if (options.grant !== undefined) db.seed('agentAccessGrants', options.grant)
  if (options.invocation !== undefined) db.seed('capabilityOperationInvocations', options.invocation)
  const identity = options.identity === undefined ? owner : options.identity
  const runQuery = vi.fn(async () => options.includeOperation === false ? null : { operationJson: JSON.stringify(operation) })
  return {
    db,
    auth: { getUserIdentity: async () => identity === null ? null : { subject: identity, tokenIdentifier: `token:${identity}` } },
    runQuery,
    runMutation: vi.fn(async () => ({ ok: true as const })),
  }
}

function functionPath(reference: unknown): string {
  return typeof reference === 'string' ? reference : getFunctionName(reference as never)
}

describe('capability operation approval Convex handlers', () => {
  it('lists only current owner pending authority with safe fields and newest-first ordering', async () => {
    const ctx = context({ grant: grant() })
    ctx.db.seed('capabilityOperationInvocations', invocation())
    ctx.db.seed('capabilityOperationInvocations', invocation({
      _id: 'capabilityOperationInvocations:older',
      invocationRef: 'operation-invocation:v1:older',
      createdAt: 90,
      updatedAt: 90,
      inputJson: JSON.stringify({ secret: 'must-not-project' }),
      result: needsAuthorityResult('operation-invocation:v1:older'),
    }))
    ctx.db.seed('capabilityOperationInvocations', invocation({
      _id: 'capabilityOperationInvocations:expired',
      invocationRef: 'operation-invocation:v1:expired',
      grantExpiresAt: 1_000_000,
      createdAt: 110,
      updatedAt: 110,
      result: needsAuthorityResult('operation-invocation:v1:expired'),
    }))
    ctx.db.seed('capabilityOperationInvocations', invocation({
      _id: 'capabilityOperationInvocations:other-owner',
      invocationRef: 'operation-invocation:v1:other-owner',
      ownerId: 'owner:other',
      createdAt: 120,
      updatedAt: 120,
      result: needsAuthorityResult('operation-invocation:v1:other-owner'),
    }))

    const result = await listHandler(ctx, {})

    expect(result).toEqual([
      expect.objectContaining({ invocationRef: 'operation-invocation:v1:approval', createdAt: 100 }),
      expect.objectContaining({ invocationRef: 'operation-invocation:v1:older', createdAt: 90 }),
    ])
    expect(JSON.stringify(result)).not.toContain('must-not-project')
    expect((result as Array<Record<string, unknown>>).every((item) => Object.keys(item).sort().join(',') === 'authorityRequest,createdAt,invocationRef,operationRef')).toBe(true)
  })

  it('approves the exact persisted row, dispatches once, and replays approval', async () => {
    mocks.enqueueAction.mockClear()
    const row = invocation()
    const ctx = context({ invocation: row, grant: grant() })

    const approved = await approvalHandler(ctx, { invocationRef: row.invocationRef, decision: 'approve' })
    const replayed = await approvalHandler(ctx, { invocationRef: row.invocationRef, decision: 'approve' })
    const stored = ctx.db.row('capabilityOperationInvocations', row._id)

    expect(approved).toEqual({ kind: 'approved', invocationRef: row.invocationRef })
    expect(replayed).toEqual({ kind: 'replayed', invocationRef: row.invocationRef })
    expect(mocks.enqueueAction).toHaveBeenCalledTimes(1)
    expect(stored).toMatchObject({ state: 'pending', dispatchState: 'enqueued', workId: 'workpool:approval', result: { kind: 'pending' } })
    expect(stored).toMatchObject({
      authority: {
        invocationRef: row.invocationRef,
        operationRef,
        acceptedBasis: { kind: 'approve_each' },
        reference: expect.not.stringContaining(owner),
      },
    })
  })

  it('does not enumerate a cross-owner invocation', async () => {
    mocks.enqueueAction.mockClear()
    const row = invocation()
    const ctx = context({ identity: 'owner:other', invocation: row, grant: grant() })

    await expect(approvalHandler(ctx, { invocationRef: row.invocationRef, decision: 'approve' })).resolves.toEqual({
      kind: 'refused',
      code: 'invocation_not_found',
    })
    expect(mocks.enqueueAction).not.toHaveBeenCalled()
  })

  it('refuses approval for a revoked or stale grant without dispatch', async () => {
    for (const grantOverrides of [
      { lifecycle: 'revoked' },
      { authorityMode: 'bounded_mandate' },
      { generation: 2 },
      { policyDigest: 'sha256:stale-policy' },
      { expiresAt: grantExpiresAt - 1 },
    ]) {
      mocks.enqueueAction.mockClear()
      const row = invocation()
      const ctx = context({ invocation: row, grant: grant(grantOverrides) })
      await expect(approvalHandler(ctx, { invocationRef: row.invocationRef, decision: 'approve' })).resolves.toEqual({
        kind: 'refused',
        code: 'grant_not_current',
      })
      expect(mocks.enqueueAction).not.toHaveBeenCalled()
    }
  })

  it('denies terminally, replays denial, and frees the pending authority slot', async () => {
    const row = invocation()
    const ctx = context({ invocation: row, grant: grant() })

    await expect(approvalHandler(ctx, { invocationRef: row.invocationRef, decision: 'deny' })).resolves.toEqual({
      kind: 'denied',
      invocationRef: row.invocationRef,
    })
    await expect(approvalHandler(ctx, { invocationRef: row.invocationRef, decision: 'deny' })).resolves.toEqual({
      kind: 'replayed',
      invocationRef: row.invocationRef,
    })
    expect(ctx.db.row('capabilityOperationInvocations', row._id)).toMatchObject({
      state: 'refused',
      dispatchState: 'failed',
      result: { kind: 'refused', code: 'authority_denied' },
    })
    const next = await reserveHandler(ctx, {
      invocationRef: 'operation-invocation:v1:next',
      principalId: principal.principalId,
      ownerId: principal.ownerId,
      credentialId: principal.credentialId,
      applicationRef: principal.applicationRef,
      environment: 'sandbox',
      grantRef: 'grant:approval',
      operationRef,
      idempotencyKey: 'idempotency:next',
      inputDigest: canonicalDigest({ next: true }),
      requestDigest: canonicalDigest({ operationRef, input: { next: true } }),
      grantGeneration: 1,
      policyDigest: 'sha256:approval-policy',
      grantExpiresAt,
      operationJson: JSON.stringify(operation),
      inputJson: JSON.stringify({ next: true }),
      now: 1_500_000,
    })
    expect(next).toMatchObject({ kind: 'reserved' })
  })
})

describe('bounded mandate invocation dispatch', () => {
  it('dispatches with the active grant standing mandate and grant expiry', async () => {
    const boundedPrincipal = { ...principal, authorityMode: 'bounded_mandate' as const }
    const grantRow = grant()
    let dispatchedAuthority: Record<string, unknown> | undefined
    const reservation = {
      principalId: boundedPrincipal.principalId,
      credentialId: boundedPrincipal.credentialId,
      applicationRef: boundedPrincipal.applicationRef,
      grantRef: grantRow.grantRef,
      grantGeneration: grantRow.generation,
      policyDigest: grantRow.policyDigest,
      grantExpiresAt: grantRow.expiresAt,
      environment: boundedPrincipal.environment,
      operationRef,
      idempotencyKey: 'idempotency:bounded',
      inputDigest: canonicalDigest(input),
      requestDigest: canonicalDigest({ operationRef, input }),
      invocationRef: 'operation-invocation:v1:bounded',
    }
    const ctx = {
      runMutation: vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
        switch (functionPath(reference)) {
          case 'capabilityOperationInvocations:admit':
            return { kind: 'accepted' }
          case 'capabilityOperationInvocations:reserve':
            return { kind: 'reserved', reservation }
          case 'capabilityOperationInvocations:dispatch':
            dispatchedAuthority = args.authority as Record<string, unknown>
            return { kind: 'enqueued', workId: 'workpool:bounded' }
          case 'capabilityOperationInvocations:record':
            return { kind: 'recorded' }
          default:
            throw new Error(`unexpected_mutation:${functionPath(reference)}`)
        }
      }),
      runQuery: vi.fn(async (reference: unknown) => {
        switch (functionPath(reference)) {
          case 'capabilitySupplyOperations:readCurrentPublishedOperationSnapshot':
            return { operationJson: JSON.stringify(operation) }
          case 'agentAccessPolicy:readActiveGrant':
            return grantRow
          default:
            throw new Error(`unexpected_query:${functionPath(reference)}`)
        }
      }),
    }
    const result = await invokeHandler(ctx, {
      operationKey: 'operation-invoke:bounded',
      correlationId: 'correlation:bounded',
      principal: boundedPrincipal,
      operationRef,
      input,
      idempotencyKey: 'idempotency:bounded',
    })

    expect(result).toMatchObject({ kind: 'pending', invocationRef: reservation.invocationRef, operationRef })
    expect(dispatchedAuthority).toMatchObject({
      acceptedBasis: {
        kind: 'standing_mandate_use',
        mandateRef: `agent-access-grant:${grantRow.grantRef}`,
        mandateGeneration: grantRow.generation,
      },
      expiresAt: new Date(grantRow.expiresAt as number).toISOString(),
    })
  })
})

describe('invocation admission after an empty pending replay', () => {
  it('terminalizes withdrawn, malformed, and unavailable operations after reservation', async () => {
    const scenarios = [
      { code: 'operation_not_current' as const, snapshot: null, snapshotError: false },
      { code: 'operation_unsupported' as const, snapshot: { operationJson: '{malformed' }, snapshotError: false },
      { code: 'source_unavailable' as const, snapshot: undefined, snapshotError: true },
    ]
    for (const scenario of scenarios) {
      const grantRow = grant()
      const reservation = {
        principalId: principal.principalId,
        credentialId: principal.credentialId,
        applicationRef: principal.applicationRef,
        grantRef: grantRow.grantRef,
        grantGeneration: grantRow.generation,
        policyDigest: grantRow.policyDigest,
        grantExpiresAt: grantRow.expiresAt,
        environment: principal.environment,
        operationRef,
        idempotencyKey: `idempotency:empty-replay:${scenario.code}`,
        inputDigest: canonicalDigest(input),
        requestDigest: canonicalDigest({ operationRef, input }),
        invocationRef: `operation-invocation:v1:empty-replay:${scenario.code}`,
      }
      let recorded: Record<string, unknown> | undefined
      let abandoned: Record<string, unknown> | undefined
      const runMutation = vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
        switch (functionPath(reference)) {
          case 'capabilityOperationInvocations:admit':
            return { kind: 'accepted' }
          case 'capabilityOperationInvocations:reserve':
            return { kind: 'replayed', reservation }
          case 'capabilityOperationInvocations:abandon':
            abandoned = args
            return { kind: 'abandoned' }
          case 'capabilityOperationInvocations:record':
            recorded = args
            return { kind: 'recorded' }
          case 'capabilityOperationInvocations:dispatch':
            throw new Error('dispatch_must_not_run')
          default:
            throw new Error(`unexpected_mutation:${functionPath(reference)}`)
        }
      })
      const runQuery = vi.fn(async (reference: unknown) => {
        switch (functionPath(reference)) {
          case 'capabilitySupplyOperations:readCurrentPublishedOperationSnapshot':
            if (scenario.snapshotError) throw new Error('source_unavailable')
            return scenario.snapshot
          case 'agentAccessPolicy:readActiveGrant':
            return grantRow
          case 'capabilityOperationInvocations:readReplay':
            return { operationRef, state: 'pending' }
          default:
            throw new Error(`unexpected_query:${functionPath(reference)}`)
        }
      })
      const result = await invokeHandler({ runMutation, runQuery }, {
        operationKey: `operation-invoke:empty-replay:${scenario.code}`,
        correlationId: `correlation:empty-replay:${scenario.code}`,
        principal,
        operationRef,
        input,
        idempotencyKey: reservation.idempotencyKey,
      })
      expect(result).toMatchObject({ kind: 'refused', operationRef, code: scenario.code })
      expect(abandoned).toEqual({ ...reservation, ownerId: principal.ownerId })
      expect(recorded).toBeUndefined()
    }
  })
})