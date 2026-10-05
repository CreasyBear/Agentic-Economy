import { canonicalDigest } from '@/modules/common/canonical-digest'
import { usageReportManifestSchema, type UsageReportManifest } from './durable-usage-report'
import { usageReportSummarySchema } from './usage-report-summary'
const DAY=86_400_000
const ceilRatio=(units:bigint,numerator:number,denominator:number)=>((units*BigInt(numerator)+BigInt(denominator)-1n)/BigInt(denominator)).toString()
/** A descriptive run rate from a frozen, complete Account report. Financial
 * settlement, provider cost, unit prices and future activity are not inferred. */
export function forecastUsageReport(input:UsageReportManifest){
  const report=usageReportManifestSchema.parse(input)
  const start=new Date(report.periodStartAt),monthEnd=Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1)
  if(report.state!=='complete'||report.completedAt===null)return {kind:'unavailable',reason:'report_incomplete'} as const
  if(report.principalRef!==undefined||report.status!=='all'||start.getUTCDate()!==1||report.periodStartAt!==Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),1)||report.periodEndAt!==monthEnd)return {kind:'unavailable',reason:'complete_account_month_required'} as const
  const summary=usageReportSummarySchema.parse(JSON.parse(report.summaryJson))
  const completedEnd=Math.min(monthEnd,Math.floor(report.snapshotAt/DAY)*DAY),completedDays=Math.max(0,(completedEnd-report.periodStartAt)/DAY),monthDays=(monthEnd-report.periodStartAt)/DAY
  const dates=new Set<string>();let calls=0n,charge=0n,totalCalls=0n,totalCharge=0n
  for(const row of summary.daily){
    const day=Date.parse(`${row.date}T00:00:00Z`)
    if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==row.date||day<report.periodStartAt||day>=monthEnd||day>report.snapshotAt||dates.has(row.date))throw new Error('forecast_daily_scope_invalid')
    dates.add(row.date);totalCalls+=BigInt(row.callCountUnits);totalCharge+=BigInt(row.recordedChargeUnits)
    if(day<completedEnd){calls+=BigInt(row.callCountUnits);charge+=BigInt(row.recordedChargeUnits)}
  }
  if(totalCalls.toString()!==summary.recordCountUnits||totalCharge.toString()!==summary.recordedChargeUnits||summary.recordCountUnits!==report.recordCountUnits)throw new Error('forecast_summary_invalid')
  if(summary.amountCoverage!=='complete')return {kind:'unavailable',reason:'charge_coverage_incomplete'} as const
  if(report.snapshotAt<monthEnd&&completedDays<3)return {kind:'unavailable',reason:'three_complete_days_required'} as const
  const closed=report.snapshotAt>=monthEnd
  const material={kind:closed?'actual':'forecast',method:'all_complete_utc_days_mean:v1',timeBasis:'call_created',reportRef:report.reportRef,sourceVersionDigest:report.sourceVersionDigest,recordsChainDigest:report.recordsChainDigest,snapshotAt:report.snapshotAt,completedDays,monthDays,
    observedCallCountUnits:summary.recordCountUnits,observedRecordedChargeUnits:summary.recordedChargeUnits,
    projectedCallCountUnits:closed?summary.recordCountUnits:ceilRatio(calls,monthDays,completedDays),projectedRecordedChargeUnits:closed?summary.recordedChargeUnits:ceilRatio(charge,monthDays,completedDays),currency:'AUD',exponent:6,
    assumptions:'Zero-activity days are included. The partial UTC day is excluded. Future activity is assumed to continue at the complete-day average; final units round up. Recorded gross charges use Call creation dates, not ledger settlement dates, refunds, credits or provider cost.',authoritativeForConsequences:false} as const
  return {...material,forecastDigest:canonicalDigest(material)}
}
