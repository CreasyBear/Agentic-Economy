import { Link } from '@tanstack/react-router'

import { AeSection } from '@/components/ae/layout/AeSection'
import './OverviewMetricsComposition.css'
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
    <AeSection title={ADMIN_OVERVIEW_COPY.metricsTitle} className="arc-market arc-overview-metrics">
      <div className="arc-overview-kpis">
        {cards.map(([label, value]) => (
          <Link
            key={label}
            to="/admin/metrics"
            className="arc-overview-kpi"
          >
            <span className="arc-overview-kpi-label">{label}</span>
            <strong className="arc-overview-kpi-value">{value}</strong>
          </Link>
        ))}
      </div>
    </AeSection>
  )
}
