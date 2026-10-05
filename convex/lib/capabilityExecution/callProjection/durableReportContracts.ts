import { v } from 'convex/values'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { providerUnitSummaryValue } from '@/modules/capability-execution/convex'
import type { Doc } from '../../../_generated/dataModel'

export const requestUsageReportArgs={reportRef:v.string(),principalRef:v.optional(v.string()),periodStartAt:v.number(),periodEndAt:v.number(),status:v.union(v.literal('all'),v.literal('completed'),v.literal('refused'),v.literal('outcome_unknown'))}
export const requestUsageReportResult=v.object({kind:v.union(v.literal('created'),v.literal('replayed')),reportRef:v.string()})
export const reportRefArgs={reportRef:v.string()}
export const captureUsageReportArgs={reportRef:v.string(),expectedPageCount:v.number()}
export const captureUsageReportResult=v.object({kind:v.union(v.literal('advanced'),v.literal('replayed'),v.literal('failed'))})
export const usageReportManifestValue=v.object({format:v.literal('ae.call-usage-report:v1'),reportRef:v.string(),accountRef:v.string(),actorRef:v.string(),scopeDigest:v.string(),principalRef:v.optional(v.string()),periodStartAt:v.number(),periodEndAt:v.number(),status:requestUsageReportArgs.status,
  timeBasis:v.literal('call_created'),snapshotAt:v.number(),sourceVersionDigest:v.string(),state:v.union(v.literal('building'),v.literal('complete'),v.literal('failed')),partCount:v.number(),scannedCountUnits:v.string(),recordCountUnits:v.string(),recordsChainDigest:v.string(),summaryJson:v.string(),unitTotalsRepresentation:v.literal('paginated'),failureCode:v.union(v.string(),v.null()),createdAt:v.number(),completedAt:v.union(v.number(),v.null()),source:v.literal('canonical_call_projection'),authoritativeForConsequences:v.literal(false)})
export const readUsageReportResult=v.union(v.object({kind:v.literal('available'),report:usageReportManifestValue}),v.object({kind:v.literal('refused'),code:v.string()}))
export const usageReportPageArgs={...reportRefArgs,paginationOpts:paginationOptsValidator}
export const usageReportPartValue=v.object({position:v.number(),partDigest:v.string(),recordsJson:v.string(),recordCountUnits:v.string()})
export const usageReportPartsResult=paginationResultValidator(usageReportPartValue)
export const usageReportUnitsResult=paginationResultValidator(providerUnitSummaryValue)
export const listUsageReportsArgs={paginationOpts:paginationOptsValidator}
export const listUsageReportsResult=paginationResultValidator(usageReportManifestValue)
export function reportManifest(row:Doc<'capabilityUsageReports'>){return {format:'ae.call-usage-report:v1' as const,reportRef:row.reportRef,accountRef:row.accountRef,actorRef:row.actorRef,scopeDigest:row.scopeDigest,
  ...(row.principalRef === undefined ? {} : {principalRef:row.principalRef}),periodStartAt:row.periodStartAt,periodEndAt:row.periodEndAt,status:row.status,timeBasis:'call_created' as const,snapshotAt:row.snapshotAt,sourceVersionDigest:row.sourceVersionDigest,state:row.state,partCount:row.partCount,scannedCountUnits:row.scannedCountUnits,recordCountUnits:row.recordCountUnits,recordsChainDigest:row.recordsChainDigest,summaryJson:row.summaryJson,unitTotalsRepresentation:'paginated' as const,failureCode:row.failureCode ?? null,createdAt:row.createdAt,completedAt:row.completedAt ?? null,source:'canonical_call_projection' as const,authoritativeForConsequences:false as const}}
