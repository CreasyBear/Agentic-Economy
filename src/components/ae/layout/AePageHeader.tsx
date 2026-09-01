import { useId, type ReactNode } from 'react'

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
}

/** Public editorial statement: display face, wide page-level scale. */
const PAGE_TITLE_CLASS =
  'text-balance font-display text-3xl font-normal leading-[1.06] tracking-[-0.03em] text-foreground sm:text-4xl'

/** Market terminal statement: sans, one shelf above the catalog section headings. */
const MARKET_TITLE_CLASS =
  'text-balance font-sans text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl'

export function AePageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  variant = 'page',
}: AePageHeaderProps) {
  const titleId = useId()
  const descriptionId = useId()

  if (variant === 'workspace') {
    return (
      <section
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="ae-nav w-full shrink-0 px-gutter py-3"
      >
        <div className="grid min-w-0 gap-2 border-b border-border pb-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 items-center gap-related">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-intra">
                <h1 id={titleId} className="truncate font-sans text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
                  {title}
                </h1>
                {eyebrow === undefined ? null : (
                  <span className="shrink-0 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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

  return (
    <section aria-labelledby={titleId} aria-describedby={descriptionId} className="ae-rail w-full py-section md:py-page">
      <div className="grid gap-related border-b border-border pb-section md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="grid max-w-4xl gap-related">
          {eyebrow === undefined ? (
            <h1 id={titleId} className={variant === 'market' ? MARKET_TITLE_CLASS : PAGE_TITLE_CLASS}>
              {title}
            </h1>
          ) : (
            <div className="grid gap-intra">
              <AeSiteEyebrow>{eyebrow}</AeSiteEyebrow>
              <h1 id={titleId} className={variant === 'market' ? MARKET_TITLE_CLASS : PAGE_TITLE_CLASS}>
                {title}
              </h1>
            </div>
          )}
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
