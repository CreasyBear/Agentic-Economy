import { AeSection } from '@/components/ae/layout/AeSection'
import { type AdminMetricCard } from '../metrics.contracts'

export type MetricsHeadlineProps = Readonly<{ cards: readonly AdminMetricCard[] }>

export function MetricsHeadline({ cards }: MetricsHeadlineProps) {
  return (
    <AeSection title="Settled Call value" description="Recorded settled usage, including promotional credit. This is not net revenue or cash received.">
      <div className="grid gap-related sm:grid-cols-2">
        {cards.map((card) => (
          <article key={card.label} className="rounded-card border border-border bg-card p-related">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-intra text-xl font-semibold tabular-nums text-foreground">{card.value}</p>
            <p className="mt-intra text-xs text-muted-foreground">{card.delta}</p>
          </article>
        ))}
      </div>
    </AeSection>
  )
}
