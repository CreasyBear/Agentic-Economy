'use client'

import { CommandGroup, CommandItem } from '@/components/ui/command'

import type { CommandNavigationItem, CommandQuickAction } from '../tools-search-page.contracts'

export type CommandNavGroupProps = Readonly<{
  isActive: boolean
  navItems: readonly CommandNavigationItem[]
  onNavigate?: (href: string) => void
  onOpenSettings?: (scope: 'personal' | 'workspace') => void
  onClearPendingIntent: () => void
}>

export function CommandNavGroup({
  isActive,
  navItems,
  onNavigate,
  onOpenSettings,
  onClearPendingIntent,
}: CommandNavGroupProps) {
  if (navItems.length === 0) return null
  return (
    <CommandGroup heading="Navigation">
      {navItems.map((item) => {
        const Icon = item.icon
        const value = `ae-nav:${item.href}`
        return (
          <CommandItem
            key={value}
            value={value}
            disabled={!isActive}
            onSelect={() => {
              onClearPendingIntent()
              if (item.opensSettings !== undefined) onOpenSettings?.(item.opensSettings)
              else onNavigate?.(item.href)
            }}
            className="min-h-touch gap-intra px-gutter py-intra"
          >
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">{item.label}</span>
              <span className="truncate font-mono text-xs text-muted-foreground">
                {item.opensSettings !== undefined ? 'Opens here · task unchanged' : item.href}
              </span>
            </span>
          </CommandItem>
        )
      })}
    </CommandGroup>
  )
}

export type CommandQuickActionsGroupProps = Readonly<{
  isActive: boolean
  quickActions: readonly CommandQuickAction[]
  onNavigate?: (href: string) => void
  onToggleTheme?: () => void
  onClearPendingIntent: () => void
}>

export function CommandQuickActionsGroup({
  isActive,
  quickActions,
  onNavigate,
  onToggleTheme,
  onClearPendingIntent,
}: CommandQuickActionsGroupProps) {
  if (quickActions.length === 0) return null
  return (
    <CommandGroup heading="Quick Actions">
      {quickActions.map((action) => {
        const Icon = action.icon
        const value = `ae-action:${action.id}`
        return (
          <CommandItem
            key={value}
            value={value}
            disabled={!isActive}
            onSelect={() => {
              onClearPendingIntent()
              if (action.id === 'toggle-theme') onToggleTheme?.()
              else if (action.href !== undefined) onNavigate?.(action.href)
            }}
            className="min-h-touch gap-intra px-gutter py-intra"
          >
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">{action.label}</span>
              <span className="truncate text-xs text-muted-foreground">{action.description}</span>
            </span>
          </CommandItem>
        )
      })}
    </CommandGroup>
  )
}
