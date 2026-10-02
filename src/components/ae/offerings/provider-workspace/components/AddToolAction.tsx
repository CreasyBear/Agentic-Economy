import { Link } from '@tanstack/react-router'

import buttonStyles from '@/components/arc/button/button.module.css'

export function AddToolAction({
  variant = 'default',
}: Readonly<{ variant?: 'default' | 'outline' }>) {
  return (
    <Link
      to="/owner/operations/new"
      className={['arc-market', buttonStyles.button, variant === 'outline' ? buttonStyles.secondary : buttonStyles.primary, buttonStyles.md, 'w-fit'].join(' ')}
    >
      Add Tool
    </Link>
  )
}
