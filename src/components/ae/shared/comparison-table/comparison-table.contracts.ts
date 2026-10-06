import type { ReactNode } from 'react'

export type ComparisonColumn = Readonly<{
  id: string
  name: string
  caption: string
  action: ReactNode
}>

export type ComparisonRow = Readonly<{
  id: string
  feature: string
  hint?: string
  values: Readonly<Record<string, string>>
  sources?: Readonly<Record<string, string>>
  retainWhenSame?: boolean
}>

export type ComparisonSection = Readonly<{
  id: string
  title: string
  rows: readonly ComparisonRow[]
}>

export type AeComparisonTableProps = Readonly<{
  columns: readonly ComparisonColumn[]
  sections: readonly ComparisonSection[]
  title?: string
  description?: string
}>
