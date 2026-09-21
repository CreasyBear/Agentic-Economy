import {
  Activity,
  CheckCircle2,
  Compass,
  CreditCard,
  Key,
  Server,
  SunMoon,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import { aeStatusPresentation } from '@/lib/ui/status-presentation'

export type ToolSearchResultRowModel = Readonly<{
  toolRef: string
  title: string
  providerLine: string
  healthLabel:
    | typeof aeStatusPresentation.operational.label
    | typeof aeStatusPresentation.degraded.label
    | 'Unverified'
  priceLabel: string
  priceValidUntil?: number
}>

export type MarketToolSearchStatus =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'debouncing'; query: string }>
  | Readonly<{ kind: 'loading'; query: string }>
  | Readonly<{
      kind: 'success'
      query: string
      items: readonly ToolSearchResultRowModel[]
      count: number
    }>
  | Readonly<{ kind: 'empty'; query: string; count: number }>
  | Readonly<{
      kind: 'error'
      query: string
      tone: 'alert' | 'recovery'
      message: string
    }>

/** Production debounce for catalog keystrokes. */
export const TOOLS_SEARCH_DEBOUNCE_MS = 200

export const NO_MOUNTED_CHOICE_VALUE = '__ae_no_mounted_choice__'

export type CommandNavigationItem = Readonly<{
  href: string
  label: string
  keywords: readonly string[]
  icon: LucideIcon
  /** Opens the in-task settings dialog instead of navigating away. */
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

export const COMMAND_NAVIGATION_ITEMS: readonly CommandNavigationItem[] = [
  {
    href: '/market',
    label: 'Tools Market',
    keywords: ['market', 'catalogue', 'catalog', 'browse', 'tools'],
    icon: Compass,
  },
  {
    href: '/activity',
    label: 'Calls & Activity',
    keywords: ['activity', 'calls', 'history', 'runs', 'executions'],
    icon: Activity,
  },
  {
    href: '/owner/operations',
    label: 'Tools',
    keywords: ['operations', 'supply', 'provider', 'offerings', 'publish'],
    icon: Wrench,
  },
  {
    href: '/owner/credit',
    label: 'Credit',
    keywords: ['credit', 'balance', 'billing', 'top up', 'funds', 'money'],
    icon: CreditCard,
  },
  {
    href: '/agent-access',
    label: 'Agent Access & Keys',
    keywords: ['agent', 'access', 'principal', 'tokens', 'keys', 'credentials'],
    icon: Key,
  },
  {
    href: '/for-providers',
    label: 'Provider Workspace',
    keywords: ['providers', 'host', 'api', 'monetize', 'seller'],
    icon: Server,
  },
] as const

export const COMMAND_QUICK_ACTIONS: readonly CommandQuickAction[] = [
  {
    id: 'toggle-theme',
    label: 'Toggle Theme',
    description: 'Switch between light and dark appearance',
    keywords: ['theme', 'dark', 'light', 'mode', 'appearance'],
    icon: SunMoon,
  },
  {
    id: 'status',
    label: 'Check System Status',
    description: 'View platform health and uptime',
    href: '/status',
    keywords: ['status', 'health', 'uptime', 'operational'],
    icon: CheckCircle2,
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
    return `${status.count} matched · showing ${status.items.length}`
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
      return 'No matching Tools.'
    }
    if ('query' in status && status.query !== query) return ''
    return ''
  }
  if (status.query !== query) return ''
  if (status.kind === 'success') {
    return `${status.count} Tools matched. Showing ${status.items.length}.`
  }
  return `${status.count} Tools matched. Showing 0.`
}
