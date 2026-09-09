/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

describe('scheduledFunctionRetirement.cancelByName', () => {
  it('cancels only pending jobs whose name is listed and reports counts', async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      await ctx.scheduler.runAfter(60_000, internal.scheduledFunctionRetirement.cancelByName, { names: [] })
      await ctx.scheduler.runAfter(60_000, internal.scheduledFunctionRetirement.cancelByName, { names: [] })
    })
    const result = await t.mutation(internal.scheduledFunctionRetirement.cancelByName, {
      names: ['scheduledFunctionRetirement:cancelByName'],
    })
    expect(result.scanned).toBeGreaterThanOrEqual(2)
    expect(result.cancelled).toBe(2)
    expect(result.byName).toEqual({ 'scheduledFunctionRetirement:cancelByName': 2 })
    const states = await t.run(async (ctx) => {
      const rows = await ctx.db.system.query('_scheduled_functions').collect()
      return rows.map((row) => row.state.kind).sort()
    })
    expect(states.filter((state) => state === 'canceled')).toHaveLength(2)
  })

  it('is a no-op when nothing matches', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(internal.scheduledFunctionRetirement.cancelByName, { names: ['nothing:here'] })
    expect(result).toEqual({ scanned: 0, cancelled: 0, byName: {} })
  })
})

describe('scheduledFunctionRetirement.retireRegistrySources', () => {
  it('removes registry-sourced rows and third-party snapshots, keeps coinbase, and is idempotent', async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      await ctx.db.insert('marketExternalRegistryState', { key: 'registry', lastAttemptAt: 1, lastAttemptStatus: 'failed', lastError: 'x' })
      await ctx.db.insert('marketExternalRegistryState', { key: 'coinbase', lastAttemptAt: 2, lastAttemptStatus: 'complete', activeGeneration: 'coinbase-a' })
      await ctx.db.insert('marketExternalRegistryGenerations', { generation: 'registry-1', status: 'complete', startedAt: 1, ingestedCount: 1 })
      await ctx.db.insert('marketExternalRegistryGenerations', { generation: 'coinbase-a', source: 'coinbase', status: 'complete', startedAt: 2, ingestedCount: 1 })
      await ctx.db.insert('marketExternalSnapshots', { window: '30d', fetchedAt: 1, sourceTimestamp: 't', snapshotJson: '{}' })
    })
    const dry = await t.mutation(internal.scheduledFunctionRetirement.retireRegistrySources, { dryRun: true })
    expect(dry).toEqual({ entries: 0, generations: 1, stateRows: 1, snapshots: 1, continued: false })
    const first = await t.mutation(internal.scheduledFunctionRetirement.retireRegistrySources, {})
    expect(first).toEqual({ entries: 0, generations: 1, stateRows: 1, snapshots: 1, continued: false })
    const second = await t.mutation(internal.scheduledFunctionRetirement.retireRegistrySources, {})
    expect(second).toEqual({ entries: 0, generations: 0, stateRows: 0, snapshots: 0, continued: false })
    const remaining = await t.run(async (ctx) => ({
      state: (await ctx.db.query('marketExternalRegistryState').collect()).map((row) => row.key),
      generations: (await ctx.db.query('marketExternalRegistryGenerations').collect()).map((row) => row.generation),
      snapshots: (await ctx.db.query('marketExternalSnapshots').collect()).length,
    }))
    expect(remaining).toEqual({ state: ['coinbase'], generations: ['coinbase-a'], snapshots: 0 })
  })
})
