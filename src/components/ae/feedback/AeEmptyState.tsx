import { useId, type ReactNode } from 'react'

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

type AeEmptyStateProps = {
  title: string
  description: string
  action?: ReactNode
}

export function AeEmptyState({ title, description, action }: AeEmptyStateProps) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <Empty aria-labelledby={titleId} aria-describedby={descriptionId}>
      <EmptyHeader>
        <EmptyTitle id={titleId}>{title}</EmptyTitle>
        <EmptyDescription id={descriptionId}>{description}</EmptyDescription>
      </EmptyHeader>
      {action === undefined ? null : <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
