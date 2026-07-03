'use client'

import { Badge } from '@astryxdesign/core/Badge'
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'

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
  const navGroups = navGroupsForRole(operatorRole)
  const utilityItems = operatorUtilityItemsForRole(operatorRole)

  return (
    <SideNav
      collapsible={{ defaultIsCollapsed: false, hasButton: true, buttonLabel: 'Collapse navigation' }}
      header={
        <SideNavHeading
          heading="Agentic Economy"
          subheading={roleLabel[operatorRole]}
          headingHref={roleHomeHref[operatorRole]}
          icon={<span className="flex size-8 items-center justify-center rounded-md bg-card text-xs font-semibold text-primary">AE</span>}
        />
      }
      footer={
        <SideNavSection title="Public">
          {utilityItems.map((item) => {
            const current = isOperatorPathActive(currentPath, item.href)
            const Icon = item.icon
            return <SideNavItem key={item.href} label={item.label} href={item.href} icon={<Icon aria-hidden="true" />} isSelected={current} />
          })}
        </SideNavSection>
      }
    >
      {navGroups.map((group) => (
        <SideNavSection key={group.id} title={group.label}>
          {group.items.map((item) => {
            const current = isOperatorPathActive(currentPath, item.href)
            const badge = formatOperatorNavBadge(navBadges[item.href])
            const Icon = item.icon
            return (
              <SideNavItem
                key={item.href}
                label={item.label}
                href={item.href}
                icon={<Icon aria-hidden="true" />}
                isSelected={current}
                endContent={badge === undefined ? undefined : <Badge variant="neutral" label={badge} />}
                aria-current={current ? 'page' : undefined}
              />
            )
          })}
        </SideNavSection>
      ))}
    </SideNav>
  )
}
