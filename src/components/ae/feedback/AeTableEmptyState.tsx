import type { ReactNode } from 'react'

import {
  AeEmptyState,
  type AeEmptyStateRecipe,
} from './AeEmptyState'

export { TACTILE } from './AeEmptyState'

export type AeTableEmptyStateProps = Readonly<{
  title: string
  description: string
  action?: ReactNode
  icon?: ReactNode
  recipes?: readonly AeEmptyStateRecipe[]
  financialReassurance?: string
}>

export function AeTableEmptyState({
  title,
  description,
  action,
  icon,
  recipes,
  financialReassurance,
}: AeTableEmptyStateProps) {
  return (
      <AeEmptyState
        compact={true}
        title={title}
        description={description}
        {...(action !== undefined ? { action } : {})}
        {...(icon !== undefined ? { icon } : {})}
        {...(recipes !== undefined ? { recipes } : {})}
        {...(financialReassurance !== undefined ? { financialReassurance } : {})}
      />
  )
}
