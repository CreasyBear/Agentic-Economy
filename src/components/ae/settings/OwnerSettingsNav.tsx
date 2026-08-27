'use client'

import { Link } from '@tanstack/react-router'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ownerSettingsNavGroups,
  ownerSettingsNavItems,
  type OwnerSettingsNavCurrent,
} from '@/lib/operator/settings-navigation'

export function OwnerSettingsNav({ current }: { current: OwnerSettingsNavCurrent }) {
  const items = ownerSettingsNavItems()

  return (
    <nav aria-label="Settings" className="border-b border-border">
      {ownerSettingsNavGroups.map((group) => (
        <p key={group.id} className="sr-only">
          {group.label}
        </p>
      ))}
      <Tabs value={current} className="gap-0">
        <TabsList
          variant="line"
          className="h-auto min-h-touch w-full justify-start rounded-none bg-transparent p-0"
        >
          {items.map((item) => (
            <TabsTrigger key={item.id} value={item.id} asChild className="min-h-touch flex-none px-related">
              <Link to={item.to} aria-current={current === item.id ? 'page' : undefined}>
                {item.label}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  )
}
