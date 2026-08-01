import { useId, type ReactNode } from 'react'

type AePageHeaderDensity = 'public' | 'operator'

type AePageHeaderProps = {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
  density?: AePageHeaderDensity
}

const containerClassByDensity: Record<AePageHeaderDensity, string> = {
  public: 'mx-auto w-full max-w-6xl px-4 py-12 md:px-6 md:py-16',
  operator: 'mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8',
}

export function AePageHeader({ eyebrow, title, description, actions, density = 'public' }: AePageHeaderProps) {
  const titleId = useId()
  const descriptionId = useId()
  const isPublic = density === 'public'

  return (
    <section aria-labelledby={titleId} aria-describedby={descriptionId} className={containerClassByDensity[density]}>
      <div className={`flex flex-col ${isPublic ? 'gap-6' : 'gap-3'}`}>
        <div className="grid max-w-4xl gap-2">
          {eyebrow ? (
            <p className="block text-sm font-medium text-muted-foreground">{eyebrow}</p>
          ) : null}
          <h1 id={titleId} className={`font-semibold tracking-tight text-balance text-foreground${isPublic ? ' text-5xl md:text-7xl' : ' text-3xl'}`}>
            {title}
          </h1>
          <p id={descriptionId} className={`block text-pretty text-muted-foreground${isPublic ? ' text-lg' : ''}`}>
            {description}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </section>
  )
}
