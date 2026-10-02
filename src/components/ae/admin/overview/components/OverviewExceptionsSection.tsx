import { AeSection } from '@/components/ae/layout/AeSection'
import { ADMIN_OVERVIEW_COPY, type AdminOverviewExceptionsState } from '../overview.contracts'
import { OldestExceptions } from './OldestExceptions'
import '../OverviewComposition.css'

export type OverviewExceptionsSectionProps = Readonly<{ state: AdminOverviewExceptionsState }>

export function OverviewExceptionsSection({ state }: OverviewExceptionsSectionProps) {
  if (state.kind === 'loading') return <AeSection className="arc-admin-overview-feedback" title={ADMIN_OVERVIEW_COPY.exceptionsTitle}><p role="status">Loading exception queues…</p></AeSection>
  if (state.kind === 'refused') return <AeSection className="arc-admin-overview-feedback" title={ADMIN_OVERVIEW_COPY.exceptionsTitle}><p role="status">{ADMIN_OVERVIEW_COPY.accessDeniedDescription}</p></AeSection>
  return <OldestExceptions rows={state.rows} unavailable={state.unavailable} />
}
