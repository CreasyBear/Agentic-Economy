import { ownerInventoryReturnSearch } from '@/lib/operator/owner-inventory-return'
import type { OwnerInventoryQuery } from '@/lib/operator/owner-inventory-search'
import { Link } from '@tanstack/react-router'

import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

export function AddToolAction({
  variant = 'default',
  inventoryQuery,
}: Readonly<{ variant?: 'default' | 'outline'; inventoryQuery?: OwnerInventoryQuery }>) {
  return (
    <Link
      to="/owner/operations/new"
      search={ownerInventoryReturnSearch(inventoryQuery)}
      className={['arc-market', actionLinkClassName(variant === 'outline' ? 'secondary' : 'primary', 'md'), 'w-fit'].join(' ')}
    >
      Add Tool
    </Link>
  )
}
