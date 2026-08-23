import { cva } from 'class-variance-authority'
import { useId, type ReactNode } from 'react'

type AePageHeaderDensity = 'public' | 'operator'

type AePageHeaderProps = {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
  density?: AePageHeaderDensity
}

const headerContainer = cva('mx-auto w-full max-w-6xl px-4', {
  variants: { density: { public: 'py-8 md:px-6 md:py-10', operator: 'py-5 md:px-6 md:py-6' } },
})
const headerLayout = cva('flex flex-col', {
  variants: { density: { public: 'gap-4', operator: 'gap-3' } },
})
const headerTitle = cva('font-semibold tracking-tight text-balance text-foreground', {
  variants: { density: { public: 'text-3xl leading-tight sm:text-4xl', operator: 'text-2xl' } },
})
const headerDescription = cva('block text-pretty text-muted-foreground', {
  variants: { density: { public: 'max-w-2xl text-base', operator: 'text-sm' } },
})

export function AePageHeader({ eyebrow, title, description, actions, density = 'public' }: AePageHeaderProps) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <section aria-labelledby={titleId} aria-describedby={descriptionId} className={headerContainer({ density })}>
      <div className={headerLayout({ density })}>
        <div className="grid max-w-4xl gap-2">
          {eyebrow ? (
            <p className="block text-sm font-medium text-muted-foreground">{eyebrow}</p>
          ) : null}
          <h1 id={titleId} className={headerTitle({ density })}>
            {title}
          </h1>
          <p id={descriptionId} className={headerDescription({ density })}>
            {description}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </section>
  )
}
