import { expect, it, vi } from 'vitest'
import * as networkServer from '@/modules/network-guard/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createCurrentToolQuote } from '@/modules/capability-supply/current-tool'
import { internal } from '../../convex/_generated/api'
import { readManagedX402InspectionTarget, readCurrentPublishedTool } from '../../convex/capabilitySupplyCurrentTool'
import { convexTestWithMarketComponents } from '../helpers/convex-fixtures'
import { admitDiscoveredToolFixture } from '../helpers/discovered-tool-fixture'

it('inspects admitted supply without readiness or examples and retains Quote identity after observation', async () => {
  const backend = convexTestWithMarketComponents()
  const { toolRef } = await admitDiscoveredToolFixture(backend, { withoutExample: true })
  expect(await backend.run(async (ctx) => (await readCurrentPublishedTool(ctx, toolRef)) === undefined)).toBe(true)
  const snapshot = await backend.query(internal.capabilitySupplyCurrentTool.readManagedX402InspectionSnapshot, { toolRef })
  expect(snapshot).not.toBeNull()
  if (snapshot === null) throw new Error('inspection_target_missing')
  const target = JSON.parse(snapshot.targetJson) as { targetDigest: string }
  const command = { toolRef, targetDigest: target.targetDigest, requirementDigest: canonicalDigest('selected-402'), observedAt: Date.now() }
  expect(await backend.mutation(internal.capabilitySupplyCurrentTool.recordManagedX402Inspection, command)).toBe(true)
  const digest = () => backend.run(async (ctx) => {
    const tool = await readCurrentPublishedTool(ctx, toolRef)
    return tool === undefined ? null : createCurrentToolQuote({ toolRef, tool }).currentDigest
  })
  const first = await digest()
  expect(first).toMatch(/^sha256:/)
  expect(await backend.mutation(internal.capabilitySupplyCurrentTool.recordManagedX402Inspection, { ...command, observedAt: Date.now() })).toBe(true)
  expect(await digest()).toBe(first)
  expect(await backend.mutation(internal.capabilitySupplyCurrentTool.recordManagedX402Inspection, { ...command, targetDigest: canonicalDigest('changed') })).toBe(false)
  const scheduled = await backend.run(async ctx => (await ctx.db.system.query('_scheduled_functions').take(100)).map(task => task.name))
  expect(scheduled.some(name => name.includes('capabilitySupplyReadiness:probe'))).toBe(false)
  const send = vi.spyOn(networkServer, 'sendGuardedHttpRequest').mockRejectedValue(new Error('unexpected_speculative_probe'))
  try {
    // Simulate an old queued background job surviving the deployment.
    await backend.run(async ctx => { await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
      publicationRef: JSON.parse(snapshot.targetJson).publicationRef, expectedRevision: JSON.parse(snapshot.targetJson).revision,
    }) })
    await backend.finishAllScheduledFunctions(() => undefined)
    expect(send).not.toHaveBeenCalled()
    expect(await digest()).toBe(first)
  } finally { send.mockRestore() }

  await backend.run(async (ctx) => {
    const publication = await ctx.db.query('capabilityPublications').withIndex('by_toolRef_and_disposition', q => q.eq('toolRef', toolRef).eq('disposition', 'current')).unique()
    if (publication === null) throw new Error('publication_missing')
    await ctx.db.patch(publication._id, { disposition: 'withdrawn' })
  })
  expect(await backend.run(async ctx => (await readManagedX402InspectionTarget(ctx, toolRef)) === undefined)).toBe(true)
  expect(await backend.mutation(internal.capabilitySupplyCurrentTool.recordManagedX402Inspection, command)).toBe(false)
})
