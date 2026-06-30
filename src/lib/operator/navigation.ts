import {
  Activity,
  ClipboardList,
  Contact,
  CreditCard,
  Inbox,
  LockKeyhole,
  ScrollText,
  Search,
  Wrench,
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

export type OperatorCommandDestination = OperatorNavItem & {
  hint?: string
}

export type OperatorNavGroup = {
  id: string
  label: string
  items: readonly OperatorNavItem[]
}

export type OperatorSectionId = 'billing' | 'monetization'

export type OperatorSectionNavItem = {
  href: string
  label: string
  description?: string
}

export type OperatorBreadcrumbItem = {
  label: string
  href?: string
}

const ownerNavGroups: readonly OperatorNavGroup[] = [
  {
    id: 'work',
    label: 'Work',
    items: [
      { href: '/owner/status', label: 'Status', icon: Activity, tier: 'core' },
      { href: '/owner/inquiries', label: 'Inquiries', icon: Inbox, tier: 'core' },
      { href: '/owner/actions', label: 'Contact follow-ups', icon: Contact, tier: 'advanced' },
      { href: '/owner/business-actions', label: 'Business actions', icon: Wrench, tier: 'advanced' },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [{ href: '/owner/billing', label: 'Billing', icon: CreditCard, tier: 'advanced' }],
  },
] as const

const adminNavGroups: readonly OperatorNavGroup[] = [
  {
    id: 'review',
    label: 'Review',
    items: [
      { href: '/admin/claims', label: 'Claims', icon: ClipboardList, tier: 'core' },
      { href: '/admin/audit-events', label: 'Audit events', icon: ScrollText, tier: 'advanced' },
      { href: '/admin/index-health', label: 'Index health', icon: Activity, tier: 'advanced' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { href: '/admin/business-actions', label: 'Business actions', icon: Wrench, tier: 'advanced' },
      { href: '/admin/protected-actions', label: 'Protected actions', icon: LockKeyhole, tier: 'advanced' },
      { href: '/admin/inquiries', label: 'Inquiries', icon: Inbox, tier: 'core' },
    ],
  },
  {
    id: 'monetization',
    label: 'Monetization',
    items: [{ href: '/admin/monetization', label: 'Billing reconstruction', icon: CreditCard, tier: 'advanced' }],
  },
] as const

const developerNavGroups: readonly OperatorNavGroup[] = [
  {
    id: 'builder',
    label: 'Builder',
    items: [{ href: '/developers/discovery', label: 'Discovery', icon: ScrollText, tier: 'core' }],
  },
] as const

const publicCommandDestinations: readonly OperatorCommandDestination[] = [
  { href: '/', label: 'Ask', icon: Search, tier: 'core', hint: 'Public' },
  { href: '/registry', label: 'Browse services', icon: ScrollText, tier: 'core', hint: 'Public' },
] as const

export const billingSectionNav: readonly OperatorSectionNavItem[] = [
  {
    href: '/owner/billing',
    label: 'Overview',
    description: 'Read billing state and receipts',
  },
  {
    href: '/owner/billing/activate',
    label: 'Activate',
    description: 'Start paid activation when an offer exists',
  },
] as const

export const monetizationSectionNav: readonly OperatorSectionNavItem[] = [
  {
    href: '/admin/monetization',
    label: 'Reconstruction',
    description: 'Offers, evidence, and operation queue',
  },
] as const

export const roleHomeHref: Record<OperatorRole, string> = {
  owner: '/owner/status',
  admin: '/admin/claims',
  developer: '/developers/discovery',
}

export const roleLabel: Record<OperatorRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  developer: 'Builder',
}

export function showsAdvancedOperatorNav(): boolean {
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

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.tier === 'core'),
    }))
    .filter((group) => group.items.length > 0)
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
  const operatorGroups = baseNavGroupsForRole(role)
  return [
    ...operatorGroups,
    {
      id: 'public',
      label: 'Public',
      items: publicCommandDestinations,
    },
  ]
}

export function isOperatorPathActive(currentPath: string, href: string): boolean {
  if (currentPath === href) {
    return true
  }

  return currentPath.startsWith(`${href}/`)
}

export function isOperatorSectionPathActive(
  currentPath: string,
  href: string,
  sectionId: OperatorSectionId,
): boolean {
  if (sectionId === 'billing' && href === '/owner/billing') {
    return currentPath === '/owner/billing'
  }

  if (sectionId === 'monetization' && href === '/admin/monetization') {
    return currentPath === '/admin/monetization'
  }

  return isOperatorPathActive(currentPath, href)
}

export function resolveOperatorSection(currentPath: string): OperatorSectionId | undefined {
  if (currentPath.startsWith('/owner/billing')) {
    return 'billing'
  }

  if (currentPath.startsWith('/admin/monetization')) {
    return 'monetization'
  }

  return undefined
}

export function sectionNavForSection(sectionId: OperatorSectionId): readonly OperatorSectionNavItem[] {
  switch (sectionId) {
    case 'billing':
      return billingSectionNav
    case 'monetization':
      return monetizationSectionNav
    default: {
      const exhaustive: never = sectionId
      return exhaustive
    }
  }
}

export function sectionLabel(sectionId: OperatorSectionId): string {
  switch (sectionId) {
    case 'billing':
      return 'Billing'
    case 'monetization':
      return 'Monetization'
    default: {
      const exhaustive: never = sectionId
      return exhaustive
    }
  }
}
