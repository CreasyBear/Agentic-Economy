import { v, type Infer } from 'convex/values'
import { makeFunctionReference } from 'convex/server'
import type { ActionCtx,MutationCtx,QueryCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import { monthlyDraftPeriod } from '@/modules/capability-execution/monthly-usage-draft'
import { reconcileUsage } from '@/modules/money/public'
import { appendFinancialReportSummary,financialReportSummarySchema } from '@/modules/money/public'
import { financialPageReadResult } from '../usageReconciliation/contracts'
import { readFactsForAccount } from '../usageReconciliation/facts'
import { enqueueCompleteMonth } from './completeWork'
import { currentReportingOwner } from './reportingPolicy'

const nullable=v.union(v.string(),v.null())
export const completeMonthReadRequest=v.union(v.null(),v.object({draftRef:v.string(),accountRef:v.string(),expectedPageCount:v.number(),periodStartAt:v.number(),periodEndAt:v.number(),snapshotAt:v.number(),expectedSourceDigest:v.string(),cursor:nullable,lastTransactionId:nullable,ready:v.boolean(),financialComplete:v.boolean()}))
export const applyMonthlyFinancialPageArgs={draftRef:v.string(),expectedPageCount:v.number(),financial:financialPageReadResult}
type Request=Infer<typeof completeMonthReadRequest>
type Result={kind:'advanced'|'replayed'|'waiting'|'failed'}
const read=makeFunctionReference<'query',{draftRef:string},Request>('moneyMonthlyUsageDraft:readCompleteMonthWork')
const financial=makeFunctionReference<'action',Omit<NonNullable<Request>,'draftRef'|'expectedPageCount'|'ready'|'financialComplete'>,Infer<typeof financialPageReadResult>>('moneyFormance:readUsageReconciliationPage')
const apply=makeFunctionReference<'mutation',{draftRef:string;expectedPageCount:number;financial:Infer<typeof financialPageReadResult>},Result>('moneyMonthlyUsageDraft:applyMonthlyFinancialPage')
const advance=makeFunctionReference<'mutation',{draftRef:string},Result>('moneyMonthlyUsageDraft:advanceCompleteMonth')
export async function readCompleteMonthWorkHandler(ctx:QueryCtx,args:{draftRef:string}):Promise<Request>{
  const row=await ctx.db.query('moneyMonthlyUsageDrafts').withIndex('by_draftRef',q=>q.eq('draftRef',args.draftRef)).unique()
  if(row?.durableVersion!==2||row.durableState!=='building'||row.usageReportRef===undefined)return null
  const usageReportRef=row.usageReportRef
  const report=await ctx.db.query('capabilityUsageReports').withIndex('by_reportRef',q=>q.eq('reportRef',usageReportRef)).unique()
  return {draftRef:row.draftRef,accountRef:row.accountRef,expectedPageCount:row.financialPageCount??0,...monthlyDraftPeriod(row.month),snapshotAt:row.ledgerSnapshotAt,expectedSourceDigest:row.sourceIdentity.sourceDigest,cursor:row.financialCursor??null,lastTransactionId:row.financialLastTransactionId??null,ready:report?.state!=='building',financialComplete:row.financialComplete??false}
}
export async function continueCompleteMonthHandler(ctx:ActionCtx,args:{draftRef:string}):Promise<Result>{
  const request=await ctx.runQuery(read,args)
  if(request===null)return {kind:'replayed'}
  if(!request.ready)return {kind:'waiting'}
  const preflight=await ctx.runMutation(advance,args)
  if(preflight.kind!=='waiting'||request.financialComplete)return preflight
  const {draftRef,expectedPageCount,ready:_,financialComplete:__,...query}=request;void _;void __
  const page=await ctx.runAction(financial,query)
  return await ctx.runMutation(apply,{draftRef,expectedPageCount,financial:page})
}
export async function applyMonthlyFinancialPageHandler(ctx:MutationCtx,args:{draftRef:string;expectedPageCount:number;financial:Infer<typeof financialPageReadResult>}):Promise<Result>{
  const row=await ctx.db.query('moneyMonthlyUsageDrafts').withIndex('by_draftRef',q=>q.eq('draftRef',args.draftRef)).unique()
  if(row?.durableVersion!==2||row.durableState!=='building'||row.usageReportRef===undefined||row.financialComplete||(row.financialPageCount??0)!==args.expectedPageCount)return {kind:'replayed'}
  const usageReportRef=row.usageReportRef
  const report=await ctx.db.query('capabilityUsageReports').withIndex('by_reportRef',q=>q.eq('reportRef',usageReportRef)).unique()
  const ownerCurrent=await currentReportingOwner(ctx,{accountRef:row.accountRef,ownerPrincipalRef:row.requestedByPrincipalRef,authorityRevisionAccount:row.authorityRevisionAccount})
  if(!ownerCurrent||report?.state!=='complete'||report.accountRef!==row.accountRef||args.financial.kind!=='available'){
    await ctx.db.patch(row._id,{durableState:'failed',failureCode:!ownerCurrent?'monthly_reporting_owner_changed':report?.state!=='complete'?'monthly_usage_report_incomplete':args.financial.kind==='available'?'monthly_close_scope_changed':args.financial.code});return {kind:'failed'}
  }
  const page=args.financial,period=monthlyDraftPeriod(row.month)
  if(page.snapshotAt!==row.ledgerSnapshotAt||page.entries.length>15||(!page.isDone&&(!page.continueCursor||page.continueCursor===row.financialCursor))||page.scannedCount<page.entries.length||page.scannedCount>15)throw new Error('monthly_financial_page_invalid')
  const facts=await readFactsForAccount(ctx,{...period,entries:page.entries},row.accountRef,{includeCreatedCalls:false,maximumCallUpdatedAt:row.ledgerSnapshotAt})
  if(facts.kind!=='available')throw new Error(facts.code)
  const reconciled=reconcileUsage({...period,financial:{kind:'available',entries:page.entries,snapshotAt:page.snapshotAt,coverage:page.coverage},calls:facts.calls,sources:facts.sources})
  if(row.financialSummaryJson===undefined||row.financialPartsDigest===undefined)throw new Error('monthly_financial_state_missing')
  const summary=appendFinancialReportSummary(financialReportSummarySchema.parse(JSON.parse(row.financialSummaryJson)),reconciled)
  const position=row.financialPageCount??0,recordsJson=stableStringify({format:'ae.monthly-usage-financial-part:v2',draftRef:row.draftRef,accountRef:row.accountRef,position,observedAt:Date.now(),financial:{kind:page.kind,entries:page.entries,snapshotAt:page.snapshotAt,coverage:page.coverage},pageEvidence:{continueCursorDigest:canonicalDigest(page.continueCursor),isDone:page.isDone,lastTransactionId:page.lastTransactionId,scannedCount:page.scannedCount},calls:facts.calls,sources:facts.sources,reconciliation:reconciled})
  if(new TextEncoder().encode(recordsJson).byteLength>250000)throw new Error('monthly_financial_part_too_large')
  const partDigest=canonicalDigest({draftRef:row.draftRef,accountRef:row.accountRef,position,recordsJson})
  await ctx.db.insert('moneyMonthlyUsageFinancialParts',{draftRef:row.draftRef,accountRef:row.accountRef,position,recordsJson,partDigest})
  await ctx.db.patch(row._id,{financialPageCount:position+1,financialSummaryJson:JSON.stringify(summary),financialPartsDigest:canonicalDigest({previousDigest:row.financialPartsDigest,partDigest}),financialCursor:page.continueCursor,financialComplete:page.isDone,...(page.lastTransactionId===null?{}:{financialLastTransactionId:page.lastTransactionId})})
  await enqueueCompleteMonth(ctx,row.draftRef)
  return {kind:'advanced'}
}
