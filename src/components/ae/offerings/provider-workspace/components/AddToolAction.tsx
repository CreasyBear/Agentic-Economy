import { Link } from '@tanstack/react-router'

import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export function AddToolAction() {
  return (
    <Link to="/owner/operations/new" className={cn(buttonVariants(), 'min-h-touch')}>
      Add Tool
    </Link>
  )
}
