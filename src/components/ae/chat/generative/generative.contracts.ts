export type AnswerBlockView = Readonly<{ markdown: string; streaming?: boolean }>
export type AnswerBlockProps = Readonly<{ view: AnswerBlockView }>

export type WorkStepView = Readonly<{ id: string; label: string; status: 'working' | 'complete' | 'attention' }>
export type WorkDisclosureView = Readonly<{ summary: string; steps: readonly WorkStepView[] }>
export type WorkDisclosureProps = Readonly<{ view: WorkDisclosureView }>

export type SourceView = Readonly<{ toolRef: string; title: string; href: string; attribution?: string }>
export type SourcesInlineView = Readonly<{ sources: readonly SourceView[] }>
export type SourcesInlineProps = Readonly<{ view: SourcesInlineView }>

export type FollowUpsView = Readonly<{ suggestions: readonly string[] }>
export type FollowUpsProps = Readonly<{ view: FollowUpsView; onPick: (text: string) => void }>

export type MessageActionsView = Readonly<{ canCopy: boolean; canEditQuestion: boolean }>
export type MessageActionsProps = Readonly<{ view: MessageActionsView; onCopy: () => void; onEditQuestion: () => void }>

export type OptionView = Readonly<{
  id: string
  name: string
  href: string
  outcome?: string
  price: string
  usage?: string
  readiness: 'ready' | 'unverified' | 'unavailable'
  seller?: Readonly<{ kind: 'provider' | 'host'; name: string }>
  selectable: boolean
  source?: string
  facts?: Readonly<Record<string, Readonly<{ value: string; source?: string }>>>
}>
export type OptionsGridView = Readonly<{ options: readonly OptionView[]; selectedId?: string; comparedIds: readonly string[] }>
export type OptionsGridProps = Readonly<{
  view: OptionsGridView
  onSelect: (id: string) => void
  onCompare: (id: string) => void
}>

export type FilterValue = Readonly<{ price?: string | undefined; readyOnly: boolean; network?: string | undefined; category?: string | undefined }>
export type FilterChipsView = Readonly<{
  value: FilterValue
  prices: readonly string[]
  networks: readonly string[]
  categories: readonly string[]
  count?: number
}>
export type FilterChipsProps = Readonly<{ view: FilterChipsView; onChange: (value: FilterValue) => void }>

export type ComparisonCellView = Readonly<{ value: string; source?: string }>
export type ComparisonRowView = Readonly<{
  label: string
  cells: Readonly<Record<string, ComparisonCellView>>
}>
export type ComparisonTableView = Readonly<{ options: readonly OptionView[]; rows: readonly ComparisonRowView[] }>
export type ComparisonTableProps = Readonly<{ view: ComparisonTableView }>
