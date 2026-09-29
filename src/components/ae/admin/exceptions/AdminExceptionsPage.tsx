import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AdminExceptionsPageSkeleton } from './AdminExceptionsPageSkeleton'
import { ExceptionEvidenceSheet } from './components/ExceptionEvidenceSheet'
import { ExceptionFeedTable } from './components/ExceptionFeedTable'
import { AdminSearchNotice } from '../AdminSearchNotice'
import { ExceptionFilterChips, exceptionQueueCount } from './components/ExceptionFilterChips'
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

  const ready = exceptions.data
  const selectedPartition = ready.selectedPartition
  return page(
    <div className="grid gap-section">
      <AeSection
        title={ADMIN_EXCEPTIONS_COPY.filtersTitle}
        description={ADMIN_EXCEPTIONS_COPY.filtersDescription}
      >
        <AdminSearchNotice rejected={props.search.rejected} />
        <ExceptionFilterChips
          selected={ready.selectedKind}
          selectedPartition={selectedPartition}
          overview={ready.overview}
          onSelect={exceptions.onSelectKind}
        />
        <div className="mt-3 flex flex-wrap gap-intra">
          {ADMIN_EXCEPTION_PARTITIONS[ready.selectedKind].map((partition) => {
            const count = exceptionQueueCount(
              ready.overview.filter((entry) => entry.kind === ready.selectedKind && entry.partition === partition),
              1,
            )
            return (
              <Button key={partition} type="button" size="sm"
                variant={selectedPartition === partition ? 'default' : 'outline'}
                aria-pressed={selectedPartition === partition}
                onClick={() => exceptions.onSelectPartition(partition)}>
                {ADMIN_EXCEPTION_PARTITION_LABELS[partition]} ({count})
              </Button>
            )
          })}
        </div>
      </AeSection>
      {ready.selectedSourceUnavailable ? (
        <p role="status" className="text-sm text-warning">{ADMIN_EXCEPTIONS_COPY.exceptionsUnavailable}</p>
      ) : null}
      <ExceptionFeedTable
        rows={ready.rows}
        observed={ready.observed}
        scanRequests={ready.scanRequests}
        complete={ready.complete}
        unavailable={ready.selectedSourceUnavailable}
        orderLabel={ready.selectedKind === 'uncertain_call'
          ? 'Reconciliation next-attempt order'
          : 'Updated-at index order'}
        paginationStatus={ready.paginationStatus}
        onLoadMore={ready.loadMore}
        onOpen={exceptions.onOpen}
      />
      <PurchaseResolutionTable rows={ready.resolutions} />
      <ExceptionEvidenceSheet
        row={exceptions.selectedRow}
        onOpenChange={exceptions.onOpenChange}
      />
    </div>,
  )
}
