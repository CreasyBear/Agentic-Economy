import type { ReactNode } from 'react'

import { AeEmptyState } from '@/components/ae/shared/arc/empty-state/AeEmptyState'

export type AeTableEmptyStateProps = Readonly<{
  title: string
  description: string
  action?: ReactNode
  icon?: ReactNode
  financialReassurance?: string
}>

export function AeTableEmptyState({
  title,
  description,
  action,
  icon,
  financialReassurance,
}: AeTableEmptyStateProps) {
  return (
      <AeEmptyState
        compact={true}
        title={title}
        description={description}
        {...(action !== undefined ? { action } : {})}
        {...(icon !== undefined ? { icon } : {})}
        {...(financialReassurance !== undefined ? { financialReassurance } : {})}
      />
  )
}
