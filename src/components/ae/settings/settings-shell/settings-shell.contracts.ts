import type { ReactNode } from 'react'

export type SettingsNavItem = Readonly<{ label: string; href: string; title?: string }>
export type SettingsNavGroup = Readonly<{ label: string; shortLabel: string; items: readonly SettingsNavItem[] }>

export const settingsNavigation: readonly SettingsNavGroup[] = [
  { label: 'Account', shortLabel: 'Account', items: [
    { label: 'Business profile', href: '/owner/settings/workspace' },
    { label: 'Team & roles', href: '/owner/settings/team' },
  ] },
  { label: 'Agents & Tools', shortLabel: 'Agents & Tools', items: [
    { label: 'Agent keys', href: '/owner/settings/agent-keys' },
    { label: 'Provider connections', href: '/owner/settings/integrations' },
  ] },
  { label: 'Spending, billing & tax', shortLabel: 'Billing', items: [
    { label: 'Spending defaults', href: '/owner/settings/spending' },
    { label: 'Receipts & invoices', href: '/owner/settings/receipts' },
    { label: 'Tax', href: '/owner/settings/tax' },
  ] },
  { label: 'Account preferences', shortLabel: 'Preferences', items: [
    { label: 'Profile', href: '/owner/settings/account' },
    { label: 'Notifications', href: '/owner/settings/notifications' },
  ] },
  { label: 'Privacy & security', shortLabel: 'Security', items: [
    { label: 'Privacy', href: '/owner/settings/privacy' },
    { label: 'Sign-in security', href: '/owner/settings/account/security', title: 'Security' },
    { label: 'Security activity', href: '/owner/settings/security-activity' },
  ] },
]

/** Clerk owns nested profile routes; the most specific destination owns their label. */
export function settingsDestinationForPath(pathname: string): SettingsNavItem | undefined {
  const path = pathname.replace(/\/$/u, '')
  let destination: SettingsNavItem | undefined
  for (const item of settingsNavigation.flatMap(group => group.items)) {
    if ((path === item.href || path.startsWith(`${item.href}/`))
      && (destination === undefined || item.href.length > destination.href.length)) destination = item
  }
  return destination
}

export type SettingsShellProps = Readonly<{
  pathname: string
  children: ReactNode
}>
