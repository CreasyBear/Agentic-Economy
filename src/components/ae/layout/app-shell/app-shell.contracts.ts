import {
  ActivityIcon,
  BotIcon,
  BoxesIcon,
  CircleGaugeIcon,
  CircleHelpIcon,
  CreditCardIcon,
  HandCoinsIcon,
  ScrollTextIcon,
  SearchCodeIcon,
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
  { href: '/admin/index-health', label: 'Catalog health', icon: ActivityIcon },
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
