'use client'

import { Link } from '@tanstack/react-router'

import { useOperatorSidebarChrome } from '@/components/ae/layout/AeOperatorPage'
import { AeOrganizationSwitcher } from '@/components/ae/layout/AeOrganizationSwitcher'
import { Badge } from '@/components/ui/badge'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { APP_NAVIGATION, resolveAppDestination, type AppNavGroup } from '@/lib/navigation/app-navigation'
import type { OperatorNavBadgeValue, OperatorRole } from '@/lib/operator/roles'

import {
  activeRoleNavigationHref,
  APP_NAVIGATION_ICONS,
  roleNavigation,
} from './app-shell.contracts'

export type AeAppSidebarProps = Readonly<{
  operatorRole: OperatorRole
  canAccessAdmin?: boolean
  pathname: string
  hash: string
}>

const NAV_BUTTON_CLASS = 'rounded-none border-s-[3px] border-transparent px-intra data-[active=true]:border-info data-[active=true]:bg-sidebar-accent/50 data-[active=true]:font-semibold hover:bg-sidebar-accent/50 active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'
const GROUP_LABEL: Readonly<Record<AppNavGroup, string>> = {
  primary: 'Main',
  provider: 'Provider',
  utility: 'Resources',
}

function formatNavBadge(value: OperatorNavBadgeValue): string | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return undefined
    const count = Math.floor(value)
    return count > 99 ? '99+' : String(count)
  }
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

export function AeAppSidebar({ operatorRole, canAccessAdmin = false, pathname, hash }: AeAppSidebarProps) {
  const activeDestinationId = resolveAppDestination(pathname, hash)
  const roleItems = roleNavigation(operatorRole, canAccessAdmin)
  const activeRoleHref = activeDestinationId === null
    ? activeRoleNavigationHref(pathname, roleItems)
    : undefined
  const navBadges = useOperatorSidebarChrome()?.navBadges ?? {}
  const { state, isMobile, open, openMobile, setOpenMobile } = useSidebar()
  const collapsed = !isMobile && state === 'collapsed'
  const expanded = isMobile ? openMobile : open
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar variant="sidebar" collapsible="icon" role="complementary" aria-label="Workspace navigation">
      <nav id="app-sidebar-navigation" aria-label="App navigation" className="flex h-full min-h-0 flex-1 flex-col">
        <SidebarContent>
          {(['primary', 'provider'] as const).map((group) => (
            <SidebarGroup key={group} className="gap-related px-related py-related group-data-[collapsible=icon]:p-2">
              <SidebarGroupLabel className="h-6 rounded-none px-2 font-sans text-xs font-medium text-muted-foreground" render={<span />}>
                {GROUP_LABEL[group]}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {APP_NAVIGATION.filter((destination) => destination.group === group).map((destination) => {
                    const current = destination.id === activeDestinationId
                    const badge = formatNavBadge(navBadges[destination.to])
                    const Icon = APP_NAVIGATION_ICONS[destination.id]
                    return (
                      <SidebarMenuItem key={destination.id}>
                        {collapsed && badge !== undefined ? <span data-slot="collapsed-badge-dot" aria-hidden="true" className="pointer-events-none absolute right-2 top-2 size-2 rounded-full bg-info" /> : null}
                        <SidebarMenuButton
                          isActive={current}
                          tooltip={collapsed && badge !== undefined ? `${destination.label} (${badge})` : destination.label}
                          className={NAV_BUTTON_CLASS}
                          render={
                            <Link
                              activeOptions={{ exact: true, includeHash: true }}
                              to={destination.to}
                              {...(destination.hash === undefined ? {} : { hash: destination.hash.slice(1) })}
                              aria-label={collapsed ? destination.label : undefined}
                              aria-current={current ? 'page' : undefined}
                              onClick={closeMobile}
                            />
                          }
                        >
                          <Icon aria-hidden="true" />
                          <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{destination.label}</span>
                        </SidebarMenuButton>
                        {badge === undefined ? null : <SidebarMenuBadge><Badge variant="secondary">{badge}</Badge></SidebarMenuBadge>}
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
          {roleItems.length === 0 ? null : (
            <SidebarGroup className="gap-related px-related py-related group-data-[collapsible=icon]:p-2">
              <SidebarGroupLabel className="h-6 rounded-none px-2 font-sans text-xs font-medium text-muted-foreground" render={<span />}>
                {operatorRole === 'admin' ? 'Admin' : 'Developer'}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {roleItems.map((item) => {
                    const current = item.href === activeRoleHref
                    const badge = formatNavBadge(navBadges[item.href])
                    const Icon = item.icon
                    return (
                      <SidebarMenuItem key={item.href}>
                        {collapsed && badge !== undefined ? <span data-slot="collapsed-badge-dot" aria-hidden="true" className="pointer-events-none absolute right-2 top-2 size-2 rounded-full bg-info" /> : null}
                        <SidebarMenuButton
                          isActive={current}
                          tooltip={collapsed && badge !== undefined ? `${item.label} (${badge})` : item.label}
                          className={NAV_BUTTON_CLASS}
                          render={<Link to={item.href} activeOptions={{ exact: true, includeHash: true }} aria-label={collapsed ? item.label : undefined} aria-current={current ? 'page' : undefined} onClick={closeMobile} />}
                        >
                          <Icon aria-hidden="true" />
                          <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{item.label}</span>
                        </SidebarMenuButton>
                        {badge === undefined ? null : <SidebarMenuBadge><Badge variant="secondary">{badge}</Badge></SidebarMenuBadge>}
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter className="mt-auto gap-related border-t border-sidebar-border px-related py-related group-data-[collapsible=icon]:p-2">
          <SidebarGroupLabel className="h-6 rounded-none px-2 font-sans text-xs font-medium text-muted-foreground" render={<span />}>
            {GROUP_LABEL.utility}
          </SidebarGroupLabel>
          <SidebarMenu>
            {APP_NAVIGATION.filter((destination) => destination.group === 'utility').map((destination) => {
              const current = destination.id === activeDestinationId
              const Icon = APP_NAVIGATION_ICONS[destination.id]
              return (
                <SidebarMenuItem key={destination.id}>
                  <SidebarMenuButton
                    isActive={current}
                    tooltip={destination.label}
                    render={<Link to={destination.to} activeOptions={{ exact: true, includeHash: true }} aria-label={collapsed ? destination.label : undefined} aria-current={current ? 'page' : undefined} onClick={closeMobile} />}
                  >
                    <Icon aria-hidden="true" />
                    <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{destination.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
          <AeOrganizationSwitcher isCollapsed={collapsed} />
        </SidebarFooter>
      </nav>
      <SidebarRail
        aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
        title={expanded ? 'Collapse navigation (⌘B)' : 'Expand navigation (⌘B)'}
        aria-controls="app-sidebar-navigation"
        aria-expanded={expanded}
      />
    </Sidebar>
  )
}
