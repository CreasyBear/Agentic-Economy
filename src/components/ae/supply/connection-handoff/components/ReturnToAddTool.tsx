import { Link } from '@tanstack/react-router'

import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

import type { ReturnToAddToolProps } from '../connection-handoff.contracts'

export function ReturnToAddTool({ returnSearch }: ReturnToAddToolProps) {
  return (
    <Link
      to="/owner/operations/new"
      search={returnSearch}
      className={cn(buttonVariants({ variant: 'secondary' }), 'mt-4 min-h-touch')}
    >
      Return to Add Tool
    </Link>
  )
}
