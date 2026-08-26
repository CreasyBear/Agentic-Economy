import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type AeRecordHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

/**
 * Compact operator page bar: title + trailing actions.
 * Description stays available to assistive tech without a marketing block.
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
        'flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-border py-3',
        className,
      )}
      {...(description === undefined ? {} : { 'aria-describedby': descriptionId })}
    >
      <div className="min-w-0">
        <h1 id={titleId} className="truncate text-base font-medium tracking-tight text-foreground">
          {title}
        </h1>
        {description === undefined ? null : (
          <p id={descriptionId} className="sr-only">
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
