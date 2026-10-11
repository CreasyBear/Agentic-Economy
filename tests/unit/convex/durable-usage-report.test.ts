/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../../convex/_generated/api'
import { usageSourceTriggers } from '../../../convex/lib/capabilityExecution/serviceUsage/sourceVersions'
import { convexTestWithWorkers, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { usageReportSummarySchema } from '@/lib/export/usage-report-summary'
import { callUsageExportRowSchema } from '@/lib/export/call-usage-export'
import { assembleUsageReport, type UsageReportPart } from '@/lib/export/durable-usage-report'

const period={periodStartAt:Date.UTC(2026,8,1),periodEndAt:Date.UTC(2026,9,1)}
const reportRef='call-usage-export:00000000-0000-4000-8000-000000000041'
const amount='9007199254740993001'
afterEach(()=>vi.useRealTimers())
async function fixture(count:number){
  vi.useFakeTimers();vi.setSystemTime(Date.UTC(2026,9,4))
  const backend=convexTestWithWorkers({pauseWorkpool:true}),owner=await publishedBusinessOwner(backend,'durable-usage-owner')
  const ids=await backend.run(async ctx=>{
    const ids=[]
    for(let index=0;index<count;index++) ids.push(await ctx.db.insert('capabilityCallProjections',{callRef:`call:durable:${index}`,accountRef:owner.canonicalAccountRef,principalRef:index%2 === 0 ? 'agent:one' : 'agent:two',credentialRef:'credential:one',applicationRef:'app:one',toolRef:'tool:one',providerRef:'provider:one',toolLabel:'=PRIVATE_FORMULA()',state:'completed',deliveryState:'delivered',paymentState:'settled',audAmountUnits:amount,deliveredRequestUnits:'1',serviceUsageRef:`usage:${index}`,latencyMs:1,createdAt:period.periodStartAt+index,updatedAt:period.periodStartAt+index}))
    return ids
  })
  const args={...period,status:'all' as const,reportRef}
  // convex-test advances document creation timestamps while Date is frozen.
  // Admission follows the completed seed transaction, as it does in runtime.
  vi.setSystemTime(Date.now()+100000)
  const request=()=>owner.owner.mutation(api.capabilityCallProjections.requestOwnerUsageReport,args)
  const capture=(expectedPageCount:number)=>backend.mutation(internal.capabilityCallProjections.captureUsageReportPage,{reportRef,expectedPageCount})
  const read=()=>owner.owner.query(api.capabilityCallProjections.readOwnerUsageReport,{reportRef})
  return {backend,owner,ids,args,request,capture,read}
}
describe('durable complete-period Call usage reports',()=>{
  it('captures 10,000 records through bounded transactional pages without a loaded-row or 1,000-row cap',async()=>{
    const f=await fixture(10000)
    expect(await f.request()).toEqual({kind:'created',reportRef})
    expect(await f.request()).toEqual({kind:'replayed',reportRef})
    for(let page=0;page<1000;page++) expect(await f.capture(page)).toEqual({kind:'advanced'})
    const result=await f.read()
    if(result.kind !== 'available')throw new Error('report missing')
    expect(result.report).toMatchObject({state:'complete',recordCountUnits:'10000',scannedCountUnits:'10000',partCount:1000,authoritativeForConsequences:false})
    const summary=usageReportSummarySchema.parse(JSON.parse(result.report.summaryJson))
    expect(summary.recordedChargeUnits).toBe((BigInt(amount)*10000n).toString())
    expect(summary).toMatchObject({amountCoverage:'complete',unknownCurrentDeliveryCallCountUnits:'10000',serviceUnitCoverage:'incomplete'})
    let cursor:string|null=null,records=0,parts=0
    const refs=new Set<string>()
    for(;;){const page:{page:UsageReportPart[];isDone:boolean;continueCursor:string}=await f.owner.owner.query(api.capabilityCallProjections.readOwnerUsageReportParts,{reportRef,paginationOpts:{numItems:10,cursor}})
      for(const part of page.page){parts++;const parsed=JSON.parse(part.recordsJson) as unknown[];records+=parsed.length
        for(const row of parsed){const record=callUsageExportRowSchema.parse(row);expect(refs.has(record.callRef)).toBe(false);refs.add(record.callRef);expect(record.accountRef).toBe(f.owner.canonicalAccountRef)}}
      if(page.isDone)break;cursor=page.continueCursor
    }
    expect({records,parts}).toEqual({records:10000,parts:1000})
    const complete=await assembleUsageReport(result.report,cursor=>f.owner.owner.query(api.capabilityCallProjections.readOwnerUsageReportParts,{reportRef,paginationOpts:{numItems:10,cursor}}))
    expect(complete.records).toHaveLength(10000)
    expect(complete.recordedChargeUnits).toBe((BigInt(amount)*10000n).toString())
    await expect(assembleUsageReport({...result.report,recordCountUnits:'9999'},cursor=>f.owner.owner.query(api.capabilityCallProjections.readOwnerUsageReportParts,{reportRef,paginationOpts:{numItems:10,cursor}}))).rejects.toThrow('usage_report_incomplete')
    expect(await f.capture(999)).toEqual({kind:'replayed'})
    expect((await f.read())).toEqual(result)
    const audits=await f.backend.run(ctx=>ctx.db.query('auditEvents').withIndex('by_eventType_and_createdAt',q=>q.eq('eventType','billing.call_usage_export_requested')).collect())
    expect(audits).toHaveLength(1);expect(audits[0]?.redactedPayloadJson).not.toContain('PRIVATE_FORMULA')
  // 1,000 sequential capture mutations take ~41s alone and ~58s under load; 90s left no CI headroom.
  },240000)
  it('rejects tampered parts, truncation, cursor replay and changed summaries without exposing a partial artifact',async()=>{
    const f=await fixture(21);await f.request();for(let page=0;page<3;page++)await f.capture(page)
    const result=await f.read();if(result.kind!=='available')throw new Error('report missing')
    const read=(cursor:string|null)=>f.owner.owner.query(api.capabilityCallProjections.readOwnerUsageReportParts,{reportRef,paginationOpts:{numItems:1,cursor}})
    const first=await read(null)
    await expect(assembleUsageReport(result.report,async()=>({...first,isDone:true}))).rejects.toThrow('usage_report_incomplete')
    await expect(assembleUsageReport(result.report,async()=>({...first,page:[{...first.page[0]!,recordsJson:first.page[0]!.recordsJson.replace('PRIVATE_FORMULA','TAMPERED')}],isDone:true}))).rejects.toThrow('usage_report_part_digest_invalid')
    await expect(assembleUsageReport(result.report,async()=>({...first,page:[],isDone:false,continueCursor:'replayed'}))).rejects.toThrow('usage_report_cursor_invalid')
    await expect(assembleUsageReport({...result.report,summaryJson:JSON.stringify({...JSON.parse(result.report.summaryJson),recordedChargeUnits:'0'})},read)).rejects.toThrow('usage_report_summary_changed')
  })
  it('invalidates an in-flight report when an earlier captured row changes, moves or disappears',async()=>{
    for(const operation of ['change','move','delete'] as const){
      const f=await fixture(21);await f.request();await f.capture(0)
      await f.backend.run(async ctx=>{const tracked=usageSourceTriggers.wrapDB(ctx)
        const id=f.ids[20]!
        if(operation === 'delete')await tracked.db.delete(id)
        else await tracked.db.patch(id,operation === 'change' ? {audAmountUnits:'1'} : {accountRef:'account:other'})
      })
      expect(await f.capture(1)).toEqual({kind:'failed'})
      expect(await f.read()).toMatchObject({kind:'available',report:{state:'failed',failureCode:'call_export_source_changed'}})
      await expect(f.owner.owner.query(api.capabilityCallProjections.readOwnerUsageReportParts,{reportRef,paginationOpts:{numItems:10,cursor:null}})).rejects.toThrow('usage_report_incomplete')
    }
  })
  it('separates closed months from current activity and resumes after duplicate acknowledgements',async()=>{
    const f=await fixture(21);await f.request();await f.capture(0)
    expect(await f.capture(0)).toEqual({kind:'replayed'})
    await f.backend.run(async ctx=>{const tracked=usageSourceTriggers.wrapDB(ctx),row=(await ctx.db.get(f.ids[0]!))!
      const {_id,_creationTime,...fields}=row
      await tracked.db.insert('capabilityCallProjections',{...fields,callRef:'call:current-month',createdAt:period.periodEndAt+1})
    })
    expect(await f.capture(1)).toEqual({kind:'advanced'});expect(await f.capture(2)).toEqual({kind:'advanced'})
    expect(await f.read()).toMatchObject({kind:'available',report:{state:'complete',recordCountUnits:'21'}})
  })
  it('keeps zero-usage reports complete and refuses forged scope, tenants and incomplete parts',async()=>{
    const f=await fixture(0)
    await expect(f.backend.mutation(api.capabilityCallProjections.requestOwnerUsageReport,f.args)).rejects.toThrow('call_history_authentication_required')
    await f.request()
    await expect(f.owner.owner.mutation(api.capabilityCallProjections.requestOwnerUsageReport,{...f.args,status:'completed'})).rejects.toThrow('call_export_scope_conflict')
    await expect(f.owner.owner.query(api.capabilityCallProjections.readOwnerUsageReportParts,{reportRef,paginationOpts:{numItems:10,cursor:null}})).rejects.toThrow('usage_report_incomplete')
    const other=await publishedBusinessOwner(f.backend,'durable-other-owner')
    expect(await other.owner.query(api.capabilityCallProjections.readOwnerUsageReport,{reportRef})).toEqual({kind:'refused',code:'usage_report_unavailable'})
    await expect(other.owner.query(api.capabilityCallProjections.readOwnerUsageReportParts,{reportRef,paginationOpts:{numItems:10,cursor:null}})).rejects.toThrow('usage_report_unavailable')
    await f.capture(0)
    expect(await f.read()).toMatchObject({kind:'available',report:{state:'complete',partCount:0,recordCountUnits:'0'}})
    const page=await f.owner.owner.query(api.capabilityCallProjections.readOwnerUsageReportParts,{reportRef,paginationOpts:{numItems:10,cursor:null}})
    expect(page).toMatchObject({page:[],isDone:true})
  })
})
