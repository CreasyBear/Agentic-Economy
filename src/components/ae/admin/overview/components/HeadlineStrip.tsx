import { Link } from '@tanstack/react-router'

import { AeSection } from '@/components/ae/layout/AeSection'
import {
  ADMIN_OVERVIEW_COPY,
  type AdminOverviewHeadline,
} from '../overview.contracts'

export type HeadlineStripProps = Readonly<{ headline: AdminOverviewHeadline }>

export function HeadlineStrip({ headline }: HeadlineStripProps) {
  const cards = [
    [ADMIN_OVERVIEW_COPY.settledCallValue, headline.settledCallValue],
    [ADMIN_OVERVIEW_COPY.settledCalls, headline.settledCalls],
    [ADMIN_OVERVIEW_COPY.successRate, headline.successRate],
    [ADMIN_OVERVIEW_COPY.transactingWorkspaces, headline.transactingWorkspaces],
  ] as const
  return (
    <AeSection title={ADMIN_OVERVIEW_COPY.metricsTitle}>
      <div className="grid gap-related sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <Link
            key={label}
            to="/admin/metrics"
            className="rounded-card border border-border bg-card p-related transition-colors hover:border-foreground/30"
          >
            <span className="block text-sm text-muted-foreground">{label}</span>
            <strong className="mt-intra block text-xl font-semibold tabular-nums text-foreground">{value}</strong>
          </Link>
        ))}
      </div>
    </AeSection>
  )
}
