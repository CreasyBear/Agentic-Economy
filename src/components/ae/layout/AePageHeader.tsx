import { useEffect, useId, type ReactNode } from 'react'

import { AeSiteEyebrow } from '@/components/ae/website/AeSiteType'

type AePageHeaderProps = {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
  /**
   * Live-data figure for the right edge of the header, e.g. the market's
   * "2,412 matching Operations" count. Rendered mono + tabular so the
   * number reads like a spec-sheet datum rather than prose.
   */
  meta?: ReactNode
  variant?: 'page' | 'market' | 'workspace'
  /** When true, the h1 is programmatically focusable and focused after paint. */
  focusTitle?: boolean
}

export function AePageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  variant = 'page',
  focusTitle = false,
}: AePageHeaderProps) {
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!focusTitle) return
    document.getElementById(titleId)?.focus()
  }, [focusTitle, titleId, title])

  if (variant === 'workspace') {
    return (
      <section
        data-header-profile="workspace"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="ae-nav w-full shrink-0 px-gutter py-3"
      >
        <div className="grid min-w-0 gap-2 border-b border-border pb-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 items-center gap-related">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-intra">
                <h1
                  id={titleId}
                  {...(focusTitle ? { tabIndex: -1 as const } : {})}
                  className="truncate font-sans text-xl font-medium leading-tight tracking-tight text-foreground sm:text-2xl"
                >
                  {title}
                </h1>
                {eyebrow === undefined ? null : (
                  <span className="shrink-0 font-sans text-xs font-medium text-muted-foreground">
                    {eyebrow}
                  </span>
                )}
              </div>
              <p id={descriptionId} className="truncate text-xs text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-related sm:justify-end">
            {meta === undefined ? null : (
              <p role="status" aria-live="polite" className="font-mono text-xs tabular-nums text-muted-foreground">{meta}</p>
            )}
            {actions === undefined ? null : (
              <div className="flex items-center gap-intra">{actions}</div>
            )}
          </div>
        </div>
      </section>
    )
  }

  const headerProfile = variant === 'market' ? 'market' : 'editorial'

  return (
    <section
      data-header-profile={headerProfile}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="ae-rail w-full py-16 md:py-24"
    >
      <div className="grid gap-related border-b border-border pb-section md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="grid max-w-4xl gap-related">
          <div>
            {eyebrow === undefined ? null : <AeSiteEyebrow>{eyebrow}</AeSiteEyebrow>}
            <h1
              id={titleId}
              {...(focusTitle ? { tabIndex: -1 as const } : {})}
              className="text-balance text-4xl font-extralight tracking-[-0.035em] text-foreground md:text-5xl lg:text-6xl"
            >
              {title}
            </h1>
          </div>
          <p id={descriptionId} className="max-w-prose text-pretty text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="flex flex-col items-start gap-related md:items-end">
          {meta === undefined ? null : (
            <p role="status" aria-live="polite" className="order-2 font-mono text-xs tabular-nums text-muted-foreground md:order-1">{meta}</p>
          )}
          {actions === undefined ? null : (
            <div className="order-1 flex flex-wrap items-center gap-intra md:order-2">{actions}</div>
          )}
        </div>
      </div>
    </section>
  )
}
