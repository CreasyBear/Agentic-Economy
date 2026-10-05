import type { Infer, ObjectType } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { env } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { monthlyDraftIntentSchema,monthlyDraftPeriod } from '@/modules/capability-execution/monthly-usage-draft'
import { usageReadSourceDigest } from '@/modules/money/usage-read-source'
import { emptyFinancialReportSummary } from '@/modules/money/public'
import { requestUsageReportForActor } from '../../capabilityExecution/callProjection/durableReport'
import { reportingAuthority,currentReportingOwner,recordReportingAudit } from './reportingPolicy'
import { enqueueCompleteMonth } from './completeWork'
import { monthlyCloseResult,monthlyDocumentPartsArgs } from './completeContracts'

export function completeMonthRef(accountRef:string,month:string,revision:number){return `monthly-usage-close:${canonicalDigest({format:'ae.monthly-usage-close-identity:v2',accountRef,month,revision}).slice(7)}`}
export function closeView(row:Doc<'moneyMonthlyUsageDrafts'>){return {format:'ae.monthly-usage-close:v2' as const,draftRef:row.draftRef,month:row.month,revision:row.revision,priorDraftRef:row.priorDraftRef,priorDraftDigest:row.priorFrozenDigest??null,
  state:row.durableState??'failed',usageReportRef:row.usageReportRef??'',documentRef:row.documentRef??null,snapshotDigest:row.snapshotDigest??null,snapshotJson:row.snapshotJson??null,relatedDocumentPartCount:row.relatedDocumentPartCount??0,relatedDocumentCountUnits:row.relatedDocumentCountUnits??'0',relatedDocumentsDigest:row.relatedDocumentsDigest??canonicalDigest([]),failureCode:row.failureCode??null,issuedInvoice:false as const,authoritativeForConsequences:false as const}}
export async function requestCompleteMonthForOwner(ctx:MutationCtx,args:{month:string;revision:number},owner:{accountRef:string;principalRef:string;authorityRevisionAccount:number}):Promise<Infer<typeof monthlyCloseResult>>{
  const now=Date.now()
  if(!monthlyDraftIntentSchema.safeParse(args).success||monthlyDraftPeriod(args.month).periodEndAt>now)return {kind:'refused',code:'closed_month_required'}
  if(!await currentReportingOwner(ctx,{accountRef:owner.accountRef,ownerPrincipalRef:owner.principalRef,authorityRevisionAccount:owner.authorityRevisionAccount}))return {kind:'refused',code:'monthly_reporting_owner_changed'}
  const draftRef=completeMonthRef(owner.accountRef,args.month,args.revision)
  const existing=await ctx.db.query('moneyMonthlyUsageDrafts').withIndex('by_draftRef',q=>q.eq('draftRef',draftRef)).unique()
  if(existing!==null)return {kind:'available',close:closeView(existing)}
  const environment=env.AE_FORMANCE_ENVIRONMENT,ledger=env.AE_FORMANCE_LEDGER?.trim(),gatewayUrl=env.AE_FORMANCE_GATEWAY_URL?.trim()
  if((environment!=='sandbox'&&environment!=='production')||!ledger||!gatewayUrl)return {kind:'setup_required',code:'monthly_draft_source_unconfigured'}
  let sourceDigest:string;try{sourceDigest=usageReadSourceDigest({environment,ledger,gatewayUrl})}catch{return {kind:'setup_required',code:'monthly_draft_source_unconfigured'}}
  const priorDraftRef=args.revision===1?null:completeMonthRef(owner.accountRef,args.month,args.revision-1)
  const prior=priorDraftRef===null?null:await ctx.db.query('moneyMonthlyUsageDrafts').withIndex('by_draftRef',q=>q.eq('draftRef',priorDraftRef)).unique()
  if(priorDraftRef!==null&&(prior?.durableState!=='complete'||prior.snapshotDigest===undefined))return {kind:'refused',code:'prior_monthly_close_required'}
  const digest=canonicalDigest({draftRef}),hex=digest.slice(7,39),reportRef=`call-usage-export:${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
  const initial=canonicalDigest({format:'ae.monthly-usage-parts:v2',draftRef,accountRef:owner.accountRef})
  await requestUsageReportForActor(ctx,{...monthlyDraftPeriod(args.month),status:'all',reportRef},{canonicalAccountRef:owner.accountRef,canonicalPrincipalRef:owner.principalRef,authorityRevision:{account:owner.authorityRevisionAccount}})
  const id=await ctx.db.insert('moneyMonthlyUsageDrafts',{draftRef,accountRef:owner.accountRef,...args,priorDraftRef,ledgerSnapshotAt:now,createdAt:now,sourceIdentity:{environment,sourceDigest},requestedByPrincipalRef:owner.principalRef,authorityRevisionAccount:owner.authorityRevisionAccount,...(prior?.snapshotDigest===undefined?{}:{priorFrozenDigest:prior.snapshotDigest}),durableVersion:2,usageReportRef:reportRef,durableState:'building',financialPageCount:0,financialComplete:false,financialSummaryJson:JSON.stringify(emptyFinancialReportSummary()),financialPartsDigest:initial,relatedDocumentPartCount:0,relatedDocumentCountUnits:'0',relatedDocumentsDigest:initial})
  await recordReportingAudit(ctx,{eventType:'billing.monthly_usage_close_requested',accountRef:owner.accountRef,principalRef:owner.principalRef,authorityRevisionAccount:owner.authorityRevisionAccount,idempotencyRef:draftRef,before:'not_requested',after:'building',digest})
  await enqueueCompleteMonth(ctx,draftRef)
  const row=await ctx.db.get(id);if(row===null)throw new Error('monthly_close_missing');return {kind:'available',close:closeView(row)}
}
export async function requestCompleteMonthHandler(ctx:MutationCtx,args:{month:string;revision:number}){
  const owner=await reportingAuthority(ctx)
  return await requestCompleteMonthForOwner(ctx,args,{accountRef:owner.canonicalAccountRef,principalRef:owner.canonicalPrincipalRef,authorityRevisionAccount:owner.authorityGeneration})
}
export async function ownedCompleteMonth(ctx:QueryCtx,draftRef:string){
  const owner=await reportingAuthority(ctx),row=await ctx.db.query('moneyMonthlyUsageDrafts').withIndex('by_draftRef',q=>q.eq('draftRef',draftRef)).unique()
  if(row?.accountRef!==owner.canonicalAccountRef||row.durableVersion!==2)throw new Error('monthly_close_unavailable');return row
}
export async function readCompleteMonthHandler(ctx:QueryCtx,args:{draftRef:string}):Promise<Infer<typeof monthlyCloseResult>>{
  try{return {kind:'available',close:closeView(await ownedCompleteMonth(ctx,args.draftRef))}}catch{return {kind:'refused',code:'monthly_close_unavailable'}}
}
export async function readMonthlyDocumentPartsHandler(ctx:QueryCtx,args:ObjectType<typeof monthlyDocumentPartsArgs>,kind:'documents'|'financial'='documents'){
  const row=await ownedCompleteMonth(ctx,args.draftRef)
  if(row.durableState!=='complete'||args.paginationOpts.numItems<1||args.paginationOpts.numItems>10)throw new Error('monthly_close_incomplete')
  const table=kind==='documents'?'moneyMonthlyUsageDocumentParts':'moneyMonthlyUsageFinancialParts'
  const page=await ctx.db.query(table).withIndex('by_draftRef_and_position',q=>q.eq('draftRef',row.draftRef)).paginate(args.paginationOpts)
  if(page.page.some(part=>part.accountRef!==row.accountRef))throw new Error('monthly_close_scope_changed')
  return {...page,page:page.page.map(({position,recordsJson,partDigest})=>({position,recordsJson,partDigest}))}
}
export async function requestAutomaticMonthsHandler(ctx:MutationCtx,args:{cursor:string|null}){
  const now=new Date(),month=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)).toISOString().slice(0,7)
  const page=await ctx.db.query('moneyUsageReportingPolicies').withIndex('by_automaticMonthly_and_accountRef',q=>q.eq('automaticMonthly',true)).paginate({numItems:10,cursor:args.cursor})
  let requestedCount=0
  for(const policy of page.page){if(!await currentReportingOwner(ctx,policy))continue
    const result=await requestCompleteMonthForOwner(ctx,{month,revision:1},{accountRef:policy.accountRef,principalRef:policy.ownerPrincipalRef,authorityRevisionAccount:policy.authorityRevisionAccount})
    if(result.kind==='available')requestedCount++}
  return {isDone:page.isDone,continueCursor:page.continueCursor,requestedCount}
}
