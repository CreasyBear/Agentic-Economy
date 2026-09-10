import { actor, origins } from './durable-action-execution-harness'
import schema from '../../../convex/schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
} from '@/modules/action-execution'
import { describe, expect, it } from 'vitest'

describe('durable Action Execution transact', () => {
  it('refuses non-monotonic rows while preserving exact duplicate idempotency', async () => {
    const state = createDevelopmentDurableState()
    const port = createDevelopmentDurablePort(state)
    const executionRef = 'dev:durable:monotonic'
    const row = {
      executionRef,
      executionVersion: 1,
      sourceRef: 'mock:source:monotonic',
      control: {
        executionRef,
        executionVersion: 1,
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
      commandDigest: canonicalDigest({ executionRef, version: 1 }),
      expectedExecutionVersion: null,
      row,
      history: {
        executionRef,
        commandId: 'mock:monotonic:create',
        commandDigest: canonicalDigest({ executionRef, version: 1 }),
        commandResult: 'applied' as const,
        kind: 'create',
      },
    }
    expect(await port.transact(create)).toEqual({ kind: 'applied', executionVersion: 1 })
    const downgrade = {
      ...create,
      commandId: 'mock:monotonic:downgrade',
      commandDigest: canonicalDigest({ executionRef, version: 1, downgrade: true }),
      expectedExecutionVersion: 1,
      history: {
        ...create.history,
        commandId: 'mock:monotonic:downgrade',
        commandDigest: canonicalDigest({ executionRef, version: 1, downgrade: true }),
        kind: 'downgrade',
      },
    }
    expect(await port.transact(downgrade)).toEqual({
      kind: 'refused',
      code: 'stale_execution_version',
    })
    const advance = {
      ...create,
      commandId: 'mock:monotonic:advance',
      commandDigest: canonicalDigest({ executionRef, version: 2 }),
      expectedExecutionVersion: 1,
      row: {
        ...row,
        executionVersion: 2,
        control: { ...row.control, executionVersion: 2 },
      },
      history: {
        ...create.history,
        commandId: 'mock:monotonic:advance',
        commandDigest: canonicalDigest({ executionRef, version: 2 }),
        kind: 'advance',
      },
    }
    expect(await port.transact(advance)).toEqual({ kind: 'applied', executionVersion: 2 })
    expect(await port.transact(advance)).toEqual({ kind: 'duplicate', executionVersion: 2 })
  })

  it('composes the module-owned control, attempt and history tables with bounded-read indexes', async () => { const exported = JSON.parse(String(Reflect.get(schema, 'export').call(schema))) as {
    tables: { tableName: string; indexes: { indexDescriptor: string }[] }[]
  }
  const indexes = Object.fromEntries(exported.tables.map((table) => [
    table.tableName,
    table.indexes.map(({ indexDescriptor }) => indexDescriptor),
  ]))
  expect(indexes.actionExecutionControls).toEqual(expect.arrayContaining([
    'by_executionRef', 'by_control_owner_principalRef_and_executionRef', 'by_sourceRef_and_executionRef',
  ]))
  expect(indexes.actionExecutionAttempts).toEqual(expect.arrayContaining([
    'by_executionRef_and_attemptNumber', 'by_executionRef_and_attemptRef',
    'by_idempotency_effectIdentity_and_attemptRef',
  ]))
  expect(indexes.actionExecutionHistory).toEqual(expect.arrayContaining([
    'by_executionRef_and_commandId', 'by_executionRef_and_executionVersion',
    'by_executionRef_and_effectGeneration',
  ])) })
})
