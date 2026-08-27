import type { OperatorRole } from '@/lib/operator/navigation'

export type OwnerSettingsNavCurrent =
  | 'profile'
  | 'workspace'
  | 'members'
  | 'connections'
  | 'credit'
  | 'payouts'
  | 'developers'

export type OwnerSettingsNavGroupId = 'user' | 'workspace' | 'developers'

/**
 * Explicit registry of every Settings destination: one row per tab carrying
 * its Twenty-style group, deterministic display order, and the data-testid
 * contract for nav renderers (settings tabs, sidebar, command palette all
 * project from these rows).
 */
export type OwnerSettingsNavRegistryEntry = Readonly<{
  id: OwnerSettingsNavCurrent
  label: string
  href: string
  group: OwnerSettingsNavGroupId
  /** Stable display position within the whole nav; lower numbers render first. */
  order: number
  /** Canonical data-testid for any renderer projecting this entry as a control. */
  testid: string
}>

export type OwnerSettingsNavItem = Readonly<{
  id: OwnerSettingsNavCurrent
  label: string
  to: string
}>

export type OwnerSettingsNavGroup = Readonly<{
  id: OwnerSettingsNavGroupId
  label: string
  items: readonly OwnerSettingsNavItem[]
}>

const OWNER_SETTINGS_NAV_GROUP_LABELS = {
  user: 'User',
  workspace: 'Workspace',
  developers: 'Developers',
} satisfies Record<OwnerSettingsNavGroupId, string>

/**
 * Settings is a workspace platform, not a second sidebar. Grouping follows
 * Twenty's User / Workspace / Developers split, mapped onto AE schema homes:
 * Clerk profile, supplier identity, agent callers, provider connections,
 * caller credit, supplier payouts, and caller/API setup.
 */
export const ownerSettingsNavRegistry: readonly OwnerSettingsNavRegistryEntry[] = [
  { id: 'profile', label: 'Profile', href: '/owner/settings', group: 'user', order: 10, testid: 'settings-tab-profile' },
  { id: 'workspace', label: 'General', href: '/owner/settings/workspace', group: 'workspace', order: 20, testid: 'settings-tab-workspace' },
  { id: 'members', label: 'Members', href: '/owner/settings/members', group: 'workspace', order: 30, testid: 'settings-tab-members' },
  { id: 'connections', label: 'Connections', href: '/owner/settings/connections', group: 'workspace', order: 40, testid: 'settings-tab-connections' },
  { id: 'credit', label: 'Credit', href: '/owner/credit', group: 'workspace', order: 50, testid: 'settings-tab-credit' },
  { id: 'payouts', label: 'Payouts', href: '/owner/settings/payouts', group: 'workspace', order: 60, testid: 'settings-tab-payouts' },
  { id: 'developers', label: 'Keys & APIs', href: '/owner/settings/developers', group: 'developers', order: 70, testid: 'settings-tab-developers' },
]

export const ownerSettingsNavGroups: readonly OwnerSettingsNavGroup[] = (
  Object.keys(OWNER_SETTINGS_NAV_GROUP_LABELS) as OwnerSettingsNavGroupId[]
).map((groupId) => ({
  id: groupId,
  label: OWNER_SETTINGS_NAV_GROUP_LABELS[groupId],
  items: ownerSettingsNavRegistry
    .filter((entry) => entry.group === groupId)
    .map(({ id, label, href }) => ({ id, label, to: href })),
}))

export function ownerSettingsNavItems(): readonly OwnerSettingsNavItem[] {
  return ownerSettingsNavRegistry.map(({ id, label, href }) => ({ id, label, to: href }))
}

export function ownerSettingsPathForCurrent(current: OwnerSettingsNavCurrent): string {
  const item = ownerSettingsNavItems().find((candidate) => candidate.id === current)
  return item?.to ?? '/owner/settings'
}

export function ownerSettingsCurrentForPath(path: string): OwnerSettingsNavCurrent {
  const item = ownerSettingsNavItems().find((candidate) => candidate.to === path)
  return item?.id ?? 'profile'
}

export function settingsNavAppliesToRole(role: OperatorRole): boolean {
  return role === 'owner'
}

export const ownerSettingsChrome = {
  title: 'Settings',
  description: 'Account, workspace, callers, and connections.',
} as const
