import { EmptyState } from '@astryxdesign/core/EmptyState'
import type { ReactNode } from 'react'

type AeEmptyStateProps = {
  title: string
  description: string
  action?: ReactNode
}

export function AeEmptyState({ title, description, action }: AeEmptyStateProps) {
  return <EmptyState title={title} description={description} actions={action} />
}
