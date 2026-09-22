export type AppDestinationId =
  | 'market'
  | 'agents'
  | 'calls'
  | 'credit'
  | 'tools'
  | 'earnings'
  | 'settings'
  | 'support'
  | 'status'

export type AppNavGroup = 'primary' | 'provider' | 'utility'

export type AppDestination = Readonly<{
  id: AppDestinationId
  label: string
  to: string
  hash?: string
  group: AppNavGroup
  mobileRank?: number
  keywords: readonly string[]
  title: string
}>

export const APP_NAVIGATION: readonly AppDestination[] = [
  {
    id: 'market',
    label: 'Market',
    to: '/market',
    group: 'primary',
    mobileRank: 1,
    keywords: ['market', 'catalogue', 'catalog', 'browse', 'tools'],
    title: 'Market | Agentic Economy',
  },
  {
    id: 'agents',
    label: 'Agents',
    to: '/agent-access',
    group: 'primary',
    mobileRank: 2,
    keywords: ['agent', 'access', 'principal', 'tokens', 'keys', 'credentials'],
    title: 'Agents | Agentic Economy',
  },
  {
    id: 'calls',
    label: 'Calls',
    to: '/activity',
    group: 'primary',
    mobileRank: 3,
    keywords: ['activity', 'calls', 'history', 'runs', 'executions'],
    title: 'Calls | Agentic Economy',
  },
  {
    id: 'credit',
    label: 'Credit',
    to: '/owner/credit',
    group: 'primary',
    mobileRank: 4,
    keywords: ['credit', 'balance', 'billing', 'top up', 'funds', 'money'],
    title: 'Credit | Agentic Economy',
  },
  {
    id: 'tools',
    label: 'Tools',
    to: '/owner/operations',
    group: 'provider',
    keywords: ['operations', 'supply', 'provider', 'providers', 'offerings', 'publish', 'host', 'api', 'monetize', 'seller'],
    title: 'Tools | Agentic Economy',
  },
  {
    id: 'earnings',
    label: 'Earnings',
    to: '/owner/operations',
    hash: '#earnings',
    group: 'provider',
    keywords: ['earnings', 'payouts', 'revenue', 'income'],
    title: 'Earnings | Agentic Economy',
  },
  {
    id: 'settings',
    label: 'Settings',
    to: '/owner/settings',
    group: 'utility',
    keywords: ['settings', 'account', 'team', 'workspace', 'security'],
    title: 'Settings | Agentic Economy',
  },
  {
    id: 'support',
    label: 'Support',
    to: '/support',
    group: 'utility',
    keywords: ['support', 'help'],
    title: 'Support | Agentic Economy',
  },
  {
    id: 'status',
    label: 'Status',
    to: '/status',
    group: 'utility',
    keywords: ['status', 'health', 'uptime', 'operational'],
    title: 'Status | Agentic Economy',
  },
]

export type PublicDestinationId = 'market' | 'for-agents' | 'for-providers'

export type PublicDestination = Readonly<{
  id: PublicDestinationId
  label: string
  to: string
}>

export const PUBLIC_NAVIGATION: readonly PublicDestination[] = [
  { id: 'market', label: 'Market', to: '/market' },
  { id: 'for-agents', label: 'For agents', to: '/for-agents' },
  { id: 'for-providers', label: 'For providers', to: '/for-providers' },
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

export function mobileNavigation(): {
  primary: readonly AppDestination[]
  more: readonly AppDestination[]
} {
  return {
    primary: APP_NAVIGATION
      .filter((destination) => destination.mobileRank !== undefined)
      .sort((left, right) => (left.mobileRank ?? 0) - (right.mobileRank ?? 0)),
    more: APP_NAVIGATION.filter((destination) => destination.mobileRank === undefined),
  }
}
