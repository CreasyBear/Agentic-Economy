import { z } from 'zod'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { financialUsageReadSchema,reconciliationCallSchema,reconcileUsage,usageReconciliationSchema,financialReportSummarySchema,emptyFinancialReportSummary,appendFinancialReportSummary } from '@/modules/money/public'
import { monthlyDraftIntentSchema,monthlyDraftPeriod } from '@/modules/capability-execution/monthly-usage-draft'
import { usageReportManifestSchema,assembleUsageReport,type UsageReportManifest,usageReportPartsPageSchema } from './durable-usage-report'
import { formatCsvRow,escapeSpreadsheetText } from './csv-format'
const digest=z.string().regex(/^sha256:[a-f0-9]{64}$/u),time=z.number().int().nonnegative().safe(),count=z.string().regex(/^(?:0|[1-9]\d*)$/u),ref=z.string().regex(/^monthly-usage-close:[a-f0-9]{64}$/u)
export const monthlyCloseSnapshotSchema=z.strictObject({format:z.literal('ae.monthly-usage-close:v2'),draftRef:ref,accountRef:z.string(),month:monthlyDraftIntentSchema.shape.month,revision:monthlyDraftIntentSchema.shape.revision,priorDraftRef:ref.nullable(),priorDraftDigest:digest.nullable(),
  sourceIdentity:z.strictObject({environment:z.enum(['sandbox','production']),sourceDigest:digest}),requestedByPrincipalRef:z.string(),authorityRevisionAccount:z.number().int().nonnegative().safe(),ledgerSnapshotAt:time,sourcesCapturedAt:time,
  usageReport:usageReportManifestSchema,financial:financialReportSummarySchema,financialPartCount:z.number().int().nonnegative().safe(),financialPartsDigest:digest,relatedDocumentPartCount:z.number().int().nonnegative().safe(),relatedDocumentCountUnits:count,relatedDocumentsDigest:digest,relatedDocumentsTimeBasis:z.literal('document_created'),issuedInvoice:z.literal(false),authoritativeForConsequences:z.literal(false)})
export const monthlyCloseSchema=z.strictObject({format:z.literal('ae.monthly-usage-close:v2'),draftRef:ref,month:monthlyDraftIntentSchema.shape.month,revision:monthlyDraftIntentSchema.shape.revision,priorDraftRef:ref.nullable(),priorDraftDigest:digest.nullable(),state:z.enum(['building','complete','failed']),usageReportRef:z.string(),documentRef:z.string().nullable(),snapshotDigest:digest.nullable(),snapshotJson:z.string().nullable(),relatedDocumentPartCount:z.number().int().nonnegative().safe(),relatedDocumentCountUnits:count,relatedDocumentsDigest:digest,failureCode:z.string().nullable(),issuedInvoice:z.literal(false),authoritativeForConsequences:z.literal(false)})
export type MonthlyUsageClose=z.infer<typeof monthlyCloseSchema>
export const monthlyCloseResultSchema=z.discriminatedUnion('kind',[z.strictObject({kind:z.literal('available'),close:monthlyCloseSchema}),z.strictObject({kind:z.enum(['refused','setup_required']),code:z.string()})])
export const monthlyPartSchema=z.strictObject({position:z.number().int().nonnegative().safe(),recordsJson:z.string(),partDigest:digest})
export const monthlyPartsPageSchema=z.object({page:z.array(monthlyPartSchema),isDone:z.boolean(),continueCursor:z.string()})
const financialPartSchema=z.strictObject({format:z.literal('ae.monthly-usage-financial-part:v2'),draftRef:ref,accountRef:z.string(),position:z.number().int().nonnegative().safe(),observedAt:time,
  financial:financialUsageReadSchema.options[0],pageEvidence:z.strictObject({continueCursorDigest:digest,isDone:z.boolean(),lastTransactionId:count.nullable(),scannedCount:z.number().int().min(0).max(15)}),calls:z.array(reconciliationCallSchema).max(30),sources:z.array(z.string().nullable()).max(15),reconciliation:usageReconciliationSchema.options[0]})
const documentPartSchema=z.strictObject({format:z.literal('ae.monthly-related-documents:v2'),draftRef:ref,accountRef:z.string(),position:z.number().int().nonnegative().safe(),timeBasis:z.literal('document_created'),observedAt:time,
  records:z.array(z.strictObject({documentRef:z.string(),kind:z.enum(['funding_receipt','service_fee_document','tax_invoice','adjustment']),state:z.enum(['building','adjusting','rendering','awaiting_signature','issued','failed']),createdAt:time,renderInputDigest:digest,sourceCount:z.number().int().nonnegative().safe(),amountUnits:count,environment:z.enum(['sandbox','production'])})).max(10)})
export function readMonthlyCloseSnapshot(close:MonthlyUsageClose){
  monthlyCloseSchema.parse(close)
  if(close.state!=='complete'||close.snapshotJson===null||close.snapshotDigest===null)throw new Error('monthly_close_incomplete')
  const snapshot=monthlyCloseSnapshotSchema.parse(JSON.parse(close.snapshotJson)),period=monthlyDraftPeriod(snapshot.month)
  const expectedRef=`monthly-usage-close:${canonicalDigest({format:'ae.monthly-usage-close-identity:v2',accountRef:snapshot.accountRef,month:snapshot.month,revision:snapshot.revision}).slice(7)}`
  if(canonicalDigest(snapshot)!==close.snapshotDigest||snapshot.draftRef!==expectedRef||snapshot.draftRef!==close.draftRef||snapshot.month!==close.month||snapshot.revision!==close.revision||snapshot.priorDraftRef!==close.priorDraftRef||snapshot.priorDraftDigest!==close.priorDraftDigest
    || snapshot.usageReport.reportRef!==close.usageReportRef||snapshot.usageReport.accountRef!==snapshot.accountRef||snapshot.usageReport.state!=='complete'||snapshot.usageReport.status!=='all'||snapshot.usageReport.principalRef!==undefined
    ||snapshot.usageReport.periodStartAt!==period.periodStartAt||snapshot.usageReport.periodEndAt!==period.periodEndAt||snapshot.ledgerSnapshotAt<period.periodEndAt||snapshot.sourcesCapturedAt!==snapshot.usageReport.snapshotAt
    ||snapshot.relatedDocumentPartCount!==close.relatedDocumentPartCount||snapshot.relatedDocumentCountUnits!==close.relatedDocumentCountUnits||snapshot.relatedDocumentsDigest!==close.relatedDocumentsDigest)throw new Error('monthly_close_snapshot_invalid')
  return snapshot
}
type ReadParts=(cursor:string|null)=>Promise<z.infer<typeof monthlyPartsPageSchema>>
async function readParts(snapshot:z.infer<typeof monthlyCloseSnapshotSchema>,read:ReadParts,kind:'financial'|'documents'){
  const parts:z.infer<typeof monthlyPartSchema>[]=[],cursors=new Set<string>();let cursor:string|null=null
  const expected=kind==='financial'?snapshot.financialPartCount:snapshot.relatedDocumentPartCount
  let chain=canonicalDigest({format:'ae.monthly-usage-parts:v2',draftRef:snapshot.draftRef,accountRef:snapshot.accountRef})
  for(;;){const page=monthlyPartsPageSchema.parse(await read(cursor))
    for(const part of page.page){if(part.position!==parts.length||parts.length>=expected||part.partDigest!==canonicalDigest({draftRef:snapshot.draftRef,accountRef:snapshot.accountRef,position:part.position,recordsJson:part.recordsJson}))throw new Error('monthly_close_part_invalid')
      parts.push(part);chain=canonicalDigest({previousDigest:chain,partDigest:part.partDigest})}
    if(page.isDone)break
    if(!page.continueCursor||cursors.has(page.continueCursor)||parts.length>=expected)throw new Error('monthly_close_cursor_invalid')
    cursors.add(page.continueCursor);cursor=page.continueCursor
  }
  if(parts.length!==expected||chain!==(kind==='financial'?snapshot.financialPartsDigest:snapshot.relatedDocumentsDigest))throw new Error('monthly_close_parts_incomplete')
  return parts
}
export async function assembleMonthlyClose(close:MonthlyUsageClose,read:{financial:ReadParts;documents:ReadParts;usage:(manifest:UsageReportManifest,cursor:string|null)=>Promise<z.infer<typeof usageReportPartsPageSchema>>}){
  const snapshot=readMonthlyCloseSnapshot(close),financialParts=await readParts(snapshot,read.financial,'financial'),documentParts=await readParts(snapshot,read.documents,'documents')
  let summary=emptyFinancialReportSummary(),lastId:bigint|undefined
  const financial=financialParts.map(part=>{const value=financialPartSchema.parse(JSON.parse(part.recordsJson))
    if(value.accountRef!==snapshot.accountRef||value.draftRef!==snapshot.draftRef||value.position!==part.position||value.financial.snapshotAt!==snapshot.ledgerSnapshotAt||value.financial.entries.length>15)throw new Error('monthly_close_financial_scope_invalid')
    for(const entry of value.financial.entries){const id=BigInt(entry.transactionId);if(lastId!==undefined&&id>=lastId)throw new Error('monthly_close_transaction_order_invalid');lastId=id}
    const reconciled=reconcileUsage({...monthlyDraftPeriod(snapshot.month),financial:value.financial,calls:value.calls,sources:value.sources})
    if(canonicalDigest(reconciled)!==canonicalDigest(value.reconciliation))throw new Error('monthly_close_reconciliation_invalid')
    summary=appendFinancialReportSummary(summary,reconciled);return value
  })
  if(canonicalDigest(summary)!==canonicalDigest(snapshot.financial)||financial.at(-1)?.pageEvidence.isDone!==true)throw new Error('monthly_close_financial_summary_invalid')
  const relatedDocuments=documentParts.flatMap(part=>{const value=documentPartSchema.parse(JSON.parse(part.recordsJson))
    if(value.accountRef!==snapshot.accountRef||value.draftRef!==snapshot.draftRef||value.position!==part.position||value.records.some(row=>row.environment!==snapshot.sourceIdentity.environment))throw new Error('monthly_close_document_scope_invalid');return value.records})
  if(BigInt(relatedDocuments.length).toString()!==snapshot.relatedDocumentCountUnits||new Set(relatedDocuments.map(row=>row.documentRef)).size!==relatedDocuments.length)throw new Error('monthly_close_document_count_invalid')
  const usage=await assembleUsageReport(snapshot.usageReport,cursor=>read.usage(snapshot.usageReport,cursor))
  return {format:'ae.monthly-usage-close-export:v2' as const,snapshot,snapshotDigest:close.snapshotDigest,usage,financialParts:financial,relatedDocuments}
}
export function generateMonthlyFinancialCsv(document:Awaited<ReturnType<typeof assembleMonthlyClose>>){
  const header=['Transaction ID','Kind','Currency','Quantity exponent','Exact units','Effective UTC','Recorded UTC','Call','Credential','Reverted','Amount coverage','Attribution coverage']
  return [formatCsvRow(header),...document.financialParts.flatMap(part=>part.reconciliation.entries.map(row=>formatCsvRow([row.transactionId,row.kind,row.currency??'unknown','6',row.units??'unknown',new Date(row.occurredAt).toISOString(),row.recordedAt===null?'unknown':new Date(row.recordedAt).toISOString(),escapeSpreadsheetText(row.callRef??'unattributed'),escapeSpreadsheetText(row.credentialRef??'unattributed'),String(row.reverted),document.snapshot.financial.amountCoverage,document.snapshot.financial.attributionCoverage])))].join('\r\n')
}
