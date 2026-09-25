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
import { APP_NAV_GROUPS, APP_NAVIGATION, resolveAppDestination } from '@/lib/navigation/app-navigation'
import type { OperatorRole } from '@/lib/operator/roles'

import { activeRoleNavigationHref, ADMIN_NAVIGATION, APP_NAVIGATION_ICONS, DEVELOPER_NAVIGATION, roleNavigation } from './app-shell.contracts'
import { AeWorkspaceIdentity } from './AeWorkspaceIdentity'

export type WorkspaceMenuProps = Readonly<{
  operatorRole: OperatorRole
  canAccessAdmin: boolean
}>

const MENU_ITEM_CLASS = 'min-h-touch aria-[current=page]:bg-accent aria-[current=page]:font-semibold'

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
      <DropdownMenuContent align="end" className="min-w-52 max-w-[calc(100vw-1rem)]">
        {APP_NAV_GROUPS.map(({ id, destination }, index) => (
          <DropdownMenuGroup key={id}>
            {index === 0 ? null : <DropdownMenuSeparator />}
            <DropdownMenuLabel>{id === 'workspace' ? 'Workspace' : destination.label}</DropdownMenuLabel>
            {id === 'workspace' ? <AeWorkspaceIdentity inMenu /> : null}
            {APP_NAVIGATION.filter((item) => item.group === id).map((item) => {
              const Icon = APP_NAVIGATION_ICONS[item.id]
              const current = item.id === activeDestinationId
              return (
                <DropdownMenuItem
                  key={item.id}
                  className={MENU_ITEM_CLASS}
                  render={
                    <Link
                      to={item.to}
                      {...(item.hash === undefined ? {} : { hash: item.hash.slice(1) })}
                      aria-current={current ? 'page' : undefined}
                    />
                  }
                >
                  <Icon aria-hidden="true" />
                  {item.label}
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
