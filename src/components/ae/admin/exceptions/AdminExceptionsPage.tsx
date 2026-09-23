import type { ReactNode } from 'react'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AdminExceptionsPageSkeleton } from './AdminExceptionsPageSkeleton'
import { ExceptionEvidenceSheet } from './components/ExceptionEvidenceSheet'
import { ExceptionFeedTable } from './components/ExceptionFeedTable'
import { ExceptionFilterChips } from './components/ExceptionFilterChips'
import { PurchaseResolutionTable } from './components/PurchaseResolutionTable'
import {
  ADMIN_EXCEPTIONS_COPY,
  type AdminExceptionsPageProps,
} from './exceptions.contracts'
import { useAdminExceptions } from './useAdminExceptions'

export function AdminExceptionsPage(props: AdminExceptionsPageProps) {
  const exceptions = useAdminExceptions(props)
  if (exceptions.data.kind === 'loading') return <AdminExceptionsPageSkeleton />

  const page = (children: ReactNode) => (
    <AeOperatorPage
      operatorRole="admin"
      title={ADMIN_EXCEPTIONS_COPY.title}
      description={ADMIN_EXCEPTIONS_COPY.description}
      currentPath="/admin/exceptions"
      breadcrumbs={[
        { label: ADMIN_EXCEPTIONS_COPY.breadcrumbs.admin, href: '/admin' },
        { label: ADMIN_EXCEPTIONS_COPY.breadcrumbs.exceptions },
      ]}
      stickyHeader
    >
      {children}
    </AeOperatorPage>
  )

  if (exceptions.data.kind === 'refused') {
    return page(
      <AePageState
        title={ADMIN_EXCEPTIONS_COPY.accessDeniedTitle}
        description={ADMIN_EXCEPTIONS_COPY.accessDeniedDescription}
        tone="danger"
      />,
    )
  }

  return page(
    <div className="grid gap-section">
      <AeSection
        title={ADMIN_EXCEPTIONS_COPY.filtersTitle}
        description={ADMIN_EXCEPTIONS_COPY.filtersDescription}
      >
        <ExceptionFilterChips
          selected={props.search.kind ?? null}
          counts={exceptions.data.counts}
          onSelect={exceptions.onSelectKind}
          onClear={exceptions.onClear}
        />
      </AeSection>
      {exceptions.data.unavailableLabels.length === 0 ? null : (
        <p role="status" className="text-sm text-warning">
          {ADMIN_EXCEPTIONS_COPY.someUnavailable}{' '}
          {exceptions.data.unavailableLabels.join(', ')}.
        </p>
      )}
      <ExceptionFeedTable
        rows={exceptions.data.rows}
        total={exceptions.data.total}
        truncated={exceptions.data.truncated}
        unavailable={exceptions.data.selectedSourceUnavailable}
        filtered={exceptions.filtered}
        onOpen={exceptions.onOpen}
      />
      <PurchaseResolutionTable rows={exceptions.data.resolutions} />
      <ExceptionEvidenceSheet
        row={exceptions.selectedRow}
        onOpenChange={exceptions.onOpenChange}
      />
    </div>,
  )
}
