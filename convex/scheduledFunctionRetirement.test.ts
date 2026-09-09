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
