import type { ReactNode } from 'react'

export type AeSiteAboutHeroProps = Readonly<{
  label: string
  title: string
  description: string
  image: string
  children?: ReactNode
}>

/** Port of aecon.ai's Dusk hero-section-7 split editorial hero. */
export function AeSiteAboutHero({
  label,
  title,
  description,
  image,
  children,
}: AeSiteAboutHeroProps) {
  return (
    <section className="overflow-hidden py-16 md:py-24" aria-labelledby="about-hero">
      <div className="relative mx-auto grid max-w-7xl items-center gap-6 px-6 md:gap-12 lg:grid-cols-2">
        <div>
          <span className="mb-3 block text-eyebrow font-medium tracking-eyebrow text-muted-foreground uppercase">
            {label}
          </span>
          <div className="mt-3 flex max-w-xl flex-col gap-6 md:mt-6">
            <h1 id="about-hero" className="text-balance text-4xl font-extralight tracking-[-0.035em] md:text-5xl lg:text-6xl">
              {title}
            </h1>
            <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
              {description}
            </p>
            {children === undefined ? null : <div className="flex flex-wrap gap-3">{children}</div>}
          </div>
        </div>
        <div className="relative aspect-16/7 overflow-hidden rounded-3xl sm:aspect-5/3 lg:ml-auto lg:aspect-5/4 lg:w-full lg:max-w-xl">
          <img
            src={image}
            sizes="(max-width: 1023px) calc(100vw - 48px), (max-width: 1279px) calc(50vw - 48px), 576px"
            fetchPriority="high"
            alt=""
            width={1200}
            height={960}
            className="size-full object-cover"
          />
        </div>
      </div>
    </section>
  )
}
