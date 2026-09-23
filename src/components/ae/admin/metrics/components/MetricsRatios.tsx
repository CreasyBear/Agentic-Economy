import { AeSection } from '@/components/ae/layout/AeSection'
import { ADMIN_METRICS_COPY, type AdminMetricRatio } from '../metrics.contracts'

export type MetricsRatiosProps = Readonly<{ ratios: readonly AdminMetricRatio[] }>

export function MetricsRatios({ ratios }: MetricsRatiosProps) {
  return (
    <AeSection title={ADMIN_METRICS_COPY.ratiosTitle}>
      <dl className="grid gap-related sm:grid-cols-2 xl:grid-cols-5">
        {ratios.map((ratio) => (
          <div key={ratio.label} className="rounded-card border border-border p-related">
            <dt className="text-sm text-muted-foreground">{ratio.label}</dt>
            <dd className="mt-intra font-medium tabular-nums text-foreground">{ratio.value}</dd>
          </div>
        ))}
      </dl>
    </AeSection>
  )
}
