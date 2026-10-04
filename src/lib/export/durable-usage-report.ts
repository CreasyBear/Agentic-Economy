import { z } from 'zod'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { callUsageExportInputSchema, callUsageExportRowSchema, createCallUsageExport, type CallUsageExportRow } from './call-usage-export'
import { appendUsageReportSummary, emptyUsageReportSummary, usageReportSummarySchema } from './usage-report-summary'
const units=z.string().regex(/^(?:0|[1-9]\d*)$/u),digest=z.string().regex(/^sha256:[a-f0-9]{64}$/u)
export const usageReportManifestSchema=callUsageExportInputSchema.safeExtend({format:z.literal('ae.call-usage-report:v1'),reportRef:z.string(),accountRef:z.string(),actorRef:z.string(),scopeDigest:digest,timeBasis:z.literal('call_created'),snapshotAt:z.number().int().nonnegative().safe(),sourceVersionDigest:digest,
  state:z.enum(['building','complete','failed']),partCount:z.number().int().nonnegative().safe(),scannedCountUnits:units,recordCountUnits:units,recordsChainDigest:digest,summaryJson:z.string(),unitTotalsRepresentation:z.literal('paginated'),failureCode:z.string().nullable(),createdAt:z.number().int().nonnegative().safe(),completedAt:z.number().int().nonnegative().safe().nullable(),source:z.literal('canonical_call_projection'),authoritativeForConsequences:z.literal(false)})
export type UsageReportManifest=z.infer<typeof usageReportManifestSchema>
export const usageReportPartSchema=z.strictObject({position:z.number().int().nonnegative().safe(),partDigest:digest,recordsJson:z.string(),recordCountUnits:units})
export type UsageReportPart=z.infer<typeof usageReportPartSchema>
export const usageReportPartsPageSchema=z.object({page:z.array(usageReportPartSchema),isDone:z.boolean(),continueCursor:z.string()})
export const readUsageReportSchema=z.discriminatedUnion('kind',[z.strictObject({kind:z.literal('available'),report:usageReportManifestSchema}),z.strictObject({kind:z.literal('refused'),code:z.string()})])
export const listUsageReportsPageSchema=z.object({page:z.array(usageReportManifestSchema),isDone:z.boolean(),continueCursor:z.string()})

/** Shared artifact verification. Download occurs only after all immutable parts
 * pass their scoped digests, ordered chain, exact count and aggregate checks.
 * Reads remain paginated; the browser never asks for one giant RPC result. */
export async function assembleUsageReport(manifest:UsageReportManifest,readPage:(cursor:string|null)=>Promise<z.infer<typeof usageReportPartsPageSchema>>){
  usageReportManifestSchema.parse(manifest)
  if(manifest.state !== 'complete' || manifest.completedAt === null) throw new Error('usage_report_incomplete')
  const records:CallUsageExportRow[]=[],cursors=new Set<string>()
  let cursor:string|null=null,position=0,chain=canonicalDigest({format:'ae.usage-report-chain:v1',reportRef:manifest.reportRef,scopeDigest:manifest.scopeDigest,snapshotAt:manifest.snapshotAt,sourceVersionDigest:manifest.sourceVersionDigest})
  for(;;){
    const page=usageReportPartsPageSchema.parse(await readPage(cursor))
    for(const part of page.page){
      if(part.position !== position || position >= manifest.partCount) throw new Error('usage_report_part_order_invalid')
      const rows=z.array(callUsageExportRowSchema).parse(JSON.parse(part.recordsJson))
      const projected=createCallUsageExport(manifest,rows,manifest.snapshotAt,rows.length,manifest.accountRef,manifest.reportRef)
      if(part.recordCountUnits !== projected.recordCountUnits || part.partDigest !== canonicalDigest({format:'ae.usage-report-part:v1',reportRef:manifest.reportRef,accountRef:manifest.accountRef,position,recordsDigest:projected.recordsDigest,recordsJsonDigest:canonicalDigest(part.recordsJson),recordCountUnits:projected.recordCountUnits})) throw new Error('usage_report_part_digest_invalid')
      records.push(...rows);position++;chain=canonicalDigest({format:'ae.usage-report-chain-step:v1',previousDigest:chain,partDigest:part.partDigest})
    }
    if(page.isDone) break
    if(!page.continueCursor || cursors.has(page.continueCursor) || position >= manifest.partCount) throw new Error('usage_report_cursor_invalid')
    cursors.add(page.continueCursor);cursor=page.continueCursor
  }
  if(position !== manifest.partCount || chain !== manifest.recordsChainDigest || BigInt(records.length).toString() !== manifest.recordCountUnits
    || BigInt(manifest.scannedCountUnits)>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('usage_report_incomplete')
  const document=createCallUsageExport(manifest,records,manifest.snapshotAt,Number(manifest.scannedCountUnits),manifest.accountRef,manifest.reportRef)
  const expected=usageReportSummarySchema.parse(JSON.parse(manifest.summaryJson))
  const actual=appendUsageReportSummary(emptyUsageReportSummary(expected.refusedCallCountUnits!==undefined&&expected.uncertainCallCountUnits!==undefined),document,false)
  if(canonicalDigest(actual) !== canonicalDigest(expected)) throw new Error('usage_report_summary_changed')
  return {...document,reportManifest:manifest}
}
