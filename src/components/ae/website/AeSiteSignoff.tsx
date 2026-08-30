import type { ReactNode } from 'react'

import { AeGuideCrosshair } from './AeSiteMarks'
import { AeSiteSection } from './AeSiteSection'
import { AeSiteBody, AeSiteHeading } from './AeSiteType'

type AeSiteSignoffProps = {
  heading: string
  headingId: string
  body: string
  children: ReactNode
  crosshairSide?: 'left' | 'right'
}

const SIGNOFF_CROSSHAIR_Y = '198px'
const SIGNOFF_CROSSHAIR_X = {
  left: 'calc(50% - 334px)',
  right: 'calc(50% + 334px)',
} as const

export function AeSiteSignoff({
  heading,
  headingId,
  body,
  children,
  crosshairSide = 'right',
}: AeSiteSignoffProps) {
  return (
    <AeSiteSection
      labelledBy={headingId}
      rhythm="flush"
      scheme="canvas"
      background={<AeGuideCrosshair crossX={SIGNOFF_CROSSHAIR_X[crosshairSide]} crossY={SIGNOFF_CROSSHAIR_Y} />}
    >
      <div className="flex flex-col items-center py-hero text-center md:min-h-[36rem] md:justify-center md:py-0">
        <div className="w-full max-w-xl">
          <AeSiteHeading as="h2" size="lg" id={headingId}>
            {heading}
          </AeSiteHeading>
        </div>
        <div className="mt-2 w-full max-w-md">
          <AeSiteBody muted size="sm" className="mx-auto">
            {body}
          </AeSiteBody>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-related">
          {children}
        </div>
      </div>
    </AeSiteSection>
  )
}
