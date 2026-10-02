import type { ReactNode } from 'react'

import './AuthComposition.css'

type AeSiteAuthStageProps = {
  labelledBy?: string
  url: string
  children: ReactNode
}

/** Auth sits in site chrome, not Clerk's default floating card. */
export function AeSiteAuthStage({ labelledBy, url, children }: AeSiteAuthStageProps) {
  return (
    <section
      className="arc-market arc-auth-stage"
      {...(labelledBy === undefined ? {} : { 'aria-labelledby': labelledBy })}
    >
      <div className="arc-auth-stage-inner">
        {children}
        <code className="arc-auth-location">{url}</code>
      </div>
    </section>
  )
}
