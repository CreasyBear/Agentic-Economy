import type { ReactNode } from 'react'

import { Link } from '@tanstack/react-router'

import { buttonVariants } from '@/components/ui/button-variants'

export type AeSiteCtaBandProps = Readonly<{
  title: string
  description: ReactNode
  primary: Readonly<{ label: string; to: '/market' | '/for-agents' }>
  secondary: Readonly<{ label: string; to: '/for-providers' }>
}>

/** Port of aecon.ai's Dusk call-to-action-2 heading and action row. */
export function AeSiteCtaBand({ title, description, primary, secondary }: AeSiteCtaBandProps) {
  return (
    <section className="py-12 md:py-20" aria-labelledby="about-cta">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-center justify-center gap-6 max-lg:flex-col max-lg:text-center lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h2 id="about-cta" className="text-balance text-4xl font-extralight tracking-[-0.035em] md:text-5xl xl:text-6xl">
              {title}
            </h2>
            <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">{description}</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-center gap-3">
            <Link to={primary.to} className={buttonVariants({ size: 'lg' })}>
              {primary.label}
            </Link>
            <Link to={secondary.to} className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              {secondary.label}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
