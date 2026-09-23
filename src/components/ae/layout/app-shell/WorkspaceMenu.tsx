'use client'

import { SettingsIcon } from 'lucide-react'
import { Link, useLocation } from '@tanstack/react-router'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { APP_NAVIGATION, resolveAppDestination, type AppNavGroup } from '@/lib/navigation/app-navigation'
import type { OperatorRole } from '@/lib/operator/roles'

import { activeRoleNavigationHref, ADMIN_NAVIGATION, APP_NAVIGATION_ICONS, DEVELOPER_NAVIGATION, roleNavigation } from './app-shell.contracts'

export type WorkspaceMenuProps = Readonly<{
  operatorRole: OperatorRole
  canAccessAdmin: boolean
}>

const MENU_GROUPS: readonly { group: AppNavGroup; label: string }[] = [
  { group: 'primary', label: 'Main' },
  { group: 'provider', label: 'Provider' },
  { group: 'utility', label: 'Resources' },
]

export function WorkspaceMenu({ operatorRole, canAccessAdmin }: WorkspaceMenuProps) {
  const { pathname, hash } = useLocation()
  const activeDestinationId = resolveAppDestination(pathname, hash)
  const roleItems = roleNavigation(operatorRole, canAccessAdmin)
  const activeRoleHref = activeRoleNavigationHref(pathname, roleItems)
  const roleGroups = [
    { label: 'Admin', items: canAccessAdmin ? ADMIN_NAVIGATION : [] },
    { label: 'Developer', items: operatorRole === 'developer' ? DEVELOPER_NAVIGATION : [] },
  ]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Workspace menu"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <SettingsIcon aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {MENU_GROUPS.map(({ group, label }, index) => (
          <DropdownMenuGroup key={group}>
            {index === 0 ? null : <DropdownMenuSeparator />}
            <DropdownMenuLabel>{label}</DropdownMenuLabel>
            {APP_NAVIGATION.filter((destination) => destination.group === group).map((destination) => {
              const Icon = APP_NAVIGATION_ICONS[destination.id]
              const current = destination.id === activeDestinationId
              return (
                <DropdownMenuItem
                  key={destination.id}
                  render={
                    <Link
                      to={destination.to}
                      {...(destination.hash === undefined ? {} : { hash: destination.hash.slice(1) })}
                      aria-current={current ? 'page' : undefined}
                    />
                  }
                >
                  <Icon aria-hidden="true" />
                  {destination.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
        ))}
        {roleGroups.map(({ label, items }) => items.length === 0 ? null : (
          <DropdownMenuGroup key={label}>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{label}</DropdownMenuLabel>
            {items.map((item) => {
              const Icon = item.icon
              return (
                <DropdownMenuItem
                  key={item.href}
                  render={<Link to={item.href} activeOptions={{ exact: true }} aria-current={item.href === activeRoleHref ? 'page' : undefined} />}
                >
                  <Icon aria-hidden="true" />
                  {item.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
