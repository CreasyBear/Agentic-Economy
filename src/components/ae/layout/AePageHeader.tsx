import { cva } from 'class-variance-authority'
import { useId, type ReactNode } from 'react'

type AePageHeaderDensity = 'public' | 'operator'

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
  density?: AePageHeaderDensity
}

const headerContainer = cva('w-full', {
  variants: {
    density: {
      public: 'ae-rail py-section md:py-page',
      operator: 'py-5 md:py-6',
    },
  },
})
const headerLayout = cva('grid', {
  variants: {
    density: {
      public: 'gap-5 border-b border-border pb-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end',
      operator: 'gap-3',
    },
  },
})
const headerTitle = cva('font-display font-medium tracking-tight text-balance text-foreground', {
  variants: { density: { public: 'text-3xl leading-[1.08] sm:text-4xl', operator: 'text-2xl' } },
})
const headerDescription = cva('block text-pretty text-muted-foreground', {
  variants: { density: { public: 'max-w-2xl text-base', operator: 'text-sm' } },
})

export function AePageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  density = 'public',
}: AePageHeaderProps) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <section aria-labelledby={titleId} aria-describedby={descriptionId} className={headerContainer({ density })}>
      <div className={headerLayout({ density })}>
        <div className="grid max-w-4xl gap-2">
          {eyebrow ? (
            <p className="block font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1 id={titleId} className={headerTitle({ density })}>
            {title}
          </h1>
          <p id={descriptionId} className={headerDescription({ density })}>
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
