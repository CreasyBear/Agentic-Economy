import { SITE_NAV } from '@/content/brand-copy'

export type AppDestinationId =
  | 'market'
  | 'chat'
  | 'agents'
  | 'calls'
  | 'credit'
  | 'tools'
  | 'earnings'
  | 'settings'
  | 'support'
  | 'status'

export type AppNavGroup = 'market' | 'ask' | 'activity' | 'workspace'

export type AppDestination = Readonly<{
  id: AppDestinationId
  label: string
  to: string
  hash?: string
  group: AppNavGroup
  /** The destination shared by the dropdown section and mobile bar. */
  topLevel?: true
  keywords: readonly string[]
  title: string
}>

export const APP_NAVIGATION: readonly AppDestination[] = [
  {
    id: 'market',
    label: 'Market',
    to: '/market',
    group: 'market',
    topLevel: true,
    keywords: ['market', 'catalogue', 'catalog', 'browse', 'tools'],
    title: 'Market | Agentic Economy',
  },
  {
    id: 'chat',
    label: 'Ask',
    to: '/t/new',
    group: 'ask',
    topLevel: true,
    keywords: ['chat', 'ask', 'conversation', 'thread'],
    title: 'Ask | Agentic Economy',
  },
  {
    id: 'agents',
    label: 'Agents',
    to: '/agent-access',
    group: 'ask',
    keywords: ['agent', 'access', 'principal', 'tokens', 'keys', 'credentials'],
    title: 'Agents | Agentic Economy',
  },
  {
    id: 'calls',
    label: 'Activity',
    to: '/activity',
    group: 'activity',
    topLevel: true,
    keywords: ['activity', 'calls', 'history', 'runs', 'executions'],
    title: 'Activity | Agentic Economy',
  },
  {
    id: 'credit',
    label: 'Credit',
    to: '/owner/credit',
    group: 'activity',
    keywords: ['credit', 'balance', 'billing', 'top up', 'funds', 'money'],
    title: 'Credit | Agentic Economy',
  },
  {
    id: 'tools',
    label: 'Tools',
    to: '/owner/operations',
    group: 'workspace',
    keywords: ['operations', 'supply', 'provider', 'providers', 'offerings', 'publish', 'host', 'api', 'monetize', 'seller'],
    title: 'Tools | Agentic Economy',
  },
  {
    id: 'earnings',
    label: 'Earnings',
    to: '/owner/operations',
    hash: '#earnings',
    group: 'activity',
    keywords: ['earnings', 'payouts', 'revenue', 'income'],
    title: 'Earnings | Agentic Economy',
  },
  {
    id: 'settings',
    label: 'Settings',
    to: '/owner/settings/workspace',
    group: 'workspace',
    topLevel: true,
    keywords: ['settings', 'account', 'team', 'workspace', 'security'],
    title: 'Settings | Agentic Economy',
  },
  {
    id: 'support',
    label: 'Support',
    to: '/support',
    group: 'workspace',
    keywords: ['support', 'help'],
    title: 'Support | Agentic Economy',
  },
  {
    id: 'status',
    label: 'Status',
    to: '/status',
    group: 'workspace',
    keywords: ['status', 'health', 'uptime', 'operational'],
    title: 'Status | Agentic Economy',
  },
]

export type PublicDestinationId = 'market' | 'docs' | 'for-providers'

export type PublicDestination = Readonly<{
  id: PublicDestinationId
  label: string
  to: string
}>

export const PUBLIC_NAVIGATION: readonly PublicDestination[] = [
  // The same three as the footer's Product column, with the same words.
  { id: 'market', label: SITE_NAV.tools, to: '/market' },
  { id: 'docs', label: SITE_NAV.docs, to: '/developers/api' },
  { id: 'for-providers', label: SITE_NAV.providers, to: '/for-providers' },
]

export function appDestination(id: AppDestinationId): AppDestination {
  const destination = APP_NAVIGATION.find((candidate) => candidate.id === id)
  if (destination === undefined) throw new Error(`Unknown app destination: ${id}`)
  return destination
}

function ownsPath(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`)
}

export function resolveAppDestination(
  pathname: string,
  hash?: string,
): AppDestinationId | null {
  if (pathname === '/market' || ownsPath(pathname, '/tools')) return 'market'
  if (pathname === '/t/new' || ownsPath(pathname, '/t')) return 'chat'
  if (ownsPath(pathname, '/agent-access')) return 'agents'
  if (ownsPath(pathname, '/activity') || ownsPath(pathname, '/calls')) return 'calls'
  if (ownsPath(pathname, '/owner/credit') || ownsPath(pathname, '/fund')) return 'credit'
  if (ownsPath(pathname, '/owner/operations') && (hash === '#earnings' || hash === 'earnings')) return 'earnings'
  if (ownsPath(pathname, '/owner/operations') || ownsPath(pathname, '/owner/supply')) return 'tools'
  if (
    ownsPath(pathname, '/owner/settings')
    || ownsPath(pathname, '/owner/team')
    || ownsPath(pathname, '/owner/workspace')
  ) return 'settings'
  if (pathname === '/support') return 'support'
  if (pathname === '/status') return 'status'
  return null
}

export const APP_NAV_GROUPS: readonly Readonly<{
  id: AppNavGroup
  destination: AppDestination
}>[] = APP_NAVIGATION
  .filter((destination) => destination.topLevel)
  .map((destination) => ({ id: destination.group, destination }))

export function mobileNavigation(): readonly AppDestination[] {
  return APP_NAV_GROUPS.map(({ destination }) => destination)
}
