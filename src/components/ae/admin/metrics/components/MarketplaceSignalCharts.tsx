import { DonutChart } from '@/components/arc/donut-chart/donut-chart'
import { FunnelChart } from '@/components/arc/funnel-chart/funnel-chart'
import type { MarketplaceMetricsReport } from '@/lib/operator/admin-console/metrics.contracts'
import { marketplaceFundingChartViewModel } from '../marketplace-signal.view-model'
import styles from './MarketplaceSignalCharts.module.css'

type MarketplaceSignalChartsProps = Readonly<{ report: MarketplaceMetricsReport | undefined }>

const count = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 })

/** Range comparisons require complete snapshots. Funding parts are disjoint settled Call counts. */
export function MarketplaceSignalCharts({ report }: MarketplaceSignalChartsProps) {
  const fundingTitle = useId()
  const conversionTitle = useId()
  const complete = report?.coverageComplete === true && report.days.length > 0 && report.days.every(day => day.complete)
  const quotes = complete ? report.days.reduce((sum, day) => sum + day.quotesCreated, 0) : null
  const converted = complete ? report.days.reduce((sum, day) => sum + day.quotesConvertedAtClose, 0) : null
  const funding = complete ? report.funding : null
  const fundingChart = funding == null ? null : marketplaceFundingChartViewModel(funding)
  const conversionAvailable = quotes !== null && converted !== null && converted <= quotes
    && report?.days.every(day => day.quotesConvertedAtClose <= day.quotesCreated)
  const unavailable = report === undefined ? 'Loading the selected period…' : 'Complete observations are required for this comparison.'
  const conversionUnavailable = complete && !conversionAvailable ? 'Quote conversion data needs review.' : unavailable

  return <div className={styles.grid}>
    <section className={styles.card} aria-labelledby={fundingTitle} aria-busy={report === undefined}>
      <h3 id={fundingTitle}>How Calls are funded</h3>
      <p className={styles.description}>Settled paid Calls · selected period</p>
      {fundingChart == null ? <p role="status" className={styles.unavailable}>{unavailable}</p> : <DonutChart
        className={styles.chart}
        label="Settled Call funding" unit="Calls" totalLabel="Paid Calls" size={fundingChart.size} thickness={28}
        legendAction="select" groupBelow={0} formatValue={value => count.format(value)} emptyLabel="No paid Calls"
        data={fundingChart.data} />}
      <p className={styles.note}>Mixed funding belongs to purchased credit. Free, unsettled, refunded and unclassified Calls are excluded.</p>
    </section>
    <section className={styles.card} aria-labelledby={conversionTitle} aria-busy={report === undefined}>
      <h3 id={conversionTitle}>Quotes that became Calls</h3>
      <p className={styles.description}>Quotes created in this period · conversion at snapshot close</p>
      {!conversionAvailable ? <p role="status" className={styles.unavailable}>{conversionUnavailable}</p> : <FunnelChart
        label="Quote conversion" unit="Quotes" height={168} flow={false} formatValue={value => count.format(value)}
        emptyLabel="No Quotes yet" stages={[
          { key: 'created', label: 'Quotes created', value: quotes },
          { key: 'converted', label: 'Converted to Calls', value: converted },
        ]} />}
      <p className={styles.note}>Conversion records a Call using a Quote. Delivery and payment are separate outcomes.</p>
    </section>
  </div>
}
import { useId } from 'react'
