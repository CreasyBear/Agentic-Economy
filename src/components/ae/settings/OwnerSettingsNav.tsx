'use client'

import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ownerSettingsNavGroups,
  ownerSettingsNavItems,
  type OwnerSettingsNavCurrent,
} from '@/lib/operator/settings-navigation'

export function OwnerSettingsNav({ current }: { current: OwnerSettingsNavCurrent }) {
  const items = ownerSettingsNavItems()
  const tabRowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tabRow = tabRowRef.current

    if (!tabRow) return

    const revealCurrentTab = () => {
      const currentTab = tabRow.querySelector('[aria-current="page"]')

      if (!(currentTab instanceof HTMLElement)) return

      const currentTabLeft = currentTab.offsetLeft
      const currentTabRight = currentTabLeft + currentTab.offsetWidth

      if (currentTabLeft < tabRow.scrollLeft) {
        tabRow.scrollLeft = currentTabLeft
        return
      }

      if (currentTabRight > tabRow.scrollLeft + tabRow.clientWidth) {
        tabRow.scrollLeft = currentTabRight - tabRow.clientWidth
      }
    }

    revealCurrentTab()

    if (typeof ResizeObserver === 'undefined') return

    const resizeObserver = new ResizeObserver(revealCurrentTab)
    resizeObserver.observe(tabRow)

    return () => resizeObserver.disconnect()
  }, [current])

  return (
    <nav aria-label="Settings" className="min-w-0 max-w-full overflow-hidden border-b border-border">
      {ownerSettingsNavGroups.map((group) => (
        <p key={group.id} className="sr-only">
          {group.label}
        </p>
      ))}
      <Tabs value={current} className="min-w-0 max-w-full gap-0 overflow-hidden">
        <TabsList
          ref={tabRowRef}
          data-scroll-restoration-id={`owner-settings-tabs-${current}`}
          variant="line"
          className="relative h-auto min-h-touch w-full min-w-0 max-w-full justify-start overflow-x-auto overflow-y-hidden rounded-none bg-transparent p-0"
        >
          {items.map((item) => (
            <TabsTrigger key={item.id} value={item.id} asChild className="min-h-touch flex-none px-related">
              <Link
                to={item.to}
                activeOptions={{ exact: true }}
                aria-current={current === item.id ? 'page' : undefined}
              >
                {item.label}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  )
}
