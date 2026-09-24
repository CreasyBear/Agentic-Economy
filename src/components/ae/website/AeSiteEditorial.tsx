import type { ReactNode } from 'react'

import { AeSiteSection } from './AeSiteSection'
import { AeSiteEyebrow, AeSiteHeading } from './AeSiteType'

export type AeSiteEditorialProps = Readonly<{
  label: string
  title: string
  description: string
  children: ReactNode
}>

/** Port of aecon.ai's Tailark content-4 split editorial composition. */
export function AeSiteEditorial({ label, title, description, children }: AeSiteEditorialProps) {
  return (
    <AeSiteSection labelledBy="about-editorial" rhythm="section" enter>
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:gap-12">
          <div>
            <AeSiteEyebrow>{label}</AeSiteEyebrow>
            <AeSiteHeading as="h2" size="md" id="about-editorial" className="max-w-md">
              {title}
            </AeSiteHeading>
          </div>
          <div className="grid gap-4">
            <p className="text-balance text-lg text-muted-foreground">
              {description}
            </p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
    </AeSiteSection>
  )
}
