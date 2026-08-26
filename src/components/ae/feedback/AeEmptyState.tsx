import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function AeEmptyState({
  title,
  description,
  action,
  role,
}: {
  title: string
  description: string
  action?: ReactNode
  role?: 'status' | 'alert'
}) {
  return (
    <div
      {...(role === undefined ? {} : { role })}
      className={cn('grid min-h-64 place-content-center justify-items-center gap-4 py-12 text-center')}
    >
      <div className="grid max-w-md gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="text-pretty text-sm text-muted-foreground">{description}</p>
      </div>
      {action === undefined ? null : <div>{action}</div>}
    </div>
  )
}
