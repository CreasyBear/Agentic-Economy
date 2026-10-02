/* Arc page-header intro, title row, details, metadata and trailing actions.
 * Upstream TSX SHA-256 036f994db99aa96f42a5ab4aa02ab8f57e45d81cd9c01fad643847c3c13aa60a.
 * Existing AE title focus and factual slots remain authoritative; sample project,
 * badges, tabs and scroll-owner state are omitted. */
import { useEffect, useId, type ReactNode } from 'react'

import './PageHeaderComposition.css'

type AePageHeaderProps = {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
  /**
   * Live-data figure for the right edge of the header, e.g. the market's
   * "2,412 matching Operations" count. Rendered mono + tabular so the
   * number reads like a spec-sheet datum rather than prose.
   */
  meta?: ReactNode
  variant?: 'page' | 'market' | 'workspace'
  /** When true, the h1 is programmatically focusable and focused after paint. */
  focusTitle?: boolean
}

export function AePageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  variant = 'page',
  focusTitle = false,
}: AePageHeaderProps) {
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!focusTitle) return
    document.getElementById(titleId)?.focus()
  }, [focusTitle, titleId, title])

  const headerProfile = variant === 'workspace' ? 'workspace' : variant === 'market' ? 'market' : 'editorial'

  return (
    <section
      data-header-profile={headerProfile}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={`arc-market arc-page-header ae-${variant === 'workspace' ? 'nav' : 'rail'}`}
    >
      <div className="arc-page-header-bar">
        <div className="arc-page-header-intro">
          <div className="arc-page-header-title-row">
            <h1
              id={titleId}
              {...(focusTitle ? { tabIndex: -1 as const } : {})}
              className="arc-page-header-title"
            >
              {title}
            </h1>
            {eyebrow === undefined ? null : <span className="arc-page-header-context">{eyebrow}</span>}
          </div>
          <p id={descriptionId} className="arc-page-header-description">{description}</p>
        </div>
        {meta === undefined && actions === undefined ? null : (
          <div className="arc-page-header-trailing">
            {meta === undefined ? null : <p role="status" aria-live="polite" className="arc-page-header-meta">{meta}</p>}
            {actions === undefined ? null : <div className="arc-page-header-actions">{actions}</div>}
          </div>
        )}
      </div>
    </section>
  )
}
