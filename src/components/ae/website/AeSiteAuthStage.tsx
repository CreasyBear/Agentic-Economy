import type { ReactNode } from 'react'

import { AeSiteBrowser } from './AeSiteBrowser'
import { AeSiteSection } from './AeSiteSection'

type AeSiteAuthStageProps = {
  labelledBy?: string
  url: string
  children: ReactNode
}

/** Auth sits in site chrome, not Clerk's default floating card. */
export function AeSiteAuthStage({ labelledBy, url, children }: AeSiteAuthStageProps) {
  return (
    <AeSiteSection
      rhythm="hero"
      scheme="muted"
      clip={false}
      {...(labelledBy === undefined ? {} : { labelledBy })}
    >
      <div className="mx-auto w-full max-w-md">
        <AeSiteBrowser url={url}>{children}</AeSiteBrowser>
      </div>
    </AeSiteSection>
  )
}
