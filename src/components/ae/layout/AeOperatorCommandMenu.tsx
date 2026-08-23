'use client'

import { AeRouteCommandMenu, type AeCommandDestination } from '@/components/ae/layout/AeRouteCommandMenu'
import {
  listOperatorCommandDestinations,
  type OperatorRole,
} from '@/lib/operator/navigation'

type AeOperatorCommandMenuProps = {
  operatorRole: OperatorRole
}

export function AeOperatorCommandMenu({ operatorRole }: AeOperatorCommandMenuProps) {
  const destinations = listOperatorCommandDestinations(operatorRole).flatMap((group) =>
    group.items.map((item): AeCommandDestination => {
      const hint = 'hint' in item && typeof item.hint === 'string' ? item.hint : undefined
      return {
        id: item.href,
        label: item.label,
        href: item.href,
        group: group.label,
        ...(hint === undefined ? {} : { hint }),
        icon: item.icon,
        keywords: [item.href, group.label, item.label],
      }
    }),
  )

  return <AeRouteCommandMenu label="Go to" destinations={destinations} triggerClassName="hidden md:inline-flex" />
}
