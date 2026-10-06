import { Link } from '@tanstack/react-router'

import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

export function AddToolAction({
  variant = 'default',
}: Readonly<{ variant?: 'default' | 'outline' }>) {
  return (
    <Link
      to="/owner/operations/new"
      className={['arc-market', actionLinkClassName(variant === 'outline' ? 'secondary' : 'primary', 'md'), 'w-fit'].join(' ')}
    >
      Add Tool
    </Link>
  )
}
