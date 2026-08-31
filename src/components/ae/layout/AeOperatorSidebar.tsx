'use client'

import { SearchIcon, UserRoundIcon } from 'lucide-react'
import { UserButton, useUser } from '@clerk/tanstack-react-start'
import { Link } from '@tanstack/react-router'

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
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'
import {
  formatOperatorNavBadge,
  isOperatorPathActive,
  navGroupsForContext,
  navGroupsForRole,
  operatorUtilityItemsForRole,
  roleHomeHref,
  roleLabel,
  type OperatorNavBadges,
  type OperatorRole,
} from '@/lib/operator/navigation'
import type { OperatorContext } from '@/lib/operator/operator-context'

type AeOperatorSidebarProps = {
  operatorRole: OperatorRole
  operatorContext?: OperatorContext
  currentPath: string
  navBadges?: OperatorNavBadges
}

const EMPTY_NAV_BADGES: OperatorNavBadges = {}

function AuthenticatedOwnerAccount({ isCollapsed }: { isCollapsed: boolean }) {
  const { isLoaded, isSignedIn, user } = useUser()
  const identity = user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? 'Signed-in account'
  const accountContext = isLoaded && isSignedIn ? `Signed in as ${identity}` : 'Signed-in account'

  return (
    <div
      role="group"
      aria-label={accountContext}
      className="flex min-h-8 min-w-0 items-center gap-2 rounded-md p-1 group-data-[collapsible=icon]:size-8!"
    >
      <UserButton
        userProfileMode="modal"
        appearance={{
          elements: {
            avatarBox: 'size-6',
            userButtonTrigger: 'size-8 rounded-md focus-visible:ring-2 focus-visible:ring-sidebar-ring',
          },
        }}
      />
      <span className={isCollapsed ? 'sr-only' : 'min-w-0 truncate text-xs text-muted-foreground'}>
        {identity}
      </span>
    </div>
  )
}

function LocalPreviewOwnerAccount({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <div
      role="group"
      aria-label="Local preview account context"
      className="flex min-h-8 min-w-0 items-center gap-2 rounded-md p-2 text-muted-foreground group-data-[collapsible=icon]:size-8!"
    >
      <UserRoundIcon aria-hidden="true" className="size-4 shrink-0" />
      <span className={isCollapsed ? 'sr-only' : 'min-w-0 truncate text-xs'}>Local preview</span>
    </div>
  )
}


export function AeOperatorSidebar({ operatorRole, operatorContext, currentPath, navBadges = EMPTY_NAV_BADGES }: AeOperatorSidebarProps) {
  const { state, isMobile, open, openMobile, setOpenMobile } = useSidebar()
  const openCommand = useOpenOperatorCommand()
  const isCollapsed = !isMobile && state === 'collapsed'
  const expanded = isMobile ? openMobile : open
  const navGroups = operatorContext === undefined
    ? navGroupsForRole(operatorRole)
    : navGroupsForContext(operatorContext, operatorRole)
  const utilityItems = operatorUtilityItemsForRole(operatorRole)
  const localPreview = isLocalE2EAuthBypassEnabled()
  const closeMobileNavigation = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar variant="inset" collapsible="icon" role="complementary" aria-label="Workspace navigation">
      <nav id="operator-sidebar-navigation" aria-label="Operator navigation" className="flex h-full min-h-0 flex-1 flex-col">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip="Agentic Economy workspace">
                <Link
                  to={roleHomeHref[operatorRole]}
                  aria-label={`${roleLabel[operatorRole]} home`}
                  onClick={closeMobileNavigation}
                >
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
                </Link>
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
                    onClick={() => {
                      closeMobileNavigation()
                      openCommand?.()
                    }}
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
                          <Link
                            to={item.href}
                            aria-label={isCollapsed ? item.label : undefined}
                            aria-current={current ? 'page' : undefined}
                            onClick={closeMobileNavigation}
                          >
                            <Icon aria-hidden="true" />
                            <span className={isCollapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{item.label}</span>
                          </Link>
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
                    <Link
                      to={item.href}
                      aria-label={isCollapsed ? item.label : undefined}
                      aria-current={current ? 'page' : undefined}
                      onClick={closeMobileNavigation}
                    >
                      <Icon aria-hidden="true" />
                      <span className={isCollapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
          {operatorRole === 'owner' ? (
            <SidebarMenu>
              <SidebarMenuItem>
                {localPreview
                  ? <LocalPreviewOwnerAccount isCollapsed={isCollapsed} />
                  : <AuthenticatedOwnerAccount isCollapsed={isCollapsed} />}
              </SidebarMenuItem>
            </SidebarMenu>
          ) : null}
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
