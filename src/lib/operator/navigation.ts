import {
  Activity,
  Bot,
  Boxes,
  CircleHelp,
  KeyRound,
  SearchCode,
  ScrollText,
  Settings,
  Store,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { OperatorContext } from '@/lib/operator/operator-context'

export type OperatorRole = 'owner' | 'admin' | 'developer'

export type OperatorNavItem = {
  href: string
  label: string
  icon: LucideIcon
  tier: OperatorNavTier
  mobilePrimary?: boolean
  mobileOrder?: number
}

export type OperatorNavTier = 'core' | 'advanced'

export type OperatorUtilityItem = {
  href: string
  label: string
  icon: LucideIcon
}

export type OperatorNavBadgeValue = number | string | null | undefined

export type OperatorNavBadges = Partial<Record<string, OperatorNavBadgeValue>>

export type OperatorNavGroup = {
  id: string
  label: string
  items: readonly OperatorNavItem[]
}

export type OperatorBreadcrumbItem = {
  label: string
  href?: string
}

const ownerNavGroups: readonly OperatorNavGroup[] = [
  {
    id: 'buy',
    label: 'Buy',
    items: [
      { href: '/activity', label: 'Calls', icon: Activity, tier: 'core', mobilePrimary: true, mobileOrder: 10 },
      { href: '/agent-access', label: 'Agents', icon: KeyRound, tier: 'core', mobilePrimary: true, mobileOrder: 20 },
      { href: '/owner/credit', label: 'Credit', icon: Wallet, tier: 'core' },
    ],
  },
  {
    id: 'supply',
    label: 'Supply',
    items: [
      { href: '/owner/offerings', label: 'Operations', icon: Boxes, tier: 'core', mobilePrimary: true, mobileOrder: 30 },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { href: '/owner/settings', label: 'Account & security', icon: Settings, tier: 'core' },
    ],
  },
] as const

const adminNavGroups: readonly OperatorNavGroup[] = [
  {
    id: 'records',
    label: 'Records',
    items: [
      { href: '/admin/index-health', label: 'Catalog health', icon: Activity, tier: 'core' },
      { href: '/admin/audit-events', label: 'Audit', icon: ScrollText, tier: 'core' },
    ],
  },
] as const

const developerNavGroups: readonly OperatorNavGroup[] = [
  {
    id: 'records',
    label: 'Records',
    items: [
      { href: '/developers/discovery', label: 'Discovery', icon: SearchCode, tier: 'core' },
    ],
  },
] as const

const operatorUtilityItems: readonly OperatorUtilityItem[] = [
  { href: '/market', label: 'Catalog', icon: Store },
  { href: '/for-agents', label: 'Agent setup', icon: Bot },
  { href: '/support', label: 'Help', icon: CircleHelp },
] as const

export const roleHomeHref: Record<OperatorRole, string> = {
  owner: '/owner/offerings',
  admin: '/admin/index-health',
  developer: '/developers/discovery',
}

export const roleLabel: Record<OperatorRole, string> = {
  owner: 'Buy and supply',
  admin: 'Administration',
  developer: 'Developer tools',
}

function showsAdvancedOperatorNav(): boolean {
  if (import.meta.env.DEV) {
    return true
  }

  return import.meta.env.VITE_AE_OPERATOR_ADVANCED_NAV === 'true'
}

export function navGroupsForRole(
  role: OperatorRole,
  options: { advanced?: boolean } = {},
): readonly OperatorNavGroup[] {
  const advanced = options.advanced ?? showsAdvancedOperatorNav()
  const groups = baseNavGroupsForRole(role)

  if (advanced) {
    return groups
  }

  const coreGroups: OperatorNavGroup[] = []
  for (const group of groups) {
    const items = group.items.filter((item) => item.tier === 'core')
    if (items.length > 0) {
      coreGroups.push({ ...group, items })
    }
  }
  return coreGroups
}

export function navGroupsForContext(
  context: Pick<OperatorContext, 'allowedSurfaces'>,
  surface: OperatorRole,
  options: { advanced?: boolean } = {},
): readonly OperatorNavGroup[] {
  return context.allowedSurfaces.includes(surface) ? navGroupsForRole(surface, options) : []
}

function baseNavGroupsForRole(role: OperatorRole): readonly OperatorNavGroup[] {
  switch (role) {
    case 'owner':
      return ownerNavGroups
    case 'admin':
      return adminNavGroups
    case 'developer':
      return developerNavGroups
    default: {
      const exhaustive: never = role
      return exhaustive
    }
  }
}

export function operatorUtilityItemsForRole(_role: OperatorRole): readonly OperatorUtilityItem[] {
  return operatorUtilityItems
}

export function mobileNavItemsForRole(role: OperatorRole): readonly OperatorNavItem[] {
  return baseNavGroupsForRole(role)
    .flatMap((group) => group.items)
    .filter((item) => item.mobilePrimary === true)
    .sort((left, right) => (left.mobileOrder ?? 0) - (right.mobileOrder ?? 0))
}

export function mobileNavItemsForContext(
  context: Pick<OperatorContext, 'allowedSurfaces'>,
  surface: OperatorRole,
): readonly OperatorNavItem[] {
  return context.allowedSurfaces.includes(surface) ? mobileNavItemsForRole(surface) : []
}

export function formatOperatorNavBadge(value: OperatorNavBadgeValue): string | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      return undefined
    }

    const count = Math.floor(value)
    return count > 99 ? '99+' : String(count)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length === 0 ? undefined : trimmed
  }

  return undefined
}

export function isOperatorPathActive(currentPath: string, href: string): boolean {
  if (currentPath === href) {
    return true
  }

  return currentPath.startsWith(`${href}/`)
}

export type OwnerWorkspaceOwner = 'operations' | 'account' | 'agent-setup' | undefined

export function ownerWorkspaceOwnerForPath(pathname: string): OwnerWorkspaceOwner {
  if (pathname === '/owner/offerings' || pathname.startsWith('/owner/offerings/')) return 'operations'
  if (pathname === '/owner/supply' || pathname.startsWith('/owner/supply/')) return 'operations'
  if (pathname === '/owner/status') return 'operations'
  if (
    pathname === '/owner/settings/workspace'
    || pathname === '/owner/settings/connections'
    || pathname === '/owner/settings/payouts'
  ) return 'operations'
  if (pathname === '/owner/settings') return 'account'
  if (pathname === '/owner/settings/developers') return 'agent-setup'
  return undefined
}

/**
 * Sidebar destination that owns this path, including the list page itself.
 * Longest href wins for retained deep routes.
 */
export function resolveOperatorNavItem(
  role: OperatorRole,
  currentPath: string,
): OperatorNavItem | undefined {
  if (role === 'owner') {
    const owner = ownerWorkspaceOwnerForPath(currentPath)
    const canonicalHref = owner === 'operations'
      ? '/owner/offerings'
      : owner === 'account'
        ? '/owner/settings'
        : undefined
    if (canonicalHref !== undefined) {
      return ownerNavGroups.flatMap((group) => group.items).find((item) => item.href === canonicalHref)
    }
    if (currentPath.startsWith('/owner/settings/')) return undefined
  }

  let match: OperatorNavItem | undefined
  for (const group of baseNavGroupsForRole(role)) {
    for (const item of group.items) {
      if (!isOperatorPathActive(currentPath, item.href)) {
        continue
      }
      if (match === undefined || item.href.length > match.href.length) {
        match = item
      }
    }
  }
  return match
}

export function isOperatorNavItemCurrent(
  role: OperatorRole,
  currentPath: string,
  href: string,
): boolean {
  return resolveOperatorNavItem(role, currentPath)?.href === href
}

/**
 * The "List" half of a shell-derived breadcrumb trail: the nearest sidebar
 * destination that is a strict ancestor of `currentPath`. Returns undefined
 * on a list page itself (top of its section, no trail needed) or when no
 * nav item matches. AeOperatorShell appends the page's own title as the
 * terminal "Detail" crumb, so no per-route breadcrumbs prop is needed.
 */
export function resolveOperatorListCrumb(
  role: OperatorRole,
  currentPath: string,
): OperatorBreadcrumbItem | undefined {
  if (role === 'owner' && ownerWorkspaceOwnerForPath(currentPath) === 'operations' && currentPath !== '/owner/offerings') {
    return { label: 'Operations', href: '/owner/offerings' }
  }
  for (const group of baseNavGroupsForRole(role)) {
    for (const item of group.items) {
      if (currentPath.startsWith(`${item.href}/`)) {
        return { label: item.label, href: item.href }
      }
    }
  }

  return undefined
}

/** Derives the operator role from a pathname prefix, for chrome (404, pending, error) that renders before a route's own operatorRole is known. */
export function operatorRoleForPath(pathname: string): OperatorRole | undefined {
  if (pathname.startsWith('/owner')) {
    return 'owner'
  }

  if (pathname.startsWith('/admin')) {
    return 'admin'
  }

  if (pathname.startsWith('/developers')) {
    return 'developer'
  }

  return undefined
}
