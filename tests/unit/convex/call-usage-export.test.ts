/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'

afterEach(() => vi.useRealTimers())
const query = anyApi.capabilityCallProjections?.readOwnerCallExportPage
if (query === undefined) throw new Error('export query missing')
const begin = anyApi.capabilityCallProjections?.beginOwnerCallExport
if (begin === undefined) throw new Error('export admission missing')
const exportRef = 'call-usage-export:00000000-0000-4000-8000-000000000001'
const period = { periodStartAt: Date.UTC(2026, 8, 1), periodEndAt: Date.UTC(2026, 9, 1) }
function row(accountRef: string, index: number) {
  return { callRef: `call:export:${index}`, accountRef, principalRef: 'agent:export', credentialRef: 'credential:export',
    applicationRef: 'application:export', toolRef: 'tool:export', providerRef: 'provider:export', toolLabel: '=untrusted()',
    state: 'completed' as const, deliveryState: 'delivered' as const, paymentState: 'settled' as const,
    audAmountUnits: '9007199254740993001', deliveredRequestUnits: '1', serviceUsageRef: `usage:${index}`,
    latencyMs: 5, createdAt: period.periodStartAt + index, updatedAt: period.periodStartAt + index }
}

describe('full-period Call export source', () => {
  it('audits requested access once per immutable scope without payloads or simulated completion', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = await publishedBusinessOwner(backend, 'usage-export-audit')
    const args = { ...period, status: 'all', exportRef }
    await expect(owner.owner.query(query, { ...args, snapshotAt: Date.now() - 1, paginationOpts: { numItems: 50, cursor: null } }))
      .rejects.toThrow('call_export_admission_invalid')
    const first = await owner.owner.mutation(begin, args)
    expect(await owner.owner.mutation(begin, args)).toEqual(first)
    const audits = await backend.run(async (ctx) => await ctx.db.query('auditEvents')
      .withIndex('by_eventType_and_createdAt', (index) => index.eq('eventType', 'billing.call_usage_export_requested')).collect())
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ activeAccountRef: owner.canonicalAccountRef, actorKind: 'owner', afterState: 'requested' })
    expect(audits[0]?.redactedPayloadJson).not.toContain('inputJson')
    expect(audits[0]?.redactedPayloadJson).not.toContain('credential')
    await expect(owner.owner.mutation(begin, { ...args, status: 'completed' })).rejects.toThrow('call_export_scope_conflict')
    await expect(owner.owner.query(query, { ...args, status: 'completed', snapshotAt: first.snapshotAt, paginationOpts: { numItems: 50, cursor: null } }))
      .rejects.toThrow('call_export_admission_invalid')
    await expect(owner.owner.query(query, { ...args, snapshotAt: first.snapshotAt - 1, paginationOpts: { numItems: 50, cursor: null } }))
      .rejects.toThrow('call_export_admission_invalid')
    await expect(backend.mutation(begin, args)).rejects.toThrow('call_history_authentication_required')
  })
  it('pages every owner row with exact Agent/status/range, including beyond the loaded first page', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = await publishedBusinessOwner(backend, 'usage-export')
    await backend.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) await ctx.db.insert('capabilityCallProjections', row(owner.canonicalAccountRef, index))
      await ctx.db.insert('capabilityCallProjections', row('account:foreign', 200))
      await ctx.db.insert('capabilityCallProjections', { ...row(owner.canonicalAccountRef, 201), principalRef: 'agent:other' })
      await ctx.db.insert('capabilityCallProjections', { ...row(owner.canonicalAccountRef, 202), createdAt: period.periodEndAt })
      await ctx.db.insert('capabilityCallProjections', { ...row(owner.canonicalAccountRef, 203), state: 'refused', deliveryState: 'not_delivered', paymentState: 'released' })
    })
    // Native creation times may advance fractionally during a fast fixture batch.
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 1000)
    const scope = { ...period, exportRef, principalRef: 'agent:export', status: 'completed' }
    const { snapshotAt } = await owner.owner.mutation(begin, scope)
    const callRefs: string[] = []
    let cursor: string | null = null
    let done = false
    while (!done) {
      const page: { page: Array<{ callRef: string }>; isDone: boolean; continueCursor: string } = await owner.owner.query(query, { ...scope, snapshotAt,
        paginationOpts: { numItems: 50, cursor } })
      callRefs.push(...page.page.map((item: { callRef: string }) => item.callRef))
      done = page.isDone
      cursor = page.continueCursor
    }
    expect(callRefs).toHaveLength(101)
    expect(new Set(callRefs).size).toBe(101)
    expect(callRefs).not.toContain('call:export:200')
    await expect(backend.query(query, { ...period, exportRef, snapshotAt, status: 'all', paginationOpts: { numItems: 50, cursor: null } }))
      .rejects.toThrow('call_history_authentication_required')
    await expect(owner.owner.query(query, { ...period, exportRef, snapshotAt, status: 'all', accountRef: 'account:foreign',
      paginationOpts: { numItems: 50, cursor: null } })).rejects.toThrow()
  })

  it('fails on post-cutoff corrections and excludes post-cutoff historical insertions', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = await publishedBusinessOwner(backend, 'usage-export-correction')
    const id = await backend.run(async (ctx) => await ctx.db.insert('capabilityCallProjections', row(owner.canonicalAccountRef, 0)))
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 1000)
    const scope = { ...period, exportRef, status: 'all' }
    const { snapshotAt } = await owner.owner.mutation(begin, scope)
    vi.setSystemTime(snapshotAt + 1000)
    await backend.run(async (ctx) => await ctx.db.insert('capabilityCallProjections', row(owner.canonicalAccountRef, 1)))
    const args = { ...scope, snapshotAt, paginationOpts: { numItems: 50, cursor: null } }
    const before = await owner.owner.query(query, args)
    expect(before.page).toHaveLength(1)
    await backend.run(async (ctx) => await ctx.db.patch(id, { paymentState: 'released', observedAt: snapshotAt + 1000 }))
    await expect(owner.owner.query(query, args)).rejects.toThrow('call_export_source_changed')
  })
  it.each(['status_change', 'move_before_cursor', 'move_out_of_period', 'delete', 'delete_and_rebuild'])('rejects interleaved %s even when the changed row is never returned', async change => {
    const backend = convexTestWithMarketComponents()
    const owner = await publishedBusinessOwner(backend, `export-race-${change}`)
    const ids = await backend.run(async ctx => {
      const refs = []
      for (let index=0; index<3; index+=1) refs.push(await ctx.db.insert('capabilityCallProjections',row(owner.canonicalAccountRef,index)))
      return refs
    })
    vi.useFakeTimers(); vi.setSystemTime(Date.now()+1000)
    const scope = {...period,exportRef,status:'completed'}
    const {snapshotAt}=await owner.owner.mutation(begin,scope)
    const first=await owner.owner.query(query,{...scope,snapshotAt,paginationOpts:{numItems:1,cursor:null}})
    expect(first.page.map((item: {callRef:string})=>item.callRef)).toEqual(['call:export:2'])
    vi.setSystemTime(snapshotAt+1000)
    await backend.run(async ctx=> {
      const target=ids[0]; if (!target) throw new Error('fixture missing')
      if (change==='status_change') await ctx.db.patch(target,{state:'refused',observedAt:snapshotAt+1000})
      if (change==='move_before_cursor') await ctx.db.patch(target,{createdAt:period.periodStartAt+20,observedAt:snapshotAt+1000})
      if (change==='move_out_of_period') await ctx.db.patch(target,{createdAt:period.periodEndAt+1,observedAt:snapshotAt+1000})
      if (change==='delete'||change==='delete_and_rebuild') await ctx.db.delete(target)
      if (change==='delete_and_rebuild') await ctx.db.insert('capabilityCallProjections',row(owner.canonicalAccountRef,0))
    })
    await expect(owner.owner.query(query,{...scope,snapshotAt,paginationOpts:{numItems:50,cursor:first.continueCursor}})).rejects.toThrow('call_export_source_changed')
  })
  it('excludes equal-created-time later insertions and rechecks owner authority on later pages',async()=>{
    const backend=convexTestWithMarketComponents()
    const owner=await publishedBusinessOwner(backend,'export-equal-time')
    await backend.run(async ctx=>{for(let i=0;i<3;i+=1) await ctx.db.insert('capabilityCallProjections',{...row(owner.canonicalAccountRef,i),createdAt:period.periodStartAt})})
    vi.useFakeTimers();vi.setSystemTime(Date.now()+1000)
    const scope={...period,exportRef,status:'all'}
    const {snapshotAt}=await owner.owner.mutation(begin,scope)
    const first=await owner.owner.query(query,{...scope,snapshotAt,paginationOpts:{numItems:1,cursor:null}})
    vi.setSystemTime(snapshotAt+1000)
    await backend.run(async ctx=>await ctx.db.insert('capabilityCallProjections',{...row(owner.canonicalAccountRef,99),createdAt:period.periodStartAt}))
    const last=await owner.owner.query(query,{...scope,snapshotAt,paginationOpts:{numItems:50,cursor:first.continueCursor}})
    expect([...first.page,...last.page].map((item:{callRef:string})=>item.callRef)).toHaveLength(3)
    await backend.run(async ctx=>{for(const ownership of await ctx.db.query('accountOwnerships').collect()) if(ownership.accountRef===owner.canonicalAccountRef) await ctx.db.delete(ownership._id)})
    await expect(owner.owner.query(query,{...scope,snapshotAt,paginationOpts:{numItems:50,cursor:first.continueCursor}})).rejects.toThrow('call_history_authentication_required')
  })

})
