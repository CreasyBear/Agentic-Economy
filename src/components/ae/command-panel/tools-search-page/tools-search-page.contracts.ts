import {
  SunMoon,
  type LucideIcon,
} from 'lucide-react'


export type ToolSearchResultRowModel = Readonly<{
  toolRef: string
  title: string
  providerLine: string
  healthLabel: string
  sourceKind?: 'admitted' | 'directory' | 'business_catalogue'
  priceLabel: string
  priceValidUntil?: number
}>

export type ToolSearchNextPage = Readonly<{ query: string; cursor: string }>
export type ToolSearchContinuation = ToolSearchNextPage & Readonly<{ forQuery: string }>

export type MarketToolSearchStatus =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'debouncing'; query: string }>
  | Readonly<{ kind: 'loading'; query: string }>
  | Readonly<{
      kind: 'success'
      query: string
      items: readonly ToolSearchResultRowModel[]
      count: number
      scopeLabel?: string
      nextPage?: ToolSearchNextPage
    }>
  | Readonly<{ kind: 'empty'; query: string; count: number; message: string; nextPage?: ToolSearchNextPage }>
  | Readonly<{
      kind: 'error'
      query: string
      tone: 'alert' | 'recovery'
      message: string
    }>

export type SearchRecoveryProps = Readonly<{
  message: string
  onRetry: () => void
  onClear: () => void
  onContinue: (nextPage: ToolSearchNextPage) => void
  nextPage?: ToolSearchNextPage
  isError?: boolean
}>

/** Production debounce for catalog keystrokes. */
export const TOOLS_SEARCH_DEBOUNCE_MS = 200

export const NO_MOUNTED_CHOICE_VALUE = '__ae_no_mounted_choice__'

export type CommandNavigationItem = Readonly<{
  href: string
  label: string
  keywords: readonly string[]
  icon: LucideIcon
  opensSettings?: 'personal' | 'workspace'
}>

export type CommandQuickAction = Readonly<{
  id: string
  label: string
  description: string
  keywords: readonly string[]
  icon: LucideIcon
  href?: string
}>

export const COMMAND_QUICK_ACTIONS: readonly CommandQuickAction[] = [
  {
    id: 'toggle-theme',
    label: 'Toggle Theme',
    description: 'Switch between light and dark appearance',
    keywords: ['theme', 'dark', 'light', 'mode', 'appearance'],
    icon: SunMoon,
  },
] as const

export function filterCommandPaletteEntries<
  T extends Readonly<{ label: string; keywords: readonly string[]; href?: string }>,
>(entries: readonly T[], trimmedQuery: string): T[] {
  if (trimmedQuery === '') return [...entries]
  const query = trimmedQuery.toLowerCase()
  return entries.filter(
    (entry) =>
      entry.label.toLowerCase().includes(query)
      || (entry.href !== undefined && entry.href.toLowerCase().includes(query))
      || entry.keywords.some((keyword) => keyword.toLowerCase().includes(query)),
  )
}

export type ToolSearchChoice =
  | Readonly<{ kind: 'recent'; toolRef: string }>
  | Readonly<{ kind: 'result'; item: ToolSearchResultRowModel }>

export function deriveToolsSearchChoices(
  trimmedQuery: string,
  recentToolRefs: readonly string[],
  status: MarketToolSearchStatus,
): Readonly<{
  catalogItems: readonly ToolSearchResultRowModel[]
  choices: readonly ToolSearchChoice[]
  isAwaitingChoices: boolean
}> {
  const catalogItems =
    status.kind === 'success' && status.query === trimmedQuery ? status.items : []
  const choices: readonly ToolSearchChoice[] = trimmedQuery === ''
    ? recentToolRefs.map((toolRef) => ({ kind: 'recent', toolRef }))
    : catalogItems.map((item) => ({ kind: 'result', item }))
  const isAwaitingChoices = trimmedQuery !== '' && choices.length === 0 && (
    status.kind === 'idle'
    || status.kind === 'debouncing'
    || status.kind === 'loading'
    || ('query' in status && status.query !== trimmedQuery)
  )
  return { catalogItems, choices, isAwaitingChoices }
}

export function toolSearchGroupHeading(
  trimmedQuery: string,
  recentCount: number,
  status: MarketToolSearchStatus,
): string {
  if (trimmedQuery === '') return `Recently inspected · ${recentCount}`
  if (status.kind === 'success' && status.query === trimmedQuery) {
    return status.scopeLabel === undefined
      ? `${status.count} matched · showing ${status.items.length}`
      : `${status.items.length} assessed results · ${status.scopeLabel}`
  }
  return 'Matching Tools'
}

export function toolSearchStatusMessage(
  status: MarketToolSearchStatus,
  query: string,
  choiceCount: number,
): string {
  if (status.kind === 'debouncing' || status.kind === 'loading') return 'Searching Tools…'
  if (status.kind === 'error' && status.tone === 'alert') {
    return 'Tool search failed. Recovery options are available.'
  }
  if (query === '') return choiceCount > 0 ? `${choiceCount} recently inspected Tools.` : ''
  if (status.kind !== 'success' && status.kind !== 'empty') {
    if (status.kind === 'error' && status.query === query && status.tone === 'recovery') {
      return 'Tool search is unavailable. Try again.'
    }
    if ('query' in status && status.query !== query) return ''
    return ''
  }
  if (status.query !== query) return ''
  if (status.kind === 'success') {
    return status.scopeLabel === undefined
      ? `${status.count} Tools matched. Showing ${status.items.length}.`
      : `${status.items.length} Tools on an assessed subset. ${status.scopeLabel}.`
  }
  return status.message
}
