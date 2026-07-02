'use client'

import { LockKeyhole } from 'lucide-react'

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
} from '@/components/ui/sidebar'
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
  role: OperatorRole
  currentPath: string
  navBadges?: OperatorNavBadges
}

export function AeOperatorSidebar({ role, currentPath, navBadges = {} }: AeOperatorSidebarProps) {
  const navGroups = navGroupsForRole(role)
  const utilityItems = operatorUtilityItemsForRole(role)

  return (
    <Sidebar collapsible="icon" className="ae-operator-sidebar border-r border-sidebar-border">
      <SidebarHeader className="ae-operator-sidebar__header gap-3 p-4">
        <a
          href={roleHomeHref[role]}
          className="ae-operator-sidebar__brand-link flex min-h-10 items-center gap-2 px-2 font-heading text-sm font-semibold tracking-normal text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <span className="ae-operator-sidebar__brand-mark flex size-8 shrink-0 items-center justify-center bg-sidebar-primary text-sidebar-primary-foreground">
            <LockKeyhole aria-hidden="true" className="size-4" />
          </span>
          <span className="truncate group-data-[collapsible=icon]:hidden">
            Agentic Economy · {roleLabel[role]}
          </span>
        </a>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.id} className="py-2">
            <SidebarGroupLabel className="px-2 text-xs font-medium uppercase tracking-[var(--ae-public-tracking-mono-label)] text-muted-foreground">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const current = isOperatorPathActive(currentPath, item.href)
                  const badge = formatOperatorNavBadge(navBadges[item.href])

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={current}
                        tooltip={item.label}
                        className={`ae-operator-sidebar__nav-link min-h-10${badge === undefined ? '' : ' pr-8'}`}
                      >
                        <a href={item.href} aria-current={current ? 'page' : undefined}>
                          <Icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </a>
                      </SidebarMenuButton>
                      {badge === undefined ? null : (
                        <SidebarMenuBadge aria-label={`${badge} ${item.label}`}>
                          {badge}
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

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarGroup className="p-0">
          <SidebarGroupLabel className="px-2 text-xs font-medium uppercase tracking-[var(--ae-public-tracking-mono-label)] text-muted-foreground">
            Public
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {utilityItems.map((item) => {
                const Icon = item.icon
                const current = isOperatorPathActive(currentPath, item.href)

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={current}
                      tooltip={item.label}
                      className="ae-operator-sidebar__nav-link min-h-10"
                    >
                      <a href={item.href} aria-current={current ? 'page' : undefined}>
                        <Icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
