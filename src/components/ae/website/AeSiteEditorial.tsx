import type { ReactNode } from 'react'

import './AboutStoryComposition.css'

export type AeSiteEditorialProps = Readonly<{
  label: string
  title: string
  description: string
  children: ReactNode
}>

/** Arc split editorial rhythm for the published founder article. */
export function AeSiteEditorial({ label, title, description, children }: AeSiteEditorialProps) {
  return (
    <section
      className="arc-market arc-about-story arc-about-editorial"
      aria-labelledby="about-editorial"
    >
      <div className="arc-about-story-inner arc-about-editorial-inner">
        <div className="arc-about-editorial-heading">
          <h2 className="arc-about-editorial-title" id="about-editorial">
            {title}
          </h2>
          <p className="arc-about-story-label">{label}</p>
        </div>
        <div className="arc-about-editorial-content">
          <p className="arc-about-story-description">{description}</p>
          {children}
        </div>
      </div>
    </section>
  )
}
