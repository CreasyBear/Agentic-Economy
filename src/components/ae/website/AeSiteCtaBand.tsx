import type { ReactNode } from 'react'

import { Link } from '@tanstack/react-router'

import { buttonVariants } from '@/components/ui/button-variants'

import { AeSiteSection } from './AeSiteSection'
import { AeSiteHeading } from './AeSiteType'

export type AeSiteCtaBandProps = Readonly<{
  title: string
  description: ReactNode
  primary: Readonly<{ label: string; to: '/market' | '/for-agents' }>
  secondary: Readonly<{ label: string; to: '/for-providers' }>
}>

/** Port of aecon.ai's Dusk call-to-action-2 heading and action row. */
export function AeSiteCtaBand({ title, description, primary, secondary }: AeSiteCtaBandProps) {
  return (
    <AeSiteSection labelledBy="about-cta" rhythm="section">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-center justify-center gap-6 max-lg:flex-col max-lg:text-center lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <AeSiteHeading as="h2" size="md" id="about-cta">
              {title}
            </AeSiteHeading>
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
    </AeSiteSection>
  )
}
