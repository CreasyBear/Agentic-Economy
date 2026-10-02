'use client'

import { CommandGroup, CommandItem } from '@/components/ui/command'

import type { CommandNavigationItem, CommandQuickAction } from '../tools-search-page.contracts'

import './CommandResultsComposition.css'

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
    <CommandGroup heading="Navigation" className="arc-market arc-command-result-group">
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
            className="arc-command-result-row"
          >
            <Icon aria-hidden="true" className="size-5 shrink-0 arc-command-result-icon" />
            <span className="arc-command-result-copy">
              <span className="arc-command-result-title">{item.label}</span>
              <span className={item.opensSettings !== undefined
                ? 'arc-command-result-meta'
                : 'arc-command-result-meta arc-command-result-reference'}>
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
    <CommandGroup heading="Quick Actions" className="arc-market arc-command-result-group">
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
            className="arc-command-result-row"
          >
            <Icon aria-hidden="true" className="size-5 shrink-0 arc-command-result-icon" />
            <span className="arc-command-result-copy">
              <span className="arc-command-result-title">{action.label}</span>
              <span className="arc-command-result-meta">{action.description}</span>
            </span>
          </CommandItem>
        )
      })}
    </CommandGroup>
  )
}
