import type { ReactNode } from 'react'

import { AeCornerMarks } from './AeSiteMarks'
import { AeSiteSection } from './AeSiteSection'
import { AeSiteBody, AeSiteHeading } from './AeSiteType'

type AeSiteCalloutProps = {
  heading: string
  headingId: string
  body: string
  actions?: ReactNode
  scheme?: 'muted' | 'canvas'
}

/** Heading + action row on a marked surface — Twenty EngagementBand without a stock photo. */
export function AeSiteCallout({
  heading,
  headingId,
  body,
  actions,
  scheme = 'muted',
}: AeSiteCalloutProps) {
  return (
    <AeSiteSection labelledBy={headingId} scheme={scheme}>
      <div className="relative bg-container p-page">
        <AeCornerMarks />
        <div className="grid gap-section md:grid-cols-[fit-content(60%)_minmax(0,1fr)] md:items-center">
          <div className="grid gap-2">
            <AeSiteHeading as="h2" size="sm" id={headingId}>
              {heading}
            </AeSiteHeading>
            <AeSiteBody muted size="sm">
              {body}
            </AeSiteBody>
          </div>
          {actions === undefined ? null : (
            <div className="flex flex-wrap gap-related md:justify-end">{actions}</div>
          )}
        </div>
      </div>
    </AeSiteSection>
  )
}
