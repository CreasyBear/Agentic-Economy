import {
  ActivityIcon,
  BarChart3Icon,
  BotIcon,
  BoxesIcon,
  CircleGaugeIcon,
  CircleHelpIcon,
  CreditCardIcon,
  HandCoinsIcon,
  InboxIcon,
  LayoutDashboardIcon,
  ScrollTextIcon,
  SearchCodeIcon,
  SearchIcon,
  SettingsIcon,
  StoreIcon,
  type LucideIcon,
} from 'lucide-react'

import type { AppDestinationId } from '@/lib/navigation/app-navigation'
import type { OperatorRole } from '@/lib/operator/roles'

export type AppSidebarItem = Readonly<{
  href: string
  label: string
  icon: LucideIcon
}>

export const APP_NAVIGATION_ICONS: Readonly<Record<AppDestinationId, LucideIcon>> = {
  market: StoreIcon,
  agents: BotIcon,
  calls: ActivityIcon,
  credit: CreditCardIcon,
  tools: BoxesIcon,
  earnings: HandCoinsIcon,
  settings: SettingsIcon,
  support: CircleHelpIcon,
  status: CircleGaugeIcon,
}

export const ADMIN_NAVIGATION: readonly AppSidebarItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboardIcon },
  { href: '/admin/search', label: 'Search', icon: SearchIcon },
  { href: '/admin/exceptions', label: 'Exceptions', icon: InboxIcon },
  { href: '/admin/providers', label: 'Providers', icon: StoreIcon },
  { href: '/admin/metrics', label: 'Metrics', icon: BarChart3Icon },
  { href: '/admin/audit-events', label: 'Audit', icon: ScrollTextIcon },
]

export const DEVELOPER_NAVIGATION: readonly AppSidebarItem[] = [
  { href: '/developers/discovery', label: 'Discovery', icon: SearchCodeIcon },
]

export function roleNavigation(role: OperatorRole): readonly AppSidebarItem[] {
  if (role === 'admin') return ADMIN_NAVIGATION
  if (role === 'developer') return DEVELOPER_NAVIGATION
  return []
}

export function activeRoleNavigationHref(
  pathname: string,
  items: readonly AppSidebarItem[],
): string | undefined {
  let active: string | undefined
  for (const item of items) {
    if (
      (pathname === item.href || pathname.startsWith(`${item.href}/`))
      && (active === undefined || item.href.length > active.length)
    ) {
      active = item.href
    }
  }
  return active
}
