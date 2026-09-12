'use client'

import { useMemo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { UserButton, useUser } from '@clerk/tanstack-react-start'
import { Link, useRouter } from '@tanstack/react-router'

import { Badge } from '@/components/ui/badge'
import { SiteMarker } from '@/components/ui/site-marker'
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

import { useOperatorSidebarChrome } from '@/components/ae/layout/AeOperatorPage'
import {
  ownerWorkspaceOwnerForPath,
  roleHomeHref,
  roleLabel,
  type OperatorNavBadges,
  type OperatorNavBadgeValue,
  type OperatorRole,
} from '@/lib/operator/roles'
import type { OperatorContext } from '@/lib/operator/operator-context'

type SidebarNavItem = { href: string; label: string; icon: LucideIcon; order: number }
type SidebarNavGroup = { id: string; label: string; groupOrder: number; items: SidebarNavItem[] }
type SidebarUtilityItem = { href: string; label: string; icon: LucideIcon }

function showsAdvancedOperatorNav(): boolean {
  if (import.meta.env.DEV) {
    return true
  }

  return import.meta.env.VITE_AE_OPERATOR_ADVANCED_NAV === 'true'
}

/** Mirrors the pre-staticData resolveOperatorNavItem canonicalization: owner
 * routes under /owner/supply/* and /owner/settings/* are not route-tree
 * descendants of the sidebar item that owns them, so the owner workspace
 * mapping is still needed to pick the right "current" nav item. */
function resolveCurrentHref(role: OperatorRole, currentPath: string, hrefs: readonly string[]): string | undefined {
  if (role === 'owner') {
    const owner = ownerWorkspaceOwnerForPath(currentPath)
    const canonicalHref = owner === 'operations' ? '/owner/offerings' : owner === 'account' ? '/owner/settings' : undefined
    if (canonicalHref !== undefined) {
      return hrefs.includes(canonicalHref) ? canonicalHref : undefined
    }
    if (currentPath.startsWith('/owner/settings/')) return undefined
  }

  let match: string | undefined
  for (const href of hrefs) {
    if (currentPath !== href && !currentPath.startsWith(`${href}/`)) continue
    if (match === undefined || href.length > match.length) match = href
  }
  return match
}

function isPathActive(currentPath: string, href: string): boolean {
  return currentPath === href || currentPath.startsWith(`${href}/`)
}

function formatNavBadge(value: OperatorNavBadgeValue): string | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      return undefined
    }

    const count = Math.floor(value)
    return count > 99 ? '99+' : String(count)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length === 0 ? undefined : trimmed
  }

  return undefined
}

type AeOperatorSidebarProps = {
  operatorRole: OperatorRole
  operatorContext?: OperatorContext
  currentPath: string
  navBadges?: OperatorNavBadges
  suppressSurfaceNavigation?: boolean
  className?: string
}

const EMPTY_NAV_BADGES: OperatorNavBadges = {}

function useResolvedNavBadges(navBadges: OperatorNavBadges | undefined): OperatorNavBadges {
  const sidebarChrome = useOperatorSidebarChrome()
  return navBadges ?? sidebarChrome?.navBadges ?? EMPTY_NAV_BADGES
}
const OPERATOR_NAV_BUTTON_CLASS = 'rounded-none border-s-2 border-transparent px-intra data-[active=true]:border-info data-[active=true]:bg-sidebar-accent/50 data-[active=true]:font-semibold hover:bg-sidebar-accent/50'

function AuthenticatedOwnerAccount({ isCollapsed }: { isCollapsed: boolean }) {
  const { isLoaded, isSignedIn, user } = useUser()
  const identity = user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? 'Signed-in account'
  const accountContext = isLoaded && isSignedIn ? `Signed in as ${identity}` : 'Signed-in account'

  return (
    <div
      role="group"
      aria-label={accountContext}
      className="flex min-h-8 min-w-0 items-center gap-2 p-1 group-data-[collapsible=icon]:size-8!"
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

export function AeOperatorSidebar({ operatorRole, operatorContext, currentPath, navBadges: navBadgesProp, suppressSurfaceNavigation = false, className }: AeOperatorSidebarProps) {
  const navBadges = useResolvedNavBadges(navBadgesProp)
  const { state, isMobile, open, openMobile, setOpenMobile } = useSidebar()
  const isCollapsed = !isMobile && state === 'collapsed'
  const expanded = isMobile ? openMobile : open
  const router = useRouter()

  const navGroups = useMemo<SidebarNavGroup[]>(() => {
    if (suppressSurfaceNavigation) return []
    if (operatorContext !== undefined && !operatorContext.allowedSurfaces.includes(operatorRole)) return []

    const advanced = showsAdvancedOperatorNav()
    const groupsById = new Map<string, SidebarNavGroup>()

    for (const route of Object.values(router.routesByPath)) {
      const nav = route.options.staticData?.nav
      const operator = nav?.operator
      if (operator === undefined || nav === undefined) continue
      if (!operator.roles.includes(operatorRole)) continue
      if (!advanced && operator.tier !== 'core') continue

      const item: SidebarNavItem = { href: route.fullPath, label: nav.label, icon: operator.icon, order: operator.order }
      const existing = groupsById.get(operator.group)
      if (existing === undefined) {
        groupsById.set(operator.group, { id: operator.group, label: operator.group, groupOrder: operator.groupOrder, items: [item] })
      } else {
        existing.items.push(item)
      }
    }

    return Array.from(groupsById.values())
      .sort((left, right) => left.groupOrder - right.groupOrder)
      .map((group) => ({ ...group, items: group.items.slice().sort((left, right) => left.order - right.order) }))
  }, [router, operatorRole, operatorContext, suppressSurfaceNavigation])

  const utilityItems = useMemo<SidebarUtilityItem[]>(() => {
    const items: Array<SidebarUtilityItem & { order: number }> = []
    for (const route of Object.values(router.routesByPath)) {
      const nav = route.options.staticData?.nav
      const utility = nav?.operatorUtility
      if (utility === undefined || nav === undefined) continue
      if (!utility.roles.includes(operatorRole)) continue
      items.push({ href: route.fullPath, label: nav.label, icon: utility.icon, order: utility.order })
    }
    return items.sort((left, right) => left.order - right.order)
  }, [router, operatorRole])

  const currentHref = useMemo(
    () => resolveCurrentHref(operatorRole, currentPath, navGroups.flatMap((group) => group.items.map((item) => item.href))),
    [operatorRole, currentPath, navGroups],
  )

  const closeMobileNavigation = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar variant="sidebar" collapsible="icon" role="complementary" aria-label="Workspace navigation" className={className}>
      <nav id="operator-sidebar-navigation" aria-label="Operator navigation" className="flex h-full min-h-0 flex-1 flex-col">
        <SidebarHeader className="px-related pt-intra">
          {/* The frame header owns the brand mark; the rail names the mode only. */}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip={roleLabel[operatorRole]} className="h-14 rounded-none border-b border-sidebar-border px-1 hover:bg-transparent">
                <Link
                  to={roleHomeHref[operatorRole]}
                  aria-label={operatorRole === 'owner' ? 'Tools home' : `${roleLabel[operatorRole]} home`}
                  onClick={closeMobileNavigation}
                >
                  <span className={isCollapsed ? 'sr-only' : 'flex items-center gap-2 truncate font-sans text-xs font-medium text-muted-foreground'}>
                    <SiteMarker tone="info" visible />
                    {roleLabel[operatorRole]}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {navGroups.map((group) => (
            <SidebarGroup key={group.id} className="gap-related px-related py-related">
              <SidebarGroupLabel asChild className="h-6 rounded-none px-2 font-sans text-xs font-medium text-muted-foreground">
                <span>{group.label}</span>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const current = item.href === currentHref
                    const badge = formatNavBadge(navBadges[item.href])
                    const Icon = item.icon

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={current} tooltip={item.label} className={OPERATOR_NAV_BUTTON_CLASS}>
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
        <SidebarFooter className="mt-auto gap-related border-t border-sidebar-border px-related py-related">
          <SidebarGroupLabel asChild className="h-6 rounded-none px-2 font-sans text-xs font-medium text-muted-foreground">
            <span>Resources</span>
          </SidebarGroupLabel>
          <SidebarMenu>
            {utilityItems.map((item) => {
              const current = isPathActive(currentPath, item.href)
              const Icon = item.icon

              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={current} tooltip={item.label} className={OPERATOR_NAV_BUTTON_CLASS}>
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
          <SidebarMenu>
            <SidebarMenuItem>
              <AuthenticatedOwnerAccount isCollapsed={isCollapsed} />
            </SidebarMenuItem>
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
