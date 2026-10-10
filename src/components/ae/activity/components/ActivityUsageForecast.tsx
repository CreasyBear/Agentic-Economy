import { MetricsOverview } from '@/components/ae/shared/arc-pro/metrics-dashboard/metrics-dashboard'
import type { UsageReportManifest } from '@/lib/export/durable-usage-report'
import { forecastUsageReport } from '@/lib/export/usage-forecast'
import { formatCurrencyAmount } from '@/modules/money/public'
import { formatTimestamp } from '@/lib/ui/format-time'
export function ActivityUsageForecast({report}:{report:UsageReportManifest}){
  let value:ReturnType<typeof forecastUsageReport>
  try{value=forecastUsageReport(report)}catch{return <p role="status">The report could not be verified for a forecast.</p>}
  if(value.kind==='unavailable')return <p role="status" className="text-sm text-muted-foreground">Forecast unavailable: {value.reason==='three_complete_days_required'?'At least three complete UTC days are required.':value.reason==='charge_coverage_incomplete'?'Some charges are unresolved.':value.reason==='report_incomplete'?'Prepare a complete report first.':'Select an all-Agent, all-outcome report for a complete UTC month.'}</p>
  return <MetricsOverview title={value.kind==='actual'?'Completed month actuals':'Month-end run rate'} coverageDescription={value.assumptions} cards={[{label:value.kind==='actual'?'Calls in month':'Estimated Calls at month end',value:value.projectedCallCountUnits},{label:value.kind==='actual'?'Recorded gross charges':'Estimated recorded gross charges',value:formatCurrencyAmount({currency:'AUD',units:value.projectedRecordedChargeUnits,exponent:6})},{label:'Complete UTC days',value:`${value.completedDays} / ${value.monthDays}`}]}>
    <p className="text-sm text-muted-foreground">Complete history captured through {formatTimestamp(value.snapshotAt, 'UTC')} UTC. An estimate does not reserve credit or create a charge.</p>
  </MetricsOverview>
}
