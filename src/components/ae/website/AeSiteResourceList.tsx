import { cn } from '@/lib/utils'

export type AeSiteResourceItem = {
  name: string
  description: string
  href: string
  letter: string
}

type AeSiteResourceListProps = {
  title?: string
  labelledBy?: string
  items: readonly AeSiteResourceItem[]
  className?: string
}

/** Name / description / path rows — Opensource UI ResourceLinksPanel, no brand logos. */
export function AeSiteResourceList({
  title,
  labelledBy,
  items,
  className,
}: AeSiteResourceListProps) {
  return (
    <div className={cn('min-w-0', className)}>
      {title === undefined ? null : (
        <h3 className="font-sans text-sm font-medium">{title}</h3>
      )}
      <ul
        className={title === undefined ? 'grid gap-2' : 'mt-4 grid gap-2'}
        {...(labelledBy === undefined ? {} : { 'aria-labelledby': labelledBy })}
      >
        {items.map((item) => (
          <li key={item.href} className="min-w-0">
            <a
              href={item.href}
              className="group flex min-h-touch min-w-0 items-center gap-2.5 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center border border-border bg-muted font-mono text-xs font-medium"
              >
                {item.letter}
              </span>
              <span className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
                <span className="shrink-0 font-sans text-sm font-medium">{item.name}</span>
                <span className="hidden min-w-0 truncate text-sm text-muted-foreground sm:inline">
                  {item.description}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground group-hover:text-foreground">
                {item.href}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
