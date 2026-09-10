import { type ReactNode } from 'react'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AeSiteFooter } from '@/components/ae/website/AeSiteFooter'

type AePublicPageHeader = {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
  meta?: ReactNode
}

type AePublicEditorialPageProps = {
  kind?: 'editorial'
  children: ReactNode
}

type AePublicRecordPageProps = AePublicPageHeader & {
  kind: 'tool' | 'document'
  children?: ReactNode
  /** Route-level empty/error: wrap the intro so screen readers get status/alert. */
  introRole?: 'status' | 'alert'
}

type AePublicWorkspacePageProps = AePublicPageHeader & {
  kind: 'workspace'
  children: ReactNode
}

/**
 * The public page seam. Routes render this inside `AeAppShell`.
 *
 * - `editorial`: home, doors, catalog, listings, auth, receipts — own their
 *   hero or record intro inside `children`.
 * - `tool` / `document`: legal, 404, operation detail — the shared
 *   `AePageHeader` so they cannot invent a third intro.
 */
export function AePublicPage(
  props: AePublicEditorialPageProps | AePublicRecordPageProps | AePublicWorkspacePageProps,
) {
  if (props.kind === 'workspace') {
    const { children, kind: _kind, ...header } = props
    return (
      <main
        id="main-content"
        data-shell-mode="workspace"
        tabIndex={-1}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <AePageHeader {...header} variant="workspace" />
        {children}
      </main>
    )
  }

  const composition = (() => {
    if (props.kind === 'tool' || props.kind === 'document') {
      const { children, kind: _kind, introRole, ...header } = props
      const intro = <AePageHeader {...header} />
      return (
        <>
          {introRole === undefined ? intro : <div role={introRole}>{intro}</div>}
          {children}
        </>
      )
    }
    return props.children
  })()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main id="main-content" data-shell-mode="page" tabIndex={-1} className="flex-1">
        {composition}
      </main>
      <AeSiteFooter />
    </div>
  )
}
