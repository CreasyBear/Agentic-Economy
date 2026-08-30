'use client'

import { SearchIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'

import { useOpenOperatorCommand } from '@/components/ae/layout/operator-command-context'
import { AECON_MARK_SRC, aeconMarkClassName } from '@/content/brand-assets'
import {
  formatOperatorNavBadge,
  isOperatorPathActive,
  navGroupsForRole,
  operatorUtilityItemsForRole,
  roleHomeHref,
  roleLabel,
  type OperatorNavBadges,
  type OperatorRole,
} from '@/lib/operator/navigation'

type AeOperatorSidebarProps = {
  operatorRole: OperatorRole
  currentPath: string
  navBadges?: OperatorNavBadges
}

const EMPTY_NAV_BADGES: OperatorNavBadges = {}


export function AeOperatorSidebar({ operatorRole, currentPath, navBadges = EMPTY_NAV_BADGES }: AeOperatorSidebarProps) {
  const { state, isMobile, open, openMobile } = useSidebar()
  const openCommand = useOpenOperatorCommand()
  const isCollapsed = state === 'collapsed'
  const expanded = isMobile ? openMobile : open
  const navGroups = navGroupsForRole(operatorRole)
  const utilityItems = operatorUtilityItemsForRole(operatorRole)

  return (
    <Sidebar variant="inset" collapsible="icon" role="complementary" aria-label="Workspace navigation">
      <nav id="operator-sidebar-navigation" aria-label="Operator navigation" className="flex h-full min-h-0 flex-1 flex-col">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip="Agentic Economy workspace">
                <a href={roleHomeHref[operatorRole]} aria-label={`${roleLabel[operatorRole]} home`}>
                  <img
                    src={AECON_MARK_SRC}
                    alt=""
                    aria-hidden="true"
                    className={aeconMarkClassName.light}
                  />
                  <span className={isCollapsed ? 'sr-only' : 'grid min-w-0 gap-0.5'}>
                    <span className="truncate text-sm font-semibold text-sidebar-foreground">AECON</span>
                    <span className="truncate text-xs text-muted-foreground">{roleLabel[operatorRole]}</span>
                  </span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    tooltip="Search"
                    onClick={() => openCommand?.()}
                  >
                    <SearchIcon aria-hidden="true" />
                    <span className={isCollapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>Search</span>
                    {isCollapsed ? null : (
                      <kbd className="ms-auto font-mono text-[0.6875rem] text-muted-foreground">/</kbd>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {navGroups.map((group) => (
            <SidebarGroup key={group.id}>
              <SidebarGroupLabel asChild>
                <span>{group.label}</span>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const current = isOperatorPathActive(currentPath, item.href)
                    const badge = formatOperatorNavBadge(navBadges[item.href])
                    const Icon = item.icon

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={current} tooltip={item.label}>
                          <a
                            href={item.href}
                            aria-label={isCollapsed ? item.label : undefined}
                            aria-current={current ? 'page' : undefined}
                          >
                            <Icon aria-hidden="true" />
                            <span className={isCollapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{item.label}</span>
                          </a>
                        </SidebarMenuButton>
                        {badge === undefined ? null : (
                          <SidebarMenuBadge>
                            <Badge variant="secondary">{badge}</Badge>
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="mt-auto">
          <SidebarGroupLabel asChild>
            <span>Resources</span>
          </SidebarGroupLabel>
          <SidebarMenu>
            {utilityItems.map((item) => {
              const current = isOperatorPathActive(currentPath, item.href)
              const Icon = item.icon

              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={current} tooltip={item.label}>
                    <a
                      href={item.href}
                      aria-label={isCollapsed ? item.label : undefined}
                      aria-current={current ? 'page' : undefined}
                    >
                      <Icon aria-hidden="true" />
                      <span className={isCollapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{item.label}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarFooter>
      </nav>
      <SidebarRail
        aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
        aria-controls="operator-sidebar-navigation"
        aria-expanded={expanded}
      />
    </Sidebar>
  )
}
