import { Button } from '@/components/arc/button/button'
import './MetricsControls.css'
import type { MarketplaceMetricsRange } from '@/lib/operator/admin-console/metrics.contracts'
import { ADMIN_METRICS_COPY, ADMIN_METRICS_RANGES } from '../metrics.contracts'

export type MetricsControlsProps = Readonly<{
  range: MarketplaceMetricsRange
  onRangeChange: (range: MarketplaceMetricsRange) => void
}>

export function MetricsControls({ range, onRangeChange }: MetricsControlsProps) {
  return (
    <div className="arc-market arc-metrics-controls">
      <div className="arc-metrics-ranges" role="group" aria-label={ADMIN_METRICS_COPY.rangeLabel}>
        {ADMIN_METRICS_RANGES.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="secondary"
            aria-pressed={range === option.value}
            onClick={() => onRangeChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <a
        href={`/api/admin/metrics-export?range=${range}`}
        download
        className="arc-metrics-export"
      >
        {ADMIN_METRICS_COPY.exportCsv}
      </a>
    </div>
  )
}
