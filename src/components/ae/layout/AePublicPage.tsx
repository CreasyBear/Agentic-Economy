import { type ReactNode } from 'react'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'

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

/**
 * The public page seam. Routes import this, not `AePublicShell`.
 *
 * - `editorial`: home, doors, catalog, listings, auth, receipts — own their
 *   hero or record intro inside `children`.
 * - `tool` / `document`: legal, 404, operation detail — the shared
 *   `AePageHeader` so they cannot invent a third intro.
 */
export function AePublicPage(props: AePublicEditorialPageProps | AePublicRecordPageProps) {
  if (props.kind === 'tool' || props.kind === 'document') {
    const { children, kind: _kind, introRole, ...header } = props
    const intro = <AePageHeader {...header} />
    return (
      <AePublicShell>
        {introRole === undefined ? intro : <div role={introRole}>{intro}</div>}
        {children}
      </AePublicShell>
    )
  }

  return <AePublicShell>{props.children}</AePublicShell>
}
