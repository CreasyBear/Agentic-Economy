import { afterEach,describe,expect,it,vi } from 'vitest'
import { api,internal } from '../../../convex/_generated/api'
import { convexTestWithWorkers,publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { digestReference } from '@/modules/money/public'
import { assembleMonthlyClose } from '@/lib/export/monthly-usage-close'
import { financialReportSummarySchema } from '@/modules/money/public'
import { finalizeStatementHandler } from '../../../convex/lib/money/documents/statementFinalization'
import type { ActionCtx } from '../../../convex/_generated/server'
const month='2026-09',start=Date.UTC(2026,8,1),now=Date.UTC(2026,9,4)
const callRef=`operation-invocation:v1:${'a'.repeat(64)}`,hash=`sha256:${'a'.repeat(64)}`,sale=`ae-p4:${'1'.repeat(64)}`
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs()})
async function fixture(){
  vi.useFakeTimers();vi.setSystemTime(now);vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT','development');vi.stubEnv('AE_FORMANCE_ENVIRONMENT','sandbox');vi.stubEnv('AE_FORMANCE_LEDGER','fixture');vi.stubEnv('AE_FORMANCE_GATEWAY_URL','https://fixture.invalid')
  const backend=convexTestWithWorkers({pauseWorkpool:true}),owner=await publishedBusinessOwner(backend,'complete-month-owner')
  await backend.run(async ctx=>{
    await ctx.db.insert('capabilityCalls',{callRef,ownerId:owner.canonicalAccountRef,principalId:owner.canonicalPrincipalRef,credentialId:'credential:original',applicationRef:'app:one',toolRef:'tool:one',idempotencyKey:'private:key',environment:'sandbox',grantRef:'grant:one',grantGeneration:1,policyDigest:hash,grantExpiresAt:now+1000,inputDigest:hash,requestDigest:hash,state:'completed',result:{kind:'completed',callRef,toolRef:'tool:one',output:{},evidenceHash:hash},formanceFinancialState:'settled',formanceSettlementRefs:[sale,`ae-p4:${'2'.repeat(64)}`],buyerSaleTransactionRef:sale,createdAt:start-1,updatedAt:start})
    await ctx.db.insert('capabilityCallProjections',{callRef:'call:created-in-period',accountRef:owner.canonicalAccountRef,principalRef:owner.canonicalPrincipalRef,credentialRef:'credential:original',applicationRef:'app:one',toolRef:'tool:one',providerRef:'provider:one',toolLabel:'Tool',state:'completed',deliveryState:'delivered',paymentState:'settled',audAmountUnits:'10001',latencyMs:1,createdAt:start+1,updatedAt:start+1})
    await ctx.db.insert('moneyDocuments',{documentRef:'funding-receipt:original',accountRef:owner.canonicalAccountRef,kind:'funding_receipt',sourceTransactionRefs:[sale],amountUnits:'1000000',residualUnits:'0',policyRefs:[],policyDigest:hash,templateVersion:'fixture',renderInputJson:'{}',renderInputDigest:canonicalDigest({}),state:'rendering',environment:'sandbox',sourceCount:1,snapshotDigest:hash,createdAt:start+1})
  })
  vi.setSystemTime(now+100000)
  const requested=await owner.owner.mutation(api.moneyMonthlyUsageDraft.requestCompleteMonth,{month,revision:1})
  if(requested.kind!=='available')throw new Error(requested.code)
  const close=requested.close
  await backend.mutation(internal.capabilityCallProjections.captureUsageReportPage,{reportRef:close.usageReportRef,expectedPageCount:0})
  return {backend,owner,close}
}
function financial(index:number,count=1,isDone=true){return {kind:'available' as const,snapshotAt:now+100000,coverage:'complete' as const,entries:Array.from({length:count},(_,i)=>({transactionId:String(100000-index*15-i),transactionRef:index===0&&i===0?sale:`ae-p4:${String(index*15+i+2).padStart(64,'0')}`,callDigest:digestReference('call',callRef),providerDigest:null,kind:'charge' as const,units:'10001',occurredAt:start+100,recordedAt:start+100,reverted:false})),continueCursor:isDone?'':`native:${index+1}`,isDone,lastTransactionId:String(100000-index*15-count+1),scannedCount:count}}
describe('complete monthly usage close',()=>{
  it('freezes complete usage, ledger clocks, original documents and supplements without financial writes',async()=>{
    const f=await fixture(),args={draftRef:f.close.draftRef}
    expect(await f.backend.mutation(internal.moneyMonthlyUsageDraft.advanceCompleteMonth,args)).toEqual({kind:'waiting'})
    expect(await f.backend.mutation(internal.moneyMonthlyUsageDraft.applyMonthlyFinancialPage,{...args,expectedPageCount:0,financial:financial(0)})).toEqual({kind:'advanced'})
    expect(await f.backend.mutation(internal.moneyMonthlyUsageDraft.applyMonthlyFinancialPage,{...args,expectedPageCount:0,financial:financial(0)})).toEqual({kind:'replayed'})
    expect(await f.backend.mutation(internal.moneyMonthlyUsageDraft.advanceCompleteMonth,args)).toEqual({kind:'advanced'})
    const result=await f.owner.owner.query(api.moneyMonthlyUsageDraft.readCompleteMonth,args)
    if(result.kind!=='available'||result.close.snapshotJson===null)throw new Error('close missing')
    expect(result.close).toMatchObject({state:'complete',issuedInvoice:false,relatedDocumentCountUnits:'1'})
    const snapshot=JSON.parse(result.close.snapshotJson),summary=financialReportSummarySchema.parse(snapshot.financial)
    expect(summary.totals.grossChargeUnits).toBe('10001');expect(summary.attributionCoverage).toBe('complete')
    expect(summary.bridge.find(row=>row.callCreated==='before_period')?.totals.grossChargeUnits).toBe('10001')
    expect(snapshot.usageReport).toMatchObject({timeBasis:'call_created',recordCountUnits:'1'})
    expect(snapshot.ledgerSnapshotAt).toBe(now+100000)
    const parts=await f.owner.owner.query(api.moneyMonthlyUsageDraft.readMonthlyDocumentParts,{...args,paginationOpts:{numItems:2,cursor:null}})
    expect(parts.page[0]?.recordsJson).toContain('funding-receipt:original')
    const complete=await assembleMonthlyClose(result.close,{financial:cursor=>f.owner.owner.query(api.moneyMonthlyUsageDraft.readMonthlyFinancialParts,{...args,paginationOpts:{numItems:2,cursor}}),documents:cursor=>f.owner.owner.query(api.moneyMonthlyUsageDraft.readMonthlyDocumentParts,{...args,paginationOpts:{numItems:2,cursor}}),usage:(manifest,cursor)=>f.owner.owner.query(api.capabilityCallProjections.readOwnerUsageReportParts,{reportRef:manifest.reportRef,paginationOpts:{numItems:2,cursor}})})
    expect(complete.usage.recordCountUnits).toBe('1');expect(complete.financialParts[0]?.reconciliation.entries[0]?.callRef).toBe(callRef)
    expect(complete.relatedDocuments[0]?.documentRef).toBe('funding-receipt:original')
    const readers={financial:async(cursor:string|null)=>{const page=await f.owner.owner.query(api.moneyMonthlyUsageDraft.readMonthlyFinancialParts,{...args,paginationOpts:{numItems:2,cursor}});return {...page,page:page.page.map(part=>({...part,recordsJson:`${part.recordsJson} `}))}},documents:(cursor:string|null)=>f.owner.owner.query(api.moneyMonthlyUsageDraft.readMonthlyDocumentParts,{...args,paginationOpts:{numItems:2,cursor}}),usage:(manifest:{reportRef:string},cursor:string|null)=>f.owner.owner.query(api.capabilityCallProjections.readOwnerUsageReportParts,{reportRef:manifest.reportRef,paginationOpts:{numItems:2,cursor}})}
    await expect(assembleMonthlyClose(result.close,readers)).rejects.toThrow('monthly_close_part_invalid')
    expect(JSON.stringify(snapshot)).not.toContain('private:key')
    const document=await f.backend.run(ctx=>ctx.db.query('moneyDocuments').withIndex('by_documentRef',q=>q.eq('documentRef',result.close.documentRef!)).unique())
    expect(document).toMatchObject({kind:'monthly_usage',snapshotCutoffAt:now+100000,state:'building'})
    const page={documentRef:document!.documentRef,expectedCursor:null,continueCursor:'',isDone:true,transactionRefs:[sale],exactAmountUnits:'10001'}
    await f.backend.mutation(internal.moneyDocuments.applyStatementPage,{...page,pageDigest:canonicalDigest({format:'ae.money-statement-page:v1',...page,expectedCursor:'start'})})
    const runAction=vi.fn()
    const ctx={runQuery:(_ref:unknown,data:{documentRef:string})=>f.backend.query(internal.moneyDocuments.readStatementFinalization,data),runMutation:(_ref:unknown,data:{documentRef:string;adjustmentTransactionRefs:string[]})=>f.backend.mutation(internal.moneyDocuments.queueStatementRender,data),runAction} as unknown as ActionCtx
    await finalizeStatementHandler(ctx,{documentRef:document!.documentRef})
    expect(runAction).not.toHaveBeenCalled()
    expect(await f.backend.run(ctx=>ctx.db.query('moneyDocuments').withIndex('by_documentRef',q=>q.eq('documentRef',document!.documentRef)).unique())).toMatchObject({state:'rendering',amountUnits:'10001',residualUnits:'0'})
    expect(await f.owner.owner.mutation(api.moneyMonthlyUsageDraft.requestCompleteMonth,{month,revision:1})).toEqual(result)
    const supplement=await f.owner.owner.mutation(api.moneyMonthlyUsageDraft.requestCompleteMonth,{month,revision:2})
    expect(supplement).toMatchObject({kind:'available',close:{priorDraftRef:f.close.draftRef,priorDraftDigest:result.close.snapshotDigest,state:'building'}})
    expect(await f.owner.owner.query(api.moneyMonthlyUsageDraft.readCompleteMonth,args)).toEqual(result)
  })
  it('persists 10,000 ledger entries in bounded immutable pages and exact aggregates',async()=>{
    const f=await fixture(),args={draftRef:f.close.draftRef}
    for(let page=0;page<667;page++)await f.backend.mutation(internal.moneyMonthlyUsageDraft.applyMonthlyFinancialPage,{...args,expectedPageCount:page,financial:financial(page,page===666?10:15,page===666)})
    await f.backend.mutation(internal.moneyMonthlyUsageDraft.advanceCompleteMonth,args)
    const result=await f.owner.owner.query(api.moneyMonthlyUsageDraft.readCompleteMonth,args)
    if(result.kind!=='available'||result.close.snapshotJson===null)throw new Error('close missing')
    const snapshot=JSON.parse(result.close.snapshotJson)
    expect(snapshot.financialPartCount).toBe(667);expect(snapshot.financial.transactionCountUnits).toBe('10000');expect(snapshot.financial.totals.grossChargeUnits).toBe('100010000')
    expect(snapshot.financial.attributionCoverage).toBe('partial')
    expect(await f.backend.run(ctx=>ctx.db.query('moneyMonthlyUsageFinancialParts').withIndex('by_draftRef_and_position',q=>q.eq('draftRef',args.draftRef)).collect())).toHaveLength(667)
  },90000)
  it('requires explicit current owner consent, preserves policy replay and skips changed ownership',async()=>{
    const f=await fixture(),idempotencyRef='usage-reporting:00000000-0000-4000-8000-000000000001'
    expect(await f.owner.owner.query(api.moneyMonthlyUsageDraft.readReportingPolicy,{})).toMatchObject({automaticMonthly:false,schedulerActive:false})
    expect(await f.backend.mutation(internal.moneyMonthlyUsageDraft.requestAutomaticMonths,{cursor:null})).toMatchObject({requestedCount:0})
    const intent={automaticMonthly:true,expectedRevision:0,idempotencyRef}
    expect(await f.owner.owner.mutation(api.moneyMonthlyUsageDraft.configureReporting,intent)).toEqual({kind:'updated',revision:1})
    expect(await f.owner.owner.mutation(api.moneyMonthlyUsageDraft.configureReporting,intent)).toEqual({kind:'replayed',revision:1})
    await expect(f.owner.owner.mutation(api.moneyMonthlyUsageDraft.configureReporting,{...intent,automaticMonthly:false})).rejects.toThrow('usage_reporting_replay_conflict')
    expect(await f.backend.mutation(internal.moneyMonthlyUsageDraft.requestAutomaticMonths,{cursor:null})).toMatchObject({requestedCount:1})
    await f.backend.run(async ctx=>{const account=await ctx.db.query('accounts').withIndex('by_accountRef',q=>q.eq('accountRef',f.owner.canonicalAccountRef)).unique();await ctx.db.patch(account!._id,{revision:account!.revision+1})})
    expect(await f.backend.mutation(internal.moneyMonthlyUsageDraft.requestAutomaticMonths,{cursor:null})).toMatchObject({requestedCount:0})
    expect(await f.owner.owner.query(api.moneyMonthlyUsageDraft.readReportingPolicy,{})).toMatchObject({ownerConsentCurrent:false})
  })
  it('refuses current months, missing predecessors, foreign access and failed usage evidence',async()=>{
    const f=await fixture()
    expect(await f.owner.owner.mutation(api.moneyMonthlyUsageDraft.requestCompleteMonth,{month:'2026-10',revision:1})).toEqual({kind:'refused',code:'closed_month_required'})
    expect(await f.owner.owner.mutation(api.moneyMonthlyUsageDraft.requestCompleteMonth,{month,revision:3})).toEqual({kind:'refused',code:'prior_monthly_close_required'})
    expect(await f.backend.query(api.moneyMonthlyUsageDraft.readCompleteMonth,{draftRef:f.close.draftRef})).toEqual({kind:'refused',code:'monthly_close_unavailable'})
    await f.backend.run(async ctx=>{const report=await ctx.db.query('capabilityUsageReports').withIndex('by_reportRef',q=>q.eq('reportRef',f.close.usageReportRef)).unique();await ctx.db.patch(report!._id,{state:'failed'})})
    expect(await f.backend.mutation(internal.moneyMonthlyUsageDraft.advanceCompleteMonth,{draftRef:f.close.draftRef})).toEqual({kind:'failed'})
    await expect(f.owner.owner.query(api.moneyMonthlyUsageDraft.readMonthlyFinancialParts,{draftRef:f.close.draftRef,paginationOpts:{numItems:2,cursor:null}})).rejects.toThrow('monthly_close_incomplete')
  })
})
