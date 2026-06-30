import { useId, type ReactNode } from 'react'

type AePageHeaderDensity = 'public' | 'operator'

type AePageHeaderProps = {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
  density?: AePageHeaderDensity
}

const sectionClassByDensity: Record<AePageHeaderDensity, string> = {
  public: 'mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 md:px-6 md:py-16',
  operator: 'mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 md:px-6 md:py-8',
}

const titleClassByDensity: Record<AePageHeaderDensity, string> = {
  public:
    'text-balance font-heading text-4xl font-semibold leading-[1.05] tracking-normal text-foreground md:text-5xl',
  operator:
    'text-balance font-heading text-2xl font-semibold leading-tight tracking-normal text-foreground md:text-3xl',
}

const descriptionClassByDensity: Record<AePageHeaderDensity, string> = {
  public: 'max-w-3xl text-pretty text-base leading-7 text-muted-foreground',
  operator: 'max-w-3xl text-pretty text-sm leading-6 text-muted-foreground',
}

export function AePageHeader({ eyebrow, title, description, actions, density = 'public' }: AePageHeaderProps) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={sectionClassByDensity[density]}
    >
      <div className="flex max-w-4xl flex-col gap-4">
        {eyebrow ? <p className="text-sm font-medium leading-6 text-muted-foreground">{eyebrow}</p> : null}
        <h1 id={titleId} className={titleClassByDensity[density]}>
          {title}
        </h1>
        <p id={descriptionId} className={descriptionClassByDensity[density]}>{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </section>
  )
}
