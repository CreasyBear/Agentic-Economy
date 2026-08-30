import {
  Activity,
  Bot,
  Boxes,
  Building2,
  CircleHelp,
  Gauge,
  KeyRound,
  SearchCode,
  ScrollText,
  Settings,
  Store,
  UploadCloud,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type OperatorRole = 'owner' | 'admin' | 'developer'

export type OperatorNavItem = {
  href: string
  label: string
  icon: LucideIcon
  tier: OperatorNavTier
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
    id: 'records',
    label: 'Records',
    items: [
      { href: '/owner/offerings', label: 'Operations', icon: Boxes, tier: 'core' },
      { href: '/activity', label: 'Calls', icon: Activity, tier: 'core' },
      { href: '/agent-access', label: 'Keys', icon: KeyRound, tier: 'core' },
      { href: '/owner/credit', label: 'Credit', icon: Wallet, tier: 'core' },
      { href: '/owner/status', label: 'Supplier', icon: Building2, tier: 'core' },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    items: [
      { href: '/owner/supply', label: 'Publish', icon: UploadCloud, tier: 'core' },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { href: '/owner/settings', label: 'Settings', icon: Settings, tier: 'core' },
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
  { href: '/', label: 'Home', icon: Gauge },
  { href: '/for-agents', label: 'Agent setup', icon: Bot },
  { href: '/privacy/remove-business', label: 'Help & corrections', icon: CircleHelp },
] as const

export const roleHomeHref: Record<OperatorRole, string> = {
  owner: '/owner/offerings',
  admin: '/admin/index-health',
  developer: '/developers/discovery',
}

export const roleLabel: Record<OperatorRole, string> = {
  owner: 'Supplier workspace',
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

export function listOperatorCommandDestinations(role: OperatorRole): readonly OperatorNavGroup[] {
  const operatorGroups = navGroupsForRole(role)
  const resourceItems: readonly OperatorNavItem[] = operatorUtilityItems.map((item) => ({
    ...item,
    tier: 'core',
  }))
  return [
    ...operatorGroups,
    {
      id: 'resources',
      label: 'Resources',
      items: resourceItems,
    },
  ]
}

export function operatorUtilityItemsForRole(_role: OperatorRole): readonly OperatorUtilityItem[] {
  return operatorUtilityItems
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

/**
 * Sidebar destination that owns this path, including the list page itself.
 * Longest href wins so `/owner/settings/members` stays on Settings, not a
 * shorter sibling.
 */
export function resolveOperatorNavItem(
  role: OperatorRole,
  currentPath: string,
): OperatorNavItem | undefined {
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
