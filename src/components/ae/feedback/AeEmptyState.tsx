import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function AeEmptyState({
  title,
  description,
  action,
  role,
  icon,
}: {
  title: string
  description: string
  action?: ReactNode
  role?: 'status' | 'alert'
  icon?: ReactNode
}) {
  return (
    <div
      {...(role === undefined ? {} : { role })}
      className={cn('grid min-h-64 place-content-center justify-items-center gap-related py-page text-center')}
    >
      {icon === undefined ? null : (
        <span
          aria-hidden="true"
          className="inline-flex size-touch items-center justify-center rounded-md border border-border text-muted-foreground [&_svg]:size-5"
        >
          {icon}
        </span>
      )}
      <div className="grid max-w-md gap-intra">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="text-pretty text-sm text-muted-foreground">{description}</p>
      </div>
      {action === undefined ? null : <div>{action}</div>}
    </div>
  )
}
