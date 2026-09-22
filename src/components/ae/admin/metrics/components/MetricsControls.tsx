import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import type { MarketplaceMetricsRange } from '@/lib/operator/admin-console/metrics.contracts'
import { ADMIN_METRICS_COPY, ADMIN_METRICS_RANGES } from '../metrics.contracts'

export type MetricsControlsProps = Readonly<{
  range: MarketplaceMetricsRange
  onRangeChange: (range: MarketplaceMetricsRange) => void
}>

export function MetricsControls({ range, onRangeChange }: MetricsControlsProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-related">
      <div className="flex flex-wrap gap-intra" aria-label={ADMIN_METRICS_COPY.rangeLabel}>
        {ADMIN_METRICS_RANGES.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={range === option.value ? 'default' : 'outline'}
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
        className={buttonVariants({ variant: 'outline' })}
      >
        {ADMIN_METRICS_COPY.exportCsv}
      </a>
    </div>
  )
}
