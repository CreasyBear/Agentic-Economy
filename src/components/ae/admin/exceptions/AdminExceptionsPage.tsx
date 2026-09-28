import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AdminExceptionsPageSkeleton } from './AdminExceptionsPageSkeleton'
import { ExceptionEvidenceSheet } from './components/ExceptionEvidenceSheet'
import { ExceptionFeedTable } from './components/ExceptionFeedTable'
import { ExceptionFilterChips } from './components/ExceptionFilterChips'
import { PurchaseResolutionTable } from './components/PurchaseResolutionTable'
import {
  ADMIN_EXCEPTION_PARTITIONS,
  ADMIN_EXCEPTIONS_COPY,
  ADMIN_EXCEPTION_PARTITION_LABELS,
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

  const selectedPartition = exceptions.data.selectedPartition
  return page(
    <div className="grid gap-section">
      <AeSection
        title={ADMIN_EXCEPTIONS_COPY.filtersTitle}
        description={ADMIN_EXCEPTIONS_COPY.filtersDescription}
      >
        <ExceptionFilterChips
          selected={exceptions.data.selectedKind}
          overview={exceptions.data.overview}
          onSelect={exceptions.onSelectKind}
        />
        <div className="mt-3 flex flex-wrap gap-intra">
          {ADMIN_EXCEPTION_PARTITIONS[exceptions.data.selectedKind].map((partition) => (
            <Button key={partition} type="button" size="sm"
              variant={selectedPartition === partition ? 'default' : 'outline'}
              aria-pressed={selectedPartition === partition}
              onClick={() => exceptions.onSelectPartition(partition)}>
              {ADMIN_EXCEPTION_PARTITION_LABELS[partition]}
            </Button>
          ))}
        </div>
      </AeSection>
      {exceptions.data.selectedSourceUnavailable ? (
        <p role="status" className="text-sm text-warning">{ADMIN_EXCEPTIONS_COPY.exceptionsUnavailable}</p>
      ) : null}
      <ExceptionFeedTable
        rows={exceptions.data.rows}
        observed={exceptions.data.observed}
        complete={exceptions.data.complete}
        unavailable={exceptions.data.selectedSourceUnavailable}
        orderLabel={exceptions.data.selectedKind === 'uncertain_call'
          ? 'Reconciliation next-attempt order'
          : 'Updated-at index order'}
        paginationStatus={exceptions.data.paginationStatus}
        onLoadMore={exceptions.data.loadMore}
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
