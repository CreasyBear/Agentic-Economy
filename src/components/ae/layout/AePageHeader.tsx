import type { ReactNode } from 'react'

type AePageHeaderProps = {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
}

export function AePageHeader({ eyebrow, title, description, actions }: AePageHeaderProps) {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 md:px-6 md:py-16">
      <div className="flex max-w-4xl flex-col gap-4">
        {eyebrow ? <p className="text-sm font-medium leading-6 text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="text-balance font-heading text-4xl font-semibold leading-[1.05] tracking-normal text-foreground md:text-5xl">
          {title}
        </h1>
        <p className="max-w-3xl text-pretty text-base leading-7 text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </section>
  )
}
