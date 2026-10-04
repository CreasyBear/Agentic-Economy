import type { Infer, ObjectType } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { brandNonEmpty } from '@/modules/common/ids'
import { redactPayload, validateAuditEvent } from '@/modules/observability/public'
import { persistAuditEvent } from '../../security/audit/persistence'
import { callUsageExportRowSchema, createCallUsageExport, type CallUsageExportRow } from '@/lib/export/call-usage-export'
import { appendUsageReportSummary, emptyUsageReportSummary, usageReportSummarySchema } from '@/lib/export/usage-report-summary'
import { readProjectedSupport } from '../serviceUsage/projectedSupport'
import { usageSourceVersionDigest } from '../serviceUsage/sourceVersions'
import { validUsagePeriod } from './contracts'
import { enqueueUsageReportPage } from './durableReportWork'
import { requestUsageReportArgs, captureUsageReportArgs, reportManifest, type usageReportPageArgs, type listUsageReportsArgs, type readUsageReportResult } from './durableReportContracts'

export async function requestUsageReportHandler(ctx:MutationCtx,args:ObjectType<typeof requestUsageReportArgs>){
  const actor=await resolveBusinessActor(ctx)
  if(actor.kind !== 'authenticated_owner') throw new Error('call_history_authentication_required')
  if(!validUsagePeriod(args.periodStartAt,args.periodEndAt) || !/^call-usage-export:[a-f0-9-]{36}$/u.test(args.reportRef)
    || (args.principalRef !== undefined && (args.principalRef.length === 0 || args.principalRef.length>500))) throw new Error('call_export_scope_invalid')
  const scope={accountRef:actor.canonicalAccountRef,actorRef:actor.canonicalPrincipalRef,...args},scopeDigest=canonicalDigest(scope)
  const existing=await ctx.db.query('capabilityUsageReports').withIndex('by_reportRef',q=>q.eq('reportRef',args.reportRef)).unique()
  if(existing !== null){if(existing.accountRef !== actor.canonicalAccountRef || existing.scopeDigest !== scopeDigest) throw new Error('call_export_scope_conflict');return {kind:'replayed' as const,reportRef:existing.reportRef}}
  const createdAt=Date.now(),snapshotAt=createdAt,sourceVersionDigest=await usageSourceVersionDigest(ctx,scope)
  const eventId=`audit:${actor.canonicalAccountRef}:${args.reportRef}`
  if(await ctx.db.query('auditEvents').withIndex('by_eventId',q=>q.eq('eventId',eventId)).unique() !== null) throw new Error('usage_report_reference_conflict')
  const audit=validateAuditEvent({eventId:brandNonEmpty(eventId,'AuditEventId'),eventType:'billing.call_usage_export_requested',actorKind:'owner',actorRef:actor.canonicalPrincipalRef,activeAccountRef:actor.canonicalAccountRef,authorityGeneration:actor.authorityRevision.account,sourceSystem:'ae_recorded',targetType:'billing',targetRef:actor.canonicalAccountRef,idempotencyKey:brandNonEmpty(args.reportRef,'OperationKey'),correlationId:brandNonEmpty(args.reportRef,'CorrelationId'),beforeState:'not_requested',afterState:'requested',evidenceRefs:[sourceVersionDigest],redactedPayload:redactPayload({...scope,sourceVersionDigest}),payloadHash:brandNonEmpty(scopeDigest,'SourceHash'),createdAt})
  if(!audit.valid) throw new Error(`call_export_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db,audit.event)
  const workId=await enqueueUsageReportPage(ctx,args.reportRef,0)
  await ctx.db.insert('capabilityUsageReports',{...scope,scopeDigest,snapshotAt,sourceVersionDigest,state:'building',pageCount:0,partCount:0,scannedCountUnits:'0',recordCountUnits:'0',recordsChainDigest:canonicalDigest({format:'ae.usage-report-chain:v1',reportRef:args.reportRef,scopeDigest,snapshotAt,sourceVersionDigest}),summaryJson:JSON.stringify(emptyUsageReportSummary()),workId,createdAt})
  return {kind:'created' as const,reportRef:args.reportRef}
}

/** One bounded transactional page. SDK triggers ensure that every admitted
 * source change invalidates the vector, including changes to an earlier page.
 * Job/part/unit writes never change canonical Calls or financial postings. */
export async function captureUsageReportPageHandler(ctx:MutationCtx,args:ObjectType<typeof captureUsageReportArgs>){
  const report=await ctx.db.query('capabilityUsageReports').withIndex('by_reportRef',q=>q.eq('reportRef',args.reportRef)).unique()
  if(report === null || report.state !== 'building' || report.pageCount !== args.expectedPageCount) return {kind:'replayed' as const}
  if(await usageSourceVersionDigest(ctx,report) !== report.sourceVersionDigest){await ctx.db.patch(report._id,{state:'failed',failureCode:'call_export_source_changed'});return {kind:'failed' as const}}
  const principalRef=report.principalRef
  const query=principalRef === undefined ? ctx.db.query('capabilityCallProjections').withIndex('by_accountRef_and_createdAt',q=>q.eq('accountRef',report.accountRef).gte('createdAt',report.periodStartAt).lt('createdAt',report.periodEndAt))
    :ctx.db.query('capabilityCallProjections').withIndex('by_accountRef_and_principalRef_and_createdAt',q=>q.eq('accountRef',report.accountRef).eq('principalRef',principalRef).gte('createdAt',report.periodStartAt).lt('createdAt',report.periodEndAt))
  const page=await query.order('desc').paginate({numItems:10,cursor:report.nextCursor ?? null,maximumRowsRead:20,maximumBytesRead:1024*1024})
  if(!page.isDone && (!page.continueCursor || page.continueCursor === report.nextCursor)) throw new Error('call_export_cursor_invalid')
  const records:CallUsageExportRow[]=[]
  for(const {_id,_creationTime,...row} of page.page){
    if(_creationTime>report.snapshotAt) continue
    if((row.observedAt ?? row.updatedAt)>report.snapshotAt) throw new Error('call_export_source_changed')
    if(report.status !== 'all' && report.status !== row.state) continue
    const support=await readProjectedSupport(ctx,row)
    records.push(callUsageExportRowSchema.parse({...row,currentDeliveredRequestUnits:support.quantityUnits,currentSupportVerified:support.verified,providerUnitSupportVerified:support.providerUnitObservation !== null}))
  }
  const part=createCallUsageExport(report,records,report.snapshotAt,page.page.length,report.accountRef,report.reportRef)
  const summary=appendUsageReportSummary(usageReportSummarySchema.parse(JSON.parse(report.summaryJson)),part)
  for(const unit of part.providerUnits){
    const stored=await ctx.db.query('capabilityUsageReportUnits').withIndex('by_reportRef_and_unitDefinitionRef',q=>q.eq('reportRef',report.reportRef).eq('unitDefinitionRef',unit.unitDefinitionRef)).unique()
    if(stored === null) await ctx.db.insert('capabilityUsageReportUnits',{reportRef:report.reportRef,accountRef:report.accountRef,unitDefinitionRef:unit.unitDefinitionRef,summary:unit})
    else {if(stored.accountRef !== report.accountRef || stored.summary.quantityExponent !== unit.quantityExponent) throw new Error('usage_report_unit_definition_conflict')
      await ctx.db.patch(stored._id,{summary:{...unit,observedQuantityUnits:(BigInt(stored.summary.observedQuantityUnits)+BigInt(unit.observedQuantityUnits)).toString(),observedReceiptCountUnits:(BigInt(stored.summary.observedReceiptCountUnits)+BigInt(unit.observedReceiptCountUnits)).toString(),unknownReceiptCountUnits:(BigInt(stored.summary.unknownReceiptCountUnits)+BigInt(unit.unknownReceiptCountUnits)).toString(),coverage:stored.summary.coverage === 'incomplete' || unit.coverage === 'incomplete' ? 'incomplete' : 'complete'}})}
  }
  // Unit detail is paginated independently; do not grow the job JSON by Tool count.
  summary.providerUnits=[]
  const recordsJson=JSON.stringify(part.records)
  if(new TextEncoder().encode(recordsJson).byteLength>250000) throw new Error('usage_report_part_too_large')
  const partDigest=canonicalDigest({format:'ae.usage-report-part:v1',reportRef:report.reportRef,accountRef:report.accountRef,position:report.partCount,recordsDigest:part.recordsDigest,recordsJsonDigest:canonicalDigest(recordsJson),recordCountUnits:part.recordCountUnits})
  let partCount=report.partCount,recordsChainDigest=report.recordsChainDigest
  if(records.length>0){
    await ctx.db.insert('capabilityUsageReportParts',{reportRef:report.reportRef,accountRef:report.accountRef,position:partCount,partDigest,recordsJson,recordCountUnits:part.recordCountUnits,createdAt:Date.now()})
    partCount++;recordsChainDigest=canonicalDigest({format:'ae.usage-report-chain-step:v1',previousDigest:recordsChainDigest,partDigest})
  }
  const pageCount=report.pageCount+1
  const workId=page.isDone ? report.workId : await enqueueUsageReportPage(ctx,report.reportRef,pageCount)
  await ctx.db.patch(report._id,{pageCount,partCount,scannedCountUnits:(BigInt(report.scannedCountUnits)+BigInt(page.page.length)).toString(),recordCountUnits:summary.recordCountUnits,recordsChainDigest,summaryJson:JSON.stringify(summary),nextCursor:page.continueCursor,
    ...(workId === undefined ? {} : {workId}),...(page.isDone ? {state:'complete' as const,completedAt:Date.now()} : {})})
  return {kind:'advanced' as const}
}

async function ownerReport(ctx:QueryCtx,reportRef:string){
  const actor=await resolveBusinessActor(ctx)
  if(actor.kind !== 'authenticated_owner') throw new Error('call_history_authentication_required')
  const report=await ctx.db.query('capabilityUsageReports').withIndex('by_reportRef',q=>q.eq('reportRef',reportRef)).unique()
  if(report === null || report.accountRef !== actor.canonicalAccountRef) throw new Error('usage_report_unavailable')
  return report
}
export async function readUsageReportHandler(ctx:QueryCtx,args:{reportRef:string}):Promise<Infer<typeof readUsageReportResult>>{
  try{return {kind:'available',report:reportManifest(await ownerReport(ctx,args.reportRef))}}catch{return {kind:'refused',code:'usage_report_unavailable'}}
}
export async function readUsageReportPartsHandler(ctx:QueryCtx,args:ObjectType<typeof usageReportPageArgs>){
  const report=await ownerReport(ctx,args.reportRef)
  if(report.state !== 'complete') throw new Error('usage_report_incomplete')
  if(args.paginationOpts.numItems<1 || args.paginationOpts.numItems>10) throw new Error('usage_report_page_size_invalid')
  const page=await ctx.db.query('capabilityUsageReportParts').withIndex('by_reportRef_and_position',q=>q.eq('reportRef',report.reportRef)).paginate(args.paginationOpts)
  if(page.page.some(row=>row.accountRef !== report.accountRef)) throw new Error('usage_report_scope_mismatch')
  return {...page,page:page.page.map(({position,partDigest,recordsJson,recordCountUnits})=>({position,partDigest,recordsJson,recordCountUnits}))}
}
export async function readUsageReportUnitsHandler(ctx:QueryCtx,args:ObjectType<typeof usageReportPageArgs>){
  const report=await ownerReport(ctx,args.reportRef)
  if(report.state !== 'complete') throw new Error('usage_report_incomplete')
  if(args.paginationOpts.numItems<1 || args.paginationOpts.numItems>50) throw new Error('usage_report_page_size_invalid')
  const page=await ctx.db.query('capabilityUsageReportUnits').withIndex('by_reportRef_and_unitDefinitionRef',q=>q.eq('reportRef',report.reportRef)).paginate(args.paginationOpts)
  if(page.page.some(row=>row.accountRef !== report.accountRef)) throw new Error('usage_report_scope_mismatch')
  return {...page,page:page.page.map(row=>row.summary)}
}
export async function listUsageReportsHandler(ctx:QueryCtx,args:ObjectType<typeof listUsageReportsArgs>){
  const actor=await resolveBusinessActor(ctx)
  if(actor.kind !== 'authenticated_owner') throw new Error('call_history_authentication_required')
  if(args.paginationOpts.numItems<1 || args.paginationOpts.numItems>20) throw new Error('usage_report_page_size_invalid')
  const page=await ctx.db.query('capabilityUsageReports').withIndex('by_accountRef_and_createdAt',q=>q.eq('accountRef',actor.canonicalAccountRef)).order('desc').paginate(args.paginationOpts)
  return {...page,page:page.page.map(reportManifest)}
}
