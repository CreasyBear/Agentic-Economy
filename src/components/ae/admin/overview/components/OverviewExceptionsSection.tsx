import { ADMIN_OVERVIEW_COPY, type AdminOverviewExceptionsState } from '../overview.contracts'
import { OldestExceptions } from './OldestExceptions'

export type OverviewExceptionsSectionProps = Readonly<{ state: AdminOverviewExceptionsState }>

export function OverviewExceptionsSection({ state }: OverviewExceptionsSectionProps) {
  if (state.kind === 'loading') return <p role="status">Loading exception queues…</p>
  if (state.kind === 'refused') return <p role="status">{ADMIN_OVERVIEW_COPY.accessDeniedDescription}</p>
  return <OldestExceptions rows={state.rows} unavailable={state.unavailable} />
}

