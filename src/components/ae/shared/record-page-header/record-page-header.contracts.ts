import type { ReactNode } from 'react'

export type RecordPageHeaderCrumb = Readonly<{
  id: string
  label: string
  renderLink?: (props: Readonly<{ className: string | undefined; children: ReactNode }>) => ReactNode
}>

export type AeRecordPageHeaderProps = Readonly<{
  title: string
  description: string
  breadcrumbs: readonly RecordPageHeaderCrumb[]
  actions?: ReactNode
  detail?: ReactNode
  className?: string
  titleId?: string
  descriptionId?: string
  titleTabIndex?: -1
  context?: ReactNode
  metadata?: ReactNode
}>
