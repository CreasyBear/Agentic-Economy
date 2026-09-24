import type { ReactNode } from 'react'

export type SettingsNavItem = Readonly<{ label: string; href: string }>
export type SettingsNavGroup = Readonly<{ label: string; items: readonly SettingsNavItem[] }>

export const settingsNavigation: readonly SettingsNavGroup[] = [
  { label: 'Account', items: [
    { label: 'Profile & security', href: '/owner/settings/account' },
    { label: 'Notifications', href: '/owner/settings/notifications' },
    { label: 'Privacy', href: '/owner/settings/privacy' },
    { label: 'Security activity', href: '/owner/settings/security-activity' },
  ] },
  { label: 'Workspace', items: [
    { label: 'Business profile', href: '/owner/settings/workspace' },
    { label: 'Team & roles', href: '/owner/settings/team' },
    { label: 'Tax', href: '/owner/settings/tax' },
  ] },
  { label: 'Billing', items: [
    { label: 'Payment methods', href: '/owner/settings/payment-methods' },
    { label: 'Receipts & invoices', href: '/owner/settings/receipts' },
    { label: 'Spending defaults', href: '/owner/settings/spending' },
  ] },
  { label: 'Developers', items: [
    { label: 'Agent keys', href: '/owner/settings/agent-keys' },
    { label: 'Integrations', href: '/owner/settings/integrations' },
  ] },
]
// Keep the compact mobile index intact; desktop gives Clerk's routed pages their own links.
export const settingsSidebarNavigation: readonly SettingsNavGroup[] = settingsNavigation.map(group =>
  group.label === 'Account'
    ? { ...group, items: [
      { label: 'Profile', href: '/owner/settings/account' },
      { label: 'Security', href: '/owner/settings/account/security' },
      ...group.items.slice(1),
    ] }
    : group,
)


export type SettingsShellProps = Readonly<{
  pathname: string
  children: ReactNode
}>
