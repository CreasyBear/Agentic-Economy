import type { MutationCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import { monthlyDraftPeriod } from '@/modules/capability-execution/monthly-usage-draft'
import { financialReportSummarySchema } from '@/modules/money/public'
import { reportManifest } from '../../capabilityExecution/callProjection/durableReportContracts'
import { createStatementForAccount } from '../documents/statement'
import { currentReportingOwner } from './reportingPolicy'
import { enqueueCompleteMonth } from './completeWork'

/** Close records only read and render existing sources. The monthly document
 * uses exact amounts and cannot reach the rounding adjustment booking path. */
export async function advanceCompleteMonthHandler(ctx:MutationCtx,args:{draftRef:string}):Promise<{kind:'advanced'|'replayed'|'waiting'|'failed'}>{
  const row=await ctx.db.query('moneyMonthlyUsageDrafts').withIndex('by_draftRef',q=>q.eq('draftRef',args.draftRef)).unique()
  if(row?.durableVersion!==2||row.durableState!=='building'||row.usageReportRef===undefined)return {kind:'replayed'}
  const ownerCurrent=await currentReportingOwner(ctx,{accountRef:row.accountRef,ownerPrincipalRef:row.requestedByPrincipalRef,authorityRevisionAccount:row.authorityRevisionAccount})
  const usageReportRef=row.usageReportRef
  const report=await ctx.db.query('capabilityUsageReports').withIndex('by_reportRef',q=>q.eq('reportRef',usageReportRef)).unique()
  if(!ownerCurrent||report===null||report.accountRef!==row.accountRef||report.state==='failed'){
    await ctx.db.patch(row._id,{durableState:'failed',failureCode:!ownerCurrent?'monthly_reporting_owner_changed':'monthly_usage_report_incomplete'});return {kind:'failed'}
  }
  if(report.state!=='complete'||row.financialComplete!==true)return {kind:'waiting'}
  if(row.relatedDocumentsDigest===undefined||row.financialSummaryJson===undefined||row.financialPartsDigest===undefined)throw new Error('monthly_close_state_missing')
  const period=monthlyDraftPeriod(row.month),position=row.relatedDocumentPartCount??0
  const page=await ctx.db.query('moneyDocuments').withIndex('by_accountRef_and_createdAt',q=>q.eq('accountRef',row.accountRef).gte('createdAt',period.periodStartAt).lt('createdAt',period.periodEndAt)).paginate({numItems:10,cursor:row.relatedDocumentsCursor??null})
  if(!page.isDone&&(!page.continueCursor||page.continueCursor===row.relatedDocumentsCursor))throw new Error('monthly_document_cursor_invalid')
  const records=page.page.filter(document=>document._creationTime<=row.ledgerSnapshotAt&&document.environment===row.sourceIdentity.environment&&['tax_invoice','adjustment','funding_receipt','service_fee_document'].includes(document.kind)).map(document=>({documentRef:document.documentRef,kind:document.kind,state:document.state,createdAt:document.createdAt,renderInputDigest:document.renderInputDigest,sourceCount:document.sourceCount,amountUnits:document.amountUnits,environment:document.environment}))
  const recordsJson=stableStringify({format:'ae.monthly-related-documents:v2',draftRef:row.draftRef,accountRef:row.accountRef,position,timeBasis:'document_created',observedAt:Date.now(),records})
  const partDigest=canonicalDigest({draftRef:row.draftRef,accountRef:row.accountRef,position,recordsJson})
  await ctx.db.insert('moneyMonthlyUsageDocumentParts',{draftRef:row.draftRef,accountRef:row.accountRef,position,recordsJson,partDigest})
  const relatedDocumentsDigest=canonicalDigest({previousDigest:row.relatedDocumentsDigest,partDigest}),relatedDocumentPartCount=position+1,relatedDocumentCountUnits=(BigInt(row.relatedDocumentCountUnits??'0')+BigInt(records.length)).toString()
  await ctx.db.patch(row._id,{relatedDocumentsCursor:page.continueCursor,relatedDocumentPartCount,relatedDocumentCountUnits,relatedDocumentsDigest})
  if(!page.isDone){await enqueueCompleteMonth(ctx,row.draftRef);return {kind:'advanced'}}
  const priorDraftRef=row.priorDraftRef
  const prior=priorDraftRef===null?null:await ctx.db.query('moneyMonthlyUsageDrafts').withIndex('by_draftRef',q=>q.eq('draftRef',priorDraftRef)).unique()
  if(row.priorDraftRef!==null&&prior?.snapshotDigest===undefined)throw new Error('monthly_close_prior_changed')
  const financial=financialReportSummarySchema.parse(JSON.parse(row.financialSummaryJson))
  const snapshot={format:'ae.monthly-usage-close:v2',draftRef:row.draftRef,accountRef:row.accountRef,month:row.month,revision:row.revision,priorDraftRef:row.priorDraftRef,priorDraftDigest:prior?.snapshotDigest??null,
    sourceIdentity:row.sourceIdentity,requestedByPrincipalRef:row.requestedByPrincipalRef,authorityRevisionAccount:row.authorityRevisionAccount,ledgerSnapshotAt:row.ledgerSnapshotAt,sourcesCapturedAt:report.snapshotAt,usageReport:reportManifest(report),financial,
    financialPartCount:row.financialPageCount??0,financialPartsDigest:row.financialPartsDigest,relatedDocumentPartCount,relatedDocumentCountUnits,relatedDocumentsDigest,relatedDocumentsTimeBasis:'document_created',issuedInvoice:false,authoritativeForConsequences:false}
  const snapshotJson=stableStringify(snapshot),snapshotDigest=canonicalDigest(snapshot)
  const document=await createStatementForAccount(ctx,{environment:row.sourceIdentity.environment,periodStart:period.periodStartAt,periodEnd:period.periodEndAt},row.accountRef,{draftRef:row.draftRef,reportRef:report.reportRef,reportDigest:report.recordsChainDigest,relatedDocumentsDigest,priorDraftRef:row.priorDraftRef,financialSummaryJson:JSON.stringify(financial),snapshotCutoffAt:row.ledgerSnapshotAt})
  if(document.kind==='refused'){await ctx.db.patch(row._id,{durableState:'failed',failureCode:document.code});return {kind:'failed'}}
  await ctx.db.patch(row._id,{durableState:'complete',snapshotJson,snapshotDigest,documentRef:document.documentRef,sourcesCapturedAt:report.snapshotAt})
  return {kind:'advanced'}
}
