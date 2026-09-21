import type { ReactNode } from 'react'

export type AeSiteEditorialProps = Readonly<{
  label: string
  title: string
  description: string
  children: ReactNode
}>

/** Port of aecon.ai's Tailark content-4 split editorial composition. */
export function AeSiteEditorial({ label, title, description, children }: AeSiteEditorialProps) {
  return (
    <section className="py-16 md:py-20" aria-labelledby="about-editorial">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:gap-12">
          <div>
            <span className="mb-3 block text-eyebrow font-medium tracking-eyebrow text-muted-foreground uppercase">
              {label}
            </span>
            <h2 id="about-editorial" className="max-w-md text-balance text-3xl font-extralight tracking-[-0.035em] md:text-5xl">
              {title}
            </h2>
          </div>
          <div className="space-y-4">
            <p className="text-balance text-lg text-muted-foreground">
              {description}
            </p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
    </section>
  )
}
