import type { ReactNode } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'

/**
 * Degraded half of AE's canonical content-state pair: `AeEmptyState` speaks
 * for "resolved and genuinely empty" (`role="status"`), this sibling speaks
 * for "should work but could not be loaded" (`role="alert"`). Copy states
 * what was lost and how to recover — never why the backend failed.
 */
export function AeDegradedState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <AeEmptyState
      {...(action === undefined ? {} : { action })}
      role="alert"
      title={title}
      description={description}
    />
  )
}
