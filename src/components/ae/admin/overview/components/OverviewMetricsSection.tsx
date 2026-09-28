import { Link } from '@tanstack/react-router'

import { AeSection } from '@/components/ae/layout/AeSection'
import { ADMIN_OVERVIEW_COPY, type AdminOverviewMetricsState } from '../overview.contracts'
import { HeadlineStrip } from './HeadlineStrip'

export type OverviewMetricsSectionProps = Readonly<{ state: AdminOverviewMetricsState }>

export function OverviewMetricsSection({ state }: OverviewMetricsSectionProps) {
  if (state.kind === 'loading') return <AeSection title={ADMIN_OVERVIEW_COPY.metricsTitle}><p role="status">Loading metrics…</p></AeSection>
  if (state.kind === 'ready') return <HeadlineStrip headline={state.headline} />
  return (
    <AeSection title={ADMIN_OVERVIEW_COPY.metricsTitle}>
      <p role="status">{state.kind === 'refused' ? ADMIN_OVERVIEW_COPY.metricsUnavailable : ADMIN_OVERVIEW_COPY.noCompletedMetrics}</p>
      <Link to="/admin/metrics" className="underline underline-offset-4">Open Metrics</Link>
    </AeSection>
  )
}
