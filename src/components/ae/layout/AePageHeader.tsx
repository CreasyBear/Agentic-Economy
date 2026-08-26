import { useId, type ReactNode } from 'react'

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
}

export function AePageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: AePageHeaderProps) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <section aria-labelledby={titleId} aria-describedby={descriptionId} className="ae-rail w-full py-section md:py-page">
      <div className="grid gap-5 border-b border-border pb-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="grid max-w-4xl gap-2">
          {eyebrow ? (
            <p className="block font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1 id={titleId} className="text-balance font-display text-3xl font-medium leading-[1.08] tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p id={descriptionId} className="block max-w-2xl text-pretty text-base text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          {meta === undefined ? null : (
            <p role="status" aria-live="polite" className="order-2 font-mono text-xs tabular-nums text-muted-foreground md:order-1">{meta}</p>
          )}
          {actions === undefined ? null : (
            <div className="order-1 flex flex-wrap items-center gap-2 md:order-2">{actions}</div>
          )}
        </div>
      </div>
    </section>
  )
}
