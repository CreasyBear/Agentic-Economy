import type { ColumnDef } from '@tanstack/react-table'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AUDIT_COPY,
  type AdminAuditRowModel,
  type AuditEventsTableProps,
} from '../audit.contracts'

const columns: ColumnDef<AdminAuditRowModel, unknown>[] = [
  {
    accessorKey: 'createdAtLabel',
    header: AUDIT_COPY.columnLabels.time,
    cell: ({ row }) => (
      <time dateTime={row.original.createdAtIso}>{row.original.createdAtLabel}</time>
    ),
  },
  {
    accessorKey: 'eventType',
    header: AUDIT_COPY.columnLabels.event,
    cell: ({ row }) => {
      const admin = row.original.admin
      return (
        <div className="grid min-w-64 gap-intra">
          <span className="font-medium text-foreground">{row.original.eventType}</span>
          {admin === null ? null : (
            <dl className="grid gap-1 border-l border-border pl-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap gap-1">
                <dt className="font-medium text-foreground">{AUDIT_COPY.columnLabels.permission}:</dt>
                <dd>{admin.permission}</dd>
              </div>
              <div className="flex flex-wrap gap-1">
                <dt className="font-medium text-foreground">{AUDIT_COPY.columnLabels.reason}:</dt>
                <dd>{admin.reasonCode}</dd>
              </div>
              {admin.evidenceRefs.map((evidenceRef) => (
                <div key={evidenceRef} className="grid gap-1">
                  <dt className="font-medium text-foreground">{AUDIT_COPY.columnLabels.evidence}</dt>
                  <dd><AeCopyReference label={AUDIT_COPY.columnLabels.evidence} value={evidenceRef} /></dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'actorRef',
    header: AUDIT_COPY.columnLabels.actor,
    cell: ({ row }) => (
      <AeCopyReference label={AUDIT_COPY.columnLabels.actor} value={row.original.actorRef} />
    ),
  },
  {
    accessorKey: 'targetLabel',
    header: AUDIT_COPY.columnLabels.target,
    cell: ({ row }) => row.original.targetHref === null
      ? row.original.targetLabel
      : <a className="font-medium text-foreground underline-offset-4 hover:underline" href={row.original.targetHref}>{row.original.targetLabel}</a>,
  },
  {
    accessorKey: 'outcomeLabel',
    header: AUDIT_COPY.columnLabels.outcome,
    cell: ({ row }) => <Badge variant="outline">{row.original.outcomeLabel}</Badge>,
  },
  {
    accessorKey: 'correlationId',
    header: AUDIT_COPY.columnLabels.correlation,
    cell: ({ row }) => (
      <AeCopyReference label={AUDIT_COPY.columnLabels.correlation} value={row.original.correlationId} />
    ),
  },
]

export function AuditEventsTable({ rows, filtered, paginationStatus, onLoadMore }: AuditEventsTableProps) {
  const emptyMessage = filtered ? AUDIT_COPY.noFilterMatches : AUDIT_COPY.nothingNeedsAttention
  return (
    <AeSection title={AUDIT_COPY.eventsTitle} description={AUDIT_COPY.eventsDescription}>
      <AeRecordTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        hideFilter
        caption={AUDIT_COPY.eventsTitle}
        emptyMessage={emptyMessage}
      />
      {paginationStatus === 'CanLoadMore' ? (
        <Button type="button" variant="outline" className="justify-self-start" onClick={onLoadMore}>
          {AUDIT_COPY.loadMore}
        </Button>
      ) : null}
    </AeSection>
  )
}
