import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function AeEmptyState({
  title,
  description,
  action,
  role,
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
  role?: 'status' | 'alert'
}) {
  return (
    <div {...(role === undefined ? {} : { role })} className={cn('grid max-w-xl gap-3 py-8')}>
      <div className="grid gap-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-pretty text-sm text-muted-foreground">{description}</p>
      </div>
      {action === undefined ? null : <div>{action}</div>}
    </div>
  )
}
