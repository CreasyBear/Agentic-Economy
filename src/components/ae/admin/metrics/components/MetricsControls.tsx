import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import './MetricsControls.css'
import type { MarketplaceMetricsRange } from '@/lib/operator/admin-console/metrics.contracts'
import { ADMIN_METRICS_COPY, ADMIN_METRICS_RANGES } from '../metrics.contracts'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

export type MetricsControlsProps = Readonly<{
  range: MarketplaceMetricsRange
  onRangeChange: (range: MarketplaceMetricsRange) => void
}>

export function MetricsControls({ range, onRangeChange }: MetricsControlsProps) {
  return (
    <div className="arc-market arc-metrics-controls">
      <SegmentedControl
        label={ADMIN_METRICS_COPY.rangeLabel}
        options={[...ADMIN_METRICS_RANGES]}
        value={range}
        onValueChange={(value) => {
          const option = ADMIN_METRICS_RANGES.find((item) => item.value === value)
          if (option) onRangeChange(option.value)
        }}
      />
      <a
        href={`/api/admin/metrics-export?range=${range}`}
        download
        className={`arc-metrics-export ${actionLinkClassName('secondary', 'md')}`}
      >
        {ADMIN_METRICS_COPY.exportCsv}
      </a>
    </div>
  )
}
