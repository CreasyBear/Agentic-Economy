import { actor, origins } from './durable-action-invocation-harness'
import schema from '../../../convex/schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
} from '@/modules/action-invocation'
import { describe, expect, it } from 'vitest'

describe('durable Action Invocation transact', () => {
  it('refuses non-monotonic rows while preserving exact duplicate idempotency', async () => {
    const state = createDevelopmentDurableState()
    const port = createDevelopmentDurablePort(state)
    const invocationRef = 'dev:durable:monotonic'
    const row = {
      invocationRef,
      invocationVersion: 1,
      sourceRef: 'mock:source:monotonic',
      control: {
        invocationRef,
        invocationVersion: 1,
        origin: origins[1]!,
        owner: actor,
        action: { id: 'test.durable_write', contractVersion: 'test.durable_write:v1' },
        desired: { state: 'invoke' as const },
        freshness: { state: 'not_observed' as const },
        control: { state: 'authorized' as const, decidedAt: '2026-07-19T14:45:00.000Z' },
      },
      updatedAt: '2026-07-19T14:45:00.000Z',
    }
    const create = {
      commandId: 'mock:monotonic:create',
      commandDigest: canonicalDigest({ invocationRef, version: 1 }),
      expectedInvocationVersion: null,
      row,
      history: {
        invocationRef,
        commandId: 'mock:monotonic:create',
        commandDigest: canonicalDigest({ invocationRef, version: 1 }),
        commandResult: 'applied' as const,
        kind: 'create',
      },
    }
    expect(await port.transact(create)).toEqual({ kind: 'applied', invocationVersion: 1 })
    const downgrade = {
      ...create,
      commandId: 'mock:monotonic:downgrade',
      commandDigest: canonicalDigest({ invocationRef, version: 1, downgrade: true }),
      expectedInvocationVersion: 1,
      history: {
        ...create.history,
        commandId: 'mock:monotonic:downgrade',
        commandDigest: canonicalDigest({ invocationRef, version: 1, downgrade: true }),
        kind: 'downgrade',
      },
    }
    expect(await port.transact(downgrade)).toEqual({
      kind: 'refused',
      code: 'stale_invocation_version',
    })
    const advance = {
      ...create,
      commandId: 'mock:monotonic:advance',
      commandDigest: canonicalDigest({ invocationRef, version: 2 }),
      expectedInvocationVersion: 1,
      row: {
        ...row,
        invocationVersion: 2,
        control: { ...row.control, invocationVersion: 2 },
      },
      history: {
        ...create.history,
        commandId: 'mock:monotonic:advance',
        commandDigest: canonicalDigest({ invocationRef, version: 2 }),
        kind: 'advance',
      },
    }
    expect(await port.transact(advance)).toEqual({ kind: 'applied', invocationVersion: 2 })
    expect(await port.transact(advance)).toEqual({ kind: 'duplicate', invocationVersion: 2 })
  })

  it('composes the module-owned control, attempt and history tables with bounded-read indexes', async () => { const exported = JSON.parse(String(Reflect.get(schema, 'export').call(schema))) as {
    tables: { tableName: string; indexes: { indexDescriptor: string }[] }[]
  }
  const indexes = Object.fromEntries(exported.tables.map((table) => [
    table.tableName,
    table.indexes.map(({ indexDescriptor }) => indexDescriptor),
  ]))
  expect(indexes.actionInvocationControls).toEqual(expect.arrayContaining([
    'by_invocationRef', 'by_control_owner_principalRef_and_invocationRef', 'by_sourceRef_and_invocationRef',
  ]))
  expect(indexes.actionInvocationAttempts).toEqual(expect.arrayContaining([
    'by_invocationRef_and_attemptNumber', 'by_invocationRef_and_attemptRef',
    'by_idempotency_effectIdentity_and_attemptRef',
  ]))
  expect(indexes.actionInvocationHistory).toEqual(expect.arrayContaining([
    'by_invocationRef_and_commandId', 'by_invocationRef_and_invocationVersion',
    'by_invocationRef_and_effectGeneration',
  ])) })
})
