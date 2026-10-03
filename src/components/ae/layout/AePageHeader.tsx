/* Semantic binding to the installed Arc PageHeader record region.
 * Its source provenance and bounded ports live with the Arc component.
 * Existing title focus, region IDs and factual slots remain authoritative. */
import { useEffect, useId, type ReactNode } from 'react'

import { PageHeader } from '@/components/arc/blocks/page-header/page-header'

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
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[]}
        titleId={titleId}
        descriptionId={descriptionId}
        {...(focusTitle ? { titleTabIndex: -1 as const } : {})}
        {...(eyebrow === undefined ? {} : { context: eyebrow })}
        {...(meta === undefined ? {} : { metadata: <p role="status" aria-live="polite">{meta}</p> })}
        {...(actions === undefined ? {} : { actions })}
      />
    </section>
  )
}
