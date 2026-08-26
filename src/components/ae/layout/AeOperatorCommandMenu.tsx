'use client'

import { AeRouteCommandMenu, type AeCommandDestination } from '@/components/ae/layout/AeRouteCommandMenu'
import {
  listOperatorCommandDestinations,
  type OperatorRole,
} from '@/lib/operator/navigation'
import { PlusIcon, Wallet } from 'lucide-react'

type AeOperatorCommandMenuProps = {
  operatorRole: OperatorRole
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AeOperatorCommandMenu({ operatorRole, open, onOpenChange }: AeOperatorCommandMenuProps) {
  const destinations = [
    ...createDestinations(operatorRole),
    ...listOperatorCommandDestinations(operatorRole).flatMap((group) =>
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
    ),
  ]

  return (
    <AeRouteCommandMenu
      label="Search"
      destinations={destinations}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}

function createDestinations(role: OperatorRole): AeCommandDestination[] {
  switch (role) {
    case 'owner':
      return [
        {
          id: 'create-operation',
          label: 'Add Operation',
          href: '/owner/offerings/new',
          group: 'Create',
          icon: PlusIcon,
          keywords: ['create', 'new', 'operation', 'publish'],
        },
        {
          id: 'create-credit',
          label: 'Top up credit',
          href: '/owner/credit',
          group: 'Create',
          icon: Wallet,
          keywords: ['create', 'credit', 'fund', 'balance', 'top up'],
        },
      ]
    case 'admin':
      return []
    case 'developer':
      return []
    default: {
      const exhaustive: never = role
      return exhaustive
    }
  }
}
