import type { CallStatusPageResult } from './call-status-page-types'

export function canRefreshCallStatus(result: CallStatusPageResult): boolean {
  if (result.kind === 'source_unavailable') return true
  if (result.kind === 'refused') return result.retryable
  if (result.kind === 'unchanged') return true
  return result.state !== 'terminal' && result.state !== 'cancelled' && result.state !== 'invalidated'
}
