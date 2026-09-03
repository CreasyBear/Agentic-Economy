import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type AeRecordHeaderProps = {
  title: string
  description?: string
  icon?: ReactNode
  actions?: ReactNode
  className?: string
}

/**
 * Compact operator page bar: title, visible description, trailing actions.
 */
export function AeRecordHeader({
  title,
  description,
  icon,
  actions,
  className,
}: AeRecordHeaderProps) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <div
      className={cn(
        'flex min-h-touch flex-wrap items-start justify-between gap-related py-related',
        className,
      )}
      {...(description === undefined ? {} : { 'aria-describedby': descriptionId })}
    >
      <div className="flex min-w-0 items-start gap-related">
        {icon === undefined ? null : (
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground [&_svg]:size-4"
          >
            {icon}
          </span>
        )}
        <div className="grid min-w-0 gap-intra">
          <h1 id={titleId} className="truncate font-sans text-2xl font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          {description === undefined ? null : (
            <p id={descriptionId} className="max-w-[65ch] text-pretty text-sm leading-normal text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions === undefined ? null : (
        <div className="flex flex-wrap items-center gap-intra">{actions}</div>
      )}
    </div>
  )
}
