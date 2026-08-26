import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type AeRecordHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

/**
 * Compact operator page bar: title, visible description, trailing actions.
 */
export function AeRecordHeader({
  title,
  description,
  actions,
  className,
}: AeRecordHeaderProps) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <div
      className={cn(
        'flex min-h-12 flex-wrap items-start justify-between gap-3 border-b border-border py-3',
        className,
      )}
      {...(description === undefined ? {} : { 'aria-describedby': descriptionId })}
    >
      <div className="grid min-w-0 gap-1">
        <h1 id={titleId} className="truncate text-base font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description === undefined ? null : (
          <p id={descriptionId} className="text-pretty text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
}
