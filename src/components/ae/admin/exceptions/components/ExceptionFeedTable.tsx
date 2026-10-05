import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { Button } from '@/components/ui/button'
import { ADMIN_EXCEPTIONS_COPY, type AdminExceptionRowModel, type ExceptionFeedTableProps } from '../exceptions.contracts'

export function ExceptionFeedTable({ rows, observed, complete, unavailable, orderLabel, paginationStatus, scanRequests, onLoadMore, onOpen }: ExceptionFeedTableProps) {
  const mixedKinds = rows.some(row => row.kind !== rows[0]?.kind)
  const columns: DataColumn<AdminExceptionRowModel>[] = [
    {
      key: 'businessSlug', label: 'Business / case', sortable: false, width: '44%',
      render: (_value, row) => (
        <div className="min-w-0">
          {row.businessHref === null || row.businessSlug === null
            ? <span>{row.kindLabel}</span>
            : <a className="block truncate font-medium underline-offset-4 hover:underline" title={row.businessSlug} href={row.businessHref}>{row.businessSlug}</a>}
          {mixedKinds && row.businessSlug !== null ? <span className="text-xs text-muted-foreground">{row.kindLabel}</span> : null}
        </div>
      ),
    },
    {
      key: 'ref', label: 'Reference', sortable: false, width: '32%',
      render: (_value, row) => <AeCopyReference compact label="case reference" value={row.ref} href={row.href} />,
    },
    {
      key: 'sinceIso', label: 'Since', sortable: false, width: '14%',
      render: (_value, row) => <time className="whitespace-nowrap text-xs text-muted-foreground" dateTime={row.sinceIso} title={row.sinceLabel}>{row.sinceRelativeLabel}</time>,
    },
    {
      key: 'id', label: 'Action', sortable: false, width: '10%',
      render: (_value, row) => (
        <Button type="button" variant="ghost" size="sm" className="h-8 min-h-8 px-2 [@media(pointer:coarse)]:min-h-11"
          aria-label={`${ADMIN_EXCEPTIONS_COPY.viewDetails}: ${row.ref}`} onClick={() => onOpen(row)}>
          Review
        </Button>
      ),
    },
  ]
  return (
    <AeSection title={ADMIN_EXCEPTIONS_COPY.exceptionsTitle}
      description={`${orderLabel}. ${observed} loaded${complete ? ' (exhausted)' : ' (partial)'}. ${ADMIN_EXCEPTIONS_COPY.exceptionsDescription}`}>
      <div className="ae-arc min-w-0">
        <SortableDataTable density="compact" columns={columns} rows={rows} rowKey="id" caption={ADMIN_EXCEPTIONS_COPY.exceptionsTitle}
          emptyMessage={unavailable && rows.length === 0
            ? ADMIN_EXCEPTIONS_COPY.exceptionsUnavailable
            : paginationStatus !== 'Exhausted'
              ? 'No cases in this loaded page. Load more to continue.'
              : ADMIN_EXCEPTIONS_COPY.nothingNeedsAttention} />
      </div>
      {rows.length === 0 && !complete && scanRequests > 0
        ? <p role="status" className="text-sm text-muted-foreground">{ADMIN_EXCEPTIONS_COPY.scanProgress(scanRequests)}</p> : null}
      {paginationStatus === 'Exhausted' ? null : (
        <Button type="button" variant="outline" className="justify-self-start" disabled={paginationStatus === 'LoadingMore'} onClick={onLoadMore}>
          {ADMIN_EXCEPTIONS_COPY.loadMore}
        </Button>
      )}
    </AeSection>
  )
}
