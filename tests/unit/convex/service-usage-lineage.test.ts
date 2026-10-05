/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import schema from '../../../convex/schema'
import { internal } from '../../../convex/_generated/api'
import { buildDevelopmentPublishedToolEvidence } from '../capability-supply/fixtures/development-published-tool-evidence'
import { readMeasurementEvidence } from '../../../convex/lib/capabilityExecution/serviceUsage/lineage'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { measurementSupport, supportDigest } from '@/modules/capability-execution/service-usage-evidence'
import { readProjectedSupport } from '../../../convex/lib/capabilityExecution/serviceUsage/projectedSupport'
import { callExportSourceDigest } from '../../../convex/lib/capabilityExecution/callProjection/exportSnapshot'

const modules = Object.fromEntries(Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}')).map(([path, load]) => [path.replace('../../../convex/', './'), load]))
const start = Date.UTC(2026, 8, 2), hash = `sha256:${'a'.repeat(64)}`
afterEach(() => vi.useRealTimers())
async function fixture() {
  vi.useFakeTimers(); vi.setSystemTime(start + 1000)
  const backend = convexTest(schema, modules), tool = buildDevelopmentPublishedToolEvidence().tool
  const callRef = `operation-invocation:v1:${'a'.repeat(64)}`
  const result = { kind: 'completed' as const, callRef, toolRef: tool.operationId, output: {}, evidenceHash: hash }
  const id = await backend.run(async ctx => await ctx.db.insert('capabilityCalls', {
    callRef, ownerId: 'account:one', principalId: 'principal:one', credentialId: 'credential:one', applicationRef: 'application:one',
    toolRef: tool.operationId, idempotencyKey: 'key:one', environment: 'sandbox', grantRef: 'grant:one', grantGeneration: 1,
    policyDigest: hash, grantExpiresAt: start + 10000, inputJson: '{}', inputDigest: hash, requestDigest: hash,
    toolJson: JSON.stringify(tool), state: 'completed', dispatchState: 'completed', result, evidenceHash: hash,
    usage: { usageRef: 'usage:one', observedAt: start, chargeState: 'free_tier', amount: { currency: 'AUD', units: '0', exponent: 6 }, priceDigest: tool.priceDigest },
    createdAt: start, updatedAt: start + 1000,
  }))
  const rebuild = () => backend.mutation(internal.capabilityCallProjections.rebuild, { paginationOpts: { numItems: 100, cursor: null } })
  const evidence = (observed = Date.now(), effective = Date.now()) => backend.run(async ctx => {
    const row = await ctx.db.query('capabilityServiceUsageRecords').unique()
    if (!row) throw new Error('measurement_missing')
    return await readMeasurementEvidence(ctx, row, observed, effective)
  })
  await rebuild()
  return { backend, id, result, rebuild, evidence }
}
describe('append-only canonical measurement support', () => {
  it('keeps the existing bounded output node ceiling when composing provider-source fingerprints', async () => {
    const f = await fixture(), output = Array(9999).fill(null)
    await f.backend.run(async ctx => await ctx.db.patch(f.id,{result:{...f.result,output}}))
    const projection = await f.backend.run(async ctx => (await ctx.db.query('capabilityCallProjections').unique())!)
    expect(await f.backend.run(async ctx => await readProjectedSupport(ctx,projection))).toMatchObject({verified:true,providerUnitObservation:null})
  })
  it('preserves one original through loss, replay and restoration with equal timestamps', async () => {
    const f = await fixture()
    vi.setSystemTime(start + 2000)
    await f.backend.run(async ctx => await ctx.db.patch(f.id, { result: undefined, state: 'reconciliation_required', updatedAt: start + 2000 }))
    await f.rebuild(); await f.rebuild()
    expect(await f.evidence()).toMatchObject({ kind: 'available', originalQuantityUnits: '1', currentQuantityUnits: null, revisions: [{ revision: 1, quantityUnits: null }] })
    expect(await f.evidence(start + 1500, start + 3000)).toMatchObject({ currentQuantityUnits: '1', revisions: [] })
    expect(await f.evidence(start + 3000, start + 1500)).toMatchObject({ currentQuantityUnits: '1', revisions: [] })
    expect(await f.evidence(start, start)).toEqual({ kind: 'not_observed' })
    expect(await f.backend.run(async ctx => await ctx.db.query('capabilityCallProjections').unique())).toMatchObject({ deliveredRequestUnits: '1', currentDeliveredRequestUnits: null })
    await f.backend.run(async ctx => await ctx.db.patch(f.id, { result: f.result, state: 'completed', updatedAt: start + 2000 }))
    await f.rebuild(); await f.rebuild()
    const restored = await f.evidence()
    expect(restored).toMatchObject({ currentQuantityUnits: '1', revisions: [{ revision: 1, quantityUnits: null }, { revision: 2, quantityUnits: '1' }] })
    if (restored.kind !== 'available') throw new Error('evidence_missing')
    expect(restored.revisions[1]?.previousRevisionRef).toBe(restored.revisions[0]?.revisionRef)
    expect(await f.backend.run(async ctx => await ctx.db.query('capabilityServiceUsageRecords').collect())).toHaveLength(1)
  })
  it('changes evidence support without multiplying delivery and refuses cross-account canonical drift', async () => {
    const f = await fixture()
    vi.setSystemTime(start + 2000)
    await f.backend.run(async ctx => await ctx.db.patch(f.id, { result: {...f.result, evidenceHash: `sha256:${'b'.repeat(64)}`}, evidenceHash: `sha256:${'b'.repeat(64)}`, updatedAt: start + 2000 }))
    await f.rebuild(); await f.rebuild()
    expect(await f.evidence()).toMatchObject({ currentQuantityUnits: '1', revisions: [{ revision: 1, quantityUnits: '1' }] })
    await f.backend.run(async ctx => await ctx.db.patch(f.id, { ownerId: 'account:other', result: undefined }))
    await expect(f.rebuild()).rejects.toThrow('service_usage_identity_conflict')
    expect(await f.backend.run(async ctx => await ctx.db.query('capabilityServiceUsageRevisions').collect())).toHaveLength(1)
  })
  it('fails closed on a changed canonical source that has not been projected yet', async () => {
    const f = await fixture()
    const scope = {accountRef: 'account:one', periodStartAt: start, periodEndAt: start + 86400_000, snapshotAt: start + 10000}
    const before = await f.backend.run(async ctx => await callExportSourceDigest(ctx, scope))
    await f.backend.run(async ctx => await ctx.db.patch(f.id, { result: undefined }))
    const read = await f.backend.run(async ctx => {
      const usage = await ctx.db.query('capabilityServiceUsageRecords').unique(), call = await ctx.db.get(f.id)
      if (!usage || !call) throw new Error('source_missing')
      return await readMeasurementEvidence(ctx, usage, Date.now(), Date.now(), call)
    })
    expect(read).toEqual({ kind: 'unavailable', code: 'measurement_canonical_support_changed' })
    const projected = await f.backend.run(async ctx => { const projection = await ctx.db.query('capabilityCallProjections').unique(); if (!projection) throw new Error('projection_missing'); return await readProjectedSupport(ctx, projection) })
    expect(projected).toMatchObject({verified: false, quantityUnits: null})
    expect(await f.backend.run(async ctx => await callExportSourceDigest(ctx, scope))).not.toBe(before)
  })
  it('changes the export fingerprint when root identity drifts after a row was read', async () => {
    const f = await fixture()
    const scope = {accountRef: 'account:one', periodStartAt: start, periodEndAt: start + 86400_000, snapshotAt: start + 10000}
    const before = await f.backend.run(async ctx => await callExportSourceDigest(ctx, scope))
    await f.backend.run(async ctx => { const root = await ctx.db.query('capabilityServiceUsageRecords').unique(); if (!root) throw new Error('root_missing'); await ctx.db.patch(root._id, {credentialRef: 'credential:drift'}) })
    const support = await f.backend.run(async ctx => { const row = await ctx.db.query('capabilityCallProjections').unique(); if (!row) throw new Error('row_missing'); return await readProjectedSupport(ctx, row) })
    expect(support).toMatchObject({verified: false, quantityUnits: null})
    expect(await f.backend.run(async ctx => await callExportSourceDigest(ctx, scope))).not.toBe(before)
  })
  it('treats conflicting hashes as unknown and never admits a conflicting first measurement', async () => {
    const f = await fixture()
    vi.setSystemTime(start + 2000)
    await f.backend.run(async ctx => await ctx.db.patch(f.id, { evidenceHash: `sha256:${'b'.repeat(64)}`, updatedAt: start + 2000 }))
    await f.rebuild()
    expect(await f.evidence()).toMatchObject({currentQuantityUnits: null, revisions: [{support: {evidenceConflict: true}, quantityUnits: null}]})
    await f.backend.run(async ctx => {
      for (const table of ['capabilityServiceUsageRecords', 'capabilityServiceUsageRevisions', 'capabilityCallProjections'] as const) for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id)
    })
    await f.rebuild()
    expect(await f.backend.run(async ctx => await ctx.db.query('capabilityServiceUsageRecords').collect())).toEqual([])
  })
  it('rejects a valid hash chain stored under another Account or Call', async () => {
    const f = await fixture()
    await f.backend.run(async ctx => {
      const root = await ctx.db.query('capabilityServiceUsageRecords').unique()
      if (!root) throw new Error('root_missing')
      const support = measurementSupport({state: 'cancelled'}), sourceDigest = supportDigest(support)
      await ctx.db.insert('capabilityServiceUsageRevisions', {usageRef: root.usageRef, accountRef: 'account:other', callRef: root.callRef,
        previousRevisionRef: root.usageRef, revisionRef: `service-usage-revision:${canonicalDigest({usageRef: root.usageRef, previousRevisionRef: root.usageRef, sourceDigest})}`,
        revision: 1, sourceDigest, support, quantityUnits: null, effectiveAt: root.occurredAt, observedAt: Date.now(), source: 'canonical_call_support'})
    })
    await expect(f.evidence()).rejects.toThrow('measurement_lineage_identity_conflict')
  })
})
