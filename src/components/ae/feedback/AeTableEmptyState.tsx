import type { ReactNode } from 'react'
import { AeEmptyState } from './AeEmptyState'

export type AeTableEmptyStateProps = Readonly<{
  title: string
  description: string
  action?: ReactNode
  icon?: ReactNode
}>

export function AeTableEmptyState({
  title,
  description,
  action,
  icon,
}: AeTableEmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-border/80 bg-muted/10 p-6">
      <AeEmptyState
        title={title}
        description={description}
        action={action}
        icon={icon}
      />
    </div>
  )
}
