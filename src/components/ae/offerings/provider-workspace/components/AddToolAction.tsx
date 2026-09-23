import { Link } from '@tanstack/react-router'

import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export function AddToolAction({
  variant = 'default',
}: Readonly<{ variant?: 'default' | 'outline' }>) {
  return (
    <Link
      to="/owner/operations/new"
      className={cn(buttonVariants({ variant }), 'min-h-touch w-fit')}
    >
      Add Tool
    </Link>
  )
}
