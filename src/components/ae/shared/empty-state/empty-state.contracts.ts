import type { ReactNode } from 'react'

export type AeEmptyStateRecipe = Readonly<{
  id: string
  label: string
  onSelect: () => void
}>

export type AeEmptyStateProps = Readonly<{
  title: string
  description: string
  action?: ReactNode
  role?: 'status' | 'alert'
  icon?: ReactNode
  recipes?: readonly AeEmptyStateRecipe[]
  financialReassurance?: string
  actionFeedback?: string
  compact?: boolean
  titleAs?: 'h2' | 'p'
}>
